@echo off
TITLE Palindrome Checker - Launcher
SETLOCAL EnableDelayedExpansion

:: --- Pre-flight Checks ---

:: 1. Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

:: 2. Check for dependencies (Unified Workspace node_modules)
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing workspace dependencies...
    call npm install
)

:: --- Launch App ---
echo ==========================================
echo   Starting Palindrome Checker (Workspace)
echo   Server: Port 8088
echo   Client: Port 5173
echo ==========================================

:: Run concurrently using the root orchestrator
call npm run dev -s
exit /b %ERRORLEVEL%
