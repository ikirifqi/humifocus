<script lang="ts">
	import { resolve } from '$app/paths';
	import { app, totalsByProject } from '#lib/app.svelte.js';
	import { clickOutside } from '#lib/click-outside.js';
	import { formatDuration, startOfDay } from '#lib/format.js';

	let open = $state(false);
	let query = $state('');

	const todayMs = $derived(
		totalsByProject(app.allSessions.filter((s) => s.start >= startOfDay(app.now)))
	);

	const items = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return app.projects.filter((p) => !q || p.name.toLowerCase().includes(q));
	});

	function toggle() {
		open = !open;
		query = '';
	}

	function pick(id: string) {
		app.pick(id);
		open = false;
		query = '';
	}
</script>

<div class="picker" {@attach clickOutside(() => (open = false))}>
	<button class="trigger" onclick={toggle} aria-expanded={open} aria-haspopup="listbox">
		<span
			class="dot"
			class:blink={app.timer && !app.timer.paused}
			style:background={app.current?.color ?? 'var(--fg3)'}
		></span>
		<span class="label">{app.current?.name ?? 'Choose a project'}</span>
		{#if app.timer?.paused}
			<span class="paused">paused</span>
		{/if}
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="chevron"><path d="M6 9l6 6 6-6"></path></svg
		>
	</button>
	{#if open}
		<div class="menu">
			<div class="search">
				<!-- the menu opens on an explicit click, so focus belongs in its search box -->
				<!-- svelte-ignore a11y_autofocus -->
				<input class="field" bind:value={query} autofocus placeholder="Search projects" />
			</div>
			<div class="list" role="listbox">
				{#each items as p (p.id)}
					<button
						class="item"
						class:selected={p.id === app.timer?.projectId}
						role="option"
						aria-selected={p.id === app.timer?.projectId}
						onclick={() => pick(p.id)}
					>
						<span class="dot" style:background={p.color}></span>
						<span class="name">{p.name}</span>
						<span class="today">{todayMs[p.id] ? formatDuration(todayMs[p.id]) : ''}</span>
					</button>
				{/each}
				{#if app.projects.length === 0}
					<div class="empty">
						No projects yet. <a href={resolve('/projects')}>Create one</a> to start timing.
					</div>
				{:else if items.length === 0}
					<div class="empty">No matching project.</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.picker {
		position: relative;
	}

	.trigger {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 0 14px 0 16px;
		height: 48px;
		min-width: 260px;
		max-width: min(420px, calc(100vw - 32px));
		border-radius: 999px;
		border: 1px solid var(--line);
		background: var(--bg2);
		color: var(--fg);
		font-size: 15px;
		cursor: pointer;
	}

	.trigger:hover {
		border-color: var(--fg3);
	}

	.blink {
		animation: blink 1.6s ease-in-out infinite;
	}

	.label {
		font-weight: 500;
		flex: 1;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.paused {
		font-size: 12px;
		color: var(--fg2);
	}

	.chevron {
		color: var(--fg2);
		flex-shrink: 0;
	}

	.menu {
		position: absolute;
		top: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		width: min(360px, calc(100vw - 32px));
		border-radius: 16px;
		border: 1px solid var(--line);
		background: var(--bg2);
		box-shadow: 0 16px 40px -16px rgba(0, 0, 0, 0.3);
		display: flex;
		flex-direction: column;
		z-index: 6;
		text-align: left;
		overflow: hidden;
	}

	.search {
		padding: 10px;
	}

	.list {
		max-height: min(320px, 40dvh);
		overflow-y: auto;
		padding: 0 10px 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 12px;
		height: 52px;
		border-radius: 12px;
		border: none;
		background: transparent;
		color: var(--fg);
		font-size: 15px;
		cursor: pointer;
		text-align: left;
		width: 100%;
		flex-shrink: 0;
	}

	.item:hover,
	.item.selected {
		background: var(--accent2);
	}

	.name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}

	.today {
		font-family: var(--mono);
		font-size: 13px;
		color: var(--fg3);
	}

	.empty {
		padding: 14px 12px;
		font-size: 14px;
		color: var(--fg2);
	}
</style>
