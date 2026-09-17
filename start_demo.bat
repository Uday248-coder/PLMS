@echo off
title PLMS Launcher
echo ================================================================
echo    CAMPUS PARKING SLOT MANAGEMENT SYSTEM (PLMS)
echo    Starting Backend (FastAPI :8000) and Frontend (Vite :5173)...
echo ================================================================

cd /d "%~dp0backend"
start "PLMS Backend (Port 8000)" cmd /k "echo Starting FastAPI backend... & python -m uvicorn app.main:app --reload --port 8000"

cd /d "%~dp0frontend"
start "PLMS Frontend (Port 5173)" cmd /k "echo Starting Vite frontend... & npm run dev"

echo.
echo [OK] Both servers launched in separate windows!
echo.
echo   - Frontend URL:  http://localhost:5173
echo   - Backend API:   http://localhost:8000/docs
echo.
echo To stop the servers later, run stop_demo.bat or press Ctrl+C in each window.
echo ================================================================
pause
