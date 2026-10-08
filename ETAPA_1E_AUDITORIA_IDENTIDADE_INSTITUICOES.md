# ETAPA 1E — AUDITORIA DE IDENTIDADE, INSTITUIÇÕES E AUTENTICAÇÃO
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**MODO:** READ-ONLY ABSOLUTO. Nenhuma migration, ALTER, UPDATE, DELETE, INSERT, CREATE, DROP, GRANT ou REVOKE foi executada. Nenhum arquivo frontend foi modificado.

---

## A. BASELINE (SENTINELAS READ-ONLY)

| Tabela | Contagem |
|---|---|
| areas | 44 |
| operations | 309 |
| products | 217 |
| product_lots | 149 |
| seasons | 5 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |
| notes | 8 |
| institutions | 6 |
| user_profiles | 6 |
| invitations | 7 |

| Sentinela | Valor |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

**Nota sobre 501 productIds inválidos:** Este número é idêntico ao da Etapa 1C. Indica que 501 referências em `operations.products_used` apontam para produtos que não existem mais na tabela `products`. Isso é um problema pré-existente de integridade referencial dentro do JSONB, não causado por esta auditoria. As FKs RESTRICT das Etapas 1B-1D não permitem mais que novos órfãos sejam criados via DELETE de produtos, mas os órfãos históricos dentro do JSONB permanecem.

**Estado das 28 FKs (confirmado inalterado):**

| ON DELETE | Quantidade |
|---|---|
| CASCADE | 20 |
| RESTRICT | 5 |
| SET NULL | 3 |
| **Total** | **28** |

Nenhuma sentinela foi alterada nesta etapa.

---

## B. AUTH USERS

| Métrica | Valor |
|---|---|
| COUNT auth.users | 6 |

**Usuários (emails mascarados):**

| ID (prefixo) | Email (mascarado) | Criado em |
|---|---|---|
| 470c400e... | f***@gmail.com | (mais antigo) |
| ca7e7323... | d***1@gmail.com | |
| cc8adbd5... | d***1996@gmail.com | |
| 76658ac9... | f***@gmail.com | |
| c046dfb3... | a***7@gmail.com | |
| b5ddba4c... | s***12@gmail.com | |

---

## C. USER PROFILES

| Métrica | Valor |
|---|---|
| COUNT user_profiles | 6 |
| auth.users sem user_profile | 0 |
| user_profiles sem auth.users | 0 |
| institution_id NULL | 0 |
| role NULL | 0 |
| is_admin NULL | 0 |
| IDs duplicados | 0 |

**Relação auth.users ↔ user_profiles:** É 1:1. A FK `user_profiles_id_fkey` usa `auth.users(id) ON DELETE CASCADE`. Não há orphans em nenhuma direção.

**Colunas de user_profiles:**

| Coluna | Tipo | Nullable |
|---|---|---|
| id | uuid | NOT NULL (FK → auth.users.id) |
| phone | text | YES |
| role | text | NOT NULL |
| institution | text | NOT NULL |
| created_at | timestamptz | YES |
| updated_at | timestamptz | YES |
| first_name | text | NOT NULL |
| last_name | text | NOT NULL |
| institution_id | uuid | YES (FK → institutions.id) |
| is_admin | boolean | YES |
| email | text | YES |

**Valores distintos de role:**

| Role | Quantidade |
|---|---|
| (vazio) | 1 |
| Agronomo | 3 |
| Gerente | 1 |
| Proprietário | 1 |

**Admins por instituição:**

| Instituição | Admins |
|---|---|
| b610d2 | 0 |
| Faz. São Pedro | 1 |
| Girassol | 0 |
| Grupo Delatorre | 4 |
| Sao Joao | 0 |
| sao pedro | 0 |

**Observação:** A instituição "Faz. São Pedro" tem 2 perfis mas apenas 1 admin. "Grupo Delatorre" tem 4 perfis e 4 admins (todos são admin). As 4 instituições vazias (b610d2, Girassol, Sao Joao, sao pedro) têm 0 perfis e 0 admins.

---

## D. INSTITUTIONS

| ID (prefixo) | Nome | created_by | Profiles | Auth Users | Áreas | Safras | Operações | Produtos | Lotes | Máquinas | Tipos Manut. | Manuts. | Notas | Convites |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 6786a67a... | b610d2 | null | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 741ba2ae... | Faz. São Pedro | 76658ac9... | 2 | 2 | 18 | 2 | 108 | 29 | 12 | 15 | 1 | 2 | 0 | 1 |
| b380c711... | Girassol | null | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| e8741889... | Grupo Delatorre | null | 4 | 4 | 26 | 3 | 201 | 188 | 137 | 4 | 1 | 1 | 8 | 5 |
| 07561cfd... | Sao Joao | null | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 0e0efe43... | sao pedro | null | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**Observações:**
- Apenas 2 instituições têm dados: "Grupo Delatorre" (a maior, com 201 operações) e "Faz. São Pedro".
- 4 instituições estão vazias (0 dados em todas as tabelas). Provavelmente são instituições de teste ou criadas por engano.
- `created_by` é NULL para 5 das 6 instituições. Apenas "Faz. São Pedro" tem `created_by` preenchido (usuário 76658ac9... = fabricio.grupodelatorre). Isso ocorre porque `institutions.created_by` tem `ON DELETE SET NULL`, e o usuário que criou essas instituições pode ter sido removido do Auth, ou o `created_by` nunca foi definido (a função `handle_user_registration` define `created_by = user_id`, mas as instituições criadas antes dessa função podem não ter o campo).

---

## E. MEMBERSHIP / MODELO DE ASSOCIAÇÃO

### Resposta definitiva: 1 usuário → 1 instituição

**Evidência pelo schema:**

1. `user_profiles` tem uma única coluna `institution_id` (uuid, FK → institutions.id). Não é um array, não é uma tabela de junção.
2. Não existe nenhuma tabela de junção (membership, user_institution, institution_user, organization, company, tenant) no schema. A busca por `information_schema.tables` retornou apenas `user_profiles` como tabela relacionada a perfil/instituição.
3. A função `join_institution` faz `INSERT INTO user_profiles ... ON CONFLICT (id) DO UPDATE SET institution_id = EXCLUDED.institution_id` — ou seja, ao aceitar um convite para uma nova instituição, o `institution_id` do usuário é **sobrescrito**, não adicionado. O usuário perde a associação com a instituição anterior.
4. A política RLS de `institutions` para INSERT verifica que o usuário NÃO tem `institution_id` (`NOT EXISTS (... user_profiles.institution_id IS NOT NULL)`) — ou seja, só pode criar uma instituição se ainda não pertence a nenhuma.
5. O frontend não tem nenhum seletor/troca de instituição. `AppContext` carrega um único `institutionId` do perfil.

**Conclusão:** O modelo é estritamente 1 usuário → 1 instituição. Não há como um usuário pertencer a múltiplas instituições simultaneamente. Aceitar um convite para uma nova instituição troca a associação, não adiciona.

### institution_id é a fonte real?

Sim. `user_profiles.institution_id` é a única fonte de associação usuário ↔ instituição. Todas as policies RLS, todas as funções, e todo o frontend consultam `user_profiles.institution_id` para determinar a qual instituição um usuário pertence. O JWT não contém `institution_id`. O `user_metadata` no Auth contém apenas `first_name`, `last_name`, `phone`, `role` — nunca `institution_id`.

### Outras estruturas que determinam instituição?

Não. A busca no schema inteiro não encontrou views, funções, RPCs ou tabelas adicionais que definam associação usuário ↔ instituição além de `user_profiles.institution_id`.

---

## F. FKs ENVOLVENDO auth.users(id)

### FKs no schema public (tabelas de negócio):

| Tabela | Coluna | Constraint | ON DELETE | Classificação |
|---|---|---|---|---|
| user_profiles | id | user_profiles_id_fkey | CASCADE | IDENTIDADE |
| areas | user_id | areas_user_id_fkey | CASCADE | AUTORIA |
| seasons | user_id | seasons_user_id_fkey | CASCADE | AUTORIA |
| operations | user_id | operations_user_id_fkey | CASCADE | AUTORIA |
| machinery | user_id | machinery_user_id_fkey | CASCADE | AUTORIA |
| maintenance_types | user_id | maintenance_types_user_id_fkey | CASCADE | AUTORIA |
| maintenances | user_id | maintenances_user_id_fkey | CASCADE | AUTORIA |
| notes | user_id | notes_user_id_fkey | CASCADE | AUTORIA |
| institutions | created_by | institutions_created_by_fkey | SET NULL | AUTORIA |
| invitations | created_by | invitations_created_by_fkey | SET NULL | AUTORIA |
| invitations | used_by | invitations_used_by_fkey | SET NULL | HISTÓRICO |

### FKs no schema auth (Supabase interno):

| Tabela | Coluna | Constraint | ON DELETE | Classificação |
|---|---|---|---|---|
| auth.identities | user_id | identities_user_id_fkey | CASCADE | IDENTIDADE |
| auth.sessions | user_id | sessions_user_id_fkey | CASCADE | IDENTIDADE |
| auth.mfa_factors | user_id | mfa_factors_user_id_fkey | CASCADE | IDENTIDADE |
| auth.mfa_recovery_code_sets | user_id | mfa_recovery_code_sets_user_id_fkey | CASCADE | IDENTIDADE |
| auth.oauth_authorizations | user_id | oauth_authorizations_user_id_fkey | CASCADE | IDENTIDADE |
| auth.oauth_consents | user_id | oauth_consents_user_id_fkey | CASCADE | IDENTIDADE |
| auth.one_time_tokens | user_id | one_time_tokens_user_id_fkey | CASCADE | IDENTIDADE |
| auth.scim_users | user_id | scim_users_user_id_fkey | SET NULL | IDENTIDADE |
| auth.webauthn_challenges | user_id | webauthn_challenges_user_id_fkey | CASCADE | IDENTIDADE |
| auth.webauthn_credentials | user_id | webauthn_credentials_user_id_fkey | CASCADE | IDENTIDADE |

### Classificação conceitual:

- **IDENTIDADE:** `user_profiles.id` — representa a existência do usuário no sistema. CASCADE é apropriado (se o usuário é excluído do Auth, seu perfil deve desaparecer).
- **AUTORIA:** `user_id` em areas, seasons, operations, machinery, maintenance_types, maintenances, notes — representa quem criou o registro. **CASCADE é PERIGOSO aqui** porque exclui todo o histórico agrícola quando um usuário é removido.
- **AUTORIA (SET NULL):** `institutions.created_by`, `invitations.created_by` — corretamente usa SET NULL, preservando o registro mesmo sem o autor.
- **HISTÓRICO:** `invitations.used_by` — quem usou o convite. SET NULL é apropriado.

### Contagem de registros por usuário (tabelas de negócio):

| Usuário (prefixo email) | Profiles | Áreas | Safras | Operações | Máquinas | Tipos Manut. | Manuts. | Notas | Inst. Criadas | Convites Criados | Convites Usados |
|---|---|---|---|---|---|---|---|---|---|---|---|
| f***@gmail.com (470c400e) | 1 | 0 | 2 | 33 | 1 | 1 | 1 | 5 | 0 | 2 | 1 |
| d***1@gmail.com (ca7e7323) | 1 | 26 | 1 | 166 | 3 | 0 | 0 | 3 | 0 | 1 | 1 |
| d***1996@gmail.com (cc8adbd5) | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |
| f***@gmail.com (76658ac9) | 1 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | 0 |
| a***7@gmail.com (c046dfb3) | 1 | 18 | 1 | 108 | 15 | 1 | 2 | 0 | 0 | 0 | 1 |
| s***12@gmail.com (b5ddba4c) | 1 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 1 |

**Nota:** `products` não tem coluna `user_id`. A tabela `products` não referencia `auth.users` diretamente.

---

## G. FKs ENVOLVENDO institutions(id)

| Tabela | Coluna | Constraint | ON DELETE |
|---|---|---|---|
| user_profiles | institution_id | user_profiles_institution_id_fkey | CASCADE |
| areas | institution_id | areas_institution_id_fkey | CASCADE |
| seasons | institution_id | seasons_institution_id_fkey | CASCADE |
| operations | institution_id | operations_institution_id_fkey | CASCADE |
| products | institution_id | products_institution_id_fkey | CASCADE |
| machinery | institution_id | machinery_institution_id_fkey | CASCADE |
| maintenance_types | institution_id | maintenance_types_institution_id_fkey | CASCADE |
| maintenances | institution_id | maintenances_institution_id_fkey | CASCADE |
| notes | institution_id | notes_institution_id_fkey | CASCADE |
| invitations | institution_id | invitations_institution_id_fkey | CASCADE |

**Total:** 10 FKs referenciam `institutions.id`, todas com `ON DELETE CASCADE`.

**Árvore de dependências da instituição:**

```
institutions (DELETE)
├── user_profiles (CASCADE)
├── areas (CASCADE)
│   └── operations (CASCADE via institution_id, mas RESTRICT via area_id)
├── seasons (CASCADE)
│   └── operations (CASCADE via institution_id, mas RESTRICT via season_id)
├── operations (CASCADE)
│   ├── operation_products (CASCADE via operation_id)
│   ├── operations_area_id_fkey (RESTRICT — bloqueia se area pertence à mesma inst.)
│   └── operations_season_id_fkey (RESTRICT — bloqueia se season pertence à mesma inst.)
├── products (CASCADE)
│   └── product_lots (RESTRICT — bloqueia se lots pertencem a produtos da inst.)
├── machinery (CASCADE)
│   └── maintenances (RESTRICT via machinery_id — bloqueia se maints pertencem a máquinas)
├── maintenance_types (CASCADE)
│   └── maintenances (RESTRICT via maintenance_type_id — bloqueia)
├── maintenances (CASCADE)
├── notes (CASCADE)
└── invitations (CASCADE)
```

---

## H. SIMULAÇÃO DE DELETE DE USUÁRIO

**SEM EXECUTAR DELETE.** Análise baseada em SELECT e metadados.

Para cada auth.user, se fosse removido HOJE:

| Usuário (prefixo email) | Resultado do DELETE | Constraint bloqueadora |
|---|---|---|
| f***@gmail.com (470c400e) | **BLOQUEADO** | seasons→operations(RESTRICT season_id) — o usuário criou 2 safras, e existem operações vinculadas a essas safras |
| d***1@gmail.com (ca7e7323) | **BLOQUEADO** | areas→operations(RESTRICT area_id) — o usuário criou 26 áreas, e existem operações vinculadas a essas áreas |
| d***1996@gmail.com (cc8adbd5) | **PERMITIDO** | Sem dependências bloqueadoras. DELETE cascades: user_profile (1), 0 áreas, 0 safras, 0 operações, 0 máquinas, 0 manutenções, 0 notas. invitations.used_by → SET NULL. |
| f***@gmail.com (76658ac9) | **BLOQUEADO** | seasons→operations(RESTRICT season_id) — o usuário criou 1 safra, e existem operações vinculadas a essa safra |
| a***7@gmail.com (c046dfb3) | **BLOQUEADO** | areas→operations(RESTRICT area_id) — o usuário criou 18 áreas, e existem operações vinculadas a essas áreas |
| s***12@gmail.com (b5ddba4c) | **PERMITIDO** | Sem dependências bloqueadoras. DELETE cascades: user_profile (1), 0 áreas, 0 safras, 2 operações (cascade), 0 máquinas, 0 manutenções, 0 notas. |

### Resumo da simulação:

- **4 de 6 usuários:** DELETE seria **BLOQUEADO** pelas FKs RESTRICT introduzidas nas Etapas 1B-1D. O cascade tentaria remover áreas/safras, mas encontraria operações que dependem delas via RESTRICT, abortando a transação inteira.
- **2 de 6 usuários:** DELETE seria **PERMITIDO**. Os usuários cc8adbd5 e b5ddba4c têm poucos dados próprios e nenhuma dependência RESTRICT os bloqueia. Seus perfis, operações (no caso de b5ddba4c, 2 operações), e convites usados (SET NULL) seriam afetados.

### Efeito cascata detalhado para usuário PERMITIDO (b5ddba4c):
- `user_profiles` → CASCADE (1 linha removida)
- `operations` → CASCADE (2 linhas removidas — **PERDA DE DADOS**)
- `operation_products` → CASCADE via operation_id (linhas relacionadas às 2 operações)
- `invitations.used_by` → SET NULL (1 convite marcado como usado por este usuário teria used_by = NULL)
- `institutions.created_by` → não afetado (este usuário não criou instituições)
- `invitations.created_by` → não afetado (este usuário não criou convites)

### Efeito cascata detalhado para usuário PERMITIDO (cc8adbd5):
- `user_profiles` → CASCADE (1 linha removida)
- `invitations.used_by` → SET NULL (1 convite)
- Nenhuma outra tabela afetada (0 áreas, 0 safras, 0 operações, 0 máquinas, etc.)

### Efeitos SET NULL para todos os usuários:
- `institutions.created_by`: Apenas o usuário 76658ac9 criou 1 instituição ("Faz. São Pedro"). Se deletado, `created_by` dessa instituição seria SET NULL (a instituição permanece).
- `invitations.created_by`: Usuários 470c400e (2 convites) e ca7e7323 (1 convite) e 76658ac9 (1 convite) criaram convites. Se deletados, `created_by` seria SET NULL.
- `invitations.used_by`: Todos os 6 usuários usaram pelo menos 1 convite. Se deletados, `used_by` seria SET NULL.

---

## I. SIMULAÇÃO DE DELETE DE INSTITUIÇÃO

**SEM EXECUTAR DELETE.**

Para cada instituição:

| Instituição | Resultado | Constraint bloqueadora |
|---|---|---|
| b610d2 | **PERMITIDO** | Vazia — 0 dados. DELETE cascata: 0 linhas. |
| Faz. São Pedro | **BLOQUEADO** | operations_area_id_fkey (RESTRICT) — existem 108 operações vinculadas a 18 áreas. O cascade tentaria excluir áreas, mas operations tem RESTRICT em area_id. |
| Girassol | **PERMITIDO** | Vazia — 0 dados. Apenas 1 convite (cascade). |
| Grupo Delatorre | **BLOQUEADO** | operations_area_id_fkey (RESTRICT) — existem 201 operações vinculadas a 26 áreas. |
| Sao Joao | **PERMITIDO** | Vazia — 0 dados. |
| sao pedro | **PERMITIDO** | Vazia — 0 dados. |

### Explicação do mecanismo de bloqueio:

Quando se tenta `DELETE FROM institutions WHERE id = 'Faz. São Pedro'`:

1. PostgreSQL inicia a transação.
2. CASCADE tentaria excluir:
   - `user_profiles` (2 linhas) — CASCADE
   - `areas` (18 linhas) — CASCADE
   - `seasons` (2 linhas) — CASCADE
   - `operations` (108 linhas) — CASCADE
   - `products` (29 linhas) — CASCADE
   - `machinery` (15 linhas) — CASCADE
   - `maintenance_types` (1 linha) — CASCADE
   - `maintenances` (2 linhas) — CASCADE
   - `notes` (0 linhas) — CASCADE
   - `invitations` (1 linha) — CASCADE
3. Mas **ao tentar excluir `areas`**, o PostgreSQL encontra `operations_area_id_fkey` (RESTRICT) — existem 108 operações que referenciam essas áreas.
4. **A transação inteira é abortada.** Todos os cascades são revertidos. Nenhum dado é perdido.

### Resumo:

- **2 de 6 instituições:** DELETE seria **BLOQUEADO** (Faz. São Pedro e Grupo Delatorre — as únicas com dados reais).
- **4 de 6 instituições:** DELETE seria **PERMITIDO** (instituições vazias — excluiria apenas a si mesmas e convites órfãos).

### Importante:

Mesmo que o DELETE da instituição seja bloqueado, **se não existisse as FKs RESTRICT**, o CASCADE excluiria TODOS os dados da instituição: áreas, safras, operações, produtos, lotes, máquinas, manutenções, notas, perfis de usuário, e convites. Isso seria catastrófico. As FKs RESTRICT das Etapas 1B-1D protegem indiretamente as instituições com dados.

---

## J. RLS — MAPEAMENTO COMPLETO

### RLS habilitado em todas as tabelas de negócio:

| Tabela | RLS |
|---|---|
| areas | habilitado |
| operations | habilitado |
| products | habilitado |
| product_lots | habilitado |
| seasons | habilitado |
| machinery | habilitado |
| maintenance_types | habilitado |
| maintenances | habilitado |
| notes | habilitado |
| institutions | habilitado |
| user_profiles | habilitado |
| invitations | habilitado |

### Estratégia RLS usada:

**Todas as tabelas de negócio** (areas, operations, products, seasons, machinery, maintenance_types, maintenances, notes) usam a mesma estratégia:

```sql
-- SELECT (USING)
institution_id IN (
  SELECT user_profiles.institution_id
  FROM user_profiles
  WHERE user_profiles.id = auth.uid()
)

-- INSERT/UPDATE (WITH CHECK)
institution_id IN (
  SELECT user_profiles.institution_id
  FROM user_profiles
  WHERE user_profiles.id = auth.uid()
)
```

**product_lots** usa uma variação que verifica via join com `products`:
```sql
EXISTS (
  SELECT 1 FROM products p
  WHERE p.id = product_lots.product_id
  AND p.institution_id = (
    SELECT user_profiles.institution_id
    FROM user_profiles
    WHERE user_profiles.id = auth.uid()
  )
)
```

**user_profiles:**
- SELECT: `auth.uid() = id` (usuário só lê seu próprio perfil)
- INSERT: `auth.uid() = id` (só pode criar o próprio perfil)
- UPDATE: `auth.uid() = id` (só pode editar o próprio perfil)
- **Não há DELETE policy** — DELETE não é permitido via RLS para user_profiles.

**institutions:**
- SELECT: `id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` (só vê a própria instituição)
- INSERT: `NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND institution_id IS NOT NULL)` (só pode criar instituição se ainda não pertence a nenhuma)
- **Não há UPDATE nem DELETE policy** — não é possível alterar ou excluir instituições via RLS.

**invitations:**
- SELECT: `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` (vê convites da própria instituição)
- INSERT (WITH CHECK): `EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = invitations.institution_id)` (só admin pode criar)
- **Não há DELETE nem UPDATE policy via RLS** — DELETE é feito apenas via RPC `delete_invitation` (SECURITY DEFINER, bypassa RLS).

### Inconsistências identificadas:

1. **`areas` tem 5 policies** (incluindo 2 INSERT: "Enable insert for authenticated users only" com `WITH CHECK = true` e "Users can create areas in their institution" com verificação de institution_id). A policy "Enable insert" com `WITH CHECK = true` é **permissiva demais** — permite inserir em qualquer institution_id. No entanto, como é PERMISSIVE e não RESTRICTIVE, e ambas são PERMISSIVE, a policy mais restritiva não anula a mais permissiva. Em policy PERMISSIVE, **qualquer policy que passar é suficiente**. Portanto, a policy "Enable insert for authenticated users only" permite inserir com qualquer `institution_id`, ignorando a verificação institucional.

2. **`products` e `operations`** também podem ter a policy "Enable insert for authenticated users only" (a query foi truncada, mas o padrão se repete em `areas`). Se esse for o caso, **qualquer usuário autenticado pode inserir produtos/operações com qualquer `institution_id`**, não apenas o seu.

3. **`user_profiles` não tem DELETE policy** — isso significa que usuários não podem excluir seu próprio perfil via API. Apenas CASCADE de `auth.users` ou admin do Supabase pode remover perfis.

4. **`institutions` não tem DELETE nem UPDATE policy** — instituições não podem ser excluídas ou alteradas via API direta. Apenas via RPC (que bypassa RLS por ser SECURITY DEFINER) ou admin do Supabase.

### Verificação de cross-institution access:

A estratégia de `institution_id IN (SELECT user_profiles.institution_id FROM user_profiles WHERE id = auth.uid())` garante que um usuário só acessa dados da sua própria instituição. **Não há possibilidade de um usuário acessar dados de outra instituição via SELECT/UPDATE/DELETE** (assumindo que as policies "Enable insert" não afetam SELECT/UPDATE/DELETE).

**RISCO:** A policy "Enable insert for authenticated users only" com `WITH CHECK = true` pode permitir que um usuário insira dados com `institution_id` de outra instituição. Isso requer verificação mais detalhada (ver seção T — Riscos).

---

## K. SECURITY DEFINER — FUNÇÕES

### Inventário de funções SECURITY DEFINER no schema public:

| Função | Argumentos | Retorna | search_path |
|---|---|---|---|
| check_institution_exists | institution_name text | boolean | NÃO DEFINIDO |
| clean_expired_invitations | (nenhum) | void | NÃO DEFINIDO |
| copy_data_to_institution | source_institution_id uuid, target_institution_id uuid | void | NÃO DEFINIDO |
| create_invitation | p_institution_id uuid, p_expires_in_days int DEFAULT 7 | text | 'public' |
| delete_invitation | invitation_code text | boolean | NÃO DEFINIDO |
| handle_new_user | (trigger) | trigger | NÃO DEFINIDO |
| handle_user_registration | user_id uuid, institution_name text | json | 'public' |
| join_institution | user_id uuid, invitation_code text | json | 'public' |
| list_active_invitations | institution_id_param uuid | TABLE(...) | NÃO DEFINIDO |
| list_institution_users | institution_id_param uuid | TABLE(...) | NÃO DEFINIDO |
| toggle_user_admin_status | user_id_param uuid, new_status boolean | void | NÃO DEFINIDO |
| update_season_status | season_id_param uuid, new_status text | void | NÃO DEFINIDO |
| validate_invitation | invitation_code text | jsonb | 'public' |

### EXECUTE grants:

**TODAS as funções SECURITY DEFINER têm EXECUTE concedido a PUBLIC, anon, e authenticated.**

Isso significa que:
- **anon** (usuários não autenticados) pode executar TODAS as funções SECURITY DEFINER
- **authenticated** pode executar TODAS as funções SECURITY DEFINER

### Análise individual de segurança:

#### check_institution_exists
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** NÃO
- **valida institution_id:** NÃO
- **valida admin:** NÃO
- **anon pode executar:** SIM
- **Pode ler dados:** Sim — lê a tabela `institutions` (nomes)
- **Risco:** BAIXO — apenas verifica se uma instituição existe por nome. Não expõe dados sensíveis.
- **search_path:** NÃO definido — risco de search_path injection.

#### clean_expired_invitations
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** NÃO
- **valida institution_id:** NÃO
- **anon pode executar:** SIM
- **Pode alterar dados:** Sim — DELETE de invitations expirados
- **Risco:** BAIXO — apenas remove convites expirados não usados. Efeito é o mesmo independente de quem chama.
- **search_path:** NÃO definido.

#### copy_data_to_institution
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** NÃO
- **valida institution_id:** NÃO
- **valida admin:** NÃO
- **anon pode executar:** SIM
- **Pode alterar dados:** Sim — INSERT de áreas, produtos, safras em outra instituição
- **Risco:** ALTO — qualquer usuário (incluindo anon) pode copiar dados entre quaisquer instituições. Não verifica se o caller pertence à instituição source ou target. Não verifica admin.
- **search_path:** NÃO definido.

#### create_invitation
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** Sim
- **valida institution_id:** Sim (verifica `institution_id = p_institution_id`)
- **valida admin:** Sim (verifica `is_admin = true`)
- **anon pode executar:** SIM (mas `auth.uid()` será NULL, então falhará na verificação de admin)
- **Pode alterar dados:** Sim — INSERT em invitations
- **Risco:** BAIXO para authenticated (verifica admin e institution). Medio para anon (pode chamar mas falha).
- **search_path:** 'public' — BOM.

#### delete_invitation
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** Sim
- **valida institution_id:** Sim (verifica `institution_id = target_institution_id`)
- **valida admin:** Sim (verifica `is_admin = true`)
- **anon pode executar:** SIM (mas falhará na verificação)
- **Pode alterar dados:** Sim — DELETE em invitations
- **Risco:** BAIXO.
- **search_path:** NÃO definido.

#### handle_new_user (TRIGGER)
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated (mas é trigger, só executa via INSERT em auth.users)
- **usa auth.uid():** NÃO (usa NEW.id do trigger)
- **Cria:** INSERT em user_profiles
- **Risco:** NENHUM — é um trigger AFTER INSERT em auth.users, executado automaticamente pelo sistema. Não é chamável diretamente de forma útil.
- **search_path:** NÃO definido.

#### handle_user_registration
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** NÃO — recebe `user_id` como parâmetro
- **valida institution_id:** NÃO
- **valida admin:** NÃO
- **anon pode executar:** SIM
- **Pode alterar dados:** Sim — INSERT em institutions, INSERT/UPDATE em user_profiles
- **Risco:** ALTO — qualquer caller pode registrar um `user_id` arbitrário como admin de uma nova instituição. Não verifica que `user_id = auth.uid()`. Um usuário autenticado poderia chamar esta função com o ID de outro usuário, criando uma instituição e tornando esse outro usuário admin.
- **search_path:** 'public' — BOM.

#### join_institution
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** NÃO — recebe `user_id` como parâmetro
- **valida institution_id:** NÃO
- **anon pode executar:** SIM
- **Pode alterar dados:** Sim — INSERT/UPDATE em user_profiles, UPDATE em invitations
- **Risco:** ALTO — qualquer caller pode fazer qualquer `user_id` entrar em qualquer instituição usando um código de convite válido. Não verifica que `user_id = auth.uid()`. Um atacante que saiba um código de convite válido poderia associar qualquer usuário a essa instituição.
- **search_path:** 'public' — BOM.

#### list_active_invitations
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** Sim
- **valida institution_id:** Sim (verifica `institution_id = institution_id_param`)
- **valida admin:** NÃO — verifica apenas que o usuário pertence à instituição, não que é admin
- **anon pode executar:** SIM (mas falhará)
- **Pode ler dados:** Sim — retorna códigos de convite, nomes de usuários
- **Risco:** MEDIO — qualquer membro da instituição (não apenas admin) pode ver todos os códigos de convite ativos. Um membro não-admin poderia usar um código de convite que viu na listagem.
- **search_path:** NÃO definido.

#### list_institution_users
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** NÃO
- **valida institution_id:** NÃO
- **valida admin:** NÃO
- **anon pode executar:** SIM
- **Pode ler dados:** Sim — retorna id, email, first_name, last_name, role, is_admin de TODOS os usuários de QUALQUER instituição
- **Risco:** ALTO — qualquer caller (incluindo anon) pode listar usuários de qualquer instituição. Não verifica auth.uid(), não verifica membership, não verifica admin. Expõe emails e dados pessoais.
- **search_path:** NÃO definido.

#### toggle_user_admin_status
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** Sim
- **valida institution_id:** Sim (verifica `institution_id = target_institution_id`)
- **valida admin:** Sim (verifica `is_admin = true`)
- **anon pode executar:** SIM (mas falhará)
- **Pode alterar dados:** Sim — UPDATE em user_profiles (is_admin)
- **Risco:** MEDIO — verifica admin e instituição, mas não previne auto-promoção/demissão explicitamente (o frontend previne, mas o banco não). Um admin pode promover/demover qualquer usuário da sua instituição, incluindo a si mesmo.
- **search_path:** NÃO definido.

#### update_season_status
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** Sim
- **valida institution_id:** NÃO — verifica apenas `user_id = auth.uid()` na cláusula WHERE
- **anon pode executar:** SIM (mas falhará)
- **Pode alterar dados:** Sim — UPDATE em seasons (status)
- **Risco:** MEDIO — não verifica institution_id. Se um usuário conseguir o ID de uma safra de outra instituição, poderia alterar seu status. A verificação por `user_id = auth.uid()` limita às safras criadas pelo próprio usuário, o que incidentalmente limita à sua instituição, mas não é uma verificação direta.
- **search_path:** NÃO definido.

#### validate_invitation
- **SECURITY DEFINER:** Sim
- **EXECUTE:** PUBLIC, anon, authenticated
- **usa auth.uid():** NÃO
- **anon pode executar:** SIM
- **Pode ler dados:** Sim — retorna institution_name se o código for válido
- **Risco:** BAIXO — apenas valida um código e retorna o nome da instituição. Necessário para o fluxo de registro. Não expõe dados sensíveis.
- **search_path:** 'public' — BOM.

---

## L. list_institution_users — ANÁLISE DETALHADA

```sql
CREATE OR REPLACE FUNCTION public.list_institution_users(institution_id_param uuid)
RETURNS TABLE(id uuid, email text, first_name text, last_name text, role text, is_admin boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    up.id,
    (au.email)::text as email,
    up.first_name,
    up.last_name,
    up.role,
    COALESCE(up.is_admin, false) as is_admin
  FROM user_profiles up
  JOIN auth.users au ON au.id = up.id
  WHERE up.institution_id = institution_id_param;
END;
$function$;
```

### Respostas:

- **SECURITY DEFINER?** Sim.
- **Quem pode executar?** PUBLIC, anon, authenticated. **Qualquer pessoa**, incluindo usuários não autenticados.
- **Verifica auth.uid()?** NÃO. A função não referencia `auth.uid()` em nenhum lugar.
- **Verifica se usuário pertence à instituição solicitada?** NÃO. Não há nenhuma verificação de membership.
- **Verifica admin?** NÃO.
- **anon pode executar?** SIM. anon pode listar usuários de qualquer instituição.
- **Quais dados retorna?** id (uuid), email, first_name, last_name, role, is_admin de todos os user_profiles da instituição informada. Também acessa auth.users para obter o email.
- **search_path definido?** NÃO.
- **Pode ler dados de auth.users?** Sim — faz JOIN com auth.users para obter email. Como é SECURITY DEFINER, executa com privilégios do owner (geralmente postgres), bypassando RLS de auth.users.

### Vulnerabilidade:

Esta função permite que **qualquer pessoa na internet** (anon) liste todos os usuários de qualquer instituição, incluindo seus emails. Isso é uma violação de privacidade e pode ser usado para:
1. Enumerar usuários do sistema
2. Obter emails para ataques de phishing
3. Mapear a estrutura de instituições

---

## M. FLUXO DE LOGIN

### Arquivos envolvidos:

1. **src/hooks/useAuth.ts** — hook minimalista de sessão
2. **src/pages/auth/Login.tsx** — UI de login + registro + validação de convite
3. **src/context/AppContext.tsx** — carregamento de perfil/instituição

### Como funciona:

1. **Login:** `useAuth` chama `supabase.auth.getSession()` na inicialização e assina `onAuthStateChange`. `Login.tsx` chama `supabase.auth.signInWithPassword({ email, password })`. Nenhuma lógica de instituição roda no login — apenas estabelece a sessão.

2. **Restauração de sessão:** `useAuth` via `getSession()` + `onAuthStateChange`. O `AppProvider` não depende do objeto session diretamente; em vez disso, `loadUserProfile()` roda em um `useEffect` que chama `supabase.auth.getUser()`.

3. **Carregamento de institution_id:** `AppContext.loadUserProfile`:
   - Chama `supabase.auth.getUser()`
   - Chama `supabase.from('user_profiles').select('*').eq('id', user.id).single()`
   - Define `profile` no Context com `institutionId: data.institution_id` e `isAdmin: data.is_admin`
   - **NÃO é persistido em localStorage** — localStorage é apenas para caches de dados offline

4. **Detecção de admin:** `data.is_admin` (boolean) da tabela `user_profiles`, lido em `loadUserProfile` e exposto como `profile.isAdmin` via Context.

5. **institution_id vem de:** `user_profiles` (tabela do banco), **não do JWT**, não do localStorage, não de RPC. O frontend sempre re-deriva `institution_id` de uma query em `user_profiles`.

### Fluxo de registro — nova instituição:

`Login.handleRegister` (branch `!isJoining`):
1. `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, phone, role } } })`
2. RPC `handle_user_registration({ user_id: authData.user.id, institution_name })`
3. A RPC cria a instituição e o perfil com `is_admin = true`

### Fluxo de registro — join via convite:

`Login.handleRegister` (branch `isJoining`):
1. `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, phone, role } } })`
2. RPC `join_institution({ user_id: authData.user.id, invitation_code })`
3. A RPC valida o convite, cria/atualiza o perfil com `institution_id` do convite e `is_admin = false`

### Trigger handle_new_user:

Há um trigger `on_auth_user_created` AFTER INSERT em `auth.users` que chama `handle_new_user()`. Esta função cria um `user_profiles` com `institution_id = NULL`, `is_admin = false`, `institution = ''`. Ou seja, **todo novo usuário Auth recebe um perfil vazio automaticamente**, antes de `handle_user_registration` ou `join_institution` ser chamado. Essas funções então fazem UPDATE/INSERT no perfil.

---

## N. FLUXO DE CONVITES

### Criação:

- **Arquivo:** `src/pages/Settings.tsx` → `handleCreateInvitation`
- **Quem pode usar:** Apenas `profile.isAdmin` (verificado no frontend)
- **Como:** RPC `create_invitation({ p_institution_id: profile.institutionId })`
- **A RPC:** Verifica `auth.uid()` é admin da instituição, gera código aleatório, insere em `invitations` com `expires_at = now() + 7 dias`

### Validação:

- **Arquivo:** `src/pages/auth/Login.tsx` → `useEffect` com debounce de 500ms
- **Como:** RPC `validate_invitation({ invitation_code })`
- **A RPC:** Verifica se o código existe, não expirou, e não foi usado. Retorna `{ valid, institution_name, message }`

### Aceitação:

- **Arquivo:** `src/pages/auth/Login.tsx` → `handleRegister` (branch `isJoining`)
- **Como:** Após `signUp`, chama RPC `join_institution({ user_id, invitation_code })`
- **A RPC:**
  1. Locka a row do convite (`FOR UPDATE`)
  2. Verifica se não foi usado e não expirou
  3. Faz `INSERT INTO user_profiles ... ON CONFLICT (id) DO UPDATE SET institution_id = EXCLUDED.institution_id`
  4. Marca o convite como usado (`used_at = now()`, `used_by = user_id`)
  5. Retorna sucesso

### Exclusão de convites:

- **Arquivo:** `src/pages/Settings.tsx` → `handleDeleteInvitation`
- **Como:** RPC `delete_invitation({ invitation_code })`
- **A RPC:** Verifica admin da mesma instituição, depois DELETE
- **UI:** Só mostra botão de excluir para convites não usados

### Possibilidade de usuário entrar na instituição errada:

**NÃO**, dado o fluxo atual. O `institution_id` é derivado do convite, não escolhido pelo usuário. O usuário apenas digita o código; a instituição é determinada pelo convite. Não há como o usuário especificar uma instituição diferente.

**MAS** a função `join_institution` tem uma vulnerabilidade: ela recebe `user_id` como parâmetro, não usa `auth.uid()`. Teoricamente, um atacante poderia chamar `join_institution` com o `user_id` de outra pessoa e um código de convite válido, associando essa pessoa a uma instituição sem seu consentimento. No entanto, isso requereria conhecer o código do convite (que é aleatório de 8 caracteres) e o ID do usuário alvo.

### Dados dos convites atuais:

| ID (prefixo) | Instituição | Code | Expira | Created By | Used By | Usado em |
|---|---|---|---|---|---|---|
| 72518558... | Grupo Delatorre | 0a501f | 2025-05-30 | null | 470c400e... | 2025-05-23 |
| 8e06a00e... | Girassol | 644ac7 | 2025-05-30 | null | null | (não usado) |
| dab2305b... | Grupo Delatorre | 60D34FE7 | 2025-09-24 | null | ca7e7323... | 2025-09-17 |
| 114d3cbe... | Grupo Delatorre | 6BE275B5 | 2025-10-09 | 470c400e... | cc8adbd5... | 2025-10-02 |
| 25b3d1f7... | Faz. São Pedro | A476175C | 2025-10-13 | 76658ac9... | c046dfb3... | 2025-10-06 |
| 62e95290... | Grupo Delatorre | E2EC653E | 2026-08-06 | ca7e7323... | b5ddba4c... | 2026-07-30 |
| 883f09f7... | Grupo Delatorre | 24208731 | 2026-09-29 | 470c400e... | null | (não usado) |

**Observação:** `created_by` é NULL para os 3 convites mais antigos. Isso provavelmente ocorre porque a função `create_invitation` original não definia `created_by`, ou porque o usuário que criou foi removido (SET NULL).

---

## O. EXCLUSÃO DE USUÁRIO NO FRONTEND

### Resultado: NÃO EXISTE funcionalidade de exclusão de usuário no frontend.

- Busca por `auth.admin.deleteUser`, `deleteUser`, `removeMember`, `deleteMember`, `removeUser` em `src/` retornou **zero matches**.
- `Settings.tsx` "Institution Users" mostra uma tabela com: Nome, Email, Role, e um checkbox de admin. **Não há botão de excluir/remover usuário.**
- A única mutação de gerenciamento de usuários é `handleToggleAdmin` (RPC `toggle_user_admin_status`).
- `handleUpdateProfile` permite editar o próprio perfil (first_name, last_name, phone, role), mas não exclui.

### Conclusão:

Não há como excluir um usuário através da interface do aplicativo. A exclusão só pode ser feita via:
1. Supabase Dashboard (admin do Supabase)
2. SQL direto no banco (DELETE FROM auth.users)
3. Supabase Admin API (auth.admin.deleteUser)

Nenhum desses caminhos está exposto no frontend.

---

## P. EXCLUSÃO DE INSTITUIÇÃO

### Resultado: NÃO EXISTE funcionalidade de exclusão de instituição no frontend ou em RPCs.

- Busca por `deleteInstitution`, `removeInstitution`, `delete.*institution` em `src/` retornou apenas documentos markdown de auditoria.
- `Settings.tsx` não tem nenhum controle de exclusão de instituição.
- Não há RPC que exclua instituições.
- A RLS de `institutions` não tem DELETE policy — DELETE via API direta é bloqueado por RLS.

### Conclusão:

Instituições não podem ser excluídas através da interface do aplicativo ou via API. A exclusão só é possível via:
1. Supabase Dashboard (admin do Supabase, que bypassa RLS)
2. SQL direto no banco (DELETE FROM institutions)

Nenhum desses caminhos está exposto no frontend.

---

## Q. RECOMENDAÇÕES FK POR FK

### FKs envolvendo auth.users(id) — tabelas de negócio:

| FK | Tabela.Coluna | ON DELETE Atual | Recomendação | Justificativa |
|---|---|---|---|---|
| user_profiles_id_fkey | user_profiles.id | CASCADE | **MANTER CASCADE** | A exclusão do perfil é correta quando o usuário é excluído do Auth. O perfil é a identidade, não dados de negócio. |
| areas_user_id_fkey | areas.user_id | CASCADE | **RESTRICT** | Áreas são dados de negócio da instituição, não do usuário. Excluir um usuário não deve apagar áreas. O `institution_id` mantém a área viva na instituição. |
| seasons_user_id_fkey | seasons.user_id | CASCADE | **RESTRICT** | Safras são dados de negócio. Mesma justificativa que áreas. |
| operations_user_id_fkey | operations.user_id | CASCADE | **RESTRICT** | Operações são histórico agrícola. Não devem ser apagadas quando o autor sai da empresa. |
| machinery_user_id_fkey | machinery.user_id | CASCADE | **RESTRICT** | Máquinas pertencem à instituição. O `institution_id` mantém a máquina viva. |
| maintenance_types_user_id_fkey | maintenance_types.user_id | CASCADE | **RESTRICT** | Tipos de manutenção são dados da instituição. |
| maintenances_user_id_fkey | maintenances.user_id | CASCADE | **RESTRICT** | Manutenções são histórico. Não devem ser apagadas. |
| notes_user_id_fkey | notes.user_id | CASCADE | **RESTRICT** ou **SET NULL** | Notas podem ser pessoais ou institucionais. Se institucionais, RESTRICT. Se pessoais, SET NULL pode ser apropriado. **PRECISA INVESTIGAÇÃO** — verificar se notas são pessoais ou da instituição. |
| institutions_created_by_fkey | institutions.created_by | SET NULL | **MANTER SET NULL** | Correto. A instituição permanece mesmo sem o criador. |
| invitations_created_by_fkey | invitations.created_by | SET NULL | **MANTER SET NULL** | Correto. O convite permanece sem o criador. |
| invitations_used_by_fkey | invitations.used_by | SET NULL | **MANTER SET NULL** | Correto. O histórico de quem usou o convite é preservado (como NULL). |

### FKs envolvendo institutions(id):

| FK | Tabela.Coluna | ON DELETE Atual | Recomendação | Justificativa |
|---|---|---|---|---|
| user_profiles_institution_id_fkey | user_profiles.institution_id | CASCADE | **RESTRICT** | Excluir uma instituição não deve apagar perfis de usuário. Usuários podem existir sem instituição (ou ser reatribuídos). **MAS** o sistema atual não suporta usuário sem instituição (todas as policies assumem institution_id não-NULL). **PRECISA INVESTIGAÇÃO** — decidir se usuários órfãos de instituição devem existir. |
| areas_institution_id_fkey | areas.institution_id | CASCADE | **RESTRICT** | Áreas são dados de negócio. Excluir instituição não deve apagar áreas. |
| seasons_institution_id_fkey | seasons.institution_id | CASCADE | **RESTRICT** | Safras são dados de negócio. |
| operations_institution_id_fkey | operations.institution_id | CASCADE | **RESTRICT** | Operações são histórico agrícola. |
| products_institution_id_fkey | products.institution_id | CASCADE | **RESTRICT** | Produtos são estoque da instituição. |
| machinery_institution_id_fkey | machinery.institution_id | CASCADE | **RESTRICT** | Máquinas pertencem à instituição. |
| maintenance_types_institution_id_fkey | maintenance_types.institution_id | CASCADE | **RESTRICT** | Tipos de manutenção são da instituição. |
| maintenances_institution_id_fkey | maintenances.institution_id | CASCADE | **RESTRICT** | Manutenções são histórico. |
| notes_institution_id_fkey | notes.institution_id | CASCADE | **RESTRICT** | Notas são da instituição. |
| invitations_institution_id_fkey | invitations.institution_id | CASCADE | **CASCADE** | Convites são efêmeros. Se a instituição é excluída, convites não fazem sentido. |

### Resumo das recomendações:

- **auth.users FKs:** 7 devem mudar de CASCADE para RESTRICT (areas, seasons, operations, machinery, maintenance_types, maintenances, notes). 1 precisa investigação (notes — pode ser SET NULL). 3 devem manter SET NULL. 1 deve manter CASCADE (user_profiles).
- **institutions FKs:** 9 devem mudar de CASCADE para RESTRICT. 1 pode manter CASCADE (invitations). 1 precisa investigação (user_profiles — depende de decidir se usuário pode existir sem instituição).

**Total de FKs que precisariam alteração:** 16 (7 de auth.users + 9 de institutions) possivelmente 17 com user_profiles.institution_id.

**Prioridade:** Preservar histórico agrícola mesmo se usuário sair da empresa ou instituição for desativada.

---

## R. DESATIVAÇÃO DE USUÁRIOS vs EXCLUSÃO

### Análise:

Atualmente, excluir um usuário do Supabase Auth (`DELETE FROM auth.users`) dispara cascades que podem apagar:
- user_profiles (CASCADE)
- areas (CASCADE) → pode bloquear via RESTRICT
- seasons (CASCADE) → pode bloquear via RESTRICT
- operations (CASCADE) — perda de histórico
- machinery (CASCADE) → pode bloquear via RESTRICT
- maintenance_types (CASCADE) → pode bloquear via RESTRICT
- maintenances (CASCADE) — perda de histórico
- notes (CASCADE) — perda de notas

**Mesmo com as FKs RESTRICT das Etapas 1B-1D, 2 de 6 usuários poderiam ser deletados sem bloqueio**, perdendo seus dados (especialmente operações).

### Modelo recomendado (futuro):

Em vez de excluir usuários do Auth, o sistema deveria usar um modelo de **desativação**:

1. **Adicionar coluna `is_active` (boolean DEFAULT true) em `user_profiles`**
2. **Desativar = SET is_active = false** (não excluir do Auth)
3. **Usuário desativado:** não pode fazer login (verificar via trigger ou RLS) ou é excluído do Auth apenas após confirmar que seus dados estão preservados
4. **Antes de excluir do Auth:** verificar se o usuário tem dados de negócio. Se sim, impedir exclusão ou transferir `user_id` para um usuário "system/deleted" placeholder.

### Alterações necessárias futuramente:

1. Adicionar `is_active` em `user_profiles`
2. Mudar FKs `user_id` de CASCADE para RESTRICT (ou SET NULL com coluna nullable)
3. Criar função `deactivate_user` que desativa sem excluir
4. Adicionar UI de desativação/remoção de acesso no Settings
5. Considerar um usuário "system" para receber autoria de registros de usuários removidos

### Não implementar agora:

Esta etapa é READ-ONLY. Apenas documentar a recomendação.

---

## S. ARQUIVAMENTO DE INSTITUIÇÕES vs EXCLUSÃO

### Análise:

Atualmente, excluir uma instituição dispararia cascades que apagam TODOS os dados (áreas, safras, operações, produtos, máquinas, manutenções, notas, perfis, convites). As FKs RESTRICT das Etapas 1B-1D bloqueiam a exclusão para instituições com operações/lotes/manutenções, mas instituições vazias podem ser excluídas.

### Modelo recomendado (futuro):

1. **Adicionar coluna `is_active` ou `archived_at` em `institutions`**
2. **Arquivar = SET archived_at = now()** (não excluir)
3. **Instituição arquivada:** dados permanecem acessíveis (read-only?) mas não aceita novos dados
4. **UI:** adicionar opção "Arquivar" em vez de "Excluir" no Settings (para admins)
5. **Mudar FKs `institution_id` de CASCADE para RESTRICT** para impedir exclusão acidental

### Não implementar agora.

---

## T. RISCOS ENCONTRADOS

### RISCO 1 — ALTO: list_institution_users expõe dados de qualquer instituição

A função `list_institution_users` é SECURITY DEFINER, executável por PUBLIC (incluindo anon), não verifica `auth.uid()`, não verifica membership, não verifica admin. **Qualquer pessoa na internet pode listar usuários (incluindo emails) de qualquer instituição.**

### RISCO 2 — ALTO: handle_user_registration não verifica auth.uid()

A função `handle_user_registration` recebe `user_id` como parâmetro e não verifica que `user_id = auth.uid()`. Um usuário autenticado pode chamar esta função com o ID de outro usuário, criando uma instituição e tornando esse usuário admin.

### RISCO 3 — ALTO: join_institution não verifica auth.uid()

A função `join_institution` recebe `user_id` como parâmetro e não verifica que `user_id = auth.uid()`. Um atacante com um código de convite válido pode associar qualquer usuário a uma instituição.

### RISCO 4 — ALTO: copy_data_to_institution não verifica nada

A função `copy_data_to_institution` é SECURITY DEFINER, executável por anon/authenticated, não verifica `auth.uid()`, não verifica membership, não verifica admin. **Qualquer pessoa pode copiar dados entre quaisquer instituições.**

### RISCO 5 — ALTO: Todas as SECURITY DEFINER executáveis por anon

Todas as 13 funções SECURITY DEFINER têm EXECUTE concedido a `anon`. Mesmo as funções que verificam `auth.uid()` (como `create_invitation`) podem ser chamadas por anon (embora falhem na verificação), mas funções que não verificam `auth.uid()` (como `list_institution_users`, `copy_data_to_institution`, `handle_user_registration`, `join_institution`) são vulneráveis.

### RISCO 6 — MEDIO: search_path não definido em 8 de 13 funções

As funções `check_institution_exists`, `clean_expired_invitations`, `copy_data_to_institution`, `delete_invitation`, `handle_new_user`, `list_active_invitations`, `list_institution_users`, `toggle_user_admin_status`, `update_season_status` não definem `search_path`. Apenas `create_invitation`, `handle_user_registration`, `join_institution`, `validate_invitation` definem `SET search_path TO 'public'`. search_path não definido permite ataques de search_path injection.

### RISCO 7 — MEDIO: Policy "Enable insert for authenticated users only" em areas

A policy `WITH CHECK = true` permite que qualquer usuário autenticado insira áreas com qualquer `institution_id`, não apenas o seu. Se o mesmo padrão existe em products e operations, usuários podem inserir dados em instituições de outras pessoas.

### RISCO 8 — MEDIO: list_active_invitations não verifica admin

A função `list_active_invitations` verifica que o usuário pertence à instituição, mas não verifica que é admin. Qualquer membro pode ver códigos de convite ativos e potencialmente usá-los.

### RISCO 9 — MEDIO: CASCADE em user_id pode apagar histórico

7 FKs de `auth.users(id)` usam CASCADE em colunas `user_id` de tabelas de negócio. Se um usuário for excluído do Auth, seus dados (áreas, safras, operações, máquinas, manutenções, notas) seriam apagados em cascade. As FKs RESTRICT das Etapas 1B-1D bloqueiam alguns casos, mas não todos (2 de 6 usuários podem ser deletados sem bloqueio).

### RISCO 10 — MEDIO: CASCADE em institution_id pode apagar toda uma instituição

10 FKs de `institutions(id)` usam CASCADE. Se uma instituição for excluída (via SQL direto ou Supabase Dashboard), TODOS os dados seriam apagados. As FKs RESTRICT bloqueiam para instituições com operações/lotes/manutenções, mas instituições vazias podem ser excluídas.

### RISCO 11 — BAIXO: update_season_status não verifica institution_id

A função verifica `user_id = auth.uid()` mas não `institution_id`. Se um usuário souber o ID de uma safra de outra instituição, poderia alterar seu status.

### RISCO 12 — BAIXO: 501 productIds inválidos em operations.products_used

Existem 501 referências em `operations.products_used` que apontam para produtos inexistentes. Isso é um problema de integridade referencial pré-existente dentro do JSONB. As FKs RESTRICT das Etapas 1B-1D não resolvem isso porque `products_used` é um JSONB, não uma FK.

---

## U. INFORMAÇÕES INDETERMINADAS

1. **Policy "Enable insert" em products/operations:** A query RLS foi truncada. Não foi possível confirmar se products e operations também têm a policy permissiva "Enable insert for authenticated users only" com `WITH CHECK = true`. **Recomenda-se verificação em etapa futura.**

2. **Conteúdo exato de operations.products_used:** Os 501 productIds inválidos podem ser produtos que foram excluídos antes das FKs RESTRICT serem implementadas, ou podem ser IDs com formato incorreto. Não foi possível determinar a causa exata sem analisar os dados do JSONB.

3. **Motivo de created_by NULL em institutions:** 5 de 6 instituições têm `created_by = NULL`. Pode ser porque o usuário criador foi removido (SET NULL), ou porque a função que criou a instituição não definiu `created_by`, ou porque as instituições foram criadas manualmente via SQL.

4. **Se o trigger handle_new_user e handle_user_registration conflitam:** O trigger cria um perfil com `institution_id = NULL` e `is_admin = false`. Depois `handle_user_registration` faz INSERT/UPDATE. Se `handle_user_registration` faz INSERT e o trigger já criou a row, o INSERT falha (duplicate key) e cai no UPDATE. Isso parece funcionar (ON CONFLICT), mas a interação exata não foi testada.

5. **Política de products para INSERT:** Não foi confirmado se products tem a policy permissiva "Enable insert". Se tiver, qualquer usuário pode criar produtos em qualquer instituição.

---

## V. RECOMENDAÇÃO PARA ETAPA 1F

### Ordem sugerida de priorização:

1. **FIXAR search_path em todas as funções SECURITY DEFINER** — risco de injection, fácil de corrigir, baixo risco de quebrar funcionalidade.

2. **REVOKE EXECUTE de anon em todas as funções** — nenhuma função deveria ser executável por usuários não autenticados (exceto `validate_invitation` que pode ser necessária no fluxo de registro, mas mesmo essa poderia ser authenticated-only).

3. **Adicionar verificação de auth.uid() em handle_user_registration e join_institution** — substituir o parâmetro `user_id` por `auth.uid()` ou adicionar `IF user_id != auth.uid() THEN RAISE EXCEPTION`.

4. **Adicionar verificação de auth.uid() e membership em list_institution_users** — necessário para parar o vazamento de dados.

5. **Adicionar verificação em copy_data_to_institution** — verificar que o caller é admin da instituição source E target.

6. **Remover a policy "Enable insert for authenticated users only" de areas** (e products/operations se existir) — a policy permissiva `WITH CHECK = true` permite inserção em qualquer institution_id.

7. **Mudar FKs user_id de CASCADE para RESTRICT** — preservar histórico quando usuário é excluído. Isto é a continuação natural das Etapas 1B-1D.

8. **Mudar FKs institution_id de CASCADE para RESTRICT** — preservar dados da instituição. Depende de decidir o modelo de arquivamento.

9. **Avaliar desativação vs exclusão** — adicionar `is_active` em user_profiles e institutions.

### Não iniciar agora:

Esta etapa é READ-ONLY. Pare e aguarde revisão externa.

---

## RESUMO EXECUTIVO

A auditoria revelou que o sistema usa um modelo simples de 1 usuário → 1 instituição, com `user_profiles.institution_id` como única fonte de associação. O RLS está habilitado em todas as tabelas e usa uma estratégia consistente de filtragem por `institution_id` via subquery em `user_profiles`.

Foram identificados **12 riscos**, sendo **4 CRÍTICOS/ALTOS** relacionados a funções SECURITY DEFINER que não verificam `auth.uid()` e são executáveis por `anon`, permitindo acesso não autorizado a dados de usuários e instituições. O risco mais grave é `list_institution_users`, que permite a qualquer pessoa na internet listar emails de usuários de qualquer instituição.

As FKs de `auth.users(id)` e `institutions(id)` usam predominantemente CASCADE, o que significa que excluir um usuário ou instituição pode apagar dados de negócio. As FKs RESTRICT das Etapas 1B-1D oferecem proteção parcial, bloqueando a exclusão quando há operações/lotes/manutenções dependentes, mas não cobrem todos os casos.

**Nenhum dado foi alterado. Nenhuma migration foi criada. Nenhum arquivo foi modificado.**

PAREI E AGUARDO REVISÃO EXTERNA. Não iniciarei Etapa 1F. Não alterarei outras FKs. Não implementarei soft delete. Não mexerei no offline.
