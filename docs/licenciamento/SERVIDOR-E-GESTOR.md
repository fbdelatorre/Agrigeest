# Servidor de licenças e gestor separado — preparação

O usuário autorizou a futura integração à main e publicação no Supabase real.
Isso não torna o protótipo de identidade simulada apto para produção. As condições
de backup, restauração, compatibilidade e mapeamento de titularidade continuam
necessárias. Nenhuma alteração de banco real ou integração à main foi executada.

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
- Confirmação por email recebido, Asaas Sandbox, restauração do banco real,
  migração dos perfis e instalação nativa ainda não foram executados. A conta
  Sandbox foi confirmada pelo usuário; a chave precisa ser configurada privadamente.

## Próximos passos necessários

1. Docker/WSL2 e testes reais locais concluídos. Para reabrir o gestor no navegador,
   executar `licensing-server-local/Testar-Gestor-Local.cmd`. Ele inicia o projeto
   isolado, preenche a conexão pública e prepara uma conta fictícia local com MFA
   obrigatório. Email/senha inicial ficam em `checks.local/licensing-local`, nunca
   no Git ou no terminal. A janela deve permanecer aberta durante o teste. A conta
   real da administração ainda não recebeu autorização no banco de produção.
2. Conectar a CLI à conta Supabase usando `licensing-server-local/Conectar-Supabase.cmd`.
   O launcher só executa login; não faz deploy, push, reset ou alterações de banco.
3. Obter backup completo e inventário do projeto real, restaurar a cópia e conferir
   esquema, funções, RLS, contagens, saldos e arquivos. Reconciliar migrações que
   foram aplicadas manualmente antes. Não executar `db push` no projeto real.
4. Confirmar proprietários e vínculos reais. Não presumir titularidade por quem
   criou o cadastro, pela profissão ou pelo `is_admin` atual.
5. Criar/configurar conta Asaas Sandbox e guardar sua API key somente no arquivo
   privado/secret store do servidor. Não usar chave de produção nos testes.
6. Concluir integração financeira e autorização real de equipes, testar todas as
   mutações legadas/RPCs, fila offline e transição entre versões, preservando dados.
7. Só depois promover a integração validada à main e publicar de forma controlada,
   sem suspender inesperadamente as contas existentes.

## Etapa local de 20/11/2026

O gestor 0.1.1 usa a nova porta local 46321, inclusive na CSP nativa. O instalador
0.1.0 anterior continua sendo um artefato de preparação e usa a porta antiga.
A compilação 0.1.1 precisa ser entregue/verificada separadamente. Nenhuma destas
versões substitui o AgriGest principal ou conecta pagamentos automaticamente.
Os testes locais não mudaram a main e nenhuma operação foi feita no banco real.

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
