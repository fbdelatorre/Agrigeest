# Abertura offline — AgriGest 1.2.1

O bloqueio em `Loading...` ocorria porque a abertura aguardava `getSession()` do
Supabase. Uma sessão vencida exige renovação, que pode ficar pendente sem acesso à
internet. Além disso, alguns dispositivos continuam informando `navigator.onLine`
como verdadeiro mesmo sem conexão com o servidor. A tela também não reagia ao
evento de perda de conexão enquanto aguardava essa verificação.

A inicialização agora usa a sessão local somente quando existe um perfil salvo
com o mesmo usuário. O perfil em cache abre sem depender da consulta de rede.
A renovação continua em segundo plano, e a perda de conexão libera imediatamente
a abertura local. Se não houver sessão/perfil para abrir os dados locais, a espera
é limitada a cinco segundos e há uma opção para tentar novamente. Uma saída da
conta reconhecida pelo SDK continua retirando o acesso ao conteúdo autenticado.

Nenhuma alteração no banco, RLS, estoque ou registros existentes foi necessária.
O cache de outro usuário não é escolhido como alternativa. O servidor continua
validando tokens, instituição e permissões antes de aceitar qualquer gravação.

O teste `tests/offline-startup.browser.cjs` abre uma PWA real em um servidor local,
com sessão vencida, renovação travada e service worker ativo. Verifica abertura
com o indicador online incorreto, reabertura sem rede, criação e persistência de
chuva/monitoramento/recomendação, sincronização na ordem correta sem duplicação,
ausência de baixa de estoque por recomendação, isolamento sem sessão e fim do
carregamento quando não existe perfil salvo. Os testes usam dados fictícios.

É necessário entrar uma vez com internet e carregar a safra e seus cadastros no
mesmo dispositivo. O teste em navegador não substitui a conferência no aparelho
físico do usuário. O APK e o instalador Windows 1.2.1 atualizam a versão anterior
sem necessidade de desinstalação. Os pontos de restauração anteriores permanecem.

## Entrega e validação

- TypeScript: aplicação e configuração sem erros. ESLint: zero erros, 12 avisos
  já presentes antes desta correção.
- Testes de regras/banco: oito aprovados. Teste dos formulários existentes e
  novo teste de abertura offline: aprovados.
- Compilação da PWA, instalador Windows e APK Android 1.2.1: concluída.
- Android: código de versão 5 e mesmo certificado da versão 1.2.0.
- Os arquivos e hashes estão em `checks.local/entregas/agrigest-1.2.1`.
- A atualização automática no Windows foi bloqueada pelo Controle de Aplicativos
  antes de iniciar o instalador. A versão instalada continua sendo a 1.2.0.
  As proteções do sistema não foram alteradas.
- O código está preparado na `main` local para envio e publicação da PWA.
  Nenhum novo script SQL é necessário.
