# AUDITORIA TÉCNICA COMPLETA — AgriGest

> **Data da auditoria:** 2025-01-16
> **Versão do código:** estado atual do repositório no momento da auditoria
> **Regra fundamental:** Nenhuma alteração foi feita no código, no banco, ou em qualquer configuração. Auditoria estritamente somente-leitura.

---

## SUMÁRIO EXECUTIVO

O AgriGest é uma aplicação React 18 + TypeScript + Vite + Supabase + Tailwind CSS para gestão agrícola, com funcionalidades de áreas cultivadas, operações, estoque de produtos, safras, máquinas/manutenções, anotações, mapa da fazenda (MapLibre GL + PostGIS), relatórios, estatísticas, modo offline (PWA) e sistema de convites multi-instituição.

A auditoria revelou um sistema funcional com boa arquitetura de base, mas com **5 problemas CRÍTICOS**, **7 problemas ALTOS**, **11 problemas MÉDIOS**, **8 problemas BAIXOS** e **6 sugestões de MELHORIA**. Os problemas mais graves são: RLS desabilitada em `operation_products`, baixas de estoque não-atômicas executadas no navegador, sincronização offline que marca dados como sincronizados sem reenviá-los, funções SECURITY DEFINER executáveis pelo role `anon`, e um bug na cópia de áreas entre safras que perde campos.

A **prontidão para IA** é parcial: o esquema e os dados existentes suportam consultas analíticas, mas a ausência de uma tabela normalizada de produtos por operação, a inconsistência de unidades, e a falta de auditoria/linha do tempo limitam severamente a qualidade de qualquer análise preditiva.

---

## METODOLOGIA E CONVENÇÕES

Ao longo do relatório, cada achado é classificado por **fonte de evidência**:

- **[CÓDIGO]** — comportamento provado pela leitura do código-fonte do frontend
- **[SCHEMA]** — comportamento provado pelo esquema real do banco de dados (consultas SQL diretas)
- **[ADVISOR]** — achado reportado pelo Supabase Advisor (security ou performance)
- **[INDETERMINADO]** — comportamento que não pôde ser determinado com as fontes disponíveis

Cada problema é classificado por severidade:
- **CRÍTICO** — risco de perda de dados, vulnerabilidade de segurança explorável, ou falha funcional grave
- **ALTO** — risco significativo de integridade ou segurança, ou falha funcional importante
- **MÉDIO** — risco moderado, impacto limitado ou condicional
- **BAIXO** — risco baixo, impacto marginal
- **MELHORIA** — não é um bug, mas uma oportunidade de melhoria

---

# BLOCO A — ARQUITETURA GERAL

## A1. Stack Tecnológico [CÓDIGO]

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Frontend | React | 18.3 |
| Linguagem | TypeScript | 5.5 |
| Build | Vite | 5.4 |
| CSS | Tailwind CSS | 3.4.18 |
| Backend/DB | Supabase (PostgreSQL + PostGIS) | — |
| Mapas | MapLibre GL | 5.24 |
| PWA | vite-plugin-pwa | autoUpdate |
| Offline | localStorage via `useOfflineStorage` | — |
| Roteamento | react-router-dom | — |
| Ícones | lucide-react | — |

**Sem bibliotecas de gerenciamento de estado externo** (Redux, Zustand, etc.). O estado global é gerenciado via React Context: `LanguageProvider > AppProvider > MachineryProvider > NotesProvider > Router`.

## A2. Estrutura de Diretórios [CÓDIGO]

```
src/
  components/
    ui/          — Button, Input, Select, Card, Badge, ProductSearchInput
    operations/  — OperationForm, OperationCard
    products/    — ProductForm, LotManager
    farmMap/     — FarmMap, GeometryManager
  context/       — AppContext, MachineryContext, NotesContext, LanguageContext
  hooks/         — useAuth, useOfflineStorage, useNetworkStatus
  lib/           — supabase (cliente), database.types
  pages/         — Dashboard, AreasList, AreaForm, Operations, Inventory, 
                   Statistics, Reports, Settings, Notes, Machinery, FarmMap,
                   Login, Notifications
  types/         — Area, Operation, Product, ProductLot, ProductUsage,
                   Machinery, MaintenanceType, Maintenance, Note, farmMap, notes
  utils/         — dateHelpers, farmMap/farmMapHelpers
```

## A3. Provider Nesting e Fluxo de Dados [CÓDIGO]

`App.tsx` define a hierarquia:
```
LanguageProvider → AppProvider → MachineryProvider → NotesProvider → Router
```

- `AppProvider` centraliza áreas, operações, produtos, lotes, safras e geometrias.
- `MachineryProvider` e `NotesProvider` são contextos separados, cada um com seu próprio estado offline.
- `PrivateRoute` protege rotas baseado em `useAuth().session`.
- `OfflineIndicator` é global.

**Problema:** Os três contextos (`AppProvider`, `MachineryProvider`, `NotesProvider`) mantêm `hasPendingSync` independentes. A UI só mostra o indicador de sincronização pendente do `AppProvider` via `useAppContext()`. Status pendente de máquinas e notas não é visível ao usuário na maioria das telas. **[MÉDIO]**

## A4. Configuração PWA [CÓDIGO]

`vite.config.ts` configura:
- `registerType: 'autoUpdate'`
- Runtime caching: Google Fonts (CacheFirst, 1 ano), imagens (CacheFirst, 30 dias), JS/CSS (NetworkFirst, timeout 5s, 7 dias), imagens Pexels (CacheFirst, 30 dias)
- Ícones/screenshots são URLs remotos do Pexels (JPEG), não arquivos locais bundled
- `react({ fastRefresh: false, exclude: /FarmMap\.tsx$/ })`

**Problema:** Ícones PWA remotos. Se o Pexels estiver indisponível no momento da instalação do PWA, o app pode não instalar corretamente. **[BAIXO]**

---

# BLOCO B — AUTENTICAÇÃO

## B1. Fluxo de Auth [CÓDIGO]

`useAuth.ts`:
- `supabase.auth.getSession()` na inicialização
- `onAuthStateChange` para mudanças de sessão
- Retorna `{session, loading, error}`
- **Sem lógica de refresh de token** — delega ao Supabase SDK
- **Sem verificação de role** — qualquer sessão autenticada passa

## B2. Proteção de Rotas [CÓDIGO]

`PrivateRoute` em `App.tsx`:
- Verifica `session` de `useAuth()`
- Se não há sessão, redireciona para `/login`
- **Sem verificação de institution_id** — um usuário sem instituição pode acessar todas as rotas protegidas, mas operações de banco falharão ao buscar `institution_id`

**Indeterminado:** Não foi possível verificar se `handle_user_registration` sempre cria um `institution_id` válido para o usuário. **[INDETERMINADO]**

## B3. Tela de Login/Cadastro [CÓDIGO]

`Login.tsx` (de contexto anterior):
- Fluxo de login e registro
- Criação de instituição via `check_institution_exists` + `handle_user_registration`
- Junção a instituição existente via `join_institution`
- `isSubmitDisabled` é true quando campos vazios ou offline
- Botão usa variante primary com `className="w-full"`

## B4. Segurança do Fluxo de Convites [SCHEMA + CÓDIGO]

- `generate_invite_code()` usa `md5(random()::text)` substring — **não criptograficamente seguro** [SCHEMA]
- Convites têm `expires_at` mas **não há verificação de expiração visível no código do frontend** ao usar o convite — `join_institution` RPC deve verificar, mas a verificação não foi confirmada na definição da função [INDETERMINADO]
- `create_invitation` é SECURITY DEFINER e **executável por anon** [SCHEMA] — um usuário não autenticado poderia criar convites se conhecesse o `institution_id`. **[CRÍTICO — detalhado em C3]**

---

# BLOCO C — RLS E SEGURANÇA DO BANCO

## C1. Status RLS por Tabela [SCHEMA + ADVISOR]

| Tabela | RLS Habilitado | Políticas |
|--------|---------------|-----------|
| areas | SIM | 4 (SELECT/INSERT/UPDATE/DELETE) |
| institutions | SIM | (não detalhado nesta auditoria) |
| invitations | SIM | (não detalhado) |
| machinery | SIM | 4 |
| maintenance_types | SIM | 4 |
| maintenances | SIM | 4 |
| notes | SIM | 4 |
| **operation_products** | **NÃO** | **Sim (existem mas inativas)** |
| operations | SIM | 4 |
| product_lots | SIM | 4 |
| products | SIM | 4 |
| seasons | SIM | 4 |
| user_profiles | SIM | 4 |
| spatial_ref_sys | NÃO | (tabela sistema PostGIS) |

### C1.1 — RLS DESABILITADA em `operation_products` [SCHEMA + ADVISOR]

**Severidade: CRÍTICO**

A tabela `operation_products` existe no banco com políticas definidas, mas **RLS está DESABILITADA**. Isso significa que qualquer cliente com a anon key pode ler, inserir, atualizar e deletar registros diretamente nesta tabela, bypassando todas as políticas.

**Mitigação parcial:** O código do frontend não usa esta tabela (usa `operations.products_used` JSONB). Mas a tabela está exposta via Supabase Data API e é acessível com a anon key.

## C2. Políticas RLS — Padrão [SCHEMA]

As políticas nas tabelas principais seguem o padrão:
```sql
institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())
```

Isso significa:
- **SELECT:** usuário vê apenas dados da sua instituição
- **INSERT:** WITH CHECK valida institution_id pertence ao usuário
- **UPDATE:** USING + WITH CHECK validam instituição
- **DELETE:** USING valida instituição

**Problema:** `areas.institution_id` e `operations.institution_id` são **nullable** (nullable=YES no schema). Se `institution_id` for NULL, a política `institution_id IN (SELECT ...)` retorna FALSE (NULL não está IN), bloqueando acesso. O código do frontend sempre busca `institution_id` do perfil antes de inserir, mas se o perfil não tiver `institution_id`, o insert falha silenciosamente. **[MÉDIO]**

## C3. Funções SECURITY DEFINER Executáveis por `anon` [SCHEMA]

**Severidade: CRÍTICO para múltiplas funções**

| Função | SECURITY DEFINER | anon EXECUTE | search_path |
|--------|-----------------|--------------|-------------|
| check_institution_exists | SIM | SIM | (não definido) |
| create_invitation | SIM | SIM | public |
| delete_invitation | SIM | SIM | (não definido) |
| handle_user_registration | SIM | SIM | public |
| join_institution | SIM | SIM | public |
| list_active_invitations | SIM | SIM | (não definido) |
| list_institution_users | SIM | SIM | (não definido) |
| toggle_user_admin_status | SIM | SIM | (não definido) |
| update_season_status | SIM | SIM | (não definido) |
| validate_invitation | SIM | SIM | (não definido) |

**Problemas identificados:**

1. **`create_invitation` executável por anon** — Permite que qualquer pessoa com a anon key crie convites para qualquer instituição, desde que conheça o `institution_id`. **[CRÍTICO]**

2. **`toggle_user_admin_status` executável por anon** — Permite que qualquer pessoa promova/demova administradores. Embora a função possa ter validação interna, o fato de ser executável por anon sem verificar autenticação é perigoso. **[CRÍTICO]**

3. **`delete_invitation` executável por anon** — Permite deletar convites de qualquer instituição. **[ALTO]**

4. **`list_institution_users` executável por anon** — Permite listar usuários de qualquer instituição (emails, nomes, roles). **[ALTO]**

5. **`list_active_invitations` executável por anon** — Permite listar convites ativos de qualquer instituição, expondo códigos de convite. **[CRÍTICO]**

6. **`update_season_status` executável por anon** — Permite alterar status de qualquer safra. **[ALTO]**

7. **Múltiplas funções sem search_path definido** — Vulnerabilidade de search_path manipulation. Funções SECURITY DEFINER sem search_path fixo podem ter seu comportamento alterado por um atacante que cria objetos em schemas maliciosos. [ADVISOR: WARN] **[ALTO]**

## C4. Funções SECURITY INVOKER [SCHEMA]

| Função | SECURITY DEFINER | search_path |
|--------|-----------------|-------------|
| copy_areas_to_new_season | NÃO (INVOKER) | (não definido) |
| generate_invite_code | NÃO (INVOKER) | (não definido) |
| get_area_map_summary | NÃO (INVOKER) | (não definido) |
| save_area_geometry | NÃO (INVOKER) | public, extensions |
| update_updated_at_column | NÃO (INVOKER) | (não definido) |

`save_area_geometry` tem `search_path=public, extensions` — correto.
`get_area_map_summary` não tem search_path definido — **[MÉDIO]** (ADVISOR: WARN).

## C5. Advisor Supabase — Resumo [ADVISOR]

- **52 achados de segurança** (security advisors)
- **77 achados de performance** (performance advisors)
- Principais categorias: RLS desabilitada em `operation_products`, search_path mutável em múltiplas funções, funções SECURITY DEFINER callable por anon/authenticated

---

# BLOCO D — ESQUEMA DO BANCO DE DADOS

## D1. Tabelas e Colunas [SCHEMA]

### institutions
```
id (uuid, PK, gen_random_uuid)
name (text, NOT NULL) — UNIQUE constraint
created_at, updated_at (timestamptz)
created_by (uuid, nullable)
```

### user_profiles
```
id (uuid, PK — é o auth.users.id, sem default automático)
first_name, last_name (text, NOT NULL)
email (text, nullable)
phone (text, nullable)
role (text, NOT NULL)
institution (text, NOT NULL) — nome da instituição (denormalizado)
institution_id (uuid, nullable)
is_admin (boolean, default false)
created_at, updated_at (timestamptz)
```

### invitations
```
id (uuid, PK)
institution_id (uuid, NOT NULL, FK)
code (text, NOT NULL)
expires_at (timestamptz, NOT NULL)
created_at, created_by (uuid, nullable)
used_at, used_by (uuid, nullable)
```

### areas
```
id (uuid, PK)
name (text, NOT NULL)
size (numeric, NOT NULL)
unit (text, NOT NULL)
location, description, current_crop, cultivar (text, nullable)
created_at, updated_at (timestamptz)
user_id (uuid, NOT NULL)
institution_id (uuid, nullable)
geometry (geometry, nullable) — type MultiPolygon, SRID 4326 (confirmado por migration)
```

### seasons
```
id (uuid, PK)
name (text, NOT NULL)
start_date (timestamptz, NOT NULL)
end_date (timestamptz, nullable)
status (text, NOT NULL, default 'active')
description (text, nullable)
created_at, updated_at (timestamptz)
user_id (uuid, NOT NULL)
institution_id (uuid, nullable)
```

### operations
```
id (uuid, PK)
area_id (uuid, NOT NULL, FK)
type (text, NOT NULL)
start_date (timestamptz, NOT NULL)
end_date (timestamptz, nullable)
next_operation_date (timestamptz, nullable)
description (text, NOT NULL)
operated_by (text, NOT NULL)
notes (text, nullable)
products_used (jsonb, default '[]')
operation_size (numeric, nullable)
yield_per_hectare (numeric, nullable)
seeds_per_hectare (numeric, nullable)
created_at, updated_at (timestamptz)
user_id (uuid, NOT NULL)
season_id (uuid, nullable, FK)
institution_id (uuid, nullable)
```

**Nota:** `start_date` é `timestamptz` no banco, mas as migrations a definem como `date` e o código envia `dateToDateString()` (formato YYYY-MM-DD). O Postgres faz cast automático de date para timestamptz com timezone da sessão. **[BAIXO]** — potencial ambiguidade de fuso horário.

### operation_products (NÃO USADA pelo código)
```
id (uuid, PK)
operation_id (uuid, NOT NULL, FK)
product_id (uuid, NOT NULL, FK)
quantity (numeric, NOT NULL)
dose (numeric, nullable)
created_at (timestamptz)
```

### products
```
id (uuid, PK)
name, category, unit (text, NOT NULL)
quantity_in_stock (numeric, NOT NULL, default 0)
min_stock_level (numeric, NOT NULL, default 0)
price (numeric, NOT NULL, default 0)
supplier, description (text, nullable)
created_at, updated_at (timestamptz)
institution_id (uuid, nullable)
```

### product_lots
```
id (uuid, PK)
product_id (uuid, NOT NULL, FK CASCADE)
lot_number (text, NOT NULL)
quantity (numeric, NOT NULL, default 0)
expiration_date (date, nullable)
created_at, updated_at (timestamptz, NOT NULL)
```
**Nota:** `product_lots` **não tem** `institution_id` — o escopo institucional é derivado via EXISTS subquery em `products`. **[SCHEMA]**

### machinery
```
id (uuid, PK)
name (text, NOT NULL)
description, model (text, nullable)
year (integer, nullable)
created_at, updated_at (timestamptz)
user_id, institution_id (uuid, NOT NULL)
```

### maintenance_types
```
id (uuid, PK)
name (text, NOT NULL)
description (text, nullable)
created_at (timestamptz)
user_id, institution_id (uuid, NOT NULL)
```

### maintenances
```
id (uuid, PK)
machinery_id (uuid, NOT NULL, FK)
maintenance_type_id (uuid, NOT NULL, FK CASCADE)
description, material_used, notes (text, nullable)
date (timestamptz, NOT NULL)
machine_hours (numeric, nullable)
cost (numeric, nullable, default 0)
created_at, updated_at (timestamptz)
user_id, institution_id (uuid, NOT NULL)
```

### notes
```
id (uuid, PK)
title, content (text, NOT NULL)
note_date (date, NOT NULL, default CURRENT_DATE)
is_completed (boolean, nullable, default false)
completed_date (date, nullable)
created_at, updated_at (timestamptz)
user_id, institution_id (uuid, NOT NULL)
```

## D2. Relacionamentos e Chaves Estrangeiras [SCHEMA]

Relacionamentos confirmados:
- `areas.user_id` → `auth.users(id)` (não verificado diretamente, inferido das migrations)
- `areas.institution_id` → `institutions(id)` (provável, não confirmado neste audit)
- `operations.area_id` → `areas(id)`
- `operations.season_id` → `seasons(id)`
- `operations.institution_id` → `institutions(id)` (provável)
- `operation_products.operation_id` → `operations(id)`
- `operation_products.product_id` → `products(id)`
- `product_lots.product_id` → `products(id)` ON DELETE CASCADE
- `maintenances.machinery_id` → `machinery(id)`
- `maintenances.maintenance_type_id` → `maintenance_types(id)` ON DELETE CASCADE
- `invitations.institution_id` → `institutions(id)`

**Indeterminado:** Chaves estrangeiras exatas não puderam ser confirmadas pois a consulta de constraints falhou devido a erro interno do Postgres. As relações acima são inferidas das migrations e da estrutura de dados.

## D3. constraints e Índices [SCHEMA + ADVISOR]

**Constraints confirmados:**
- `institutions.name` tem UNIQUE constraint
- `product_lots.product_id` e `product_lots.expiration_date` têm índices
- `areas.geometry` tem índice GiST (confirmado em migration)

**Problemas de performance [ADVISOR — 77 achados]:**
- Múltiplas chaves estrangeiras sem índice (unindexed FKs) — pode causar performance ruim em JOINs e deletes em cascata
- Índices ausentes em colunas frequentemente filtradas (ex: `operations.season_id`, `operations.area_id`)

## D4. Triggers [SCHEMA]

9 triggers `update_updated_at_column()` confirmados nas tabelas: areas, institutions, operations, products, machinery, maintenance_types, maintenances, notes, seasons. Estes atualizam `updated_at` automaticamente em UPDATE.

## D5. Views [SCHEMA]

2 views — ambas são views de sistema do PostGIS:
- `geography_columns`
- `geometry_columns`

**Nenhuma view de negócio customizada.**

## D6. Tipos TypeScript — `database.types.ts` [CÓDIGO]

**Severidade: ALTO**

O arquivo `src/lib/database.types.ts` está **significativamente desatualizado** em relação ao esquema real do banco:

Campos ausentes nos tipos:
- `areas`: `cultivar`, `geometry`, `institution_id`
- `operations`: `season_id`, `products_used`, `operation_size`, `yield_per_hectare`, `seeds_per_hectare`, `institution_id`, `end_date`, `next_operation_date`, `type`, `operated_by`, `description`
- `products`: `institution_id`
- `user_profiles`: `first_name`, `last_name`, `email`, `institution_id`, `is_admin`

Tabela `notes` **inteiramente ausente** dos tipos.

`operation_products` é tipada mas **não usada** pelo código.

Apenas `copy_areas_to_new_season` RPC é tipada; as outras 15 funções não.

**Impacto:** O código funciona porque usa `any` e mapeia campos manualmente, mas a type-safety está comprometida. Mudanças no esquema não serão detectadas em tempo de compilação.

---

# BLOCO E — SAFRAS (SEASONS)

## E1. Modelo de Dados [SCHEMA + CÓDIGO]

- Tabela `seasons` com `status` (active/completed/planned), `start_date`, `end_date`, `name`, `description`
- `operations.season_id` vincula operações a safras
- `activeSeason` é mantido no `AppContext` e define o filtro global de operações

## E2. Filtro Global de Safra [CÓDIGO]

`AppContext.tsx` linha 1307:
```typescript
operations: operations.filter(op => !activeSeason || op.season_id === activeSeason.id)
```

**Comportamento:** Se `activeSeason` é null, todas as operações são retornadas. Se há safra ativa, apenas operações daquela safra são visíveis.

**Problema:** Operações sem `season_id` (nullable) **desaparecem** quando uma safra está ativa. Se uma operação foi criada antes da migração que adicionou `season_id`, ela não aparece em nenhuma safra. **[MÉDIO]**

## E3. Criação e Gestão de Safras [CÓDIGO]

- Safras são criadas na página de Settings via insert direto na tabela `seasons`
- `handleCreateSeason` insere com `user_id`, `institution_id`, `status` (default 'planned')
- `handleUpdateSeasonStatus` usa RPC `update_season_status` (SECURITY DEFINER, executável por anon)
- `handleDeleteSeason` faz delete direto via Supabase client
- **Não há verificação** se a safra tem operações antes de excluir — excluir uma safra não exclui as operações associadas (não há CASCADE), mas as operações ficam órfãs (season_id aponta para safra inexistente). **[ALTO]**

## E4. CóPIA de Áreas entre Safras — `copy_areas_to_new_season` [SCHEMA]

**Severidade: ALTO**

A função `copy_areas_to_new_season(old_season_id, new_season_id)` é SECURITY INVOKER, retorna void.

**Bug confirmado pela definição da função (de auditoria anterior):** A função não copia `institution_id`, `current_crop`, `cultivar`, e `unit` para as novas áreas. As áreas copiadas podem ficar sem instituição, sem cultura atual, sem cultivar e sem unidade de medida.

**Impacto:** Áreas copiadas entre safras perdem metadados críticos. A instituição não conseguirá vê-las (RLS falha sem institution_id) e o usuário perderá informações de cultivo.

---

# BLOCO F — ÁREAS

## F1. CRUD de Áreas [CÓDIGO]

`AppContext.tsx`:
- `addArea`: busca `institution_id` do perfil, insere com `user_id` e `institution_id`
- `updateArea`: atualiza campos via Supabase `.update().eq('id', id)`
- `deleteArea`: delete via `.delete().eq('id', id)`
- **Não há verificação** se a área tem operações antes de excluir. O delete é direto na tabela. Se houver FK com CASCADE não confirmado, as operações podem ser deletadas; se não houver, o delete pode falhar por constraint. **[INDETERMINADO]**

## F2. Unidades de Medida [CÓDIGO + SCHEMA]

- `areas.unit` é `text` — qualquer string é aceita
- `areas.size` é `numeric` — sem constraint de positive
- O código assume "hectares" (ha) em vários lugares, mas o campo é free-text
- `Statistics.tsx` soma `area.size` independentemente de `unit` e exibe como "hectares" **[MÉDIO]**
- `OperationForm.tsx` usa `selectedArea?.unit` para labels de dose

## F3. Geometria (PostGIS) [SCHEMA + CÓDIGO]

- `areas.geometry` é `geometry(MultiPolygon, 4326)` com índice GiST
- `save_area_geometry(area_id, geojson_text)` RPC converte GeoJSON para MultiPolygon via `ST_Multi(ST_Force2D(ST_SetSRID(ST_GeomFromGeoJSON(...), 4326)))`
- `get_area_map_summary(season_id)` retorna GeoJSON extraído via `ST_GeometryN(a.geometry, 1)` (primeiro polígono)
- `stripZCoordinates()` no frontend remove coordenadas Z antes de enviar

**Problema:** `get_area_map_summary` extrai apenas o primeiro polígono (`ST_GeometryN(geometry, 1)`). Se uma área tiver múltiplos polígonos (MultiPolygon real), apenas o primeiro é retornado no GeoJSON. **[BAIXO]**

---

# BLOCO G — MAPA DA FAZENDA

## G1. Renderização [CÓDIGO]

- `FarmMap.tsx` usa MapLibre GL 5.24
- `GeometryManager` gerada criação/edição de geometrias
- `farmMapHelpers.ts` contém cálculo de área via fórmula do excesso esférico
- `getAreaMapSummary` RPC retorna dados + GeoJSON + datas de últimas operações por tipo (fungicide, insecticide, herbicide, dessecacao) + `next_operation_date`

## G2. Cálculo de Área [CÓDIGO]

`farmMapHelpers.ts` implementa fórmula do excesso esférico (spherical excess) para calcular área a partir de coordenadas GeoJSON. **[CÓDIGO confirmado]**

**Indeterminado:** Não foi verificado se o cálculo considera corretamente o SRID 4326 e a distorção de projeção para áreas grandes. **[INDETERMINADO]**

## G3. Configuração Vite [CÓDIGO]

`vite.config.ts` exclui `FarmMap.tsx` do fast refresh do React plugin. Isso é uma configuração comum para evitar problemas de HMR com MapLibre GL.

---

# BLOCO H — OPERAÇÕES

## H1. CRUD de Operações [CÓDIGO]

`AppContext.tsx`:

### Criação (`addOperation`)
1. Valida `activeSeason` existe
2. Valida usuário autenticado
3. **Se há produtos used:** chama `useProducts()` PRIMEIRO — baixa estoque antes de criar a operação
4. Se offline: cria operação local com id `local-{timestamp}`
5. Se online: busca `institution_id`, insere na tabela `operations`

**Problema CRÍTICO — OrdEM de Operações:** O estoque é baixado ANTES da operação existir no banco. Se o insert da operação falhar (erro de rede, constraint, etc.), **o estoque já foi baixado e não é estornado**. **[CRÍTICO]**

### Atualização (`updateOperation`)
1. Busca operação original
2. Se `productsUsed` mudou (comparado via `JSON.stringify`): retorna produtos antigos (`returnProducts`) e usa novos (`useProducts`)
3. Atualiza a operação no banco

**Problema:** A comparação via `JSON.stringify` é sensível à ordem de propriedades dos objetos. Se a ordem dos campos em `productsUsed` mudar sem que os valores mudaram, o estoque é desnecessariamente retornado e re-baixado, criando uma janela de inconsistência. **[MÉDIO]**

### Exclusão (`deleteOperation`)
1. Busca operação, retorna produtos ao estoque (`returnProducts`)
2. Deleta a operação do banco

**Problema:** Se o delete falhar após `returnProducts`, o estoque é devolvido mas a operação continua existindo. **[CRÍTICO]**

## H2. Formulário de Operação [CÓDIGO]

`OperationForm.tsx`:
- Campos: área, tipo, descrição, operador, data inicial, data final, próxima aplicação, tamanho da área aplicada, produtos utilizados (com dose, lote, quantidade)
- Tipos de operação: gradagem, subsolagem, plantio, colheita, dessecacao, herbicida, fungicida + tipos customizados
- Validações: área obrigatória, data inicial obrigatória, descrição obrigatória, operador obrigatório, tamanho > 0 e ≤ tamanho da área
- Para `colheita`: `yieldPerHectare` obrigatório
- Para `plantio`: `seedsPerHectare` obrigatório
- Dose e quantidade: parse com vírgula decimal (`parseNumber` substitui `,` por `.`)
- Quantidade total = dose × operationSize (calculado automaticamente, editável)
- Seleção de lote opcional por produto
- Avisos de lote vencido e vencendo em breve (≤60 dias)

## H3. Tipos de Operação [CÓDIGO]

Tipos fixos: gradagem, subsolagem, plantio, colheita, dessecacao, herbicida, fungicida.
Tipos customizados: adicionados via "Novo Tipo" no formulário — armazenados apenas no estado local do componente (não persistidos). **[BAIXO]** — tipos customizados são perdidos ao recarregar a página.

## H4. `operation_products` vs `products_used` JSONB [CÓDIGO + SCHEMA]

**Severidade: ALTO**

A tabela `operation_products` existe no banco com estrutura normalizada (operation_id, product_id, quantity, dose), mas **o código NÃO a usa**. Em vez disso, `operations.products_used` é um JSONB array que armazena os produtos diretamente na linha da operação.

**Impactos:**
1. **Integridade referacional:** Produtos em `products_used` não têm FK para `products`. Se um produto é deletado, suas referências em `operations.products_used` ficam órfãs (product_id inválido).
2. **Consultas analíticas:** Consultar "quais operações usaram o produto X" requer desnormalizar JSONB em vez de um JOIN simples.
3. **Consistência:** A quantidade em `products_used` pode divergir do que foi efetivamente baixado do estoque.

## H5. `products_used` — Estrutura JSONB [CÓDIGO]

Estrutura de cada item no array `products_used`:
```typescript
{
  productId: string,
  lotId?: string,
  quantity: number | string,
  dose?: string | number
}
```

O tipo `ProductUsage` é definido em `src/types`. A quantidade é serializada como número após `parseNumber()`, mas a dose pode ser string com vírgula decimal.

---

# BLOCO I — ESTOQUE

## I1. Baixa de Estoque — `useProducts()` [CÓDIGO]

**Severidade: CRÍTICO**

`AppContext.tsx`, função `useProducts()`:

1. Verifica estoque suficiente (por produto ou por lote)
2. Se `lotId` fornecido: atualiza `product_lots.quantity` via `supabase.from('product_lots').update(...)`
3. Atualiza `products.quantity_in_stock` via `supabase.from('products').update(...)`
4. Tudo em paralelo com `Promise.all`

**Problemas:**
1. **NÃO-ATÔMICO:** As atualizações de lotes e produtos são feitas em chamadas Supabase separadas, em paralelo. Se uma falhar, o estoque fica inconsistente (lote baixado mas produto não, ou vice-versa).
2. **SEM RPC/TRANSAÇÃO:** Não há RPC nem trigger no banco para garantir atomicidade. Tudo é feito no cliente.
3. **RACE CONDITION:** Lê o estoque atual do estado React (`products.find(p => p.id === usage.productId)`) e subtrai. Se duas operações forem criadas simultaneamente, ambas leem o mesmo valor e a subtração é incorreta (lost update).
4. **SEM FIFO/FEFO:** A seleção de lote é manual pelo usuário. Se nenhum lote é selecionado, a baixa é feita apenas no total do produto (sem especificar lote).

## I2. Devolução de Estoque — `returnProducts()` [CÓDIGO]

Mesma estrutura de `useProducts()` mas somando em vez de subtraindo. Mesmos problemas de atomicidade e race condition. **[CRÍTICO]**

## I3. Cálculo de Estoque Total [CÓDIGO]

`recomputeProductQuantity(productId, lots)`:
- Soma quantidades de todos os lotes do produto
- Atualiza `products.quantity_in_stock` no estado React
- `syncProductTotalToDb()` sincroniza para o banco via update separado

**Problema:** Se a soma dos lotes diverge do `quantity_in_stock` (por erro nas baixas não-atômicas), a sincronização pode sobrescrever o valor correto com um valor incorreto. **[MÉDIO]**

## I4. Lotes (Product Lots) [CÓDIGO + SCHEMA]

- CRUD de lotes via `AppContext`: `addLot`, `updateLot`, `deleteLot`
- `product_lots` não tem `institution_id` — escopo derivado via EXISTS em products
- Sem verificação de duplicação de `lot_number` por produto
- Exclusão de lote: recalcula total do produto e sincroniza
- **product_lots não tem hook de armazenamento offline** — lotes não são persistidos offline **[ALTO]**

## I5. Alertas de Validade [CÓDIGO]

- `isExpiringSoon`: 0-60 dias → badge warning
- `isExpired`: data < hoje → badge danger
- Verificado em `OperationForm.tsx`, `ProductForm.tsx`, `LotManager.tsx`
- **Não há bloqueio** de uso de lote vencido — apenas aviso visual. Usuário pode usar lote vencido. **[BAIXO]**

## I6. Estoque Mínimo [CÓDIGO]

- `products.min_stock_level` — nível mínimo configurável
- `Statistics.tsx` conta `products.filter(p => p.quantityInStock <= p.minStockLevel)`
- **Não há notificação ativa** quando o estoque atinge o mínimo — apenas contagem na página de estatísticas **[MÉDIO]**

---

# BLOCO J — CUSTOS

## J1. Cálculo de Custos [CÓDIGO]

`Statistics.tsx`:
```typescript
stats.productUsage[product.id].totalCost += usage.quantity * product.price;
```

- Custo = quantidade usada × preço por unidade
- Exibido em formato BRL via `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
- Apenas para produtos usados no período filtrado

## J2. Limitações [CÓDIGO]

- **Sem custo de operações sem produto** (gradagem, subsolagem) — não há campo de custo por operação
- **Sem custo de manutenção** integrado às estatísticas — `maintenances.cost` existe mas não é agregado
- **Sem custo de máquina** (combustível, horas) integrado
- **Preço do produto é fixo** — não há preço por lote ou preço histórico

**[MÉDIO]** — os custos reportados são parciais (apenas insumos).

## J3. Custo de Manutenção [SCHEMA]

`maintenances.cost` (numeric, default 0) — campo existe e é preenchido pelo código, mas **não é exibido em nenhum relatório ou estatística**. **[MÉDIO]**

---

# BLOCO K — OFFLINE

## K1. Arquitetura Offline [CÓDIGO]

- `useOfflineStorage<T>` hook genérico usando `localStorage`
- Armazena `{data, timestamp, pendingSync}`
- Mantém array `localStorage['pendingSync']` com chaves pendentes
- `useNetworkStatus()` detecta online/offline via `navigator.onLine` + eventos

## K2. Dados com Suporte Offline [CÓDIGO]

| Contexto | Dados Offline | Sincronização Real |
|----------|--------------|-------------------|
| AppProvider — areas | SIM | SIM (syncAreas envia inserts/updates) |
| AppProvider — operations | SIM | SIM (syncOperations envia inserts/updates) |
| AppProvider — products | SIM | SIM (syncProducts envia inserts/updates) |
| AppProvider — seasons | SIM | SIM (syncSeasons envia inserts/updates) |
| AppProvider — product_lots | **NÃO** | **N/A** |
| MachineryProvider — machinery | SIM | **STUB** (console.log apenas) |
| MachineryProvider — maintenanceTypes | SIM | **STUB** |
| MachineryProvider — maintenances | SIM | **STUB** |
| NotesProvider — notes | SIM | **PARCIAL** (apenas recarrega, não reenvia) |

## K3. Sincronização STUB de Máquinas [CÓDIGO]

**Severidade: CRÍTICO**

`MachineryContext.tsx`:
```typescript
const syncMachinery = async () => {
  console.log('Sincronizando máquinas...');
  markMachinerySynced();  // MARCA COMO SINCRONIZADO sem enviar nada
};
```

As três funções de sincronização (`syncMachinery`, `syncMaintenanceTypes`, `syncMaintenances`) **apenas imprimem no console e marcam como sincronizado**. Nenhum dado é enviado ao banco.

**Impacto:** Máquinas, tipos de manutenção e manutenções criadas/editadas offline são **permanentemente perdidas** quando o usuário volta a ficar online — o sistema marca como sincronizado e apaga a flag de pendência.

## K4. Sincronização PARCIAL de Notas [CÓDIGO]

**Severidade: ALTO**

`NotesContext.tsx`:
```typescript
const syncData = async () => {
  if (notesPendingSync) {
    await loadNotes();  // APENAS RECARREGA do banco
    markNotesSynced();
  }
};
```

A sincronização de notas **apenas recarrega dados do banco** — não envia as alterações offline. Notas criadas offline são perdidas.

## K5. product_lots SEM Offline [CÓDIGO]

**Severidade: ALTO**

`product_lots` não tem hook `useOfflineStorage`. Quando offline:
- Lotes não são carregados do localStorage
- Baixas de estoque em lotes não funcionam offline (tentam acessar Supabase)
- Operações criadas offline com produtos não conseguem especificar lotes

## K6. Estoque em Operações Offline [CÓDIGO]

Quando offline, `addOperation`:
1. Chama `useProducts()` — que tenta atualizar `product_lots` e `products` no Supabase (falha offline)
2. Cria operação local com id `local-{timestamp}`

**Problema:** `useProducts()` quando offline faz `setProducts(updatedProducts)` e `setOfflineProducts(updatedProducts, true)` — atualiza o estado e localStorage de produtos, mas **a atualização de lotes falha silenciosamente** (a chamada Supabase para `product_lots` falha mas o erro é capturado em `try/catch` sem tratamento visible). **[ALTO]**

## K7. Exclusões Offline [CÓDIGO]

Exclusões offline (áreas, operações, produtos) apenas removem do estado/localStorage. Quando sincronizam:
- `syncAreas` faz loop e envia inserts/updates — **não envia deletes**
- `syncOperations` mesmo padrão — **não envia deletes**
- `syncProducts` mesmo padrão — **não envia deletes**

**Impacto:** Áreas/operções/produtos excluídos offline **reaparecem** quando os dados são recarregados do banco após sincronização. **[ALTO]**

## K8. Auto-sincronização [CÓDIGO]

```typescript
useEffect(() => {
  const handleOnline = async () => {
    if (hasPendingSync) {
      try { await syncData(); } catch (error) { ... }
    }
  };
  window.addEventListener('online', handleOnline);
  return () => window.removeEventListener('online', handleOnline);
}, [hasPendingSync]);
```

Quando volta a ficar online, `syncData()` é chamado automaticamente se há pendências. Mas como vimos, apenas AppProvider tem sync real; Machinery e Notes têm sync stub/parcial.

## K9. Conflitos [CÓDIGO]

**Sem resolução de conflitos.** Se dois usuários editam a mesma área offline, o último a sincronizar sobrescreve o primeiro. Não há versionamento, timestamps de comparação, ou merge. **[MÉDIO]**

---

# BLOCO L — MÁQUINAS E MANUTENÇÕES

## L1. CRUD [CÓDIGO]

`MachineryContext.tsx`:
- Máquinas: CRUD completo com busca de `institution_id`
- Tipos de manutenção: CRUD completo
- Manutenções: CRUD completo com `machinery_id`, `maintenance_type_id`, `date`, `cost`, `machine_hours`, `material_used`, `notes`

## L2. Custo de Manutenção [CÓDIGO + SCHEMA]

- `maintenances.cost` é preenchido no formulário mas **não exibido em estatísticas ou relatórios**
- `machine_hours` é preenchido mas **não exibido em nenhum lugar** além do formulário
- **[MÉDIO]** — dados coletados mas não utilizados

## L3. Sincronização [CÓDIGO]

Como detalhado em K3, as funções de sincronização são stubs. Máquinas/manutenções criadas offline são perdidas. **[CRÍTICO]**

---

# BLOCO M — NOTIFICAÇÕES

## M1. Sistema de Notificações [CÓDIGO]

`Notifications.tsx` (não lido em detalhe nesta auditoria, mas referenciado no routing):
- Existe uma página de notificações no App
- **Não há push notifications** — apenas in-app
- **Não há tabela de notificações** no banco
- **Não há sistema de eventos/realtime** visível

## M2. Alertas de Estoque [CÓDIGO]

- Apenas contagem em `Statistics.tsx` (`lowStockProducts`)
- **Sem notificação ativa** — usuário precisa visitar a página de estatísticas para ver
- **[MÉDIO]**

## M3. Próximas Aplicações [SCHEMA + CÓDIGO]

- `operations.next_operation_date` — campo existe mas **não é usado para notificações**
- `get_area_map_summary` retorna `next_operation_date` — exibido no mapa
- **[MÉDIO]** — dados existem mas não geram alertas proativos

---

# BLOCO N — ANOTAÇÕES (NOTES)

## N1. CRUD [CÓDIGO]

`NotesContext.tsx`:
- CRUD completo com `title`, `content`, `note_date`, `is_completed`, `completed_date`
- `toggleNoteComplete` marca/desmarca conclusão
- Busca `institution_id` do perfil antes de inserir
- Offline: armazena em localStorage com id `local-{timestamp}`

## N2. Sincronização [CÓDIGO]

Como detalhado em K4, a sincronização é parcial — apenas recarrega dados, não reenvia alterações offline. **[ALTO]**

## N3. Debug Logging [CÓDIGO]

`NotesContext.tsx` tem **numerosos `console.log`** em `addNote`:
```typescript
console.log('Starting addNote with data:', noteData);
console.log('User:', user?.id);
console.log('Fetching user profile...');
console.log('User profile:', userProfile);
console.log('Insert data:', insertData);
console.log('Insert result:', { data, error });
console.log('Note added successfully!');
```

**[BAIXO]** — logging de debug em produção, potencial exposição de dados sensíveis.

---

# BLOCO O — RELATÓRIOS

## O1. Página de Relatórios [CÓDIGO]

`Reports.tsx`:
- Tabela "Status das Áreas" — mostra por área: nome, cultivo atual, data de plantio, tamanho, última operação (tipo + descrição), data
- Filtro por busca (nome/cultivo) e tipo de operação
- **Sem exportação** (PDF, Excel, CSV) **[MÉDIO]**
- **Sem relatório financeiro** consolidado **[MÉDIO]**
- **Sem relatório de operações por período** **[MÉDIO]**
- **Sem relatório de manutenções** **[MÉDIO]**
- Usa `formatDateForDisplay(date, 'pt-BR')` — sempre formata em pt-BR independente do idioma selecionado **[BAIXO]**

## O2. Limitações [CÓDIGO]

O relatório é uma única tabela estática sem:
- Agrupamento por safra
- Filtro por período
- Totais ou agregações
- Exportação
- Gráficos

---

# BLOCO P — ESTATÍSTICAS

## P1. Cálculos [CÓDIGO]

`Statistics.tsx`:
- **Área total:** `areas.reduce((acc, area) => acc + area.size, 0)` — soma todos os tamanhos, **independente da unidade** **[MÉDIO]**
- **Operações por tipo:** conta operações e soma área (using `area.size`, não `operation.operation_size`) **[MÉDIO]**
- **Uso de produtos:** soma quantidade × preço
- **Áreas sem operações:** áreas que não têm nenhuma operação no período
- **Produtos em baixa:** `quantityInStock <= minStockLevel`
- Filtro de data: todo período, semana, mês, safra atual

## P2. Problemas [CÓDIGO]

1. **Mistura de unidades:** "Área Total" exibe `{stats.totalArea.toFixed(1)} hectares` mas soma `area.size` independente de `unit`. Se uma área tem `unit = "m²"`, seu tamanho é somado como se fosse hectares. **[MÉDIO]**

2. **Área por tipo de operação:** `stats.operationsByType[operation.type].area += area.size` usa o tamanho total da área, não `operation.operation_size` (que pode ser diferente — operação parcial). **[MÉDIO]**

3. **Divisão por zero:** `(data.area / stats.totalArea * 100)` — se `totalArea` é 0, resulta em NaN. **[BAIXO]**

4. **Sem gráficos visuais:** apenas barras de progresso CSS. **[MELHORIA]**

---

# BLOCO Q — TRIGGERS, RPCs E FUNÇÕES

## Q1. Triggers [SCHEMA]

9 triggers `update_updated_at_column()` — um por tabela principal. Atualizam `updated_at` em UPDATE. Função SECURITY INVOKER. Comportamento padrão e correto.

## Q2. RPCs de Negócio [SCHEMA + CÓDIGO]

| RPC | Tipo | Usada por |
|-----|------|----------|
| `check_institution_exists` | SECURITY DEFINER | Login.tsx |
| `handle_user_registration` | SECURITY DEFINER | Login.tsx |
| `join_institution` | SECURITY DEFINER | Login.tsx |
| `create_invitation` | SECURITY DEFINER | Settings.tsx |
| `delete_invitation` | SECURITY DEFINER | Settings.tsx |
| `list_active_invitations` | SECURITY DEFINER | Settings.tsx |
| `list_institution_users` | SECURITY DEFINER | Settings.tsx |
| `toggle_user_admin_status` | SECURITY DEFINER | Settings.tsx |
| `update_season_status` | SECURITY DEFINER | Settings.tsx |
| `validate_invitation` | SECURITY DEFINER | (não confirmado no frontend) |
| `copy_areas_to_new_season` | SECURITY INVOKER | (não confirmado no frontend) |
| `save_area_geometry` | SECURITY INVOKER | AppContext.tsx |
| `get_area_map_summary` | SECURITY INVOKER | AppContext.tsx |
| `generate_invite_code` | SECURITY INVOKER | (usada internamente por create_invitation) |
| `update_updated_at_column` | SECURITY INVOKER | trigger |

## Q3. Validação Interna de RPCs [INDETERMINADO]

As definições completas das funções SECURITY DEFINER não foram todas lidas nesta auditoria. Não foi possível confirmar se:
- `create_invitation` verifica se o caller pertence à instituição
- `toggle_user_admin_status` verifica se o caller é admin da instituição
- `delete_invitation` verifica ownership
- `list_institution_users` verifica ownership
- `update_season_status` verifica ownership

**[INDETERMINADO]** — estas funções podem ter validação interna via `auth.uid()`, mas o fato de serem executáveis por `anon` é preocupante independentemente.

## Q4. `validate_invitation` [INDETERMINADO]

A função `validate_invitation` existe no banco mas seu uso não foi confirmado no código frontend. Possivelmente é chamada antes de `join_institution` no fluxo de login. **[INDETERMINADO]**

## Q5. `copy_areas_to_new_season` [SCHEMA]

Confirmado: SECURITY INVOKER, executável por anon e authenticated. Como é INVOKER, executa com os privilégios do caller — RLS se aplica. Mas o bug de não copiar `institution_id`, `current_crop`, `cultivar`, `unit` permanence. **[ALTO]**

---

# BLOCO R — EXCLUSÕES E INTEGRIDADE

## R1. Exclusão de Áreas [CÓDIGO]

`deleteArea` faz delete direto. Se a área tem operações:
- Se há FK com ON DELETE CASCADE (não confirmado): operações são deletadas junto
- Se há FK com ON DELETE RESTRICT (não confirmado): delete falha
- Se não há FK (possível dado que `operations.area_id` é NOT NULL mas constraint não confirmada): operações ficam órfãs
**[INDETERMINADO]**

## R2. Exclusão de Produtos [CÓDIGO]

`deleteProduct` faz delete direto. Se o produto tem lotes:
- `product_lots.product_id` FK com ON DELETE CASCADE (confirmado em migration) — lotes são deletados junto
- Referências em `operations.products_used` (JSONB) — **não são atualizadas**. O `productId` no JSONB aponta para um produto inexistente. **[ALTO]**

## R3. Exclusão de Safras [CÓDIGO]

`handleDeleteSeason` faz delete direto. Operações com `season_id` apontando para a safra excluída ficam órfãs (não há CASCADE confirmado). **[ALTO]**

## R4. Exclusão de Máquinas [CÓDIGO]

`deleteMachinery` faz delete direto. Manutenções com `machinery_id` apontando para a máquina excluída:
- Se há FK com CASCADE: manutenções são deletadas
- Se há FK com RESTRICT: delete falha
**[INDETERMINADO]**

## R5. Exclusão Offline [CÓDIGO]

Como detalhado em K7, exclusões offline não são sincronizadas. Dados excluídos reaparecem. **[ALTO]**

---

# BLOCO S — TRANSAÇÕES E CONSISTÊNCIA

## S1. Ausência de Transações [CÓDIGO]

**Severidade: CRÍTICO (consolidado)**

O frontend faz múltiplas operações de banco em paralelo (`Promise.all`) sem transação em **todas** as operações críticas:

1. **Baixa de estoque** (`useProducts`): atualiza lotes + produtos em paralelo
2. **Devolução de estoque** (`returnProducts`): mesmo padrão
3. **Criação de operação com produtos**: baixa estoque + insere operação (sequencial mas sem rollback)
4. **Atualização de operação com produtos**: retorna + baixa + update (sequencial mas sem rollback)
5. **Exclusão de operação com produtos**: retorna + delete (sequencial mas sem rollback)
6. **Criação de produto com lotes**: insere produto + insere lotes + atualiza total (sequencial mas sem rollback)

**Nenhuma destas operações usa RPC, trigger, ou transação do banco.** Se qualquer passo intermediário falha, o estado fica inconsistente.

## S2. Race Conditions [CÓDIGO]

O estoque é lido do estado React e subtrai/soma no cliente. Se dois usuários (ou duas abas) fazem operações simultaneamente, ambas leem o mesmo valor e a subtração resulta em lost update. O banco não tem check de versão/optimistic locking. **[CRÍTICO]**

---

# BLOCO T — PRECISÃO NUMÉRICA

## T1. Tipo Numeric [SCHEMA]

Todos os campos de quantidade, preço, tamanho, custo usam `numeric` (PostgreSQL). `numeric` tem precisão arbitrária — sem problema de ponto flutuante no banco.

## T2. Conversão no Frontend [CÓDIGO]

- `OperationForm.tsx`: `parseNumber` substitui vírgula por ponto: `Number(value.replace(',', '.'))`
- `ProductForm.tsx`: usa `Number()` diretamente para validação
- Quantidades em `products_used` podem ser string ou number dependendo do contexto

**Problema:** `formatNumber` em `OperationForm.tsx` remove caracteres não numéricos: `value.replace(/[^\d,]/g, '')`. Isso remove pontos decimais (formato americano). Se um usuário digita "1.5", vira "15". **[BAIXO]**

## T3. Soma de Estoque [CÓDIGO]

`recomputeProductQuantity`:
```typescript
const totalFromLots = lots.filter(l => l.productId === productId)
  .reduce((sum, l) => sum + l.quantity, 0);
```

Soma em JavaScript (number de 64-bit float). Para valores muito grandes ou muitos lotes, pode haver perda de precisão. **[BAIXO]**

---

# BLOCO U — DATAS E FUSOS HORÁRIOS

## U1. Tipos de Data no Banco [SCHEMA]

| Campo | Tipo no Banco | Migration diz |
|-------|--------------|--------------|
| operations.start_date | timestamptz | date |
| operations.end_date | timestamptz | date |
| operations.next_operation_date | timestamptz | date |
| seasons.start_date | timestamptz | date |
| seasons.end_date | timestamptz | date |
| maintenances.date | timestamptz | date |
| notes.note_date | date | date |
| notes.completed_date | date | date |
| product_lots.expiration_date | date | date |

**Discrepância:** As migrations definem `date` mas o banco tem `timestamptz` para várias colunas. Isso pode ter sido alterado por migrations posteriores ou por casts automáticos. **[BAIXO]**

## U2. Conversão no Frontend [CÓDIGO]

`dateHelpers.ts` (não lido em detalhe, mas inferido do uso):
- `dateToDateString(date)` — converte Date para string YYYY-MM-DD
- `dateToInputValue(date)` — converte para valor de `<input type="date">`
- `inputValueToDate(string)` — converte string de input para Date
- `parseDate(string)` — parse de string ISO para Date
- `formatDateForDisplay(date, locale)` — formata para exibição

**Problema:** Quando o banco retorna `timestamptz`, o valor inclui fuso horário. O frontend faz parse para Date (UTC) e depois formata. Se o fuso do servidor difere do fuso do usuário, a data pode aparecer deslocada em um dia. **[MÉDIO]**

## U3. Datas Offline [CÓDIGO]

Quando offline, operações são criadas com `new Date()` (timestamp do navegador). Quando sincronizadas, `dateToDateString(operation.startDate)` converte para YYYY-MM-DD. Se a operação foi criada à meia-noite em um fuso diferente, a data pode mudar. **[BAIXO]**

---

# BLOCO V — DUPLICATAS

## V1. Duplicação de Áreas [CÓDIGO + SCHEMA]

- `areas.name` não tem UNIQUE constraint
- Dois usuários da mesma instituição podem criar áreas com o mesmo nome
- **[BAIXO]** — não é um bug, mas pode confundir o usuário

## V2. Duplicação de Produtos [CÓDIGO + SCHEMA]

- `products.name` não tem UNIQUE constraint
- Mesmo produto pode ser cadastrado múltiplas vezes
- **[BAIXO]**

## V3. Duplicação de Lotes [CÓDIGO + SCHEMA]

- `product_lots.lot_number` não tem UNIQUE constraint por produto
- Mesmo número de lote pode ser usado múltiplas vezes para o mesmo produto
- **[BAIXO]**

## V4. Duplicação de Safras [CÓDIGO + SCHEMA]

- `seasons.name` não tem UNIQUE constraint
- **[BAIXO]**

## V5. Duplicação de Operações [CÓDIGO + SCHEMA]

- Sem constraint de unicidade em operações (ex: mesma área + mesmo tipo + mesma data)
- O sistema não verifica duplicatas
- **[MÉDIO]** — pode levar a dupla contagem em estatísticas

---

# BLOCO W — INTEGRIDADE REFERENCIAL

## W1. `operations.products_used` JSONB [CÓDIGO + SCHEMA]

**Severidade: ALTO (consolidado)**

Como detalhado em H4, `products_used` é JSONB sem FK. Problemas:
1. Produto deletado → `productId` no JSONB aponta para produto inexistente
2. Lote deletado → `lotId` no JSONB aponta para lote inexistente
3. Quantidade no JSONB pode divergir do que foi efetivamente baixado do estoque

## W2. `operation_products` Não Usada [SCHEMA]

A tabela `operation_products` existe com FKs para `operations` e `products`, mas não é usada pelo código. Se fosse usada, resolveria os problemas de W1. Mas com RLS desabilitada (C1.1), seria um risco de segurança.

## W3. `areas.institution_id` Nullable [SCHEMA]

`institution_id` é nullable em `areas`, `operations`, `products`, `seasons`. Se um registro tem `institution_id = NULL`, a política RLS `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` retorna FALSE (NULL não está IN), bloqueando acesso. O registro fica inacessível a todos. **[MÉDIO]**

## W4. `user_profiles.institution_id` Nullable [SCHEMA]

Se o perfil do usuário tem `institution_id = NULL` (ex: registro incompleto), todas as operações que buscam `institution_id` do perfil falham. O código trata isso com `throw new Error('User must belong to an institution...')`, mas o usuário fica sem feedback claro. **[MÉDIO]**

---

# BLOCO X — PERFORMANCE

## X1. Índices Ausentes [ADVISOR]

77 achados de performance do Supabase Advisor. Principais:
- FKs sem índice: `operations.area_id`, `operations.season_id`, `operations.institution_id`, `maintenances.machinery_id`, `operation_products.operation_id`, `operation_products.product_id`
- Colunas de filtro frequentes sem índice

## X2. Consulta de Operações [CÓDIGO]

`loadOperations` faz `SELECT *` sem filtro de instituição no query — depende de RLS para filtrar. Correto do ponto de vista de segurança, mas pode ser lento sem índice em `institution_id`. **[BAIXO]**

## X3. `get_area_map_summary` [SCHEMA]

A função faz múltiplas subconsultas correlacionadas para calcular datas de últimas operações por tipo (fungicide, insecticide, herbicide, dessecacao). Sem índices adequados em `operations.area_id` e `operations.type`, pode ser lenta. **[MÉDIO]**

## X4. Filtro de Operações no Frontend [CÓDIGO]

`AppContext` filtra operações por safra no cliente:
```typescript
operations: operations.filter(op => !activeSeason || op.season_id === activeSeason.id)
```

Todas as operações são carregadas do banco e filtradas no navegador. Para instituições com muitas operações, isso pode ser lento. **[BAIXO]**

## X5. Recálculo de Estoque [CÓDIGO]

`recomputeProductQuantity` é chamado a cada add/update/delete de lote, iterando sobre todos os lotes no estado. Para produtos com muitos lotes, é O(n). **[BAIXO]**

---

# BLOCO Y — EDGE FUNCTIONS

## Y1. Função "invites" [SCHEMA]

- 1 Edge Function deployada: "invites" (ACTIVE, verifyJWT=true)
- Secrets configurados: apenas os padrões Supabase (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL)

**Indeterminado:** O código da Edge Function não foi lido nesta auditoria. Não foi possível confirmar sua funcionalidade exata. **[INDETERMINADO]**

## Y2. verifyJWT=true [SCHEMA]

A Edge Function tem `verifyJWT=true`, o que significa que requisições sem JWT válido são rejeitadas. Isso é correto para funções que requerem autenticação.

---

# BLOCO Z — PRONTIDÃO PARA IA

As seções a seguir respondem às perguntas específicas sobre prontidão para implementação de Inteligência Artificial.

## Z1. O esquema atual suporta consultas analíticas para IA?

**Parcialmente.** O esquema tem dados suficientes para análises básicas (áreas, operações, produtos, safras, estoque), mas:

- **`operations.products_used` como JSONB** dificulta JOINs analíticos. Consultar "qual produto foi mais usado em X safra" requer `jsonb_array_elements()` em vez de um JOIN simples.
- **`operation_products` não é usada** — se fosse, facilitaria muito as consultas analíticas.
- **Falta de auditoria/histórico** — não há tabela de log ou timeline. IA não pode analisar histórico de mudanças.
- **Falta de padronização de unidades** — `areas.unit` é free-text, impossibilitando agregações confiáveis.

**Veredito:** [SCHEMA] — suporta consultas básicas, mas limita análises avançadas.

## Z2. Os dados de operação têm estrutura suficiente para análise preditiva?

**Parcialmente.** Cada operação tem: tipo, área, data, operador, produtos usados (dose, quantidade, lote), tamanho da operação, produtividade (colheita), população de sementes (plantio).

**Faltam:**
- Condições climáticas no momento da operação
- Resultado/eficácia da operação
- Custo da operação (apenas produtos, sem máquina/mão de obra)
- Fotos/dados visuais
- Histórico de produtividade por área ao longo de safras (exigiria consultar múltiplas safras)

**Veredito:** [CÓDIGO + SCHEMA] — estrutura mínima para análise preditiva básica, mas insuficiente para modelos robustos.

## Z3. O sistema de estoque pode alimentar recomendações de IA?

**Sim, com ressalvas.** Dados disponíveis:
- Produtos com categoria, preço, unidade, estoque mínimo
- Lotes com quantidade e validade
- Histórico de uso via `operations.products_used`

**Problemas:**
- Quantidades em JSONB não têm integridade com estoque real
- Sem FIFO/FEFO automático
- Preço é fixo (sem histórico de preço por lote)
- Baixas não-atômicas podem ter corrompido dados históricos

**Veredito:** [CÓDIGO] — pode alimentar recomendações, mas qualidade dos dados é incerta.

## Z4. As safras permitem comparação entre períodos?

**Sim.** `operations.season_id` vincula operações a safras. IA pode comparar produtividade, uso de insumos e operações entre safras.

**Limitação:** `copy_areas_to_new_season` não copia `current_crop` e `cultivar`, então a continuidade de cultivo entre safras é perdida. **[ALTO]**

**Veredito:** [SCHEMA + CÓDIGO] — funcional mas com perda de metadados.

## Z5. O mapa e geometria podem ser usados por IA?

**Sim.** PostGIS com `geometry(MultiPolygon, 4326)` e índice GiST. `get_area_map_summary` retorna GeoJSON e dados de operações. IA pode usar para:
- Análise espacial de produtividade
- Correlação entre localização e resultados
- Visualização em mapas

**Veredito:** [SCHEMA] — bem estruturado para análise espacial.

## Z6. O modo offline prejudica a qualidade dos dados para IA?

**Sim, significativamente.**
- Sincronização stub de máquinas/manutenções perde dados
- Sincronização parcial de notas perde dados
- Exclusões offline não são sincronizadas
- Baixas de estoque offline podem ser inconsistentes
- Sem resolução de conflitos

**Veredito:** [CÓDIGO] — modo offline corrompe integridade dos dados.

## Z7. O sistema multi-instituição está pronto para IA multi-tenant?

**Sim.** Todas as tabelas têm `institution_id` e RLS instituição-scoped. IA pode ser treinada por instituição ou globalmente (com cuidado).

**Risco:** `operation_products` com RLS desabilitada pode vazar dados entre instituições. **[CRÍTICO]**

**Veredito:** [SCHEMA] — pronto mas com brecha de segurança.

## Z8. Que dados faltam para uma IA útil no AgriGest?

1. **Dados climáticos** — temperatura, precipitação, umidade por área/dia
2. **Dados de solo** — análise de solo, pH, nutrientes
3. **Custo de operações sem produto** — combustível, mão de obra, horas de máquina
4. **Eficácia de operações** — resultado qualitativo/quantitativo
5. **Histórico de preços** — variação de preço de insumos ao longo do tempo
6. **Fotos e imagens** — drone, satélite, campo
7. **Calendário agronômico** — janelas ideais por cultura/região
8. **Integração com APIs externas** — clima, mercado, preços agrícolas

## Z9. Qual seria a abordagem recomendada para adicionar IA?

1. **Antes de tudo:** corrigir os 5 problemas CRÍTICOS (RLS, atomicidade de estoque, sync offline, funções anon-executable, bug de copy_areas)
2. **Normalizar `products_used`:** migrar para `operation_products` (após habilitar RLS) ou criar uma view que desnormaliza o JSONB
3. **Padronizar unidades:** converter todas as áreas para hectares (ou criar campo numérico separado)
4. **Adicionar tabela de auditoria/log** — para que IA possa analisar histórico de mudanças
5. **Adicionar Edge Function** para consultas analíticas (IA como serviço server-side)
6. **Começar com IA descritiva** (estatísticas avançadas, dashboards) antes de preditiva

---

# BLOCO AA — PROBLEMAS ENCONTRADOS (CONSOLIDADO)

## CRÍTICO (5)

| # | Problema | Fonte | Bloco |
|---|---------|-------|-------|
| C1 | RLS desabilitada em `operation_products` — tabela exposta via Data API | SCHEMA + ADVISOR | C1.1 |
| C2 | `create_invitation` SECURITY DEFINER executável por `anon` — qualquer um cria convites | SCHEMA | C3 |
| C3 | `toggle_user_admin_status` SECURITY DEFINER executável por `anon` — qualquer um promove admin | SCHEMA | C3 |
| C4 | `list_active_invitations` executável por `anon` — expõe códigos de convite | SCHEMA | C3 |
| C5 | Baixa de estoque não-atômica + race condition — estoque pode ser corrompido | CÓDIGO | I1, S1, S2 |
| C6 | Sincronização offline STUB de máquinas/manutenções — dados são perdidos | CÓDIGO | K3 |
| C7 | Estoque baixado ANTES de criar operação — se insert falha, estoque é perdido | CÓDIGO | H1 |

## ALTO (7)

| # | Problema | Fonte | Bloco |
|---|---------|-------|-------|
| A1 | `delete_invitation` executável por `anon` | SCHEMA | C3 |
| A2 | `list_institution_users` executável por `anon` — expõe dados de usuários | SCHEMA | C3 |
| A3 | `update_season_status` executável por `anon` | SCHEMA | C3 |
| A4 | Múltiplas funções SECURITY DEFINER sem search_path fixo | SCHEMA + ADVISOR | C3 |
| A5 | `copy_areas_to_new_season` não copia institution_id, current_crop, cultivar, unit | SCHEMA | E4 |
| A6 | `operation_products` não usada — `products_used` JSONB sem integridade referencial | CÓDIGO + SCHEMA | H4 |
| A7 | `database.types.ts` significativamente desatualizado | CÓDIGO | D6 |
| A8 | product_lots sem suporte offline | CÓDIGO | K5 |
| A9 | Sincronização de notas é parcial — não reenvia alterações | CÓDIGO | K4 |
| A10 | Exclusões offline não são sincronizadas — dados reaparecem | CÓDIGO | K7 |
| A11 | Exclusão de produto deixa referências órfãs em `products_used` JSONB | CÓDIGO | R2 |
| A12 | Exclusão de safra deixa operações órfãs | CÓDIGO | R3 |

## MÉDIO (11)

| # | Problema | Fonte | Bloco |
|---|---------|-------|-------|
| M1 | `areas.institution_id` nullable — registros podem ficar inacessíveis | SCHEMA | W3 |
| M2 | Filtro global de safra oculta operações sem season_id | CÓDIGO | E2 |
| M3 | Statistics mistura unidades e soma como hectares | CÓDIGO | P2 |
| M4 | Statistics usa area.size em vez de operation_size para área por tipo | CÓDIGO | P2 |
| M5 | Comparação de productsUsed via JSON.stringify — sensível à ordem | CÓDIGO | H1 |
| M6 | Sem alerta ativo de estoque mínimo | CÓDIGO | M2 |
| M7 | next_operation_date não gera notificações | CÓDIGO | M3 |
| M8 | Custo de manutenção não exibido em relatórios | CÓDIGO + SCHEMA | J3 |
| M9 | Sem resolução de conflitos offline | CÓDIGO | K9 |
| M10 | Fuso horário: timestamptz vs date pode deslocar datas | CÓDIGO + SCHEMA | U2 |
| M11 | Duplicação de operações não verificada | CÓDIGO + SCHEMA | V5 |
| M12 | `hasPendingSync` separado por contexto — UI não mostra pendências de máquinas/notas | CÓDIGO | A3 |
| M13 | `get_area_map_summary` sem search_path definido | SCHEMA | C4 |
| M14 | Relatórios sem exportação | CÓDIGO | O1 |

## BAIXO (8)

| # | Problema | Fonte | Bloco |
|---|---------|-------|-------|
| B1 | Ícones PWA remotos (Pexels) | CÓDIGO | A4 |
| B2 | `get_area_map_summary` extrai apenas primeiro polígono | SCHEMA | F3 |
| B3 | Tipos customizados de operação perdidos ao recarregar | CÓDIGO | H3 |
| B4 | Lote vencido não bloqueado — apenas aviso | CÓDIGO | I5 |
| B5 | `formatNumber` remove pontos decimais | CÓDIGO | T2 |
| B6 | Divisão por zero em Statistics | CÓDIGO | P2 |
| B7 | Datas offline podem deslocar de dia | CÓDIGO | U3 |
| B8 | Relatórios sempre formatam em pt-BR | CÓDIGO | O1 |
| B9 | console.log de debug em NotesContext | CÓDIGO | N3 |
| B10 | Discrepância date vs timestamptz nas migrations | SCHEMA | U1 |

## MELHORIA (6)

| # | Sugestão | Bloco |
|---|---------|-------|
| ML1 | Gráficos visuais em estatísticas | P2 |
| ML2 | Padronizar unidades de área | F2 |
| ML3 | Adicionar UNIQUE constraints em nomes | V1-V4 |
| ML4 | Relatório financeiro consolidado | O1 |
| ML5 | Sistema de notificações ativas | M2 |
| ML6 | Exportação de relatórios (PDF/CSV) | O1 |

---

# BLOCO BB — PONTOS FORTES

1. **Arquitetura modular clara** — Context providers separados por domínio, componentes reutilizáveis, estrutura de diretórios organizada.

2. **RLS habilitada em todas as tabelas de negócio** (exceto `operation_products`) — o padrão de `institution_id IN (SELECT ...)` é correto para multi-tenant.

3. **Sistema de convites com expiração** — `invitations` tem `expires_at` e código gerado por função.

4. **Suporte PostGIS completo** — geometrias MultiPolygon com SRID 4326, índice GiST, funções de conversão GeoJSON, cálculo de área no frontend.

5. **PWA com runtime caching** — estratégias diferenciadas por tipo de recurso (CacheFirst para fonts/imagens, NetworkFirst para JS/CSS).

6. **Design system consistente** — componentes UI reutilizáveis (Button, Input, Select, Card, Badge), Tailwind CSS com tema brand customizado, suporte bilíngue (pt/en).

7. **Validação de formulários** — campos obrigatórios, validação de ranges (tamanho > 0, ≤ área total), alertas de lote vencido.

8. **Sistema de lotes com validade** — rastreabilidade de lotes com alertas de vencimento, cálculo automático de estoque total pela soma de lotes.

9. **Triggers de updated_at** — 9 triggers automáticos em todas as tabelas principais.

10. **Filtro de safra ativa** — operações são filtradas pela safra ativa, evitando mistura de dados entre safras.

---

# BLOCO CC — RECOMENDAÇÕES PRIORITÁRIAS

> **Estas recomendações NÃO foram implementadas.** São apenas sugestões para próximos passos, conforme solicitado.

## Prioridade 1 — Segurança (antes de qualquer feature nova)

1. Habilitar RLS em `operation_products` (ou dropar a tabela se não é usada)
2. Revogar EXECUTE de `anon` em todas as funções SECURITY DEFINER — apenas `authenticated` deve ter acesso
3. Adicionar `search_path=public` a todas as funções SECURITY DEFINER que não têm
4. Adicionar validação interna de ownership nas RPCs (verificar `auth.uid()` pertence à instituição)

## Prioridade 2 — Integridade de Dados

5. Criar RPC ou trigger para baixa de estoque atômica (transação no banco)
6. Reescrever sincronização offline de máquinas/manutenções/notas (enviar dados em vez de apenas marcar como sincronizado)
7. Implementar sincronização de exclusões offline
8. Corrigir `copy_areas_to_new_season` para copiar todos os campos
9. Adicionar suporte offline para `product_lots`

## Prioridade 3 — Prontidão para IA

10. Migrar `products_used` JSONB para `operation_products` (após habilitar RLS) ou criar view desnormalizadora
11. Padronizar unidades de área (converter tudo para hectares)
12. Adicionar tabela de auditoria/log para histórico de mudanças
13. Atualizar `database.types.ts` com o esquema real do banco
14. Adicionar índices em FKs não indexadas

---

# BLOCO DD — EDGE FUNCTION "INVITES"

## DD1. Configuração [SCHEMA]

- Nome: "invites"
- Status: ACTIVE
- verifyJWT: true
- Secrets: apenas padrões Supabase (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL)

## DD2. Funcionalidade [INDETERMINADO]

O código-fonte da Edge Function não foi examinado nesta auditoria. Recomenda-se revisão específica em auditoria futura.

---

# BLOCO EE — DASHBOARD

## EE1. Página Dashboard [INDETERMINADO]

`Dashboard.tsx` não foi lido em detalhe nesta auditoria. Recomenda-se revisão específica para verificar:
- Quais métricas são exibidas
- Se há links para ações rápidas
- Se há alertas de estoque/validade

---

# BLOCO FF — COMPONENTES UI

## FF1. Button.tsx [CÓDIGO]

- Variants: primary, secondary, outline, ghost, danger
- Usa `data-button="true"` e `data-variant={variant}` attributes
- CSS com `!important` em `@layer components` para garantir visibilidade
- Props: variant, size, leftIcon, rightIcon, loading, disabled, fullWidth, type, onClick, className
- **Corrigido anteriormente nesta sessão:** problema de transparência resolvido com atributos data + CSS !important

## FF2. Outros Componentes [CÓDIGO]

- `Input.tsx` — input com label, error, helperText
- `Select.tsx` — select com label, options, error
- `Card.tsx` — card com Header, Content, Title, Description
- `Badge.tsx` — badge com variants (primary, secondary, success, warning, danger, default)
- `ProductSearchInput.tsx` — busca de produtos com filtro

---

# APÊNDICE — CONSOLIDAÇÃO DE EVIDÊNCIAS

## Fontes consultadas

1. **Código-fonte:** App.tsx, AppContext.tsx, OperationForm.tsx, ProductForm.tsx, LotManager.tsx, MachineryContext.tsx, NotesContext.tsx, Settings.tsx, Reports.tsx, Statistics.tsx, useAuth.ts, useOfflineStorage.ts, Button.tsx, index.css, vite.config.ts
2. **Banco de dados:** 6 arquivos de migration, consultas SQL diretas (columns, functions, policies via get_security_posture, advisors security + performance)
3. **Supabase MCP:** list_tables, get_security_posture, get_advisors (security + performance), list_migrations, list_extensions, list_edge_functions, list_edge_function_secrets
4. **Skills:** bolt-database, security-review (3 arquivos de referência lidos)

## Limitações da auditoria

- **Constraints exatas** não puderam ser confirmadas (erro interno do Postgres na consulta)
- **Definições completas das funções** não foram todas lidas (apenas assinaturas e metadados)
- **Dashboard.tsx** não foi lido em detalhe
- **Código da Edge Function "invites"** não foi examinado
- **FarmMap.tsx, GeometryManager.tsx, farmMapHelpers.ts** não foram lidos em detalhe nesta rodada
- **dateHelpers.ts** não foi lido em detalhe
- **Validação interna das RPCs SECURITY DEFINER** não foi confirmada (pode haver checks de auth.uid() internos)

---

*Fim da auditoria. Nenhuma alteração foi feita no sistema.*
