import { browser } from '$app/env';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import {
	addDoc,
	arrayUnion,
	collection,
	doc,
	documentId,
	onSnapshot,
	orderBy,
	query,
	serverTimestamp,
	setDoc,
	updateDoc,
	where,
	writeBatch,
	type WriteBatch
} from 'firebase/firestore';
import { MediaQuery } from 'svelte/reactivity';
import { auth, db } from '#lib/firebase.js';
import { endOfDay, startOfDay } from '#lib/format.js';
import { DEFAULT_CITY, citySlug } from '#lib/prayer.js';
import {
	decodeMonths,
	encodeMonths,
	timetableId,
	type ParsedTimetable,
	type Timetable
} from '#lib/timetable.js';

export const PALETTE = [
	'#4f7fd9',
	'#3fa66f',
	'#e0784a',
	'#c45fb0',
	'#3aa6a6',
	'#d9a93a',
	'#8a6ad6',
	'#7a8a99'
];

export interface Project {
	id: string;
	name: string;
	color: string;
}

export interface Note {
	at: number;
	text: string;
}

export interface Session {
	id: string;
	start: number;
	end: number;
	totalMs: number;
	projectId: string;
	notes: Note[];
	live?: boolean;
}

/** The session currently being timed. */
interface Timer {
	projectId: string;
	startedAt: number;
	/** When the timer last started counting, after a pick or a resume. */
	resumedAt: number;
	/** Time counted before `resumedAt`. */
	acc: number;
	paused: boolean;
	notes: Note[];
}

type Theme = 'system' | 'light' | 'dark';

/**
 * Firestore layout, all owned by one user:
 * - `users/{uid}`: `UserDoc`, settings and the running timer, so every device sees it
 * - `users/{uid}/projects/{id}`: `Project` fields plus `createdAt`
 * - `users/{uid}/sessions/{id}`: finished `Session` fields
 *
 * Shared by every signed-in user, keyed by `citySlug`:
 * - `prayerTimetables/{slug}_{year}`: a `Timetable`, with its months encoded by `encodeMonths`
 * - `prayerCities/{slug}`: `{ name }` of each city with an upload, to list them without
 *   downloading every timetable
 */
interface UserDoc {
	city?: string | null;
	timer?: Timer | null;
}

/** The theme is a per-device preference, kept out of Firestore so it applies before sign-in. */
const THEME_KEY = 'humifocus:theme';

const DELETED: Project = { id: '', name: 'Deleted project', color: '#999' };

/** Sum of logged time per project id. */
export function totalsByProject(sessions: Session[]) {
	const totals: Record<string, number> = {};
	for (const s of sessions) totals[s.projectId] = (totals[s.projectId] ?? 0) + s.totalMs;
	return totals;
}

function loadTheme(): Theme {
	const saved = browser ? localStorage.getItem(THEME_KEY) : null;
	return saved === 'light' || saved === 'dark' ? saved : 'system';
}

// Writes apply to the local cache at once and reach the server when online, so a rejection
// means the server refused the write, such as when it breaks the security rules.
const fail = (err: unknown) => console.error('HumiFocus sync failed:', err);

class App {
	/** The signed-in Firebase user, or `null` when signed out. */
	user = $state.raw<User | null>(null);
	/** False until the session is restored and, when signed in, the user's data has loaded. */
	ready = $state(false);
	theme = $state<Theme>(loadTheme());
	// The lists and timer mirror Firestore snapshots: they are replaced, never mutated in place.
	projects = $state.raw<Project[]>([]);
	sessions = $state.raw<Session[]>([]);
	timer = $state.raw<Timer | null>(null);
	/** Project chosen while no timer runs, kept on this device until `start`. */
	selected = $state<string | null>(null);
	/** Prayer timetable city; `null` uses the default. */
	city = $state<string | null>(null);
	/** Uploaded prayer timetables of the prayer timetable city, for every year. */
	timetables = $state.raw<Timetable[]>([]);
	/** Names of the cities with uploaded prayer timetables. */
	timetableCities = $state.raw<string[]>([]);
	/** Ticks every 250ms while the timer runs, and every 15s otherwise. */
	now = $state(Date.now());

	#unlisten: (() => void) | null = null;

	#systemDark = new MediaQuery('(prefers-color-scheme: dark)');
	dark = $derived(this.theme === 'system' ? this.#systemDark.current : this.theme === 'dark');

	/** The timed project, or else the one chosen to start. */
	current = $derived.by(() => {
		const id = this.timer?.projectId ?? this.selected;
		return id ? this.projectOf(id) : null;
	});

	elapsed = $derived(
		this.timer
			? this.timer.acc + (this.timer.paused ? 0 : Math.max(0, this.now - this.timer.resumedAt))
			: 0
	);

	/** Finished sessions plus the running one, if any. */
	allSessions: Session[] = $derived(
		this.timer
			? [
					...this.sessions,
					{
						id: 'live',
						start: this.timer.startedAt,
						end: this.now,
						totalMs: this.elapsed,
						projectId: this.timer.projectId,
						notes: this.timer.notes,
						live: true
					}
				]
			: this.sessions
	);

	/** Follow Firebase Auth, loading each signed-in user's data in turn. */
	connect() {
		return onAuthStateChanged(auth, (user) => {
			this.#unlisten?.();
			this.#unlisten = null;
			this.user = user;
			this.projects = [];
			this.sessions = [];
			this.timer = null;
			this.selected = null;
			this.city = null;
			this.timetables = [];
			this.timetableCities = [];
			this.ready = !user;
			if (user) this.#unlisten = this.#listen(user.uid);
		});
	}

	/** Mirror the user's documents into state. Returns a function that stops listening. */
	#listen(uid: string) {
		const user = doc(db, 'users', uid);
		let pending = ['user', 'projects', 'sessions', 'timetables', 'cities'];
		const loaded = (key: string) => {
			pending = pending.filter((k) => k !== key);
			if (pending.length === 0) this.ready = true;
		};
		// A failed listener still counts as loaded, so the app opens instead of staying blank.
		const failed = (key: string) => (err: unknown) => {
			fail(err);
			loaded(key);
		};

		// Timetables follow the city: only its own are downloaded, whatever else has been uploaded.
		let timetablesOf: string | undefined;
		let unlistenTimetables = () => {};
		const listenTimetables = (city: string | null) => {
			const slug = citySlug(city ?? DEFAULT_CITY);
			if (slug === timetablesOf) return;
			timetablesOf = slug;
			unlistenTimetables();
			this.timetables = [];
			unlistenTimetables = onSnapshot(
				query(
					collection(db, 'prayerTimetables'),
					where(documentId(), '>', slug + '_'),
					where(documentId(), '<', slug + '_~')
				),
				(snap) => {
					this.timetables = snap.docs.flatMap((d) => {
						const data = d.data({ serverTimestamps: 'estimate' });
						const months = decodeMonths(data.months, data.year);
						if (!months) return [];
						const { city, year, tz, uploadedBy, uploadedAt } = data;
						return [{ city, year, tz, months, uploadedBy, uploadedAt: uploadedAt.toMillis() }];
					});
					loaded('timetables');
				},
				failed('timetables')
			);
		};

		const unsubscribers = [
			onSnapshot(
				user,
				(snap) => {
					const data = snap.data() as UserDoc | undefined;
					this.city = data?.city ?? null;
					this.timer = data?.timer ?? null;
					// A timer started on any device replaces the choice waiting for `start`.
					if (this.timer) this.selected = null;
					listenTimetables(this.city);
					loaded('user');
				},
				failed('user')
			),
			onSnapshot(
				query(collection(user, 'projects'), orderBy('createdAt')),
				(snap) => {
					this.projects = snap.docs.map((d) => {
						const { name, color } = d.data();
						return { id: d.id, name, color };
					});
					// Drop the choice waiting for `start` if its project was deleted, on any device.
					if (!this.projects.some((p) => p.id === this.selected)) this.selected = null;
					loaded('projects');
				},
				failed('projects')
			),
			onSnapshot(
				query(collection(user, 'sessions'), orderBy('start')),
				(snap) => {
					this.sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Session);
					loaded('sessions');
				},
				failed('sessions')
			),
			onSnapshot(
				collection(db, 'prayerCities'),
				(snap) => {
					this.timetableCities = snap.docs.map((d) => d.data().name);
					loaded('cities');
				},
				failed('cities')
			)
		];
		return () => {
			unsubscribers.forEach((unsubscribe) => unsubscribe());
			unlistenTimetables();
		};
	}

	/** The signed-in user's document. */
	#userDoc() {
		if (!this.user) throw new Error('Not signed in');
		return doc(db, 'users', this.user.uid);
	}

	projectOf(id: string) {
		return this.projects.find((p) => p.id === id) ?? DELETED;
	}

	async signIn(email: string, password: string) {
		await signInWithEmailAndPassword(auth, email, password);
	}

	signOut() {
		// Stop listening first, or the listeners fail with permission errors once signed out.
		this.#unlisten?.();
		this.#unlisten = null;
		return signOut(auth);
	}

	toggleTheme() {
		this.theme = this.dark ? 'light' : 'dark';
	}

	setCity(city: string) {
		setDoc(this.#userDoc(), { city }, { merge: true }).catch(fail);
	}

	/**
	 * Share a city's timetable for a year with every user, replacing any earlier upload. The
	 * returned promise settles once the server accepts or refuses it.
	 */
	uploadTimetable({ city, year, tz, months }: ParsedTimetable) {
		const batch = writeBatch(db);
		batch.set(doc(db, 'prayerTimetables', timetableId(city, year)), {
			city,
			year,
			tz,
			months: encodeMonths(months),
			uploadedBy: this.#userDoc().id,
			uploadedAt: serverTimestamp()
		});
		batch.set(doc(db, 'prayerCities', citySlug(city)), { name: city });
		return batch.commit();
	}

	/** Switch the running timer to a project. With no timer, only choose it for `start`. */
	pick(projectId: string) {
		if (!this.timer) this.selected = projectId;
		else if (this.timer.projectId !== projectId) this.#run(projectId);
	}

	/** Start the timer on the chosen project. */
	start() {
		if (this.timer || !this.selected) return;
		this.#run(this.selected);
	}

	/** Time a project from now, closing the previous session. */
	#run(projectId: string) {
		const now = Date.now();
		const batch = writeBatch(db);
		this.#closeSession(batch, now);
		const timer: Timer = {
			projectId,
			startedAt: now,
			resumedAt: now,
			acc: 0,
			paused: false,
			notes: []
		};
		batch.set(this.#userDoc(), { timer }, { mergeFields: ['timer'] });
		batch.commit().catch(fail);
		this.now = now;
	}

	togglePause() {
		if (!this.timer) return;
		const now = Date.now();
		const { paused, acc, resumedAt } = this.timer;
		updateDoc(
			this.#userDoc(),
			paused
				? { 'timer.paused': false, 'timer.resumedAt': now }
				: { 'timer.paused': true, 'timer.acc': acc + Math.max(0, now - resumedAt) }
		).catch(fail);
		this.now = now;
	}

	/**
	 * Stop a timer left running from an earlier day, logging it up to that day's midnight, so
	 * each day starts from zero. Its project stays chosen for `start`.
	 */
	endDay() {
		if (!this.timer || this.timer.startedAt >= startOfDay(Date.now())) return;
		const batch = writeBatch(db);
		this.#closeSession(batch, Date.now());
		batch.set(this.#userDoc(), { timer: null }, { mergeFields: ['timer'] });
		this.selected = this.timer.projectId;
		batch.commit().catch(fail);
	}

	addNote(text: string) {
		if (!this.timer) return;
		updateDoc(this.#userDoc(), {
			'timer.notes': arrayUnion({ at: Date.now(), text })
		}).catch(fail);
	}

	saveProject({ id, name, color }: { id: string | null; name: string; color: string }) {
		const projects = collection(this.#userDoc(), 'projects');
		const write =
			id === null
				? addDoc(projects, { name, color, createdAt: Date.now() })
				: updateDoc(doc(projects, id), { name, color });
		write.catch(fail);
	}

	/** Remove a project. Its logged sessions stay in the history; a running timer is dropped. */
	deleteProject(id: string) {
		const batch = writeBatch(db);
		batch.delete(doc(this.#userDoc(), 'projects', id));
		if (this.timer?.projectId === id) {
			batch.set(this.#userDoc(), { timer: null }, { mergeFields: ['timer'] });
		}
		batch.commit().catch(fail);
	}

	/** Add the running timer, if any, to the history as a finished session. */
	#closeSession(batch: WriteBatch, now: number) {
		if (!this.timer) return;
		const { acc, paused, resumedAt, startedAt, projectId, notes } = this.timer;
		// The timer may have started on another device whose clock runs ahead of this one, so
		// keep the session from ending before it starts, which the security rules reject. A
		// session never runs past the midnight after it starts, so it counts toward one day only.
		const end = Math.min(Math.max(now, startedAt), endOfDay(startedAt));
		const totalMs = Math.min(acc + (paused ? 0 : Math.max(0, end - resumedAt)), end - startedAt);
		if (totalMs < 1000) return;
		// Keyed by the start, so devices that all close the same timer at midnight write one session.
		batch.set(doc(this.#userDoc(), 'sessions', String(startedAt)), {
			start: startedAt,
			end,
			totalMs,
			projectId,
			notes
		});
	}
}

export const app = new App();

if (browser) {
	app.connect();

	$effect.root(() => {
		$effect(() => {
			localStorage.setItem(THEME_KEY, app.theme);
		});

		// Roll over at midnight, or on opening the app the next day.
		$effect(() => {
			if (app.timer && app.timer.startedAt < startOfDay(app.now)) app.endDay();
		});
	});

	setInterval(() => {
		const t = Date.now();
		if ((app.timer && !app.timer.paused) || t - app.now >= 15000) app.now = t;
	}, 250);
}
