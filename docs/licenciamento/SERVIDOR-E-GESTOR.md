# Servidor de licenças e gestor separado — preparação

O usuário autorizou a futura integração à main e publicação no Supabase real.
Isso não torna o protótipo de identidade simulada apto para produção. As condições
de backup, restauração, compatibilidade e mapeamento de titularidade continuam
necessárias. Nenhuma migração de licenças foi publicada no banco real e nenhuma
integração à main foi executada. A exportação posterior usou o login temporário
oficial da CLI; não redefiniu a senha principal nem alterou lançamentos.

Estado consolidado de 24/11/2026: pagamentos, aparelhos e empresas/equipes/convites
com Auth real estão preparados no ambiente local. Veja a [etapa 0.1.9](EQUIPES-0.1.9.md).
Vínculo operacional das fazendas, webhooks públicos e bloqueio do aplicativo
principal seguem pendentes.
Os trechos de preparação inicial abaixo registram o histórico das etapas.

## Decisões desta etapa

- Provedor confirmado: Asaas, com cobrança automática como objetivo; não Stripe.
- Docker Desktop e WSL2 foram instalados após autorização posterior do usuário,
  que também aceitou os termos na primeira abertura. Nenhum reinício automático.
- Conta administradora desejada foi informada pelo usuário e anotada em arquivo
  privado em `checks.local`. O acesso ainda não foi concedido no Supabase real.
  Não colocar email pessoal, chaves ou o bootstrap privado no repositório público.
- Não há preços comerciais definidos no código. Valores contratados são inteiros
  em centavos. Checkouts fictícios foram criados e cancelados só no Sandbox;
  nenhum pagamento ou cobrança de produção foi criado.

## Preparado no código

`licensing-server-local` é um projeto CLI separado, não vinculado à nuvem. Usa
API 46321, banco 46322, Studio 46323 e caixa de emails local 46324. Autenticação
exige confirmação de email e permite TOTP. Novas tabelas não ganham grants amplos
automaticamente. Serviços desnecessários foram desabilitados para esta validação.

`scripts/licensing-local.mjs` aceita somente doctor/start/status/stop, recusa um
project-ref remoto, isola credenciais do processo e verifica uma rede Docker com
publicação de portas em loopback. Não fornece reset, push ou deploy. Stop mantém
o comportamento padrão de preservação dos volumes. CLI 3.2.0, Docker e WSL2 foram
validados e o projeto local recebeu as quatro migrações preparadas. A faixa anterior
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

O endpoint autenticado `asaas-checkout` já reserva e cria checkout com o preço
do servidor e proteção contra repetição, validado no Sandbox nesta etapa.

**Ainda falta**: vinculação contratual com cliente/checkout/assinatura, reconciliação de eventos
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
Interface conferida no Edge sob CSP, com respostas HTTP simuladas e depois com
backend local real. Uma conta fictícia administrativa foi recusada em AAL1,
autorizada após TOTP e exibiu o checkout Sandbox cancelado. Nenhuma requisição
externa partiu dessa interface durante a verificação.

O encaminhador local por named pipe foi ajustado para separar as redes dos dois
projetos e preservar o protocolo Docker attach, inclusive streams hijacked. Só
aceita helpers oficiais explícitos sem portas e na rede escolhida. O teste real
de named pipe valida autenticação, remoção do token interno e fluxo de bytes.

## Conciliação canônica — etapa local 0.1.3

A migração `20261121000500_canonical_payments.sql` foi aplicada apenas aos bancos
locais PostgreSQL 17 e à cópia restaurada PostgreSQL 15. O processador consulta
`GET /payments/{id}` e, quando necessário, `GET /subscriptions/{id}` autenticados
no Asaas. O webhook fornece somente a referência para consulta; valor, status e
assinatura recebidos no aviso não autorizam acesso. O vínculo usa checkout ou
referência exata licença/solicitação, cliente, preço e periodicidade do servidor.

Pagamentos elegíveis cobrem períodos mensais/anuais de calendário, desde o
vencimento. Períodos contíguos podem renovar a validade; duplicatas não somam dias.
Estornos removem a cobertura daquele pagamento. O vencimento de uma fatura futura
não remove um período já pago. Cancelamento pelo proprietário, cortesias e decisões
administrativas posteriores ficam protegidos por revisão da licença, inclusive
contra eventos atrasados. Um pagamento antecipado fora da cobertura corrente
agenda nova conferência na data inicial. Isso exige processador de fila ativo.

As tabelas de pagamentos e auditoria têm RLS e leitura restrita. Só RPCs do servidor
aplicam a conciliação; o histórico automático não pode ser editado/excluído.
Há lease exclusivo por ambiente, fencing contra execução vencida e até oito
tentativas com espera progressiva; casos permanentes pedem revisão. O gestor
permite reenfileirar e consultar novamente, com autorização administrativa e MFA.

Licenças Sandbox precisam de `test_mode=true`, não podem ter fazenda vinculada e
não são ativadas como comerciais. O painel identifica testes e os exclui da soma
de recebimentos brutos de produção. Lançamentos financeiros manuais ficam separados.
Chaves Asaas, chave administrativa e token do processador continuam somente no
servidor/arquivos privados ignorados; o instalador contém apenas interface pública.

**Validação:** testes SQL/PGlite cobrem ativação, renovação, repetição, estorno,
isolamento, concorrência e decisões manuais. O PostgreSQL 15 executou o fluxo real
das funções em transação desfeita. A conferência da cópia confirmou os valores das
62 tabelas e as 70 políticas públicas iguais ao backup, sem alteração na produção.
O teste integrado criou cliente fictício sem notificações e assinatura PIX na API
real do Asaas Sandbox, confirmou pagamento simulado, ativou licença local e recusou
aviso forjado, duplicatas e reativação após cancelamento. Cancelou a assinatura e
o checkout de teste ao terminar. Não houve dinheiro real nem envio de cartão.
Esse teste usa assinatura PIX com referência vinculada à solicitação; **não comprova
a conclusão do checkout hospedado por cartão**, nem entrega pública de webhook.

Para teste local, `scripts/licensing-reconcile-local.mjs --watch` acompanha a fila
em loopback e recusa configuração de produção; o atalho do gestor o inicia quando
o token privado está configurado. Ele não inicia Docker nem as Edge Functions.
O token novo `ASAAS_RECONCILE_TOKEN` deve ser aleatório e privado. Em produção ainda
será necessário publicar funções/webhook e configurar um agendador persistente.

**Limites da etapa 0.1.3:** cancelamento e adicionais ainda não eram sincronizados.
A etapa seguinte abaixo acrescenta esses fluxos no Sandbox. Ainda faltam homologar
cartão/checkout e entrega pública dos webhooks, reativação da recorrência, política
comercial para inadimplência/estorno/chargeback, equipes/aparelhos e permissões no
AgriGest e na fila offline. Nenhuma licença comercial foi ativada e nenhuma migração
desta etapa foi publicada na nuvem. A main permanece intacta.
Marco Git: `agrigest-antes-conciliacao-2026-11-21`; bundle local verificado
em `checks.local/licensing-local/antes-conciliacao-2026-11-21.bundle`.

## Sincronização de assinaturas — etapa local 0.1.4

A migração `20261122000600_subscription_changes.sql` permanece restrita aos dois
bancos locais. Antes dela, foi criado o marco Git
`agrigest-antes-sincronizacao-2026-11-22`, bundle verificado e backup privado dos
dois schemas de licenciamento. Não altera tabelas ou RLS operacionais da fazenda.

Cancelamento da licença e concessão de cortesia enfileiram a suspensão dos contratos
vinculados. O processador confirma cliente, assinatura e periodicidade, executa
`PUT /subscriptions/{id}` com `status=INACTIVE` e consulta novamente antes de concluir.
Isso interrompe **novas** cobranças recorrentes; não remove nem estorna faturas já
emitidas. A documentação do Asaas diferencia suspensão e remoção:
https://docs.asaas.com/reference/atualizar-assinatura-existente.
O gestor mostra pendente/concluído e permite reenfileirar falhas. Contratos de
licenças canceladas antes da migração exigem solicitação explícita pelo botão da
licença; não são alterados silenciosamente ao publicar a migração.

Os quatro preços de adicional (fazenda/consultoria, mensal/anual) são configurados
somente pelo administrador com MFA. Não há preços comerciais presumidos. Sem preço,
o orçamento é recusado. O orçamento é calculado no servidor e a confirmação contém
o valor esperado, recusando mudanças entre simulação e aceite. Cada adicional soma
um usuário e dois aparelhos; os limites iniciais continuam 4 usuários/6 aparelhos
para fazenda e 4 usuários/5 aparelhos para consultoria.

O novo preço é aplicado com `updatePendingPayments=false`, somente às próximas
faturas ainda não geradas. Versões de preço por vencimento preservam a validação
das cobranças antigas, mesmo depois de mudar a recorrência. O preço unitário
contratado fica preservado para os próximos ajustes da mesma assinatura. Adicionais
novos só recebem capacidade após pagamento elegível e início do período; estorno
retira a capacidade correspondente. Redução de cota diminui o limite e o próximo
valor, sem reembolso implícito do período já pago. Cancelar a licença supersede
alterações de adicionais pendentes. O processador usa lease compartilhado com a
conciliação, verifica resultado antes de repetir uma alteração e não cria outra
assinatura ao tentar novamente. Faturas conhecidas na fronteira do preço bloqueiam
uma alteração incompatível para conferência.

O teste com a API real Sandbox confirmou aumento e redução do valor de assinatura
PIX e suspensão após cancelamento. A fatura paga original permaneceu com R$10 e
o adicional não foi liberado antes de pagamento/início do novo período. As funções
de orçamento e interrupção foram exercitadas na cópia PostgreSQL 15 em transação
desfeita. Testes SQL também cobrem confirmação de valor, isolamento, estorno de
capacidade e recuperação de resposta perdida. Uma correção trata HTTP 204 das RPCs
que retornam void, evitando reportar falha após uma gravação bem-sucedida. Houve uma
primeira tentativa Sandbox que identificou esse problema; o relatório privado é
preservado e o teste posterior passou. Nenhuma cobrança de produção foi criada.

As mensagens de conferência agora explicam cobrança/assinatura não encontrada,
credencial recusada ou contrato divergente. Referências fictícias são identificadas
por marcação explícita do servidor, apenas no Sandbox, sem inferir pelo erro 404.
Os quatro eventos antigos foram marcados localmente após conferência exata dos
pares evento/pagamento; o histórico não foi apagado. Eles não oferecem uma tentativa
inútil de consulta. O código técnico fica nos detalhes. Um 404 sem essa marcação
continua sendo caso real de conferência, sem ser apresentado como teste interno.

**Ao concluir a etapa 0.1.4, ainda estavam pendentes:** reativação da recorrência e
revogação de checkouts ainda sem contrato vinculado, acrescentadas na etapa seguinte.
Para uso comercial, ainda é necessário validar checkout/cartão e entrega
pública/agendamento dos webhooks; mapear contratos legados
com adicionais sem preço unitário e licenças com múltiplas assinaturas, integrar
remoção de funcionários e ocupação efetiva de cotas, equipe/aparelhos, permissões e
fila offline no AgriGest. Os limites desta etapa são metadados do gestor; o AgriGest
principal continua sem ser bloqueado por eles. Contratos ambíguos são recusados,
não têm preço inferido automaticamente. Não foi publicada migração na produção e
não houve merge na main.

Uma demonstração separada foi deixada ativa apenas no Sandbox e no banco local,
com o nome `DEMONSTRAÇÃO SANDBOX — adicionais e cancelamento`, para teste manual
pela conta administrativa já configurada. Tem pagamento PIX simulado de R$10,
sem cartão, notificações ou dinheiro real. Os preços comerciais continuam vazios.
Os testes anteriores encerraram suas próprias assinaturas. A solicitação pendente
da primeira tentativa falha foi marcada como supersedida porque seu cleanup já
removera a assinatura fictícia; foi acrescentado evento com estado anterior e
motivo, sem apagar histórico financeiro. O teste de vínculo tardio após cancelar
também confirmou a interrupção sob autenticação de serviço com auditoria válida.

## Contratação pelo titular e reativação paga — etapa local 0.1.5

A migração `20261122000700_owner_purchases.sql` foi aplicada somente aos bancos
locais 17/15, após backup privado dos schemas de licenciamento. Marco Git e bundle
verificado: `agrigest-antes-contratacao-2026-11-22`, arquivo privado em
`checks.local/licensing-local/antes-contratacao-2026-11-22.bundle`. Não modifica
tabelas, permissões ou lançamentos operacionais existentes.

O titular consulta o preço do servidor e registra a contratação via `start_purchase`,
com identidade obtida de `auth.uid()`, email verificado, idempotência e conferência
do valor aceito. Não pode escolher outro proprietário, definir seu próprio preço,
ativar a licença nem acessar funções administrativas. Os quatro preços base ficam
configuráveis no gestor, separados dos quatro preços de adicionais. Nenhum preço
comercial é presumido. Solicitações aparecem automaticamente no gestor; sua janela
não precisa ficar aberta para o servidor publicado processar eventos.

**Primeiro pagamento na contratação:** o checkout usa vencimento no dia atual em
America/Sao_Paulo, sem período gratuito. A função HTTP não aceita vencimento ou valor
vindos do cliente. Criar licença, assinatura, checkout ou retornar pelo callback não
concede acesso; só a conferência canônica do pagamento pode ativar. O Asaas pode
processar a cobrança de cartão com vencimento no dia, conforme documentação:
https://docs.asaas.com/docs/checkout-with-subscription-recurring e
https://docs.asaas.com/docs/subscriptions-faq.

Reativar exige nova contratação paga, após encerrar a recorrência/link anterior.
Não se retoma silenciosamente a assinatura antiga. `billing_checkout_id` e
`activation_required_after` impedem que comprovante antigo ou cobertura pré-paga
do contrato anterior libere ou prorrogue o novo. O histórico antigo continua salvo.
O estado de reativação é preservado enquanto a nova cobrança estiver pendente.
Adicionais consideram o contrato corrente, permitindo ajustar a quantidade após
reativar sem confundir assinaturas antigas já suspensas.

Cancelamento agora enfileira a revogação de checkouts sem contrato concluído. O
processador usa `POST /checkouts/{id}/cancel`; uma resposta 400/404 não é tratada
como prova de sucesso. Resultado incerto pede conferência; evento autenticado
CHECKOUT_CANCELED/EXPIRED pode concluir uma revogação já solicitada. Links gerados
tardiamente são revogados e ficam bloqueados no portal. Uma revogação antiga não
deve atingir o link novo. Se surgir pagamento tardio de checkout cancelado, o
contrato pode ser reconhecido para registrar o pagamento e suspender sua recorrência,
sem reativar a licença. A fila conserva lease, histórico e revisão de falhas.

A página compartilhada `OwnerPlanPortal` permite consultar planos próprios,
contratar, abrir checkout hospedado, cancelar, solicitar reativação e alterar
adicionais. O nome da instituição é sugerido quando disponível e pode ser alterado.
IDs de requisição sobrevivem a respostas perdidas no armazenamento local, com
escopo por conexão e titular. Não há dados de cartão ou chaves privadas no cliente.
O portal desta preparação mostra apenas licenças Sandbox.

No gestor 0.1.5, o botão **Testar portal do cliente** abre a experiência do titular
com a mesma conta autenticada; não fornece funções administrativas ao cliente e
não consulta RPCs de gestão nesse modo. O mesmo componente está preparado no PWA
em `/plano-e-licencas`, com link em Configurações, **somente quando** a flag
`VITE_LICENSE_PLANS=true` estiver explicitamente habilitada. A flag fica desativada
por padrão e esta etapa não publica mudanças na main/Netlify nem no Supabase real.

**Conferência pelo titular:** a migração local adicional
`20261122000800_owner_payment_checks.sql` e a função `asaas-check-payment` permitem
usar **Conferir pagamento** sem depender de webhook público no teste local. O
servidor autentica o titular, valida propriedade/ambiente, limita a frequência por
conta e consulta pagamentos do checkout ou da assinatura corrente no Asaas. Somente
referências compatíveis com esse vínculo entram na fila; valores e status da lista
não autorizam acesso. A conciliação faz novo GET autenticado do pagamento. O retorno
ao cliente contém apenas estado/contagem, sem dados de cartão ou de outros clientes.
A consulta não substitui webhooks públicos e agendamento em produção. Teste real
confirmou consulta vazia sem ativação, recusa de outra licença, limitação de
frequência e reconferência de pagamento já recebido sem duplicar a validade.

**Validação:** 14 testes de lógica/infraestrutura; TypeScript do PWA e gestor;
build PWA e gestor; interface com HTTP simulado e Auth/RLS reais. No teste real,
titular comum viu apenas sua licença, não viu a de outro titular e não conseguiu
alterar preços administrativos. Nenhuma consulta administrativa partiu do portal.
O PostgreSQL 15 exercitou contratação e reativação sem pagamento dentro de transação
desfeita. Os valores das 62 tabelas verificadas e as 70 políticas públicas da cópia
continuaram iguais ao backup.

Na API real Sandbox, um titular sem permissão administrativa contratou, teve seu
checkout não pago revogado, reativou por novo checkout e só recebeu ativação após
confirmação de novo pagamento PIX simulado. Aviso forjado, duplicata e pagamento
antigo não concederam acesso. Os contratos/links de teste foram encerrados ao final.
A primeira tentativa encontrou diferença no estado exibido (pendente em vez de
reativação solicitada), sem liberar acesso; foi corrigida e o teste posterior passou.
Relatórios privados preservam as tentativas. Esse harness usa assinatura PIX por
referência vinculada ao checkout e **não comprova concluir o checkout hospedado por
cartão**. A demonstração ativa da etapa anterior permanece separada desses testes.

**Próxima integração comercial:** vínculo explícito e único entre licença e fazenda,
cadastro sem empresa, equipes/convites, ocupação efetiva de cotas e aparelhos,
permissões por fazenda e autorização offline; homologação do pagamento hospedado
por cartão, webhooks públicos e agendamento persistente. A criação de licença ainda
não cria/associa uma instituição operacional e não bloqueia o AgriGest principal.
Esta etapa não publicou funções/migrações em produção e não fez merge na main.

## Abertura do checkout no Windows — correção 0.1.6

O usuário relatou que o link não abria no aplicativo Windows 0.1.5. A interface
usava somente uma âncora com `target=_blank`; o gestor Tauri não tinha uma ponte
para abrir esse pagamento no navegador do sistema. A correção registra o comando
nativo `open_payment_checkout` e usa ShellExecuteW/COM no Windows, sem executar
linha de comando, receber caminho de arquivo ou acrescentar dependências.
Referência da API: https://learn.microsoft.com/en-us/windows/win32/api/shellapi/nf-shellapi-shellexecutew.

JavaScript e Rust aceitam somente o endereço exato do checkout Sandbox com um
único identificador ASCII de até 200 caracteres. Outros hosts, protocolos, caminhos,
parâmetros, fragmentos, espaços e caracteres de controle são recusados. Não foi
liberado um abridor genérico de URLs ou arquivos. O portal de preparação continua
restrito ao Sandbox. A ponte está registrada no gestor Windows; o PWA no navegador
mantém a abertura normal em outra aba. A integração nativa do PWA principal continua
dependente da etapa de publicação/empacotamento desse aplicativo.

O componente compartilhado mostra o endereço em campo somente leitura e oferece
Copiar link. Falha da área de transferência seleciona o campo e orienta Ctrl+C;
falha da abertura nativa mostra uma mensagem, sem pedir outro checkout. Abrir ou
copiar não chama o banco, não cria contratação/checkout e não confirma pagamento.
O alinhamento do botão do cabeçalho também foi corrigido. Falhas de rede agora têm
mensagem em português e orientação de iniciar o Docker/servidor no ambiente local.

Validação local: TypeScript do gestor/PWA, teste de endereços permitidos e interface
sob CSP. A interface com IPC simulado confirmou comando/endereço, falha nativa,
cópia e alternativa Ctrl+C, sem nova chamada de criação nem liberação da licença.
O workflow Windows compila e executa adicionalmente o teste Rust do validador antes
de gerar o instalador. Instalação e abertura real do navegador no Windows do usuário
ainda dependem do teste da atualização; os testes de IPC não são apresentados como
execução real do binário instalado.

Ponto de restauração: `agrigest-antes-correcao-link-2026-11-23`, com bundle privado
verificado em `checks.local/licensing-local/antes-correcao-link-2026-11-23.bundle`.
Esta correção não modifica banco, registros, RLS ou funções de cobrança e permanece
na branch `codex/licenciamento-planejamento`, sem alterar a main.

## Conferência do checkout pago — correção 0.1.7

Em 23/11/2026, o pagamento Sandbox real do teste estava RECEIVED no Asaas,
mas GET /payments?checkoutSession retornava lista vazia. A consulta por data
retornou o pagamento com o UUID exato do checkout. A recuperação passou pela
fila e por novos GETs autenticados de pagamento/assinatura: a licença ficou
ativa, sem nova cobrança e sem ativação manual direta.

Quando o filtro do checkout retorna vazio e ainda não há assinatura vinculada,
o servidor consulta no máximo cinco páginas de 100 pagamentos, entre o dia
anterior e dois dias após a criação persistida do checkout. Só os pagamentos
com checkoutSession exatamente igual entram na fila; valor/data não identificam
uma contratação. Busca incompleta falha sem declarar ausência de pagamento.
O processador continua verificando preço, cliente, assinatura, período e vínculo
antes de alterar cobertura. A migração 9 acrescenta a data à função privada de
consulta do titular, preservando autorização e limite de 10 segundos.

A interface distingue indisponibilidade, espera por pagamento e limite de
consultas. Orienta a não pagar novamente e explica que acompanhar pedido e
redirecionar ao AgriGest são navegação, não prova de pagamento. No teste local,
o callback continua apontando ao login publicado: retorne ao portal de teste e
atualize os planos para conferir a licença.

Validação: 17 testes Node, TypeScript do PWA/gestor e contrato PostgreSQL 15.
A recuperação foi também testada com GETs reais no Sandbox, autenticação do
handler simulada e fila apenas capturada, sem criar cobranças. As 62 tabelas,
70 políticas públicas e RLS da cópia restaurada continuam iguais ao backup.
Funções locais recarregadas. Produção e main não alteradas. Ponto Git anterior:
agrigest-antes-conferencia-2026-11-23; bundle e backups dos schemas de licenças
anteriores à migração estão em checks.local/licensing-local.

## Entrega de preparação

- **Atual: 0.1.9**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/45368299128.
  Commit `666db3220f2658ea8edc9b98afaf879f4009acbd`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.9-preparacao`,
  2.044.227 bytes; SHA-256
  `D9C9D1D9F1A21205E6714EE62494B9956D4BA0941AB5BA7A201F7F5AF9F29262`.
  ZIP, identidade, versão, commit e hash conferidos. Não assinado. Os 21 testes,
  TypeScript e teste Rust passaram no CI Windows. Interface local com Auth/email
  reais, troca de conta no convite, concorrência e PostgreSQL 15 passaram.
  A regressão de aparelhos na interface compilada sob CSP também passou.
  Instalação nativa deste binário ainda depende do teste do usuário.
  COMO-TESTAR.txt acompanha a entrega e explica os emails capturados localmente
  e a ausência de integração com os dados operacionais atuais.


- **Anterior: 0.1.8**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/45301264187.
  Commit `bcdcc33be6408aa7bd76de5b9fedf4d11619d9d9`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.8-preparacao`,
  2.036.638 bytes; SHA-256
  `DE586394BEDF232D97FA14520522718FAA22D9A76A1DC94843D1801CCBE10C02`.
  ZIP, identidade, versão, commit e hash conferidos. Não assinado. Os 18 testes,
  TypeScript e teste Rust de URL passaram no CI Windows. Interface compilada,
  Auth/RLS locais e concorrência real passaram; instalação nativa deste binário
  ainda depende do teste do usuário. COMO-TESTAR.txt acompanha a entrega.


- **Anterior: 0.1.7**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/45297719509.
  Commit `5a5244af0c2be88f63a84c7a9d38751853b6cc50`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.7-preparacao`,
  2.029.926 bytes; SHA-256
  `F8E178764253C88DD016D270F2A5542F3A4CF3884F8955EB143C8B60837E11D8`.
  ZIP, versão, identidade, commit e hash conferidos. Não assinado; instalação
  nativa desta atualização ainda não executada. Os 17 testes Node, TypeScript e
  teste Rust de URL passaram no CI Windows. Instruções locais em COMO-TESTAR.txt.


- **Anterior: 0.1.6**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/45293701671.
  Commit `b322cd25261374a4ec7c2e89de555a4bf0cd1b87`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.6-preparacao`,
  2.032.469 bytes, SHA-256
  `E81ECB17EA7ECDC37C73B86C8287D43B00BA1C541ED80041C2CA3316BA0E48A0`.
  Versão/identidade/commit/hash conferidos após extração. Não assinado. Os 15 testes
  JavaScript/servidor e TypeScript passaram no CI, assim como a compilação e execução
  do teste Rust de validação de URL no Windows. A interface com IPC simulado passou
  localmente, incluindo falhas e cópia/seleção, sem gerar nova contratação/checkout.
  Não se afirma abertura real pelo binário instalado neste computador; essa etapa
  depende do teste da atualização pelo usuário. `COMO-TESTAR.txt` acompanha a entrega.

- **Anterior: 0.1.5**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/45024271933.
  Commit `93b38d4417076e399c142651f8eecb5970adb558`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.5-preparacao`,
  2.024.041 bytes, SHA-256
  `6831F971691A2A043F78C32965B01D6BBE32DDCFC03E25817D701DEB45C4D885`.
  Versão/identidade/commit/hash conferidos após extração do ZIP. Não assinado;
  instalação nativa neste Windows ainda depende do teste do usuário. O arquivo
  `COMO-TESTAR.txt` explica a configuração dos preços base, o portal do titular,
  primeiro pagamento, conferência no teste local e reativação por nova contratação.
  Os 14 testes e TypeScript do PWA/gestor passaram no CI. Build PWA, interface com
  mocks, Auth/RLS reais e ciclo de pagamento PIX simulado Sandbox passaram localmente.
  A compilação anterior sem o botão de conferência também concluiu, mas o arquivo
  entregue é o commit mais recente, com o recurso e suas verificações.

- **Anterior: 0.1.4**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/45018280678.
  Commit `85b08ea90d65ea2393366d76b8b77569e3ff1dc3`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.4-preparacao`,
  2.022.785 bytes, SHA-256
  `4148AA0E78ACECFE46E66BC02673C3B7A684AF1356F13B61B83135F7BDDD0790`.
  Versão/identidade/commit/hash conferidos após extração do ZIP. Não assinado;
  instalação nativa neste Windows ainda não testada. Instruções `COMO-TESTAR.txt`
  acompanham a entrega e explicam a licença de demonstração e os limites atuais.
  Os 11 testes e TypeScript passaram também no CI; interface compilada testada
  com mocks e Auth/MFA reais. A compilação anterior foi supersedida pelo ajuste
  de auditoria do vínculo tardio, sem entrega de arquivo desatualizado.

- **Anterior: 0.1.3**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/44892380539.
  Commit `4251b8a6f1f207c07db725782f283d290a1a1206`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.3-preparacao`,
  2.018.749 bytes, SHA-256
  `DD092535FF2C619B95F0C217B41290C1A4E16B76F46017FD83AA07B561B045A8`.
  ZIP extraído, versão/identidade/commit/hash conferidos; instalação nativa ainda
  não testada. Não assinado. `COMO-TESTAR.txt` acompanha a entrega local.
  Interface compilada testada no Edge sob CSP, com mocks e com Auth/MFA e tabelas
  reais locais; usuário administrativo sem MFA foi recusado. Reenfileiramento
  conferido no fluxo de interface simulado e endpoint autorizado com sessão MFA
  real. Os nove testes de lógica/infraestrutura e TypeScript passaram também no CI.

- **Anterior: 0.1.2**, Actions concluído:
  https://github.com/fbdelatorre/Agrigeest/actions/runs/44887010938.
  Commit `c68830afc4229b3671ba4e5d55ad7ea7672e6cf2`.
  Instalador em `checks.local/entregas/gestor-licencas-0.1.2-preparacao`,
  2.017.314 bytes, SHA-256
  `789AA1C4A665A43B7AC39A3CEBA2DBB18DA85727AC647DD2A4BFEC8CF6376633`.
  ZIP extraído, versão/identidade/commit/hash conferidos; instalação nativa ainda
  não testada. Não assinado. `COMO-TESTAR.txt` acompanha a entrega local.
  A compilação antiga do protótipo passou a observar só seus próprios scripts,
  evitando novos builds quando mudam apenas os helpers do servidor real.

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
