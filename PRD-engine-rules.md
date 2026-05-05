# PRD: NeshBesh Engine — Special Rolls, Bear-off Correctness & Path-Search Performance

## Introduction

NeshBesh's engine has drifted from the canonical rule-set in three areas (5/1 four-move semantics, blocked-double-on-Bar re-rolls, 6/5 Nesh-Strike free-move restrictions) and the bear-off pathway does not enforce the standard "must advance from higher slots" rule. Recent rule additions also introduced visible lag during Click 1 (path computation in [calculatePossibleMoves](neshbesh-app/src/engine/index.ts)).

This PRD breaks the work into Ralph-sized stories, dependency-ordered: pure-engine first → store/state-machine → UI surface → performance. Each story is verifiable in isolation and ends with `Typecheck passes` (and browser verification when UI is touched).

## Goals

- Implement the rewritten **5/1 (1/5)** rule: roll one die → play **4 moves of that rolled value**; bar-entry and bear-off each consume one of the four moves.
- Implement **Blocked-Double-on-Bar re-roll**: when a doubles roll lands on a fully-blocked entry point, grant a full new roll; **3 consecutive blocked doubles → Table Flip**.
- Rewrite **6/5 Nesh-Strike Free Moves**: always 2 free moves; when on the Bar, the **first** free move must land in opponent's home (= bar entry), the **second** is unrestricted; remove the "last piece exception."
- Enforce standard bear-off rule: a die value X with no checker on point X must first advance checkers from points farther from the exit before bearing off.
- Restore smooth Click 1 / Click 2 responsiveness by memoizing path search and narrowing render selectors.

## User Stories

> Sequence rule: every story below depends only on stories with a lower US-### number.

---

### US-001: Bear-off — enforce "must advance from higher slots first"

**Description:** As a player, I want bear-off to obey the standard rule so that a die value X with no checker on point X advances a higher-slot checker (farther from the exit) before any lower-slot bear-off is allowed.

**Acceptance Criteria:**
- [ ] In [engine/index.ts](neshbesh-app/src/engine/index.ts), `calculatePossibleMoves` (with `bearOff=true`) returns bear-off destinations for die X **only when** no checker exists on a slot farther from the exit than the candidate `from`.
- [ ] "Farther from exit" is computed per side: White's exit is past slot 24, so farther = lower-numbered slot in home (19→24 home, slot 19 is farthest); Black's exit is past slot 1, so farther = higher-numbered slot in home (1→6 home, slot 6 is farthest).
- [ ] When the die value exactly matches the slot's distance to exit, bear-off is always allowed regardless of higher slots (existing behavior preserved).
- [ ] When die value > distance-to-exit and there is **no** checker farther from the exit, bear-off the highest-distance checker is allowed (overshoot rule preserved).
- [ ] Unit-style scenario in `scripts/debug.ts`: White has checkers on `[19,20]`, dice=`[3]` → `from=20` does NOT yield bear-off; `from=19` yields bear-off via overshoot only after slot 20 is empty.
- [ ] Typecheck passes

---

### US-002: Engine helper — `isBarEntryBlocked(board, sign, dieValue)`

**Description:** As the turn-flow code, I want a single boolean helper so I can detect when a bar checker cannot enter on a given die value (target point has 2+ opponent checkers).

**Acceptance Criteria:**
- [ ] Add `export const isBarEntryBlocked = (board: number[], sign: PlayerSign, dieValue: number): boolean` to [engine/index.ts](neshbesh-app/src/engine/index.ts).
- [ ] White entry target = `dieValue` (slot 1..6); Black entry target = `25 - dieValue` (slot 19..24).
- [ ] Returns `true` iff `Math.sign(board[target]) === -sign && Math.abs(board[target]) >= 2`.
- [ ] Used by US-008; not yet wired into the store in this story.
- [ ] Typecheck passes

---

### US-003: Engine — `getFreeMoveFinals` accepts an `opponentHomeOnly` flag

**Description:** As the 6/5 free-move handler, I want to ask the engine for free-move destinations restricted to opponent's home so I can implement the bar-entry-then-free flow.

**Acceptance Criteria:**
- [ ] Extend `getFreeMoveFinals(board, sign, opponentHomeOnly?: boolean)` in [engine/index.ts](neshbesh-app/src/engine/index.ts).
- [ ] When `opponentHomeOnly` is true: White → slots `[1..6]`; Black → slots `[19..24]`. Filter out blocked slots (2+ opponent checkers) using existing `isLandable` logic.
- [ ] When `opponentHomeOnly` is false/undefined: behavior unchanged (any non-blocked board slot).
- [ ] Existing call sites continue to compile without modification.
- [ ] Typecheck passes

---

### US-004: Types — extend state for 5/1 four-move mode

**Description:** As the state machine, I need types/fields that represent "play 4 moves at the rolled value" so 5/1 can drop into the standard `availableDice` flow.

**Acceptance Criteria:**
- [ ] Add an optional flag `is51FourMove: boolean` to `NeshBeshState` in [store/useGameStore.ts](neshbesh-app/src/store/useGameStore.ts) (default `false`).
- [ ] No new phase needed — playback uses the existing `MOVING` phase with `availableDice = [v, v, v, v]`.
- [ ] Add a JSDoc one-liner above the field explaining the WHY (5/1 must consume bar-entry / bear-off as one of the four slots regardless of pip distance).
- [ ] Typecheck passes

---

### US-005: Store — 5/1 single-die roll resolves into 4 moves of rolled value

**Description:** As a player rolling 5/1, I want the manual single-die trigger to produce 4 moves of the rolled value so play proceeds as a pseudo-double.

**Acceptance Criteria:**
- [ ] In `confirmSpecialResult` (5/1 branch) in [store/useGameStore.ts](neshbesh-app/src/store/useGameStore.ts), set `availableDice = [d, d, d, d]`, `is51FourMove = true`, `phase = 'MOVING'`.
- [ ] `doublesCount` is **not** incremented (special rolls never grant extra turns — see CLAUDE.md §2).
- [ ] Existing 5/1 bar-entry exception (single-die forward entry, turn ends) is preserved unchanged.
- [ ] Message: `5:1 — Playing 4 moves of {d}`.
- [ ] Typecheck passes

---

### US-006: Store — 5/1 bar entry consumes 1 of the 4 moves at rolled value

**Description:** As a player on the Bar during 5/1, entering my bar checker should consume one of the four rolled-value moves regardless of whether the entry distance equals the rolled value.

**Acceptance Criteria:**
- [ ] When `is51FourMove === true` and the player has a bar piece, attempting bar entry uses the rolled value `d` as the entry distance (White → slot `d`, Black → slot `25 - d`).
- [ ] On successful entry, exactly one entry is removed from `availableDice` (the array shrinks from 4 to 3).
- [ ] If the entry point is blocked (2+ opponent checkers), entry is rejected; if **all four** entry attempts are blocked (i.e. no entry possible at all), the turn ends with all 4 moves forfeited and message `5:1 — Bar entry blocked, turn ends`.
- [ ] Typecheck passes

---

### US-007: Store — 5/1 bear-off consumes 1 of the 4 moves at rolled value

**Description:** As a player in the bear-off phase during 5/1, removing a checker should consume one of the four rolled-value moves; the standard "must-advance-higher" rule (US-001) still applies.

**Acceptance Criteria:**
- [ ] When `is51FourMove === true` and `canBearOff(board, sign)` is true, bearing off any home-board checker consumes one die from `availableDice`.
- [ ] Bear-off legality is delegated to `calculatePossibleMoves(..., bearOff=true)` from US-001 (no duplicate rule logic).
- [ ] When `availableDice.length === 0`, `is51FourMove` resets to `false` and turn ends (no extra turn).
- [ ] Typecheck passes

---

### US-008: Store — Blocked double on Bar triggers full re-roll

**Description:** As a player whose doubles roll lands on a fully-blocked Bar entry, I want the dice re-rolled so I'm not stuck.

**Acceptance Criteria:**
- [ ] After a doubles roll, when `hasBarPieces(board, sign)` and `isBarEntryBlocked(board, sign, d) === true` (US-002), the store transitions back to `phase = 'WAITING_ROLL'`, increments a new `blockedDoubleStreak` counter, and emits message `Double {d} — entry blocked, re-rolling…`.
- [ ] `blockedDoubleStreak` resets to 0 the moment any non-blocked roll occurs OR the player has no bar piece.
- [ ] Re-roll happens automatically (no extra tap required) on the next state tick.
- [ ] Typecheck passes

---

### US-009: Store — 3 consecutive blocked doubles → Table Flip

**Description:** As a player who hits 3 blocked doubles in a row, my turn ends per the existing 3-consecutive-doubles rule.

**Acceptance Criteria:**
- [ ] When `blockedDoubleStreak === 3`, the store ends the turn (passes dice to the opponent), resets `blockedDoubleStreak = 0`, and emits message `3 blocked doubles — Table Flip!`.
- [ ] Reuses the existing table-flip animation hook ([useTableFlipAnimation.ts](neshbesh-app/src/animations/useTableFlipAnimation.ts)) — no new animation code.
- [ ] In remote mode, the table-flip state syncs through the existing host-authoritative `syncGameState` path; no new Firebase fields required.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-010: Store — 6/5 with bar pieces: first free move = opponent home, second = unrestricted

**Description:** As a player rolling 6/5 while on the Bar, my first free move should land in opponent's home (= bar entry); my second free move should be unrestricted on the board.

**Acceptance Criteria:**
- [ ] When `neshStrikeFreeMovesLeft === 2` AND `hasBarPieces(board, sign)`, the highlights returned to the UI use `getFreeMoveFinals(board, sign, /*opponentHomeOnly*/ true)` (US-003), and the source piece is forced to be the bar checker.
- [ ] When `neshStrikeFreeMovesLeft === 1` (regardless of bar status), highlights use `getFreeMoveFinals(board, sign, false)` and any of the player's checkers may be selected as the source.
- [ ] If `neshStrikeFreeMovesLeft === 2` and **all** opponent-home slots are blocked, the turn ends with both free moves forfeited and message `6:5 — Bar entry blocked, free moves forfeited`.
- [ ] Typecheck passes

---

### US-011: Store — Remove 6/5 "last piece on Bar" exception

**Description:** As a player whose only remaining checker is on the Bar, a 6/5 still grants 2 free moves (the first is the bar entry, the second moves the same piece freely).

**Acceptance Criteria:**
- [ ] No code path reduces `neshStrikeFreeMovesLeft` from 2 to 1 based on "only one piece left" — that logic, if present, is removed.
- [ ] CLAUDE.md §2 "Last Piece Exception" bullet is updated to reflect the new behavior (single docs edit, no rules logic in markdown).
- [ ] Typecheck passes

---

### US-012: UI — 5/1 dice indicator shows 4 pips of rolled value remaining

**Description:** As a player mid 5/1 turn, I want to see how many of the four moves at value `d` remain so I can plan.

**Acceptance Criteria:**
- [ ] [DicePanel.tsx](neshbesh-app/src/components/DicePanel.tsx) renders `availableDice.length` pips of value `d` when `is51FourMove === true` (re-uses existing per-die rendering, no new component).
- [ ] [SingleDieRoller.tsx](neshbesh-app/src/components/SingleDieRoller.tsx) closes/dismisses cleanly once the rolled value is committed.
- [ ] Hebrew message displayed: `5:1 — נותרו {n} מהלכים של {d}`.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-013: UI — Blocked-double re-roll feedback

**Description:** As a player whose double was rejected, I want a brief visual cue so I understand why the dice are re-rolling.

**Acceptance Criteria:**
- [ ] [SpecialRollOverlay.tsx](neshbesh-app/src/components/SpecialRollOverlay.tsx) shows a 1.2-second message bubble `Double {d} — entry blocked` before the auto re-roll fires.
- [ ] On the 3rd consecutive block, the table-flip animation plays and the message bubble reads `3 blocked doubles — Table Flip!`.
- [ ] No new animation code is added; only the existing flip hook is invoked.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-014: Performance — profile path-search hot path and document findings

**Description:** As an engineer, I want a baseline profile of `calculatePossibleMoves` and its consumers so optimizations target real hotspots.

**Acceptance Criteria:**
- [ ] Add a `console.time` / `console.timeEnd` block (gated by `__DEV__`) wrapping each call to `calculatePossibleMoves` in the store's selection branch.
- [ ] Run a 5-minute play session in browser; record three slowest measurements and the most frequently-called `from` indices in `progress.txt` under `## Learnings`.
- [ ] No production behavior change — all instrumentation is `__DEV__`-gated.
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

### US-015: Performance — memoize `calculatePossibleMoves` per turn

**Description:** As a player clicking around the board mid-turn, I want highlight computation reused across clicks so Click 1 stays under 16ms.

**Acceptance Criteria:**
- [ ] Introduce a turn-scoped `Map<string, { intermediate: number[]; final: number[] }>` cache in [engine/index.ts](neshbesh-app/src/engine/index.ts), keyed by `${boardHash}|${from}|${sign}|${dice.join(',')}|${backward}|${bearOff}`.
- [ ] `boardHash` is a fast string hash of the 26-cell array (e.g. `board.join(',')`).
- [ ] The cache is cleared by an exported `resetMoveCache()` called by the store at every turn-start and after every successful move.
- [ ] No public API change to `calculatePossibleMoves` callers.
- [ ] Typecheck passes

---

### US-016: Performance — narrow store selectors to prevent highlight recomputation on unrelated state

**Description:** As a player, I want highlight components not to re-render when unrelated store fields (e.g. message text) change so Click 1 stays smooth.

**Acceptance Criteria:**
- [ ] [Slot.tsx](neshbesh-app/src/components/Slot.tsx), [Point.tsx](neshbesh-app/src/components/Point.tsx), and [Board.tsx](neshbesh-app/src/components/Board.tsx) subscribe to the store via narrowed selectors (e.g. `useGameStore(s => s.intermediateHighlights)`) instead of the full state.
- [ ] At least one component switches from full-state subscription to narrowed selector — verified by visible diff.
- [ ] React DevTools Profiler shows ≤ 1 re-render of `<Slot>` per Click 1 (down from current N).
- [ ] Typecheck passes
- [ ] Verify changes work in browser

---

## Non-Goals

- No changes to remote / Firebase sync schema (host-authoritative model unchanged; `syncGameState` carries new fields organically).
- No new animations, sounds, or haptics — all UI work reuses existing hooks in [animations/](neshbesh-app/src/animations/) and [audio/](neshbesh-app/src/audio/).
- No changes to scoring (Simple / Mars / Turkish Mars / Star Mars) or match structure.
- No changes to the 2-click selection model itself — only the rule set the engine evaluates within it.
- No changes to other special rolls (1:2, 4:5, 6:3, 5:2, 4:3) beyond what is required by the shared helpers.
- No persistence layer (saved games, replay history) — out of scope.

## Technical Notes

- **Existing helpers to reuse:** `calculatePossibleMoves`, `canBearOff`, `hasBarPieces`, `applyNeshStrike`, `getFreeMoveFinals`, `BEAR_OFF_WHITE`, `BEAR_OFF_BLACK` in [engine/index.ts](neshbesh-app/src/engine/index.ts).
- **Existing phases to reuse:** `MOVING`, `WAITING_ROLL`, `SPECIAL_51_ROLL`, `SPECIAL_43_ROLL` in [store/useGameStore.ts](neshbesh-app/src/store/useGameStore.ts). No new phases introduced.
- **Existing UI components to reuse:** [DicePanel.tsx](neshbesh-app/src/components/DicePanel.tsx), [SingleDieRoller.tsx](neshbesh-app/src/components/SingleDieRoller.tsx), [SpecialRollOverlay.tsx](neshbesh-app/src/components/SpecialRollOverlay.tsx). No new components introduced.
- **Animations:** Reuse [useTableFlipAnimation.ts](neshbesh-app/src/animations/useTableFlipAnimation.ts) for the 3-blocked-doubles flip. No new animation hooks.
- **Token hygiene (CLAUDE.md §0):** never read lockfiles or `node_modules/`; do not pre-emptively open siblings of an error location.
- **Hebrew copy:** message strings are user-facing — keep wording consistent with existing Hebrew strings in the store.
- **Sub-agent guidance (CLAUDE.md §4):** engine/store stories → `logic` agent; UI stories → `stylist` agent; animation-touching stories (US-013) → `fx` agent; performance investigation (US-014) → `debugger` agent.

## Dependency Graph (cheat sheet)

```
US-001 ─┐
US-002 ─┤
US-003 ─┤── (engine layer, parallelizable)
US-004 ─┘
          │
          ▼
US-005 → US-006 → US-007        (5/1 store chain — depend on US-001, US-004)
US-008 → US-009                 (blocked-double chain — depend on US-002)
US-010 → US-011                 (6/5 chain — depend on US-003)
          │
          ▼
US-012, US-013                  (UI surface — depend on the store stories above)
          │
          ▼
US-014 → US-015 → US-016        (perf — runs last so it measures the new rules)
```
