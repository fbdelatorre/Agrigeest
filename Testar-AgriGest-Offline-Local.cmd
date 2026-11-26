@echo off
cd /d "%~dp0"
call node scripts/prepare-operational-pilot-api.mjs --local-only
if errorlevel 1 goto fim
call node scripts/start-offline-pilot-ui.mjs --local-only
if not errorlevel 1 start "" http://127.0.0.1:48781/monitoring
:fim
pause
