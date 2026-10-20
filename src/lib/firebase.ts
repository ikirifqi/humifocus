import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
	initializeFirestore,
	persistentLocalCache,
	persistentMultipleTabManager
} from 'firebase/firestore';

// Web config identifies the project to the client SDK; it is not a secret. Access to
// data is enforced by the security rules in `firestore.rules`.
const firebaseConfig = {
	apiKey: 'AIzaSyCw0tpmjdGoeSVUYPst4r98bsGz4An-UdU',
	authDomain: 'shinobi-rengo.firebaseapp.com',
	projectId: 'shinobi-rengo',
	storageBucket: 'shinobi-rengo.firebasestorage.app',
	messagingSenderId: '813679180633',
	appId: '1:813679180633:web:9cf9b620015f642e2aea48'
};

export const firebase = initializeApp(firebaseConfig);

export const auth = getAuth(firebase);

// Cache documents in IndexedDB so the app starts from local data, works offline, and
// queues writes until the network returns. Open tabs share the one cache.
export const db = initializeFirestore(firebase, {
	localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
