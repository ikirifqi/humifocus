import { browser } from '$app/env';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import {
	addDoc,
	collection,
	doc,
	documentId,
	onSnapshot,
	orderBy,
	query,
	runTransaction,
	serverTimestamp,
	setDoc,
	updateDoc,
	waitForPendingWrites,
	where,
	writeBatch,
	type DocumentReference,
	type Transaction
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

/** A change to the timer, given the server's timer, to run inside a transaction. */
type TimerAction = (tx: Transaction, timer: Timer | null, user: DocumentReference) => void;

type Theme = 'system' | 'light' | 'dark';

/**
 * Firestore layout, all owned by one user:
 * - `users/{uid}`: `UserDoc`, settings and the running timer, so every device sees it
 * - `users/{uid}/projects/{id}`: `Project` fields plus `createdAt`
 * - `users/{uid}/sessions/{id}`: `Session` fields keyed by the start, finished or still running
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
	online = $state(browser ? navigator.onLine : true);
	/** True from a timer action until the server takes it, so the next one waits its turn. */
	busy = $state(false);

	#unlisten: (() => void) | null = null;
	/** Start of the earlier day's timer `endDay` last tried, so it is not retried on every tick. */
	#ended: number | null = null;
	#saving = false;
	#saveAgain = false;

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

	/**
	 * Finished sessions plus the running one, if any. The running session's stored copy, keyed by
	 * its start, lags the clock, so the live row replaces it.
	 */
	allSessions: Session[] = $derived.by(() => {
		if (!this.timer) return this.sessions;
		const stored = String(this.timer.startedAt);
		return [
			...this.sessions.filter((s) => s.id !== stored),
			{
				id: 'live',
				start: this.timer.startedAt,
				end: this.now,
				totalMs: this.elapsed,
				projectId: this.timer.projectId,
				notes: this.timer.notes,
				live: true
			}
		];
	});

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
			this.#ended = null;
			this.busy = false;
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

		let opened = false;
		const unsubscribers = [
			onSnapshot(
				user,
				(snap) => {
					const data = snap.data() as UserDoc | undefined;
					this.city = data?.city ?? null;
					this.timer = data?.timer ?? null;
					// A timer started on any device replaces the choice waiting for `start`.
					if (this.timer) this.selected = null;
					// Save the running session on opening the app and after each change this device
					// makes to the timer, such as a pause or a note. Other devices save their own.
					if (!opened || snap.metadata.hasPendingWrites) this.save();
					opened = true;
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

	/** Whether the timer can be changed now: online, and no earlier change still on its way. */
	get canAct() {
		return this.online && !this.busy;
	}

	/**
	 * Run a change to the timer in a transaction against the server's timer, the only copy every
	 * device agrees on. The screen may still show a timer another device has since paused,
	 * switched, or stopped, so the change runs only while the server's timer is still the one
	 * shown (`seen`, by its start); otherwise nothing is written and the screen catches up.
	 *
	 * A transaction needs the server, so offline the timer cannot change, and one change runs at
	 * a time. Resolves to whether the change ran, or `null` when it failed.
	 */
	async #act(seen: Timer | null | undefined, change: TimerAction) {
		if (!this.canAct || !this.user) return false;
		this.busy = true;
		const user = this.#userDoc();
		try {
			const ran = await runTransaction(db, async (tx) => {
				const timer = ((await tx.get(user)).data() as UserDoc | undefined)?.timer ?? null;
				if (seen !== undefined && timer?.startedAt !== seen?.startedAt) return false;
				change(tx, timer, user);
				return true;
			});
			if (ran) this.save();
			return ran;
		} catch (err) {
			fail(err);
			return null;
		} finally {
			this.busy = false;
		}
	}

	/** Switch the running timer to a project. With no timer, only choose it for `start`. */
	pick(projectId: string) {
		if (!this.timer) this.selected = projectId;
		else if (this.timer.projectId !== projectId) this.#run(this.timer, projectId);
	}

	/** Start the timer on the chosen project. */
	start() {
		if (this.timer || !this.selected) return;
		this.#run(null, this.selected);
	}

	/** Time a project from now, closing the previous session. */
	async #run(seen: Timer | null, projectId: string) {
		const ran = await this.#act(seen, (tx, timer, user) => {
			const now = Date.now();
			if (timer) closeSession(tx, user, timer, now);
			const next: Timer = {
				projectId,
				startedAt: now,
				resumedAt: now,
				acc: 0,
				paused: false,
				notes: []
			};
			tx.set(user, { timer: next }, { mergeFields: ['timer'] });
		});
		if (!ran) return;
		this.now = Date.now();
		// Save the new session once it counts, rather than at the next minute, so it is in the
		// history even if the tab is closed right away.
		setTimeout(() => this.save(), 1500);
	}

	togglePause() {
		if (!this.timer) return;
		const pause = !this.timer.paused;
		this.#act(this.timer, (tx, timer, user) => {
			// Already as asked, such as paused on another device too.
			if (!timer || timer.paused === pause) return;
			const now = Date.now();
			tx.update(
				user,
				pause
					? { 'timer.paused': true, 'timer.acc': timer.acc + Math.max(0, now - timer.resumedAt) }
					: { 'timer.paused': false, 'timer.resumedAt': now }
			);
		}).then(() => (this.now = Date.now()));
	}

	/**
	 * Stop a timer left running from an earlier day, logging it up to that day's midnight, so
	 * each day starts from zero. Its project stays chosen for `start`.
	 *
	 * The timer seen here may come from this device's cache, days out of date, while another
	 * device has since started today's timer. Like every timer change it runs only while the
	 * server's timer is still this one, so it cannot wipe the other device's running session.
	 * Offline the rollover waits until the connection returns.
	 */
	async endDay() {
		const seen = this.timer;
		if (!seen || seen.startedAt >= startOfDay(Date.now())) return;
		if (!this.canAct || this.#ended === seen.startedAt) return;
		this.#ended = seen.startedAt;
		const closed = await this.#act(seen, (tx, timer, user) => {
			if (timer) closeSession(tx, user, timer, Date.now());
			tx.set(user, { timer: null }, { mergeFields: ['timer'] });
		});
		if (closed === null) setTimeout(() => (this.#ended = null), 60000);
		if (closed && (!this.timer || this.timer.startedAt === seen.startedAt)) {
			this.selected = seen.projectId;
		}
	}

	addNote(text: string) {
		if (!this.timer) return;
		const note = { at: Date.now(), text };
		this.#act(this.timer, (tx, timer, user) => {
			if (timer) tx.update(user, { 'timer.notes': [...timer.notes, note] });
		});
	}

	/** Reword a note on the running timer, keeping when it was written and its place. */
	editNote(at: number, text: string) {
		if (!this.timer) return;
		this.#act(this.timer, (tx, timer, user) => {
			if (!timer) return;
			const notes = timer.notes.map((n) => (n.at === at ? { at, text } : n));
			tx.update(user, { 'timer.notes': notes });
		});
	}

	removeNote(note: Note) {
		if (!this.timer) return;
		this.#act(this.timer, (tx, timer, user) => {
			if (!timer) return;
			const notes = timer.notes.filter((n) => n.at !== note.at || n.text !== note.text);
			tx.update(user, { 'timer.notes': notes });
		});
	}

	saveProject({ id, name, color }: { id: string | null; name: string; color: string }) {
		const projects = collection(this.#userDoc(), 'projects');
		const write =
			id === null
				? addDoc(projects, { name, color, createdAt: Date.now() })
				: updateDoc(doc(projects, id), { name, color });
		write.catch(fail);
	}

	/**
	 * Remove a project. Its logged sessions stay in the history, and a running timer on it stops
	 * and joins them. The server's timer decides, whichever timer this device shows, so a timer
	 * started on the project from another device is stopped too.
	 */
	deleteProject(id: string) {
		this.#act(undefined, (tx, timer, user) => {
			tx.delete(doc(user, 'projects', id));
			if (timer?.projectId !== id) return;
			closeSession(tx, user, timer, Date.now());
			tx.set(user, { timer: null }, { mergeFields: ['timer'] });
		});
	}

	/**
	 * Store the running session as it stands, under the same id its close will use, so a day is in
	 * the history before it ends even if the app is closed and never sees midnight.
	 *
	 * A save never moves a session backwards. It reads the server's timer and stored session in a
	 * transaction and writes only when its `end` and `totalMs` are at least the stored ones, so a
	 * late or stale save cannot undo a later save, a close on another device, or a script's close.
	 * It never writes the timer, so a timer cleared elsewhere stays cleared. A transaction needs the
	 * server, so offline a save waits, and runs once on reconnecting after this device's queued
	 * changes reach the server. Calls made while a save is under way merge into one more save.
	 */
	save() {
		// Offline, a save could only fail and log; going online saves again.
		if (!this.timer || !navigator.onLine) return;
		if (this.#saving) {
			this.#saveAgain = true;
			return;
		}
		this.#saving = true;
		this.#save()
			.catch(fail)
			.finally(() => {
				this.#saving = false;
				if (this.#saveAgain) {
					this.#saveAgain = false;
					this.save();
				}
			});
	}

	async #save() {
		await waitForPendingWrites(db);
		const user = this.#userDoc();
		await runTransaction(db, async (tx) => {
			const timer = ((await tx.get(user)).data() as UserDoc | undefined)?.timer;
			// A timer from an earlier day is closed at its midnight by `endDay`.
			if (!timer || timer.startedAt < startOfDay(Date.now())) return;
			const id = String(timer.startedAt);
			const ref = doc(user, 'sessions', id);
			const stored = (await tx.get(ref)).data() as Omit<Session, 'id'> | undefined;
			const session = sessionOf(timer, Date.now());
			if (!session) return;
			if (stored && (stored.end > session.end || stored.totalMs > session.totalMs)) return;
			tx.set(ref, session);
		});
	}
}

/**
 * The session document a timer stands for at `now`, or `null` while it has counted under a
 * second. Every write of a session goes through here, and scripts that close a timer for the app
 * repeat the same arithmetic, so keep them in step.
 */
function sessionOf(timer: Timer, now: number) {
	const { acc, paused, resumedAt, startedAt, projectId, notes } = timer;
	// The timer may have started on another device whose clock runs ahead of this one, so
	// keep the session from ending before it starts, which the security rules reject. A
	// session never runs past the midnight after it starts, so it counts toward one day only.
	const end = Math.min(Math.max(now, startedAt), endOfDay(startedAt));
	const totalMs = Math.min(acc + (paused ? 0 : Math.max(0, end - resumedAt)), end - startedAt);
	if (totalMs < 1000) return null;
	return { start: startedAt, end, totalMs, projectId, notes };
}

/** Add a timer to the history as a finished session, keyed by its start as its saves are. */
function closeSession(tx: Transaction, user: DocumentReference, timer: Timer, now: number) {
	const session = sessionOf(timer, now);
	if (session) tx.set(doc(user, 'sessions', String(session.start)), session);
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

	// Keep the stored running session at most a minute behind, and save it at once when the page
	// may stop running: hidden, closed, or back online after queuing changes.
	setInterval(() => {
		if (app.timer && !app.timer.paused) app.save();
	}, 60000);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') app.save();
		else atMidnight();
	});

	// Roll over at midnight even when the clock above is slowed, as in a background tab. Timers
	// can run late after the computer sleeps, so becoming visible again checks and re-arms it.
	let midnight: ReturnType<typeof setTimeout> | undefined;
	function atMidnight() {
		clearTimeout(midnight);
		app.now = Date.now();
		midnight = setTimeout(atMidnight, endOfDay(app.now) - app.now);
	}
	atMidnight();
	addEventListener('pagehide', () => app.save());
	addEventListener('online', () => {
		app.online = true;
		app.save();
	});
	addEventListener('offline', () => (app.online = false));
}
