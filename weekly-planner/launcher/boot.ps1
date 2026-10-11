$ErrorActionPreference = 'Stop'
$Base = $PSScriptRoot
$RepoDir = Join-Path $Base 'source'
$Log = Join-Path $Base 'launcher.log'
try {
    $GitFile = Join-Path $Base 'git-path.txt'
    $GitExe = if (Test-Path -LiteralPath $GitFile) { (Get-Content -LiteralPath $GitFile -Raw -Encoding UTF8).Trim() } else { 'git.exe' }
    if (-not (Test-Path -LiteralPath (Join-Path $RepoDir '.git'))) {
        throw 'Planner checkout is missing. Run install_nedelnik.bat again.'
    }

    $env:GIT_TERMINAL_PROMPT = '0'
    $PreviousPolicy = $ErrorActionPreference
    $GitExit = 1
    try {
        $ErrorActionPreference = 'Continue'
        & $GitExe -C $RepoDir pull --ff-only --quiet origin main 2>&1 | Out-Null
        $GitExit = $LASTEXITCODE
    } catch {
        $GitExit = 1
    } finally {
        $ErrorActionPreference = $PreviousPolicy
    }
    if ($GitExit -ne 0) {
        "[$(Get-Date -Format s)] Could not fetch GitHub updates. Starting offline copy." | Add-Content -LiteralPath $Log
    }

    $OpenScript = Join-Path $RepoDir 'weekly-planner\launcher\open.ps1'
    if (-not (Test-Path -LiteralPath $OpenScript)) { throw 'Planner launch script is missing.' }
    & $OpenScript
} catch {
    "[$(Get-Date -Format s)] $($_.Exception.Message)" | Add-Content -LiteralPath $Log
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Nedelnik - launch error') | Out-Null
    exit 1
}
