# Servidor de licenças e gestor separado — preparação

O usuário autorizou a futura integração à main e publicação no Supabase real.
Isso não torna o protótipo de identidade simulada apto para produção. As condições
de backup, restauração, compatibilidade e mapeamento de titularidade continuam
necessárias. Nenhuma migração de licenças foi publicada no banco real e nenhuma
integração à main foi executada. A exportação posterior usou o login temporário
oficial da CLI; não redefiniu a senha principal nem alterou lançamentos.

## Decisões desta etapa

- Provedor confirmado: Asaas, com cobrança automática como objetivo; não Stripe.
- Docker Desktop e WSL2 foram instalados após autorização posterior do usuário,
  que também aceitou os termos na primeira abertura. Nenhum reinício automático.
- Conta administradora desejada foi informada pelo usuário e anotada em arquivo
  privado em `checks.local`. O acesso ainda não foi concedido no Supabase real.
  Não colocar email pessoal, chaves ou o bootstrap privado no repositório público.
- Não há preços comerciais definidos no código. Valores contratados são inteiros
  em centavos; nenhuma cobrança foi criada ou enviada ao Asaas.

## Preparado no código

`licensing-server-local` é um projeto CLI separado, não vinculado à nuvem. Usa
API 46321, banco 46322, Studio 46323 e caixa de emails local 46324. Autenticação
exige confirmação de email e permite TOTP. Novas tabelas não ganham grants amplos
automaticamente. Serviços desnecessários foram desabilitados para esta validação.

`scripts/licensing-local.mjs` aceita somente doctor/start/status/stop, recusa um
project-ref remoto, isola credenciais do processo e verifica uma rede Docker com
publicação de portas em loopback. Não fornece reset, push ou deploy. Stop mantém
o comportamento padrão de preservação dos volumes. CLI 3.2.0, Docker e WSL2 foram
validados e o projeto local foi iniciado com as duas migrações. A faixa anterior
55320–55329 estava reservada pelo Windows; foi substituída por 46320–46329.
No Docker Desktop observado, a opção de bind padrão da rede não restringiu as
portas. O início foi interrompido, preservando volumes. O script agora usa um
named pipe efêmero autenticado para fixar `HostIp=127.0.0.1` ao criar somente
contêineres deste projeto/rede. Não abre uma API Docker TCP nem modifica o daemon.
Após iniciar, inspeciona as portas efetivas e para os serviços preservando volumes
se encontrar publicação externa. O teste de integração verifica a mesma condição.
O diretório do Docker recém-instalado também é incluído no PATH dos subprocessos.

As migrações novas criam somente `licensing` e `licensing_private`. Não alteram
RLS/tabelas/rotinas operacionais do AgriGest. Identidade vem de `auth.uid()` e a
gestão depende de conta verificada na tabela privada de administradores, com MFA
por padrão. Não há seletor de usuários, `is_admin` enviado pelo cliente, credencial
administrativa no frontend ou função pública para conceder esse cargo.

A base permite licenças pendentes, cortesias, ativação administrativa auditada,
cancelamento, solicitação de reativação e registros financeiros complementares.
Pagamento confirmado não pode ser apagado diretamente: anulação mantém histórico.
Este controle **ainda não impõe licenciamento às operações do AgriGest atual**.
Vagas/aparelhos exibem os limites comerciais; contagem real de sessões, equipes,
delegações e autorização offline ainda precisam ser integradas ao backend real.

`licensing-manager` é um programa separado, identificador
`com.agrigest.licenses.manager`, nome AgriGest Gestor de Licencas. Faz login no
Supabase, verifica autorização no servidor e oferece TOTP. Só aceita conexão
local ou o host do projeto já conhecido; recusa chave administrativa na tela e
no build. Mostra licenças, cortesias, pagamentos e auditoria. Não usa o banco
fictício nem importa o protótipo. O pacote está marcado **PREPARAÇÃO** e não
comprova uma integração de produção funcional. Informações financeiras não são
copiadas para o banco operacional nem concedem acesso às fazendas.

## Asaas: o que existe e o que falta

Existe adaptador de servidor para preparar checkout recorrente hospedado pelo
Asaas, consultar cobranças/assinaturas e distinguir sandbox de produção.
Produção exige habilitação explícita; o padrão é sandbox. Nenhum dado de cartão
é solicitado ou guardado pelo AgriGest. Callback de sucesso não ativa licença.

O endpoint local `asaas-webhook` verifica `asaas-access-token`, limita o corpo,
remove campos pessoais/cartão desnecessários e persiste eventos com chave única
por ambiente/ID antes de responder HTTP 200. Apenas o serviço pode inserir na
fila; clientes autenticados não podem forjar eventos. Falha de persistência não
recebe confirmação de sucesso. O segredo fica em arquivo ignorado e no servidor.

**Ainda falta**: endpoint autenticado que cria/reserva checkout de forma idempotente,
vinculação contratual com cliente/checkout/assinatura, reconciliação de eventos
com consulta autenticada ao Asaas, ativação e renovação por pagamento canônico,
inadimplência/reembolso/chargeback, sincronização de cancelamento/adicionais e
reprocessamento monitorado. A fila preparada não ativa licenças automaticamente.
Essas partes precisam de testes reais no Sandbox antes de qualquer cobrança real.
Regras de crédito/estorno de valores já pagos e preços ainda precisam ser definidas.

Referências primárias conferidas:

- https://docs.asaas.com/docs/checkout-com-assinatura-recorrente
- https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook
- https://docs.asaas.com/docs/como-implementar-idempotencia-em-webhooks
- https://docs.asaas.com/docs/faq-sandbox-1
- https://docs.asaas.com/reference/atualizar-assinatura-existente

## Verificação realizada

- SQL executado em PostgreSQL embarcado de teste, com um substituto explícito de
  `auth.uid()`/`auth.jwt()` para o harness: bloqueio de privilégios forjados,
  verificação de MFA, isolamento por proprietário, idempotência, histórico,
  anulação e ingressos duplicados do Asaas. Isso **não** testa JWT real/GoTrue.
- Adaptador e receptor Asaas com HTTP simulado: produção desabilitada por padrão,
  chave só no servidor, checkout não confirma pagamento, token inválido recusado,
  limite de corpo, dados privados removidos e falha da fila sem HTTP 200.
- Interface no Edge sob CSP nativa, com respostas HTTP locais simuladas: recusa
  de chave privada, login/autorização, cortesia, logout e isolamento entre contas.
  Nenhuma chamada externa foi feita no teste. TOTP real ainda não foi exercitado.
  Foi simulada uma resposta perdida após gravação: repetir a ação reutiliza o
  mesmo identificador, com hash do conteúdo separado por usuário/servidor, sem
  persistir os detalhes financeiros do formulário no armazenamento local.
  Logout usa escopo local para não encerrar as sessões do aplicativo principal.
- TypeScript, ESLint dos arquivos novos e compilação web do gestor aprovados.
- `npm run test:license-local`: executado contra GoTrue/PostgREST/PostgreSQL reais
  no Docker. Login com senha, MFA/TOTP, recusa de email não confirmado, metadados
  forjados e JWT adulterado, isolamento de proprietários por RLS, cortesias,
  idempotência, cancelamento, pagamentos manuais/anulações e fila Asaas passaram.
  As contas e lançamentos são fictícios, criados somente no projeto local.
- Backup completo desse banco local em formato custom foi restaurado em outro
  banco. Dados de licenças, pagamentos, histórico, usuários/MFA, administradores,
  funções e políticas RLS foram comparados. Dump, hash e relatório ficam em
  `checks.local/licensing-local`, ignorados pelo Git. Isso não é backup da nuvem.
- Cadastro público/confirmação de email também testados: a sessão só foi liberada
  após receber o email no Mailpit local e validar seu token no GoTrue. Nenhum
  email foi enviado externamente. A interface com configuração automática foi
  aberta no Edge com login real e exigiu MFA antes de exibir as licenças.
- `node tests/licensing-webhook-local.integration.mjs --local-only`: executado
  contra a função Edge real. Recusou token inválido, confirmou HTTP 200 somente
  após persistir, deduplicou eventos e removeu campos privados. Eventos fictícios;
  nenhuma conexão ao Asaas, cobrança ou ativação financeira nesta validação.
  A função foi servida com `functions serve` e o caminho absoluto do `.env.local`,
  obrigatório na versão da CLI observada. O processo precisa ficar aberto para
  continuar este teste; `start` sozinho não carrega esse arquivo privado.
- A chave Sandbox foi configurada privadamente pelo usuário e validada com uma
  única consulta GET a `/v3/myAccount/status/`: HTTP 200, situação aprovada.
  Nenhuma cobrança foi criada; checkout, conciliação e automação de pagamento
  continuam pendentes de implementação e homologação.
- A exportação do banco real foi restaurada em um banco separado no Docker.
  Migração de perfis, homologação do pagamento e instalação nativa continuam
  pendentes. A restauração do banco real em produção não foi executada.

## Próximos passos necessários

1. Docker/WSL2 e testes reais locais concluídos. Para reabrir o gestor no navegador,
   executar `licensing-server-local/Testar-Gestor-Local.cmd`. Ele inicia o projeto
   isolado, preenche a conexão pública e prepara uma conta fictícia local com MFA
   obrigatório. Email/senha inicial ficam em `checks.local/licensing-local`, nunca
   no Git ou no terminal. A janela deve permanecer aberta durante o teste. A conta
   real da administração ainda não recebeu autorização no banco de produção.
2. Login da CLI concluído e validado. O launcher só executa login; não faz deploy,
   push ou reset. Não confundir a autenticação da CLI com entrar apenas no painel.
3. Exportação, restauração e contrato SQL de licenças também verificados no
   PostgreSQL 15. Antes de publicar, avaliar a integração de todas as RPCs/grants
   operacionais e reconciliar migrações manuais.
   Não executar `db push` indiscriminadamente no projeto real.
4. Confirmar proprietários e vínculos reais. Não presumir titularidade por quem
   criou o cadastro, pela profissão ou pelo `is_admin` atual.
5. Conta Asaas Sandbox/chave configuradas e GET de autenticação aprovado. Manter
   a chave só no arquivo privado/secret store; concluir os testes financeiros.
6. Concluir integração financeira e autorização real de equipes, testar todas as
   mutações legadas/RPCs, fila offline e transição entre versões, preservando dados.
7. Só depois promover a integração validada à main e publicar de forma controlada,
   sem suspender inesperadamente as contas existentes.

## Etapa local de 20/11/2026

O gestor 0.1.1 usa a nova porta local 46321, inclusive na CSP nativa. O instalador
0.1.0 anterior continua sendo um artefato de preparação e usa a porta antiga.
A compilação 0.1.1 foi concluída, baixada e conferida: Actions 44842128333,
commit `bffb1a18c6c039529e2e634842aa1a8221b763cb`, arquivo de 2.017.198 bytes,
SHA-256 `169357C87007FF7975F0E7F38B281B85979A74AA3EBFF16A994CCCDAF0534A13`.
Está em `checks.local/entregas/gestor-licencas-0.1.1-preparacao`. Instalação
nativa ainda não testada; o executável é de preparação e não tem assinatura.
O launcher de login usa diretamente o binário da CLI, dispensando Node no PATH.
O launcher do gestor pode ler um caminho de Node gerado em arquivo local ignorado
(`checks.local/licensing-local/node-path.cmd`), sem mudar o PATH global do Windows.
Nenhuma destas
versões substitui o AgriGest principal ou conecta pagamentos automaticamente.
Os testes locais não mudaram a main e nenhum lançamento foi alterado no banco real.

## Exportação real e restauração isolada

A CLI autenticada confirmou o projeto AgroGest ativo, PostgreSQL 15.8, com sete
backups físicos concluídos. O usuário desconhece a senha do banco. A exportação
utilizou o login temporário oficial da CLI, após verificar seus efeitos no código
da versão 3.2.0, sem redefinir a senha principal. A conexão direta IPv6 não estava
disponível; a CLI usou seu fallback oficial para o pooler IPv4. Não foram passados
`--yes`, comandos de reset, restore remoto ou remoção de bloqueios de rede.

Esquema, dados, roles e esquema ampliado com Auth/Storage foram guardados em
`checks.local/cloud-backup-2026-11-20`, com hashes e manifestos. Esse conteúdo é
privado e ignorado pelo Git, pois contém dados reais e material de autenticação.
Os schemas gerenciados não substituem a cópia da configuração externa do projeto.
A inspeção encontrou zero buckets, zero objetos Storage e zero segredos Vault.

O dump foi restaurado em banco novo, separado do banco de testes do gestor, no
Docker local. PostGIS 3.3.7 foi inicializado antes da restauração. As contagens e
hashes das linhas de 62 tabelas exportadas coincidiram, incluindo Auth. A tabela
de referência padrão do PostGIS é tratada separadamente porque o dump inclui
apenas seus registros customizados. Também coincidiram as 70 políticas e as flags
RLS públicas, comparadas sob o mesmo search_path. A diferença inicial de nomes
`uid()`/`auth.uid()` vinha da exibição conforme search_path, sem alteração de regra.

As duas migrações de licenças foram aplicadas **somente a essa cópia**. Repetida a
comparação, os mesmos registros e políticas legadas continuaram idênticos.
Essa primeira restauração usou PostgreSQL 17.12. A etapa seguinte foi repetida
no PostgreSQL 15.8, conforme seção abaixo. Isso não prova funcionamento de
todos os fluxos legados, emails externos, restauração do serviço Auth em outra
instalação ou integração financeira completa. Nenhuma licença real foi ativada.

## Etapa de 21/11/2026: PostgreSQL 15 e checkout Sandbox

Criado o marco Git `agrigest-antes-cobranca-sandbox-2026-11-21`, com bundle
verificado em `checks.local/licensing-local/antes-cobranca-sandbox-2026-11-21.bundle`.
A main e os registros de produção permaneceram intactos nesta etapa.

A imagem oficial `public.ecr.aws/supabase/postgres:15.8.1.121` foi baixada e um
ambiente local separado usa a rede `agrigest-compat15-loopback`, porta de banco
48322 restrita a 127.0.0.1. O dump foi restaurado em outro banco dessa instância.
Foi necessário omitir, só durante a restauração, `SET transaction_timeout = 0`,
diretiva emitida pelo pg_dump 17 que não existe no servidor 15. Os arquivos
originais e todos os valores de registros foram preservados.

No PostgreSQL 15.8, os hashes dos valores das mesmas 62 tabelas e as 70 políticas
públicas/flags RLS coincidiram. Aplicadas as quatro migrações de licenças somente
nessa cópia, os registros e regras legadas continuaram idênticos. O contrato
`tests/licensing-postgres15.sql` validou preço no servidor, isolamento, idempotência,
claim único por serviço, bloqueio do relatório financeiro para não administradores
e ausência de ativação por checkout. Fixtures foram revertidos por ROLLBACK.
Relatórios privados: `checks.local/cloud-backup-pg15-2026-11-21`.
Isso valida restauração/SQL na versão 15; a pilha Auth/MFA com JWT real foi
exercitada no ambiente principal de testes, PostgreSQL 17. A nova instalação
completa de Auth no projeto auxiliar 15 não foi homologada nesta etapa.

As migrações 003 e 004 criam somente reservas privadas de checkout e uma visão
administrativa por RPC, respectivamente. O endpoint local `asaas-checkout` verifica
o usuário no Supabase Auth, confirma propriedade e email no banco, lê preço/período
do servidor e recusa campos adicionais como valor enviado pelo cliente. Origem
permitida e JWT são verificações distintas. Somente service_role pode reclamar e
concluir a reserva; usuários não podem gravar IDs/estados de pagamento diretamente.

Uma tentativa só é reclamada uma vez, sob locks. Solicitação repetida reutiliza
o resultado. Resultado incerto permanece bloqueado para conferência e não expira
para criação automática de outro checkout. Este desenho evita supor que o Asaas
oferece idempotência de criação quando a resposta se perde. O callback de sucesso
e o link de checkout continuam sem poder ativar licença.

`tests/checkout-sandbox.integration.mjs --sandbox-local-only` passou com Auth real
local e API real Sandbox: outro proprietário e alteração de valor foram recusados;
duas chamadas simultâneas e a repetição retornaram um único checkout; a licença
permaneceu pendente. O checkout fictício foi cancelado pelo próprio teste, sem
enviar cartão ou gerar pagamento real. Também foi criado/cancelado um checkout
isolado de diagnóstico. O Asaas limita o nome do item a 30 caracteres; foi corrigida
a abreviação apenas no envio, preservando o nome cadastrado e pares Unicode.
Tentativas rejeitadas ficaram documentadas privadamente; não foram repetidas na
mesma licença. Diagnóstico normal registra códigos/campos, sem chave ou descrição
livre do provedor. Não há chave Sandbox em frontend ou no repositório.

O gestor 0.1.2 mostra, na aba Pagamentos, as solicitações Asaas e seus estados,
com indicação clara de Sandbox. A consulta exige administrador confirmado e MFA;
não fornece acesso aos dados operacionais da fazenda. Servidor antigo sem essa
RPC continua abrindo o painel e informa que a visão precisa ser atualizada.
Interface conferida no Edge sob CSP, com respostas HTTP simuladas.

O encaminhador local por named pipe foi ajustado para separar as redes dos dois
projetos e preservar o protocolo Docker attach, inclusive streams hijacked. Só
aceita helpers oficiais explícitos sem portas e na rede escolhida. O teste real
de named pipe valida autenticação, remoção do token interno e fluxo de bytes.

**Ainda falta para cobrança automática:** conciliação canônica de pagamento,
ativação/renovação, inadimplência/estorno/chargeback, cancelamento e adicionais
sincronizados, vinculação real de equipes/aparelhos e integração ao AgriGest.
Nenhuma licença comercial foi ativada e nenhuma migração foi publicada na nuvem.

## Entrega de preparação

- Actions concluído: https://github.com/fbdelatorre/Agrigeest/actions/runs/44833613805.
- Commit compilado: `d73c702f8767273f3c8e9f2a34d9515d2d7f6323`.
- Instalador: `AgriGest_Gestor_Licencas_0.1.0_PREPARACAO_x64-setup.exe`, 2.014.981 bytes.
- SHA-256: `F04456FD6091D2B55619757AAA817DA7982BB45B63EB4E7D963C27901606766A`.
- Cópia em `checks.local/entregas/gestor-licencas-0.1.0-preparacao`, com metadados,
  instruções e checksums. Download/CRC, identidade, versão, commit e hash conferidos.
  O manifesto declara servidor não publicado e automação financeira incompleta.
- Marco do código anterior: `agrigest-antes-servidor-licencas-2026-11-20`, commit
  `bce0d1bc81be1c02ac3dcbd3813b76c6996ca93e`; bundle verificado em
  `checks.local/restauracao-servidor-licencas-2026-11-20`.
  SHA-256 `E0F79F5FDFECBFA719DC8864144504DAEA03D6C9655CDFC062FE4A9B3A029D31`.
  É cópia de código/histórico Git, não um backup do Supabase.
- Inventário estático inicial salvo em `checks.local/license-integration-inventory.json`:
  21 nomes literais de RPC e 21 de tabelas usados no cliente. Não inclui chamadas
  dinâmicas e não substitui inventário do schema/funções/RLS realmente publicados.
