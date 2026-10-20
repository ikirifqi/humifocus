<script lang="ts">
	import { resolve } from '$app/paths';
	import { PALETTE, app, totalsByProject } from '#lib/app.svelte.js';
	import { formatDuration } from '#lib/format.js';

	let editing = $state<{ id: string | null; name: string; color: string } | null>(null);
	let deleting = $state<string | null>(null);

	const logged = $derived(totalsByProject(app.sessions));

	function openNew() {
		editing = { id: null, name: '', color: PALETTE[app.projects.length % PALETTE.length] };
		deleting = null;
	}

	function save(ev: SubmitEvent) {
		ev.preventDefault();
		if (!editing) return;
		const name = editing.name.trim();
		if (!name) return;
		app.saveProject({ ...editing, name });
		editing = null;
	}
</script>

<div class="screen">
	<header>
		<div class="heading">
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
			<h1>Projects</h1>
		</div>
		<button class="btn btn-primary new" onclick={openNew}>
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg
			>New
		</button>
	</header>

	{#if editing}
		<form class="editor" onsubmit={save}>
			<div class="eyebrow">{editing.id === null ? 'New project' : 'Edit project'}</div>
			<label class="name">
				Name
				<!-- the form opens on an explicit click, so focus belongs in its first field -->
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="field"
					bind:value={editing.name}
					placeholder="Website redesign"
					maxlength="200"
					autofocus
				/>
			</label>
			<div class="colors">
				<span class="colors-label">Color</span>
				<div class="swatches">
					{#each PALETTE as c (c)}
						<button
							type="button"
							class="swatch"
							class:active={editing.color === c}
							style:background={c}
							onclick={() => editing && (editing.color = c)}
							aria-label="Pick color {c}"
							aria-pressed={editing.color === c}
						></button>
					{/each}
					<label
						class="swatch custom"
						class:active={!PALETTE.includes(editing.color)}
						title="Custom color"
					>
						<span class="custom-dot" style:background={editing.color}></span>
						<input type="color" bind:value={editing.color} aria-label="Custom color" />
					</label>
					<span class="hex">{editing.color}</span>
				</div>
			</div>
			<div class="form-actions">
				<button type="button" class="btn btn-ghost" onclick={() => (editing = null)}>Cancel</button>
				<button type="submit" class="btn btn-primary">Save</button>
			</div>
		</form>
	{/if}

	<div class="list">
		{#each app.projects as p (p.id)}
			<div class="row">
				<span class="swatch-dot" style:background={p.color}></span>
				<div class="info">
					<span class="row-name">{p.name}</span>
					<span class="logged">
						{logged[p.id] ? formatDuration(logged[p.id]) + ' logged' : 'Nothing logged yet'}
					</span>
				</div>
				{#if deleting === p.id}
					<div class="confirm">
						<span>Delete this project?</span>
						<button class="btn btn-ghost small" onclick={() => (deleting = null)}>Keep</button>
						<button
							class="btn small danger"
							onclick={() => {
								app.deleteProject(p.id);
								deleting = null;
							}}>Delete</button
						>
					</div>
				{:else}
					<div class="row-actions">
						<button
							class="row-btn"
							onclick={() => {
								editing = { ...p };
								deleting = null;
							}}
							aria-label="Edit {p.name}"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="1.6"
								stroke-linecap="round"
								stroke-linejoin="round"
								><path d="M4 20h4l10-10-4-4L4 16v4z"></path><path d="M12.5 7.5l4 4"></path></svg
							>
						</button>
						<button
							class="row-btn delete"
							onclick={() => {
								deleting = p.id;
								editing = null;
							}}
							aria-label="Delete {p.name}"
						>
							<svg
								width="16"
								height="16"
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
			</div>
		{:else}
			<div class="empty">No projects yet. Create one to start timing.</div>
		{/each}
	</div>
</div>

<style>
	.screen {
		min-height: 100dvh;
		padding: clamp(16px, 3vw, 32px);
		display: flex;
		flex-direction: column;
		gap: 32px;
		max-width: 720px;
		margin: 0 auto;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.heading {
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

	.new {
		padding: 0 18px 0 14px;
		height: 44px;
	}

	.editor {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 20px;
		border-radius: 16px;
		border: 1px solid var(--line);
		background: var(--bg2);
	}

	.name {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		color: var(--fg2);
	}

	.colors {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.colors-label {
		font-size: 13px;
		color: var(--fg2);
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
	}

	.swatch {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		border: none;
		padding: 0;
		cursor: pointer;
		outline: 2px solid transparent;
		outline-offset: 3px;
	}

	.swatch.active {
		outline-color: var(--fg);
	}

	.custom {
		position: relative;
		background: conic-gradient(
			#e0784a,
			#d9a93a,
			#3fa66f,
			#3aa6a6,
			#4f7fd9,
			#8a6ad6,
			#c45fb0,
			#e0784a
		);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.custom-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 2px solid var(--bg2);
	}

	.custom input {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.hex {
		font-family: var(--mono);
		font-size: 12px;
		color: var(--fg3);
		margin-left: 4px;
	}

	.form-actions {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		flex-wrap: wrap;
	}

	.list {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line);
	}

	.row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 14px 4px;
		border-bottom: 1px solid var(--line);
		flex-wrap: wrap;
	}

	.swatch-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-left: 6px;
	}

	.info {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 120px;
	}

	.row-name {
		font-weight: 500;
	}

	.logged {
		font-size: 13px;
		color: var(--fg2);
	}

	.confirm {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 13px;
		color: var(--fg2);
	}

	.small {
		padding: 0 14px;
		min-height: 40px;
		height: 40px;
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

	.row-actions {
		display: flex;
		gap: 6px;
	}

	.row-btn {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--fg2);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.row-btn:hover {
		color: var(--fg);
		border-color: var(--line);
	}

	.row-btn.delete:hover {
		color: var(--danger);
	}

	.empty {
		padding: 40px 0;
		text-align: center;
		color: var(--fg2);
	}
</style>
