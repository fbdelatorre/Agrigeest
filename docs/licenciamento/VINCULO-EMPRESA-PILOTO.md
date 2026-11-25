# Licença paga e empresa no piloto local

Etapa de 25/11/2026, após `42f357b`, na branch de testes
`codex/licenciamento-planejamento`. Sem publicação em produção ou alteração da main.

## Funcionamento

Em **Plano e licenças → Vincular licença paga à empresa**, o titular pode:

- Criar uma fazenda nova, com base operacional vazia e isolamento por fazenda.
- Criar uma consultoria, sem criar uma fazenda ou receber acesso a clientes automaticamente.
- Substituir a cortesia de uma empresa existente por uma licença paga do mesmo tipo.

Licença, nome da nova empresa e empresa compatível são preenchidos quando possível.
As seleções permitem buscar digitando. O titular confirma o destino antes da gravação.
O nome da empresa existente é mantido, mesmo que o nome da licença seja diferente.
Nomes de fazenda duplicados são recusados; nunca se vincula uma fazenda por semelhança de nome.

Para testar, abra `http://127.0.0.1:48780/pilot-plans`. Após pagar no Sandbox e
conferir o pagamento, clique em **Atualizar vínculos disponíveis**. Uma solicitação
pendente não libera o vínculo. Preços não configurados continuam impedindo contratação.

## Preservação e limites

A troca mantém o ID da empresa, o vínculo operacional, membros e funções, convites,
consultores e delegações. Não move nem recalcula áreas, safras, produtos ou lançamentos.
A cortesia antiga é encerrada e identificada como substituída, com histórico preservado.
O titular não pode reativá-la como uma segunda licença gratuita.

As autorizações antigas de aparelhos são encerradas e as solicitações pendentes dessa
licença são rejeitadas com registro do revisor. O histórico permanece. Os aparelhos
devem ser autorizados na nova licença pelo proprietário. Nenhuma autorização é copiada.

Uma empresa que já tem contrato pago não participa desta troca: seria necessário
tratar o encerramento do contrato anterior para evitar cobranças simultâneas.
Não se modifica automaticamente nenhuma empresa real do piloto, inclusive Grupo Delatorre.

## Garantias verificadas no servidor

- Sessão confirmada e ainda válida; titularidade da empresa e da nova licença.
- Licença Sandbox ativa e pagamento canônico elegível, sem estorno, no período vigente,
  associado ao contrato e ao pedido de cobrança da licença.
- Versões da licença nova e da cortesia, tipo da empresa, vagas usadas e reservadas,
  limites de usuários e de aparelhos.
- Transação única, chave de repetição e eventos de auditoria. Repetir a mesma confirmação
  não duplica empresa nem a troca; uma falha desfaz toda a transação.
- Bloqueios de organização em convites, aceites, alterações de equipe e gravações
  operacionais. Convite simultâneo e troca respeitam as vagas efetivamente ocupadas.

Criar uma fazenda usa uma autorização privada para uma única inserção de instituição,
vinculada ao usuário, ID novo e transação. Ela é removida imediatamente; clientes
não podem acessá-la. RLS e triggers não são desabilitados. Uma fazenda nova não exige
alterar o perfil antigo do usuário nem copiar registros de outras fazendas.

## Restauração e validação

`scripts/apply-pilot-companies.mjs --local-only` valida o destino e salva, antes da
primeira aplicação, `before-pilot-companies.dump` na pasta privada do contexto piloto,
com tamanho, SHA-256 e verificação da listagem do arquivo. Não sobrescreve o backup.
O dump desta etapa teve sua listagem verificada; não se afirma que ele foi restaurado.
Uma restauração deve ser ensaiada em outra base, evitando sobrescrever lançamentos posteriores.

`tests/pilot-company-licenses.integration.cjs --local-only` usa contas fictícias,
Supabase Auth real local, RPCs e navegador. O pagamento elegível desse teste é uma
fixture SQL; não é um novo teste do provedor nem uma cobrança. A integração real
Asaas Sandbox foi validada na etapa financeira anterior.

Os cenários incluem pagamento inelegível, outro titular, funcionário, versão antiga,
nome duplicado, ausência de permissão de provisionamento reutilizável, criação de
fazenda e consultoria, troca pela interface, reautorização de aparelho, repetição,
recusa de troca de contrato pago, concorrência e larguras de 1366 e 390 pixels.
As fixtures são removidas e hashes de todas as tabelas públicas e das licenças,
empresas, equipes, convites, vínculos e aparelhos originais são comparados ao final.

Permanecem fora desta etapa a publicação comercial, o webhook público de produção,
a migração de contratos pagos existentes e a política final de licença offline.
