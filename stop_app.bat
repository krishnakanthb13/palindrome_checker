@echo off
TITLE Palindrome Checker - Shutdown
SETLOCAL

cd /d "%~dp0"

if not defined SERVER_PORT set SERVER_PORT=8088
if not defined CLIENT_PORT set CLIENT_PORT=8089

echo ==========================================
echo   Shutting down Palindrome Checker...
echo ==========================================

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-app.ps1"
set EXIT_CODE=%ERRORLEVEL%

echo.
echo Shutdown complete.
exit /b %EXIT_CODE%
