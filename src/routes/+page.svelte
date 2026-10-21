<script lang="ts">
	import { resolve } from '$app/paths';
	import { app } from '#lib/app.svelte.js';
	import AddNote from '#lib/components/AddNote.svelte';
	import PrayerDialog from '#lib/components/PrayerDialog.svelte';
	import ProjectPicker from '#lib/components/ProjectPicker.svelte';
	import SessionNotes from '#lib/components/SessionNotes.svelte';
	import { formatDigits, pad, startOfDay } from '#lib/format.js';
	import { findPlace, nextPrayer } from '#lib/prayer.js';

	let prayerOpen = $state(false);

	const today = $derived(app.allSessions.filter((s) => s.start >= startOfDay(app.now)));
	const projectTotal = $derived(
		today.filter((s) => s.projectId === app.current?.id).reduce((t, s) => t + s.totalMs, 0)
	);
	const allTotal = $derived(today.reduce((t, s) => t + s.totalMs, 0));

	const place = $derived(findPlace(app.city, app.timetables));
	const next = $derived(nextPrayer(app.now, place));
	const nextIn = $derived.by(() => {
		const m = Math.round((next?.inHours ?? 0) * 60);
		return m >= 60 ? Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm' : m + 'm';
	});
</script>

<div class="screen">
	<header>
		<div class="today">
			<span class="eyebrow">Today</span>
			<span class="date"
				>{new Date(app.now).toLocaleDateString(undefined, {
					weekday: 'long',
					month: 'long',
					day: 'numeric'
				})}</span
			>
		</div>
		<nav>
			<button class="prayer" onclick={() => (prayerOpen = true)} title="Monthly prayer timetable">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path></svg
				>
				<span class="prayer-text">
					{#if next}
						<span class="prayer-name">{next.name} <span class="prayer-in">in {nextIn}</span></span>
						<span class="prayer-at">{next.at} · {place.name}</span>
					{:else}
						<span class="prayer-name">Prayer times</span>
						<span class="prayer-at">No timetable · {place.name}</span>
					{/if}
				</span>
			</button>
			<a
				class="icon-btn"
				href={resolve('/projects')}
				title="Manage projects"
				aria-label="Manage projects"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					><rect x="4" y="4" width="7" height="7" rx="1.5"></rect><rect
						x="13"
						y="4"
						width="7"
						height="7"
						rx="1.5"
					></rect><rect x="4" y="13" width="7" height="7" rx="1.5"></rect><rect
						x="13"
						y="13"
						width="7"
						height="7"
						rx="1.5"
					></rect></svg
				>
			</a>
			<a class="icon-btn" href={resolve('/analytics')} title="Analytics" aria-label="Analytics">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					><path d="M5 20V12"></path><path d="M12 20V5"></path><path d="M19 20v-8"></path></svg
				>
			</a>
			<button
				class="icon-btn"
				onclick={() => app.toggleTheme()}
				title="Toggle theme"
				aria-label="Toggle theme"
			>
				{#if app.dark}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						><circle cx="12" cy="12" r="4"></circle><path
							d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"
						></path></svg
					>
				{:else}
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linecap="round"
						><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path></svg
					>
				{/if}
			</button>
			<button class="icon-btn" onclick={() => app.signOut()} title="Sign out" aria-label="Sign out">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"></path><path d="M15 8l4 4-4 4"
					></path><path d="M19 12H9"></path></svg
				>
			</button>
		</nav>
	</header>

	<main>
		<ProjectPicker />
		<div class="digits" class:idle={!app.timer} role="timer">{formatDigits(app.elapsed)}</div>
		<div class="totals">
			{#if app.current}
				<div class="total">
					<span class="eyebrow">{app.current?.name} today</span>
					<span class="total-digits">{formatDigits(projectTotal)}</span>
				</div>
			{/if}
			<div class="total">
				<span class="eyebrow">All projects today</span>
				<span class="total-digits">{formatDigits(allTotal)}</span>
			</div>
		</div>
	</main>

	<footer>
		{#if app.timer}
			<div class="actions">
				<button class="btn btn-primary lead" onclick={() => app.togglePause()}>
					{app.timer.paused ? 'Resume' : 'Pause'}
				</button>
				<AddNote />
				<SessionNotes />
			</div>
		{:else if app.current}
			<button class="btn btn-primary lead" onclick={() => app.start()}>Start</button>
		{/if}
	</footer>
</div>

<PrayerDialog bind:open={prayerOpen} />

<style>
	/* The timer fills the screen exactly, like a native app, so the page never scrolls. */
	.screen {
		height: 100dvh;
		overflow: hidden;
		display: grid;
		grid-template-rows: auto 1fr auto;
		padding: clamp(16px, 3vw, 32px);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}

	.today {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.date {
		font-size: 16px;
		font-weight: 500;
	}

	nav {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.prayer {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 14px 0 12px;
		height: 44px;
		border-radius: 12px;
		border: 1px solid var(--line);
		background: var(--bg2);
		color: var(--fg);
		cursor: pointer;
		text-align: left;
	}

	.prayer:hover {
		border-color: var(--fg3);
	}

	.prayer svg {
		color: var(--accent);
		flex-shrink: 0;
	}

	.prayer-text {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
	}

	.prayer-name {
		font-size: 13px;
		font-weight: 600;
	}

	.prayer-in {
		font-weight: 400;
		color: var(--fg2);
	}

	.prayer-at {
		font-size: 11px;
		color: var(--fg3);
		font-family: var(--mono);
	}

	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		min-height: 0;
		padding: 32px 0;
		text-align: center;
	}

	.digits {
		font-family: var(--mono);
		font-weight: 300;
		font-size: clamp(48px, min(16vw, 26dvh), 220px);
		line-height: 1;
		letter-spacing: -0.03em;
		font-variant-numeric: tabular-nums;
		color: var(--fg);
	}

	.digits.idle {
		color: var(--fg3);
	}

	.totals {
		display: flex;
		justify-content: center;
		gap: clamp(24px, 5vw, 56px);
		flex-wrap: wrap;
	}

	.total {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.total-digits {
		font-family: var(--mono);
		font-size: clamp(20px, 3vw, 30px);
		font-weight: 300;
		letter-spacing: -0.01em;
		font-variant-numeric: tabular-nums;
		color: var(--fg2);
	}

	footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		min-height: 72px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 10px;
	}

	.lead {
		padding: 13px 26px;
		min-height: 48px;
		min-width: 120px;
		font-size: 15px;
	}

	/* A phone held sideways: tighten the spacing so everything still fits. */
	@media (max-height: 520px) {
		.screen {
			padding: 12px clamp(16px, 3vw, 32px);
		}

		main {
			gap: 10px;
			padding: 8px 0;
		}

		footer {
			min-height: 48px;
		}
	}
</style>
