<script lang="ts">
	import { app } from '#lib/app.svelte.js';

	let email = $state('');
	let password = $state('');
	let error = $state('');

	function submit(ev: SubmitEvent) {
		ev.preventDefault();
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			error = 'Enter a valid email address.';
			return;
		}
		if (password.length < 4) {
			error = 'Password must be at least 4 characters.';
			return;
		}
		app.signIn(email);
	}
</script>

<div class="screen">
	<form onsubmit={submit} novalidate>
		<div class="title">
			<div class="brand">
				<span class="dot"></span>
				<span>Focus</span>
			</div>
			<h1>Sign in</h1>
		</div>
		<div class="fields">
			<label>
				Email
				<input
					class="field"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
					autocomplete="username"
				/>
			</label>
			<label>
				Password
				<input
					class="field"
					type="password"
					bind:value={password}
					placeholder="••••••••"
					autocomplete="current-password"
				/>
			</label>
			{#if error}
				<div class="error" role="alert">{error}</div>
			{/if}
		</div>
		<button type="submit" class="btn btn-primary">Continue</button>
	</form>
</div>

<style>
	.screen {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px;
	}

	form {
		width: 100%;
		max-width: 360px;
		display: flex;
		flex-direction: column;
		gap: 28px;
	}

	.title {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		font-size: 12px;
		color: var(--fg2);
	}

	.brand .dot {
		background: var(--accent);
	}

	h1 {
		margin: 0;
		font-weight: 400;
		font-size: 28px;
		letter-spacing: -0.01em;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		color: var(--fg2);
	}

	.field {
		padding: 13px 14px;
		background: var(--bg2);
	}

	.error {
		font-size: 13px;
		color: var(--danger);
	}

	.btn {
		min-height: 48px;
		font-size: 15px;
	}
</style>
