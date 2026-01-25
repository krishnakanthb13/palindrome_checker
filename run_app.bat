@echo off
TITLE Palindrome Checker - Launcher
SETLOCAL EnableDelayedExpansion

:: --- Config ---
SET SERVER_PORT=8088
SET CLIENT_PORT=8089

:: --- Pre-flight Checks ---

:: 1. Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Check for dependencies
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing workspace dependencies...
    call npm install
)

:: --- Kill existing processes on ports ---
:: Kill server
echo [INFO] Stopping Server on port %SERVER_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%SERVER_PORT% ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
    if !ERRORLEVEL! equ 0 (echo [OK] Stopped Server ^(PID: %%a^))
)

:: Kill client
echo [INFO] Stopping Client on port %CLIENT_PORT%...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%CLIENT_PORT% ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1
    if !ERRORLEVEL! equ 0 (echo [OK] Stopped Client ^(PID: %%a^))
)

:: Kill any orphaned node/vite processes if they still exist
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im vite.exe >nul 2>&1

:: --- Launch App ---
echo ==========================================
echo   Starting Palindrome Checker
echo   Server: http://localhost:%SERVER_PORT%
echo   Client: http://localhost:%CLIENT_PORT%
echo ==========================================
echo.
echo   Press Ctrl+C to stop both processes.
echo   Or run "stop_app.bat" from another terminal.
echo.

:: Run concurrently using the root orchestrator
:: --kill-others ensures if one dies (or you ctrl+c), they both die.
call npm run dev -s
exit /b %ERRORLEVEL%
