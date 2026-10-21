<script lang="ts">
	import { FirebaseError } from 'firebase/app';
	import { app } from '#lib/app.svelte.js';

	// With email enumeration protection on, Firebase reports a wrong password and an unknown
	// email alike as `auth/invalid-credential`; without it, they get codes of their own.
	const ERRORS: Record<string, string> = {
		'auth/invalid-credential': 'Incorrect email or password.',
		'auth/wrong-password': 'Incorrect email or password.',
		'auth/user-not-found': 'Incorrect email or password.',
		'auth/invalid-email': 'Enter a valid email address.',
		'auth/user-disabled': 'This account has been disabled.',
		'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
		'auth/network-request-failed': 'Could not reach the server. Check your connection.'
	};

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(ev: SubmitEvent) {
		ev.preventDefault();
		error = '';
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			error = 'Enter a valid email address.';
			return;
		}
		if (!password) {
			error = 'Enter your password.';
			return;
		}
		busy = true;
		try {
			await app.signIn(email, password);
		} catch (err) {
			error =
				(err instanceof FirebaseError && ERRORS[err.code]) ||
				'Something went wrong. Please try again.';
		} finally {
			busy = false;
		}
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
		<button type="submit" class="btn btn-primary" disabled={busy}>Continue</button>
		<p class="note">HumiFocus is invite-only. Ask the owner for an account.</p>
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

	.btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.note {
		margin: -12px 0 0;
		font-size: 13px;
		color: var(--fg2);
	}
</style>
