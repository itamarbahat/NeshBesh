# NeshBesh Agents

Automated agents for managing the NeshBesh project.

## Agents

### NotebookLM Sync Agent

**Purpose**: Automatically synchronize NeshBesh project files with the NotebookLM notebook.

**Files**:
- `notebooklm-sync.md` - Detailed documentation about the sync agent
- `notebooklm_sync.py` - Python implementation
- `notebooklm_sync.ps1` - PowerShell implementation (Windows)
- `post-commit-notebooklm-sync.sh` - Git hook for automatic syncing

**Notebook ID**: `7f750b9b-d47b-4b4d-96bf-ff55d0189e44`

### Quick Start

#### Manual Sync (Windows) - RECOMMENDED
```powershell
cd .github/agents
powershell -ExecutionPolicy Bypass -File sync-notebook.ps1
```

#### Manual Sync (Windows - Alternative)
```powershell
cd .github/agents
powershell -ExecutionPolicy Bypass -File notebooklm_sync.ps1 -Force
```

#### Manual Sync (macOS/Linux)
```bash
python3 notebooklm_sync.py --force
```

#### Check Sync Status
```bash
cat ../.notebooklm-sync-state.json
```

### What Gets Synced

The agent automatically consolidates and uploads these file groups:

1. **neshbesh-sources.txt** (Types & Engine)
   - `neshbesh-app/src/types/index.ts`
   - `neshbesh-app/src/engine/index.ts`
   - `neshbesh-app/src/store/useGameStore.ts`
   - `neshbesh-app/src/store/useMultiplayerStore.ts`

2. **neshbesh-components.txt** (UI Components)
   - `neshbesh-app/src/components/Board.tsx`
   - `neshbesh-app/src/components/DicePanel.tsx`
   - `neshbesh-app/src/components/ThrowingDiceOverlay.tsx`
   - `neshbesh-app/src/components/SpecialRollOverlay.tsx`
   - `neshbesh-app/src/components/DoubleChooserPanel.tsx`

3. **neshbesh-app-animations.txt** (App & Animations)
   - `neshbesh-app/App.tsx`
   - `neshbesh-app/src/animations/useTableFlipAnimation.ts`
   - `neshbesh-app/src/animations/useEatAnimation.ts`
   - `neshbesh-app/src/animations/useDiceRollAnimation.ts`

4. **neshbesh-documentation.txt** (Documentation)
   - `CLAUDE.md`
   - `README.md`

### Future Enhancements

- [ ] Git post-commit hook integration
- [ ] GitHub Actions workflow for PR syncs
- [ ] Incremental syncing (only changed files)
- [ ] Support for additional NotebookLM notebooks
- [ ] Dynamic audit reports of synced content

### Troubleshooting

**Error: "notebooklm-py not found"**
- Install: `pip install notebooklm-py`

**Error: "Notebook not found"**
- Check that you're authenticated: `python -m notebooklm list`
- Verify notebook ID in the sync script

**Files not syncing**
- Check sync state: `cat ../.notebooklm-sync-state.json`
- Run with verbose flag: `notebooklm_sync.ps1 -Verbose`
- Ensure files exist at the specified paths

### Development

To modify what gets synced, edit the `CONSOLIDATIONS` object in:
- `notebooklm_sync.ps1` (PowerShell)
- `notebooklm_sync.py` (Python)
- `notebooklm-sync.md` (Documentation)

Keep all three in sync!
