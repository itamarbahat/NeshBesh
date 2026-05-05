# PRD: NeshBesh — UI Performance, Dice Physics, Audio & Static Board

**Release window:** 2026-06-10
**Scope tag:** `perf-physics-audio`

## Introduction

The June 10 release targets four interlocking quality gaps:

1. **Tap-to-select lag** — a recent regression has dropped board interaction below 60 fps on the Click-1 / Click-2 hot path.
2. **Dice physics correctness** — dice currently overshoot the playable area, sometimes obscure the remaining-pip indicators in the dice box, and can miss an animation budget.
3. **Audio realism** — the placeholder dice SFX needs to be replaced with a layered, per-die staggered set (roll / land / dice-on-dice collision / bear-off). The reference recording will be provided separately.
4. **Static board layout** — in both local hotseat and remote two-device modes, the board's screen position drifts vertically as surrounding chrome reflows between turns. The board must remain visually pinned to screen center.

This PRD is dependency-ordered: investigation → perf fix → layout → physics → audio plumbing → asset swap → verification. Each story fits one Ralph iteration and ends with `Typecheck passes` (plus browser/device verification when UI is touched).

## Goals

- Restore **60 fps** on Click-1 piece selection across iOS, Android (incl. low-end), and web. Identify and fix the recent regression.
- Pin the board to screen center in both `gameMode === 'local'` and `gameMode === 'remote'` — surrounding chrome must reflow or overlay without translating the board.
- Cap every dice animation at **3 seconds** wall-clock from release to fully-at-rest, with a hard snap-to-final-pose if the physics solver overruns.
- Make dice **bounce elastically** off board / dice-box walls and **collide with each other**.
- Guarantee dice **never settle on top of the move-pip indicators** rendered inside the dice box.
- Trigger SFX **per-die, staggered**, for the four event types: roll, land, dice-on-dice collision, bear-off. Audio API must accept the new layered reference recording when it arrives.
- All deliverables ship by **2026-06-10**.

## User Stories

> Sequence rule: every story below depends only on stories with a lower US-### number.

---

### US-001: Identify the tap-to-select performance regression

**Description:** As the maintainer, I want a written, reproducible diagnosis of the Click-1 lag so the fix in US-002 has a concrete target.

**Acceptance Criteria:**
- [ ] Reproduce the lag on a release build by tapping a piece on a mid-game board (≥10 checkers placed) and capturing a frame timeline (Reanimated trace, React DevTools profiler, or platform tooling).
- [ ] Identify the offending commit by `git bisect` or by inspection of the post-`5fe6a8d` history (the PRD-engine-rules / PRD-dice-polish merges are the leading suspects per `progress.txt`).
- [ ] Pinpoint the hot path: a specific function in `engine/index.ts`, a specific selector in a Zustand store, or a specific effect in a React component. Record file path + line range.
- [ ] Write findings into `progress.txt` under a new `### US-001 — regression diagnosis` block: commit SHA, hot path, frame budget exceeded by how many ms.
- [ ] Typecheck passes (no code change expected, but run it to baseline).

---

### US-002: Fix the tap-to-select regression

**Description:** As a player, I want Click-1 selection to feel instantaneous so the touched-moved rule does not feel punishing.

**Acceptance Criteria:**
- [ ] Implement the targeted fix from US-001 (revert offending change, narrow a selector, memoize a computed value, defer a side effect, etc.).
- [ ] On the same mid-game repro from US-001, the Click-1 frame budget is **≤16.7 ms (60 fps)** on a baseline iPhone 12 / Pixel 6 class device.
- [ ] No visual regression on Board, Piece, Slot, or any highlight (blue/green) rendering.
- [ ] Move-cache (`resetMoveCache` per `progress.txt` US-015) remains correct: stale paths never appear after `applyMove`, `endTurnImpl`, or a Nesh Strike free move.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-003: Narrow remaining full-state subscriptions

**Description:** As a developer, I want the three components flagged in `progress.txt` US-016 (`ThrowingDiceOverlay`, `OpponentHeaderChip`, `RemoteBottomBar`) to subscribe via narrowed selectors so unrelated store updates stop re-rendering them.

**Acceptance Criteria:**
- [ ] `ThrowingDiceOverlay` no longer reads the full `useGameStore` state; it subscribes only to the fields it renders (dice list, phase, throw token).
- [ ] `OpponentHeaderChip` subscribes only to opponent name, opponent bear-off count, and the boolean `phase === 'WAITING_ROLL'` / `phase === 'MOVING'` it shows.
- [ ] `RemoteBottomBar` subscribes only to my dice, my status, and the End-Turn enabled boolean.
- [ ] Each component still updates on every relevant state change (manual smoke test: roll, move, capture, bear-off, end-turn).
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-004: Static-board container — local hotseat

**Description:** As a player on one device, I want the board to stay pinned at screen center across turn transitions so my eyes don't have to re-find it.

**Acceptance Criteria:**
- [ ] In `App.tsx`'s `gameMode === 'local'` branch, the board container has a fixed centered position (no flex re-distribution that translates it during turn switch).
- [ ] When the special-roll card / `PlayerDiceBar` swaps sides between White's turn and Black's turn, the board's top-left coordinate (in screen pixels) does not change by more than 1 px.
- [ ] `PlayerDiceBar` (top, rotated 180°) and the bottom `PlayerDiceBar` continue to render in their existing positions; if space conflicts, the dice bar overlays rather than displacing the board.
- [ ] Special-roll cards continue to mirror toward the active player per CLAUDE.md §3.
- [ ] Typecheck passes
- [ ] Verify changes work in browser (and on a phone-form-factor device)

---

### US-005: Static-board container — remote two-device

**Description:** As a remote player, I want the board pinned at screen center even as `OpponentHeaderChip` swaps state ("Rolling…" / "Thinking…") and `RemoteBottomBar` content changes.

**Acceptance Criteria:**
- [ ] In `App.tsx`'s `gameMode === 'remote'` branch, the board container has a fixed centered position; chrome size changes do not translate the board.
- [ ] `OpponentHeaderChip` and `RemoteBottomBar` overlay or sit in fixed-height regions; their text-length changes do not displace the board vertically.
- [ ] No rotation is applied anywhere (CLAUDE.md §3 invariant preserved).
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-006: Static-board verification — chrome reflow audit

**Description:** As QA, I want a documented audit confirming that every UI chrome change (dice panel size, special-roll card appearance, opponent chip text change, end-turn button appearance) does not nudge the board.

**Acceptance Criteria:**
- [ ] Manual checklist appended to `progress.txt` covering: White→Black turn switch (local), Black→White turn switch (local), opponent transitions Rolling→Thinking→Idle (remote), End-Turn button appearance (remote), special-roll card open/close (both modes), Hotseat opening-roll overlay open/close.
- [ ] Each row records the board's measured top-left in two states; delta must be 0 px.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-007: Dice physics — elastic wall bounce

**Description:** As a player, I want dice to bounce off the board / dice-box edges instead of escaping the play area.

**Acceptance Criteria:**
- [ ] In the dice physics module (`ThrowingDiceOverlay` per `progress.txt` and `diceConstants.ts`), board / dice-box edges are modeled as elastic walls with restitution > 0 (chosen empirically to match a real dice feel).
- [ ] Across 50 simulated rolls (RNG seed varied) no die's center exits the play-area rect at any frame.
- [ ] Existing landing-rect logic (`pickLandingPoint` / `pickPairLandingPoints` in `diceConstants.ts`) still produces final rest poses inside the playable surface.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-008: Dice physics — dice-on-dice collision

**Description:** As a player, I want the two dice to collide with each other for visual realism instead of passing through.

**Acceptance Criteria:**
- [ ] The two dice in `ThrowingDiceOverlay` are modeled as colliding bodies (spheres or AABBs sized to the die) with elastic collision response.
- [ ] In a roll where both dice are launched toward the same landing target, they visibly bounce off each other and settle apart.
- [ ] Final rest poses still respect the no-overlap-with-checker-column rule from `boardConstants.getOccupancyRects` (PRD-dice-polish acceptance preserved).
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-009: Dice physics — 3-second settle cap

**Description:** As a player, I want the dice animation to never feel sluggish — it must conclude within 3 seconds.

**Acceptance Criteria:**
- [ ] Physics damping / friction constants in `diceConstants.ts` are tuned so that across 100 simulated rolls, the 99th-percentile settle time is ≤3000 ms.
- [ ] A hard cap exists: at exactly 3000 ms after release, if any die is still in motion, it snaps to its final rest pose (computed by the existing `pickLandingPoint` / `pickPairLandingPoints`) with a brief fade or pop, and the audio shake handle stops cleanly.
- [ ] `getRollDurationMs` continues to vary roll length between min and max within `[ROLL_DURATION_MIN_MS, 3000]`.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-010: Dice physics — occlusion guard for move-pip indicators

**Description:** As a player, I want to always see how many moves I have left, so dice must never settle on top of the pip indicators in the dice box.

**Acceptance Criteria:**
- [ ] The move-pip indicator region is added to `boardConstants.getOccupancyRects` (or an equivalent forbidden-rect collection) so the dice landing solver treats it as a forbidden zone.
- [ ] Across 100 simulated rolls (with a full set of unused dice rendered), no die's resting AABB intersects the pip-indicator rect.
- [ ] If physics drives a die into the forbidden rect, the snap-to-final-pose logic from US-009 relocates it to the nearest legal landing point.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-011: Audio API — per-die staggered event surface

**Description:** As `useAudioManager`, I want a clean per-die API surface so the upcoming reference recording can be wired in without touching call sites again.

**Acceptance Criteria:**
- [ ] `useAudioManager` exposes: `playDieRoll(dieIndex: 0 | 1, durationMs: number)`, `playDieLand(dieIndex: 0 | 1)`, `playDieCollision()`, `playBearOff()`.
- [ ] Each method tolerates a missing asset: if the underlying buffer is `null`, it returns silently (no throw, no console error) — matching the existing `playRollDice`/`playMovePiece` no-op fallback pattern from PRD-dice-polish.
- [ ] Existing `playShakeFor`, `playDiceLand`, `playCheckerClick` continue to work; new methods coexist without removing the old shake/land layer until US-015 swaps assets.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-012: Wire collision SFX into physics events

**Description:** As a player, I want to hear a tick when the two dice collide.

**Acceptance Criteria:**
- [ ] The dice-on-dice collision detection from US-008 fires `audio.playDieCollision()` exactly once per discrete contact event (rate-limited to avoid machine-gun triggers when bodies skim).
- [ ] No collision SFX fires when only a single die is in flight or at rest.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-013: Wire bear-off SFX into bear-off action

**Description:** As a player, I want a distinct sound when a checker bears off so the action feels rewarded.

**Acceptance Criteria:**
- [ ] Every successful bear-off in `handlePointPress` (and Nesh Strike free-move bear-off, if reachable) triggers `audio.playBearOff()` exactly once.
- [ ] Bear-off via the 5:1 four-move special does not over-trigger (one SFX per bear-off, not per consumed die).
- [ ] No bear-off SFX fires on regular captures or non-bear-off moves.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-014: Stagger per-die roll/land triggers

**Description:** As a player, I want the two dice to sound like two physical objects, not one — their roll and land sounds must be offset.

**Acceptance Criteria:**
- [ ] On a two-die roll, `playDieRoll(0, ...)` and `playDieRoll(1, ...)` fire with a small randomized stagger (e.g., 30–120 ms) so they do not sample-lock.
- [ ] On landing, `playDieLand(0)` and `playDieLand(1)` fire when each die individually reaches rest, not on a single shared landing event.
- [ ] The legacy single `playShakeFor` / `playDiceLand` path is removed (or routed through the new per-die calls) so we don't double-trigger.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-015: Replace placeholder dice SFX with reference-derived assets

**Description:** As a player, I want the dice to sound like the real reference recording the user is providing.

**Acceptance Criteria:**
- [ ] New audio files are placed under `neshbesh-app/assets/sfx/` for: `die-roll.{m4a|mp3}`, `die-land.{m4a|mp3}`, `die-collision.{m4a|mp3}`, `bear-off.{m4a|mp3}`.
- [ ] `useAudioManager` loads each asset; missing-asset fallback from US-011 is preserved as a safety net.
- [ ] Subjective A/B with the user against the reference recording confirms the swap; record approval in `progress.txt`.
- [ ] `scripts/generate-sfx.ts` is updated or annotated to reflect that the placeholder generation is no longer the source of truth for these four files.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-016: Cross-platform release verification

**Description:** As release engineering, I want a documented smoke run on every supported platform before the 2026-06-10 cut.

**Acceptance Criteria:**
- [ ] Smoke test executed and signed-off on: iOS phone, iOS tablet, Android phone (low-end class), Android tablet, web (Chrome desktop). Per platform, record FPS observed during Click-1 (target ≥60).
- [ ] All checklist rows in `progress.txt`'s "Manual Test Plan" pass — including US-006 board-pinning audit and US-009/US-010 physics scenarios.
- [ ] No regressions in: PRD-multiplayer test plan rows, PRD-dice-polish test plan rows, PRD-engine-rules special-roll behaviors.
- [ ] `npx tsc --noEmit` passes from `neshbesh-app/`.
- [ ] Verify changes work in browser (final pass).

---

## Non-Goals

- **No engine rule changes.** Special rolls, bear-off semantics, Nesh Strike, blocked-double-on-Bar, and 5:1 four-move are governed by `PRD-engine-rules.md` and considered frozen for this release.
- **No multiplayer sync schema changes.** Firebase `gameState` payload stays as-is; new audio / physics / layout state is local-only and never crosses the wire.
- **No new game modes, themes, or visual redesigns.** Color, ratio, and board art constants in `BOARD_FROZEN` (`boardConstants.ts`) remain untouched.
- **No new dependencies** unless strictly required by a chosen physics approach. Reanimated / Moti / `expo-av` cover the current surface.
- **Reference recording sourcing** is out of scope — the user provides the raw recording; US-015 only handles integration.
- **Performance work beyond Click-1 / Click-2.** Roll animation perf, network round-trip latency, and bundle size are not in scope unless surfaced as blockers by US-001.

## Technical Notes

- **Existing modules to reuse:**
  - `neshbesh-app/src/animations/diceConstants.ts` — owns dice timing/scale magic numbers and `getRollDurationMs` / `pickLandingPoint`.
  - `neshbesh-app/src/utils/boardConstants.ts` — `getOccupancyRects` for forbidden-zone math; `BOARD_FROZEN` constants are off-limits.
  - `neshbesh-app/src/audio/useAudioManager.ts` — extend, do not replace, the existing `playShakeFor`/`playDiceLand`/`playCheckerClick` API.
  - `neshbesh-app/src/engine/index.ts` — `resetMoveCache()` and the move-cache key from `progress.txt` US-015 must keep working through the perf fix.
- **Physics approach** is left to the implementer's judgment between (a) a thin custom integrator inside `ThrowingDiceOverlay` (current pattern) tuned for damping/friction, or (b) a small physics library if (a) cannot meet US-007 / US-008 / US-009 simultaneously. Default to (a) and only escalate if necessary; document the choice in `progress.txt`.
- **Static-board layout** likely means moving the board into a `position: absolute` (web) / fixed-size flex parent (native) container that ignores chrome-size deltas. Confirm via measurement (US-006) rather than visual inspection.
- **`gameMode === 'local'` byte-equivalence** rule from CLAUDE.md §3 still applies to `PlayerDiceBar` and `PlayerSidebar` content; only the *parent layout container* may move.
- **TypeScript verification** environment note from prior progress entries: `node`/`npm`/`tsc` are not on PATH in some dev setups — the user must run `npx tsc --noEmit` from `neshbesh-app/` to verify each story.
