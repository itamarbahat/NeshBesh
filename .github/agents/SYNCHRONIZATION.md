# 🔄 Agent Synchronization Guide

## Overview

NeshBesh maintains **dual-location agent specifications** to support two different systems:

- **`.github/agents/`** — GitHub Actions & automation workflows (`.agent.md` format)
- **`.claude/agents/`** — Claude Code local development (`.md` format)

Both locations must stay **synchronized** whenever an agent is updated. This document defines the synchronization protocol.

---

## 🔗 Agent Synchronization Map

### Agents That Require Dual Maintenance

| Agent Name | `.github/` File | `.claude/` File | Last Sync | Status |
|------------|-----------------|-----------------|-----------|--------|
| Master Orchestrator | `master.agent.md` | `master.md` | 2026-05-03 | ✅ Synced |
| Debugger | `debugger.agent.md` | `debugger.md` | 2026-05-03 | ✅ Synced |
| Logic Engine | `logic.agent.md` | `logic.md` | 2026-05-03 | ✅ Synced |
| Stylist/UI | `stylist.agent.md` | `stylist.md` | 2026-05-03 | ✅ Synced |
| FX/Animations | `fx.agent.md` | `fx.md` | 2026-05-03 | ✅ Synced |
| Bridge/Firebase | `bridge.agent.md` | `bridge.md` | 2026-05-03 | ✅ Synced |
| Sync Coordinator | `sync-coordinator.agent.md` | (planning) | 2026-05-03 | ⏳ Not Yet |

### Agents That Don't Require Sync

| Agent Name | Location | Why No Sync |
|------------|----------|------------|
| Plan Agent | `.github/agents/` (if exists) | Claude Code Plan mode (internal) |
| Explore Agent | `.github/agents/` (if exists) | Claude Code Explore mode (internal) |

### Scripts & Automation (GitHub Only)

These files live **only in `.github/agents/`** and do NOT sync to `.claude/`:

- `notebooklm_sync.py` — Python automation
- `notebooklm_sync.ps1` — PowerShell automation
- `post-commit-notebooklm-sync.sh` — Git hooks
- `sync-notebook.ps1` — Alternative sync
- `notebooklm-sync.md` — Documentation

---

## 📋 Format Differences

### `.agent.md` Format (GitHub)

**Header**:
```markdown
# Agent Name

**Type**: Agent Name / Specialized Agent

**Trigger**: When to invoke this agent
- Specific conditions or commands
- Example use cases
```

**Purpose**: Explicit metadata for GitHub Actions workflow integration.

**Location**: `.github/agents/*.agent.md`

### `.md` Format (Claude Code)

**Header**:
```markdown
# Agent Name

**Type**: Agent Name / Specialized Agent

**Description**: One-line description for Claude Code sidebar.
```

**Purpose**: Lightweight registration in Claude Code's local agent registry.

**Location**: `.claude/agents/*.md`

### Key Differences

| Aspect | `.agent.md` | `.md` |
|--------|-----------|------|
| Metadata Markers | Explicit (for CI/CD parsing) | Minimal (for readability) |
| Tool Declarations | Verbose (all available tools) | Concise (commonly used tools) |
| Example Workflows | GitHub Actions workflows | Claude Code chat examples |
| README References | Yes (links to CI/CD) | No |

---

## ✅ Synchronization Checklist

### When You Update an Agent

Follow this checklist to keep both locations synchronized:

#### Step 1: Identify Which Agent You're Updating
```
□ Master
□ Debugger
□ Logic
□ Stylist
□ FX
□ Bridge
□ Sync Coordinator
□ Other: _______________
```

#### Step 2: Update the GitHub Version
```
□ Edit: .github/agents/{agent-name}.agent.md
□ Update: Role, Triggers, Responsibilities, Tools
□ Update: Example workflows or CI/CD metadata
□ Test: Run locally with Claude Code to verify
```

#### Step 3: Update the Claude Code Version
```
□ Edit: .claude/agents/{agent-name}.md
□ Copy: Core content from .agent.md
□ Simplify: Remove GitHub Actions-specific markers
□ Verify: Content matches in intent and responsibility
□ Marker: Add "Last Sync: YYYY-MM-DD" at top
```

#### Step 4: Verify Synchronization
```
□ Read: .github/agents/{agent-name}.agent.md
□ Read: .claude/agents/{agent-name}.md
□ Confirm: Same role, triggers, and responsibilities
□ Confirm: Content is semantically identical
□ Document: Update this SYNCHRONIZATION.md table with date
```

#### Step 5: Commit & Push
```
□ Stage: git add .github/agents/*.md .claude/agents/*.md
□ Commit: git commit -m "sync: update {agent-name} across environments"
□ Push: git push origin master
```

---

## 🔍 Manual Sync Verification Script

Run this periodically to check sync status:

### Bash / PowerShell Check

```bash
# List all agents in .github/agents/
echo "=== GitHub Agents ==="
ls -la .github/agents/*.agent.md | awk -F'/' '{print $NF}' | sed 's/.agent.md//'

# List all agents in .claude/agents/
echo ""
echo "=== Claude Code Agents ==="
ls -la .claude/agents/*.md | awk -F'/' '{print $NF}' | sed 's/.md//'

# Compare (should have matching agent names)
echo ""
echo "=== Status ==="
diff <(ls -1 .github/agents/*.agent.md | sed 's/.agent.md//;s/.*\///') \
     <(ls -1 .claude/agents/*.md | sed 's/.md//;s/.*\///') \
  || echo "⚠️  Sync mismatch detected!"
```

### What to Do If Mismatch Found

1. **Agent in `.github/` but not `.claude/`**:
   ```bash
   cp .github/agents/{agent-name}.agent.md .claude/agents/{agent-name}.md
   # Then edit .claude version to remove .agent-specific markers
   ```

2. **Agent in `.claude/` but not `.github/`**:
   ```bash
   cp .claude/agents/{agent-name}.md .github/agents/{agent-name}.agent.md
   # Then edit .github version to add .agent-specific markers
   ```

---

## 🚀 Recommended Sync Process

### For Small Changes (Typos, Minor Updates)

1. Update `.github/agents/{agent-name}.agent.md`
2. Copy change to `.claude/agents/{agent-name}.md`
3. Commit both: `git commit -m "fix: {agent-name} typo"`

### For Major Changes (New Triggers, Responsibilities)

1. Plan changes in a comment or draft
2. Update `.github/agents/{agent-name}.agent.md`
3. Test the updated agent locally
4. Mirror changes to `.claude/agents/{agent-name}.md`
5. Update the synchronization table above
6. Commit: `git commit -m "feat: {agent-name} new capabilities"`

### For New Agents

1. Create in `.github/agents/{agent-name}.agent.md` first
2. Document purpose, triggers, and responsibilities
3. Create `.claude/agents/{agent-name}.md` as mirror
4. Test locally with Claude Code
5. Update sync table: add new row with date
6. Commit both

---

## 📊 Sync Status Dashboard

### Current Status (as of 2026-05-03)

```
✅ SYNCHRONIZED:
  - Master Orchestrator (master.agent.md ↔ master.md)
  - Debugger (debugger.agent.md ↔ debugger.md)
  - Logic Engine (logic.agent.md ↔ logic.md)
  - Stylist (stylist.agent.md ↔ stylist.md)
  - FX/Animations (fx.agent.md ↔ fx.md)
  - Bridge (bridge.agent.md ↔ bridge.md)

⏳ PENDING:
  - Sync Coordinator (sync-coordinator.agent.md only, .claude mirror needed)

🔧 GITHUB-ONLY (No sync required):
  - notebooklm_sync.py
  - notebooklm_sync.ps1
  - post-commit-notebooklm-sync.sh
  - sync-notebook.ps1
  - notebooklm-sync.md
```

---

## 🛠️ Tools & Automation

### Future: Auto-Sync Agent

Once implemented, a GitHub Actions workflow or Claude Agent could:

1. Detect changes to `.github/agents/*.agent.md`
2. Automatically update corresponding `.claude/agents/*.md`
3. Create PR or commit if changes are safe
4. Alert on sync conflicts

**Status**: Planning phase

### Manual Sync Reminder

Add this to your CI/CD or pre-commit hooks:

```bash
#!/bin/bash
# Check if .agent.md and .md files are out of sync

for agent_file in .github/agents/*.agent.md; do
  base_name=$(basename "$agent_file" .agent.md)
  claude_file=".claude/agents/${base_name}.md"
  
  if [ ! -f "$claude_file" ]; then
    echo "⚠️  Missing sync: $claude_file"
    exit 1
  fi
done

echo "✅ All agents synchronized"
```

---

## 📝 Notes & Observations

### Why Dual Locations?

1. **GitHub Actions Need Explicit Markers**: The `.agent.md` format allows GitHub workflows to parse agent metadata programmatically.

2. **Claude Code Has Its Own Registry**: Claude Code reads `.claude/agents/*.md` as a local directory of available agents, independent of GitHub.

3. **Different Audiences**: GitHub admins maintain CI/CD workflows; developers maintain Claude Code settings.

4. **Flexibility**: Keeping both allows future integration with other systems (e.g., GitHub Copilot, AI-assisted GitHub Actions).

### Historical Context

- **Created**: Dual-location agents established when NeshBesh integrated Claude Code + GitHub Actions
- **Purpose**: Support both local development (Claude Code) and automated workflows (GitHub)
- **Evolution**: May consolidate in the future if tooling improves

---

## 🎯 Action Items

### Immediate (Do This Now)

- [ ] Verify all 6 core agents are synchronized
- [ ] Create `.claude/agents/sync-coordinator.md` to mirror `sync-coordinator.agent.md`
- [ ] Update this document's sync table with today's date

### Short-Term (This Sprint)

- [ ] Run manual sync verification script monthly
- [ ] Document any new agents in this synchronization guide
- [ ] Consider adding pre-commit hook for sync validation

### Long-Term (Future Planning)

- [ ] Implement GitHub Actions workflow for auto-sync
- [ ] Consolidate agent definitions if tooling allows
- [ ] Create agent update protocol with approval process

---

## 📞 Questions?

If you're unsure about:
- **When to sync**: Check the trigger in the agent spec
- **How to format**: Compare an existing sync pair (e.g., `master.agent.md` vs `master.md`)
- **What's broken**: Run the sync verification script and report discrepancies

**Remember**: Keep the intent synchronized, not necessarily the format. The two files should read identically in purpose, even if GitHub-specific metadata differs.
