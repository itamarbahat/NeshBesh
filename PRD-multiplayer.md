# PRD: Remote Multiplayer Sync & Two-Device Layout

## Introduction
NeshBesh currently supports a single-device hotseat mode with a fully mirrored UI (top player rotated 180°) and a Firebase-backed remote mode whose only join paths are an in-person QR scan or a typed 6-char room code. We want remote play to work between players who are nowhere near each other (no QR, no proximity), and we want the remote two-device experience to use a normal, non-mirrored layout where each player's controls live below the board.

This PRD covers (a) introducing a shareable deep-link join flow, (b) preserving the QR scan as a hidden fallback, and (c) splitting the in-game layout into two distinct modes: **Local (mirrored, current behavior)** and **Remote (non-mirrored, bottom-anchored controls)**.

## Goals
- Players can start a remote game by sending a single tap-to-join link via WhatsApp / SMS / email.
- Local hotseat play keeps its existing mirrored UI byte-for-byte.
- Remote play uses a non-mirrored layout: my controls and dice anchored at the bottom, opponent shown as a small status chip at the top with no dice panel.
- QR scan join remains available but is demoted to a secondary "More options" entry.
- Manual 6-char code entry is preserved as a typed fallback.

## User Stories

### US-001: Add `gameMode` discriminator to multiplayer store
**Description:** As an engineer, I want a single source of truth for whether the current session is local or remote so that downstream UI can branch cleanly.

**Acceptance Criteria:**
- [ ] Add `gameMode: 'local' | 'remote'` to `useMultiplayerStore` initial state (defaults to `'local'`)
- [ ] `startLocalGame()` sets `gameMode = 'local'`
- [ ] `hostRoom()` and `joinExistingRoom()` set `gameMode = 'remote'`
- [ ] `resetToLobby()` resets `gameMode` back to `'local'`
- [ ] Typecheck passes

### US-002: Configure Expo deep link scheme
**Description:** As a player, I want the app to register a URL scheme so tapping a join link opens the app.

**Acceptance Criteria:**
- [ ] Add `"scheme": "neshbesh"` to `neshbesh-app/app.json`
- [ ] Add iOS `associatedDomains` placeholder entry for `applinks:neshbesh.app`
- [ ] Add Android `intentFilters` for `https://neshbesh.app/join/*` and `neshbesh://join/*`
- [ ] Install `expo-linking` if not already a dependency
- [ ] Typecheck passes

### US-003: Add `getShareUrl(roomId)` helper
**Description:** As an engineer, I want a single helper that returns the canonical join URL so host UI and any future invite surfaces stay in sync.

**Acceptance Criteria:**
- [ ] Add `getShareUrl(roomId: string): string` to `src/services/multiplayerService.ts`
- [ ] Returns `https://neshbesh.app/join/{roomId}` (constant base URL kept in one place)
- [ ] Add unit-style assertion in `scripts/debug.ts` that the function returns the expected string for a sample id
- [ ] Typecheck passes

### US-004: Show share button on host waiting screen
**Description:** As a host, I want a "Share Invite" button that opens the OS share sheet pre-filled with the join link so I can send it through any messaging app.

**Acceptance Criteria:**
- [ ] In `LobbyScreen.tsx`, host-waiting view shows a `Share Invite` button
- [ ] Button calls `Share.share({ message, url })` from `react-native` with the `getShareUrl(roomId)` value
- [ ] The room's 6-char code is also displayed below the button as a copy-able text fallback
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-005: Handle incoming deep links
**Description:** As a guest, I want tapping a join link to drop me directly into the room, prompting only for my display name.

**Acceptance Criteria:**
- [ ] App-level `useURL()` listener parses `*/join/:code`
- [ ] On match, navigate to lobby in a "join pending" state with the code prefilled
- [ ] If the user already has `playerName` set, auto-call `joinExistingRoom(code)`
- [ ] If no name set, focus the name input and join on submit
- [ ] Cold-start (app launched from link) and warm-start both work
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-006: Add manual "Join with Code" input
**Description:** As a guest without a deep link, I want to type the 6-char code into a visible field on the lobby screen.

**Acceptance Criteria:**
- [ ] Lobby join section shows a `TextInput` for the 6-char code (uppercase auto-format, max length 6)
- [ ] A `Join` button calls `joinExistingRoom(code.toUpperCase())`
- [ ] Existing error toast/alert reused on failure
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-007: Demote QR scan to "More options"
**Description:** As a player, I want the QR scanner accessible but no longer the primary join path, since it is rarely useful for remote players.

**Acceptance Criteria:**
- [ ] Remove the prominent "Scan QR" button from the lobby's main join area
- [ ] Add a small `More join options ▾` link/disclosure that, when tapped, reveals the QR scan button
- [ ] No code path that handles QR results is removed; only the entry point is moved
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-008: Build `RemoteBottomBar` component
**Description:** As a remote player, I want my dice, status text, and end-turn control anchored at the bottom of the screen with no rotation.

**Acceptance Criteria:**
- [ ] New component `src/components/RemoteBottomBar.tsx`
- [ ] Renders dice panel + status text + conditional `End Turn` button (reuses the same `noLegalMoves` derivation used by `PlayerDiceBar`)
- [ ] No `transform: rotate(180deg)` ever applied
- [ ] Reads from `useGameStore` directly; no prop bloat
- [ ] Component renders without crashing in isolation
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-009: Build `OpponentHeaderChip` component
**Description:** As a remote player, I want a small chip at the top of the screen showing my opponent's name, score, and a subtle "rolling…" indicator — but never their dice values.

**Acceptance Criteria:**
- [ ] New component `src/components/OpponentHeaderChip.tsx`
- [ ] Shows opponent display name + bear-off count
- [ ] Shows a pulsing "Rolling…" label when `currentPlayer === opponentSign && phase === 'WAITING_ROLL'`
- [ ] Shows "Thinking…" when opponent is in `MOVING` phase
- [ ] No `DicePanel`, no rotation
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-010: Branch App layout on `gameMode`
**Description:** As an engineer, I want `App.tsx` to render either the existing mirrored layout or the new bottom-anchored remote layout based on `gameMode`.

**Acceptance Criteria:**
- [ ] In `App.tsx`, when `gameMode === 'remote'`: render `<OpponentHeaderChip />` above board, `<RemoteBottomBar />` below board
- [ ] When `gameMode === 'local'`: existing `PlayerDiceBar` (top + bottom mirrored) layout is unchanged
- [ ] Landscape orientation in remote mode also uses the bottom-anchored layout (single bar below board, chip above)
- [ ] No regressions in local hotseat — diff `PlayerDiceBar` rendering paths and confirm zero changes
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-011: Smoke test both modes side-by-side
**Description:** As QA, I want a documented manual test sequence so we can verify local mode is bit-identical and remote mode shows the new layout.

**Acceptance Criteria:**
- [ ] Add a `## Manual Test Plan` section to `progress.txt` with two checklists: Local Hotseat and Remote Two-Device
- [ ] Local checklist verifies: mirrored top bar, mirrored special-roll cards, opening-roll overlay
- [ ] Remote checklist verifies: bottom bar only, opponent chip at top, no rotation anywhere, "Rolling…" indicator visible to non-rolling player
- [ ] Typecheck passes
- [ ] Verify changes work in browser

## Non-Goals
- Account system / friends list / persistent player identity (deferred).
- Server-authoritative game logic (host remains authoritative; same model as today).
- Spectator mode for a third connected device.
- Reconnect / resume after disconnect mid-game (existing behavior preserved as-is).
- Translating the share link's metadata for messaging-app preview cards (no Open Graph image work in this PRD).
- Removing the QR scan code path — it stays, just demoted.

## Technical Notes
- Reuse existing `useMultiplayerStore` Zustand patterns; do not introduce a new state library.
- Deep link parsing should sit at App level (not inside `LobbyScreen`) so cold-start links are caught before any screen routing decision.
- `Share.share` is part of `react-native` core; no new dependency required for US-004.
- `RemoteBottomBar` and `OpponentHeaderChip` should reuse existing style tokens from `App.tsx` (colors, font sizes) to preserve aesthetic continuity.
- Host stays authoritative — guest still routes actions through `sendGuestAction`. Layout changes are presentational only.
