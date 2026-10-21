import { defineEnvVars } from '@sveltejs/kit/env';
import type { FirebaseOptions } from 'firebase/app';

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;

export const variables = defineEnvVars({
	// Firebase web app config as JSON, inlined into the client bundle at build time. Set it in
	// `.env` locally (see `.env.example`) and as a repository variable in GitHub Actions.
	PUBLIC_FIREBASE_CONFIG: {
		public: true,
		static: true,
		description: 'Firebase web app config as JSON, such as `{"apiKey": "...", ...}`',
		schema: (value): FirebaseOptions => {
			if (value === undefined) throw new Error('must be set; see .env.example');
			// Empty in CI when the repository variable is unset, so forks can still lint and
			// build. The deploy workflow refuses to release without it.
			if (!value) return {};
			let config: unknown;
			try {
				config = JSON.parse(value);
			} catch {
				throw new Error('must be valid JSON, with the keys in double quotes');
			}
			if (typeof config !== 'object' || config === null || Array.isArray(config)) {
				throw new Error('must be a JSON object');
			}
			const missing = REQUIRED.filter(
				(key) => typeof (config as Record<string, unknown>)[key] !== 'string'
			);
			if (missing.length) throw new Error(`is missing ${missing.join(', ')}`);
			return config as FirebaseOptions;
		}
	}
});
