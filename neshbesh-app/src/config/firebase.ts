// ── Firebase Configuration ──────────────────────────────────────────────────
// Setup instructions:
// 1. Go to https://console.firebase.google.com
// 2. Create a new project (or use existing)
// 3. Enable Realtime Database (Build → Realtime Database → Create Database)
// 4. Set rules to: { "rules": { ".read": true, ".write": true } } for dev
// 5. Copy your web app config below (Project Settings → General → Your apps → Web)

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIza...',
  authDomain: 'neshbesh-8eede.firebaseapp.com',
  databaseURL: 'https://neshbesh-8eede-default-rtdb.firebaseio.com',
  projectId: 'neshbesh-8eede',
  storageBucket: 'neshbesh-8eede.appspot.com',
  messagingSenderId: '...',
  appId: '...',
};

/** True when real Firebase credentials have been provided */
export const isFirebaseConfigured =
  !firebaseConfig.apiKey.startsWith('YOUR_') &&
  !firebaseConfig.projectId.startsWith('YOUR_');

let db: Database | null = null;

if (isFirebaseConfigured) {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  db = getDatabase(app);
}

export { db };
