# NeshBesh — Rules Correction PRD

> **Status:** Approved · execution underway on branch `29/5`.
> **Source of truth:** User annotations on the rules audit dated 2026-05-30.
> **Output:** A correctly-behaving engine, refreshed special-roll UIs, and a new live "doubles counter" indicator.

---

## 1. Context

A full rules audit catalogued the NeshBesh engine as it stands and surfaced a list of open questions. The decisions in §2 are the user's direct answers + several new requirements (UI redesigns, a live doubles counter, message-driven flows for 5:2 / 4:3 / 5:1). This document is the execution-ready PRD that supersedes that audit.

Scope splits cleanly into three areas:
- **Engine corrections** — rule changes inside `useGameStore.ts` and `engine/index.ts`.
- **UI / UX redesigns** — three special-roll surfaces (4:5 chooser, 4:3, 5:1) plus a new persistent doubles-counter chip.
- **Messaging** — short instructional captions during 5:2 / 4:3 / 5:1.

---

## 2. Confirmed Rule Decisions

| # | Rule area | Decision |
|---|---|---|
| R1 | 4:5 — blocked-entry double | **Disallowed.** A double whose entry point is blocked while on the bar must be greyed out / unselectable. |
| R2 | 4:5 — "cannot fully complete" rule | **New rule:** If at least one double has all 4 moves legally playable, only those are selectable. If NO double can be fully completed, all 6 remain selectable. |
| R3 | 4:5 — move accounting | Bar entry = 1 move. Bear-off = 1 move. (Same as regular double.) |
| R4 | 6:5 Nesh Strike — single bar piece | After the one bar piece enters, the **second free move is a free move across the ENTIRE board** (must change position; not restricted to opponent's home). |
| R5 | 6:5 Nesh Strike — pure bear-off | Free moves may go **anywhere on the board** (no bear-off; no opponent-home restriction). |
| R6 | 6:5 Nesh Strike — multiple bar pieces | Restriction to opponent's home remains while bar pieces are still being entered. Once the bar is fully cleared mid-turn, subsequent free moves become full-board. |
| R7 | 6:3 — re-roll counter behavior | **Doubles counter does NOT reset** on the re-roll. Correct as currently implemented. |
| R8 | 5:2 — pure bear-off | Player is forced to play the backward shuffle. No auto-skip. |
| R9 | 5:2 — message | Show: **"לך 5:2 אחורה!"** (Hebrew) when the roll resolves. |
| R10 | 4:3 — messaging flow | Show **"הטל קוביה"** before the single-die roll, then **"לך אחורה X צעדים!"** after the result. |
| R11 | 4:3 — bar with 2+ pieces | Only one piece enters (using the single rolled die); the rest stay. Correct as currently implemented. |
| R12 | 5:1 — bear-off cost | One pip per bear-off regardless of distance, same as a regular double. Correct as currently implemented. |
| R13 | Star Mars | Wins the **entire championship** immediately. Correct as currently implemented. |
| R14 | Bar entry — move accounting | Each entry from the bar = 1 move. (E.g., 1 piece on bar + double → enter + 3 more moves.) |
| R15 | Bear-off — move accounting | Each bear-off = 1 move. (Double = 4 moves total in any combination of entries, board moves, bear-offs.) |
| R16 | Table Flip wording | On the 3rd consecutive double, "the current turn ends immediately, the dice pass to the opponent, **and the table is flipped**." |

---

## 3. New Features

### 3.1 Persistent Doubles Counter (live UI)

A small index appears next to the existing **"How many checkers borne off"** indicator. It displays the current player's consecutive-doubles count (0, 1, or 2). It increments every time a regular double is rolled and resets when:
- A non-double roll lands.
- The turn ends without a double in play.
- The opponent's turn begins.

It is **not** incremented on special rolls (1:2, 4:5, 6:5, 6:3, 5:2, 4:3, 5:1) — only regular doubles bump it. A 6:3 re-roll **does not** reset the count (R7). When the count would reach 3 → Table Flip fires (existing behavior).

**UI placement:** Side-by-side with the bear-off counter, both per-player. Style matches the bear-off counter so they read as a matched pair of "turn-state" indicators. Replaces the old header 🔥 fire badges entirely.

### 3.2 Redesigned 4:5 Double Chooser Panel

Replace the current chooser. New layout:

- **Header text:** "Whatever double you like" (Hebrew equivalent in-game).
- **Body:** All 6 doubles shown as buttons (1:1, 2:2, 3:3, 4:4, 5:5, 6:6).
- **Selectability filter (R1 + R2):**
  1. Compute, for each candidate double `v`, whether ALL 4 moves of `v` could be played legally given current board, bar status, and home position.
  2. If at least one `v` is fully completable, **only fully-completable values are enabled.** Other buttons are visibly disabled.
  3. If no `v` is fully completable, **all 6 buttons remain enabled** (fallback).
- Disabled buttons show their face but are unclickable and visually subdued.

### 3.3 Single-Die Re-roll Display for 4:3 and 5:1

Both 4:3 and 5:1 currently display the *original* 4:3 / 5:1 dice while prompting the re-roll. New behavior:

- **Hide** the original pair of dice as soon as the special-roll handler engages.
- **Render a single die on the board** in the same visual style and position as a regular roll, but with only one die.
- On result: the single die shows its rolled face and the corresponding message (R10 for 4:3; for 5:1, the existing "play 4 moves of X" flow).

### 3.4 Special-Roll Messaging

- **5:2:** "לך 5:2 אחורה!" displayed when the roll resolves to backward mode (R9).
- **4:3:** Two-step — "הטל קוביה" then "לך אחורה X צעדים!" (R10).
- **5:1:** No new wording beyond the existing 4-moves UI; only the single-die-display change in 3.3 applies.

All captions auto-clear after ~3 seconds via the shared `MessageBanner` component.

---

## 4. Engine Corrections

### 4.1 Move Accounting Normalization
Files: `neshbesh-app/src/store/useGameStore.ts` (move-execution path), `engine/index.ts` (`getDiceAfterMove`, ~242–293).

Every move event consumes exactly one pip under the current pool-of-pips model. Already true for regular doubles and 5:1; the audit confirmed bar entry, board move, and bear-off all consume one pip in the four-move pools. Verify no path lets a double's bear-off consume more than one pip incorrectly. (R14, R15.)

### 4.2 4:5 Choose-Double Legality Gate
Files: `useGameStore.ts:651–659` (`chooseDouble`), `engine/index.ts` (new helper), `DoubleChooserPanel.tsx`.

New helper:
```
canFullyCompleteDouble(board, sign, barCount, v) → boolean
```
Simulates 4 moves of value `v` from the current state, exhausting bar entries first, then any legal forward play (including bear-offs); returns true only if all 4 pips would be consumed by legal moves.

`DoubleChooserPanel` calls the helper for each `v ∈ {1..6}`. If `Σ canFullyComplete(v) > 0`, disable any `v` with `false`. Otherwise enable all 6 (fallback). `chooseDouble` also defensively ignores non-choosable values.

### 4.3 6:5 Nesh Strike — Free-Move Scope After Bar Clears
Files: `useGameStore.ts:513–554`, `engine/index.ts:354–390` (`getFreeMoveFinals`).

Old behavior: latched `neshStrikeStartedOnBar` at trigger and kept opponent-home restriction for **both** moves regardless of bar state.

New behavior:
- On the **second** free move, re-check `hasBarPieces(board, sign)` after move 1 completes.
- If `false` (bar cleared during move 1) → `getFreeMoveFinals(..., opponentHomeOnly=false)` for move 2. (R4, R6.)
- If `true` (still bar pieces after move 1) → keep `opponentHomeOnly=true`.

This generalizes the "1 piece on bar" case (move 1 clears it → move 2 is full-board) and the "2+ pieces on bar" case (move 1 clears one but bar still occupied → move 2 still restricted).

### 4.4 6:5 Nesh Strike — Pure Bear-Off Behavior
Files: `useGameStore.ts:385–412`.

When the strike triggers and the player is **not** on the bar, the free moves are already full-board (R5). No code change expected; verify with manual test (all 15 in home + opp blot → 6:5 → free moves can land anywhere on the board).

### 4.5 Doubles Counter — Live Read-Out
Files: `useGameStore.ts` (state shape) + new `DoublesCounterChip.tsx`.

Expose `doublesCount` and `blockedDoubleStreak` via selectors. Add the chip next to every bear-off counter (board, sidebar, dice bar, remote bar, opponent chip) — mirrored in hotseat layout, present in remote bottom bar per CLAUDE.md § 3 "Multiplayer Sync".

### 4.6 Special-Roll Messaging Surface
Files: `useGameStore.ts` phase transitions + new `MessageBanner.tsx`.

Push messages on phase entry:
- 5:2 → "לך 5:2 אחורה!" (R9).
- 4:3 `SPECIAL_43_ROLL` → "הטל קוביה".
- 4:3 `SPECIAL_43_RESULT` → "לך אחורה {r} צעדים!".

Banner renders phase-agnostically from `state.message` and clears itself.

### 4.7 Single-Die Visual for 4:3 and 5:1 Re-rolls
Files: dice rendering (`DicePanel.tsx` already handles single-die phases; `SingleDieRoller.tsx` is legacy and now Hebrew-localized).

Render branch for phases `SPECIAL_43_ROLL`, `SPECIAL_43_RESULT`, `SPECIAL_51_ROLL`: show **one** die in the standard board dice position. Hide the original 4:3 / 5:1 pair the moment the special-roll handler engages.

---

## 5. Files Touched

| File | Purpose |
|---|---|
| `neshbesh-app/src/store/useGameStore.ts` | Special-roll handlers (377–500), free-move executor (513–554), choose-double (651–659), state extensions for doubles counter and messages. |
| `neshbesh-app/src/engine/index.ts` | `getFreeMoveFinals` full-board mode; new `canFullyCompleteDouble` helper near `calculatePossibleMoves` / `getDiceAfterMove`. |
| `neshbesh-app/src/components/DoubleChooserPanel.tsx` | Header text, all-6-options layout, disable-by-completability filter. |
| `neshbesh-app/src/components/DoublesCounterChip.tsx` (new) | Live doubles-counter indicator. |
| `neshbesh-app/src/components/MessageBanner.tsx` (new) | Phase-agnostic caption surface. |
| `neshbesh-app/src/components/Board.tsx`, `OpponentHeaderChip.tsx`, `RemoteBottomBar.tsx`, `SingleDieRoller.tsx` | Counter placement, message banner mounting, Hebrew copy. |
| `neshbesh-app/App.tsx` | Wire new components into root layout. |

---

## 6. Out of Scope

- Bear-off "farther from exit" rule (already correct per audit).
- 1:2 skip behavior (correct).
- 6:3 re-roll counter behavior (R7 confirms current behavior).
- 5:1 bear-off cost (R12 confirms current behavior).
- 4:3 bar with 2+ pieces (R11 confirms current behavior).
- 5:2 / 4:3 inability to bear off (intentional — backward moves cannot reach bear-off sentinels).
- Star Mars → championship (R13 confirms current behavior).
- Initial roll mechanics (no annotations received → leave as-is).

---

## 7. Verification Checklist

Manual walk-through in dev (hotseat mode is fastest):

**Doubles Counter:**
- [ ] Roll a regular double → counter shows 1. Roll another → 2. Third → Table Flip fires.
- [ ] Roll a non-double after a double → counter resets to 0.
- [ ] Roll 6:3 → choose re-roll → counter NOT reset.
- [ ] Special rolls do NOT bump the counter.

**4:5 Chooser:**
- [ ] No bar pieces, open board → all 6 doubles enabled.
- [ ] On bar with 5-point and 6-point blocked → 5:5 and 6:6 disabled, others enabled if completable.
- [ ] Bearing off with only 1 piece left on point 2 → only doubles where 4 pips don't overshoot illegally are enabled, OR all enabled if none can fully complete.
- [ ] Fallback works: scenario where no double can complete all 4 → all 6 enabled.

**Nesh Strike (6:5):**
- [ ] No bar, opponent has blots → blots → bar, 2 full-board free moves.
- [ ] 1 piece on bar → move 1 forced to bar entry into opp home; move 2 = full-board free move (R4).
- [ ] 2 pieces on bar → both entries to opp home; if both clear, subsequent free moves on full board.
- [ ] Pure bear-off (all 15 in home) → free moves can land anywhere, no bear-off (R5).
- [ ] Opponent home fully blocked + on bar → both free moves forfeited (existing SKIP path).

**5:2 Backwards:**
- [ ] Normal play shows message "לך 5:2 אחורה!".
- [ ] Pure bear-off → forced backward shuffle (R8), no skip.
- [ ] 1 piece on bar → forward entry then backward from different piece (existing behavior, verify message timing).

**4:3 Roll-for-Backwards:**
- [ ] Roll 4:3 → original dice hide, single die appears, "הטל קוביה" message shown.
- [ ] Roll the die → "לך אחורה X צעדים!" message appears, single die shows the rolled face.
- [ ] On bar → single die enters forward, turn ends (R11).

**5:1 Roll-for-Double:**
- [ ] Roll 5:1 → original dice hide, single die appears.
- [ ] Roll → 4 moves of `d`, bar entry / bear-off each consume one pip (R12).

**Move accounting (R14 / R15):**
- [ ] Regular double + 1 on bar → entry uses 1 pip, 3 remaining.
- [ ] Regular double in bear-off → each bear-off consumes 1 pip exactly.

**Star Mars (R13):**
- [ ] Trigger a Mars + opp on bar → championship ends immediately (set/match counters skip to win state).

---

## 8. Execution Sequence

1. Engine: `canFullyCompleteDouble` helper + 4:5 chooser gating. ✅
2. Engine: Nesh Strike free-move scope change (full-board after bar clears). ✅
3. State: doubles counter exposure + reset rules. ✅
4. UI: `DoublesCounterChip` placement next to bear-off counter (hotseat mirrored; remote bottom bar). ✅
5. UI: 4:5 chooser redesign — header + 6 buttons + disable filter. ✅
6. UI: single-die display for 4:3 / 5:1 phases. ✅ (`DicePanel` already handled phases; legacy `SingleDieRoller` localized.)
7. Messaging: 5:2 + 4:3 Hebrew captions via `MessageBanner`. ✅
8. Pass `tsc --noEmit`. ⏳ Pending manual run.
9. Manual verification per § 7. ⏳ Pending.
10. Commit a95fcac pushed to `29/5` for Vercel preview. ✅

---

## 9. Open Items

- **Star Mars + Table Flip ordering:** If a player triggers both simultaneously, Star Mars wins (championship overrides). Currently correct in code; logged for completeness.
- **Initial roll = special pair:** e.g., opener throws 6:5. Current behavior: special roll fires from move 1. Leave as-is unless flagged.
- **Hebrew vs English copy:** All in-game captions are Hebrew (R9, R10). If English support is needed later, route through a single i18n surface.
