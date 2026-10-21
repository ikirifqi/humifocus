import { defineEnvVars } from '@sveltejs/kit/env';

// Firebase web app config, inlined into the client bundle at build time. Set these in `.env`
// locally (see `.env.example`) and as repository variables in GitHub Actions.
const firebase = { public: true, static: true } as const;

export const variables = defineEnvVars({
	PUBLIC_FIREBASE_API_KEY: { ...firebase, description: 'Firebase web config `apiKey`' },
	PUBLIC_FIREBASE_AUTH_DOMAIN: { ...firebase, description: 'Firebase web config `authDomain`' },
	PUBLIC_FIREBASE_PROJECT_ID: { ...firebase, description: 'Firebase web config `projectId`' },
	PUBLIC_FIREBASE_STORAGE_BUCKET: {
		...firebase,
		description: 'Firebase web config `storageBucket`'
	},
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: {
		...firebase,
		description: 'Firebase web config `messagingSenderId`'
	},
	PUBLIC_FIREBASE_APP_ID: { ...firebase, description: 'Firebase web config `appId`' }
});
