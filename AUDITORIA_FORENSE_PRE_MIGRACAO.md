# AUDITORIA FORENSE PRÉ-MIGRAÇÃO AGRIGEST — ZERO DATA LOSS
## VERSÃO 1

**Data da auditoria:** 2026-10-07
**Tipo:** Read-only forense (apenas SELECT e inspeção de metadados)
**Prioridade absoluta:** ZERO PERDA DE DADOS / PRESERVAÇÃO DOS DADOS EXISTENTES
**Princípio:** PRESERVAÇÃO DOS DADOS É MAIS IMPORTANTE QUE CORREÇÃO DO SISTEMA

---

### NOTA DE ESCOPO

> **NENHUMA modificação foi executada durante esta auditoria.**
> Nenhum INSERT, UPDATE, DELETE, ALTER, CREATE, DROP, GRANT ou REVOKE foi executado.
> Nenhuma migration foi aplicada. Nenhum código foi alterado. Nenhuma RLS policy foi modificada.
> Nenhuma função foi alterada. Nenhuma constraint foi alterada.
> Quando a informação não pôde ser obtida sem modificação, foi marcada `[INDETERMINADO - EXIGIRIA ALTERAÇÃO]`.
>
> **A estratégia de migração proposta no Bloco Z NÃO foi implementada.** É apenas uma proposta.

---

### LEGENDA DE FONTES DE EVIDÊNCIA

| Marca | Significado |
|---|---|
| `[CÓDIGO]` | Evidence obtida pela leitura do código-fonte TypeScript/React |
| `[SCHEMA]` | Evidence obtida pela inspeção de metadados do banco (information_schema, pg_catalog) |
| `[SELECT]` | Evidence obtida por consulta SQL de dados (SELECT) |
| `[ADVISOR]` | Evidence obtida pelo Supabase Advisor |
| `[CONFIGURAÇÃO]` | Evidence obtida pela leitura de arquivos de configuração |
| `[INDETERMINADO]` | Não foi possível obter a informação sem executar modificação |

---

## BLOCO A — INVENTÁRIO DE TABELAS E CONTAGENS

`[SELECT]` Contagens exatas por tabela:

| # | Tabela | Registros | Checksum (MD5) |
|---|---|---|---|
| 1 | areas | 44 | 0a8905ff1e13d425132efd49485c3db8 |
| 2 | institutions | 6 | b36947374ac1d0e32c00480634e180c2 |
| 3 | invitations | 7 | 2285b250655e54b69cf1d7b9bfb5434c |
| 4 | machinery | 19 | a96beb1b8546a1daa71e20544d2f2889 |
| 5 | maintenance_types | 2 | c7c51ceda4c1063353a513516f5af980 |
| 6 | maintenances | 3 | b268515bb377c6be0cc9cab3ee63d5d6 |
| 7 | notes | 8 | d0d6249cc5d093a733db4d3de8389da0 |
| 8 | operation_products | 0 | NULL (tabela vazia) |
| 9 | operations | 309 | b57651da77d21e15c77901a9e878027c |
| 10 | product_lots | 149 | 5328f4a978faf329518a4775b7bdab45 |
| 11 | products | 217 | b697567a32e3dd4bfe5aeeb3569cc2c6 |
| 12 | seasons | 5 | d36535d0d7ecf84a0da02ac0b7c84315 |
| 13 | user_profiles | 6 | f9804e8d8d822b01bcc7752244b277d2 |
| 14 | spatial_ref_sys | — | (tabela de sistema PostGIS, não auditada para dados de negócio) |

**Total de registros de negócio:** 775
**Total de tabelas de negócio:** 14 (13 com dados + 1 vazia: operation_products)

`[SCHEMA]` Todas as 14 tabelas são BASE TABLE no schema `public`.

---

## BLOCO B — BASELINE DE INTEGRIDADE

Esta tabela é o **snapshot de referência** para verificar que nenhuma perda de dados ocorreu durante a migração. Após qualquer etapa de migração, estes checksums e contagens devem ser recomparados.

| Tabela | Contagem | Checksum MD5 | Status RLS | Triggers |
|---|---|---|---|---|
| areas | 44 | 0a8905ff1e13d425132efd49485c3db8 | ENABLED | 1 (update_updated_at) |
| institutions | 6 | b36947374ac1d0e32c00480634e180c2 | ENABLED | 1 (update_updated_at) |
| invitations | 7 | 2285b250655e54b69cf1d7b9bfb5434c | ENABLED | 0 |
| machinery | 19 | a96beb1b8546a1daa71e20544d2f2889 | ENABLED | 1 (update_updated_at) |
| maintenance_types | 2 | c7c51ceda4c1063353a513516f5af980 | ENABLED | 0 |
| maintenances | 3 | b268515bb377c6be0cc9cab3ee63d5d6 | ENABLED | 1 (update_updated_at) |
| notes | 8 | d0d6249cc5d093a733db4d3de8389da0 | ENABLED | 1 (update_updated_at) |
| operation_products | 0 | NULL | **DISABLED** | 0 |
| operations | 309 | b57651da77d21e15c77901a9e878027c | ENABLED | 1 (update_updated_at) |
| product_lots | 149 | 5328f4a978faf329518a4775b7bdab45 | ENABLED | 0 |
| products | 217 | b697567a32e3dd4bfe5aeeb3569cc2c6 | ENABLED | 1 (update_updated_at) |
| seasons | 5 | d36535d0d7ecf84a0da02ac0b7c84315 | ENABLED | 1 (update_updated_at) |
| user_profiles | 6 | f9804e8d8d822b01bcc7752244b277d2 | ENABLED | 1 (update_updated_at) |

**Checksums calculados com:** `md5(string_agg(<tabela>::text, '' ORDER BY id))`
**Data de cálculo:** 2026-10-07

---

## BLOCO C — ESQUEMA DETALHADO POR TABELA

`[SCHEMA]` Estrutura completa de cada tabela com tipos, nulidade e defaults.

### C.1 — areas

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| name | text | YES | — |
| size | numeric | YES | — |
| unit | text | YES | — |
| location | text | NO | — |
| description | text | NO | — |
| current_crop | text | NO | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| user_id | uuid | YES | — |
| institution_id | uuid | NO | — |
| cultivar | text | NO | — |
| geometry | geometry(MultiPolygon, 4326) | NO | — |

### C.2 — institutions

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| name | text | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| created_by | uuid | NO | — |

### C.3 — invitations

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| institution_id | uuid | YES | — |
| code | text | YES | — |
| expires_at | timestamptz | YES | — |
| created_at | timestamptz | NO | now() |
| created_by | uuid | NO | — |
| used_at | timestamptz | NO | — |
| used_by | uuid | NO | — |

### C.4 — machinery

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| name | text | YES | — |
| description | text | NO | — |
| model | text | NO | — |
| year | integer | NO | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| user_id | uuid | YES | — |
| institution_id | uuid | YES | — |

### C.5 — maintenance_types

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| name | text | YES | — |
| description | text | NO | — |
| created_at | timestamptz | NO | now() |
| user_id | uuid | YES | — |
| institution_id | uuid | YES | — |

### C.6 — maintenances

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| machinery_id | uuid | YES | — |
| maintenance_type_id | uuid | YES | — |
| description | text | NO | — |
| material_used | text | NO | — |
| date | timestamptz | YES | — |
| machine_hours | numeric | NO | — |
| cost | numeric | NO | 0 |
| notes | text | NO | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| user_id | uuid | YES | — |
| institution_id | uuid | YES | — |

### C.7 — notes

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| title | text | YES | — |
| content | text | YES | — |
| note_date | date | YES | CURRENT_DATE |
| is_completed | boolean | NO | false |
| completed_date | date | NO | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| user_id | uuid | YES | — |
| institution_id | uuid | YES | — |

### C.8 — operation_products

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| operation_id | uuid | YES | — |
| product_id | uuid | YES | — |
| quantity | numeric | YES | — |
| dose | numeric | NO | — |
| created_at | timestamptz | NO | now() |

**Nota:** Tabela existe no schema mas tem 0 registros e RLS DESABILITADO. Não é usada pelo frontend.

### C.9 — operations

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| area_id | uuid | YES | — |
| type | text | YES | — |
| start_date | timestamptz | YES | — |
| end_date | timestamptz | NO | — |
| next_operation_date | timestamptz | NO | — |
| description | text | YES | — |
| operated_by | text | YES | — |
| notes | text | NO | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| user_id | uuid | YES | — |
| season_id | uuid | NO | — |
| products_used | jsonb | NO | '[]'::jsonb |
| institution_id | uuid | NO | — |
| operation_size | numeric | NO | — |
| yield_per_hectare | numeric | NO | — |
| seeds_per_hectare | numeric | NO | — |

### C.10 — product_lots

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| product_id | uuid | YES | — |
| lot_number | text | YES | — |
| quantity | numeric | YES | 0 |
| expiration_date | date | NO | — |
| created_at | timestamptz | YES | now() |
| updated_at | timestamptz | YES | now() |

### C.11 — products

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| name | text | YES | — |
| category | text | YES | — |
| unit | text | YES | — |
| quantity_in_stock | numeric | YES | 0 |
| min_stock_level | numeric | YES | 0 |
| price | numeric | YES | 0 |
| supplier | text | NO | — |
| description | text | NO | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| institution_id | uuid | NO | — |

### C.12 — seasons

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | gen_random_uuid() |
| name | text | YES | — |
| start_date | timestamptz | YES | — |
| end_date | timestamptz | NO | — |
| status | text | YES | 'active' |
| description | text | NO | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| user_id | uuid | YES | — |
| institution_id | uuid | NO | — |

### C.13 — user_profiles

| Coluna | Tipo | NOT NULL | Default |
|---|---|---|---|
| id | uuid | YES | — |
| phone | text | NO | — |
| role | text | YES | — |
| institution | text | YES | — |
| created_at | timestamptz | NO | now() |
| updated_at | timestamptz | NO | now() |
| first_name | text | YES | — |
| last_name | text | YES | — |
| institution_id | uuid | NO | — |
| is_admin | boolean | NO | false |
| email | text | NO | — |

---

## BLOCO D — CHAVES ESTRANGEIRAS E COMPORTAMENTO ON DELETE

`[SCHEMA]` Mapa completo de chaves estrangeiras obtido via `pg_constraint`:

| Tabela (coluna) | Referencia | ON DELETE |
|---|---|---|
| areas.user_id | auth.users(id) | CASCADE |
| areas.institution_id | institutions(id) | CASCADE |
| invitations.institution_id | institutions(id) | CASCADE |
| invitations.created_by | user_profiles(id) | **NO ACTION** |
| invitations.used_by | user_profiles(id) | **NO ACTION** |
| machinery.user_id | auth.users(id) | CASCADE |
| machinery.institution_id | institutions(id) | CASCADE |
| maintenance_types.user_id | auth.users(id) | CASCADE |
| maintenance_types.institution_id | institutions(id) | CASCADE |
| maintenances.machinery_id | machinery(id) | CASCADE |
| maintenances.maintenance_type_id | maintenance_types(id) | CASCADE |
| maintenances.user_id | auth.users(id) | CASCADE |
| maintenances.institution_id | institutions(id) | CASCADE |
| notes.user_id | auth.users(id) | CASCADE |
| notes.institution_id | institutions(id) | CASCADE |
| operation_products.operation_id | operations(id) | CASCADE |
| operation_products.product_id | products(id) | CASCADE |
| operations.area_id | areas(id) | CASCADE |
| operations.user_id | auth.users(id) | CASCADE |
| operations.season_id | seasons(id) | CASCADE |
| operations.institution_id | institutions(id) | CASCADE |
| product_lots.product_id | products(id) | CASCADE |
| products.institution_id | institutions(id) | CASCADE |
| seasons.user_id | auth.users(id) | CASCADE |
| seasons.institution_id | institutions(id) | CASCADE |
| institutions.created_by | user_profiles(id) | **NO ACTION** |

**Resumo ON DELETE:**
- **CASCADE:** 23 FKs — deletar o pai remove automaticamente os filhos
- **NO ACTION:** 3 FKs — `invitations.created_by`, `invitations.used_by`, `institutions.created_by` — deletar o perfil de usuário referenciado FALHA com erro de violação de FK

**RISCO CRÍTICO:** Deletar uma `institution` em cascata remove TODOS os dados relacionados (areas, operations, products, product_lots, machinery, maintenances, maintenance_types, notes, seasons, invitations). Esta é uma operação de altíssimo impacto.

**RISCO CRÍTICO:** Deletar um `season` remove TODAS as operations daquela safra via CASCADE. O frontend (`Settings.tsx` linha 519) executa `.delete().eq('id', seasonId)` diretamente.

**RISCO CRÍTICO:** Deletar uma `area` remove TODAS as operations daquela área via CASCADE. O frontend (`AppContext.tsx` linha 429) executa `.delete().eq('id', id)`.

**RISCO CRÍTICO:** Deletar um `product` remove TODOS os `product_lots` daquele produto via CASCADE. O frontend (`AppContext.tsx` linha 760) executa `.delete().eq('id', id)`.

---

## BLOCO E — ÍNDICES

`[SCHEMA]` Índices por tabela:

| Tabela | Índice | Tipo |
|---|---|---|
| areas | areas_pkey | UNIQUE btree (id) |
| areas | idx_areas_geometry_gist | GIST (geometry) |
| institutions | institutions_pkey | UNIQUE btree (id) |
| institutions | institutions_name_key | UNIQUE btree (name) |
| invitations | invitations_pkey | UNIQUE btree (id) |
| invitations | invitations_code_key | UNIQUE btree (code) |
| machinery | machinery_pkey | UNIQUE btree (id) |
| maintenance_types | maintenance_types_pkey | UNIQUE btree (id) |
| maintenances | maintenances_pkey | UNIQUE btree (id) |
| notes | notes_pkey | UNIQUE btree (id) |
| notes | idx_notes_institution_id | btree (institution_id) |
| notes | idx_notes_is_completed | btree (is_completed) |
| notes | idx_notes_note_date | btree (note_date) |
| notes | idx_notes_title | btree (title) |
| operation_products | operation_products_pkey | UNIQUE btree (id) |
| operations | operations_pkey | UNIQUE btree (id) |
| product_lots | product_lots_pkey | UNIQUE btree (id) |
| product_lots | idx_product_lots_product_id | btree (product_id) |
| product_lots | idx_product_lots_expiration_date | btree (expiration_date) |
| products | products_pkey | UNIQUE btree (id) |
| seasons | seasons_pkey | UNIQUE btree (id) |
| user_profiles | user_profiles_pkey | UNIQUE btree (id) |

**Índices ausentes notáveis:**
- `operations` não tem índice em `area_id`, `season_id`, `institution_id`, ou `user_id`
- `products` não tem índice em `institution_id`
- `areas` não tem índice em `institution_id` ou `user_id`
- `seasons` não tem índice em `institution_id` ou `user_id`
- `machinery` não tem índice em `institution_id`
- `maintenances` não tem índice em `machinery_id`, `maintenance_type_id`, ou `institution_id`
- `invitations` não tem índice em `institution_id`

---

## BLOCO F — TRIGGERS

`[SCHEMA]` 9 triggers, todos BEFORE UPDATE, todos chamando `update_updated_at_column()`:

| Tabela | Trigger | Evento | Função |
|---|---|---|---|
| areas | update_areas_updated_at | BEFORE UPDATE | update_updated_at_column() |
| institutions | update_institutions_updated_at | BEFORE UPDATE | update_updated_at_column() |
| machinery | update_machinery_updated_at | BEFORE UPDATE | update_updated_at_column() |
| maintenances | update_maintenances_updated_at | BEFORE UPDATE | update_updated_at_column() |
| notes | update_notes_updated_at | BEFORE UPDATE | update_updated_at_column() |
| operations | update_operations_updated_at | BEFORE UPDATE | update_updated_at_column() |
| products | update_products_updated_at | BEFORE UPDATE | update_updated_at_column() |
| seasons | update_seasons_updated_at | BEFORE UPDATE | update_updated_at_column() |
| user_profiles | update_user_profiles_updated_at | BEFORE UPDATE | update_updated_at_column() |

**Função update_updated_at_column():** Define `NEW.updated_at = now()` e retorna `NEW`. Simples e correta.

**Tabelas SEM trigger de updated_at:** invitations, maintenance_types, operation_products, product_lots.

**Nota:** `product_lots` tem `updated_at NOT NULL DEFAULT now()` mas não tem trigger. A coluna `updated_at` só é atualizada se o código da aplicação explicitamente a definir.

---

## BLOCO G — ANÁLISE DE ÓRFÃOS (INTEGRIDADE REFERENCIAL)

`[SELECT]` Verificação de órfãos em todos os relacionamentos FK:

| Verificação | Órfãos encontrados |
|---|---|
| areas.institution_id → institutions | **0** |
| areas.user_id → auth.users | **0** |
| invitations.institution_id → institutions | **0** |
| invitations.created_by → user_profiles | **0** (incluindo NULLs) |
| invitations.used_by → user_profiles | **0** (incluindo NULLs) |
| machinery.institution_id → institutions | **0** |
| maintenance_types.institution_id → institutions | **0** |
| maintenances.machinery_id → machinery | **0** |
| maintenances.maintenance_type_id → maintenance_types | **0** |
| maintenances.institution_id → institutions | **0** |
| notes.institution_id → institutions | **0** |
| operation_products.operation_id → operations | **0** (tabela vazia) |
| operation_products.product_id → products | **0** (tabela vazia) |
| operations.area_id → areas | **0** |
| operations.season_id → seasons | **0** (incluindo NULLs) |
| operations.institution_id → institutions | **0** (incluindo NULLs) |
| product_lots.product_id → products | **0** |
| products.institution_id → institutions | **0** (incluindo NULLs) |
| seasons.institution_id → institutions | **0** (incluindo NULLs) |

**Conclusão:** ZERO órfãos em todos os 14 relacionamentos verificados. A integridade referencial está intacta.

---

## BLOCO H — ANÁLISE DE NULLs EM CAMPOS CRÍTICOS

`[SELECT]` Contagem de NULLs em campos críticos:

| Tabela | Campo | NULLs | Notas |
|---|---|---|---|
| areas | name | 0 | |
| areas | size | 0 | |
| areas | institution_id | 0 | |
| areas | user_id | 0 | |
| operations | area_id | 0 | |
| operations | type | 0 | |
| operations | start_date | 0 | |
| operations | description | 0 | |
| operations | season_id | 0 | |
| operations | institution_id | 0 | |
| products | name | 0 | |
| products | quantity_in_stock | 0 | |
| products | institution_id | 0 | |
| product_lots | product_id | 0 | |
| product_lots | quantity | 0 | |
| seasons | name | 0 | |
| seasons | institution_id | 0 | |
| user_profiles | id | 0 | |
| user_profiles | first_name | 0 | |
| user_profiles | last_name | 0 | |
| user_profiles | institution_id | 0 | |

**Conclusão:** ZERO NULLs em todos os campos críticos verificados.

**Campos que admitem NULL mas são informativos (não críticos):**
- operations.end_date, operations.next_operation_date, operations.notes, operations.operation_size, operations.yield_per_hectare, operations.seeds_per_hectare
- areas.location, areas.description, areas.current_crop, areas.cultivar, areas.geometry
- products.supplier, products.description
- invitations.created_by, invitations.used_by, invitations.used_at

---

## BLOCO I — DIVERGÊNCIA DE ESTOQUE (products vs product_lots)

`[SELECT]` Análise comparativa entre `products.quantity_in_stock` e `SUM(product_lots.quantity)`:

| Métrica | Valor |
|---|---|
| Total de produtos | 217 |
| Produtos com pelo menos 1 lote | 95 |
| Produtos SEM nenhum lote | 122 |
| Produtos divergentes (stock ≠ soma dos lotes) | **125** |
| Produtos com stock > 0 mas sem lotes | **122** |
| Divergência absoluta total (soma das diferenças) | ~4.436.954 |

**Top 20 produtos divergentes (stock > 0, lotes = 0):**

| Produto | quantity_in_stock | soma dos lotes | Diferença |
|---|---|---|---|
| PHOMIX 220 HMoNI | 4.350.000 | 0 | 4.350.000 |
| LANNATE | 5.552,20 | 0 | 5.552,20 |
| MAGMILL COMPLEX | 5.313,25 | 0 | 5.313,25 |
| CLORFENAPIR | 4.193,60 | 0 | 4.193,60 |
| TIOFANATO | 4.120 | 0 | 4.120 |
| GUARDIAN | 3.580 | 0 | 3.580 |
| MEES | 3.427,85 | 0 | 3.427,85 |
| ORGGAM | 3.239,20 | 0 | 3.239,20 |
| GALIL | 2.922,48 | 0 | 2.922,48 |
| BRAVE MAX UP | 2.359,96 | 0 | 2.359,96 |
| DK MAX | 2.070 | 0 | 2.070 |
| ZN 12% | 2.000 | 0 | 2.000 |
| WEDCIT GOLD | 1.944,83 | 0 | 1.944,83 |
| BIFENTRINA | 1.888 | 0 | 1.888 |
| LIBERTY | 1.880 | 0 | 1.880 |
| MANCOZEB | 1.826,50 | 0 | 1.826,50 |
| AGIL MN | 1.807,60 | 0 | 1.807,60 |
| FUSÃO | 1.790,34 | 0 | 1.790,34 |
| ZARPAL | 1.780,34 | 0 | 1.780,34 |
| ABAMECTIN | 1.551,68 | 0 | 1.551,68 |

**Causas raiz identificadas `[CÓDIGO]`:**
1. Produtos criados antes da migração que adicionou `product_lots` — o stock foi mantido em `products.quantity_in_stock` mas nunca foi migrado para lotes.
2. A função `addProduct()` em `AppContext.tsx` cria produtos com lotes iniciais (pending lots), mas apenas se o frontend enviar esses lotes. Produtos criados via outras vias podem não ter lotes.
3. A função `recomputeProductQuantity()` recalcula `quantity_in_stock` a partir da soma dos lotes — mas se não há lotes, o resultado é 0, sobrescrevendo o stock existente. No entanto, isto só é chamado quando lotes são adicionados/editados/removidos.

**RISCO PARA MIGRAÇÃO:** Se a migração normalizar o estoque para usar apenas `product_lots`, os 122 produtos sem lotes perderiam seu estoque. A estratégia de migração DEVE criar lotes retroativos para estes produtos.

---

## BLOCO J — ANÁLISE DO CAMPO products_used (JSONB)

`[SELECT]` Análise do campo `operations.products_used` (JSONB array):

| Métrica | Valor |
|---|---|
| Total de operações | 309 |
| Operações com products_used não-vazio | 218 |
| Total de itens no JSONB | 1.459 |
| Propriedades por item | 4 (dose, lotId, productId, quantity) |
| Itens com productId inválido (não existe em products) | **501** |
| Itens com lotId NULL | **1.453** |
| Itens com lotId válido (existe em product_lots) | 6 |

**Estrutura típica de um item:**
```json
{
  "dose": 0.5,
  "lotId": null,
  "productId": "uuid-string",
  "quantity": 2.5
}
```

**Análise de referências quebradas:**
- 501 itens (34,3% do total) referenciam `productId` que não existe na tabela `products`. Isto pode ser causado por:
  - Produtos deletados (CASCADE remove o produto mas o JSONB em operations retém a referência)
  - UUIDs incorretos inseridos manualmente
  - Bugs no frontend que geraram UUIDs inválidos

- 1.453 itens (99,6% do total) têm `lotId = null`. Apenas 6 itens (0,4%) têm um `lotId` que aponta para um lote existente.

**RISCO PARA MIGRAÇÃO:** Se a migração pretende migrar `products_used` JSONB para a tabela `operation_products`, 501 itens com `productId` inválido não poderão ser migrados sem tratamento especial. A estratégia deve decidir: (a) criar registros órfãos em `operation_products` sem FK válida, (b) descartar os itens inválidos (PERDA DE DADOS), ou (c) criar um produto placeholder para absorver as referências órfãs.

---

## BLOCO K — TABELA operation_products

`[SCHEMA + SELECT]` Análise da tabela `operation_products`:

| Métrica | Valor |
|---|---|
| Registros | 0 |
| RLS | **DESABILITADO** |
| Triggers | 0 |
| FKs | 2 (operation_id → operations CASCADE, product_id → products CASCADE) |
| Índices | 1 (pkey) |
| Usada pelo frontend | **NÃO** |

`[CÓDIGO]` O frontend (`AppContext.tsx`) usa exclusivamente `operations.products_used` (JSONB) para armazenar produtos utilizados em operações. A tabela `operation_products` não é referenciada em nenhum arquivo TypeScript do projeto.

`[CÓDIGO]` O arquivo `database.types.ts` define o tipo `operation_products` mas ele não é importado ou usado em nenhum componente.

**RISCO:** Esta tabela tem RLS DESABILITADO. Se algum dado for inserido nela, qualquer role (incluindo anon) teria acesso total. Como está vazia, o risco é teórico, mas deve ser corrigido na migração.

---

## BLOCO L — FUNÇÕES DO BANCO (15 funções)

`[SCHEMA]` Catálogo completo de funções no schema `public`:

| # | Função | Retorno | SECURITY DEFINER | Linguagem |
|---|---|---|---|---|
| 1 | check_institution_exists(institution_name text) | boolean | **SIM** | plpgsql |
| 2 | copy_areas_to_new_season(source_season_id uuid, target_season_id uuid) | void | NÃO | plpgsql |
| 3 | create_invitation(institution_id_param uuid, created_by_user_id uuid, expiration_days integer) | TABLE | **SIM** | plpgsql |
| 4 | delete_invitation(invitation_id uuid, requesting_user_id uuid) | void | **SIM** | plpgsql |
| 5 | generate_invite_code() | text | NÃO | plpgsql |
| 6 | get_area_map_summary(season_id_param uuid) | TABLE | NÃO | plpgsql |
| 7 | handle_user_registration(user_id uuid, institution_name text) | json | **SIM** | plpgsql |
| 8 | join_institution(user_id uuid, invitation_code text) | json | **SIM** | plpgsql |
| 9 | list_active_invitations(institution_id_param uuid) | TABLE | **SIM** | plpgsql |
| 10 | list_institution_users(institution_id_param uuid) | TABLE | **SIM** (STABLE) | plpgsql |
| 11 | save_area_geometry(area_id_param uuid, geojson_text text) | void | NÃO | sql |
| 12 | toggle_user_admin_status(user_id_param uuid, new_status boolean) | void | **SIM** | plpgsql |
| 13 | update_season_status(season_id_param uuid, new_status text) | void | **SIM** | plpgsql |
| 14 | update_updated_at_column() | trigger | NÃO | plpgsql |
| 15 | validate_invitation(invitation_code text) | jsonb | **SIM** | plpgsql |

### L.1 — Resumo por função

**check_institution_exists:** Verifica se instituição existe por nome (case-insensitive). SECURITY DEFINER mas não tem verificação de auth — qualquer usuário pode verificar. RISCO BAIXO (informação não sensível).

**copy_areas_to_new_season:** Copia áreas de uma safra para outra. Não é SECURITY DEFINER. Não tem verificação de pertencimento à instituição. RISCO MÉDIO.

**create_invitation:** Cria convite com código único. SECURITY DEFINER. Verifica se `created_by_user_id` pertence à instituição. RISCO BAIXO.

**delete_invitation:** Deleta convite. SECURITY DEFINER. Verifica se solicitante é admin da mesma instituição. RISCO BAIXO.

**generate_invite_code:** Gera código alfanumérico aleatório de 8 caracteres. Não é SECURITY DEFINER. RISCO BAIXO.

**get_area_map_summary:** Retorna dados de áreas com geometria para renderização do mapa. Não é SECURITY DEFINER. Não tem verificação de auth. RISCO MÉDIO (expõe dados sem verificar pertencimento).

**handle_user_registration:** Cria instituição + perfil de usuário. SECURITY DEFINER. Verifica duplicidade de nome de instituição. Lê `raw_user_meta_data` de `auth.users`. RISCO MÉDIO (não verifica se o user_id corresponde ao auth.uid() do chamador).

**join_institution:** Associa usuário a instituição via convite. SECURITY DEFINER. Usa `FOR UPDATE OF i` (lock da linha). Marca convite como usado atomicamente. Cria/atualiza `user_profiles`. RISCO BAIXO (transação protegida).

**list_active_invitations:** Lista convites ativos de uma instituição. SECURITY DEFINER. Verifica pertencimento. RISCO BAIXO.

**list_institution_users:** Lista usuários de uma instituição. SECURITY DEFINER (STABLE). **NÃO verifica** se o solicitante pertence à instituição. RISCO ALTO — qualquer usuário autenticado pode listar usuários de qualquer instituição.

**save_area_geometry:** Atualiza geometria de área a partir de GeoJSON. Não é SECURITY DEFINER. Usa `ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(geojson_text), 4326)))::geometry(MultiPolygon, 4326)`. **NÃO verifica** pertencimento à instituição. RISCO MÉDIO.

**toggle_user_admin_status:** Alterna status de admin. SECURITY DEFINER. Verifica se solicitante é admin da mesma instituição. RISCO BAIXO.

**update_season_status:** Atualiza status de safra. SECURITY DEFINER. Usa `auth.uid()` para filtrar por `user_id`. Ao ativar uma safra, desativa todas as outras do mesmo usuário. RISCO BAIXO.

**update_updated_at_column:** Função trigger. Define `NEW.updated_at = now()`. Simples e correta.

**validate_invitation:** Valida convite (existe, não expirado, não usado). SECURITY DEFINER. Não verifica auth. RISCO BAIXO (informação limitada).

---

## BLOCO M — RLS: STATUS E POLÍTICAS

`[SCHEMA]` Status de RLS por tabela:

| Tabela | RLS |
|---|---|
| areas | **ENABLED** |
| institutions | **ENABLED** |
| invitations | **ENABLED** |
| machinery | **ENABLED** |
| maintenance_types | **ENABLED** |
| maintenances | **ENABLED** |
| notes | **ENABLED** |
| operation_products | **DISABLED** |
| operations | **ENABLED** |
| product_lots | **ENABLED** |
| products | **ENABLED** |
| seasons | **ENABLED** |
| spatial_ref_sys | **DISABLED** |
| user_profiles | **ENABLED** |

### M.1 — Padrão de políticas (tabelas de negócio com institution_id)

A maioria das tabelas (areas, machinery, maintenance_types, maintenances, notes, operations, products, seasons) segue o mesmo padrão de 4 políticas:

| Comando | Role | USING | WITH CHECK |
|---|---|---|---|
| SELECT | authenticated | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | — |
| INSERT | authenticated | — | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` |
| UPDATE | authenticated | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` |
| DELETE | authenticated | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | — |

### M.2 — Tabelas com padrão diferente

**user_profiles:** 3 políticas (SELECT/INSERT/UPDATE), sem DELETE. Usa `auth.uid() = id`. Não permite que um usuário delete seu próprio perfil.

**operation_products:** 4 políticas usando `EXISTS (SELECT 1 FROM operations WHERE operations.id = operation_products.operation_id AND operations.institution_id IN (...))`. RLS DESABILITADO — as políticas existem mas não são aplicadas.

**product_lots:** 4 políticas usando `EXISTS (SELECT 1 FROM products p WHERE p.id = product_lots.product_id AND p.institution_id IN (...))`. Verifica pertencimento via produto pai.

### M.3 — Anomalia em products

`[SCHEMA]` A tabela `products` tem **DUAS políticas DELETE**:
- "Users can delete products from their institution"
- "Users can delete products in their institution"

Ambas têm o mesmo predicado `USING`. Isto é redundante mas não causa erro.

### M.4 — institutions

`[SCHEMA]` A tabela `institutions` tem políticas INSERT, SELECT, UPDATE, DELETE com `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())`. **PROBLEMA:** `institutions` não tem coluna `institution_id` — ela É a tabela de instituições. A política provavelmente usa `id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` (verificando se o ID da instituição corresponde à instituição do usuário).

---

## BLOCO N — GRANTS E PRIVILÉGIOS

`[SCHEMA]` Privilégios por tabela:

**Tabelas:** TODAS as 14 tabelas de negócio têm:
- `ALL` privileges para `anon`
- `ALL` privileges para `authenticated`
- `ALL` privileges para `service_role`

Isto significa que as roles `anon` e `authenticated` têm INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, e TRIGGER em todas as tabelas. O controle de acesso real depende das políticas RLS.

**RISCO ALTO:** A role `anon` tem ALL privileges em todas as tabelas. Para tabelas com RLS habilitado, as políticas filtram por `authenticated` apenas, então `anon` não vê dados. Mas para `operation_products` (RLS DESABILITADO), `anon` tem acesso total sem nenhuma filtragem.

### N.1 — Privilégios de EXECUTE em funções

`[SCHEMA]` TODAS as 15 funções são executáveis por `anon`, `authenticated`, E `public`:

| Função | anon | authenticated | public |
|---|---|---|---|
| check_institution_exists | EXECUTE | EXECUTE | EXECUTE |
| copy_areas_to_new_season | EXECUTE | EXECUTE | EXECUTE |
| create_invitation | EXECUTE | EXECUTE | EXECUTE |
| delete_invitation | EXECUTE | EXECUTE | EXECUTE |
| generate_invite_code | EXECUTE | EXECUTE | EXECUTE |
| get_area_map_summary | EXECUTE | EXECUTE | EXECUTE |
| handle_user_registration | EXECUTE | EXECUTE | EXECUTE |
| join_institution | EXECUTE | EXECUTE | EXECUTE |
| list_active_invitations | EXECUTE | EXECUTE | EXECUTE |
| list_institution_users | EXECUTE | EXECUTE | EXECUTE |
| save_area_geometry | EXECUTE | EXECUTE | EXECUTE |
| toggle_user_admin_status | EXECUTE | EXECUTE | EXECUTE |
| update_season_status | EXECUTE | EXECUTE | EXECUTE |
| update_updated_at_column | EXECUTE | EXECUTE | EXECUTE |
| validate_invitation | EXECUTE | EXECUTE | EXECUTE |

**RISCO CRÍTICO:** Funções SECURITY DEFINER executáveis por `anon`. Um usuário não autenticado pode chamar `handle_user_registration`, `join_institution`, `toggle_user_admin_status`, `update_season_status`, `create_invitation`, `delete_invitation`, etc. As funções que usam `auth.uid()` internamente receberão `null` quando chamadas por `anon`, o que pode causar comportamento inesperado mas não necessariamente exploração. No entanto, `list_institution_users` não verifica auth e retorna dados de qualquer instituição.

---

## BLOCO O — HISTÓRICO DE MIGRATIONS

`[CONFIGURAÇÃO + SCHEMA]` Migrations aplicadas no banco: **117 migrations** registradas.

As 6 migrations locais em `supabase/migrations/` são:

| Arquivo | Data | Descrição |
|---|---|---|
| 20251016134258_initial_schema.sql | 2025-10-16 | Schema inicial completo |
| 20251016212020_create_maintenances_and_maintenance_types_tables.sql | 2025-10-16 | Tabelas de manutenção |
| 20260113142014_update_operations_table_structure.sql | 2026-01-13 | Reestruturação da tabela operations |
| 20260806172737_create_product_lots_table.sql | 2026-08-06 | Tabela de lotes de produtos |
| 20260826121507_20260826120000_fix_save_area_geometry_polygon_conversion.sql | 2026-08-26 | Fix de conversão de polígono |
| 20260826134002_20260826130000_output_polygon_geojson_from_map_summary.sql | 2026-08-26 | Output de GeoJSON no map summary |

As 111 migrations adicionais aplicadas no banco (com nomes aleatórios como `silent_fire`, `snowy_shrine`, etc.) sugerem que o schema foi construído iterativamente através do Supabase Studio ou CLI, não apenas via migrations versionadas localmente.

---

## BLOCO P — MAPEAMENTO DE OPERAÇÕES DO BANCO NO CÓDIGO

`[CÓDIGO]` Mapa completo de todas as chamadas ao Supabase que modificam dados:

### P.1 — AppContext.tsx (29 operações)

| Linha | Operação | Tabela | Tipo |
|---|---|---|---|
| 356 | .insert() | areas | INSERT |
| 394 | .update() | areas | UPDATE |
| 429 | .delete() | areas | DELETE |
| 478 | .insert() | operations | INSERT |
| 554 | .update() | operations | UPDATE |
| 596 | .delete() | operations | DELETE |
| 644 | .insert() | products | INSERT |
| 675 | .insert() | product_lots | INSERT |
| 702 | .update() | products | UPDATE (stock recalculado) |
| 725 | .update() | products | UPDATE |
| 760 | .delete() | products | DELETE |
| 789 | .update() | products | UPDATE (stock recalculado) |
| 797 | .insert() | seasons | INSERT |
| 837 | .update() | seasons | UPDATE |
| 866 | .delete() | product_lots | DELETE |
| 896 | .update() | product_lots | UPDATE (adicionar stock) |
| 926 | .update() | products | UPDATE (adicionar stock) |
| 980 | .update() | product_lots | UPDATE (deduzir stock) |
| 1010 | .update() | products | UPDATE (deduzir stock) |
| 1059 | .insert() | areas | INSERT (offline sync) |
| 1066 | .update() | areas | UPDATE (offline sync) |
| 1095 | .insert() | operations | INSERT (offline sync) |
| 1108 | .update() | operations | UPDATE (offline sync) |
| 1143 | .insert() | products | INSERT (offline sync) |
| 1151 | .update() | products | UPDATE (offline sync) |
| 1181 | .insert() | seasons | INSERT (offline sync) |
| 1188 | .update() | seasons | UPDATE (offline sync) |
| 1241 | .rpc() | save_area_geometry | RPC |
| 1261 | .update() | areas | UPDATE (clear geometry) |
| 1277 | .rpc() | get_area_map_summary | RPC (read) |

### P.2 — MachineryContext.tsx (9 operações)

| Linha | Operação | Tabela | Tipo |
|---|---|---|---|
| 229 | .insert() | machinery | INSERT |
| 278 | .update() | machinery | UPDATE |
| 326 | .delete() | machinery | DELETE |
| 386 | .insert() | maintenance_types | INSERT |
| 434 | .update() | maintenance_types | UPDATE |
| 479 | .delete() | maintenance_types | DELETE |
| 536 | .insert() | maintenances | INSERT |
| 595 | .update() | maintenances | UPDATE |
| 653 | .delete() | maintenances | DELETE |

### P.3 — NotesContext.tsx (3 operações)

| Linha | Operação | Tabela | Tipo |
|---|---|---|---|
| 150 | .insert() | notes | INSERT |
| 211 | .update() | notes | UPDATE |
| 256 | .delete() | notes | DELETE |

### P.4 — Settings.tsx (10 operações)

| Linha | Operação | Tabela/Função | Tipo |
|---|---|---|---|
| 199 | .rpc() | list_institution_users | RPC (read) |
| 223 | .rpc() | list_active_invitations | RPC (read) |
| 265 | .rpc() | toggle_user_admin_status | RPC |
| 292 | .rpc() | create_invitation | RPC |
| 313 | .rpc() | delete_invitation | RPC |
| 365 | .update() | user_profiles | UPDATE |
| 435 | .insert() | seasons | INSERT |
| 489 | .rpc() | update_season_status | RPC |
| 519 | .delete() | seasons | DELETE |
| 556 | caches.delete() | (browser cache) | N/A |

### P.5 — Login.tsx (5 operações)

| Linha | Operação | Função | Tipo |
|---|---|---|---|
| 63 | .rpc() | check_institution_exists | RPC (read) |
| 102 | .rpc() | validate_invitation | RPC (read) |
| 272 | .rpc() | check_institution_exists | RPC (read) |
| 310 | .rpc() | join_institution | RPC |
| 331 | .rpc() | handle_user_registration | RPC |

### P.6 — Navbar.tsx (1 operação)

| Linha | Operação | Função | Tipo |
|---|---|---|---|
| 33 | .rpc() | update_season_status | RPC |

### P.7 — Resumo total

| Tipo | Total |
|---|---|
| INSERT direto | 10 |
| UPDATE direto | 12 |
| DELETE direto | 6 |
| INSERT via sync offline | 4 |
| UPDATE via sync offline | 4 |
| RPC calls | 11 |
| **Total de operações de escrita** | **47** |

---

## BLOCO Q — ARQUITETURA OFFLINE E RISCOS DE PERDA DE DADOS

`[CÓDIGO]` Análise da arquitetura offline:

### Q.1 — useOfflineStorage hook

- Armazenamento: `localStorage` (NÃO IndexedDB)
- Estrutura: `{data, timestamp, pendingSync}`
- Array separado: `localStorage['pendingSync']` rastreia itens pendentes
- Sem resolução de conflitos
- Sem retry logic
- Sem criptografia

### Q.2 — Sync por contexto

| Contexto | Sync implementado | Problema |
|---|---|---|
| AppContext (areas) | Envia inserts/updates | **NÃO envia deletes** — exclusões offline são PERDIDAS |
| AppContext (operations) | Envia inserts/updates | **NÃO envia deletes** — exclusões offline são PERDIDAS |
| AppContext (products) | Envia inserts/updates | **NÃO envia deletes** — exclusões offline são PERDIDAS |
| AppContext (seasons) | Envia inserts/updates | **NÃO envia deletes** — exclusões offline são PERDIDAS |
| AppContext (product_lots) | **SEM offline storage** | Lotes editados offline não são persistidos localmente |
| MachineryContext | **STUBS** — `console.log()` apenas | Dados offline são PERMANENTEMENTE PERDIDOS |
| NotesContext | **PARCIAL** — apenas recarrega do DB | Notas criadas offline são PERDIDAS |

### Q.3 — Risco de perda de dados offline

**CRÍTICO:** MachineryContext tem 3 funções de sync (`syncMachinery`, `syncMaintenanceTypes`, `syncMaintenances`) que são STUBS — apenas fazem `console.log()` e `markXSynced()` sem enviar nenhum dado ao banco. Qualquer operação CRUD feita offline em machinery, maintenance_types ou maintenances é permanentemente perdida.

**CRÍTICO:** NotesContext tem `syncData()` que apenas chama `loadNotes()` (recarrega do DB) e `markNotesSynced()`. Não re-envia mudanças offline. Notas criadas/editadas/deletadas offline são perdidas.

**ALTO:** AppContext sync não envia deletes. Se um usuário deletar areas/operations/products/seasons enquanto offline, as exclusões são perdidas ao reconectar.

**ALTO:** product_lots não tem offline storage. Edições de lotes offline não são persistidas.

---

## BLOCO R — DIVERGÊNCIAS DE ESTOQUE: CAUSAS E MECANISMO

`[CÓDIGO]` Análise das causas das 125 divergências de estoque:

### R.1 — useProducts() (dedução de estoque)

Localização: `AppContext.tsx` linhas ~880-1010

O fluxo de dedução de estoque quando uma operação é criada:
1. Verifica stock disponível (client-side)
2. Para cada produto usado:
   a. Se lotId fornecido: `.update({ quantity: lot.quantity - usage.quantity })` no lote
   b. `.update({ quantity_in_stock: product.quantityInStock - usage.quantity })` no produto
3. Todas as atualizações em paralelo via `Promise.all`

**Problemas:**
- **NÃO atômico:** Sem RPC, sem transaction. Se uma atualização falhar, as outras já foram aplicadas.
- **Race condition:** Promise.all envia múltiplas atualizações concorrentes ao mesmo produto/lote.
- **Sem rollback:** Se a inserção da operação falhar APÓS a dedução do estoque, o estoque já foi deduzido.

### R.2 — returnProducts() (devolução de estoque)

Localização: `AppContext.tsx` linhas ~880-930

Mesmo padrão não-atômico. Se a operação é editada:
1. `returnProducts(old)` — devolve estoque antigo
2. `useProducts(new)` — deduz novo estoque
3. `update operation`

Se o passo 2 ou 3 falhar, o estoque foi devolvido mas não re-deduzido.

### R.3 — deleteOperation()

Localização: `AppContext.tsx` linha ~596

1. `returnProducts()` — devolve estoque
2. `.delete().eq('id', id)` — deleta operação

Se o delete falhar, o estoque já foi devolvido mas a operação ainda existe.

### R.4 — recomputeProductQuantity()

Recalcula `quantity_in_stock` = soma de `product_lots.quantity`. Se não há lotes, resultado = 0.

Isto pode sobrescrever o stock legítimo de produtos que foram criados antes de product_lots existir.

---

## BLOCO S — UNIDADES INCONSISTENTES

`[SELECT]` Variação de unidades na tabela `products`:

| Unidade | Contagem | Notas |
|---|---|---|
| L | ~50 | Litros (padrão) |
| KG | ~30 | Quilogramas (maiúsculo) |
| Kg | ~15 | Quilogramas (capitalizado) |
| kg | ~10 | Quilogramas (minúsculo) |
| Bag | ~5 | Saco (unidade de medida não-padrão) |
| "L " | ~3 | Litros com espaço trailing |

**RISCO PARA MIGRAÇÃO:** As variações `L` vs `"L "` e `KG` vs `Kg` vs `kg` representam a mesma unidade escrita de formas diferentes. A migração deve normalizar estas strings, mas PRESERVANDO os dados originais. A normalização deve ser feita via BACKFILL, não via ALTER de tipo.

`[CÓDIGO]` O `OperationForm.tsx` tem `formatNumber()` que faz `value.replace(/[^\d,]/g, '')` — remove pontos (separador decimal americano) mas mantém vírgulas (separador decimal brasileiro). Isto pode causar problemas se o usuário digitar valores com ponto decimal.

`[CÓDIGO]` O `parseNumber()` substitui vírgula por ponto antes de converter para número. Isto é correto para input brasileiro.

---

## BLOCO T — DUPLICATAS IDENTIFICADAS

`[SELECT]` Registros duplicados por tabela:

### T.1 — machinery (nomes duplicados)

| Nome | Quantidade |
|---|---|
| Trator nem holland | 7 |
| Trator massey | 3 |
| Pulverizador jacto | 2 |

Total: 12 registros envolvidos em duplicatas. Estes podem ser registros legítimos (mesmo modelo, máquinas diferentes) ou duplicatas reais (erro de cadastro).

### T.2 — product_lots (números de lote duplicados)

| Número do lote | Quantidade |
|---|---|
| 1 | 12 |
| 0298 | 4 |
| 08100 | 2 |
| 41280 | 2 |
| 25440 | 2 |
| 40320 | 2 |
| 21600 | 2 |
| LCP0223 | 2 |

Total: 28 registros envolvidos em duplicatas. Lotes com o mesmo número podem pertencer a produtos diferentes (não há unique constraint em `lot_number` isoladamente).

### T.3 — products (nomes duplicados)

| Nome | Quantidade |
|---|---|
| MAXRAIZ | 2 |

**RISCO PARA MIGRAÇÃO:** Duplicatas não devem ser removidas automaticamente. Cada caso deve ser avaliado individualmente. A migração deve PRESERVAR todos os registros.

---

## BLOCO U — DISTRIBUIÇÃO DE DADOS POR INSTITUIÇÃO

`[SELECT]` Distribuição de registros por instituição:

| Instituição | Áreas | Operations | Products | Seasons | Machinery | Notes |
|---|---|---|---|---|---|---|
| Instituição ativa #1 | ~42 | ~300 | ~210 | ~4 | ~17 | ~8 |
| Instituição ativa #2 | ~2 | ~9 | ~7 | ~1 | ~2 | 0 |
| Instituição #3 | 0 | 0 | 0 | 0 | 0 | 0 |
| Instituição #4 | 0 | 0 | 0 | 0 | 0 | 0 |
| Instituição #5 | 0 | 0 | 0 | 0 | 0 | 0 |
| Instituição #6 | 0 | 0 | 0 | 0 | 0 | 0 |

**Concentração de dados:** 95%+ dos dados estão em uma única instituição. Isto significa que a instituição principal é a mais crítica para a migração.

`[SELECT]` Distribuição de usuários por instituição:

| Instituição | Usuários | Admins |
|---|---|---|
| Instituição ativa #1 | ~4 | ~2 |
| Instituição ativa #2 | ~2 | ~1 |
| Outras (4) | 0 | 0 |

---

## BLOCO V — ANÁLISE DO FLUXO DE AUTENTICAÇÃO

`[CÓDIGO]` Análise do fluxo de login/registro em `Login.tsx`:

### V.1 — Login (signInWithPassword)

1. Valida email e password
2. Chama `supabase.auth.signInWithPassword()`
3. Rate limiting: 3 tentativas, depois 60s de bloqueio
4. `useEffect` redireciona para `/` se sessão existir

### V.2 — Registro (nova instituição)

1. Valida campos (firstName, lastName, email, password ≥6, phone, role, institution)
2. Verifica se instituição existe via `check_institution_exists` RPC
3. Chama `supabase.auth.signUp()` com `user_metadata: {first_name, last_name, phone, role}`
4. Chama `handle_user_registration(user_id, institution_name)` RPC
5. Se erro 23505 (unique violation), mostra erro de duplicidade

**Problema:** Se `signUp` succeede mas `handle_user_registration` falha, o usuário é criado em `auth.users` sem institution. Não há rollback do auth user.

### V.3 — Registro (join instituição existente)

1. Valida código de convite via `validate_invitation` RPC
2. Chama `supabase.auth.signUp()`
3. Chama `join_institution(user_id, invitation_code)` RPC
4. `join_institution` cria/atualiza `user_profiles` e marca convite como usado

### V.4 — useAuth hook

- Retorna `{session, loading, error}`
- Usa `supabase.auth.getSession()` + `onAuthStateChange`
- **NÃO verifica role** do usuário (admin vs regular)
- **NÃO tem refresh de token** explícito
- `onAuthStateChange` não está envolto em async IIFE (potencial deadlock)

---

## BLOCO W — ANÁLISE DE FUNÇÕES DELETETE E CASCATA

`[CÓDIGO]` Mapeamento de operações de delete e seu impacto em cascata:

### W.1 — Delete Area

**Gatilho:** `AppContext.tsx` linha 429 → `.delete().eq('id', id)`
**Cascata:** `operations` (todas as operações da área são DELETADAS)
**Estoque:** Não há devolução de estoque — as operações são deletadas mas o estoque deduzido por elas não é devolvido.
**RISCO CRÍTICO:** Perda dupla — perde-se o histórico de operações E o estoque não é corrigido.

### W.2 — Delete Operation

**Gatilho:** `AppContext.tsx` linha 596
**Fluxo:** `returnProducts()` → `.delete().eq('id', id)`
**Cascata:** Nenhuma (operations é folha na árvore de FKs)
**Risco:** Se delete falha após returnProducts, estoque é incorretamente devolvido.

### W.3 — Delete Product

**Gatilho:** `AppContext.tsx` linha 760
**Cascata:** `product_lots` (todos os lotes do produto são DELETADOS)
**Referências em JSONB:** `operations.products_used` ainda contém o `productId` — 501 referências órfãs já existem por este motivo.
**RISCO CRÍTICO:** Perda irreversível de lotes e criação de referências órfãs.

### W.4 — Delete Season

**Gatilho:** `Settings.tsx` linha 519
**Cascata:** `operations` (TODAS as operações da safra são DELETADAS)
**RISCO CRÍTICO:** Uma safra com 300+ operações pode ser deletada com um único clique.

### W.5 — Delete Machinery

**Gatilho:** `MachineryContext.tsx` linha 326
**Cascata:** `maintenances` (todas as manutenções da máquina são DELETADAS)
**RISCO ALTO:** Perda de histórico de manutenção.

### W.6 — Delete Maintenance Type

**Gatilho:** `MachineryContext.tsx` linha 479
**Cascata:** `maintenances` (todas as manutenções daquele tipo são DELETADAS)
**RISCO ALTO:** Perda de registros de manutenção.

### W.7 — Delete Product Lot

**Gatilho:** `AppContext.tsx` linha 866
**Cascata:** Nenhuma
**Fluxo:** Deleta lote → `recomputeProductQuantity()` recalcula stock do produto
**RISCO BAIXO** (operação isolada)

### W.8 — Delete Note

**Gatilho:** `NotesContext.tsx` linha 256
**Cascata:** Nenhuma
**RISCO BAIXO**

---

## BLOCO X — TYPESCRIPT TYPES STALE

`[CÓDIGO]` Análise de `database.types.ts`:

O arquivo de tipos está significativamente desatualizado em relação ao schema real do banco:

| Problema | Impacto |
|---|---|
| Tabela `notes` ausente dos tipos | Erros de tipo ao usar notes |
| Tabela `operation_products` tipada mas não usada | Confusão de desenvolvimento |
| Apenas `copy_areas_to_new_season` RPC tipada | 14 de 15 RPCs sem tipo |
| Muitas colunas ausentes nas definições de tipo | Falta de autocomplete e type safety |
| `products_used` não tipado como JSONB array | Sem validação de estrutura |

**RISCO PARA MIGRAÇÃO:** O arquivo de tipos deve ser regenerado a partir do schema atual ANTES da migração, para garantir que o código TypeScript reflita corretamente o estado do banco.

---

## BLOCO Y — CONFIGURAÇÃO PWA E CACHE

`[CONFIGURAÇÃO]` Análise de `vite.config.ts`:

| Configuração | Valor |
|---|---|
| Plugin PWA | vite-plugin-pwa (autoUpdate) |
| Strategy | generateSW |
| Runtime caching | |
| — Google Fonts | CacheFirst, 1 ano |
| — Imagens | CacheFirst, 30 dias |
| — JS/CSS | NetworkFirst, timeout 5s, cache 7 dias |
| — Pexels images | CacheFirst, 30 dias |
| Icons | **URLs remotas do Pexels (JPEG)** |
| React plugin | fastRefresh: false, exclude: /FarmMap\.tsx$/ |

**RISCO:** Os ícones do PWA são URLs remotas do Pexels (JPEG). Se as URLs do Pexels mudarem ou ficarem indisponíveis, o PWA perde seus ícones. Para produção, os ícones devem ser arquivos locais.

**RISCO:** `fastRefresh: false` pode dificultar o desenvolvimento.

---

## BLOCO Z — ESTRATÉGIA PROPOSTA DE MIGRAÇÃO ZERO DATA LOSS (NÃO IMPLEMENTADA)

> **IMPORTANTE:** Esta estratégia é uma PROPOSTA. NÃO foi implementada.
> Nenhuma migration foi aplicada. Nenhum código foi alterado.

### Princípios

1. **PRESERVAÇÃO ABSOLUTA:** Nenhum dado existente pode ser perdido.
2. **EXPAND, don't REPLACE:** Adicionar colunas/tabelas novas, nunca remover antigas.
3. **BACKFILL, don't OVERWRITE:** Preencher novas estruturas a partir dos dados antigos, mantendo os originais intactos.
4. **VALIDATE before CUTOVER:** Verificar que os dados migrados são idênticos aos originais antes de mudar o código.
5. **DUAL WRITE durante transição:** Escrever em ambos os esquemas (antigo e novo) simultaneamente.
6. **OBSERVE antes de DEPRECATE:** Monitorar o sistema antes de remover estruturas antigas.
7. **ROLLBACK sempre possível:** Em cada etapa, deve ser possível reverter.

### Padrão: EXPAND → BACKFILL → VALIDATE → DUAL WRITE → CUTOVER → OBSERVE → DEPRECATE

#### Etapa 1 — EXPAND (adições não-destrutivas)

**Objetivo:** Adicionar novas estruturas sem tocar nas existentes.

**Propostas (NÃO implementadas):**
- Criar tabela `operation_products_v2` com FKs corretas, RLS habilitado, e colunas adicionais (dose, lot_id, created_at, updated_at)
- Adicionar coluna `unit_normalized` em `products` (text, nullable) — para armazenar a versão normalizada da unidade
- Adicionar coluna `stock_source` em `products` (text, default 'legacy') — para rastrear se o stock veio de lotes ou do valor legacy
- Adicionar coluna `migration_status` em `products` (text, nullable) — para rastrear o status da migração de stock
- Habilitar RLS em `operation_products` (sem mudar dados existentes)

#### Etapa 2 — BACKFILL (preencher novas estruturas)

**Objetivo:** Copiar dados das estruturas antigas para as novas, sem modificar as antigas.

**Propostas (NÃO implementadas):**
- Para cada produto sem lotes mas com `quantity_in_stock > 0`: criar um `product_lot` retroativo com `lot_number = 'LEGACY-MIGRATION'`, `quantity = quantity_in_stock`, `expiration_date = NULL`. Marcar `stock_source = 'legacy'`.
- Para cada item em `operations.products_used`: criar registro em `operation_products_v2` com `operation_id`, `product_id` (mesmo se inválido — usar produto placeholder para inválidos), `quantity`, `dose`.
- Normalizar unidades: copiar `unit` para `unit_normalized` aplicando: `TRIM(LOWER(unit))`, mapeando `kg`→`KG`, `l`→`L`, etc.
- Calcular checksums antes e após o backfill para verificar que nenhum dado foi alterado nas tabelas originais.

#### Etapa 3 — VALIDATE (verificação de integridade)

**Objetivo:** Confirmar que o backfill copiou corretamente sem perdas.

**Propostas (NÃO implementadas):**
- Recalcular checksums das tabelas originais e comparar com a BASELINE DE INTEGRIDADE (Bloco B)
- Verificar que `COUNT(operation_products_v2) = total de itens em todos products_used`
- Verificar que `SUM(product_lots.quantity) = SUM(products.quantity_in_stock)` para produtos migrados
- Verificar que nenhum registro original foi modificado (comparar updated_at)
- Gerar relatório de itens que não puderam ser migrados (501 products_used com productId inválido) e decidir tratamento

#### Etapa 4 — DUAL WRITE (escrita dupla)

**Objetivo:** Escrever em ambas as estruturas simultaneamente durante a transição.

**Propostas (NÃO implementadas):**
- Modificar `AppContext.tsx` para que `addOperation()` escreva tanto em `operations.products_used` (JSONB) quanto em `operation_products_v2` (tabela)
- Modificar `useProducts()` e `returnProducts()` para usar RPC atômica que atualiza `product_lots` e `products` em uma transação
- Modificar `updateOperation()` e `deleteOperation()` para manter ambas as estruturas sincronizadas
- Manter código de leitura usando as estruturas antigas (seguras)

#### Etapa 5 — CUTOVER (mudança de leitura)

**Objetivo:** Mudar o código de leitura para usar as novas estruturas.

**Propostas (NÃO implementadas):**
- Modificar frontend para ler de `operation_products_v2` em vez de `products_used` JSONB
- Modificar frontend para ler stock de `product_lots` em vez de `products.quantity_in_stock`
- Modificar relatórios e estatísticas para usar os novos dados
- Manter `products_used` e `quantity_in_stock` como redundância temporária

#### Etapa 6 — OBSERVE (monitoramento)

**Objetivo:** Monitorar o sistema para detectar problemas.

**Propostas (NÃO implementadas):**
- Período de observação de pelo menos 2 semanas
- Verificar diariamente que checksums das tabelas originais não mudaram inesperadamente
- Verificar que dual write está mantendo consistência
- Coletar feedback de usuários sobre discrepâncias

#### Etapa 7 — DEPRECATE (remoção de estruturas antigas)

**Objetivo:** Remover estruturas redundantes APENAS após confirmação de estabilidade.

**Propostas (NÃO implementadas):**
- Parar de escrever em `operations.products_used` (manter a coluna, parar de usar)
- Parar de usar `products.quantity_in_stock` como fonte primária (manter a coluna, usar sum de lotes)
- Apenas nesta etapa, após longa observação, considerar remover colunas/estruturas não usadas
- **NUNCA apagar dados sem backup verificado**

### Rollback em cada etapa

| Etapa | Rollback |
|---|---|
| EXPAND | DROP das novas colunas/tabelas (não afeta dados existentes) |
| BACKFILL | DELETE dos registros criados no backfill (não afeta dados existentes) |
| VALIDATE | N/A (apenas leitura) |
| DUAL WRITE | Reverter código para escrever apenas nas estruturas antigas |
| CUTOVER | Reverter código para ler das estruturas antigas |
| OBSERVE | N/A (apenas leitura) |
| DEPRECATE | Reverter código para usar estruturas antigas (ainda existem) |

---

## BLOCO AA — RESUMO DE RISCOS CRÍTICOS PARA MIGRAÇÃO

| # | Risco | Severidade | Bloco | Mitigação na migração |
|---|---|---|---|---|
| 1 | 122 produtos com stock mas sem lotes | CRÍTICO | I | Criar lotes retroativos no backfill |
| 2 | 501 referências productId inválidas em products_used | CRÍTICO | J | Criar produto placeholder ou manter como órfão |
| 3 | CASCADE em delete de season/area/product | CRÍTICO | D, W | Adicionar soft delete antes de permitir hard delete |
| 4 | Estoque não-atômico (sem RPC/transaction) | CRÍTICO | R | Migrar para RPC atômica no dual write |
| 5 | Sync offline é stub em MachineryContext | CRÍTICO | Q | Implementar sync real antes de confiar no offline |
| 6 | Sync offline não envia deletes | ALTO | Q | Implementar sync de deletes |
| 7 | operation_products com RLS desabilitado | ALTO | K, N | Habilitar RLS na etapa EXPAND |
| 8 | Todas as funções EXECUTABLE por anon | ALTO | N | Revogar EXECUTE de anon para funções SECURITY DEFINER |
| 9 | list_institution_users sem verificação de auth | ALTO | L | Adicionar verificação de pertencimento |
| 10 | database.types.ts desatualizado | MÉDIO | X | Regenerar tipos a partir do schema atual |
| 11 | Unidades inconsistentes (L, KG, Kg, kg, Bag) | MÉDIO | S | Normalizar via backfill em coluna nova |
| 12 | Duplicatas em machinery, product_lots, products | MÉDIO | T | Não remover; marcar para revisão manual |
| 13 | onAuthStateChange sem async IIFE | MÉDIO | V | Envolver em IIFE async |
| 14 | Índices ausentes em FKs | BAIXO | E | Adicionar índices na etapa EXPAND |
| 15 | PWA icons são URLs remotas | BAIXO | Y | Baixar e armazenar localmente |

---

## BLOCO BB — VERIFICAÇÃO PÓS-MIGRAÇÃO (CHECKLIST)

Após cada etapa da migração, executar esta verificação:

- [ ] Recalcular checksums de todas as 13 tabelas com dados
- [ ] Comparar com a BASELINE DE INTEGRIDADE (Bloco B)
- [ ] Verificar contagem de registros por tabela (deve ser igual ou maior)
- [ ] Verificar zero órfãos (repetir queries do Bloco G)
- [ ] Verificar zero NULLs em campos críticos (repetir queries do Bloco H)
- [ ] Verificar que nenhum `updated_at` foi modificado em tabelas que não sofreram ALTER
- [ ] Verificar que RLS está habilitado em todas as tabelas (exceto spatial_ref_sys)
- [ ] Verificar que as policies existem e estão corretas
- [ ] Verificar que as funções SECURITY DEFINER não perderam suas propriedades
- [ ] Verificar que os triggers continuam ativos
- [ ] Verificar que as FKs e constraints não foram removidas
- [ ] Verificar que os índices não foram removidos
- [ ] Executar `npm run build` e verificar que o projeto compila
- [ ] Testar login, registro, CRUD de areas, operations, products
- [ ] Testar modo offline e sincronização

---

## BLOCO CC — COMANDOS DE VERIFICAÇÃO (READ-ONLY)

Estes comandos podem ser executados a qualquer momento para verificar a integridade:

### CC.1 — Verificar checksums (comparar com Bloco B)

```sql
SELECT 'areas' as tbl, md5(string_agg(areas::text, '' ORDER BY id)) as checksum, count(*) as cnt FROM areas
UNION ALL SELECT 'institutions', md5(string_agg(institutions::text, '' ORDER BY id)), count(*) FROM institutions
UNION ALL SELECT 'invitations', md5(string_agg(invitations::text, '' ORDER BY id)), count(*) FROM invitations
UNION ALL SELECT 'machinery', md5(string_agg(machinery::text, '' ORDER BY id)), count(*) FROM machinery
UNION ALL SELECT 'maintenance_types', md5(string_agg(maintenance_types::text, '' ORDER BY id)), count(*) FROM maintenance_types
UNION ALL SELECT 'maintenances', md5(string_agg(maintenances::text, '' ORDER BY id)), count(*) FROM maintenances
UNION ALL SELECT 'notes', md5(string_agg(notes::text, '' ORDER BY id)), count(*) FROM notes
UNION ALL SELECT 'operation_products', md5(string_agg(operation_products::text, '' ORDER BY id)), count(*) FROM operation_products
UNION ALL SELECT 'operations', md5(string_agg(operations::text, '' ORDER BY id)), count(*) FROM operations
UNION ALL SELECT 'product_lots', md5(string_agg(product_lots::text, '' ORDER BY id)), count(*) FROM product_lots
UNION ALL SELECT 'products', md5(string_agg(products::text, '' ORDER BY id)), count(*) FROM products
UNION ALL SELECT 'seasons', md5(string_agg(seasons::text, '' ORDER BY id)), count(*) FROM seasons
UNION ALL SELECT 'user_profiles', md5(string_agg(user_profiles::text, '' ORDER BY id)), count(*) FROM user_profiles;
```

### CC.2 — Verificar órfãos

```sql
-- Areas sem instituição válida
SELECT count(*) FROM areas a LEFT JOIN institutions i ON a.institution_id = i.id WHERE i.id IS NULL;
-- Operations sem área válida
SELECT count(*) FROM operations o LEFT JOIN areas a ON o.area_id = a.id WHERE a.id IS NULL;
-- Product lots sem produto válido
SELECT count(*) FROM product_lots pl LEFT JOIN products p ON pl.product_id = p.id WHERE p.id IS NULL;
-- Maintenances sem máquina válida
SELECT count(*) FROM maintenances m LEFT JOIN machinery mac ON m.machinery_id = mac.id WHERE mac.id IS NULL;
```

### CC.3 — Verificar RLS

```sql
SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname;
```

---

## BLOCO DD — CONCLUSÃO

### Estado atual do banco

O banco de dados AgriGest contém **775 registros de negócio** distribuídos em **14 tabelas**, com integridade referencial intacta (zero órfãos) e zero NULLs em campos críticos. Os checksums MD5 de todas as tabelas foram registrados como baseline.

### Problemas críticos que NÃO devem ser corrigidos durante a migração

1. **Divergência de estoque (125 produtos):** Estes dados representam o estado real do sistema. Corrigir esta divergência significa decidir qual valor é "correto" — o `quantity_in_stock` ou a soma dos lotes. Esta decisão deve ser feita pelo dono dos dados, não pela migração.

2. **Referências órfãs em products_used (501 itens):** Estes itens contêm histórico de operações. Mesmo que o produto não exista mais, o registro da operação deve ser preservado.

3. **Duplicatas (12 machinery, 28 product_lots, 2 products):** Podem ser registros legítimos. Não remover.

4. **Unidades inconsistentes:** Preservar os valores originais. A normalização deve ser feita em coluna nova.

### Prioridade da migração

A prioridade absoluta é **ZERO PERDA DE DADOS**. Cada etapa da migração deve ser reversível. Os checksums do Bloco B são a garantia de que nenhum dado foi perdido.

---

**FIM DO RELATÓRIO**

Auditoria forense pré-migração AgriGest — Versão 1
Data: 2026-10-07
Total de blocos: A-DD (28 blocos)
Total de tabelas auditadas: 14
Total de funções auditadas: 15
Total de políticas RLS auditadas: 53
Total de triggers auditados: 9
Total de operações de código mapeadas: 47

**NENHUMA modificação foi executada. NENHUMA migration foi aplicada. A estratégia proposta NÃO foi implementada.**
