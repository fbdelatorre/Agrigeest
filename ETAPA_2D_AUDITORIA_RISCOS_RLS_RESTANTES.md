# ETAPA 2D — AUDITORIA DOS RISCOS RLS RESTANTES

**Data:** 2026-10-07
**Modo:** READ-ONLY ABSOLUTO

---

## A. MATRIZ CROSS-INSTITUTION

| Table | SELECT | INSERT | UPDATE | DELETE | RISCO REAL |
|---|---|---|---|---|---|
| institutions | BLOCKED | OK (só sem institution) | BLOCKED | BLOCKED | OK |
| user_profiles | BLOCKED (só próprio) | OK (só próprio id) | **POSSIBLE** | BLOCKED | **CRITICAL** |
| areas | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| seasons | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| operations | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| products | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| product_lots | BLOCKED (via parent) | BLOCKED (via parent) | BLOCKED (via parent) | BLOCKED (via parent) | OK |
| machinery | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| maintenance_types | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| maintenances | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| notes | BLOCKED | BLOCKED | BLOCKED | BLOCKED | OK |
| invitations | BLOCKED | BLOCKED (admin+inst) | N/A | via function | OK |
| operation_products | N/A (isolated) | N/A (isolated) | N/A (isolated) | N/A (isolated) | OK |

BLOCKED = instituição A não acessa dados da instituição B.
"BLOCKED (só próprio)" = isolado por usuário, não por instituição.

---

## B. OWNERSHIP BYPASSES

Tabelas com user_id + institution_id: areas, seasons, operations, machinery, maintenance_types, maintenances, notes.

**Todas as policies** destas tabelas usam exclusivamente `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())`.

**Nenhuma policy usa `user_id = auth.uid()` como condição de RLS.**

Resultado: nenhum ownership bypass via OR de policies PERMISSIVE.

Simulação `auth.uid() = row.user_id MAS row.institution_id != instituição atual`:
- Todas as tabelas acima: SELECT/UPDATE/DELETE = **NÃO** (a policy institucional é a única condição).

---

## C. USER_PROFILES

Columns: id, phone, role, institution(text), created_at, updated_at, first_name, last_name, institution_id(uuid), is_admin(boolean), email

Policies:
- SELECT: `auth.uid() = id` → só vê próprio profile
- INSERT: WITH CHECK `auth.uid() = id`
- UPDATE: USING `auth.uid() = id`, WITH CHECK `auth.uid() = id`
- DELETE: nenhuma → BLOCKED

**Respostas:**

A. SELECT apenas próprio profile? **SIM**
B. SELECT de colegas? **NÃO** (mas list_institution_users function resolve listagem institucional)
C. Functions SECURITY DEFINER responsáveis pela listagem institucional? **SIM** (list_institution_users)
D. Usuário pode alterar institution_id? **SIM** — UPDATE permite alterar qualquer coluna do próprio row. WITH CHECK só valida `auth.uid() = id`, não valida institution_id.
E. Pode alterar is_admin? **SIM** — mesma razão. WITH CHECK não valida is_admin.
F. Pode alterar campos sensíveis diretamente? **SIM** — institution_id, is_admin, role, email todos alteráveis.
G. WITH CHECK impede mudança perigosa? **NÃO** — só checa id = auth.uid().
H. Caminho para autoelevação a admin? **SIM** — `UPDATE user_profiles SET is_admin = true WHERE id = auth.uid()`.
I. Caminho para trocar institution_id diretamente? **SIM** — `UPDATE user_profiles SET institution_id = '<uuid_alheio>' WHERE id = auth.uid()`.

**CRÍTICO: user_profiles UPDATE é FRONTEND ONLY para institution_id e is_admin.** O banco não impede alteração.

---

## D. MISMATCHES REAIS user/institution

| Table | Mismatch Count |
|---|---|
| areas | 0 |
| seasons | 0 |
| operations | 0 |
| machinery | 0 |
| maintenance_types | 0 |
| maintenances | 0 |
| notes | 0 |

Zero registros inconsistentes atualmente.

---

## E. INSERTS: DATABASE ENFORCED vs FRONTEND ONLY

| Table | institution_id enforced by DB? | Classification |
|---|---|---|
| areas | SIM (WITH CHECK) | DATABASE ENFORCED |
| seasons | SIM | DATABASE ENFORCED |
| operations | SIM | DATABASE ENFORCED |
| products | SIM | DATABASE ENFORCED |
| product_lots | SIM (via parent product) | DATABASE ENFORCED |
| machinery | SIM | DATABASE ENFORCED |
| maintenance_types | SIM | DATABASE ENFORCED |
| maintenances | SIM | DATABASE ENFORCED |
| notes | SIM | DATABASE ENFORCED |
| invitations | SIM (admin + inst match) | DATABASE ENFORCED |
| institutions | SIM (só se sem institution) | DATABASE ENFORCED |
| user_profiles | institution_id: **NÃO** | **FRONTEND ONLY** |
| user_profiles | is_admin: **NÃO** | **FRONTEND ONLY** |

**FRONTEND ONLY destacado:** user_profiles.institution_id e user_profiles.is_admin não têm validação no banco.

---

## F. RELAÇÕES INDIRETAS

**product_lots → products:**
- 4 policies usam `EXISTS(SELECT 1 FROM products p WHERE p.id = product_lots.product_id AND p.institution_id = (SELECT institution_id FROM user_profiles WHERE id = auth.uid()))`.
- Acesso garantido apenas quando o produto pai pertence à instituição do usuário. **OK**.

**maintenances → machinery / maintenance_types:**
- maintenances tem institution_id direto. Todas as 4 policies usam institution_id IN (...). Não depende de JOIN com machinery. **OK**.

---

## G. SECURITY DEFINER BYPASSES RESTANTES

Functions SECURITY DEFINER com execute para anon/authenticated:

| Function | Callable by | Bypass? | Motivo |
|---|---|---|---|
| check_institution_exists | anon + authenticated | **YES** | Permite enumerar nomes de instituições a qualquer usuário (inclusive anônimo). Retorna booleano para qualquer nome consultado. |
| update_season_status | authenticated | **YES** | Usa `user_id = auth.uid()` em vez de `institution_id`. Se user_id criou a season mas trocou de instituição (via P0 user_profiles), ainda pode atualizar seasons da instituição antiga. |
| handle_new_user | authenticated | NO | Cria profile com institution_id NULL. |
| handle_user_registration | authenticated | NO | Hardened em 1G. |
| join_institution | authenticated | NO | Hardened em 1G_B. |
| list_institution_users | authenticated | NO | Hardened em 1F_A. |
| list_active_invitations | authenticated | NO | Hardened em 1H_B. |
| create_invitation | authenticated | NO | Hardened em 1H_E. |
| delete_invitation | authenticated | NO | Hardened em 1H_D. |
| validate_invitation | anon + authenticated | NO | Hardened em 1H. |
| toggle_user_admin_status | authenticated | NO | Hardened em 1H_J. |
| copy_data_to_institution | authenticated | NO | Hardened em 1F_C. |
| clean_expired_invitations | — | NO | Sem execute para API. |

---

## H. PROBLEMAS P0/P1/P2

### P0-1
- **TABLE:** user_profiles
- **OPERATION:** UPDATE
- **VULNERABILITY:** WITH CHECK só valida `auth.uid() = id`. Não valida institution_id. Usuário pode alterar institution_id para qualquer instituição.
- **IMPACT:** Acesso cross-institution completo a todas as tabelas empresariais (areas, seasons, operations, products, etc.).

### P0-2
- **TABLE:** user_profiles
- **OPERATION:** UPDATE
- **VULNERABILITY:** WITH CHECK não valida is_admin. Usuário pode autoeleva a admin.
- **IMPACT:** Privilégio de admin na instituição (criar convites, gerenciar usuários).

### P1-1
- **TABLE:** check_institution_exists (function)
- **OPERATION:** EXECUTE
- **VULNERABILITY:** Callable por anon. Permite enumeração de nomes de instituições.
- **IMPACT:** Information disclosure — atacante pode descobrir nomes de instituições cadastradas.

### P1-2
- **TABLE:** update_season_status (function)
- **OPERATION:** EXECUTE
- **VULNERABILITY:** Usa user_id em vez de institution_id. Encadeado com P0-1, permite atualizar seasons de instituição antiga.
- **IMPACT:** Modificação de dados de outra instituição após troca de institution_id.

### P2-1
- **TABLE:** products
- **OPERATION:** DELETE
- **VULNERABILITY:** 2 policies DELETE duplicadas (mesma expressão USING, ambas PERMISSIVE).
- **IMPACT:** Nenhum (OR de expressão idêntica = mesma expressão). SECURITY IMPACT = NO.

### IGNORE
- operation_products: isolada da API, RLS OFF intencional, 0 registros, 0 callers.

---

## I. COUNTS PRE/POST

| Table | PRE | POST |
|---|---|---|
| user_profiles | 6 | 6 |
| institutions | 6 | 6 |
| areas | 44 | 44 |
| seasons | 5 | 5 |
| operations | 309 | 309 |
| products | 217 | 217 |

PRE = POST. ZERO DATA LOSS.

---

## J. ESTADO 2C

- areas: policy WITH CHECK(true) removida. RLS enabled. **CONFIRMADO.**
- operation_products: RLS disabled. PUBLIC/anon/authenticated sem privilégios (0 API grants). 4 policies preservadas. **CONFIRMADO.**
- Total policies: 48. **CONFIRMADO.**

---

## K. DIVERGÊNCIAS

1. **user_profiles UPDATE** é a única tabela onde o WITH CHECK não valida campos sensíveis (institution_id, is_admin). Todas as outras tabelas empresariais validam institution_id no banco.
2. **check_institution_exists** é a única function SECURITY DEFINER ainda callable por anon sem restrição de auth.
3. **update_season_status** é a única function que usa user_id em vez de institution_id para autorização.
4. products tem 2 policies DELETE duplicadas (cosmético, sem impacto de segurança).

---

## STATUS: PASS (AUDITORIA READ-ONLY)

Nenhuma alteração feita. Nenhuma migration criada. Nenhum dado modificado.

2 problemas P0 encontrados (user_profiles UPDATE). 2 problemas P1 encontrados (functions). 1 problema P2 cosmético.

STOP.
