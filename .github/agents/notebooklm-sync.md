# NotebookLM Sync Agent

## Purpose
Automatically synchronize NeshBesh project files with the NotebookLM notebook. This agent detects file changes and new relevant files, then updates the notebook sources accordingly.

## Configuration
- **Notebook ID**: `7f750b9b-d47b-4b4d-96bf-ff55d0189e44`
- **Notebook Name**: `NeshBesh`
- **Schedule**: Run on every commit (via git hook) or manually triggered

## Responsibilities

### 1. File Change Detection
Monitor these directories for changes:
- `neshbesh-app/src/` - Core game logic and components
- `CLAUDE.md` - Project documentation
- `README.md` - User-facing documentation

### 2. Source File Consolidation
Group relevant files into consolidated `.txt` files for upload:

**neshbesh-sources.txt** (Types & Engine):
- `neshbesh-app/src/types/index.ts`
- `neshbesh-app/src/engine/index.ts`
- `neshbesh-app/src/store/useGameStore.ts`
- `neshbesh-app/src/store/useMultiplayerStore.ts`

**neshbesh-components.txt** (UI Components):
- `neshbesh-app/src/components/Board.tsx`
- `neshbesh-app/src/components/DicePanel.tsx`
- `neshbesh-app/src/components/ThrowingDiceOverlay.tsx`
- `neshbesh-app/src/components/SpecialRollOverlay.tsx`
- `neshbesh-app/src/components/DoubleChooserPanel.tsx`

**neshbesh-app-animations.txt** (App & Animations):
- `neshbesh-app/App.tsx`
- `neshbesh-app/src/animations/useTableFlipAnimation.ts`
- `neshbesh-app/src/animations/useEatAnimation.ts`
- `neshbesh-app/src/animations/useDiceRollAnimation.ts`

**neshbesh-documentation.txt** (Docs):
- `CLAUDE.md`
- `README.md`

### 3. Upload Strategy
1. Check if consolidated file exists in notebook
2. If exists: Delete old version
3. Create new consolidated file with latest content
4. Upload to NotebookLM via `notebooklm-py` CLI

### 4. Tracking Changed Files
Maintain a `.notebooklm-sync-state.json` file to track:
- Last sync timestamp
- Hash of each consolidated file
- Source file modification times

Only re-upload if:
- Any source file has changed since last sync
- New relevant file detected
- Consolidation checksum differs

## Implementation Details

### Command: Manual Sync
```bash
python -m notebooklm use 7f750b9b-d47b-4b4d-96bf-ff55d0189e44
# Then run sync script
```

### Command: Check Sync Status
```bash
cat .notebooklm-sync-state.json
```

### Automation (Future)
Can be triggered via:
1. **Git Post-Commit Hook** - Auto-sync after commits
2. **GitHub Actions** - Sync on PR merges to main
3. **VS Code Extension Hook** - Sync after file saves (via Claude Code settings)

## Files to Never Sync
- `node_modules/**/*`
- `.expo/**/*`
- `dist/**/*`
- `build/**/*`
- `*.log`
- `.env` files
- Binary assets (images, audio)

## Error Handling
- If upload fails (400, 429, 500), log error and retry in next cycle
- If notebook becomes inaccessible, preserve local consolidated files for retry
- Notify user of sync status via console or log file

## Example Execution Flow

1. Detect change in `src/engine/index.ts`
2. Rebuild `neshbesh-sources.txt`
3. Calculate new checksum
4. Compare with `.notebooklm-sync-state.json`
5. If different:
   - Authenticate (use stored credentials)
   - List current sources in notebook
   - Find and delete old `neshbesh-sources` source
   - Upload new `neshbesh-sources.txt`
   - Update `.notebooklm-sync-state.json`
   - Log: "✅ Synced: neshbesh-sources.txt"
6. If identical:
   - Log: "⏭️ No changes to sync"

## Future Enhancements
- [ ] Selective file upload (upload only changed files)
- [ ] Incremental sync (only update changed consolidations)
- [ ] Generate dynamic audit report of what's synced
- [ ] Support for other NotebookLM notebooks (e.g., design docs)
- [ ] Integration with GitHub for PR-based syncs
