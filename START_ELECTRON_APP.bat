@echo off
TITLE ETHREE POS Terminal - Desktop Application Launcher
COLOR 0B

cd /d "%~dp0"

echo [1/2] Checking Port 5173...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr /i "listening"') do (
    if "%%a" neq "0" taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/2] Launching ETHREE POS Desktop Application...
call npm.cmd run electron:dev
pause
