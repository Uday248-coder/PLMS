@echo off
title Stop PLMS Servers
echo ================================================================
echo    CAMPUS PARKING SLOT MANAGEMENT SYSTEM (PLMS)
echo    Stopping Backend (port 8000) and Frontend (port 5173)...
echo ================================================================

powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8000, 5173 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; exit 0"

echo.
echo [OK] Ports 8000 and 5173 have been released and all processes stopped!
echo ================================================================
pause
