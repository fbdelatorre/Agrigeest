@echo off
cd /d "%~dp0.."
echo Este comando conecta a CLI a sua conta do Supabase.
echo Nao publica codigo e nao altera o banco de dados.
echo Conclua pessoalmente a autenticacao no navegador.
"node_modules\@supabase\cli-windows-x64\bin\supabase.exe" login
if errorlevel 1 echo O login nao foi concluido. Confira a mensagem acima.
pause
