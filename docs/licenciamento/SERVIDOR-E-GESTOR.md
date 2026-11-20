# Servidor de licenças e gestor separado — preparação

O usuário autorizou a futura integração à main e publicação no Supabase real.
Isso não torna o protótipo de identidade simulada apto para produção. As condições
de backup, restauração, compatibilidade e mapeamento de titularidade continuam
necessárias. Nenhuma alteração de banco real ou integração à main foi executada.

## Decisões desta etapa

- Provedor confirmado: Asaas, com cobrança automática como objetivo; não Stripe.
- Instalação de Docker Desktop/WSL2 será feita manualmente pelo usuário. O agente
  não recebeu autorização para instalá-los nem para reiniciar o computador.
- Conta administradora desejada foi informada pelo usuário e anotada em arquivo
  privado em `checks.local`. O acesso ainda não foi concedido no Supabase real.
  Não colocar email pessoal, chaves ou o bootstrap privado no repositório público.
- Não há preços comerciais definidos no código. Valores contratados são inteiros
  em centavos; nenhuma cobrança foi criada ou enviada ao Asaas.

## Preparado no código

`licensing-server-local` é um projeto CLI separado, não vinculado à nuvem. Usa
API 55321, banco 55322, Studio 55323 e caixa de emails local 55324. Autenticação
exige confirmação de email e permite TOTP. Novas tabelas não ganham grants amplos
automaticamente. Serviços desnecessários foram desabilitados para esta validação.

`scripts/licensing-local.mjs` aceita somente doctor/start/status/stop, recusa um
project-ref remoto, isola credenciais do processo e verifica uma rede Docker com
publicação de portas em loopback. Não fornece reset, push ou deploy. Stop mantém
o comportamento padrão de preservação dos volumes. No diagnóstico realizado,
CLI 3.2.0 disponível; Docker/WSL2 não instalados/disponíveis. Portanto o Supabase
local **ainda não foi iniciado** e o isolamento de rede ainda precisa ser testado
com Docker de verdade. Há 32 GB de RAM, Windows 11 e cerca de 31 GB livres no disco.

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
- Testes reais de Supabase/Auth/email/Docker, Asaas Sandbox, restauração do banco,
  migração dos perfis e instalação nativa ainda não foram executados.

## Próximos passos necessários

1. Usuário instala e inicia Docker Desktop com WSL2, reiniciando por conta própria
   se necessário. Então executar `npm run licenses:local -- doctor` e iniciar a
   cópia com `npm run licenses:local -- start`.
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
