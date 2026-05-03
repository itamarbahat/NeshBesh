# NotebookLM Sync - Simple PowerShell Script
# Synchronizes NeshBesh files to NotebookLM notebook

param(
    [switch]$Force,
    [switch]$Verbose
)

$NOTEBOOK_ID = "7f750b9b-d47b-4b4d-96bf-ff55d0189e44"
$PROJECT_ROOT = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# File consolidation groups
$consolidations = @(
    @{
        name = "neshbesh-sources.txt"
        label = "Types & Engine"
        files = @(
            "neshbesh-app/src/types/index.ts",
            "neshbesh-app/src/engine/index.ts",
            "neshbesh-app/src/store/useGameStore.ts",
            "neshbesh-app/src/store/useMultiplayerStore.ts"
        )
    }
    @{
        name = "neshbesh-components.txt"
        label = "UI Components"
        files = @(
            "neshbesh-app/src/components/Board.tsx",
            "neshbesh-app/src/components/DicePanel.tsx",
            "neshbesh-app/src/components/ThrowingDiceOverlay.tsx",
            "neshbesh-app/src/components/SpecialRollOverlay.tsx",
            "neshbesh-app/src/components/DoubleChooserPanel.tsx"
        )
    }
    @{
        name = "neshbesh-app-animations.txt"
        label = "App & Animations"
        files = @(
            "neshbesh-app/App.tsx",
            "neshbesh-app/src/animations/useTableFlipAnimation.ts",
            "neshbesh-app/src/animations/useEatAnimation.ts",
            "neshbesh-app/src/animations/useDiceRollAnimation.ts"
        )
    }
    @{
        name = "neshbesh-documentation.txt"
        label = "Documentation"
        files = @(
            "CLAUDE.md",
            "README.md"
        )
    }
)

function Write-Header {
    param([string]$Message)
    Write-Host "`n[SYNC] $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "   $Message" -ForegroundColor Gray
}

function Write-Success {
    param([string]$Message)
    Write-Host "   [OK] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "   [SKIP] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "   [ERROR] $Message" -ForegroundColor Red
}

# Set active notebook
Write-Header "Setting active notebook..."
Write-Info "Notebook: NeshBesh ($NOTEBOOK_ID)"
python -m notebooklm use $NOTEBOOK_ID | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to set active notebook"
    exit 1
}

Write-Success "Notebook set"

# Process each consolidation
$successCount = 0
$skipCount = 0

Write-Header "Consolidating and uploading files..."

foreach ($group in $consolidations) {
    Write-Info "Processing: $($group.label)"

    # Build consolidated content
    $content = "=== $($group.label) ===`n`n"
    $fileCount = 0

    foreach ($file in $group.files) {
        $fullPath = Join-Path $PROJECT_ROOT $file
        if (Test-Path $fullPath) {
            $fileContent = [System.IO.File]::ReadAllText($fullPath, [System.Text.Encoding]::UTF8)
            $content += "=== $file ===`n"
            $content += $fileContent
            $content += "`n`n"
            $fileCount++
        }
    }

    if ($fileCount -eq 0) {
        Write-Warning "No source files found"
        $skipCount++
        continue
    }

    # Write consolidated file
    $outPath = Join-Path $PROJECT_ROOT $group.name
    [System.IO.File]::WriteAllText($outPath, $content, [System.Text.Encoding]::UTF8)

    # Upload to NotebookLM
    $output = python -m notebooklm source add $outPath 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Success "Uploaded: $($group.name) ($fileCount files)"
        $successCount++
    } else {
        Write-Error "Upload failed: $($group.name)"
        if ($Verbose) {
            Write-Error $output
        }
        $skipCount++
    }
}

Write-Header "Sync Complete"
Write-Success "Updated: $successCount"
Write-Warning "Skipped: $skipCount"
Write-Info "Time: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

exit 0
