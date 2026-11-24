@echo off
cd /d "%~dp0"
set "AGRIGEST_NODE=node"
if exist "checks.local\licensing-local\node-path.cmd" call "checks.local\licensing-local\node-path.cmd"
"%AGRIGEST_NODE%" scripts\prepare-operational-pilot-api.mjs --local-only
if errorlevel 1 goto :failed
"%AGRIGEST_NODE%" scripts\start-operational-pilot-ui.mjs --local-only
if errorlevel 1 goto :failed
echo Piloto preparado. Abra o AgriGest Piloto Local ou http://127.0.0.1:48780
goto :end
:failed
echo Nao foi possivel iniciar o piloto. Confira se o Docker esta aberto.
echo Nao apague os dados nem reinicie a base de testes.
:end
pause
