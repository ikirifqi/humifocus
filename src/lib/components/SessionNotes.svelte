<script lang="ts">
	import { app } from '#lib/app.svelte.js';
	import { clickOutside } from '#lib/click-outside.js';
	import { formatTime } from '#lib/format.js';

	let open = $state(false);
	const notes = $derived(app.timer?.notes ?? []);
</script>

<div class="anchor" {@attach clickOutside(() => (open = false))}>
	<button class="btn btn-ghost" onclick={() => (open = !open)} aria-expanded={open}>
		Notes<span class="count">{notes.length}</span>
	</button>
	{#if open}
		<div class="popover panel">
			<div class="eyebrow">This session</div>
			{#if notes.length}
				<ul>
					{#each notes as n, i (i)}
						<li><span class="at">{formatTime(n.at)}</span><span>{n.text}</span></li>
					{/each}
				</ul>
			{:else}
				<div class="empty">No notes yet. Add one as you go.</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.anchor {
		position: relative;
	}

	.anchor > .btn {
		padding: 13px 22px;
		min-height: 48px;
		font-size: 15px;
	}

	.count {
		font-family: var(--mono);
		font-size: 12px;
		color: var(--fg2);
		background: var(--accent2);
		border-radius: 999px;
		padding: 2px 8px;
	}

	.panel {
		position: absolute;
		bottom: calc(100% + 10px);
		left: 50%;
		transform: translateX(-50%);
		width: min(360px, calc(100vw - 32px));
		max-height: 320px;
		overflow-y: auto;
		padding: 14px 16px;
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 5;
		text-align: left;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	li {
		display: flex;
		gap: 10px;
		font-size: 14px;
		line-height: 1.4;
	}

	.at {
		font-family: var(--mono);
		font-size: 12px;
		color: var(--fg3);
		flex-shrink: 0;
		padding-top: 2px;
	}

	.empty {
		font-size: 13px;
		color: var(--fg2);
	}
</style>
