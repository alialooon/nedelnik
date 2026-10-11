@echo off
setlocal EnableExtensions
title Install Nedelnik

rem Installs only the independent Nedelnik repository.
rem The launcher is a regular, visible Windows command file. No PowerShell.
if not defined LOCALAPPDATA goto no_localappdata
where git.exe >nul 2>nul
if errorlevel 1 goto no_git

set "INSTALL_DIR=%LOCALAPPDATA%\Nedelnik"
set "REPO_DIR=%INSTALL_DIR%\source"
set "BACKUP_DIR=%INSTALL_DIR%\source-before-nedelnik"
set "REMOTE=https://github.com/alialooon/nedelnik.git"
set "MIGRATED="

if exist "%REPO_DIR%\.git" goto inspect_repo
if exist "%REPO_DIR%" goto invalid_dir
goto clone_repo

:inspect_repo
set "CURRENT_REMOTE="
for /f "delims=" %%R in ('git -C "%REPO_DIR%" remote get-url origin 2^>nul') do set "CURRENT_REMOTE=%%R"
if /I "%CURRENT_REMOTE%"=="%REMOTE%" goto update_repo
if /I "%CURRENT_REMOTE%"=="https://github.com/alialooon/nedelnik" goto update_repo
if /I "%CURRENT_REMOTE%"=="git@github.com:alialooon/nedelnik.git" goto update_repo
echo Found an older planner checkout. Saving its source files...
if exist "%BACKUP_DIR%" goto backup_exists
move "%REPO_DIR%" "%BACKUP_DIR%" >nul
if errorlevel 1 goto migration_failed
set "MIGRATED=1"
goto clone_repo

:clone_repo
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo [1/3] Downloading Nedelnik from GitHub...
git clone --single-branch --branch main "%REMOTE%" "%REPO_DIR%"
if errorlevel 1 goto clone_failed
goto create_launcher

:update_repo
echo [1/3] Updating Nedelnik from GitHub...
set "GIT_TERMINAL_PROMPT=0"
git -C "%REPO_DIR%" pull --ff-only origin main
if errorlevel 1 goto pull_failed

:create_launcher
echo [2/3] Installing the PowerShell-free launcher...
if not exist "%REPO_DIR%\weekly-planner\launcher\start.cmd" goto missing_launcher
copy /Y "%REPO_DIR%\weekly-planner\launcher\start.cmd" "%INSTALL_DIR%\Nedelnik.cmd" >nul
if errorlevel 1 goto copy_failed

set "DESKTOP=%USERPROFILE%\Desktop"
if not exist "%DESKTOP%" if defined OneDrive if exist "%OneDrive%\Desktop" set "DESKTOP=%OneDrive%\Desktop"
if exist "%DESKTOP%" (
    copy /Y "%INSTALL_DIR%\Nedelnik.cmd" "%DESKTOP%\Nedelnik.cmd" >nul
    if errorlevel 1 echo WARNING: Could not create the desktop launcher.
) else (
    echo WARNING: Desktop folder not found. Use the Start menu launcher.
)

set "MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Nedelnik"
if not exist "%MENU%" mkdir "%MENU%"
if exist "%MENU%" (
    copy /Y "%INSTALL_DIR%\Nedelnik.cmd" "%MENU%\Nedelnik.cmd" >nul
    if errorlevel 1 echo WARNING: Could not create the Start menu launcher.
)

echo [3/3] Installation finished.
echo Open Nedelnik.cmd on the desktop for future launches.
echo Any old PowerShell shortcuts should remain quarantined or be removed.
call "%INSTALL_DIR%\Nedelnik.cmd"
if errorlevel 1 goto launch_failed
exit /b 0

:no_localappdata
echo ERROR: Windows LOCALAPPDATA folder could not be found.
goto failed

:no_git
echo ERROR: Git for Windows was not found.
echo Install Git for Windows and run this installer again.
goto failed

:invalid_dir
echo ERROR: "%REPO_DIR%" exists but is not a Git checkout.
echo Keep the folder safe and contact ChatGPT for help.
goto failed

:backup_exists
echo ERROR: An older source backup already exists:
echo "%BACKUP_DIR%"
echo Keep both folders safe and contact ChatGPT for help.
goto failed

:migration_failed
echo ERROR: Could not back up the older checkout.
echo Close any running planner windows and try again.
goto failed

:clone_failed
echo ERROR: GitHub download failed.
if defined MIGRATED echo Previous source files are safe at "%BACKUP_DIR%".
goto failed

:pull_failed
echo ERROR: Could not update Nedelnik from GitHub.
goto failed

:missing_launcher
echo ERROR: Nedelnik.cmd was not found in the repository.
goto failed

:copy_failed
echo ERROR: Could not copy the Nedelnik launcher.
goto failed

:launch_failed
echo ERROR: The planner could not be opened.
goto failed

:failed
echo.
echo Send this error message to ChatGPT if you need help.
pause
exit /b 1
