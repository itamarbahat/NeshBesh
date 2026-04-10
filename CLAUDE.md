# NeshBesh

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
*   Any Double grants an automatic extra turn.
*   **3 Consecutive Doubles**: "Flip the Table" - The current player's turn ends immediately, and dice pass to the opponent.

### Special Rolls
*   **1:2**: Turn ends immediately (Skip).
*   **4:5**: Player chooses ANY double (1:1 to 6:6) to play.
*   **6:5 (The Nesh Strike)**:
    *   All opponent "blots" (columns with exactly 1 piece) are automatically moved to the Bar.
    *   Player performs 2 "Free Moves" to any non-blocked column on the board.
*   **6:3**: Choice - Play 6:3 or Re-roll (re-roll keeps the double-counter active).
*   **5:2**: Move 5 and 2 (or 7) BACKWARDS.
*   **4:3**: Manual Trigger - Player must roll 1 die. The result is the number of steps to move BACKWARDS.
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
