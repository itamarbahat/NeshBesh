# PRD: Dice Physics, Scaling & Audio Polish

## Introduction
The dice currently fly from the active player's edge to a fixed point on the board with a constant duration and constant size, and they can land on top of checker columns. There is also no shake/landing/click audio. This PRD upgrades the dice experience to feel physical and tactile: dice land only on empty board surface (collision-aware), each roll's duration is randomized between 1 and 4 seconds, the in-tray dice are visibly larger than the on-board dice with a brief landing pop, and three new SFX layers are added (continuous shake, landing thud, checker click).

All existing colors, textures, proportions, and game logic must remain untouched.

## Goals
- Dice never visually overlap any occupied checker column when at rest on the board.
- Roll duration (shake → landing) follows a uniform distribution on `[1000ms, 4000ms]` per roll.
- Tray dice render at `1.6×` the on-board die size; on landing, the die scales to `1.25×` for `180ms` then settles to the board size.
- A continuous, generative shake SFX plays for the exact duration of each roll.
- A distinct landing SFX fires the moment dice come to rest.
- A subtle click SFX plays each time a checker is moved to a destination point.
- Zero changes to existing color tokens, textures, board proportions, or piece visuals.

## User Stories

### US-001: Dice constants module
**Description:** As an engineer, I want all dice timing and scale magic numbers in one file so animations and audio stay in sync.

**Acceptance Criteria:**
- [ ] Create `src/animations/diceConstants.ts`
- [ ] Export `TRAY_DIE_SCALE = 1.6`, `BOARD_DIE_SCALE = 1.0`, `LANDING_POP_SCALE = 1.25`, `LANDING_POP_MS = 180`
- [ ] Export `ROLL_DURATION_MIN_MS = 1000`, `ROLL_DURATION_MAX_MS = 4000`
- [ ] All values typed as `number` constants (no defaults via magic literals elsewhere after later stories)
- [ ] Typecheck passes

### US-002: Random roll duration helper
**Description:** As an engineer, I want a pure helper that returns a fresh random duration so every consumer (animation, audio) reads the same value per roll.

**Acceptance Criteria:**
- [ ] Add `getRollDurationMs(): number` to `src/animations/diceConstants.ts`
- [ ] Returns a uniformly random integer in `[ROLL_DURATION_MIN_MS, ROLL_DURATION_MAX_MS]`
- [ ] Single call site in `ThrowingDiceOverlay` computes the value once per roll and threads it to audio
- [ ] Typecheck passes

### US-003: Compute occupied board rectangles
**Description:** As an engineer, I want a helper that returns the screen-space rectangles of every occupied point so the dice landing code can avoid them.

**Acceptance Criteria:**
- [ ] Add `getOccupancyRects(board: number[], boardWidth: number, boardHeight: number): Rect[]` to `src/components/boardConstants.ts`
- [ ] `Rect = { x: number; y: number; w: number; h: number }`
- [ ] Returns one rect per point where `|board[i]| >= 1`, sized to the visible checker stack height (use `BOARD_FROZEN.PIECE_SLOT_RATIO`)
- [ ] Includes the bar (indices 0 and 25) when occupied
- [ ] Returns `[]` when board is empty
- [ ] Typecheck passes

### US-004: Rejection-sampled landing point
**Description:** As an engineer, I want a helper that picks a random point inside the board that does not intersect any occupied rectangle.

**Acceptance Criteria:**
- [ ] Add `pickLandingPoint(boardW, boardH, dieSize, occupied: Rect[], maxAttempts = 30)` to `src/animations/diceConstants.ts`
- [ ] Returns `{ x, y }` such that the die's bounding box does not overlap any rect
- [ ] Falls back to the board's central horizontal bar zone if no valid point is found within `maxAttempts`
- [ ] Two dice are placed with at least `dieSize * 1.1` gap between centers
- [ ] Typecheck passes

### US-005: Apply collision-aware landing in `ThrowingDiceOverlay`
**Description:** As a player, I want the dice to land only on empty board surface, never overlapping checkers.

**Acceptance Criteria:**
- [ ] `ThrowingDiceOverlay` reads `board` from `useGameStore`
- [ ] On each new roll, calls `getOccupancyRects` then `pickLandingPoint` for each die
- [ ] `Animated.ValueXY` end values use the computed landing points (board-local, then offset to screen coords)
- [ ] Visually verify on a board with several stacked points: dice land in gaps
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-006: Apply randomized fly duration
**Description:** As a player, I want each roll to feel different — sometimes quick, sometimes drawn out — so the dice never feel mechanical.

**Acceptance Criteria:**
- [ ] `ThrowingDiceOverlay` calls `getRollDurationMs()` once per roll
- [ ] The flight `Animated.timing` uses that duration for `duration:`
- [ ] The same value is stored in a ref so audio (US-009) can read it
- [ ] Tumble interval continues for the full duration, then stops on landing
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-007: Landing scale pop
**Description:** As a player, I want the dice to grow briefly when they hit the board, then settle, so landing has visual punch.

**Acceptance Criteria:**
- [ ] After flight `Animated.timing` completes, run a sequence: `scale → BOARD_DIE_SCALE * LANDING_POP_SCALE` over `~80ms`, then `scale → BOARD_DIE_SCALE` over `LANDING_POP_MS - 80ms`
- [ ] Uses `Easing.out(Easing.quad)` on the settle leg
- [ ] No overlap with the still-airborne die's animation if dice land at slightly staggered times
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-008: Tray dice render at 1.6× in `DicePanel`
**Description:** As a player, I want the dice in the dice tray to look noticeably bigger than the dice resting on the board.

**Acceptance Criteria:**
- [ ] `DicePanel` multiplies its incoming `dieSize` by `TRAY_DIE_SCALE` for the tray rendering
- [ ] Tray dice maintain existing colors, pip layout, border radius — only size changes
- [ ] On-board dice (in `ThrowingDiceOverlay`) continue to use unmodified `dieSize`
- [ ] No layout overflow at the smallest supported board width (280px)
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-009: Generate placeholder SFX assets
**Description:** As an engineer, I want committed placeholder WAV files so the audio code paths are testable without waiting for final assets.

**Acceptance Criteria:**
- [ ] Add `scripts/generate-sfx.ts` (Node script using `wav` or hand-written PCM) that writes:
  - [ ] `assets/sfx/dice-shake-loop.wav` — ~200ms of band-passed white noise (rattling texture, loop-safe)
  - [ ] `assets/sfx/dice-land.wav` — ~250ms percussive thud (low-frequency burst with quick decay)
  - [ ] `assets/sfx/checker-click.wav` — ~80ms sharp tick (short high-frequency transient)
- [ ] Script is idempotent (`npm run sfx:generate` regenerates files)
- [ ] Generated files committed under `neshbesh-app/assets/sfx/`
- [ ] Typecheck passes

### US-010: Generative shake playback in `useAudioManager`
**Description:** As a player, I want the shake sound to play continuously for exactly as long as the dice are flying, with subtle pitch variation so it doesn't feel like a flat loop.

**Acceptance Criteria:**
- [ ] Add `playShakeFor(durationMs: number)` to `useAudioManager`
- [ ] Loads `dice-shake-loop.wav`, sets `isLooping = true`, plays
- [ ] Schedules a `setTimeout(durationMs)` to call `stopAsync` and unload
- [ ] Modulates `setRateAsync` every ~150ms by ±8% for generative texture (use `correctPitch: false` so rate change shifts pitch)
- [ ] Calling `playShakeFor` while a previous shake is active stops the previous one cleanly
- [ ] Typecheck passes

### US-011: Wire shake SFX to roll start
**Description:** As a player, I want the shake sound to begin the moment I throw the dice and end the moment they land.

**Acceptance Criteria:**
- [ ] `ThrowingDiceOverlay` calls `audio.playShakeFor(rollDurationMs)` at the start of the flight animation
- [ ] No double-trigger when `dice` updates rapidly (guard via the existing `prevDiceRef` pattern)
- [ ] Existing `playRollDice` SFX is removed or kept as a one-shot transient at throw start (whichever the audio layer needs to avoid clash) — document the choice in the file
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-012: Wire landing SFX
**Description:** As a player, I want a satisfying thud when the dice come to rest.

**Acceptance Criteria:**
- [ ] Add `playDiceLand()` to `useAudioManager`
- [ ] Triggered in `ThrowingDiceOverlay` at the end of each die's flight animation (one call per roll, not per die)
- [ ] Plays even if the user has navigated away mid-flight (cleanup must not crash)
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-013: Wire checker click SFX
**Description:** As a player, I want a soft click each time I move a checker to a new point.

**Acceptance Criteria:**
- [ ] Add `playCheckerClick()` to `useAudioManager`
- [ ] Called from `App.tsx`'s existing message-watcher effect when `phase === 'MOVING'` and message indicates a successful move (path already used to call `playMovePiece`)
- [ ] Replaces the existing `playMovePiece` invocation OR layers under it — pick one and document
- [ ] Click does NOT fire on captures (those still use `playEatPiece`)
- [ ] Click does NOT fire on opening-roll selections
- [ ] Typecheck passes
- [ ] Verify changes work in browser

### US-014: Aesthetic regression check
**Description:** As QA, I want to confirm that no color, texture, or proportion has shifted as a side effect of this work.

**Acceptance Criteria:**
- [ ] `git diff` shows zero changes to `src/components/Board.tsx` style tokens, `src/components/Piece.tsx`, `src/components/Slot.tsx`, `src/components/boardConstants.ts` color/ratio constants
- [ ] Visual side-by-side: load pre-PR and post-PR builds, board pieces and colors are pixel-equivalent on the same device
- [ ] Add a checklist entry in `progress.txt` confirming verification
- [ ] Typecheck passes
- [ ] Verify changes work in browser

## Non-Goals
- A full physics engine (no `matter-js` or similar). Collision avoidance is rejection sampling, not simulation.
- Per-die independent landing times (both dice settle within the same roll-duration window).
- 3D dice rendering or perspective transforms.
- User-configurable roll duration or volume settings (deferred).
- Final audio assets — placeholders only; user will swap files later.
- Haptics tuning (existing haptics, if any, untouched).

## Technical Notes
- The "rest pose" of dice already lives in `ThrowingDiceOverlay`; do not introduce a second persistence layer.
- Use `expo-av` (already a dependency via `useAudioManager`); do not add `react-native-sound`.
- Rejection sampling caps at 30 attempts to avoid frame drops; the central-bar fallback guarantees the function always returns.
- `getRollDurationMs` should be deterministic per call (no shared mutable state) — test reliability hinges on each consumer reading the SAME value, which is why `ThrowingDiceOverlay` must be the single caller per roll.
- Sound rate modulation in US-010 uses `setRateAsync(rate, false /* correctPitch */)` for cheap pitch variation; do not load multiple sample variants.
