@echo off
cd /d "%~dp0"
node scripts/start-pilot-license-manager.mjs --local-only
if errorlevel 1 pause
