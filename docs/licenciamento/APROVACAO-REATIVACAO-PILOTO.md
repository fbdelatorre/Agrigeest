# Aprovação de reativação no gestor do piloto

Etapa de 25/11/2026 na branch de testes. Marco anterior: `c3ae8a2`.
Main e produção não foram alteradas. A preparação não aprovou licenças existentes;
a Consultoria Teste permanece pendente para o teste manual. Nenhum instalador foi gerado.

## Acesso e uso

O gestor conectado ao aplicativo piloto fica em `http://127.0.0.1:4181`.
Inicie novamente por `Testar-Gestor-Piloto-Local.cmd`, com os serviços locais ativos.
A conta administrativa anteriormente indicada pelo proprietário do aplicativo foi
habilitada com MFA obrigatório. O email fica em arquivo privado de checks.local,
sem senha ou identidade pessoal no código público. O atalho não cria conta nem
redefine senha. Proprietários e administradores de fazenda não ganham esse acesso.

Na primeira entrada, configure e confirme o autenticador do gestor do piloto.
Depois, em Licenças e cortesias → Reativações aguardando aprovação, confira a
solicitação e o motivo preenchido e clique Aprovar reativação gratuita. O titular
atualiza planos e permissões no aplicativo. A aprovação mantém validade, limites,
conta, empresa e lançamentos. Licença paga não recebe esse botão de cortesia.

## Isolamento e segurança

O novo gestor usa a API 48721 do banco piloto. O gestor anterior continua na porta
4180 e na base de preparação separada. O modo piloto aceita apenas o endpoint local
esperado, busca somente chave pública e não reutiliza a conexão anterior. Não
recebe credenciais de serviço nem oferece o portal de contratação de clientes.

O bootstrap aceita apenas o contêiner/banco piloto identificados e a conta
confirmada e disponível. Se encontrar outro administrador, interrompe sem removê-lo
ou substituir a titularidade. A conferência final confirmou uma única conta
administrativa, com MFA obrigatório.

As funções anteriores foram guardadas antes da aplicação. No piloto, os controles
administrativos passam a exigir sessão viva, conta disponível e papel privado.
Quando MFA é exigido, também verificam AAL2 e um fator verificado. RLS e permissões
operacionais não foram modificadas. A origem local 4181 foi permitida no proxy.

`admin_pending_reactivations()` exige administrador. `admin_approve_reactivation`
exige também banco piloto, cortesia de teste, solicitação pendente, versão atual,
motivo e validade não encerrada. A transação bloqueia a linha e registra ator,
motivo e situação anterior. Pedidos repetidos não duplicam a aprovação. Não há
renovação automática de validade nem criação de pagamento para liberar acesso.
Aplicação: `node scripts/apply-pilot-manager.mjs --local-only`.

## Validação

O navegador real testou administrador e licença fictícios com TOTP real. Passaram:
recusa de proprietário sem papel administrativo, ausência de MFA, fator não
verificado, conta excluída, sessão expirada, versão antiga e licença paga;
aprovação pelo painel, permissão de gravação restaurada, histórico preservado e
auditoria única. As outras solicitações pendentes permaneceram iguais.

Fixtures e permissões fictícias foram removidas e os hashes operacionais anteriores
ficaram iguais. Passaram também TypeScript, compilação dos dois gestores, contratos
de planos/equipe/aparelhos e regressão transacional de estoque/operações. O teste
simulado do gestor anterior foi atualizado para suas consultas de equipe e sua
mensagem de pagamento pendente já existentes e passou. Relatórios e capturas
ficam em checks.local; nenhum segredo TOTP foi exibido nos resultados.

## Próxima etapa

Conectar contratação e adicionais do aplicativo ao Asaas Sandbox: orçamento no
servidor, primeiro pagamento na contratação, confirmação antes da liberação de
vagas e tratamento de cancelamentos e pedidos repetidos. Cortesias continuam
dependendo exclusivamente do gestor autorizado.
