# Enabling two-device multiplayer (Firebase)

NeshBesh's "Create Room" / "Join with code" flow is fully implemented in code.
It just needs a shared real-time backend so two devices can see the same room.
Without it the app silently falls back to **local-only mode** (rooms live in an
in-memory map inside a single tab), which is why "Create Room" appears to do
nothing useful and only one-board hotseat works.

The backend is **Firebase Realtime Database**. Follow these one-time steps.

## 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> → **Add project** (a free Spark
   plan is enough).
2. In the project, open **Build → Realtime Database → Create database**.
   - Pick a location (US, EU, or Asia).
   - Start in **test mode** for now (we tighten rules in step 4).
3. Register a **Web app**: Project settings (⚙ top-left) → **Your apps** →
   the `</>` (Web) icon → give it a nickname → **Register app**.
4. Copy the `firebaseConfig` object shown — you'll need these seven values.

## 2. Fill in credentials

### Local development
Copy `.env.example` to `.env` in this folder and paste the values:

```
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123
```

> `EXPO_PUBLIC_DATABASE_URL` is **required** — this app uses Realtime Database,
> not Firestore. If the Firebase config didn't include `databaseURL`, you
> skipped step 1.2; create the Realtime Database and copy its URL.

Restart the Expo dev server after editing `.env` (Metro only reads env on boot).

### Deployed web app (Vercel)
Add the **same seven keys** in
Vercel → Project → **Settings → Environment Variables** (Production + Preview),
then redeploy. Vercel runs `expo export` on each build, so the values get
inlined into the bundle at deploy time.

## 3. Verify

`isFirebaseConfigured` in `src/config/firebase.ts` flips to `true` once all of
apiKey / databaseURL / projectId / appId are present. When it's `true`:
- the orange "⚠️ משחק מרחוק כבוי" banner disappears from the lobby, and
- "Create Room" creates a room in the database that a second device can join by
  code or invite link.

Quick smoke test: open the app in two browser tabs (or two devices), create a
room in one, and join with the code in the other — the host lobby should flip to
"שני השחקנים מחוברים!".

## 4. Lock down the database rules

Test mode leaves the database world-writable and auto-expires. Replace the rules
with the contents of `firebase-database-rules.json` (console → Realtime Database
→ **Rules** tab → paste → **Publish**). Those rules scope read/write to
`/rooms/$roomId` and validate the room shape, which is appropriate for an
anonymous, code-gated party game with no user accounts.
