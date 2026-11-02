@echo off
TITLE Palindrome Checker - Launcher
SETLOCAL

cd /d "%~dp0"

if not defined SERVER_PORT set SERVER_PORT=8088
if not defined CLIENT_PORT set CLIENT_PORT=8089

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing workspace dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo ==========================================
echo   Starting Palindrome Checker
echo   Server: http://127.0.0.1:%SERVER_PORT%
echo   Client: http://127.0.0.1:%CLIENT_PORT%
echo ==========================================
echo.
echo   Press Ctrl+C to stop both processes.
echo   Or run "stop_app.bat" from another terminal.
echo.

call npm run dev
set EXIT_CODE=%ERRORLEVEL%

echo.
echo [INFO] Development processes stopped.
exit /b %EXIT_CODE%
