<script lang="ts">
	import { app } from '#lib/app.svelte.js';
	import { clickOutside } from '#lib/click-outside.js';

	let open = $state(false);
	let draft = $state('');

	function toggle() {
		open = !open;
		draft = '';
	}

	function save(ev: SubmitEvent) {
		ev.preventDefault();
		const text = draft.trim();
		if (!text) return;
		app.addNote(text);
		draft = '';
	}
</script>

<div class="anchor" {@attach clickOutside(() => (open = false))}>
	<button class="btn btn-ghost" onclick={toggle} aria-expanded={open}>Add note</button>
	{#if open}
		<form class="popover" onsubmit={save}>
			<!-- the form opens on an explicit click, so focus belongs in its input -->
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="field"
				bind:value={draft}
				autofocus
				placeholder="What did you just do?"
				maxlength="140"
				aria-label="Note"
			/>
			<div class="row">
				<span class="hint">Enter to add another</span>
				<div class="actions">
					<button type="button" class="btn btn-ghost small" onclick={toggle}>Done</button>
					<button type="submit" class="btn btn-primary small">Add</button>
				</div>
			</div>
		</form>
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

	form {
		position: absolute;
		bottom: calc(100% + 10px);
		left: 50%;
		transform: translateX(-50%);
		width: min(340px, calc(100vw - 32px));
		padding: 12px;
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
		z-index: 5;
		text-align: left;
	}

	.field {
		padding: 11px 12px;
		font-size: 14px;
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
	}

	.hint {
		font-size: 12px;
		color: var(--fg3);
	}

	.actions {
		display: flex;
		gap: 8px;
	}

	.small {
		padding: 0 14px;
		min-height: 38px;
		height: 38px;
		font-size: 13px;
	}
</style>
