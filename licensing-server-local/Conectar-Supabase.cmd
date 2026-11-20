@echo off
cd /d "%~dp0.."
echo Este comando conecta a CLI a sua conta do Supabase.
echo Nao publica codigo e nao altera o banco de dados.
echo Conclua pessoalmente a autenticacao no navegador.
node node_modules\supabase\dist\supabase.js login
pause
