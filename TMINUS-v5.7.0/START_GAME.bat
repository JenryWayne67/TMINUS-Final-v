@echo off
cd /d "%~dp0"
echo Starting T-MINUS Phase 5 online server on http://localhost:8095
if not exist node_modules\ws call npm ci --omit=dev --omit=optional
if errorlevel 1 exit /b 1
node server/start.mjs
pause
