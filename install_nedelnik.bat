@echo off
setlocal EnableExtensions
title Install Nedelnik

rem Install from the independent Nedelnik GitHub repository.
rem Desktop and Start menu shortcuts point DIRECTLY to the native .exe.
if not defined LOCALAPPDATA goto no_localappdata
where git.exe >nul 2>nul
if errorlevel 1 goto no_git

set "INSTALL_DIR=%LOCALAPPDATA%\Nedelnik"
set "REPO_DIR=%INSTALL_DIR%\source"
set "BACKUP_DIR=%INSTALL_DIR%\source-before-nedelnik"
set "REMOTE=https://github.com/alialooon/nedelnik.git"
set "APP_EXE=%INSTALL_DIR%\NedelnikLauncher.exe"
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
goto install_launcher

:update_repo
echo [1/3] Updating Nedelnik from GitHub...
set "GIT_TERMINAL_PROMPT=0"
git -C "%REPO_DIR%" pull --ff-only origin main
if errorlevel 1 goto pull_failed

:install_launcher
echo [2/3] Installing the native Windows launcher...
if not exist "%REPO_DIR%\windows\NedelnikLauncher.exe" goto missing_launcher
copy /Y "%REPO_DIR%\windows\NedelnikLauncher.exe" "%APP_EXE%" >nul
if errorlevel 1 goto copy_failed

rem Remove only previous Nedelnik.cmd launcher files, not user data.
if exist "%INSTALL_DIR%\Nedelnik.cmd" del /Q "%INSTALL_DIR%\Nedelnik.cmd"
if exist "%USERPROFILE%\Desktop\Nedelnik.cmd" del /Q "%USERPROFILE%\Desktop\Nedelnik.cmd"
if defined OneDrive if exist "%OneDrive%\Desktop\Nedelnik.cmd" del /Q "%OneDrive%\Desktop\Nedelnik.cmd"
if exist "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Nedelnik\Nedelnik.cmd" del /Q "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Nedelnik\Nedelnik.cmd"

rem The executable uses standard Windows COM shortcut creation.
rem No .lnk file invokes PowerShell, cmd.exe, or execution-policy bypass.
start /wait "" "%APP_EXE%" --install
if errorlevel 1 goto shortcut_failed

echo [3/3] Installation complete. Opening Nedelnik...
start "" "%APP_EXE%"
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
echo Keep this folder safe and contact ChatGPT for help.
goto failed

:backup_exists
echo ERROR: An older backup already exists:
echo "%BACKUP_DIR%"
echo Keep both folders safe and contact ChatGPT for help.
goto failed

:migration_failed
echo ERROR: Could not back up the older checkout.
echo Close running planner windows and try again.
goto failed

:clone_failed
echo ERROR: GitHub download failed.
if defined MIGRATED echo Previous source files are safe at "%BACKUP_DIR%".
goto failed

:pull_failed
echo ERROR: Could not update Nedelnik from GitHub.
goto failed

:missing_launcher
echo ERROR: Windows launcher .exe is missing from GitHub checkout.
echo Try again shortly or check the GitHub build status.
goto failed

:copy_failed
echo ERROR: Could not copy launcher .exe. Close the running Nedelnik launcher and retry.
goto failed

:shortcut_failed
echo ERROR: Windows shortcut creation failed.
goto failed

:failed
echo.
echo Send this error message to ChatGPT if you need help.
pause
exit /b 1
