# Convites de consultoria no piloto operacional

Etapa de 24/11/2026, somente na branch de testes e no banco piloto local.
Código anterior preservado no commit `f16827f`. Nenhuma publicação em main ou
Supabase de produção, cobrança real ou alteração de registros existentes.

## Uso

Em Membros e licença, o proprietário encontra Consultorias da fazenda. Informa o
email do titular e verifica o cadastro. Uma empresa única vem selecionada; se
houver várias, a seleção permite busca. Mudar o email limpa a seleção anterior.
O servidor exige conta verificada, empresa de consultoria e licença ativa, mesmo
se o convite for feito fora da interface. O titular aceita pela conta convidada.
Os emails continuam exclusivamente na caixa local do piloto.

O convite concede acesso somente à fazenda de origem. Não ocupa uma vaga da equipe
nem um aparelho da fazenda: a consultoria utiliza sua própria licença, com cinco
aparelhos base. O titular dessa licença autoriza seus aparelhos; funcionários
continuam dependendo da aprovação do respectivo titular. A página identifica
explicitamente a licença usada. Havendo mais de um vínculo válido, o usuário
pode escolher a licença, sem criar ou autorizar aparelhos automaticamente.

O consultor consulta estoque, aplicações e mapas e pode registrar recomendações,
monitoramentos e chuva quando licença e aparelho permitirem. Este vínculo não
permite executar operações, movimentar estoque ou administrar a equipe da fazenda.
Os funcionários da consultoria não herdam as fazendas automaticamente. O
proprietário da fazenda pode revogar a consultoria: conta, autoria e lançamentos
permanecem, enquanto a origem revogada deixa de conceder acesso.

## Implementação e testes

Foram reutilizadas as RPCs de convite, consulta e revogação já existentes. A única
adição ao banco foi `operational_device_licenses()`, uma consulta protegida que
revalida a fazenda ativa e os vínculos diretos ou delegados. Sem delegação explícita,
o funcionário de consultoria não recebe nem a consulta de licenças daquela fazenda.
Aplicação exclusiva do piloto: `node scripts/apply-pilot-consultant-context.mjs --local-only`.
O SQL contém guarda de nome de banco, transação e permissões apenas para usuários
autenticados; não atualiza dados, tabelas ou autorizações.

O teste real de navegador de equipe passou com conta e empresa fictícias: cadastro
inexistente bloqueado, cadastro válido preenchido, convite e aceitação, licença
própria com cota cinco, aparelho sem consumir a cota da fazenda, monitoramento,
permissões negadas para estoque/operações/equipe, ausência de dados de outra fazenda,
revogação imediata e conta/autoria preservadas. As fixtures foram removidas e os
hashes de todas as tabelas operacionais anteriores permaneceram iguais.

Também passaram os contratos de aparelhos/equipe, TypeScript, layout real em
1366 e 390 px e testes transacionais de operações, estoque e permissões no
PostgreSQL 15, com ROLLBACK. Estes últimos conferem a licença correta do titular
da consultoria, a recusa para funcionário sem delegação e o vínculo delegado.

## Escopo restante

Esta etapa integra o convite direto da fazenda à consultoria. A gestão da equipe
da consultoria com seleção explícita de fazendas e a troca de fazenda no aplicativo
operacional continuam em etapa própria; as regras de servidor já existentes foram
preservadas. Não foram integradas cobranças ao piloto operacional, nem gerado novo
instalador, conforme a preferência atual de testar pelo navegador.
