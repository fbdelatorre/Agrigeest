# Equipe da consultoria no piloto operacional

Etapa de 24/11/2026, na branch de testes. Marco anterior: commit `41fb70b`.
Nenhuma migração, tabela, RLS ou dado existente foi alterado nesta etapa. Foram
reutilizadas as RPCs de equipe e as permissões do servidor já validadas. Produção
e main permanecem separadas; não foi gerado instalador nem realizada cobrança.

## Página e comportamento

`http://127.0.0.1:48780/consultancy-team` é acessível por Membros e licença e pela
página Minha conta e convites. Não depende de ter acesso a uma fazenda: o titular
pode gerenciar a consultoria e funcionários podem solicitar aparelhos mesmo
quando ainda não possuem nenhuma fazenda delegada. Requer uma conta autenticada
vinculada a empresa de consultoria já cadastrada no piloto. Não cria licença
nem transforma uma licença de fazenda em licença de consultoria automaticamente.

Se houver mais de uma consultoria na conta, o seletor permite busca. O titular
consulta a equipe completa, convida apenas administrador, responsável por aplicação
ou monitor de campo, edita funções e fazendas e pode desligar funcionários.
Funcionários não consultam a equipe completa nem alteram seus próprios acessos.

No convite, todas as fazendas começam desmarcadas. Só são oferecidas fazendas
próprias do titular ou clientes com convite direto válido. A busca aceita partes
do nome e diferenças de acentuação. Na edição de funcionário, função e fazendas
atuais vêm preenchidas. Salvar apenas uma nova função conserva a seleção atual.
Novos clientes não são incluídos automaticamente. Desmarcar todas preserva o
vínculo com a consultoria, mas remove seus acessos derivados às fazendas.

A lista da equipe inclui contagem de aparelhos por pessoa. A cota base continua
proprietário + 3 funcionários e 5 aparelhos compartilhados; cada adicional
contratado libera uma vaga e dois aparelhos. Só o titular autoriza aparelhos.
Desligamento mantém a cota financeira nesta integração, preserva conta/autoria e
revoga os aparelhos do vínculo. Cancelamento financeiro de adicionais permanece
em etapa própria.

Nos clientes, administrador e responsável por aplicação têm o teto de consultoria,
sem executar operações nem movimentar estoque por esse vínculo. Monitor registra
apenas seus próprios monitoramentos e chuvas. A revogação pelo proprietário da
fazenda bloqueia o titular e todas as delegações que dependem daquele convite.
A consulta atualizada da equipe retira seleções revogadas e reinicia o editor
com os acessos atuais; uma seleção antiga não fica marcada por estado local.
Os contratos do servidor também impedem reativar a delegação antiga quando a
consultoria recebe um novo convite.

## Validação e preservação

`tests/operational-pilot-team.browser.cjs --local-only` usa somente contas e empresas
fictícias. O cenário acrescentou uma fazenda própria fictícia à consultoria e um
funcionário diferente da equipe direta da fazenda cliente, evitando que outro
vínculo mascarasse o resultado. Passaram:

- Convite com apenas a fazenda própria marcada, sem herdar a fazenda cliente.
- Aceitação pela conta correta e solicitação de aparelho sem acesso ao cliente.
- Aprovação pelo titular, consumindo somente a cota da consultoria.
- Troca da fazenda permitida na mesma sessão, sem permissão de estoque/operação.
- Mudança para monitor conservando a fazenda e bloqueando recomendações.
- Monitoramento autorizado e recusa de edição do registro de outro autor.
- Desmarcar tudo conservando conta, vínculo e autoria; nova concessão explícita.
- Revogação da consultoria pelo proprietário bloqueando titular e funcionário.
- Retirada da fazenda revogada das opções e seleções após atualização da equipe.
- Layout em 1366 e 390 px sem rolagem horizontal.

As fixtures foram removidas no final. Os hashes de todas as tabelas operacionais
anteriores permaneceram iguais. Contratos de equipe, aparelhos e emails, TypeScript
e regressão visual da página Membros e licença também passaram. Relatórios e
capturas ficam em `checks.local/licensing-local/operational-team-2026-11-24`,
fora do Git, sem credenciais expostas no código.

## Próxima integração

Esta seleção define permissões. A troca da fazenda aberta foi integrada
posteriormente em [SELECAO-DE-FAZENDA-PILOTO.md](SELECAO-DE-FAZENDA-PILOTO.md),
com reabertura da página e separação de cache, safra e filas offline por usuário
e fazenda. O perfil público e a instituição dos lançamentos não foram alterados.
