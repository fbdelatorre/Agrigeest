@echo off
cd /d "%~dp0.."
set "AGRIGEST_NODE=node"
if exist "checks.local\licensing-local\node-path.cmd" call "checks.local\licensing-local\node-path.cmd"
"%AGRIGEST_NODE%" scripts\licensing-local.mjs start
if errorlevel 1 goto :failed
"%AGRIGEST_NODE%" scripts\licensing-manager-local.mjs
goto :end
:failed
echo Nao foi possivel iniciar o Supabase local. Confira se o Docker esta aberto.
:end
pause
