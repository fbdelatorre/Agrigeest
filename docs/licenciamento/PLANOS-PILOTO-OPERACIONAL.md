# Plano e licenças no piloto operacional

Etapa de 25/11/2026 na branch de testes. Marco anterior: `288debe`.
Não publica em main/produção, não gera instalador e não ativa integração de cobrança.
As funções foram acrescentadas apenas ao banco piloto; a aplicação dessas funções
não alterou nenhuma licença ou registro existente.

## Página

`http://127.0.0.1:48780/pilot-plans` está disponível no menu, próximo de Membros
e licença, e nas páginas de conta/convites e consultoria. Funciona fora do contexto
operacional de uma fazenda, inclusive após cancelamento da licença ou revogação
de acesso à fazenda que estava selecionada.

Mostra tipo, titularidade, situação, validade, vagas ocupadas/reservadas, limites e
adicionais. A base continua com proprietário + três funcionários, seis aparelhos
para fazenda ou cinco para consultoria; cada adicional libera uma vaga e dois
aparelhos. A ocupação de aparelhos acompanha os cadastros não revogados, como no
controle de aparelhos, sem afirmar que todas as autorizações antigas foram revisadas.

O titular consulta suas próprias licenças. Funcionários consultam metadados das
licenças às quais têm vínculo ativo, sem valores financeiros nem ações contratuais.
O convite de consultoria para uma fazenda cliente não dá acesso à licença financeira
do cliente. Não há acesso administrativo global por ser dono de uma fazenda.

## Cancelamento e reativação

Esta etapa permite somente cancelar cortesias de teste. O servidor exige conta e
sessão válidas, titularidade, licença gratuita e modo de teste. Uma versão de
atualização impede confirmar uma ação com dados antigos. Pedidos repetidos com
o mesmo identificador não geram outra alteração; trocar o conteúdo do pedido é
recusado. A função possui guarda de banco piloto também durante a execução.

Cancelar conserva a conta, empresa, membros, autoria, aparelhos e lançamentos.
Esse vínculo deixa de liberar gravações; uma permissão independente por outra
licença válida não é removida. Isso não
apaga nem remaneja dados para outra fazenda. A página permite solicitar reativação,
que fica aguardando aprovação de quem concedeu a cortesia; a solicitação não
reativa acesso nem cria pagamento automaticamente. É possível retirar a solicitação.

A ação reutiliza `owner_license_action`, mantendo os registros de auditoria e
os mecanismos de idempotência existentes. Se a ação foi confirmada mas a consulta
posterior falhar, a interface informa que a alteração foi registrada e pede atualização,
evitando orientar o usuário a repetir uma mudança já concluída.

Aplicação local: `node scripts/apply-pilot-plans.mjs --local-only`. O script aceita
somente o contêiner e o banco piloto previamente identificados, usa transação e
guarda de banco e não redefine funções operacionais ou RLS de tabelas existentes.

## Validação

O teste real de navegador, com licenças e contas fictícias, confirmou:

- Lista restrita ao titular ou membro, sem preços financeiros para funcionário.
- Recusa no servidor de ação por funcionário, versão antiga e licença não gratuita.
- Cancelamento de cortesia pelo titular, com recusa de gravação e histórico legível.
- Conta, empresa, autoria e registros preservados depois de cancelar.
- Repetição do mesmo pedido sem evento duplicado e recusa de conteúdo conflitante.
- Reativação solicitada ainda em modo de consulta, sem pagamento nem tarefa de cobrança.
- Página acessível para titular e funcionário após o cancelamento.
- Layout em 1366 e 390 px sem rolagem horizontal.

As fixtures foram removidas e os hashes das tabelas operacionais anteriores
permaneceram iguais. TypeScript, contratos de equipe/aparelhos/preferências/planos,
compilação web e regressão transacional de operações e estoque também passaram.
Relatórios e capturas ficam em checks.local, fora do Git. A Consultoria Teste
manual e as licenças reais da cópia não foram canceladas pelos testes.

## Próximas integrações

Contratação, alterações de adicionais e cobrança automática ainda não estão
conectadas a esta página operacional. As rotinas Asaas Sandbox já existentes no
outro ambiente de preparação permanecem separadas. A etapa seguinte deverá ligar
esses fluxos com confirmação de pagamento no servidor, mantendo a exigência do
primeiro pagamento na contratação. A aprovação administrativa de cortesias foi
integrada posteriormente em [APROVACAO-REATIVACAO-PILOTO.md](APROVACAO-REATIVACAO-PILOTO.md),
exclusiva do gestor autorizado e sem autoaprovação no aplicativo cliente.
