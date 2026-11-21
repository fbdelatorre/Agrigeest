@echo off
cd /d "%~dp0.."
node scripts\licensing-local.mjs start
if errorlevel 1 goto :failed
node scripts\licensing-manager-local.mjs
goto :end
:failed
echo Nao foi possivel iniciar o Supabase local. Confira se o Docker esta aberto.
:end
pause
