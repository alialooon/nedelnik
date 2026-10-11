@echo off
setlocal EnableExtensions
title Install Nedelnik

rem This installer uses only the independent Nedelnik GitHub repository.
if not defined LOCALAPPDATA goto no_localappdata
where git >nul 2>nul
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
echo Found a previous planner installation. Saving its source files...
if exist "%BACKUP_DIR%" goto backup_exists
move "%REPO_DIR%" "%BACKUP_DIR%" >nul
if errorlevel 1 goto migration_failed
set "MIGRATED=1"
goto clone_repo

:clone_repo
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
echo [1/3] Downloading Nedelnik from its own GitHub repository...
git clone --single-branch --branch main "%REMOTE%" "%REPO_DIR%"
if errorlevel 1 goto clone_failed
goto install_launcher

:update_repo
echo [1/3] Updating Nedelnik from its own GitHub repository...
git -C "%REPO_DIR%" pull --ff-only origin main
if errorlevel 1 goto pull_failed

:install_launcher
echo [2/3] Preparing the Windows launcher...
if not exist "%REPO_DIR%\weekly-planner\launcher\install_launcher.ps1" goto missing_installer
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%REPO_DIR%\weekly-planner\launcher\install_launcher.ps1"
if errorlevel 1 goto install_failed
echo [3/3] Done. Use the "Nedelnik" shortcut on your desktop.
exit /b 0

:no_localappdata
echo ERROR: Windows LOCALAPPDATA folder could not be found.
goto failed

:no_git
echo ERROR: Git for Windows was not found.
echo Install Git for Windows and run this file again.
goto failed

:invalid_dir
echo ERROR: "%REPO_DIR%" exists but is not a Git checkout.
echo Keep that folder safe and contact ChatGPT for help.
goto failed

:backup_exists
echo ERROR: A previous source backup already exists:
echo "%BACKUP_DIR%"
echo Keep both folders safe and contact ChatGPT for help.
goto failed

:migration_failed
echo ERROR: Could not move the old checkout to a backup folder.
echo Close running planner windows and try again.
goto failed

:clone_failed
echo ERROR: Could not download Nedelnik from GitHub.
if defined MIGRATED echo Your previous source checkout is safe at "%BACKUP_DIR%".
goto failed

:pull_failed
echo ERROR: Could not update Nedelnik from GitHub.
echo Check your connection and try again.
goto failed

:missing_installer
echo ERROR: Nedelnik launcher script was not found.
goto failed

:install_failed
echo ERROR: Nedelnik launcher setup failed.
goto failed

:failed
echo.
echo Send this error message to ChatGPT if you need help.
pause
exit /b 1
