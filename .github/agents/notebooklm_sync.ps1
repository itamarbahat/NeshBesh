# NotebookLM Sync Agent for PowerShell
# Windows-compatible synchronization script for NeshBesh project files

param(
    [switch]$Force,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Configuration
$NOTEBOOK_ID = "7f750b9b-d47b-4b4d-96bf-ff55d0189e44"
$NOTEBOOK_NAME = "NeshBesh"
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$SYNC_STATE_FILE = Join-Path $PROJECT_ROOT ".notebooklm-sync-state.json"

# Consolidation definitions
$CONSOLIDATIONS = @{
    "neshbesh-sources.txt" = @{
        Label = "Types & Engine"
        Files = @(
            "neshbesh-app/src/types/index.ts"
            "neshbesh-app/src/engine/index.ts"
            "neshbesh-app/src/store/useGameStore.ts"
            "neshbesh-app/src/store/useMultiplayerStore.ts"
        )
    }
    "neshbesh-components.txt" = @{
        Label = "UI Components"
        Files = @(
            "neshbesh-app/src/components/Board.tsx"
            "neshbesh-app/src/components/DicePanel.tsx"
            "neshbesh-app/src/components/ThrowingDiceOverlay.tsx"
            "neshbesh-app/src/components/SpecialRollOverlay.tsx"
            "neshbesh-app/src/components/DoubleChooserPanel.tsx"
        )
    }
    "neshbesh-app-animations.txt" = @{
        Label = "App & Animations"
        Files = @(
            "neshbesh-app/App.tsx"
            "neshbesh-app/src/animations/useTableFlipAnimation.ts"
            "neshbesh-app/src/animations/useEatAnimation.ts"
            "neshbesh-app/src/animations/useDiceRollAnimation.ts"
        )
    }
    "neshbesh-documentation.txt" = @{
        Label = "Documentation"
        Files = @(
            "CLAUDE.md"
            "README.md"
        )
    }
}

function Write-Status {
    param([string]$Message, [string]$Type = "Info")
    $colors = @{
        Info = "Cyan"
        Success = "Green"
        Warning = "Yellow"
        Error = "Red"
    }
    Write-Host $Message -ForegroundColor $colors[$Type]
}

function Load-SyncState {
    if (Test-Path $SYNC_STATE_FILE) {
        try {
            return Get-Content $SYNC_STATE_FILE -Raw | ConvertFrom-Json
        } catch {
            Write-Status "[!] Could not load sync state: $_" "Warning"
            return @{ consolidations = @{}; last_sync = $null }
        }
    }
    return @{ consolidations = @{}; last_sync = $null }
}

function Save-SyncState {
    param([object]$State)
    try {
        $State | ConvertTo-Json -Depth 10 | Out-File -FilePath $SYNC_STATE_FILE -Encoding UTF8
    } catch {
        Write-Status "[ERROR] Failed to save sync state: $_" "Error"
    }
}

function Get-FileHash {
    param([string]$Content)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Content)
    $hash = $hasher.ComputeHash($bytes)
    return [System.BitConverter]::ToString($hash).Replace("-", "").ToLower()
}

function Read-ProjectFile {
    param([string]$FilePath)
    $fullPath = Join-Path $PROJECT_ROOT $FilePath
    if (-not (Test-Path $fullPath)) {
        if ($Verbose) {
            Write-Status "[!] File not found: $FilePath" "Warning"
        }
        return $null
    }
    try {
        return Get-Content $fullPath -Raw -Encoding UTF8
    } catch {
        Write-Status "[ERROR] Error reading $FilePath : $_" "Error"
        return $null
    }
}

function Consolidate-Files {
    param([string]$Name, [hashtable]$Config)

    Write-Status "   [*] Processing: $($Config.Label)"

    $parts = @("=== $($Config.Label) ===`n")

    foreach ($filepath in $Config.Files) {
        $content = Read-ProjectFile $filepath
        if ($content) {
            $parts += "`n=== $filepath ===`n"
            $parts += $content
            $parts += "`n"
        }
    }

    if ($parts.Count -eq 1) {
        Write-Status "   [SKIP] No source files found" "Warning"
        return $null
    }

    return $parts -join ""
}

function Should-UpdateConsolidation {
    param([string]$Name, [string]$NewContent, [object]$SyncState)

    $newHash = Get-FileHash $NewContent
    $oldHash = $SyncState.consolidations.$Name.hash

    return $newHash -ne $oldHash
}

function Upload-ToNotebookLM {
    param([string]$FileName, [string]$Content)

    $filePath = Join-Path $PROJECT_ROOT $FileName

    try {
        # Write content to file
        [System.IO.File]::WriteAllText($filePath, $Content, [System.Text.Encoding]::UTF8)
        Write-Status "   [WRITE] Created: $FileName"

        # Upload to NotebookLM
        $result = & python -m notebooklm source add "$filePath" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Status "   [OK] Uploaded: $FileName" "Success"
            return $true
        } else {
            Write-Status "   [ERROR] Upload failed: $FileName" "Error"
            if ($Verbose) {
                Write-Status "   Error details: $result" "Error"
            }
            return $false
        }
    } catch {
        Write-Status "   [ERROR] $_" "Error"
        return $false
    }
}

# Main sync logic
function Start-NotebookLMSync {
    Write-Host ""
    Write-Status "[SYNC] Starting NotebookLM sync..." "Info"
    Write-Status "   Notebook: $NOTEBOOK_NAME ($NOTEBOOK_ID)" "Info"

    # Set active notebook
    try {
        $null = & python -m notebooklm use $NOTEBOOK_ID 2>&1
    } catch {
        Write-Status "[ERROR] Failed to set active notebook: $_" "Error"
        return $false
    }

    $syncState = Load-SyncState
    $updatedCount = 0
    $skippedCount = 0

    foreach ($filename in $CONSOLIDATIONS.Keys) {
        $config = $CONSOLIDATIONS[$filename]

        # Consolidate files
        $content = Consolidate-Files $filename $config
        if (-not $content) {
            $skippedCount++
            continue
        }

        # Check if update needed
        if (-not $Force -and -not (Should-UpdateConsolidation $filename $content $syncState)) {
            Write-Status "   [SKIP] No changes" "Warning"
            $skippedCount++
            continue
        }

        # Upload to NotebookLM
        if (Upload-ToNotebookLM $filename $content) {
            $fileHash = Get-FileHash $content
            if (-not $syncState.consolidations) {
                $syncState.consolidations = @{}
            }
            $syncState.consolidations.$filename = @{
                hash = $fileHash
                label = $config.Label
                last_synced = (Get-Date).ToString("o")
            }
            $updatedCount++
        } else {
            $skippedCount++
        }
    }

    # Save state
    $syncState.last_sync = (Get-Date).ToString("o")
    Save-SyncState $syncState

    # Summary
    Write-Host ""
    Write-Status "[SUMMARY]" "Info"
    Write-Status "   Updated: $updatedCount" "Success"
    Write-Status "   Skipped: $skippedCount" "Warning"
    Write-Status "   Time: $($syncState.last_sync)" "Info"

    return $updatedCount -gt 0 -or $skippedCount -eq 0
}

# Run sync
if ($Verbose) {
    Write-Status "Project root: $PROJECT_ROOT" "Info"
    Write-Status "Sync state file: $SYNC_STATE_FILE" "Info"
}

$success = Start-NotebookLMSync

if ($success) { exit 0 } else { exit 1 }
