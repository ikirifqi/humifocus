<script lang="ts">
	import { FirebaseError } from 'firebase/app';
	import { app } from '#lib/app.svelte.js';

	type Mode = 'sign-in' | 'sign-up' | 'reset';

	const TITLES: Record<Mode, string> = {
		'sign-in': 'Sign in',
		'sign-up': 'Create account',
		reset: 'Reset password'
	};

	const SUBMIT: Record<Mode, string> = {
		'sign-in': 'Continue',
		'sign-up': 'Create account',
		reset: 'Send reset link'
	};

	// With email enumeration protection on, Firebase reports a wrong password and an unknown
	// email alike as `auth/invalid-credential`; without it, they get codes of their own.
	const ERRORS: Record<string, string> = {
		'auth/invalid-credential': 'Incorrect email or password.',
		'auth/wrong-password': 'Incorrect email or password.',
		'auth/user-not-found': 'Incorrect email or password.',
		'auth/invalid-email': 'Enter a valid email address.',
		'auth/email-already-in-use': 'An account with this email already exists.',
		'auth/weak-password': 'Password must be at least 6 characters.',
		'auth/user-disabled': 'This account has been disabled.',
		'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
		'auth/network-request-failed': 'Could not reach the server. Check your connection.'
	};

	let mode = $state<Mode>('sign-in');
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let info = $state('');
	let busy = $state(false);

	function switchTo(next: Mode) {
		mode = next;
		error = '';
		info = '';
	}

	async function submit(ev: SubmitEvent) {
		ev.preventDefault();
		error = '';
		info = '';
		if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			error = 'Enter a valid email address.';
			return;
		}
		if (mode !== 'reset' && password.length < 6) {
			error = 'Password must be at least 6 characters.';
			return;
		}
		busy = true;
		try {
			if (mode === 'sign-in') await app.signIn(email, password);
			else if (mode === 'sign-up') await app.signUp(email, password);
			else {
				await app.resetPassword(email);
				info = 'If an account exists for this email, a reset link is on its way.';
			}
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
			<h1>{TITLES[mode]}</h1>
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
			{#if mode !== 'reset'}
				<label>
					Password
					<input
						class="field"
						type="password"
						bind:value={password}
						placeholder="••••••••"
						autocomplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
					/>
				</label>
			{/if}
			{#if error}
				<div class="error" role="alert">{error}</div>
			{/if}
			{#if info}
				<div class="info" role="status">{info}</div>
			{/if}
		</div>
		<button type="submit" class="btn btn-primary" disabled={busy}>{SUBMIT[mode]}</button>
		<div class="links">
			{#if mode === 'sign-in'}
				<button type="button" class="link" onclick={() => switchTo('sign-up')}>
					Create an account
				</button>
				<button type="button" class="link" onclick={() => switchTo('reset')}>
					Forgot password?
				</button>
			{:else}
				<button type="button" class="link" onclick={() => switchTo('sign-in')}>
					Back to sign in
				</button>
			{/if}
		</div>
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

	.info {
		font-size: 13px;
		color: var(--fg2);
	}

	.btn {
		min-height: 48px;
		font-size: 15px;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.links {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin-top: -12px;
	}

	.link {
		padding: 4px 0;
		border: none;
		background: none;
		color: var(--fg2);
		font-size: 13px;
		cursor: pointer;
	}

	.link:hover {
		color: var(--accent);
	}
</style>
