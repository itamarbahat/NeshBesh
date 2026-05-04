// ── Firebase Configuration ──────────────────────────────────────────────────
// Real credentials must come from environment variables (EXPO_PUBLIC_FIREBASE_*)
// On Vercel: Project Settings → Environment Variables → add each EXPO_PUBLIC_FIREBASE_*
// For local dev: create `neshbesh-app/.env` with the same keys.
//
// Without valid env vars the app falls back to LOCAL-ONLY mode: hotseat works,
// but cross-device multiplayer is disabled (rooms live in an in-memory map per
// tab, so devices can't see each other's rooms).

import { initializeApp, getApps } from 'firebase/app';
import { getDatabase, Database } from 'firebase/database';

// IMPORTANT: every EXPO_PUBLIC_* must be referenced via *direct* process.env
// access. Babel/Expo's transformer inlines the value at build time only when
// the access is statically traceable (process.env.FOO). Aliasing through a
// variable (const env = process.env; env.FOO) defeats the inlining and the
// values are empty at runtime in the browser bundle.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

// A "real" value is non-empty, longer than a placeholder ellipsis, and doesn't
// start with the obvious placeholder prefixes we've seen in past configs.
const isReal = (v: string): boolean => {
  if (!v) return false;
  const trimmed = v.trim();
  if (trimmed.length < 8) return false;
  if (trimmed.includes('...')) return false;
  if (trimmed.startsWith('YOUR_')) return false;
  return true;
};

/** True only when EVERY required Firebase field looks like a real credential */
export const isFirebaseConfigured =
  isReal(firebaseConfig.apiKey) &&
  isReal(firebaseConfig.databaseURL) &&
  isReal(firebaseConfig.projectId) &&
  isReal(firebaseConfig.appId);

let db: Database | null = null;

if (isFirebaseConfigured) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getDatabase(app);
  } catch (err) {
    console.warn('[firebase] init failed, falling back to local-only mode:', err);
    db = null;
  }
} else {
  console.warn(
    '[firebase] EXPO_PUBLIC_FIREBASE_* env vars not set — cross-device multiplayer disabled.\n' +
    '  Set them in Vercel (or in neshbesh-app/.env locally) to enable remote play.'
  );
}

export { db };
