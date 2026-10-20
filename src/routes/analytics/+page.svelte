<script lang="ts">
	import { resolve } from '$app/paths';
	import { app, totalsByProject, type Session } from '#lib/app.svelte.js';
	import { formatDuration, formatTime, startOfDay } from '#lib/format.js';

	const RANGES = [7, 30, 90];
	const DAY = 86400000;

	let range = $state(7);
	let filter = $state('all');
	let perProjectOpen = $state(true);
	/** Expanded days by date key; `null` expands only the most recent day. */
	let openDays = $state<Record<string, boolean> | null>(null);

	const dayStart = $derived(startOfDay(app.now));
	const inRangeAll = $derived(
		app.allSessions.filter((s) => s.start >= dayStart - (range - 1) * DAY)
	);
	const inRange = $derived(
		(filter === 'all' ? inRangeAll : inRangeAll.filter((s) => s.projectId === filter)).toSorted(
			(a, b) => b.start - a.start
		)
	);
	const total = $derived(inRange.reduce((t, s) => t + s.totalMs, 0));
	const noteCount = $derived(inRange.reduce((t, s) => t + s.notes.length, 0));

	const perProject = $derived(
		Object.entries(totalsByProject(inRangeAll))
			.map(([id, ms]) => ({ id, ms, project: app.projectOf(id) }))
			.toSorted((a, b) => b.ms - a.ms)
	);

	const days = $derived.by(() => {
		const groups: { key: string; start: number; sessions: Session[]; ms: number; notes: number }[] =
			[];
		for (const s of inRange) {
			const key = new Date(s.start).toDateString();
			let g = groups.find((x) => x.key === key);
			if (!g) {
				g = { key, start: s.start, sessions: [], ms: 0, notes: 0 };
				groups.push(g);
			}
			g.sessions.push(s);
			g.ms += s.totalMs;
			g.notes += s.notes.length;
		}
		return groups;
	});

	const expanded = $derived(openDays ?? (days.length ? { [days[0].key]: true } : {}));

	function dayLabel(key: string, start: number) {
		if (key === new Date(dayStart).toDateString()) return 'Today';
		if (key === new Date(dayStart - DAY).toDateString()) return 'Yesterday';
		return new Date(start).toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'short',
			day: 'numeric'
		});
	}

	const plural = (n: number, word: string) => n + ' ' + word + (n === 1 ? '' : 's');

	function setRange(r: number) {
		range = r;
		openDays = null;
	}

	function setFilter(id: string) {
		filter = id;
		openDays = null;
	}

	function exportCsv() {
		const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
		const iso = (t: number) => new Date(t).toISOString();
		const lines = [
			['Project', 'Start', 'End', 'Minutes', 'Notes'].map(cell).join(','),
			...inRange.map((s) =>
				[
					app.projectOf(s.projectId).name,
					iso(s.start),
					iso(s.end),
					Math.round(s.totalMs / 60000),
					s.notes.map((n) => n.text).join('; ')
				]
					.map(cell)
					.join(',')
			)
		];
		const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `humifocus-${range}-days.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="screen">
	<header>
		<a class="icon-btn" href={resolve('/')} aria-label="Back">
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"><path d="M15 5l-7 7 7 7"></path></svg
			>
		</a>
		<h1>Analytics</h1>
	</header>

	<div class="toolbar">
		<div class="ranges" role="group" aria-label="Range">
			{#each RANGES as r (r)}
				<button class:active={range === r} aria-pressed={range === r} onclick={() => setRange(r)}>
					{r} days
				</button>
			{/each}
		</div>
		<select
			value={filter}
			onchange={(ev) => setFilter(ev.currentTarget.value)}
			aria-label="Project"
		>
			<option value="all">All projects</option>
			{#each app.projects as p (p.id)}
				<option value={p.id}>{p.name}</option>
			{/each}
		</select>
		<button class="btn btn-ghost export" onclick={exportCsv} disabled={inRange.length === 0}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.8"
				stroke-linecap="round"
				stroke-linejoin="round"
				><path d="M12 4v11M7 10l5 5 5-5"></path><path d="M4 19h16"></path></svg
			>Export {range} days
		</button>
	</div>

	<div class="stats">
		<div class="stat">
			<span class="eyebrow">Total focus</span><span class="stat-value">{formatDuration(total)}</span
			>
		</div>
		<div class="stat">
			<span class="eyebrow">Sessions</span><span class="stat-value">{inRange.length}</span>
		</div>
		<div class="stat">
			<span class="eyebrow">Daily average</span><span class="stat-value"
				>{formatDuration(total / range)}</span
			>
		</div>
		<div class="stat">
			<span class="eyebrow">Notes</span><span class="stat-value">{noteCount}</span>
		</div>
	</div>

	{#if filter === 'all' && perProject.length > 0}
		<section>
			<div class="section-head">
				<h2>By project</h2>
				<button class="link" onclick={() => (perProjectOpen = !perProjectOpen)}>
					{perProjectOpen ? 'Hide' : 'Show'}
				</button>
			</div>
			{#if perProjectOpen}
				<div class="per-project">
					{#each perProject as x (x.id)}
						<button class="per-row" onclick={() => setFilter(x.id)}>
							<span class="small-dot" style:background={x.project.color}></span>
							<span class="per-name">{x.project.name}</span>
							<span class="per-dur">{formatDuration(x.ms)}</span>
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<section>
		<div class="section-head">
			<h2>History</h2>
			<span class="summary"
				>{plural(inRange.length, 'session')} over {plural(days.length, 'day')}</span
			>
		</div>
		<div class="days">
			{#each days as d (d.key)}
				{@const open = !!expanded[d.key]}
				<div class="day">
					<button
						class="day-head"
						aria-expanded={open}
						onclick={() => (openDays = { ...expanded, [d.key]: !open })}
					>
						<svg
							class="chev"
							class:open
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg
						>
						<span class="day-label">{dayLabel(d.key, d.start)}</span>
						<span class="day-meta"
							>{plural(d.sessions.length, 'session')}{d.notes
								? ' · ' + plural(d.notes, 'note')
								: ''}</span
						>
						<span class="day-dur">{formatDuration(d.ms)}</span>
					</button>
					{#if open}
						<div class="sessions">
							{#each d.sessions as s (s.id)}
								{@const p = app.projectOf(s.projectId)}
								<div class="session">
									<span class="time"
										>{formatTime(s.start)} – {s.live ? 'now' : formatTime(s.end)}</span
									>
									<div class="session-body">
										<div class="session-name">
											<span class="small-dot" style:background={p.color}></span>
											<span class="name">{p.name}</span>
											{#if s.live}
												<span class="live">Live</span>
											{/if}
										</div>
										{#if s.notes.length}
											<ul>
												{#each s.notes as n, i (i)}
													<li>{n.text}</li>
												{/each}
											</ul>
										{/if}
									</div>
									<span class="session-dur">{formatDuration(s.totalMs)}</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				<div class="empty">No sessions in this range.</div>
			{/each}
		</div>
	</section>
</div>

<style>
	.screen {
		min-height: 100dvh;
		padding: clamp(16px, 3vw, 32px);
		display: flex;
		flex-direction: column;
		gap: 24px;
		max-width: 880px;
		margin: 0 auto;
	}

	header {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	h1 {
		margin: 0;
		font-size: 22px;
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.ranges {
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg2);
	}

	.ranges button {
		padding: 0 14px;
		height: 36px;
		border-radius: 999px;
		border: none;
		background: transparent;
		color: var(--fg2);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
	}

	.ranges button.active {
		background: var(--fg);
		color: var(--bg);
	}

	select {
		height: 46px;
		padding: 0 36px 0 14px;
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg2)
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")
			no-repeat right 14px center;
		color: var(--fg);
		font-size: 14px;
		font-weight: 500;
		outline: none;
		cursor: pointer;
		appearance: none;
		max-width: 240px;
	}

	select:focus {
		border-color: var(--accent);
	}

	.export {
		margin-left: auto;
		padding: 0 18px 0 14px;
		height: 46px;
	}

	.export:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 10px;
	}

	.stat {
		padding: 16px 18px;
		border-radius: 14px;
		border: 1px solid var(--line);
		background: var(--bg2);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-value {
		font-family: var(--mono);
		font-size: 26px;
		font-weight: 300;
	}

	section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.section-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
	}

	h2 {
		margin: 0;
		font-size: 15px;
		font-weight: 500;
	}

	.link {
		border: none;
		background: none;
		color: var(--fg2);
		font-size: 13px;
		cursor: pointer;
		padding: 4px 0;
	}

	.link:hover {
		color: var(--fg);
	}

	.summary {
		font-size: 13px;
		color: var(--fg2);
	}

	.per-project {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 6px 20px;
	}

	.per-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 6px;
		min-height: 44px;
		border: none;
		border-bottom: 1px solid var(--line);
		background: transparent;
		color: var(--fg);
		font-size: 14px;
		cursor: pointer;
		text-align: left;
		width: 100%;
	}

	.per-row:hover {
		background: var(--accent2);
	}

	.small-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.per-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.per-dur {
		font-family: var(--mono);
		color: var(--fg2);
		font-size: 13px;
		white-space: nowrap;
	}

	.days {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.day {
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--bg2);
		overflow: hidden;
	}

	.day-head {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 0 16px;
		min-height: 56px;
		border: none;
		background: transparent;
		color: var(--fg);
		cursor: pointer;
		text-align: left;
		font-size: 15px;
	}

	.day-head:hover {
		background: var(--accent2);
	}

	.chev {
		color: var(--fg3);
		flex-shrink: 0;
		transition: transform 0.15s;
	}

	.chev.open {
		transform: rotate(90deg);
	}

	.day-label {
		font-weight: 500;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.day-meta {
		font-size: 13px;
		color: var(--fg2);
		white-space: nowrap;
	}

	.day-dur {
		font-family: var(--mono);
		font-size: 15px;
		white-space: nowrap;
		min-width: 64px;
		text-align: right;
	}

	.sessions {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}

	.session {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: 12px;
		padding: 12px 16px 12px 20px;
		border-bottom: 1px solid var(--line);
		align-items: start;
	}

	.session:last-child {
		border-bottom: none;
	}

	.time {
		font-size: 12px;
		color: var(--fg3);
		font-family: var(--mono);
		white-space: nowrap;
		padding-top: 3px;
		min-width: 96px;
	}

	.session-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.session-name {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	.live {
		font-size: 11px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--accent);
		font-weight: 600;
	}

	ul {
		margin: 0;
		padding-left: 17px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 13px;
		color: var(--fg2);
		line-height: 1.4;
	}

	.session-dur {
		font-family: var(--mono);
		font-size: 14px;
		white-space: nowrap;
		padding-top: 1px;
	}

	.empty {
		padding: 40px 0;
		text-align: center;
		color: var(--fg2);
	}
</style>
