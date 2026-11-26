# Backup real e restauração isolada — 26/11/2026

O banco real foi exportado e restaurado em um contêiner novo, sem rede e sem portas publicadas. A restauração passou na comparação das 69 tabelas capturadas e dos metadados de segurança. Nenhum lançamento da produção foi alterado. O piloto existente foi preservado e a `main` continua em `4520924`.

## Evidências verificadas

- 69 tabelas e 5.550 linhas no inventário, incluindo autenticação e tabelas administrativas. Esse total não representa apenas lançamentos agrícolas.
- Contagens e hashes de todas as tabelas restauradas coincidem com o inventário capturado na origem.
- Comparação adicional dos 62 blocos COPY originais: 5.125 linhas conferidas, sem divergências, incluindo valores geográficos e dados de autenticação. As outras sete tabelas foram complementadas e verificadas pelo inventário.
- Funções, RLS, privilégios, esquemas, privilégios padrão, triggers, índices, constraints e definições de sequências coincidem com a origem capturada. Foram preservadas as 70 políticas públicas de RLS.
- Chaves estrangeiras originalmente validadas foram novamente validadas na cópia. Constraints originalmente `NOT VALID` conservaram esse estado.
- Sequências restauradas não ficaram abaixo dos valores capturados.
- Storage: zero buckets e zero objetos nas verificações antes/depois. Não havia arquivos para baixar nesta captura.
- O contêiner de restauração foi desligado e preservado após as verificações.

## Localização e proteção

O índice privado `checks.local/latest-production-backup.local.json` aponta para a captura validada dentro de `checks.local/production-backup-2026-11-26/`. O arquivo `manifest.json` registra tamanhos, SHA-256 e a restauração correspondente. O relatório final fica na pasta de restauração indicada pelo manifesto; a comparação adicional está em `copy-value-verification.json`.

O diretório do backup possui acesso NTFS limitado ao usuário local, SYSTEM e Administradores. SQL, credenciais locais e logs ficam ignorados pelo Git. Não compartilhar esses arquivos: o backup contém dados pessoais, hashes de senhas de usuários e registros de sessões. O mecanismo de exportação passa a proteger o diretório antes de escrever arquivos sensíveis.

As exportações nativas `schema-all.sql`, `data.sql` e `roles.sql` foram preservadas. Foram acrescentados dados de sete tabelas administrativas omitidas pelo dump padrão, propriedades e associações dos papéis, valores de sequências e os privilégios de esquema/padrão necessários à reprodução da origem. Isso recuperou também permissões do esquema GraphQL e entradas de privilégios padrão omitidas na exportação nativa.

A exportação usou o login temporário padrão da CLI Supabase. A senha principal do PostgreSQL não foi redefinida e senhas de papéis gerenciados do banco não foram exportadas. Os hashes de senha dos usuários do aplicativo foram preservados nos dados de autenticação.

## Compatibilidade e limites

A origem e a cópia usam PostgreSQL 15. O dump foi emitido pelo pg_dump 17. Apenas o comando de sessão `SET transaction_timeout = 0` foi removido da cópia de trabalho para compatibilidade; o arquivo original permaneceu intacto. A comparação JSON usa as configurações de consulta capturadas na origem para evitar falsos erros por formatação numérica. Uma segunda comparação usa os valores COPY originais, sem arredondar coordenadas ou modificar registros.

Este é um backup lógico do banco e uma conferência do Storage vazio, não uma imagem física/PITR nem um backup integral das configurações do projeto Supabase. Segredos/configurações de Edge Functions, provedores de autenticação, URLs externas e filas offline ainda não enviadas pelos aparelhos exigem tratamento próprio. A documentação oficial também distingue [backup do banco e arquivos do Storage](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

As partes da exportação foram capturadas em momentos distintos. A restauração foi comparada com o inventário da origem; mudanças concorrentes que produzam divergências impedem validar uma tentativa. Não se promete risco zero nem se deve sobrescrever o banco real com esta captura após novos lançamentos.

## Scripts e verificações

Os comandos abaixo são executados por um operador com acesso à CLI, Docker e arquivos privados. Não publicam migrações na origem:

```powershell
node scripts/backup-production-cli.mjs --backup-only
node scripts/complete-production-backup-metadata.mjs --backup-only
node scripts/restore-production-backup-isolated.mjs --isolated-only
node scripts/verify-production-backup-values-local.mjs --isolated-only
```

Uma nova exportação cria outra pasta e atualiza o índice; não substitui os arquivos de capturas anteriores. Os scripts de restauração só operam em contêineres identificados de quarentena, sem rede e sem portas publicadas. Não são procedimentos de recuperação automática da produção.

Passaram nove testes unitários sobre limites de caminhos, interpretação COPY, compatibilidade SQL, recuperação de privilégios, comparação SQL e critérios de publicação. Os scripts também passaram na verificação de sintaxe. Nenhum código funcional do aplicativo foi alterado nesta etapa.

## Próxima etapa

Ensaiar a migração de licenças sobre esta nova cópia do banco real, mantendo os registros e vínculos existentes. Validar permissões, isolamento entre fazendas, vínculo com o serviço de licenças e atualização dos clientes antes de publicar. Este backup aprovado não significa que as licenças já estejam publicadas, que a cobrança real esteja liberada ou que a integração com a `main` já esteja segura.
