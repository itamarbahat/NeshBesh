# NeshBesh

## 0. Token Hygiene (read first, save tokens)

*   **`.claudeignore`** — authoritative list of paths Claude must never open without explicit instruction. Includes `node_modules/`, lockfiles, native build outputs, binary assets, and secrets.
*   **Never read lockfiles** (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) unless debugging a specific dependency resolution issue. They are huge and nearly never useful.
*   **Never read `node_modules/`** — read the library's TypeScript declarations from project `src/` only, or consult documentation.
*   **Binary assets** (`.png`, `.mp3`, …) should only be opened with the multimodal reader when the user is actively discussing their content.
*   **Large generated files** (`dist/`, `build/`, `.expo/`, `coverage/`) are always stale and irrelevant — skip.
*   When diagnosing bugs, read only the file(s) at the error location; do not pre-emptively open siblings "for context" unless the symptom demands it.

## 1. Core Architecture & Board

*   **Data Structure**: `number[26]` array (0 and 25 are Bars). Positive = White, Negative = Black.
*   **Interaction Model**: **Advanced 2-Click Move System**.
    *   **Click 1 (Selection)**: Engine calculates all possible paths based on remaining dice.
        *   **Blue Highlight**: Immediate/Intermediate steps (steps within a move sequence).
        *   **Green Highlight**: Final valid destination indices where the piece can land.
    *   **Click 2 (Execution)**: Player selects a highlighted slot.
*   **Rule: "Touched-Moved" (נגעת נסעת)**: Once the second click is performed, the move is finalized. No Undo.

## 2. NeshBesh Rules & Scoring

### Turn Flow
*   **Only regular doubles** grant an automatic extra turn. Special rolls (4:5, 6:5, 6:3, 5:2, 4:3, 5:1) do **not** grant an extra turn, even if the resulting play is a double.
*   **3 Consecutive Doubles**: "Flip the Table" - The current player's turn ends immediately, and dice pass to the opponent.
*   **Initial Roll**: Each player throws one die. The player whose die is higher goes first AND plays those two dice as their first move (i.e., the initial roll doubles as both "who starts" and "opening move").

### Special Rolls
*   **1:2**: Turn ends immediately (Skip).
*   **4:5**: Player chooses ANY double (1:1 to 6:6) to play.
*   **6:5 (The Nesh Strike)**:
    *   All opponent "blots" (columns with exactly 1 piece) are automatically moved to the Bar.
    *   Player performs 2 "Free Moves" to any non-blocked column on the board.
*   **6:3**: Choice - Play 6:3 or Re-roll (re-roll keeps the double-counter active).
*   **5:2**: Move 5 and 2 (or 7) BACKWARDS.
    *   **Bar exception**: If the player has a piece on the Bar, entering from the Bar is FORWARD using one of {5, 2} and counts as the first move. The remaining die is then played BACKWARDS from a **different** piece on the board. If two or more bar pieces exist, both dice are used for forward entry (no backward move).
*   **4:3**: Manual Trigger - Player must roll 1 die. The result is the number of steps to move BACKWARDS.
    *   **Bar exception**: If the player has a piece on the Bar, after rolling the single die they enter FORWARD at that value (if possible) and the turn ends. No backward move.
*   **5:1**: Manual Trigger - Player must roll 1 die. The result determines which Double they play (e.g., rolling a 4 = Double 4).

### Scoring & Match Structure
*   **Simple Win**: 1 Point.
*   **Mars**: 2 Points (Opponent hasn't cleared any pieces).
*   **Turkish Mars**: 3 Points (Mars + opponent has pieces in winner's home).
*   **Star Mars**: IMMEDIATE CHAMPIONSHIP WIN (Mars + opponent has a piece on the Bar).
*   **Tournament**: First to 3 sets, where each set is first to 3 points.

## 3. UX & UI Requirements

### Animation & Visuals
*   **Animations**: Built using **Reanimated / Moti**. Distinct visual animations for "Eating" a piece and "Table Flip".
*   **Pop-ups**: Dismissible tutorial cards explaining special rules as they happen.
*   **Static Layout**: Board mapping based on player side (Left/Right home board).

### Setup Dependencies
A standard development installation should include `lucide-react` for distinct icons alongside Zustand and Reanimated.

## 4. Sub-Agents
### 🛠 DEBUGGER Agent
- **Role**: Specialized in error analysis and resolution from any device (Phone, iPad, PC).
- **Trigger**: `@Debugger: [error info]`
- **Protocol**: Categorize -> Context Map -> Fix -> Verify (TSC) -> Report.
- **Skill File**: `.github/agents/debugger.agent.md`
