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

const env = (process.env as Record<string, string | undefined>);

const firebaseConfig = {
  apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  databaseURL: env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? '',
  projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
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
