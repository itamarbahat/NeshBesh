# PRD: NeshBesh — Total Silence & Dice-In-Board Correctness

**Release window:** 2026-05-19
**Scope tag:** `total-silence-physics-fix`
**Supersedes:** every prior `PRD-*.md` in this repo (consolidated into this single source of truth on 2026-05-05).

---

## 1. Introduction

This PRD has two intertwined deliverables:

1. **Total Silence.** The game must run in 100% silence. All audio code, audio assets, audio dependencies, audio-generation scripts, and audio scaffolding must be removed at the root. No SFX, no haptic-as-audio, no shake/land/click/collision/bear-off cues.
2. **Dice stay inside the board.** A regression introduced during the previous audio-removal attempt allowed dice to land outside the board boundaries. The deterministic 2D physics simulator must be restored to a state where every die's center remains inside the play-area rect for every frame of every roll, with elastic wall bounces and a hard-snap to a legal in-board rest pose at flight end.

The two are linked because the previous removal pass coupled audio scheduling cursors directly into the physics tick loop (`collisionCursor`, `dieALandFired`, `dieBLandFired`, `audio.playShakeFor(flightMs)`, `audio.playDieRoll(...)`). Pulling those calls out cleanly without breaking determinism is the central correctness risk of this release.

This PRD is dependency-ordered: cleanup of the working tree → asset/code/dep stripping → physics diagnosis → physics fix with automated harness → on-device sign-off → archival of legacy PRDs → final verification. Each story fits a single Ralph iteration and ends with `Typecheck passes` (plus browser/device verification when UI is touched).

---

## 2. Goals

- **Zero audio surface.** No `expo-av` / `expo-audio` import in any TypeScript file under `neshbesh-app/`. No `*.wav` / `*.mp3` / `*.m4a` under `neshbesh-app/assets/`. No `useAudioManager` symbol anywhere. No `sfx:generate` script.
- **Zero audio dependencies.** `package.json` has no `expo-av` or `expo-audio` entry. `npm ls expo-av` returns "(empty)".
- **Dice never leave the board.** Across an automated 100-roll harness with varied seeds, no frame at any point in the simulation places either die's center outside the play-area rect (`BOARD_FROZEN` bounds).
- **Dice never settle illegally.** Every roll's final rest pose is inside the play-area rect, does not overlap any occupied checker column (existing `getOccupancyRects` rule preserved), and obeys the existing 3-second hard-snap cap.
- **Determinism preserved.** The simulator's `framesA` / `framesB` / `restFrameA` / `restFrameB` / `collisionFrames` outputs remain deterministic given the same inputs (seed + initial pose).
- **No regressions to already-shipped invariants** (see §6).
- All deliverables ship by **2026-05-19**.

---

## 3. Non-Goals

- **No new audio.** This release is silence; do not add an "off-by-default" toggle, do not stub a future-proof API.
- **No engine rule changes.** Special rolls (1:2, 4:5, 6:5 Nesh Strike, 6:3, 5:2, 4:3, 5:1), bear-off semantics, blocked-double-on-Bar re-roll / table flip, scoring (Simple / Mars / Turkish Mars / Star Mars) are **frozen invariants** (§6). Touching them fails this release.
- **No multiplayer schema changes.** Firebase `gameState` payload is unchanged; host-authoritative model unchanged.
- **No UI redesign.** Color tokens, board ratios, `BOARD_FROZEN`, `Piece` / `Slot` / `Board` / `boardConstants` style constants are off-limits.
- **No new dependencies.** Reanimated / Moti / `expo-linking` / `firebase` / `zustand` cover the surface; do not add a physics library.
- **No new game modes, themes, or piece art.**

---

## 4. User Stories

> Sequence rule: every story below depends only on stories with a lower US-### number.

---

### US-001: Discard uncommitted audio re-introduction

**Description:** As the maintainer, I want the working tree's uncommitted audio code reverted so the cleanup work starts from a clean baseline matching HEAD's "audio removed" state.

**Acceptance Criteria:**
- [ ] `git status --short` shows no `M neshbesh-app/App.tsx` or `M neshbesh-app/src/components/ThrowingDiceOverlay.tsx` once the revert lands.
- [ ] `git status --short` shows no `?? neshbesh-app/src/audio/` and no `?? neshbesh-app/scripts/generate-sfx.py`.
- [ ] The uncommitted audio scheduling cursors (`collisionCursor`, `dieALandFired`, `dieBLandFired`, `audio.playShakeFor`, `audio.playDieRoll`, `audio.playDieLand`, `audio.playDieCollision`, `audio.playDiceLand`) are gone from `ThrowingDiceOverlay.tsx`.
- [ ] The uncommitted `audio.playRollDice / playTableFlip / playEatPiece / playMovePiece / playCheckerClick / playBearOff` calls are gone from `App.tsx`.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-002: Delete `src/audio/` and `scripts/generate-sfx.*`

**Description:** As the maintainer, I want the audio module directory and SFX generator scripts removed so no dormant audio scaffolding remains in the repo.

**Acceptance Criteria:**
- [ ] `neshbesh-app/src/audio/` directory does not exist (including `useAudioManager.ts`).
- [ ] `neshbesh-app/scripts/generate-sfx.py` does not exist.
- [ ] `neshbesh-app/scripts/generate-sfx.ts` does not exist (legacy variant referenced by `package.json`).
- [ ] `neshbesh-app/assets/sfx/` directory does not exist.
- [ ] `package.json` no longer contains the `sfx:generate` script entry.
- [ ] Typecheck passes

---

### US-003: Remove `expo-av` and `expo-audio` from `package.json`

**Description:** As the maintainer, I want the audio dependencies fully removed so the dependency graph reflects the silent runtime.

**Acceptance Criteria:**
- [ ] `neshbesh-app/package.json` does not list `expo-av` under `dependencies` or `devDependencies`.
- [ ] `neshbesh-app/package.json` does not list `expo-audio` under `dependencies` or `devDependencies`.
- [ ] `npm ls expo-av` from `neshbesh-app/` returns no resolved entry (only the absence note).
- [ ] `npm ls expo-audio` returns no resolved entry.
- [ ] `package-lock.json` is refreshed by a clean `npm install` so the lockfile no longer pins either package.
- [ ] Typecheck passes

---

### US-004: Scrub remaining audio import sites and references

**Description:** As the maintainer, I want every remaining mention of the audio system removed from source files so future contributors do not accidentally re-introduce it via "broken-import autofix."

**Acceptance Criteria:**
- [ ] `grep -rE "expo-av|expo-audio|useAudioManager|playShakeFor|playDiceLand|playRollDice|playMovePiece|playEatPiece|playTableFlip|playCheckerClick|playBearOff|playDieRoll|playDieLand|playDieCollision" neshbesh-app/src neshbesh-app/App.tsx` returns zero matches (only `dist/` and `package-lock.json` permitted, since those are build artifacts).
- [ ] No `import` statement in any `.ts` / `.tsx` file under `neshbesh-app/` references an audio module.
- [ ] No `// Audio system removed` style stub comments remain — the silent state is the new normal and does not need explanation in code.
- [ ] `README.md` and `CLAUDE.md` contain no audio-feature claims (e.g., "shake SFX", "bear-off cue").
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-005: Diagnose dice-out-of-board regression

**Description:** As the maintainer, I want a written, reproducible diagnosis of why dice currently land outside the board so the fix in US-007 has a concrete target rather than a guess.

**Acceptance Criteria:**
- [ ] Reproduce the bug on a release build: roll the dice repeatedly in `gameMode === 'local'` and capture at least one roll where a die's final rest pose has a center outside the play-area rect (defined by `BOARD_FROZEN` bounds in `boardConstants.ts`).
- [ ] Identify the offending mechanism: missing wall-bounce restitution, an integration step that overshoots the wall in a single tick, an incorrect `pickLandingPoint` fallback, or a hard-snap that snaps to a coordinate outside the rect. Record file path + line range.
- [ ] Determine whether the regression originated in commit `81d55ba` (audio subsystem removal) or earlier — `git bisect` between `11f108e` and HEAD if the cause is non-obvious.
- [ ] Append findings to `progress.txt` under a new `### US-005 — dice-out-of-board diagnosis` block: repro steps, hot path, the specific frame index where the die crosses the wall, and the proposed fix shape.
- [ ] Typecheck passes (no code change expected; baseline run).

---

### US-006: Add automated in-board invariant harness

**Description:** As QA, I want a deterministic 100-roll simulation harness that asserts no die's center is ever outside the play-area rect, so the fix in US-007 is verifiable without on-device runs and so future regressions are caught before merge.

**Acceptance Criteria:**
- [ ] Add a function `simulateNRolls(n: number, seed: number): { ok: boolean; failures: { rollIdx: number; frameIdx: number; die: 0 | 1; x: number; y: number }[] }` to `neshbesh-app/scripts/debug.ts` (or a new `scripts/diceHarness.ts` if `debug.ts` is unrelated).
- [ ] The harness drives the same simulator used at runtime (the one producing `framesA` / `framesB` in `ThrowingDiceOverlay`'s flight loop). It MUST NOT re-implement physics — share the function with the runtime.
- [ ] On `n = 100` with a fixed `seed`, the harness reports zero failures (every frame of every die is inside the play-area rect).
- [ ] The harness varies initial throw direction / velocity across rolls to exercise wall hits on all four edges.
- [ ] Running the harness is documented as `npm run dice:check` (new script entry in `package.json`).
- [ ] Typecheck passes

---

### US-007: Fix physics — elastic walls + hard-snap to in-board pose

**Description:** As a player, I want dice to bounce elastically off the play-area walls and, if the simulator hits the 3-second cap with a die still in motion, snap to the nearest legal in-board rest pose — never to a coordinate outside the rect.

**Acceptance Criteria:**
- [ ] In the dice physics module (`ThrowingDiceOverlay` and `src/animations/diceConstants.ts`), each integration step that would place a die's center outside the play-area rect is reflected against the violated wall(s) with restitution `0 < r ≤ 1`, chosen empirically to feel like physical dice. The reflection happens **inside** the same tick — no frame is emitted with an out-of-bounds center.
- [ ] The hard-snap path (US-009-style 3-second cap from prior PRD) snaps to a coordinate produced by `pickLandingPoint` / `pickPairLandingPoints`, which already constrains output to the play-area rect; the snap MUST NOT use the last raw integration coordinate as a fallback.
- [ ] `restFrameA` / `restFrameB` always reference frames whose center is in the play-area rect.
- [ ] The US-006 harness reports zero failures across 100 rolls AND across an extended 1000-roll run with a different seed.
- [ ] Manual repro from US-005 no longer reproduces the bug (recorded in `progress.txt`).
- [ ] Audio code is NOT re-introduced as a side effect of the fix.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-008: On-device sign-off — cross-platform smoke

**Description:** As release engineering, I want the silence + dice-in-board fix verified on every supported platform before the 2026-05-19 cut.

**Acceptance Criteria:**
- [ ] Smoke test executed and signed-off on: iOS phone, iOS tablet, Android phone (low-end class), Android tablet, web (Chrome desktop). For each platform record: (a) audible silence (no SFX during roll, capture, bear-off, table-flip, checker-click); (b) at least 20 dice rolls with no die settling outside or visually clipping the board; (c) the move-pip indicators remain unobscured.
- [ ] Sign-off rows appended to `progress.txt` under `### US-008 — silence + physics on-device sign-off`.
- [ ] No regressions in the §6 frozen invariants — verified by playing one full game per platform (open, special roll triggered at least once, capture, bear-off, win).
- [ ] `npx tsc --noEmit` passes from `neshbesh-app/`.
- [ ] Verify changes work in browser (final pass).

---

### US-009: Delete obsolete PRD files and scrub references

**Description:** As the maintainer, I want PRD.md to be the single source of truth so future contributors do not consult stale specs.

**Acceptance Criteria:**
- [ ] `PRD-dice-polish.md` deleted from repo root.
- [ ] `PRD-engine-rules.md` deleted from repo root.
- [ ] `PRD-multiplayer.md` deleted from repo root.
- [ ] `progress.txt` is updated: every reference to `PRD-dice-polish` / `PRD-engine-rules` / `PRD-multiplayer` / `PRD-perf-physics-audio` is either removed or annotated as `(historical — folded into PRD.md)`. The historical implementation notes themselves stay (they document what shipped) but no longer point at deleted files.
- [ ] No source file under `neshbesh-app/` contains the strings `PRD-dice-polish`, `PRD-engine-rules`, or `PRD-multiplayer` (search includes code comments).
- [ ] `README.md` (if present) does not link to deleted PRDs.
- [ ] Typecheck passes

---

## 5. Dependency Graph

```
US-001 (revert WT)
   │
   ▼
US-002 (delete audio dirs/scripts) ─┐
US-003 (remove deps) ───────────────┤── (audio cleanup, parallelizable after US-001)
US-004 (scrub references) ──────────┘
   │
   ▼
US-005 (diagnose physics bug)
   │
   ▼
US-006 (automated harness)
   │
   ▼
US-007 (physics fix)
   │
   ▼
US-008 (cross-platform sign-off)
   │
   ▼
US-009 (delete legacy PRDs, scrub references)
```

---

## 6. Frozen Invariants — Already-Shipped, Must Not Regress

The following are the consolidated invariants from the four legacy PRDs (now deleted; their content lives only here). They are **already implemented**. Any story above that breaks one fails this release.

### 6.1 Engine rules (frozen)

- **Bear-off**: a die value `X` may bear off a checker at distance `D` iff `X === D`, OR `X > D` AND no other checker is farther from the exit. With `X < D`, the die must be used to advance within the home board first. "Farther from exit" is per-side: White → lower index in home `[19..24]` is farther; Black → higher index in home `[1..6]` is farther.
- **5:1 four-move**: roll one die `d` → play 4 moves of value `d`. Bar-entry consumes 1 of the 4 moves regardless of distance. Bear-off consumes 1 of the 4 moves (subject to the standard bear-off rule). Does not grant an extra turn.
- **Blocked double on Bar**: when a doubles roll's entry point is blocked, re-roll automatically. 3 consecutive blocked doubles → Table Flip.
- **6:5 Nesh Strike**: always 2 free moves. If starting on Bar, BOTH free moves must land in opponent's home; first move's source is forced to be the bar checker, second move's source can be any of the player's checkers. If opponent's home is fully blocked, both free moves are forfeited.
- **Special rolls do NOT grant extra turns**: 4:5, 6:5, 6:3, 5:2, 4:3, 5:1 — only regular doubles do.
- **5:2 / 4:3 bar exceptions**: if on Bar, enter forward; the remaining die is played backward from a different piece (5:2) or the turn ends (4:3).
- **Initial roll** doubles as both "who goes first" and the opening move.

### 6.2 Multiplayer & layout (frozen)

- `gameMode: 'local' | 'remote'` lives on `useMultiplayerStore` and is the single source of truth for layout branching.
- **Local hotseat** (`'local'`) — mirrored layout: top `PlayerDiceBar` rotated 180°. Local rendering is byte-equivalent across releases.
- **Remote two-device** (`'remote'`) — non-mirrored: `OpponentHeaderChip` top (name + bear-off + Rolling/Thinking pulse, NEVER dice values), `RemoteBottomBar` bottom (my dice + status + conditional End Turn).
- **Deep links**: `https://neshbesh.app/join/{code}` (universal) + `neshbesh://join/{code}` (custom). Parsed at App level via `expo-linking`.
- **Host-authoritative**: guest actions go through `sendGuestAction`; host runs all engine mutations and pushes state via `syncGameState`.
- **`getShareUrl(roomId)`** in `multiplayerService.ts` is the single source of the canonical join URL.
- **No new Firebase fields** are introduced by this release.

### 6.3 Dice landing & layout (frozen)

- `getOccupancyRects(board, w, h)` returns occupied checker rects; dice resting AABBs must not intersect any of them.
- `pickLandingPoint` / `pickPairLandingPoints` always return coordinates inside the play-area rect (rejection sampling with central-bar fallback).
- Two dice land with at least `dieSize * 1.1` gap between centers.
- Tray dice render at `1.6×` on-board die size; landing pop is `1.25×` over `LANDING_POP_MS = 180`.
- Roll duration is uniformly random in `[ROLL_DURATION_MIN_MS, ROLL_DURATION_MAX_MS]` with a hard 3-second wall-clock cap; if the solver overruns, the dice hard-snap to a legal in-board pose.
- Move-pip indicator region is treated as a forbidden zone by the landing solver.
- Static board layout: the board's screen-space top-left does not move when surrounding chrome (special-roll cards, opponent chip, end-turn button, dice panel) reflows. Verified for both `gameMode === 'local'` and `gameMode === 'remote'`.

### 6.4 Performance (frozen)

- Click-1 piece selection budget: ≤16.7 ms (60 fps) on iPhone 12 / Pixel 6 class devices.
- Path-search cache (`resetMoveCache`) is correct: stale paths never appear after `applyMove`, `endTurnImpl`, or a Nesh Strike free move.
- `ThrowingDiceOverlay`, `OpponentHeaderChip`, `RemoteBottomBar` use narrowed Zustand selectors — they do not subscribe to full store state.

---

## 7. Technical Notes

- **Audio decoupling**: the previous removal pass left audio scheduling fused into the physics tick (`collisionCursor` advance, `dieALandFired/B` flags, `audio.playShakeFor(flightMs)` at flight start, `audio.playDieRoll(0, flightMs)`). When pulling these out, **do not also delete the `restFrameA` / `restFrameB` / `collisionFrames` simulator outputs** — those are physics state, not audio state, and the harness in US-006 needs them. Only the call sites that *consume* them for SFX scheduling should disappear.
- **Determinism**: the simulator must remain pure (same seed → same `framesA/B`). The harness in US-006 relies on this. Do not introduce `Date.now()` or `Math.random()` inside the integration step beyond what already seeds the initial throw.
- **Hard-snap source of truth**: when the 3-second cap fires, the snap target is `pickLandingPoint(...)` / `pickPairLandingPoints(...)` — never the last raw integration coordinate. This is the specific bug US-007 fixes.
- **Token hygiene** (CLAUDE.md §0): never read `package-lock.json`, `node_modules/`, or `dist/` while implementing. The audit greps in US-004 / US-009 explicitly exclude those paths.
- **Verification environment**: `npx tsc --noEmit` from `neshbesh-app/` is the canonical typecheck. The user runs it manually if `tsc` is not on PATH in the dev shell.
- **Sub-agent guidance** (CLAUDE.md §4): physics work → `logic` agent; audio scrubbing across UI files → `stylist` + `debugger`; cross-platform sign-off → `debugger`.
- **Hebrew copy**: any user-facing message strings touched incidentally (e.g., bear-off success) must remain in their existing Hebrew form. This release does not alter copy.
