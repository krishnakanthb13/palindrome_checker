@echo off
TITLE Palindrome Checker - Shutdown
SETLOCAL EnableDelayedExpansion

SET SERVER_PORT=8088
SET CLIENT_PORT=8089

echo ==========================================
echo   Shutting down Palindrome Checker...
echo ==========================================

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

:: Nuclear option: Kill any remaining node or vite processes
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im vite.exe >nul 2>&1

echo.
echo Shutdown complete. 
echo All Palindrome Checker processes have been terminated.
timeout /t 3 >nul
exit /b 0
