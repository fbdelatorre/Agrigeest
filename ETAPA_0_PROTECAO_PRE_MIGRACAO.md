# ETAPA 0 — PROTEÇÃO PRÉ-MIGRAÇÃO AGRIGEST
## ZERO DATA LOSS

**Data/hora:** 2026-10-07
**Tipo:** Read-only (apenas SELECT e inspeção de metadados)
**Regra absoluta:** NENHUM dado existente pode ser perdido
**Status:** NENHUMA modificação foi executada. Nenhuma migration aplicada. Nenhum código alterado.

---

### NOTA DE ESCOPO

> NÃO foram executados: INSERT, UPDATE, DELETE, UPSERT, TRUNCATE, ALTER, DROP, CREATE TABLE, CREATE FUNCTION, CREATE POLICY, GRANT, REVOKE.
> Nenhuma migration foi aplicada. Nenhum arquivo existente do aplicativo foi modificado.
> Nenhum dado do Supabase foi modificado.
> Apenas SELECTs e consultas de metadados foram executados.
> O único arquivo criado foi `supabase/validation/pre_migration_validation.sql` (contendo apenas SELECTs read-only).

---

## 1. BASELINE ANTERIOR vs ATUAL

### 1.1 Contagens

| Tabela | Baseline 07/10/2026 | Contagem Atual | Diferença |
|---|---|---|---|
| areas | 44 | 44 | 0 |
| institutions | 6 | 6 | 0 |
| invitations | 7 | 7 | 0 |
| machinery | 19 | 19 | 0 |
| maintenance_types | 2 | 2 | 0 |
| maintenances | 3 | 3 | 0 |
| notes | 8 | 8 | 0 |
| operation_products | 0 | 0 | 0 |
| operations | 309 | 309 | 0 |
| product_lots | 149 | 149 | 0 |
| products | 217 | 217 | 0 |
| seasons | 5 | 5 | 0 |
| user_profiles | 6 | 6 | 0 |
| **TOTAL** | **775** | **775** | **0** |

**Conclusão:** As contagens são idênticas. Nenhum registro foi adicionado ou removido desde a auditoria forense anterior.

---

## 2. RECALCULO DE CHECKSUMS

### 2.1 Método 1: MD5 de string_agg (mesmo método da auditoria anterior)

| Tabela | Contagem | Checksum Anterior | Checksum Atual | Status |
|---|---|---|---|---|
| areas | 44 | 0a8905ff1e13d425132efd49485c3db8 | 0a8905ff1e13d425132efd49485c3db8 | IGUAL |
| institutions | 6 | b36947374ac1d0e32c00480634e180c2 | b36947374ac1d0e32c00480634e180c2 | IGUAL |
| invitations | 7 | 2285b250655e54b69cf1d7b9bfb5434c | 2285b250655e54b69cf1d7b9bfb5434c | IGUAL |
| machinery | 19 | a96beb1b8546a1daa71e20544d2f2889 | a96beb1b8546a1daa71e20544d2f2889 | IGUAL |
| maintenance_types | 2 | c7c51ceda4c1063353a513516f5af980 | c7c51ceda4c1063353a513516f5af980 | IGUAL |
| maintenances | 3 | b268515bb377c6be0cc9cab3ee63d5d6 | b268515bb377c6be0cc9cab3ee63d5d6 | IGUAL |
| notes | 8 | d0d6249cc5d093a733db4d3de8389da0 | d0d6249cc5d093a733db4d3de8389da0 | IGUAL |
| operations | 309 | b57651da77d21e15c77901a9e878027c | b57651da77d21e15c77901a9e878027c | IGUAL |
| product_lots | 149 | 5328f4a978faf329518a4775b7bdab45 | 5328f4a978faf329518a4775b7bdab45 | IGUAL |
| products | 217 | b697567a32e3dd4bfe5aeeb3569cc2c6 | b697567a32e3dd4bfe5aeeb3569cc2c6 | IGUAL |
| seasons | 5 | d36535d0d7ecf84a0da02ac0b7c84315 | d36535d0d7ecf84a0da02ac0b7c84315 | IGUAL |
| user_profiles | 6 | f9804e8d8d822b01bcc7752244b277d2 | f9804e8d8d822b01bcc7752244b277d2 | IGUAL |

**Conclusão:** Todos os 12 checksums são IGUAIS. Nenhum bit foi alterado desde a auditoria forense anterior.

### 2.2 Método 2: Somatórios numéricos (checksum robusto alternativo)

| Métrica | Valor |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,0830 |
| COUNT(products) | 217 |
| SUM(product_lots.quantity) | 185.382,0000 |
| COUNT(product_lots) | 149 |
| COUNT(operations) | 309 |
| SUM(areas.size) | 12.556,5000 |
| COUNT(areas) | 44 |
| COUNT(seasons) | 5 |
| COUNT(machinery) | 19 |
| COUNT(maintenances) | 3 |
| COUNT(notes) | 8 |
| COUNT(institutions) | 6 |
| COUNT(invitations) | 7 |
| COUNT(user_profiles) | 6 |

### 2.3 Sobre a robustez do checksum MD5(row::text)

A representação textual de uma linha em PostgreSQL pode variar devido a:

1. **Ordenação de colunas:** `string_agg(tabela::text, '' ORDER BY id)` depende da ordem das colunas no tipo composto. Se uma coluna for adicionada (ALTER TABLE ADD COLUMN), a representação textual muda, alterando o checksum mesmo se os dados originais não foram modificados.
2. **Configurações de locale/encoding:** A representação de números de ponto flutuante e timestamps pode variar entre versões do PostgreSQL ou configurações de `DateStyle`.
3. **Tipos USER-DEFINED:** A coluna `geometry` em `areas` é serializada como texto pelo PostGIS. A representação pode variar entre versões do PostGIS.

**Recomendação:** A validação futura deve usar TRIPLA VERIFICAÇÃO:
1. **CONTAGEM** (count por tabela)
2. **CHECKSUM MD5** (string_agg)
3. **SOMATÓRIOS NUMÉRICOS** (sum de colunas numéricas críticas)
4. **INTEGRIDADE REFERENCIAL** (zero órfãos)
5. **TIMESTAMPS** (min/max de created_at e updated_at)

Nenhum único hash é suficiente. A combinação de múltiplos métodos reduz o risco de falsos positivos e falsos negativos.

---

## 3. BASELINE_PRE_MIGRATION_V1

**Data/hora de cálculo:** 2026-10-07 ~13:00 UTC

| Tabela | Contagem | Checksum MD5 | MIN(created_at) | MAX(created_at) | MIN(updated_at) | MAX(updated_at) |
|---|---|---|---|---|---|---|
| areas | 44 | 0a8905ff1e13d425132efd49485c3db8 | 2025-09-17 22:04:24+00 | 2026-09-17 18:30:22+00 | 2025-09-17 22:10:17+00 | 2026-09-17 18:30:22+00 |
| institutions | 6 | b36947374ac1d0e32c00480634e180c2 | 2025-05-22 20:37:42+00 | 2025-10-06 12:31:39+00 | 2025-05-22 20:47:36+00 | 2025-10-06 12:31:39+00 |
| invitations | 7 | 2285b250655e54b69cf1d7b9bfb5434c | 2025-05-23 17:21:17+00 | 2026-09-22 18:20:16+00 | — | — |
| machinery | 19 | a96beb1b8546a1daa71e20544d2f2889 | 2025-10-02 10:44:47+00 | 2025-10-17 11:09:24+00 | 2025-10-02 10:44:47+00 | 2025-10-17 11:09:34+00 |
| maintenance_types | 2 | c7c51ceda4c1063353a513516f5af980 | 2025-10-02 10:45:11+00 | 2025-10-06 23:08:57+00 | — | — |
| maintenances | 3 | b268515bb377c6be0cc9cab3ee63d5d6 | 2025-10-02 10:46:23+00 | 2025-10-30 13:11:26+00 | 2025-10-02 10:46:23+00 | 2025-10-30 13:11:26+00 |
| notes | 8 | d0d6249cc5d093a733db4d3de8389da0 | 2025-10-16 16:11:01+00 | 2026-01-11 10:45:14+00 | 2025-10-29 12:20:25+00 | 2026-09-23 13:26:29+00 |
| operation_products | 0 | NULL | — | — | — | — |
| operations | 309 | b57651da77d21e15c77901a9e878027c | 2025-10-16 17:28:02+00 | 2026-08-26 18:17:34+00 | 2025-10-16 17:28:02+00 | 2026-08-26 18:17:34+00 |
| product_lots | 149 | 5328f4a978faf329518a4775b7bdab45 | 2026-08-06 17:48:15+00 | 2026-10-02 19:00:22+00 | 2026-08-06 17:48:15+00 | 2026-10-02 19:00:22+00 |
| products | 217 | b697567a32e3dd4bfe5aeeb3569cc2c6 | 2025-09-17 18:32:03+00 | 2026-10-02 19:00:22+00 | 2025-09-17 19:26:39+00 | 2026-10-02 19:00:22+00 |
| seasons | 5 | d36535d0d7ecf84a0da02ac0b7c84315 | 2025-10-06 12:27:54+00 | 2026-09-17 18:20:09+00 | 2025-10-06 12:33:34+00 | 2026-10-07 12:18:13+00 |
| user_profiles | 6 | f9804e8d8d822b01bcc7752244b277d2 | 2025-05-23 18:03:14+00 | 2026-07-30 10:07:41+00 | 2025-10-02 11:23:30+00 | 2026-09-22 18:20:13+00 |

**Está baseline NÃO foi gravada no banco.** Está documentada apenas neste relatório.

---

## 4. SITUAÇÃO DOS BACKUPS

`[INDETERMINADO]` — A API do Supabase disponível nesta auditoria não expõe informações sobre backups automáticos, frequência, retenção, ou PITR (Point-in-Time Recovery) via as ferramentas MCP disponíveis.

**O que se sabe sobre Supabase (documentação pública):**
- Projetos Supabase têm backups automáticos diários por padrão (Free tier: 1 backup diário, retenção 7 dias; Pro tier: backups diários + PITR por 7 dias; Team/Enterprise: retenção maior).
- PITR (Point-in-Time Recovery) está disponível em planos Pro ou superiores.
- A restauração pode ser feita via Supabase Dashboard ou CLI.

**O que NÃO se sabe (não acessível sem modificação):**
- Qual o plano atual do projeto `[INDETERMINADO]`
- Se PITR está habilitado `[INDETERMINADO]`
- Quantos backups estão disponíveis `[INDETERMINADO]`
- Se é possível restaurar para outro projeto `[INDETERMINADO]`

**Recomendação:** Antes de iniciar qualquer migration, confirmar manualmente via Supabase Dashboard:
1. Plano do projeto (Free, Pro, Team, Enterprise)
2. Se backups automáticos estão ativos
3. Se PITR está habilitado
4. Frequência e retenção dos backups
5. Realizar um backup manual (snapshot) antes de prosseguir

---

## 5. SITUAÇÃO DO PITR

`[INDETERMINADO]` — Não é possível verificar via API se PITR está habilitado. NÃO foi habilitado. NÃO foi alterado.

**Recomendação:** Verificar via Supabase Dashboard → Project Settings → Database → Point-in-Time Recovery.

---

## 6. SITUAÇÃO DO STORAGE

`[SELECT]` **NÃO existem buckets de Storage no projeto.** A consulta `SELECT id, name, public, created_at FROM storage.buckets` retornou 0 registros.

`[CÓDIGO]` Foi feita busca por `supabase.storage` em todos os arquivos TypeScript do projeto. **Nenhuma correspondência encontrada.** O projeto NÃO utiliza Supabase Storage para upload, download, ou gerenciamento de arquivos.

**Conclusão:** Não existem arquivos armazenados no Supabase Storage que precisem ser protegidos além do dump PostgreSQL. Um dump lógico completo do banco de dados preserva todos os dados do AgriGest.

---

## 7. SITUAÇÃO DO AUTH

`[SELECT]` Contagem de usuários em `auth.users`: **6**

| Tabela | Contagem |
|---|---|
| auth.users | 6 |
| user_profiles | 6 |
| Diferença | **0** |

**Conclusão:** Todos os usuários em `auth.users` têm correspondência em `user_profiles`. Não há usuários órfãos.

**Sobre preservação em backup/restore:**
- `auth.users` é uma tabela interna do Supabase que armazena credenciais, tokens, e metadados de autenticação.
- Um dump lógico via `pg_dump` inclui `auth.users` se o schema `auth` for incluído.
- Em um restore para outro projeto Supabase, `auth.users` precisa ser restaurada COM CUIDADO — a tabela tem relacionamentos com `auth.sessions`, `auth.refresh_tokens`, e outras tabelas internas.
- A senha (hash) dos usuários está em `auth.users.encrypted_password` — NÃO deve ser exposta no relatório.
- Tokens e refresh tokens NÃO são relevantes para backup (expiram e são regenerados).

**Recomendação:** O backup deve incluir explicitamente o schema `auth` além de `public`.

---

## 8. SITUAÇÃO DO POSTGIS

`[SELECT]` Status de geometrias:

| Métrica | Valor |
|---|---|
| Total de áreas | 44 |
| Áreas com geometry (MultiPolygon, 4326) | **1** |
| Áreas sem geometry | **43** |

`[SCHEMA]` Extensão PostGIS instalada:

| Extensão | Versão | Schema |
|---|---|---|
| postgis | 3.3.7 | public |

**O que precisa ser preservado para PostGIS:**
1. A extensão `postgis` (versão 3.3.7) — precisa ser instalada antes do restore
2. A tabela `spatial_ref_sys` (dados de referência espacial, 1 registro para SRID 4326)
3. A coluna `areas.geometry` do tipo `geometry(MultiPolygon, 4326)`
4. O índice GIST `idx_areas_geometry_gist` em `areas.geometry`
5. As funções espaciais usadas: `ST_Multi`, `ST_Force2D`, `ST_SetSRID`, `ST_GeomFromGeoJSON`, `ST_AsGeoJSON`, `ST_GeometryN` (todas usadas na função `save_area_geometry` e `get_area_map_summary`)

**Recomendação:** O backup deve incluir o schema `public` (que contém `postgis` extension e `spatial_ref_sys`). O `pg_dump` com `--schema=public` inclui automaticamente a definição da extensão e os dados de `spatial_ref_sys`.

---

## 9. INVENTÁRIO COMPLETO DE OBJETOS DO BANCO

`[SCHEMA]` Inventário completo de objetos que precisam ser preservados:

### 9.1 Resumo

| Tipo de Objeto | Quantidade |
|---|---|
| Tabelas (public, BASE TABLE) | 14 |
| Colunas (public) | 147 |
| Primary Keys | 14 |
| Foreign Keys | 28 |
| Unique Constraints | 2 |
| Check Constraints | 2 |
| Índices (total) | 23 |
| Triggers | 9 |
| Functions (public) | 762 (inclui funções internas do PostGIS e Supabase) |
| RLS Policies | 49 |
| Sequences (public) | **0** (todas as tabelas usam `gen_random_uuid()`, não sequences) |
| Extensões instaladas | 6 |

### 9.2 Extensões instaladas

| Extensão | Versão | Schema |
|---|---|---|
| plpgsql | 1.0 | pg_catalog |
| postgis | 3.3.7 | public |
| pgcrypto | 1.3 | extensions |
| uuid-ossp | 1.1 | extensions |
| pg_stat_statements | 1.10 | extensions |
| supabase_vault | 0.3.1 | vault |

### 9.3 Check Constraints

| Constraint | Tabela | Definição |
|---|---|---|
| check_completed_date | notes | CHECK (is_completed=true AND completed_date IS NOT NULL) OR (is_completed=false AND completed_date IS NULL) OR (is_completed=false AND completed_date IS NOT NULL) |
| spatial_ref_sys_srid_check | spatial_ref_sys | CHECK (srid > 0 AND srid <= 998999) |

### 9.4 Unique Constraints

| Constraint | Tabela | Definição |
|---|---|---|
| institutions_name_key | institutions | UNIQUE (name) |
| invitations_code_key | invitations | UNIQUE (code) |

### 9.5 Foreign Keys (28 FKs)

Todas as 28 FKs foram documentadas no relatório forense anterior (Bloco D). Resumo ON DELETE:
- CASCADE: 25 FKs
- SET NULL: 3 FKs (institutions.created_by, invitations.created_by, invitations.used_by — todas referenciam auth.users)

**Correção importante:** Na auditoria forense anterior, foi reportado que `institutions.created_by` e `invitations.created_by/used_by` usavam NO ACTION. Após verificação direta via `pg_constraint`, o comportamento real é **ON DELETE SET NULL** (não NO ACTION). Isto significa que deletar um usuário em `auth.users` não causa erro — em vez disso, o `created_by`/`used_by` é definido como NULL.

### 9.6 Migrations aplicadas no banco

**117 migrations** registradas no banco (incluindo as 6 locais em `supabase/migrations/`).

### 9.7 Funções do schema public

Embora `pg_proc` reporte 762 funções em `public`, a maioria são funções internas do PostGIS e do Supabase. As **15 funções de negócio** do AgriGest foram documentadas no relatório forense anterior (Bloco L).

---

## 10. PROCEDIMENTO RECOMENDADO DE DUMP (NÃO EXECUTADO)

> **NÃO executado.** Apenas documentado para uso futuro.

### 10.1 Comandos recomendados

O projeto Supabase tem `SUPABASE_DB_URL` disponível no ambiente. O host é derivado do `VITE_SUPABASE_URL`:
- **Host:** `[DATABASE_HOST]` (formato: `db.qnhykflwwihdpahvktmb.supabase.co`)
- **Porta:** 5432 (ou 6543 para connection pooler)
- **Database:** postgres
- **User:** postgres

**Dump completo (schema + data):**

```bash
pg_dump \
  --host=[DATABASE_HOST] \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --format=custom \
  --file=agrigest_backup_$(date +%Y%m%d_%H%M%S).dump \
  --schema=public \
  --schema=auth \
  --schema=storage \
  --schema=extensions \
  --verbose
```

**Dump separado (roles, schema, data):**

```bash
# 1. Roles (NÃO inclui senhas de auth.users, apenas roles do PostgreSQL)
pg_dumpall \
  --host=[DATABASE_HOST] \
  --port=5432 \
  --username=postgres \
  --roles-only \
  --file=agrigest_roles_$(date +%Y%m%d).sql

# 2. Schema apenas (estrutura, sem dados)
pg_dump \
  --host=[DATABASE_HOST] \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=public \
  --schema=auth \
  --schema=storage \
  --schema=extensions \
  --schema-only \
  --file=agrigest_schema_$(date +%Y%m%d).sql

# 3. Dados apenas (sem estrutura)
pg_dump \
  --host=[DATABASE_HOST] \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --schema=public \
  --schema=auth \
  --data-only \
  --file=agrigest_data_$(date +%Y%m%d).sql
```

**Dump via Supabase Dashboard (alternativa):**
- Supabase Dashboard → Project Settings → Database → Backups → "Download backup"

### 10.2 Validação do dump

```bash
# Verificar que o arquivo não está vazio
ls -la agrigest_backup_*.dump

# Verificar conteúdo (listar objetos no dump)
pg_restore --list agrigest_backup_*.dump | head -50

# Verificar tamanho mínimo esperado (deve ser > 1MB para 775 registros + auth)
stat --format="%s bytes" agrigest_backup_*.dump

# Testar restore em banco temporário local (NÃO em produção)
createdb test_agrigest_restore
pg_restore --dbname=test_agrigest_restore --no-owner --no-privileges agrigest_backup_*.dump

# Validar contagens no banco de teste
psql test_agrigest_restore -c "SELECT count(*) FROM public.areas;"
psql test_agrigest_restore -c "SELECT count(*) FROM public.operations;"

# Limpar
dropdb test_agrigest_restore
```

### 10.3 Considerações

- **NÃO usar senha real no relatório.** Usar `[DATABASE_PASSWORD]` como placeholder.
- O `[PROJECT_REF]` é `qnhykflwwihdpahvktmb` (derivado do `VITE_SUPABASE_URL`).
- Para Supabase, a senha do banco é diferente da API key. Deve ser obtida via Supabase Dashboard → Project Settings → Database → Connection string.
- O `pg_dump` via connection pooler (porta 6543) pode ter limitações com `--format=custom`. Preferir conexão direta (porta 5432).

---

## 11. PROCEDIMENTO RECOMENDADO DE RESTORE (NÃO EXECUTADO)

> **NÃO executado.** Apenas documentado para uso futuro.
> **NUNCA testar restore sobre o banco de produção.**

### 11.1 Fluxo recomendado

```
PRODUÇÃO (qnhykflwwihdpahvktmb)
    ↓ pg_dump (backup completo)
PROJETO SUPABASE DE TESTE (novo projeto)
    ↓ pg_restore
VALIDAÇÃO (executar pre_migration_validation.sql)
    ↓ comparar com BASELINE_PRE_MIGRATION_V1
SE IGUAL → PROSSEGUIR COM MIGRAÇÕES (no projeto de teste)
SE DIFERENTE → INVESTIGAR ANTES DE CONTINUAR
```

### 11.2 Comandos de restore

```bash
# Criar novo projeto Supabase de teste via Dashboard
# Obter connection string do novo projeto

# Restore do backup no projeto de teste
pg_restore \
  --host=[TEST_DATABASE_HOST] \
  --port=5432 \
  --username=postgres \
  --dbname=postgres \
  --no-owner \
  --no-privileges \
  --verbose \
  agrigest_backup_YYYYMMDD_HHMMSS.dump
```

### 11.3 Ordem de restore

1. **Extensões** (devem ser instaladas primeiro):
   - `postgis` (necessária antes de criar tabelas com geometry)
   - `pgcrypto` (necessária para `gen_random_uuid()`)
   - `uuid-ossp`
   - `pg_stat_statements`
   - `supabase_vault`

2. **Schema** (estrutura: tabelas, constraints, índices, triggers, functions, policies)

3. **Dados** (registros das tabelas)

4. **Auth** (tabelas em `auth` schema — `auth.users`, etc.)

5. **Storage** (não aplicável — projeto não usa Storage)

### 11.4 O que precisa ser tratado separadamente

| Item | Tratamento |
|---|---|
| Storage | N/A — projeto não usa Storage |
| Auth.users | Restaurar via `pg_restore` com schema `auth` incluído |
| PostGIS | Extensão deve ser instalada ANTES do restore dos dados |
| RLS Policies | Incluídas no dump de schema |
| Functions SECURITY DEFINER | Incluídas no dump de schema; verificar search_path após restore |
| Triggers | Incluídos no dump de schema |

### 11.5 Validação pós-restore

Após o restore, executar `supabase/validation/pre_migration_validation.sql` no banco de teste e comparar todos os resultados com a BASELINE_PRE_MIGRATION_V1. Se qualquer valor diferir, investigar antes de prosseguir.

---

## 12. CONTEÚDO DO ARQUIVO DE VALIDAÇÃO

O arquivo `supabase/validation/pre_migration_validation.sql` foi criado com **16 blocos de consultas READ-ONLY**:

| Bloco | Descrição |
|---|---|
| A | Contagem de todas as tabelas de negócio |
| B | Checksums MD5 (Método 1: string_agg) |
| B2 | Checksums robustos (Método 2: somatórios numéricos) |
| C | Órfãos (14 verificações de integridade referencial) |
| D | NULLs críticos (15 campos verificados) |
| E | Quantidade de operations |
| F | Total de itens em operations.products_used |
| G | productIds inválidos em products_used |
| H | Quantidade de produtos |
| I | Quantidade de product_lots |
| J | Produtos com stock mas sem lotes |
| K | Divergência stock vs lotes |
| L | Áreas com e sem geometry |
| M | RLS habilitado/desabilitado |
| N | Número de policies |
| O | Número de functions |
| P | Número de triggers |
| Q | Foreign keys e ON DELETE |
| R | Extensões instaladas |
| Extra 1 | Auth users count |
| Extra 2 | Storage buckets |
| Extra 3 | Snapshots de timestamps (min/max) |
| Extra 4 | Produtos com stock negativo |
| Extra 5 | Somatório de áreas por unidade |

**Total: 25 blocos de consultas, todas READ-ONLY.**

---

## 13. SOBRE A ROBUSTEZ DO CHECKSUM

### 13.1 Limitações do MD5(row::text)

1. **Sensível a ordem de colunas:** Se uma migration adicionar uma coluna via `ALTER TABLE ADD COLUMN`, a representação `row::text` muda, alterando o checksum mesmo se os dados originais não foram modificados. **Isto é esperado e não indica perda de dados.**

2. **Sensível a versão do PostgreSQL:** A representação textual de tipos como `numeric`, `timestamptz`, e `geometry` pode variar entre versões do PostgreSQL e PostGIS.

3. **Sensível a DateStyle:** A configuração `DateStyle` afeta como timestamps são serializados.

4. **Não detecta reordenação de linhas:** Como usamos `ORDER BY id`, a ordem é determinística. Mas se IDs forem reutilizados (improvável com UUID), o checksum não mudaria.

### 13.2 Estratégia de validação multi-camada

Para máxima segurança, a validação futura deve combinar:

| Camada | Método | O que detecta |
|---|---|---|
| 1 | CONTAGEM (count) | Registro adicionado ou removido |
| 2 | CHECKSUM MD5 (string_agg) | Qualquer modificação no conteúdo |
| 3 | SOMATÓRIOS NUMÉRICOS (sum) | Modificação em valores numéricos |
| 4 | INTEGRIDADE REFERENCIAL (órfãos) | Quebra de FKs |
| 5 | TIMESTAMPS (min/max updated_at) | Modificação não autorizada |
| 6 | NULLs críticos | Corrupção de campos obrigatórios |

**Nenhum único método é suficiente. A combinação de todos reduz drasticamente o risco de falsos positivos e falsos negativos.**

---

## 14. SNAPSHOT FINANCEIRO/OPERACIONAL

`[SELECT]` Baseline financeira e operacional:

| Métrica | Valor |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,0830 |
| COUNT(products WHERE quantity_in_stock > 0) | 217 |
| COUNT(products WHERE quantity_in_stock < 0) | **0** |
| SUM(product_lots.quantity) | 185.382,0000 |
| COUNT(product_lots) | 149 |
| COUNT(operations) | 309 |
| COUNT(operations WHERE products_used tem itens) | 309 |
| Total de itens em products_used | 1.459 |
| COUNT(areas) | 44 |
| SUM(areas.size) — hectare | 12.556,5000 |
| SUM(areas.size) — acre | NULL (nenhuma área em acre) |
| SUM(areas.size) — squareMeter | NULL (nenhuma área em squareMeter) |
| COUNT(productIds inválidos em products_used) | 501 |
| COUNT(null lotIds em products_used) | 1.453 |
| COUNT(produtos com stock mas sem lotes) | 122 |

**Todas as áreas usam a unidade hectare.** Não há áreas em acre ou metro quadrado.

---

## 15. DADOS HISTÓRICOS PROTEGIDOS (PROTECTED LEGACY DATA)

Os seguintes dados são declarados explicitamente como **PROTECTED LEGACY DATA**:

| Dado | Tabela/Campo | Status |
|---|---|---|
| Produtos utilizados em operações | operations.products_used (JSONB) | PROTECTED |
| Estoque de produtos | products.quantity_in_stock | PROTECTED |
| Produtos (cadastro) | products (tabela completa) | PROTECTED |
| Lotes de produtos | product_lots (tabela completa) | PROTECTED |
| Operações | operations (tabela completa) | PROTECTED |
| Áreas de cultivo | areas (tabela completa) | PROTECTED |
| Geometrias das áreas | areas.geometry | PROTECTED |
| Safras | seasons (tabela completa) | PROTECTED |
| Máquinas | machinery (tabela completa) | PROTECTED |
| Tipos de manutenção | maintenance_types (tabela completa) | PROTECTED |
| Manutenções | maintenances (tabela completa) | PROTECTED |
| Notas | notes (tabela completa) | PROTECTED |
| Instituições | institutions (tabela completa) | PROTECTED |
| Perfis de usuário | user_profiles (tabela completa) | PROTECTED |
| Convites | invitations (tabela completa) | PROTECTED |

**Nenhuma migration futura poderá apagar ou sobrescrever destrutivamente estes dados sem autorização explícita.**

---

## 16. PROBLEMAS CONHECIDOS — NÃO CORRIGIDOS

Os seguintes problemas são conhecidos e **NÃO foram corrigidos** nesta etapa. Eles fazem parte do estado atual que precisa ser preservado:

| # | Problema | Quantidade | Status |
|---|---|---|---|
| 1 | Produtos com divergência de estoque | 125 | NÃO CORRIGIDO |
| 2 | Produtos com estoque e sem lotes | 122 | NÃO CORRIGIDO |
| 3 | Referências productId históricas inválidas em products_used | 501 | NÃO CORRIGIDO |
| 4 | Itens históricos sem lotId em products_used | 1.453 | NÃO CORRIGIDO |
| 5 | CASCADEs perigosos (season→operations, area→operations, product→lots) | 3 | NÃO CORRIGIDO |
| 6 | Sync offline stub em MachineryContext | 3 funções | NÃO CORRIGIDO |
| 7 | Sync offline não envia deletes (AppContext) | 4 entidades | NÃO CORRIGIDO |
| 8 | Grants excessivos (ALL para anon em todas as tabelas) | 14 tabelas | NÃO CORRIGIDO |
| 9 | RLS desabilitado em operation_products | 1 tabela | NÃO CORRIGIDO |
| 10 | Funções SECURITY DEFINER executáveis por anon | 11 funções | NÃO CORRIGIDO |
| 11 | Estoque não transacional (sem RPC/trigger) | — | NÃO CORRIGIDO |
| 12 | list_institution_users sem verificação de auth | 1 função | NÃO CORRIGIDO |
| 13 | database.types.ts desatualizado | — | NÃO CORRIGIDO |
| 14 | Unidades inconsistentes (L, KG, Kg, kg, Bag) | — | NÃO CORRIGIDO |
| 15 | Duplicatas (machinery, product_lots, products) | — | NÃO CORRIGIDO |

**Estes problemas fazem parte do estado atual do sistema. Eles devem ser preservados como estão até que uma etapa futura os trate explicitamente, com autorização, e sem perda de dados.**

---

## 17. RISCOS ENCONTRADOS

### 17.1 Riscos para a migração

| # | Risco | Severidade | Mitigação recomendada |
|---|---|---|---|
| 1 | Não foi possível confirmar se backups automáticos estão ativos | **CRÍTICO** | Verificar via Supabase Dashboard antes de qualquer migration |
| 2 | Não foi possível confirmar se PITR está habilitado | **ALTO** | Verificar via Supabase Dashboard; habilitar se possível |
| 3 | Não foi possível confirmar o plano do projeto (Free/Pro/Team) | **ALTO** | Verificar via Supabase Dashboard → Billing |
| 4 | 122 produtos com estoque mas sem lotes | **CRÍTICO** | Criar lotes retroativos no backfill (não nesta etapa) |
| 5 | 501 referências productId inválidas em products_used | **CRÍTICO** | Criar produto placeholder ou preservar como órfão |
| 6 | CASCADE em delete de season/area/product | **CRÍTICO** | Adicionar soft delete futuramente |
| 7 | FKs com ON DELETE SET NULL (institutions.created_by, invitations) | **MÉDIO** | Estar ciente ao deletar usuários |
| 8 | Apenas 1 área com geometry (43 sem) | **BAIXO** | Não há geometrias para preservar em massa |
| 9 | 762 functions em public (maioria PostGIS/Supabase internas) | **BAIXO** | As 15 funções de negócio foram documentadas |

### 17.2 Risco de não ter backup confirmado

**O RISCO MAIOR É NÃO TER BACKUP CONFIRMADO ANTES DE INICIAR MIGRAÇÕES.**

Antes de prosseguir para a Etapa 1, é **IMPERATIVO**:
1. Confirmar via Supabase Dashboard que backups automáticos estão ativos
2. Realizar um backup manual (download do backup via Dashboard ou pg_dump)
3. Testar o restore em um ambiente separado
4. Executar `pre_migration_validation.sql` no ambiente restaurado
5. Comparar com a BASELINE_PRE_MIGRATION_V1
6. Somente prosseguir se todos os valores coincidirem

---

## 18. RESULTADO FINAL

| Item | Status |
|---|---|
| 1. Baseline anterior vs atual | **IDÊNTICA** — 775 registros, 12 checksums iguais |
| 2. BASELINE_PRE_MIGRATION_V1 | **Documentada** (Seção 3) — não gravada no banco |
| 3. Situação dos backups | **[INDETERMINADO]** — requer verificação manual via Dashboard |
| 4. Situação do PITR | **[INDETERMINADO]** — requer verificação manual via Dashboard |
| 5. Situação do Storage | **NÃO UTILIZADO** — 0 buckets, 0 referências no código |
| 6. Situação do Auth | **OK** — 6 auth.users = 6 user_profiles, 0 diferença |
| 7. Situação do PostGIS | **OK** — extensão 3.3.7 instalada, 1 área com geometry |
| 8. Procedimento de dump | **Documentado** (Seção 10) — não executado |
| 9. Procedimento de restore | **Documentado** (Seção 11) — não executado |
| 10. Arquivo de validação | **CRIADO** — `supabase/validation/pre_migration_validation.sql` |
| 11. Riscos encontrados | **9 riscos identificados** (Seção 17) |

---

## ETAPA 0 — CONCLUSÃO

A baseline atual é **idêntica** à da auditoria forense anterior. Nenhum dado foi modificado. O projeto não utiliza Storage. O Auth tem 6 usuários com correspondência perfeita em user_profiles. O PostGIS está instalado com 1 geometria.

**O próximo passo antes de qualquer migration é confirmar a existência de backups via Supabase Dashboard, realizar um backup manual, e testar o restore em ambiente separado.**

**NÃO foi iniciada a Etapa 1. NÃO foram criadas tabelas V2. NÃO foram alterados estoque, operations, products, FKs, RLS, ou RPCs. Nenhuma correção foi implementada.**

**PAREI. Aguardando revisão externa.**

---

**FIM DO RELATÓRIO — ETAPA 0**
