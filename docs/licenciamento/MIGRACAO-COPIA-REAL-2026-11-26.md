# Ensaio de licenças sobre a cópia real — 26/11/2026

O ensaio parte do backup real atualizado e restaurado, documentado em `BACKUP-REAL-2026-11-26.md`. Nenhuma conexão remota é aberta pelo novo executor. O piloto usado pelo usuário e a `main` não são substituídos.

## Ambiente e preservação

`node scripts/rehearse-production-licensing-local.mjs --isolated-only`

O executor valida o manifesto e os hashes dos arquivos privados, confirma a comparação COPY e exige que o contêiner de restauração tenha rede `none`, nenhuma porta publicada e o identificador de quarentena esperado. Faz outro dump local da origem restaurada e o carrega em uma base nova com nome aleatório. O dump, a origem restaurada e as tentativas anteriores são preservados.

A base nova recebeu as 18 migrações centrais de licenças e os adaptadores locais de contexto, dispositivos, fazendas, planos, cobrança Sandbox, reativação, vínculo de empresa e autorização offline. Os geradores SQL passaram a ser compartilhados com os scripts do piloto para evitar que cada ensaio use uma implementação diferente.

Somente a fazenda cuja titularidade foi confirmada pelo usuário recebe um vínculo de ensaio: proprietário confirmado e três administradores existentes. A licença criada nesse clone é uma cortesia marcada como teste; não é uma concessão comercial ou uma migração de pagamento. Não se importam contas, dispositivos, licenças ou pagamentos do piloto anterior. As outras fazendas não recebem proprietários inferidos.

## Resultados

- As 69 tabelas da origem mantiveram contagens e hashes dos registros após a migração. Isso inclui autenticação, perfis, instituições, estoque e lançamentos agrícolas.
- O esquema resultante possui 95 tabelas: as 69 originais e 26 tabelas de suporte à nova estrutura.
- Os controles operacionais foram adicionados a 25 tabelas; as funções aplicáveis receberam verificações de módulo e licença.
- Uma falha deliberada antes do COMMIT da instalação central reverteu as 18 migrações, preservando os dados e os metadados anteriores. Isso testa atomicidade, sem equivaler a desfazer uma publicação comercial já confirmada.
- Reaplicar os adaptadores finais de vínculo de empresa e offline preservou registros e metadados.
- A origem restaurada continuou idêntica ao backup. O arquivo de contexto do piloto de uso permaneceu intacto.

As suítes SQL usam transações com ROLLBACK e a base é inventariada novamente para confirmar que os cenários fictícios não ficaram gravados. A suíte de contrato central roda antes dos adaptadores locais: estes exigem sessão e, para gestão administrativa, MFA verificado, requisitos ausentes em fixtures antigos do contrato central. A suíte operacional roda com todos os adaptadores instalados.

Também passaram 12 testes unitários de geração de checagens SQL, compatibilidade e proteção do backup, comparação de SQL e critérios de publicação. Os cinco scripts envolvidos passaram na verificação de sintaxe.

As verificações cobrem preços no servidor, contratação pendente até confirmação de pagamento, replay de pagamento sem prolongar cobertura, cotas de dispositivos, aprovação pelo proprietário, papéis, estoque, operações e cancelamentos, recomendações sem baixa antecipada, baixa apenas na execução e impedimento de execução duplicada. Também cobrem edição/exclusão de monitoramento e chuva, licença cancelada em leitura, funcionário desligado, convite e delegação de consultoria, impedimento de herança implícita de fazenda e de restauração de delegação revogada.

## Correções encontradas durante o ensaio

1. O RPC de edição com execução como usuário chamava o mapeamento de módulos no schema privado. Isso gerava `permission denied for function table_module`. Foi acrescentado um wrapper puro em `licensing.operational_module(text)`, com execução apenas para usuários autenticados. A função privada e o restante do schema privado continuam fechados. O refinamento corrige também definições antigas que já tinham o marcador de proteção de recibos.
2. A inclusão de checagens cobria funções PL/pgSQL, deixando funções SQL como a consulta de resumo do mapa sem a verificação explícita do módulo. Agora consultas SQL de retorno em tabela, escalares SELECT/CTE e a atualização void de geometria são envolvidas pela checagem antes de executar a instrução original. Formatos desconhecidos interrompem a geração para revisão. O monitor de campo continua podendo selecionar áreas para lançar dados, mas o RPC do mapa nega acesso ao módulo de mapas.
3. A primeira montagem do ensaio não incluía a otimização do mapa já utilizada no piloto. Com as políticas novas, o resumo atingiu o limite de 45 segundos. O executor passou a compartilhar e aplicar também essa otimização: checa permissão, fazenda matriculada e safra da mesma fazenda, e filtra áreas, operações e produtos uma vez antes das agregações. O contrato central passou em 144 ms e a suíte operacional completa em 1.453 ms na medição após o ajuste. Esses tempos são evidência deste ambiente local, não uma garantia para toda base de produção.

Essas correções foram aplicadas ao código da branch de testes e às bases novas de ensaio. O executor não atualiza silenciosamente o piloto aberto ou o banco real.

## Evidências privadas

`checks.local/licensing-local/latest-production-migration-rehearsal.local.json` aponta para o último ensaio concluído. A pasta indicada contém `result.json`, dump anterior à migração, SQL gerado, logs dos testes e inventário final. Os relatórios e dumps ficam no diretório protegido do backup, ignorado pelo Git. Não enviar esses arquivos ao repositório ou em mensagens.

O contêiner é desligado ao final. Não há um endereço web novo para essa base, pois a validação desta etapa acontece diretamente no PostgreSQL isolado. O piloto e seus endereços de teste continuam sendo os anteriores.

## Antes da publicação

O resultado aprova o ensaio no banco local derivado da produção. Ainda é necessário preparar e validar o backend comercial e a emissão offline no ambiente de destino, configuração Asaas e webhooks de produção, atualização dos clientes com preservação das filas e retorno operacional após publicação confirmada. Os limites locais e de Sandbox continuam ativos. Não publicar os adaptadores locais diretamente como migração comercial.

A autorização do usuário para integrar à `main` quando houver segurança permanece válida. Esta etapa, isoladamente, não libera a integração nem altera assinaturas ou acessos reais.
