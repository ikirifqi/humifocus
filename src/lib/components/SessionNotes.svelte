<script lang="ts">
	import { app } from '#lib/app.svelte.js';
	import { clickOutside } from '#lib/click-outside.js';
	import { formatTime } from '#lib/format.js';

	let open = $state(false);
	const notes = $derived(app.timer?.notes ?? []);
	let editing = $state<{ at: number; text: string } | null>(null);
	/** When the note awaiting confirmation to remove was written. */
	let deleting = $state<number | null>(null);

	function close() {
		open = false;
		editing = null;
		deleting = null;
	}

	function save(ev: SubmitEvent) {
		ev.preventDefault();
		if (!editing) return;
		const text = editing.text.trim();
		if (!text) return;
		app.editNote(editing.at, text);
		editing = null;
	}
</script>

<div class="anchor" {@attach clickOutside(close)}>
	<button
		class="btn btn-ghost"
		onclick={() => (open ? close() : (open = true))}
		aria-expanded={open}
	>
		Notes<span class="count">{notes.length}</span>
	</button>
	{#if open}
		<div class="popover panel">
			<div class="eyebrow">This session</div>
			{#if notes.length}
				<ul>
					{#each notes as n, i (i)}
						<li>
							<span class="at">{formatTime(n.at)}</span>
							{#if editing?.at === n.at}
								<form onsubmit={save}>
									<!-- the form opens on an explicit click, so focus belongs in its input -->
									<!-- svelte-ignore a11y_autofocus -->
									<input
										class="field"
										bind:value={editing.text}
										autofocus
										maxlength="140"
										aria-label="Note"
									/>
									<div class="choices">
										<button
											type="button"
											class="btn btn-ghost small"
											onclick={() => (editing = null)}>Cancel</button
										>
										<button type="submit" class="btn btn-primary small">Save</button>
									</div>
								</form>
							{:else if deleting === n.at}
								<div class="body">
									<span class="text">{n.text}</span>
									<div class="choices">
										<span class="ask">Remove this note?</span>
										<button class="btn btn-ghost small" onclick={() => (deleting = null)}
											>Keep</button
										>
										<button
											class="btn small danger"
											onclick={() => {
												app.removeNote(n);
												deleting = null;
											}}>Remove</button
										>
									</div>
								</div>
							{:else}
								<span class="text">{n.text}</span>
								<div class="note-actions">
									<button
										class="note-btn"
										onclick={() => {
											editing = { ...n };
											deleting = null;
										}}
										aria-label="Edit note: {n.text}"
									>
										<svg
											width="15"
											height="15"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.6"
											stroke-linecap="round"
											stroke-linejoin="round"
											><path d="M4 20h4l10-10-4-4L4 16v4z"></path><path d="M12.5 7.5l4 4"
											></path></svg
										>
									</button>
									<button
										class="note-btn delete"
										onclick={() => {
											deleting = n.at;
											editing = null;
										}}
										aria-label="Remove note: {n.text}"
									>
										<svg
											width="15"
											height="15"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="1.6"
											stroke-linecap="round"
											stroke-linejoin="round"
											><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg
										>
									</button>
								</div>
							{/if}
						</li>
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
		max-height: min(320px, 60dvh);
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

	.text {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.note-actions {
		display: flex;
		flex-shrink: 0;
		margin: -6px -6px 0 0;
	}

	.note-btn {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--fg3);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.note-btn:hover {
		color: var(--fg);
		border-color: var(--line);
	}

	.note-btn.delete:hover {
		color: var(--danger);
	}

	form,
	.body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.field {
		padding: 8px 10px;
		font-size: 14px;
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
	}

	.ask {
		flex: 1;
		font-size: 12px;
		color: var(--fg2);
		white-space: nowrap;
	}

	.small {
		padding: 0 12px;
		min-height: 34px;
		height: 34px;
		font-size: 13px;
	}

	.danger {
		border: none;
		background: var(--danger);
		color: white;
		font-weight: 600;
	}

	.danger:hover {
		opacity: 0.88;
	}

	.empty {
		font-size: 13px;
		color: var(--fg2);
	}
</style>
