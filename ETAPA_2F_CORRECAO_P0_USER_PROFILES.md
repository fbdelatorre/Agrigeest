# ETAPA 2F — CORREÇÃO P0 DE USER_PROFILES

**Data:** 2026-10-07
**Migration:** restrict_user_profiles_update_columns

---

## 1. PRE CHECK: PASS

- 11 colunas confirmadas: id, phone, role, institution, created_at, updated_at, first_name, last_name, institution_id, is_admin, email
- RLS enabled: SIM
- UPDATE policy: `auth.uid() = id` (USING + WITH CHECK)
- authenticated possui UPDATE geral da tabela: SIM (has_table_privilege = true)
- anon possui UPDATE: SIM (incorreto, corrigido nesta migration)
- 4 colunas self-editable confirmadas: first_name, last_name, phone, role
- Frontend (Settings.tsx) envia apenas: first_name, last_name, phone, role
- institution_id NÃO é enviado pela edição normal: confirmado
- is_admin NÃO é enviado pela edição normal: confirmado
- 4 functions SECURITY DEFINER / owner postgres: confirmado
- COUNT: 6 | CHECKSUM: acf37cea2049724a3583d8a6d07937cf
- Distribuição: INST_741ba2ae (2 users, 1 admin) | INST_e8741889 (4 users, 4 admins)

---

## 2. NOMES REAIS DAS 4 COLUNAS SELF-EDITABLE

```
first_name
last_name
phone
role
```

---

## 3. SQL EXECUTADO

```sql
-- Revoke table-level UPDATE from anon and authenticated
REVOKE UPDATE ON TABLE public.user_profiles FROM anon;
REVOKE UPDATE ON TABLE public.user_profiles FROM authenticated;

-- Grant UPDATE only on self-editable columns to authenticated
GRANT UPDATE (first_name, last_name, phone, role) ON public.user_profiles TO authenticated;
```

---

## 4. PRIVILÉGIOS POST DE authenticated

| Column | can_update |
|---|---|
| id | false |
| first_name | **true** |
| last_name | **true** |
| phone | **true** |
| role | **true** |
| institution | false |
| institution_id | false |
| is_admin | false |
| email | false |
| created_at | false |
| updated_at | false |

**Table-level UPDATE:** false

---

## 5. VALIDAÇÃO LÓGICA

| Cenário | Resultado |
|---|---|
| A: `UPDATE ... SET is_admin = true WHERE id = auth.uid()` | **BLOCKED** (sem privilégio de coluna) |
| B: `UPDATE ... SET institution_id = '<outra>' WHERE id = auth.uid()` | **BLOCKED** (sem privilégio de coluna) |
| C: `UPDATE ... SET first_name, last_name, phone, role WHERE id = auth.uid()` | **PERMITTED** (grant + RLS auth.uid() = id) |
| D: `UPDATE ... SET first_name WHERE id = '<outro_usuario>'` | **BLOCKED** (RLS auth.uid() = id falha) |

---

## 6. FUNCTIONS SECURITY DEFINER COMPATÍVEIS: SIM

| Function | SEC DEF | Owner | Compatível |
|---|---|---|---|
| handle_new_user | SIM | postgres | SIM (bypassa column grants) |
| handle_user_registration | SIM | postgres | SIM |
| join_institution | SIM | postgres | SIM |
| toggle_user_admin_status | SIM | postgres | SIM |

Todas rodam como owner postgres. Column-level grants não afetam SECURITY DEFINER functions.

---

## 7. USER_PROFILES: COUNT/CHECKSUM/DISTRIBUTION PRE/POST

| Metric | PRE | POST |
|---|---|---|
| COUNT | 6 | 6 |
| CHECKSUM | acf37cea2049724a3583d8a6d07937cf | acf37cea2049724a3583d8a6d07937cf |
| ADMIN_COUNT | 5 | 5 |
| NONADMIN | 1 | 1 |
| WITH_INST | 6 | 6 |
| NO_INST | 0 | 0 |
| INST_741ba2ae | 2 users, 1 admin | 2 users, 1 admin |
| INST_e8741889 | 4 users, 4 admins | 4 users, 4 admins |

PRE = POST. ZERO DATA LOSS.

---

## 8. ESTADO 2C/POLICIES/FKs INTACTOS: SIM

- areas: RLS enabled = SIM
- operation_products: RLS disabled (intencional) = SIM
- Total policies: 48 (inalterado)
- FKs: não modificadas nesta migration

---

## 9. FRONTEND INALTERADO/BUILD: SIM

0 arquivos frontend alterados. Build executado e aprovado.

---

## 10. ROLLBACK PREPARADO (NÃO EXECUTADO)

```sql
-- Rollback: restaurar UPDATE geral e remover column-level grants
REVOKE UPDATE (first_name, last_name, phone, role) ON public.user_profiles FROM authenticated;
GRANT UPDATE ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE ON TABLE public.user_profiles TO anon;
```

---

## 11. DIVERGÊNCIAS

Nenhuma. anon também tinha UPDATE geral incorretamente — corrigido como bônus da mesma migration (anon não tem nenhuma policy UPDATE, então já estava bloqueado por RLS, mas o grant não deveria existir).

---

## 12. STATUS: PASS

P0-1 e P0-2 eliminados. institution_id e is_admin não podem mais ser alterados diretamente por authenticated. Edição normal de perfil permanece funcional. Funções internas permanecem funcionais. Zero data loss.

STOP.
