# NeshBesh Workspace Summary

**Active Core Framework**: React Native (Expo SDK 54), Reanimated, Zustand, Moti.
**Theme**: Luxury Backgammon (Oak wood, dynamic lighting).
**App Location**: `neshbesh-app/`

## Workspace Structure
```
.github/agents/    → 5 Copilot custom agents
.vscode/           → VS Code settings
CLAUDE.md          → Game rules & project spec
SUMMARY.md         → This file
neshbesh-app/      → The Expo app (all source code)
  src/components/  → Board, Piece, DicePanel, overlays
  src/engine/      → Move calculation, validation
  src/store/       → Zustand game state
  src/animations/  → Reanimated/Moti hooks
  src/audio/       → Sound manager
  src/types/       → TypeScript definitions
```

## Code Map Status
1. **Board Core**: Scalable architecture — 24 points + 2 bars (`number[26]`), bear-off states.
2. **Logic Engine**: Centralized in `useGameStore` with all NeshBesh dice modifiers.
3. **Animations**: Physics hooks (`useTableFlipAnimation`, `useEatAnimation`, `useDiceRollAnimation`).

## 🤖 Deployed Intelligence (.github/agents/)
This project uses 5 VS Code Copilot custom agents located in `.github/agents/`:
- [master](.github/agents/master.agent.md): 👑 Orchestrator — plans features, decomposes tasks, delegates to sub-agents.
- [stylist](.github/agents/stylist.agent.md): 🎨 Agent A — UI/UX layout, themes, highlights, responsive scaling.
- [logic](.github/agents/logic.agent.md): ⚙️ Agent B — Game engine, dice rules, move validation, Zustand state.
- [fx](.github/agents/fx.agent.md): 🎭 Agent C — Animations (Reanimated/Moti), sound, haptics.
- [debugger](.github/agents/debugger.agent.md): 🔴 Agent D — Error triage, dependency conflicts, visual audits.
