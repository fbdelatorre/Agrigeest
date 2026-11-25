# Contratação e adicionais Asaas no piloto

Etapa de 25/11/2026 na branch de testes. Marco anterior: `bd89fc1`.
Main, Supabase de produção e o ambiente anterior de cobrança não foram alterados.
Não foi gerado instalador. Antes da mudança foi salvo um dump local com manifesto
e listagem do arquivo verificados, em checks.local, sem sobrescrever cópia anterior.

## Como testar

No gestor do piloto, `http://127.0.0.1:4181`, entre com a conta administrativa e
MFA. Em Pagamentos → Assinaturas e usuários adicionais, configure os preços dos
planos base e dos adicionais, por tipo e período. Não foram definidos preços
comerciais pelo código. Sem preço, a contratação correspondente é recusada.

No aplicativo, `http://127.0.0.1:48780/pilot-plans`, abra Asaas Sandbox → Contratar
licença ou gerenciar adicionais pagos. Nome e tipo são sugeridos a partir das
licenças próprias disponíveis e podem ser alterados. O servidor calcula valores
e limites. A contratação cria uma licença nova; não substitui uma cortesia nem
associa automaticamente dados existentes de outra fazenda.

O primeiro pagamento é exigido na contratação. O checkout é hospedado pelo Asaas,
com recorrência por cartão; o aplicativo não recebe dados de cartão. O retorno
do navegador aponta para o piloto e não ativa a licença. Use Conferir pagamento
para consultar o resultado no servidor, sem repetir um pagamento já realizado.
Licenças pagas ativas também oferecem conferência de pagamentos e renovação.

As alterações de adicionais usam os preços e condições já preparados no servidor:
aumento de capacidade depende de pagamento e início do período correspondente;
redução respeita vagas ocupadas, aparelhos e convites. Cada adicional corresponde
a uma vaga e dois aparelhos. Faturas já emitidas não são reescritas. Cancelamento
envia a suspensão da recorrência à fila e conserva o histórico.

## Implementação e limites

O proxy do piloto usa os handlers compartilhados de checkout, confirmação,
conciliação canônica e alterações de assinatura. O provedor é fixo no Sandbox,
com produção explicitamente desativada. A chave privada é lida apenas pelo Node,
do arquivo local já configurado; chaves ou endereços de outro Supabase nesse
arquivo não são usados para escolher o banco. O contexto e a API são fixos no piloto.

As funções financeiras anteriores foram preservadas em schema privado. As chamadas
de contratação, reserva, cancelamento e adicionais agora exigem sessão viva e
ambiente de teste. As regras anteriores de titularidade, preço, vagas, concorrência,
idempotência e resultados incertos foram mantidas. Não houve atualização de
registros existentes ao aplicar essas proteções.

O processador interno roda a cada 15 segundos, serializa execução e usa as leases
do banco. Ele processa somente a fila Sandbox desta base. O endpoint de execução
manual exige administrador com MFA; o cliente comum não recebe token de worker.
Consultas de confirmação geram eventos duráveis e o processador faz novo GET
autenticado ao Asaas antes de aceitar valor, assinatura, cliente e pagamento.

As origens do piloto são explícitas, e a origem padrão dos handlers anteriores
não foi ampliada. O cabeçalho de ambiente é validado. O callback local só é
aceito pelo cliente Asaas em modo Sandbox. As demais integrações continuam com
seus callbacks anteriores. A política de retorno segue a
[documentação Asaas](https://docs.asaas.com/docs/checkout-link-and-customer-redirection).

O servidor local não recebe webhooks da Internet. Neste piloto, a conferência
autenticada alimenta a fila. Webhooks públicos, reconciliação de renovações sem
intervenção e publicação comercial exigem a etapa de servidor hospedado.
Licenças novas ainda precisam ser associadas à empresa/fazenda correta em etapa
controlada; não foi reassociado nenhum perfil, talhão, estoque ou lançamento.

## Validação

`tests/pilot-billing-sandbox.integration.cjs --sandbox-local-only` criou conta e
licença fictícias e um checkout pela interface do aplicativo na API real Sandbox.
A confirmação automatizada usou uma assinatura PIX fictícia vinculada pela
referência persistida do checkout, sem enviar cartão. Passaram:

- Pedido e checkout permanecem pendentes sem pagamento confirmado.
- Um evento com valor/status adulterados não ativa um pagamento ainda pendente.
- Pagamento Sandbox confirmado ativa a licença por consulta canônica ao provedor.
- Repetições não renovam a validade em duplicidade.
- Conferência pelo titular e recusa de processamento administrativo pelo cliente.
- Aumento e redução do próximo valor recorrente, sem liberar adicional não pago.
- Preservação da fatura paga e suspensão confirmada após cancelamento.
- Evento tardio não desfaz o cancelamento explícito do titular.

Assinatura, checkout e cliente externos do teste foram encerrados/removidos. O
histórico financeiro fictício foi mantido como Sandbox e a conta de teste ficou
bloqueada. O administrador fictício foi removido. Preços temporários só foram
inseridos onde não existiam e foram removidos sem sobrescrever configuração alheia.
Os hashes das licenças e dados operacionais anteriores permaneceram iguais.

Também passaram os testes de equipe/isolamento/MFA/aprovação com a integração
ativa, recusa de produção e sessão encerrada no PostgreSQL, contratos financeiros,
TypeScript, compilação web, gestor anterior e formulário em 1366 e 390 px.
Relatórios e capturas ficam em checks.local. O checkout hospedado com cartão e
o retorno no navegador devem receber também o teste manual do usuário.
