import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_APP_ID,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET
} from '$app/env/public';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager
} from 'firebase/firestore';

// Web config identifies the project to the client SDK; it is not a secret. Access to
// data is enforced by the security rules in `firestore.rules`. The values come from `.env`
// locally and from repository variables in GitHub Actions; see `.env.example`.
const firebaseConfig = {
	apiKey: PUBLIC_FIREBASE_API_KEY,
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN,
	projectId: PUBLIC_FIREBASE_PROJECT_ID,
	storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	appId: PUBLIC_FIREBASE_APP_ID
};

export const firebase = initializeApp(firebaseConfig);

export const auth = getAuth(firebase);

// Cache documents in IndexedDB so the app starts from local data, works offline, and
// queues writes until the network returns. Open tabs share the one cache.
export const db = initializeFirestore(firebase, {
	localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
