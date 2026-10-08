# ETAPA 2A — AUDITORIA GLOBAL COMPACTA DE RLS

**Data:** 2026-10-07  
**Modo:** READ-ONLY ABSOLUTO

---

## A. Inventário RLS

14 tabelas no schema public. 49 policies no total (esperado: 49 — OK).

| Tabela | RLS Enabled | RLS Forced | Policies |
|---|---|---|---|
| areas | true | false | 5 |
| institutions | true | false | 2 |
| invitations | true | false | 2 |
| machinery | true | false | 4 |
| maintenance_types | true | false | 4 |
| maintenances | true | false | 4 |
| notes | true | false | 4 |
| operation_products | **false** | false | 4 |
| operations | true | false | 4 |
| product_lots | true | false | 4 |
| products | true | false | 5 |
| seasons | true | false | 4 |
| spatial_ref_sys | false | false | 0 |
| user_profiles | true | false | 3 |

**Divergência 1:** `operation_products` tem RLS **DESATIVADA**. Apesar de ter 4 policies definidas, elas não são aplicadas porque RLS está desabilitada. A tabela é acessível via API com grants plenos para anon e authenticated.

**Divergência 2:** Nenhuma tabela tem `RLS FORCED`. Sem `FORCE ROW LEVEL SECURITY`, o owner (postgres) bypassa RLS. Isso é esperado para SECURITY DEFINER functions, mas deve ser notado.

---

## B. Policies por Tabela

### areas (5 policies)

| Policy | Cmd | Permissive | USING | WITH CHECK |
|---|---|---|---|---|
| Enable insert for authenticated users only | INSERT | P | — | **true** |
| Users can create areas in their institution | INSERT | P | — | institution_id IN (SELECT user_profiles.institution_id WHERE id = auth.uid()) |
| Users can delete areas in their institution | DELETE | P | institution_id IN (...) | — |
| Users can read areas from their institution | SELECT | P | institution_id IN (...) | — |
| Users can update areas in their institution | UPDATE | P | institution_id IN (...) | institution_id IN (...) |

### institutions (2 policies)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can create institutions | INSERT | — | NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND institution_id IS NOT NULL) |
| Users can read their own institution | SELECT | id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid()) | — |

### invitations (2 policies)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| Admins can create invitations | INSERT | — | EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = invitations.institution_id) |
| Users can read invitations for their institution | SELECT | institution_id IN (...) | — |

### machinery (4 policies)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can create machinery in their institution | INSERT | — | institution_id IN (...) |
| Users can delete machinery in their institution | DELETE | institution_id IN (...) | — |
| Users can read machinery from their institution | SELECT | institution_id IN (...) | — |
| Users can update machinery in their institution | UPDATE | institution_id IN (...) | institution_id IN (...) |

### maintenance_types (4 policies) — mesmo padrão que machinery

### maintenances (4 policies) — mesmo padrão que machinery

### notes (4 policies) — mesmo padrão que machinery

### operations (4 policies) — mesmo padrão que machinery

### product_lots (4 policies)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| select_own_product_lots | SELECT | EXISTS (SELECT 1 FROM products p WHERE p.id = product_lots.product_id AND p.institution_id = (SELECT institution_id FROM user_profiles WHERE id = auth.uid())) | — |
| insert_own_product_lots | INSERT | — | EXISTS (SELECT 1 FROM products p WHERE p.id = product_lots.product_id AND p.institution_id = (SELECT ...)) |
| update_own_product_lots | UPDATE | EXISTS (...) | EXISTS (...) |
| delete_own_product_lots | DELETE | EXISTS (...) | — |

Isolamento via FK indireta: product_lots → products → institution_id. **Sem institution_id direto na tabela.**

### products (5 policies)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can create products in their institution | INSERT | — | institution_id IN (...) |
| Users can read products from their institution | SELECT | institution_id IN (...) | — |
| Users can update products in their institution | UPDATE | institution_id IN (...) | institution_id IN (...) |
| Users can delete products from their institution | DELETE | institution_id IN (...) | — |
| Users can delete products in their institution | DELETE | institution_id IN (...) | — |

**Duplicação:** Duas policies DELETE com mesma expressão, nomes diferentes. Funcionalmente inofensiva, mas desnecessária.

### seasons (4 policies) — mesmo padrão que machinery (institution_id IN (...))

### user_profiles (3 policies)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can create own profile | INSERT | — | auth.uid() = id |
| Users can read own profile | SELECT | auth.uid() = id | — |
| Users can update own profile | UPDATE | auth.uid() = id | auth.uid() = id |

**Modelo: ownership (auth.uid() = id), NÃO institution_id.** Usuário só vê/edita o próprio perfil. Não pode ver outros perfis da mesma instituição via RLS direta.

### operation_products (4 policies, RLS DESATIVADA)

| Policy | Cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can create own operation products | INSERT | — | EXISTS (SELECT 1 FROM operations WHERE operations.id = operation_products.operation_id AND operations.user_id = auth.uid()) |
| Users can read own operation products | SELECT | EXISTS (...) | — |
| Users can update own operation products | UPDATE | EXISTS (...) | EXISTS (...) |
| Users can delete own operation products | DELETE | EXISTS (...) | — |

**Modelo: ownership via operations.user_id = auth.uid().** Mas RLS está DESLIGADA — policies não aplicadas.

---

## C. Achados Perigosos

### CRÍTICO-1: `operation_products` RLS DESATIVADA

**Risco: CRITICAL.** A tabela tem policies definidas mas RLS está off. Qualquer usuário autenticado (ou anon) com grants de SELECT/INSERT/UPDATE/DELETE pode acessar TODOS os registros de operation_products, de qualquer instituição. As policies são ignoradas.

### CRÍTICO-2: `areas` INSERT com `WITH CHECK (true)`

**Risco: CRITICAL.** A policy "Enable insert for authenticated users only" tem `WITH CHECK = true`. Como é PERMISSIVE e combinada por OR com a policy "Users can create areas in their institution" (WITH CHECK = institution_id IN (...)), o resultado efetivo é: `true OR institution_check = true`. Qualquer usuário autenticado pode inserir uma area com **qualquer institution_id**, incluindo de outra instituição.

### ALTO-1: `products` policy DELETE duplicada

**Risco: LOW.** Duas policies DELETE idênticas. Funcionalmente inofensiva (OR de duas expressões idênticas = mesma expressão), mas indica detrito de migration.

### ALTO-2: `user_profiles` sem isolamento institution_id

**Risco: MEDIUM.** user_profiles usa apenas `auth.uid() = id`. Um admin não consegue ver outros usuários da sua instituição via RLS direta da tabela. Isso é suprido pela function `list_institution_users` (SECURITY DEFINER), que faz a consulta sem RLS. Se essa function for comprometida, não há fallback de RLS.

### ALTO-3: `institutions` sem UPDATE/DELETE policy

**Risco: MEDIUM.** institutions tem apenas INSERT e SELECT. UPDATE e DELETE não têm policy — significa que nenhum usuário autenticado pode UPDATE/DELETE via API (deny-by-default com RLS). Apenas postgres/service_role (via SECURITY DEFINER ou bypass) podem. Funcionalmente seguro, mas pode limitar administração futura.

### ALTO-4: `invitations` sem DELETE/UPDATE policy via RLS

**Risco: LOW.** invitations tem apenas INSERT e SELECT. DELETE e UPDATE são feitos via SECURITY DEFINER functions (`delete_invitation`, `validate_invitation`). Seguro enquanto as functions estiverem corretas.

---

## D. Análise Especial de areas

**A policy permissiva ainda existe?** SIM.

**Nome exato:** `Enable insert for authenticated users only`  
**Roles:** authenticated  
**Command:** INSERT  
**Permissive/Restrictive:** PERMISSIVE  
**Expressão:** `WITH CHECK (true)`  
**USING:** null

**Outras INSERT policies em areas:** `Users can create areas in their institution` — WITH CHECK: `institution_id IN (SELECT user_profiles.institution_id WHERE id = auth.uid())`

**Combinação lógica efetiva:** Ambas são PERMISSIVE para INSERT. PostgreSQL combina por OR:  
`true OR (institution_id IN (...))` = **sempre true**

**Um usuário autenticado da instituição A consegue inserir uma area com institution_id da instituição B?**

**SIM.** A policy "Enable insert for authenticated users only" tem `WITH CHECK (true)`, que é PERMISSIVE e combinada por OR com a policy de instituição. O resultado é que qualquer institution_id passa na validação. O isolamento de INSERT em areas está completamente comprometido.

---

## E. Ownership vs Institution

Tabelas onde coexistem dois modelos:

| Tabela | user_id | institution_id | Modelo efetivo |
|---|---|---|---|
| areas | sim | sim | institution_id (SELECT/UPDATE/DELETE); **INSERT comprometido** (WITH CHECK true) |
| seasons | sim | sim | institution_id (todos os comandos) |
| operations | sim | sim | institution_id (todos os comandos) |
| machinery | sim | sim | institution_id (todos os comandos) |
| maintenance_types | sim | sim | institution_id (todos os comandos) |
| maintenances | sim | sim | institution_id (todos os comandos) |
| notes | sim | sim | institution_id (todos os comandos) |
| user_profiles | não | sim | ownership (auth.uid() = id) — institution_id não usado em RLS |
| operation_products | não | não (sem coluna) | ownership via operations.user_id — **mas RLS OFF** |

**Conclusão:** A maioria das tabelas migra para institution_id, mas user_profiles mantém ownership puro, e operation_products mantém ownership via FK mas com RLS desativada.

---

## F. Relações Indiretas

### product_lots → products → institution_id

product_lots não tem institution_id direto. A RLS valida via subquery em products. **Funcionalmente correto** — o isolamento depende de products ter RLS correta (que tem). Se products for comprometido, product_lots também será.

### operation_products → operations → user_id (NÃO institution_id)

operation_products não tem institution_id nem user_id. A RLS (se estivesse ativa) valida via `operations.user_id = auth.uid()`. Isso é **ownership, não institution** — um usuário não consegue acessar operation_products de operações de outros usuários da mesma instituição. **Modelo inconsistente** com o resto do app.

### maintenances → machinery → institution_id

maintenances tem institution_id direto, então não precisa de join indireto. OK.

---

## G. Matriz SELECT/INSERT/UPDATE/DELETE

| Tabela | SELECT | INSERT | UPDATE | DELETE | Risco |
|---|---|---|---|---|---|
| areas | SAFE | **UNSAFE** | SAFE | SAFE | **CRITICAL** |
| institutions | SAFE | SAFE | NO POLICY | NO POLICY | LOW |
| invitations | SAFE | SAFE | NO POLICY | NO POLICY | LOW |
| machinery | SAFE | SAFE | SAFE | SAFE | OK |
| maintenance_types | SAFE | SAFE | SAFE | SAFE | OK |
| maintenances | SAFE | SAFE | SAFE | SAFE | OK |
| notes | SAFE | SAFE | SAFE | SAFE | OK |
| operation_products | **UNSAFE** | **UNSAFE** | **UNSAFE** | **UNSAFE** | **CRITICAL** |
| operations | SAFE | SAFE | SAFE | SAFE | OK |
| product_lots | SAFE | SAFE | SAFE | SAFE | OK |
| products | SAFE | SAFE | SAFE | SAFE | OK |
| seasons | SAFE | SAFE | SAFE | SAFE | OK |
| user_profiles | SAFE (own only) | SAFE (own only) | SAFE (own only) | NO POLICY | MEDIUM |
| spatial_ref_sys | NO POLICY | NO POLICY | NO POLICY | NO POLICY | OK (sistema) |

---

## H. Prioridades de Correção

### P0 — CRITICAL ( mesma migration)

| # | Tabela | Policy | Problema | Impacto | Correção Conceitual |
|---|---|---|---|---|---|
| 1 | areas | "Enable insert for authenticated users only" | WITH CHECK (true) permite INSERT cross-institution | Usuário de inst A insere area em inst B | **DROP** esta policy. Manter apenas "Users can create areas in their institution" |
| 2 | operation_products | (RLS desativada) | RLS OFF — todas as policies ignoradas | Qualquer usuário acessa operation_products de qualquer instituição | **ALTER TABLE operation_products ENABLE ROW LEVEL SECURITY** |

### P1 — MEDIUM (migration separada ou mesma)

| # | Tabela | Policy | Problema | Impacto | Correção Conceitual |
|---|---|---|---|---|---|
| 3 | products | "Users can delete products from their institution" + "Users can delete products in their institution" | DELETE duplicada | Detrito, sem risco funcional | DROP uma das duas |
| 4 | operation_products | policies usam operations.user_id = auth.uid() | Modelo ownership em vez de institution | Inconsistência de isolamento | Reescrever policies para usar operations.institution_id via join com user_profiles |

### P2 — LOW (opcional)

| # | Tabela | Problema | Correção Conceitual |
|---|---|---|---|
| 5 | user_profiles | Sem policy institution_id para SELECT | Adicionar policy SELECT por institution_id (para admins verem usuários da própria instituição sem depender de SECURITY DEFINER) |
| 6 | institutions | Sem UPDATE/DELETE policy | Avaliar se admins precisam editar instituição via API ou se SECURITY DEFINER basta |

### Agrupamento sugerido:

- **Migration 1 (P0):** DROP policy "Enable insert for authenticated users only" em areas + ENABLE RLS em operation_products. Pode ser feito seguramente sem alterar dados.

---

## I. Counts PRE/POST

| Tabela | PRE | POST | Match |
|---|---|---|---|
| areas | 44 | 44 | SIM |
| seasons | 5 | 5 | SIM |
| operations | 309 | 309 | SIM |
| products | 217 | 217 | SIM |
| product_lots | 149 | 149 | SIM |
| machinery | 19 | 19 | SIM |
| maintenances | 3 | 3 | SIM |
| notes | 8 | 8 | SIM |

**ZERO DATA LOSS.** Etapa exclusivamente read-only.

---

## J. Divergências

1. **operation_products RLS OFF** — 4 policies existem mas são ignoradas. CRÍTICO.
2. **areas INSERT WITH CHECK (true)** — policy permissiva que anula o isolamento de institution_id no INSERT. CRÍTICO.
3. **products DELETE duplicada** — duas policies idênticas. Cosmético.
4. **user_profiles sem RLS de institution_id** — modelo ownership puro, sem fallback.
5. **operation_products usa user_id em vez de institution_id** — inconsistência de modelo.
6. **RLS FORCED = false em todas as tabelas** — postgres bypassa RLS. Esperado para SECURITY DEFINER, mas relevante.
7. **49 policies confirmado** — corresponde ao esperado.

### Proteções anteriores intactas:

- 28 FKs total: 20 CASCADE, 5 RESTRICT, 3 SET NULL
- 13 funções protegidas: todas com search_path=public,pg_temp, PUBLIC=false
- check_institution_exists e validate_invitation: anon=true (intencional)
- Todas as demais: anon=false

---

**Status:** READ-ONLY ABSOLUTO. Nenhuma alteração foi feita. ZERO DATA LOSS. Aguardando revisão externa.

STOP.
