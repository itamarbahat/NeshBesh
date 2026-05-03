#!/bin/bash
# Git post-commit hook for NotebookLM sync
# This hook runs automatically after each commit and syncs relevant files to NotebookLM.
#
# To enable this hook, copy it to: .git/hooks/post-commit
# Make it executable: chmod +x .git/hooks/post-commit

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
SYNC_SCRIPT="$PROJECT_ROOT/.github/agents/notebooklm_sync.py"

# Only sync if Python script exists
if [ ! -f "$SYNC_SCRIPT" ]; then
    echo "⚠️  NotebookLM sync script not found at $SYNC_SCRIPT"
    exit 0
fi

# Get list of changed files
CHANGED_FILES=$(git diff-tree --no-commit-id --name-only -r HEAD)

# Check if any relevant files changed
if echo "$CHANGED_FILES" | grep -qE "(CLAUDE\.md|README\.md|neshbesh-app/src/)" ; then
    echo "🔄 NotebookLM: Syncing changed files..."
    python3 "$SYNC_SCRIPT" --quiet
    if [ $? -eq 0 ]; then
        echo "✅ NotebookLM sync completed successfully"
    else
        echo "⚠️  NotebookLM sync encountered an error (continuing anyway)"
    fi
else
    echo "⏭️  No relevant files changed, skipping NotebookLM sync"
fi

exit 0
