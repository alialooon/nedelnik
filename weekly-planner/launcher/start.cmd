@echo off
setlocal EnableExtensions
title Nedelnik

rem Local planner launcher. No PowerShell, elevated permissions, or hidden scripts.
if not defined LOCALAPPDATA goto no_appdata
set "REPO_DIR=%LOCALAPPDATA%\Nedelnik\source"
set "PAGE=%REPO_DIR%\weekly-planner\planner-standalone.html"
set "PROFILE=%LOCALAPPDATA%\Nedelnik\browser-profile"

if not exist "%PAGE%" goto no_page
if defined NEDELNIK_TEST_MODE goto launch

echo Checking for Nedelnik updates...
set "GIT_TERMINAL_PROMPT=0"
where git.exe >nul 2>nul
if errorlevel 1 goto launch
git -C "%REPO_DIR%" pull --ff-only --quiet origin main >nul 2>nul
if errorlevel 1 echo Update unavailable. Opening the installed version.

:launch
rem Convert a local Windows path into a file URL for the browser app window.
set "APP_URL=file:///%PAGE:\=/%"
set "BROWSER="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "BROWSER=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not defined BROWSER if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BROWSER=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined BROWSER if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "BROWSER=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"

if defined NEDELNIK_TEST_MODE (
    echo Launcher check passed: %APP_URL%
    exit /b 0
)

if defined BROWSER (
    if not exist "%PROFILE%" mkdir "%PROFILE%"
    start "" "%BROWSER%" "--app=%APP_URL%" "--user-data-dir=%PROFILE%" --no-first-run
) else (
    start "" "%PAGE%"
)
exit /b 0

:no_appdata
echo ERROR: Windows LOCALAPPDATA folder was not found.
goto failed

:no_page
echo ERROR: Planner file was not found at:
echo "%PAGE%"
echo Run install_nedelnik.bat again.
goto failed

:failed
pause
exit /b 1
