@echo off
TITLE ETHREE POS System - Master Live Launcher
COLOR 0A

echo ===============================================================================
echo            ETHREE POS SYSTEM - FULL STACK LIVE LAUNCHER
echo ===============================================================================
echo.

cd /d "%~dp0"

echo [1/4] Checking and freeing ports (5174 and 5002)...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5174,5002 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1

echo [2/4] Starting ETHREE Backend Server (Port 5002)...
start "ETHREE POS Backend Server (Port 5002)" cmd /k "cd /d "%~dp0" && node server/index.js"

echo [3/4] Starting Ngrok Tunnel in background (Port 5002)...
start "Ngrok API Tunnel (Port 5002)" cmd /k "call START_NGROK_API.bat"

echo.
echo [4/4] Opening browser at http://localhost:5174 ...
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5174"

echo.
echo ===============================================================================
echo   ETHREE POS SYSTEM IS LIVE:
echo     * Frontend Local:    http://localhost:5174
echo     * Frontend Network:  http://192.168.2.100:5174
echo     * Backend API:       http://localhost:5002/api
echo     * Swagger API Docs:  http://localhost:5002/api-docs/
echo     * Public Ngrok URL:  https://swampland-situated-barbell.ngrok-free.dev/api-docs/
echo.
echo   Keep this window open while using the POS.
echo ===============================================================================
echo.

call npm.cmd run dev
pause
