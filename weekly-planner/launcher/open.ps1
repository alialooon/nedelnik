$ErrorActionPreference = 'Stop'
$RepoDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$Page = Join-Path $RepoDir 'weekly-planner\planner-standalone.html'
if (-not (Test-Path -LiteralPath $Page)) { throw 'The planner HTML file is missing.' }
$AppUrl = ([System.Uri]::new($Page)).AbsoluteUri
$Local = [Environment]::GetFolderPath('LocalApplicationData')
$Profile = Join-Path $Local 'Nedelnik\browser-profile'
New-Item -ItemType Directory -Path $Profile -Force | Out-Null
$ProgramFiles = [Environment]::GetFolderPath('ProgramFiles')
$ProgramFilesX86 = [Environment]::GetFolderPath('ProgramFilesX86')
$Browsers = @(
    (Join-Path $ProgramFilesX86 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $Local 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $ProgramFilesX86 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $Local 'Google\Chrome\Application\chrome.exe')
)
$Browser = $Browsers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $Browser) {
    Start-Process -FilePath $Page
} else {
    $Arguments = @('"' + '--app=' + $AppUrl + '"', '"' + '--user-data-dir=' + $Profile + '"', '--no-first-run')
    Start-Process -FilePath $Browser -ArgumentList $Arguments
}
