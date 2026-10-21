import { PUBLIC_FIREBASE_CONFIG } from '$app/env/public';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager
} from 'firebase/firestore';

// Web config identifies the project to the client SDK; it is not a secret. Access to
// data is enforced by the security rules in `firestore.rules`. The config comes from `.env`
// locally and from a repository variable in GitHub Actions; see `.env.example`.
export const firebase = initializeApp(PUBLIC_FIREBASE_CONFIG);

export const auth = getAuth(firebase);

// Cache documents in IndexedDB so the app starts from local data, works offline, and
// queues writes until the network returns. Open tabs share the one cache.
export const db = initializeFirestore(firebase, {
	localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
