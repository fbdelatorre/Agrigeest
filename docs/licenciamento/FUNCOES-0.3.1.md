# Alteração de função da equipe — protótipo 0.3.1

Implementado somente na branch `codex/licenciamento-planejamento` e no aplicativo
independente AgriGest Licencas Teste. Main e Supabase não foram alterados.

## Como utilizar

- Proprietário da fazenda: Fazenda → Equipe e convites → funcionário → Função do
  funcionário → escolher cargo → Salvar função → confirmar.
- Proprietário da consultoria: Equipe da consultoria → funcionário → escolher
  nova função → Salvar função → confirmar.
- Função atual vem preenchida. Cargos disponíveis: administrador, monitor de
  campo e responsável por aplicação. Não é necessário desligar ou convidar de novo.

## Regras

Somente o proprietário da respectiva equipe altera a função. Administradores,
responsáveis, monitores, consultores externos e gestor de licenças não recebem
essa permissão. Funcionários desligados não são reativados pela troca de cargo.
O proprietário não pode ser transformado em funcionário por este caminho, e
consultor externo não é convertido em empregado. Esses vínculos são distintos.

A função determina as permissões das próximas consultas e ações no banco local,
sem depender apenas de esconder botões. Na consultoria, o teto de consultor e as
fazendas selecionadas continuam sendo respeitados. Alterar cargo não compartilha
uma fazenda adicional nem permite repassar acessos. O bloqueio por licença em
modo de consulta também impede alterações de função que ampliem o acesso.

A conta, a autoria e os lançamentos anteriores permanecem intactos. A alteração
não muda vagas contratadas, aparelhos ou valores. O histórico registra quem
alterou, quando, a pessoa afetada e a função anterior/nova. A mesma solicitação
repetida não duplica o evento. Se outra ação alterar o cargo antes do salvamento,
o banco recusa a versão antiga para evitar sobrescrever silenciosamente.

`role-changes.sql` é uma evolução local guardada por marca de teste, aplicada
uma vez em transação. Não aplicar no Supabase. A identidade continua simulada;
a implantação futura exigirá a mesma validação usando autenticação real.

## Validação

Doze grupos de testes aprovados, com as regressões anteriores e novos cenários:
proprietário correto, tentativas de outros perfis/fazendas, proprietário/consultor
como alvo, funcionário desligado, licença cancelada, promoção/rebaixamento,
repetição, conflito de versão/concorrência, histórico e preservação de registros,
saldos, licenças e fazendas autorizadas. TypeScript e ESLint sem erros no laboratório.

Interface no Edge sob a CSP nativa: Eva promovida/rebaixada na Aurora mantendo
seus monitoramentos; Gabriel muda de administrador para monitor e responsável
na consultoria, mantendo somente Cedro e sem executar aplicações de cliente.
As regressões anteriores continuam aprovadas, sem chamadas externas.
Instalação e abertura nativa do pacote ficam para teste pelo usuário.
