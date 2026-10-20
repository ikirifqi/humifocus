import { browser } from '$app/env';
import { MediaQuery } from 'svelte/reactivity';

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
	id: number;
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
	projectId: number;
	notes: Note[];
	live?: boolean;
}

/** The session currently being timed. */
interface Timer {
	projectId: number;
	startedAt: number;
	/** When the timer last started counting, after a pick or a resume. */
	resumedAt: number;
	/** Time counted before `resumedAt`. */
	acc: number;
	paused: boolean;
	notes: Note[];
}

type Theme = 'system' | 'light' | 'dark';

interface Saved {
	user: string | null;
	theme: Theme;
	projects: Project[];
	nextId: number;
	sessions: Session[];
	timer: Timer | null;
	city: string | null;
}

const STORAGE_KEY = 'humifocus:v1';

const DELETED: Project = { id: 0, name: 'Deleted project', color: '#999' };

/** Sum of logged time per project id. */
export function totalsByProject(sessions: Session[]) {
	const totals: Record<number, number> = {};
	for (const s of sessions) totals[s.projectId] = (totals[s.projectId] ?? 0) + s.totalMs;
	return totals;
}

function load(): Partial<Saved> {
	if (!browser) return {};
	try {
		return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
	} catch {
		return {};
	}
}

class App {
	user = $state<string | null>(null);
	theme = $state<Theme>('system');
	projects = $state<Project[]>([]);
	nextId = $state(1);
	sessions = $state<Session[]>([]);
	timer = $state<Timer | null>(null);
	/** Prayer timetable city; `null` uses the default. */
	city = $state<string | null>(null);
	/** Ticks every 250ms while the timer runs, and every 15s otherwise. */
	now = $state(Date.now());

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

	constructor(saved: Partial<Saved>) {
		this.user = saved.user ?? null;
		this.theme = saved.theme ?? 'system';
		this.projects = saved.projects ?? [];
		this.nextId = saved.nextId ?? 1;
		this.sessions = saved.sessions ?? [];
		this.timer = saved.timer ?? null;
		this.city = saved.city ?? null;
	}

	projectOf(id: number) {
		return this.projects.find((p) => p.id === id) ?? DELETED;
	}

	signIn(email: string) {
		this.user = email;
	}

	signOut() {
		this.user = null;
	}

	toggleTheme() {
		this.theme = this.dark ? 'light' : 'dark';
	}

	/** Switch the timer to a project, closing the previous session. */
	pick(projectId: number) {
		if (this.timer?.projectId === projectId) return;
		const now = Date.now();
		this.#closeSession(now);
		this.now = now;
		this.timer = { projectId, startedAt: now, resumedAt: now, acc: 0, paused: false, notes: [] };
	}

	togglePause() {
		if (!this.timer) return;
		const now = Date.now();
		if (this.timer.paused) {
			this.timer.paused = false;
			this.timer.resumedAt = now;
		} else {
			this.timer.acc += Math.max(0, now - this.timer.resumedAt);
			this.timer.paused = true;
		}
		this.now = now;
	}

	addNote(text: string) {
		this.timer?.notes.push({ at: Date.now(), text });
	}

	saveProject(project: { id: number | null; name: string; color: string }) {
		if (project.id === null) {
			this.projects.push({ ...project, id: this.nextId });
			this.nextId++;
			return;
		}
		const existing = this.projects.find((p) => p.id === project.id);
		if (existing) Object.assign(existing, project);
	}

	/** Remove a project. Its logged sessions stay in the history; a running timer is dropped. */
	deleteProject(id: number) {
		this.projects = this.projects.filter((p) => p.id !== id);
		if (this.timer?.projectId === id) this.timer = null;
	}

	#closeSession(now: number) {
		if (!this.timer) return;
		const { acc, paused, resumedAt } = this.timer;
		const totalMs = acc + (paused ? 0 : Math.max(0, now - resumedAt));
		if (totalMs >= 1000) {
			this.sessions.push({
				id: crypto.randomUUID(),
				start: this.timer.startedAt,
				end: now,
				totalMs,
				projectId: this.timer.projectId,
				notes: $state.snapshot(this.timer.notes)
			});
		}
		this.timer = null;
	}

	toJSON(): Saved {
		return {
			user: this.user,
			theme: this.theme,
			projects: this.projects,
			nextId: this.nextId,
			sessions: this.sessions,
			timer: this.timer,
			city: this.city
		};
	}
}

export const app = new App(load());

if (browser) {
	$effect.root(() => {
		$effect(() => {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
		});
	});

	setInterval(() => {
		const t = Date.now();
		if ((app.timer && !app.timer.paused) || t - app.now >= 15000) app.now = t;
	}, 250);
}
