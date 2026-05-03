#!/usr/bin/env python3
"""
NotebookLM Sync Agent - Synchronizes NeshBesh project files with NotebookLM notebook.
"""

import json
import hashlib
import subprocess
import sys
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

# Configuration
NOTEBOOK_ID = "7f750b9b-d47b-4b4d-96bf-ff55d0189e44"
NOTEBOOK_NAME = "NeshBesh"
PROJECT_ROOT = Path(__file__).parent.parent.parent
SYNC_STATE_FILE = PROJECT_ROOT / ".notebooklm-sync-state.json"

# Consolidated file groups
CONSOLIDATIONS = {
    "neshbesh-sources.txt": {
        "label": "Types & Engine",
        "files": [
            "neshbesh-app/src/types/index.ts",
            "neshbesh-app/src/engine/index.ts",
            "neshbesh-app/src/store/useGameStore.ts",
            "neshbesh-app/src/store/useMultiplayerStore.ts",
        ]
    },
    "neshbesh-components.txt": {
        "label": "UI Components",
        "files": [
            "neshbesh-app/src/components/Board.tsx",
            "neshbesh-app/src/components/DicePanel.tsx",
            "neshbesh-app/src/components/ThrowingDiceOverlay.tsx",
            "neshbesh-app/src/components/SpecialRollOverlay.tsx",
            "neshbesh-app/src/components/DoubleChooserPanel.tsx",
        ]
    },
    "neshbesh-app-animations.txt": {
        "label": "App & Animations",
        "files": [
            "neshbesh-app/App.tsx",
            "neshbesh-app/src/animations/useTableFlipAnimation.ts",
            "neshbesh-app/src/animations/useEatAnimation.ts",
            "neshbesh-app/src/animations/useDiceRollAnimation.ts",
        ]
    },
    "neshbesh-documentation.txt": {
        "label": "Documentation",
        "files": [
            "CLAUDE.md",
            "README.md",
        ]
    },
}


class NotebookLMSync:
    def __init__(self, project_root: Path = PROJECT_ROOT):
        self.project_root = project_root
        self.sync_state = self._load_sync_state()
        self.changed_files: Dict[str, bool] = {}

    def _load_sync_state(self) -> Dict:
        """Load the last sync state from disk."""
        if SYNC_STATE_FILE.exists():
            try:
                with open(SYNC_STATE_FILE) as f:
                    return json.load(f)
            except Exception as e:
                print(f"⚠️  Could not load sync state: {e}")
        return {"last_sync": None, "consolidations": {}, "files": {}}

    def _save_sync_state(self):
        """Save current sync state to disk."""
        try:
            with open(SYNC_STATE_FILE, 'w') as f:
                json.dump(self.sync_state, f, indent=2)
        except Exception as e:
            print(f"❌ Failed to save sync state: {e}")

    def _calculate_hash(self, content: str) -> str:
        """Calculate SHA256 hash of content."""
        return hashlib.sha256(content.encode()).hexdigest()

    def _read_file(self, filepath: str) -> Optional[str]:
        """Read a file from the project root."""
        full_path = self.project_root / filepath
        if not full_path.exists():
            print(f"⚠️  File not found: {filepath}")
            return None
        try:
            with open(full_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            print(f"❌ Error reading {filepath}: {e}")
            return None

    def _consolidate_files(self, name: str, config: Dict) -> Optional[str]:
        """Consolidate multiple files into a single text block."""
        parts = [f"=== {config['label']} ===\n"]

        for filepath in config['files']:
            content = self._read_file(filepath)
            if content:
                parts.append(f"\n=== {filepath} ===\n")
                parts.append(content)
                parts.append("\n")

        if len(parts) == 1:
            print(f"⚠️  No files found for {name}")
            return None

        return "\n".join(parts)

    def _should_update_consolidation(self, name: str, new_content: str) -> bool:
        """Check if consolidation has changed."""
        new_hash = self._calculate_hash(new_content)
        old_hash = self.sync_state.get("consolidations", {}).get(name, {}).get("hash")
        return new_hash != old_hash

    def _upload_to_notebooklm(self, filename: str) -> bool:
        """Upload a file to NotebookLM."""
        filepath = self.project_root / filename
        try:
            # Write consolidated file
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write("")  # Placeholder, content written separately

            # Use notebooklm-py CLI to add source
            result = subprocess.run(
                ["python", "-m", "notebooklm", "source", "add", str(filepath)],
                cwd=str(self.project_root),
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode == 0:
                print(f"✅ Uploaded: {filename}")
                return True
            else:
                print(f"❌ Upload failed: {filename}")
                print(f"   Error: {result.stderr}")
                return False

        except subprocess.TimeoutExpired:
            print(f"⏱️  Timeout uploading {filename}")
            return False
        except Exception as e:
            print(f"❌ Error uploading {filename}: {e}")
            return False

    def _write_consolidated_file(self, filename: str, content: str) -> bool:
        """Write consolidated content to a file."""
        filepath = self.project_root / filename
        try:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"📝 Created: {filename}")
            return True
        except Exception as e:
            print(f"❌ Error writing {filename}: {e}")
            return False

    def sync(self, force: bool = False) -> bool:
        """
        Sync all consolidations with NotebookLM.

        Args:
            force: If True, upload all files even if unchanged

        Returns:
            True if sync succeeded, False otherwise
        """
        print(f"\n🔄 Starting NotebookLM sync...")
        print(f"   Notebook: {NOTEBOOK_NAME} ({NOTEBOOK_ID})")

        # Set active notebook
        try:
            subprocess.run(
                ["python", "-m", "notebooklm", "use", NOTEBOOK_ID],
                capture_output=True,
                timeout=10
            )
        except Exception as e:
            print(f"❌ Failed to set active notebook: {e}")
            return False

        updated_count = 0
        skipped_count = 0

        for filename, config in CONSOLIDATIONS.items():
            print(f"\n📂 Processing: {config['label']}")

            # Consolidate files
            content = self._consolidate_files(filename, config)
            if not content:
                print(f"   ⏭️  Skipped (no source files)")
                skipped_count += 1
                continue

            # Write consolidated file
            if not self._write_consolidated_file(filename, content):
                skipped_count += 1
                continue

            # Check if update needed
            if not force and not self._should_update_consolidation(filename, content):
                print(f"   ⏭️  No changes")
                skipped_count += 1
                continue

            # Upload to NotebookLM
            if self._upload_to_notebooklm(filename):
                # Update sync state
                file_hash = self._calculate_hash(content)
                if "consolidations" not in self.sync_state:
                    self.sync_state["consolidations"] = {}

                self.sync_state["consolidations"][filename] = {
                    "hash": file_hash,
                    "label": config["label"],
                    "last_synced": datetime.now().isoformat()
                }
                updated_count += 1
            else:
                skipped_count += 1

        # Save state
        self.sync_state["last_sync"] = datetime.now().isoformat()
        self._save_sync_state()

        # Summary
        print(f"\n📊 Sync Summary:")
        print(f"   ✅ Updated: {updated_count}")
        print(f"   ⏭️  Skipped: {skipped_count}")
        print(f"   🕐 Time: {self.sync_state['last_sync']}")

        return updated_count > 0 or skipped_count == 0


def main():
    """Main entry point."""
    force = "--force" in sys.argv or "-f" in sys.argv
    verbose = "--verbose" in sys.argv or "-v" in sys.argv

    if verbose:
        print(f"Project root: {PROJECT_ROOT}")
        print(f"Sync state file: {SYNC_STATE_FILE}")

    syncer = NotebookLMSync()
    success = syncer.sync(force=force)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
