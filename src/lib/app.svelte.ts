import { browser } from '$app/env';
import {
	createUserWithEmailAndPassword,
	onAuthStateChanged,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signOut,
	type User
} from 'firebase/auth';
import {
	addDoc,
	arrayUnion,
	collection,
	doc,
	onSnapshot,
	orderBy,
	query,
	setDoc,
	updateDoc,
	writeBatch,
	type WriteBatch
} from 'firebase/firestore';
import { MediaQuery } from 'svelte/reactivity';
import { auth, db } from '#lib/firebase.js';

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
	/** Prayer timetable city; `null` uses the default. */
	city = $state<string | null>(null);
	/** Ticks every 250ms while the timer runs, and every 15s otherwise. */
	now = $state(Date.now());

	#unlisten: (() => void) | null = null;

	#systemDark = new MediaQuery('(prefers-color-scheme: dark)');
	dark = $derived(this.theme === 'system' ? this.#systemDark.current : this.theme === 'dark');

	current = $derived(this.timer ? this.projectOf(this.timer.projectId) : null);

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
			this.city = null;
			this.ready = !user;
			if (user) this.#unlisten = this.#listen(user.uid);
		});
	}

	/** Mirror the user's documents into state. Returns a function that stops listening. */
	#listen(uid: string) {
		const user = doc(db, 'users', uid);
		let pending = ['user', 'projects', 'sessions'];
		const loaded = (key: string) => {
			pending = pending.filter((k) => k !== key);
			if (pending.length === 0) this.ready = true;
		};
		// A failed listener still counts as loaded, so the app opens instead of staying blank.
		const failed = (key: string) => (err: unknown) => {
			fail(err);
			loaded(key);
		};

		const unsubscribers = [
			onSnapshot(
				user,
				(snap) => {
					const data = snap.data() as UserDoc | undefined;
					this.city = data?.city ?? null;
					this.timer = data?.timer ?? null;
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
			)
		];
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
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

	async signUp(email: string, password: string) {
		await createUserWithEmailAndPassword(auth, email, password);
	}

	resetPassword(email: string) {
		return sendPasswordResetEmail(auth, email);
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

	/** Switch the timer to a project, closing the previous session. */
	pick(projectId: string) {
		if (this.timer?.projectId === projectId) return;
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
		const totalMs = acc + (paused ? 0 : Math.max(0, now - resumedAt));
		if (totalMs < 1000) return;
		batch.set(doc(collection(this.#userDoc(), 'sessions')), {
			start: startedAt,
			end: now,
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
	});

	setInterval(() => {
		const t = Date.now();
		if ((app.timer && !app.timer.paused) || t - app.now >= 15000) app.now = t;
	}, 250);
}
