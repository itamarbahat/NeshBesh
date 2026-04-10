# 🎲 NeshBesh

**NeshBesh** is a mobile backgammon game with a twisted set of custom dice rules, built with React Native + Expo. It's a digital adaptation of a house-rules variant of Shesh-Besh (שש-בש) played in Israel — where certain dice combinations trigger special mechanics ranging from forced backwards moves to the devastating "Nesh Strike."

---

## Motivation

Standard backgammon apps are everywhere. NeshBesh was born from the desire to faithfully implement a specific set of house rules that dramatically change the strategic landscape of the game:

- Special dice combinations aren't just flavor — they alter turn flow, introduce backwards movement, grant free moves, and can even end your turn before it starts.
- The **"Touched-Moved" (נגעת נסעת)** rule makes every tap a commitment — no undo, no second-guessing.
- A multi-layered scoring system with Mars, Turkish Mars, and the instant-win Star Mars keeps matches tense until the very last piece.

The project also serves as a testing ground for **multi-agent AI-assisted development** — the codebase is organized around 5 specialized Copilot agents (Stylist, Logic, FX, Debugger, and a Master orchestrator) that each own a domain of the app.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.81 + Expo 54 |
| Language | TypeScript 5.9 |
| State | Zustand 5 |
| Animations | Reanimated 4 + Moti |
| Audio | expo-av |
| Icons | lucide-react-native |
| Board Graphics | react-native-svg (cone triangles) |

---

## Architecture Overview

### Data Structures

#### Board — `number[26]`

The board is a flat array of 26 integers. Indices 0 and 25 are the **Bars** (holding captured pieces). Indices 1–24 are the playable points.

| Value | Meaning |
|---|---|
| Positive | White pieces (sign `+1`) |
| Negative | Black pieces (sign `-1`) |
| `board[0]` | White's Bar (White captured pieces awaiting re-entry) |
| `board[25]` | Black's Bar |

Sentinel values for bear-off destinations live outside the array:
- `BEAR_OFF_WHITE = 26` — White bears off past point 24
- `BEAR_OFF_BLACK = -1` — Black bears off past point 1

#### State (Zustand Store)

```
NeshBeshState {
  board: number[26]          // Board positions
  whiteBorneOff: number      // White pieces cleared (0–15)
  blackBorneOff: number      // Black pieces cleared (0–15)
  currentPlayer: 1 | -1     // +1 = White, -1 = Black
  phase: Phase               // Current game phase (see below)
  dice: [number, number]     // Last rolled pair
  availableDice: number[]    // Dice values still available for moves
  doublesCount: number       // Consecutive doubles counter (0–2, resets at 3)
  extraTurn: boolean         // Whether player rolls again after exhausting dice
  backward: boolean          // Whether current moves go backwards (5:2, 4:3)
  selectedIndex: number|null // First click selection (2-click system)
  intermediateHighlights: number[]  // Blue-highlighted intermediate steps
  finalHighlights: number[]         // Green-highlighted valid destinations
  moveLocked: boolean        // "Touched-moved" lock
  neshStrikeFreeMovesLeft: number   // 6:5 free moves remaining (0–2)
  score: Score               // Points and sets tracker
  victoryInfo: VictoryInfo   // Last game result details
  message: string|null       // UI message string
}
```

#### Phase State Machine

The `phase` field drives the entire game flow. Each phase determines which UI elements are shown and which user actions are valid:

```
WAITING_ROLL ──→ (roll dice) ──→ MOVING           (normal roll)
                               → SKIP              (1:2)
                               → SPECIAL_CHOOSE_DOUBLE (4:5)
                               → SPECIAL_NESH_STRIKE_FREE_MOVE (6:5)
                               → SPECIAL_63_CHOICE (6:3)
                               → SPECIAL_43_ROLL   (4:3)
                               → SPECIAL_51_ROLL   (5:1)
                               → TABLE_FLIP        (3rd consecutive double)

SPECIAL_43_ROLL ──→ (roll 1 die) ──→ SPECIAL_43_RESULT ──→ (confirm) ──→ MOVING
SPECIAL_51_ROLL ──→ (roll 1 die) ──→ SPECIAL_51_RESULT ──→ (confirm) ──→ MOVING
SPECIAL_63_CHOICE ──→ play 6:3 ──→ MOVING
                   ──→ re-roll  ──→ WAITING_ROLL
SPECIAL_CHOOSE_DOUBLE ──→ (pick double) ──→ MOVING
SPECIAL_NESH_STRIKE_FREE_MOVE ──→ (2 free moves) ──→ WAITING_ROLL (extra turn)
SKIP ──→ (acknowledge) ──→ opponent's WAITING_ROLL
TABLE_FLIP ──→ (confirm) ──→ opponent's WAITING_ROLL
MOVING ──→ (dice exhausted + extraTurn) ──→ WAITING_ROLL (same player)
       ──→ (dice exhausted + !extraTurn) ──→ opponent's WAITING_ROLL
       ──→ (15 pieces borne off) ──→ GAME_OVER
```

---

## Special Dice Rules — Full Technical Reference

### 1:2 — Turn Skip

| Field | Value |
|---|---|
| **Trigger** | `(d1=1,d2=2)` or `(d1=2,d2=1)` |
| **Phase** | → `SKIP` |
| **availableDice** | `[]` (empty) |
| **UI** | Inline card with "תור עובר!" and "סבבה" dismiss button |
| **Resolution** | `acknowledgeSkip()` → calls `endTurnImpl()` → switches to opponent |

No moves are made. Turn passes immediately.

---

### 4:5 — Choose Any Double

| Field | Value |
|---|---|
| **Trigger** | `(d1=4,d2=5)` or `(d1=5,d2=4)` |
| **Phase** | → `SPECIAL_CHOOSE_DOUBLE` |
| **availableDice** | `[]` (awaiting choice) |
| **UI** | `DoubleChooserPanel` — 6 dice icons (1–6), player taps to choose |
| **Resolution** | `chooseDouble(value)` → `availableDice = [v, v, v, v]`, `extraTurn = false`, phase → `MOVING` |

The player picks any double (1:1 through 6:6). **No extra turn** is granted (unlike a naturally rolled double). The `doublesCount` is reset to 0.

---

### 5:1 — Roll for Your Double

| Field | Value |
|---|---|
| **Trigger** | `(d1=5,d2=1)` or `(d1=1,d2=5)` |
| **Phase** | → `SPECIAL_51_ROLL` |
| **availableDice** | `[]` (awaiting single die roll) |
| **UI** | DicePanel shows single die tap-to-roll prompt ("לחץ לזרוק") |
| **Single die result** | `rollSingleDie()` → phase `SPECIAL_51_RESULT`, `availableDice = [d, d, d, d]`, `extraTurn = false` |
| **UI (result)** | Card shows "שחק דאבל X" with "יאללה!" confirm |
| **Resolution** | `confirmSpecialResult()` → phase → `MOVING` |

Unlike 4:5, the player doesn't choose — fate decides. The rolled die determines which double is played. **No extra turn.**

---

### 5:2 — Backwards Move

| Field | Value |
|---|---|
| **Trigger** | `(d1=5,d2=2)` or `(d1=2,d2=5)` |
| **Phase** | → `MOVING` (immediate) |
| **availableDice** | `[5, 2]` |
| **backward** | `true` |
| **Resolution** | Normal 2-click move system, but direction is inverted |

The `backward` flag inverts the move direction calculation in `calculatePossibleMoves()` and `getDiceAfterMove()`. The `dir` becomes `-baseDir` instead of `baseDir`. Pieces move toward their own starting area instead of toward home.

---

### 4:3 — Roll for Backwards Steps

| Field | Value |
|---|---|
| **Trigger** | `(d1=4,d2=3)` or `(d1=3,d2=4)` |
| **Phase** | → `SPECIAL_43_ROLL` |
| **availableDice** | `[]` (awaiting single die roll) |
| **UI** | DicePanel: single die tap-to-roll prompt |
| **Single die result** | `rollSingleDie()` → phase `SPECIAL_43_RESULT`, `availableDice = [d]`, `backward = true` |
| **UI (result)** | Card shows "לך אחורה X צעדים" with "יאללה!" confirm |
| **Resolution** | `confirmSpecialResult()` → phase `MOVING` with `backward = true`, 1 die to use |

The player rolls a single die and must move that many steps **backwards**. Only one move is made (single die in `availableDice`).

---

### 6:3 — Play or Re-roll

| Field | Value |
|---|---|
| **Trigger** | `(d1=6,d2=3)` or `(d1=3,d2=6)` |
| **Phase** | → `SPECIAL_63_CHOICE` |
| **availableDice** | `[6, 3]` (pre-loaded for "play" option) |
| **UI** | Card with "שחק 6:3" / "הטל שוב" buttons |
| **Play** | `choose63(false)` → phase `MOVING`, `availableDice = [6, 3]` |
| **Re-roll** | `choose63(true)` → phase `WAITING_ROLL`, dice cleared. **`doublesCount` stays** — consecutive double streak survives re-rolls. |

The player can choose to play the 6:3 normally or discard it and roll again. The re-roll preserves the doubles counter, so a player on a streak doesn't lose it.

---

### 6:5 — The Nesh Strike

| Field | Value |
|---|---|
| **Trigger** | `(d1=6,d2=5)` or `(d1=5,d2=6)` |
| **Phase** | → `SPECIAL_NESH_STRIKE_FREE_MOVE` |
| **Board mutation** | `applyNeshStrike()` scans indices 1–24, finds all opponent blots (`board[i] === oppSign`), moves them to the opponent's bar |
| **neshStrikeFreeMovesLeft** | `2` |
| **availableDice** | `[]` (free moves don't consume dice) |
| **UI** | Message shows blot count. Player taps own pieces → green highlights on all non-blocked points (`getFreeMoveFinals()`) |
| **Resolution** | After 2 free moves complete → **same player gets another turn** (reset to `WAITING_ROLL` for same `currentPlayer`). `doublesCount` is preserved. |

The most powerful roll in the game. All opponent blots (single pieces) are captured to the bar, then the player places 2 of their own pieces on any valid points. After completion, the same player rolls again.

---

### Doubles

| Scenario | Behavior |
|---|---|
| **Any double** | `availableDice = [d, d, d, d]` (4 moves), `extraTurn = true`, `doublesCount++` |
| **2nd consecutive double** | Same as above, `doublesCount = 2` |
| **3rd consecutive double** | `TABLE_FLIP` — turn ends immediately, dice pass to opponent. Board flip animation plays. `doublesCount` resets to 0. |

---

## Scoring & Match Structure

| Result | Points | Condition |
|---|---|---|
| **Simple Win** | 1 | Opponent has borne off at least 1 piece |
| **Mars** | 2 | Opponent hasn't borne off any pieces |
| **Turkish Mars** | 3 | Mars + opponent has pieces in the winner's home board |
| **Star Mars** | ∞ (instant) | Mars + opponent has a piece on the Bar → **immediate championship win** |

**Match format:** First to 3 points wins a **set**. First to 3 sets wins the **championship**.

---

## 2-Click Move System

1. **Click 1 (Selection):** Player taps one of their pieces. The engine calls `calculatePossibleMoves()` which computes all reachable points from the selected piece using the remaining `availableDice`:
   - **Blue highlights** (`intermediateHighlights`): Points that are mid-step in a multi-die path (e.g., using die 1 of 2).
   - **Green highlights** (`finalHighlights`): Valid final destinations where the piece can legally land.

2. **Click 2 (Execution):** Player taps a highlighted destination. `applyMove()` updates the board, `getDiceAfterMove()` consumes the used dice. The move is **immediately locked** — no undo ("Touched-Moved" / נגעת נסעת).

Bar re-entry is enforced first: if a player has pieces on the bar, only bar-to-board moves are allowed.

---

## Interaction & UI

- **Dice rolling:** Swipe gesture (PanResponder) or tap in single-die modes. Refs (`canRollRef`, `onRollRef`) prevent stale closures.
- **Dice animation:** Dice fly from above at 1.5× scale, shrink to 0.55× as they land on the board (22px final size), and persist until next roll.
- **Special roll cards:** Shown inline below the dice panel — no blocking modals for gameplay decisions (SKIP, 6:3, 4:5, result confirmations).
- **Blocking overlays:** Only used for TABLE_FLIP animation and GAME_OVER results.
- **Responsive layout:** Board width is capped by `Math.min(width - 8, (height - 280) / 1.25)` — tested for all iPhones (12 mini through 17) and iPads (5th gen through Pro M4 13").
- **Sound effects:** Dice roll, piece move, piece capture, table flip (via expo-av).

---

## Project Structure

```
NeshBesh/
├── CLAUDE.md                          # Game rules (source of truth)
├── AGENTS-GUIDE.md                    # Agent documentation
├── .github/agents/                    # 5 Copilot agent config files
│   ├── master.agent.md
│   ├── stylist.agent.md
│   ├── logic.agent.md
│   ├── fx.agent.md
│   └── debugger.agent.md
└── neshbesh-app/
    ├── App.tsx                        # Root component, layouts, overlays
    ├── src/
    │   ├── types/index.ts             # TypeScript types (Phase, Score, etc.)
    │   ├── engine/index.ts            # Pure game logic (no side effects)
    │   ├── store/useGameStore.ts      # Zustand store (state + actions)
    │   ├── components/
    │   │   ├── Board.tsx              # Board layout with SVG cones
    │   │   ├── Slot.tsx               # Single point/triangle + pieces
    │   │   ├── Piece.tsx              # Individual game piece
    │   │   ├── DicePanel.tsx          # Dice display + roll gestures
    │   │   ├── ThrowingDiceOverlay.tsx # Dice throw + shrink animation
    │   │   ├── DoubleChooserPanel.tsx # 4:5 double selection UI
    │   │   ├── SpecialRollOverlay.tsx # TABLE_FLIP + GAME_OVER modals
    │   │   ├── SingleDieRoller.tsx    # Single die roll component
    │   │   └── SpecialDiceGlow.tsx    # Glow effect for special rolls
    │   ├── animations/
    │   │   ├── useTableFlipAnimation.ts
    │   │   ├── useDiceRollAnimation.ts
    │   │   └── useEatAnimation.ts
    │   └── audio/
    │       └── useAudioManager.ts     # Sound effect hooks
    └── assets/                        # Icons, splash, wood texture
```

---

## What's Been Built So Far

- Full board rendering with oak wood texture, SVG cone triangles, and responsive sizing
- Complete 2-click move system with blue/green highlights and "Touched-Moved" enforcement
- All 8 special dice rules implemented and wired to UI
- Doubles system with extra turns and 3-consecutive-doubles Table Flip
- Bearing off with bar-first enforcement
- 4-tier scoring system (Simple → Mars → Turkish Mars → Star Mars)
- Match structure: best-of-3 sets, each set first-to-3 points
- Swipe-to-roll dice with shrinking flight animation
- Sound effects for dice, moves, captures, and table flips
- Responsive portrait layout for all iPhones (12–17) and iPads (5th gen – Pro M4)
- Landscape layout with player sidebars
- Hebrew UI for special roll interactions
- 5-agent AI development system with domain separation

---

## Future Development

### Gameplay
- **AI Opponent** — Single-player mode with difficulty levels
- **Online Multiplayer** — Real-time matches via WebSocket or Firebase
- **Move history / replay** — Undo-free, but allow post-game review
- **Notation system** — Record and share games

### UX / Visual
- **Landscape polish** — Bring the new header design to landscape mode
- **Piece drag-and-drop** — Alternative to 2-click (optional preference)
- **Theme system** — Multiple board textures, piece styles
- **Tutorial mode** — Interactive walkthrough of special rules

### Technical
- **Unit tests** — Engine logic, move validation, scoring edge cases
- **E2E tests** — Full game flow with Detox or Maestro
- **Performance** — Profile and optimize for older iPads
- **Accessibility** — VoiceOver labels for board state

### Challenges
- **Move path ambiguity** — When multiple dice paths lead to the same destination, the engine must pick the correct dice consumption order. Current implementation handles 1–4 dice paths but edge cases in bearing-off with inexact dice values need more testing.
- **State synchronization for multiplayer** — The Zustand store is built for local play; networking requires a server-authoritative architecture with move validation.
- **Animation timing** — Coordinating dice throw animations, board state updates, and special roll card appearances without race conditions.
- **Touch target sizing** — Pieces stack tightly on crowded points; ensuring tappability on small phones (iPhone 12 mini, 375pt width) is an ongoing concern.

---

## Getting Started

```bash
cd neshbesh-app
npm install
npx expo start
```

Scan the QR code with Expo Go (iOS/Android) or press `i` for iOS simulator.

---

## License

This project is currently unlicensed (private use). Contact the author for permissions.
