# Piloto operacional local — 24/11/2026

Esta etapa conecta a interface habitual do AgriGest a uma cópia isolada dos dados,
na branch `codex/licenciamento-planejamento`. Não publica migrações no Supabase
real, não altera a main e não substitui o aplicativo de uso diário.

O proprietário confirmado e os outros três administradores estão vinculados em
tabelas privadas de licenciamento. As identidades e a confirmação de titularidade
ficam somente em `checks.local`, fora do Git. Os perfis antigos não são movidos,
excluídos ou convertidos para outros usuários.

## Restauração e integridade

- Backup completo customizado antes das guardas, com SHA-256 registrado no manifesto
  privado e restauração validada em um banco novo com prefixo exclusivo de piloto.
- A preparação recusa sobrescrever um piloto existente. Nenhum comando de reset é
  usado. O banco restaurado de origem continua separado.
- Comparação inicial de 62 tabelas: registros idênticos ao backup. Depois dos logins,
  os 27 conjuntos de dados operacionais continuam idênticos; sessões e metadados de
  login Auth naturalmente mudam na cópia usada para entrar no aplicativo.
- Os testes SQL usam `BEGIN` e `ROLLBACK`, inclusive para alterações temporárias de
  licença, função, dispositivos, produtos, operações e monitoramentos.

## Proteções verificadas

Guardas em 25 tabelas e adaptação das rotinas auditadas ao contexto da fazenda.
As regras antigas são preservadas e as novas superfícies não permitem editar
monitoramentos, chuvas e recomendações diretamente sem a RPC auditada.

Testes executados: entrada de estoque, desconto por operação, ajuste por edição,
devolução por cancelamento, recomendação sem desconto antecipado, execução única,
edição e exclusão de chuva e monitoramento próprio, recusa de edição de outro autor,
limitação do monitor de campo, desligamento, instalação revogada, licença cancelada
com histórico legível e recuperação de recibo já confirmado sem duplicação.

O resumo do mapa usa autorização explícita e conjuntos limitados à fazenda e à
safra selecionadas para evitar repetir verificações por cada linha. O monitor de
campo não ganha acesso ao mapa por chamar a RPC diretamente.

## Serviços e aplicativo

`Testar-AgriGest-Piloto-Local.cmd` inicia os serviços já preparados e a interface,
com Docker aberto. Não inicializa nem limpa bancos.

| Serviço | Endereço local |
|---|---|
| API piloto | `http://127.0.0.1:48721` |
| Interface de navegador | `http://127.0.0.1:48780` |
| Caixa de emails separada | `http://127.0.0.1:48724` |

Auth e REST usam exclusivamente o banco piloto, segredo JWT próprio e portas
vinculadas a `127.0.0.1`. O Auth usa um papel próprio sem superusuário, criação de
bancos ou bypass de RLS. O dump da CLI omite o histórico de migrações Auth: a
recuperação desses metadados foi condicionada à comparação das colunas,
restrições e enums com o Auth local compatível. Não foram alteradas senhas de contas.

O instalador `AgriGest Piloto Local`, identificador
`com.agrigest.operational.pilot`, embute a interface completa e usa armazenamento
próprio, incluindo SQLite separado para as filas de campo. Não contém dados,
emails, contas, chave administrativa nem segredo JWT. Obtém só a configuração
pública do servidor piloto em tempo de execução e recusa outro endereço.

No aplicativo, abrir “Licença e acesso de teste”, autorizar a instalação e atualizar
as permissões. A interface mostra o papel confirmado pelo servidor, filtra a
navegação e bloqueia formulários sem autorização; o servidor continua sendo a
barreira efetiva para todas as gravações.

## Limites desta entrega

O piloto está fixado à primeira fazenda confirmada. Seleção de várias fazendas,
convites integrados, contratação/cobrança no aplicativo operacional, integração
com satélite, política definitiva de validade offline e implantação em produção
exigem etapas próprias. O gestor de licenças existente permanece independente.

Este instalador requer os serviços locais preparados neste computador. Não é
distribuição comercial. Testes automatizados de UI passaram para login local do
proprietário, autorização de instalação e leitura de áreas, sem erros JS ou REST.
O executável Windows deve receber validação manual após compilação; o teste no
navegador não comprova por si só o comportamento do WebView instalado.

## Entrega compilada

- Versão 0.1.0, commit `2f1417f4d4f8541346580171853fbf91d86d70e1`.
- GitHub Actions: execução `45477511047`, todos os passos aprovados.
- Artefato `14960512203`; instalador conferido por tamanho, identidade e SHA-256:
  `992966B78F7D81B48B0EC6ACD5A27B2975D50FCDAD06DF3B910676719F535519`.
- Entrega privada em `checks.local/entregas/agrigest-piloto-local-0.1.0/package`,
  com instalador, instruções, metadados e checksums. Executável sem assinatura comercial.
- Assets nativos testados com servidor HTTP real, rotas hash e CSP do pacote.
- Testes adicionais de consultoria aprovados nas tabelas operacionais: consulta
  de estoque permitida, movimentação recusada, recomendação e monitoramento
  permitidos, funcionário sem herança automática da fazenda e delegação antiga
  sem reativação depois de novo convite. Contas fictícias e alterações revertidas.
- Cinco autorizações criadas pelos testes foram revogadas, mantendo seu histórico.
  As seis vagas do piloto ficaram disponíveis para o teste manual.
- Ajustes posteriores ao commit compilado afetam somente a observação de arquivos
  do servidor de desenvolvimento, sua confirmação de inicialização, testes SQL e
  este relatório. Não alteram os assets do executável entregue.

## Correção do login por senha

O teste inicial de interface usava uma sessão local verificada e não exercitava o
preflight do login por senha. Esse caminho enviava `x-supabase-api-version`, que
faltava na lista CORS do proxy. O navegador bloqueava a requisição e mostrava
`Failed to fetch` antes de a senha ser verificada pelo Auth.

O cabeçalho foi adicionado mantendo a lista restrita de origens. O teste real
`tests/operational-pilot-login.browser.cjs --local-only` verifica o preflight das
origens de navegador e Windows, recusa uma origem externa e confirma que o login
chega ao Auth, que rejeita a conta fictícia inexistente com a mensagem de
credenciais inválidas. Não utiliza a senha do proprietário nem cria contas.
Correção exclusiva do servidor local; não exige reinstalar o executável.

## Página de membros e alinhamento dos avisos — 0.1.1

A página “Membros e licença”, junto de Configurações, reúne a situação da licença,
a função atual, a consulta da equipe e os controles de aparelhos. Usuários com
função restrita também podem abrir essa página para autorizar a própria instalação;
a listagem completa da equipe continua limitada ao proprietário pelo servidor.
Convites e alterações de equipe ainda não estão integrados a esta cópia operacional.

Os avisos compactos passaram para dentro do mesmo container central das páginas,
depois do cabeçalho. O painel de autorização deixou de ocupar o topo de todas as
telas. Teste real com leitura do piloto em 1366 e 390 px confirmou que o aviso fica
fora da barra lateral, abaixo do cabeçalho móvel e sem rolagem horizontal. A equipe
e o controle de aparelhos foram carregados; nenhum aparelho foi autorizado ou
revogado pelo teste e nenhum lançamento foi alterado.

O identificador Windows permanece igual para preservar sessão, autorizações,
armazenamento e fila local ao atualizar o piloto.
