$ErrorActionPreference = 'Stop'
$GitExe = (Get-Command git.exe -ErrorAction Stop).Source
$InstallDir = Join-Path $env:LOCALAPPDATA 'Nedelnik'
$RepoDir = Join-Path $InstallDir 'source'
if (-not (Test-Path -LiteralPath (Join-Path $RepoDir '.git'))) {
    throw 'Nedelnik source checkout is missing. Run install_nedelnik.bat first.'
}
$Remote = (& $GitExe -C $RepoDir remote get-url origin | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $Remote -notmatch '(?i)github\.com[:/]alialooon/nedelnik(?:\.git)?$') {
    throw 'The installed source is not the independent Nedelnik repository. Run install_nedelnik.bat.'
}
$BootstrapSource = Join-Path $RepoDir 'weekly-planner\launcher\boot.ps1'
if (-not (Test-Path -LiteralPath $BootstrapSource)) { throw 'Nedelnik launcher bootstrap is missing.' }
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
$Bootstrap = Join-Path $InstallDir 'boot.ps1'
Copy-Item -LiteralPath $BootstrapSource -Destination $Bootstrap -Force
Set-Content -LiteralPath (Join-Path $InstallDir 'git-path.txt') -Value $GitExe -Encoding UTF8
$PowerShellExe = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
$LaunchArgs = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Bootstrap + '"'

$Shell = New-Object -ComObject WScript.Shell
$Desktop = [Environment]::GetFolderPath('Desktop')
$Menu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Недельник'
New-Item -ItemType Directory -Path $Menu -Force | Out-Null
foreach ($LinkPath in @((Join-Path $Desktop 'Недельник.lnk'), (Join-Path $Menu 'Недельник.lnk'))) {
    $Link = $Shell.CreateShortcut($LinkPath)
    $Link.TargetPath = $PowerShellExe
    $Link.Arguments = $LaunchArgs
    $Link.WorkingDirectory = $InstallDir
    $Link.Description = 'Недельник — независимый планировщик с автообновлением'
    $Link.IconLocation = "$env:SystemRoot\System32\shell32.dll,46"
    $Link.Save()
}
Write-Host 'Nedelnik is installed. Use the desktop shortcut.' -ForegroundColor Green
Start-Process -FilePath $PowerShellExe -ArgumentList $LaunchArgs
