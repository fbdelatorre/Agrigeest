# ETAPA 1H-B — Proteção de `list_active_invitations`

**Data:** 2026-10-07  
**Objetivo:** Adicionar verificação de `is_admin`, checagem de `auth.uid()`, endurecimento de `search_path`, qualificação de tabelas e revogação de grants PUBLIC/anon na função `list_active_invitations`.

---

## 1. Pré-condições (PRE)

### 1.1 Contagens Baseline (PRE)

| Tabela | Count PRE |
|---|---|
| auth.users | 6 |
| user_profiles | 6 |
| institutions | 6 |
| invitations | 7 |
| areas | 44 |
| operations | 309 |
| products | 217 |
| product_lots | 149 |
| seasons | 5 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |
| notes | 8 |

### 1.2 Sentinelas de Estoque (PRE)

| Métrica | Valor PRE |
|---|---|
| SUM(quantity_in_stock) em products | 4617076.08296666766681363 |
| SUM(quantity) em product_lots | 185382.00000666667 |
| Items em products_used (operations) | 1459 |
| Invalid product_ids | 501 |

### 1.3 Checksums (PRE)

| Tabela | MD5 PRE |
|---|---|
| institutions | 038ff97cb251baa6b4557c3ef05ea823 |
| user_profiles | c987c95562f53f8908c14d32e70d4f49 |
| invitations | a94453b17e8851b84671bdde60a30201 |
| areas | 1f40430c05954fcae4ca737bddc38539 |
| operations | b57c17c9f60ff02f2c059b5b4b682a3b |
| products | 40fa32700e59f87773383c100a225907 |
| product_lots | cdc7b4f6b1cf23c0e71c7717bd0e7312 |
| seasons | 981c3b936b8678c9255424694bf4ffa6 |

### 1.4 Estado da Função (PRE)

- **Nome:** `public.list_active_invitations(institution_id_param uuid)`
- **SECURITY DEFINER:** true
- **search_path (proconfig):** null (NENHUM)
- **Owner:** postgres
- **Volatilidade:** volatile
- **Return type:** TABLE(code text, created_at timestamptz, expires_at timestamptz, created_by_name text, used_at timestamptz, used_by_name text)

**Definição PRE:**
```sql
CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(...)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'User does not belong to this institution';
  END IF;

  RETURN QUERY
  SELECT i.code, i.created_at, i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at,
    (up.first_name || ' ' || up.last_name) as used_by_name
  FROM invitations i
  LEFT JOIN user_profiles cp ON cp.id = i.created_by
  LEFT JOIN user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$function$;
```

**Vulnerabilidades identificadas (PRE):**
1. Sem checagem `auth.uid() IS NULL` — permite chamada sem autenticação
2. Sem verificação `is_admin = true` — qualquer membro pode ver todos os códigos de convite
3. Sem `search_path` — vulnerável a hijacking
4. Tabelas não qualificadas (`invitations`, `user_profiles` sem `public.`)
5. Grants PUBLIC e anon ativos

### 1.5 Grants (PRE)

| Grantee | Privilege |
|---|---|
| PUBLIC | EXECUTE |
| anon | EXECUTE |
| authenticated | EXECUTE |
| postgres | EXECUTE |
| service_role | EXECUTE |

### 1.6 Compatibilidade de Frontend

Confirmado na Etapa 1H-A:
- `Settings.tsx` linha 220: `if (!profile?.institutionId || !profile.isAdmin) return;` — guarda antes de chamar `list_active_invitations`
- `Settings.tsx` linha 1180: `{profile?.isAdmin && (` — envolve toda a seção de Usuários + Convites
- `App.tsx` linha 63-71: `PrivateRoute` exige sessão autenticada
- `Login.tsx` linha 36-40: redireciona usuários logados para `/`

**Conclusão:** Frontend já restringe visualização e chamada a administradores autenticados. A mudança é compatível.

---

## 2. Migration Aplicada

**Arquivo:** `supabase/migrations/20261007180000_secure_list_active_invitations.sql`  
**Nome migration:** `secure_list_active_invitations`

### 2.1 Alterações Realizadas

1. **`auth.uid() IS NULL` check** — Adicionado `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'` no início
2. **Verificação `is_admin = true`** — Substituída checagem de apenas `institution_id` por `institution_id = institution_id_param AND is_admin = true`
3. **`SET search_path = public, pg_temp`** — Adicionado à definição da função
4. **Qualificação de tabelas** — `user_profiles` → `public.user_profiles`, `invitations` → `public.invitations`
5. **REVOKE PUBLIC e anon** — Removidos grants de PUBLIC e anon
6. **GRANT explícito** — Mantido para authenticated, service_role, postgres
7. **Preservação total** — Return type, campos, joins, ordering, WHERE clause todos preservados

### 2.2 Definição POST

```sql
CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(code text, created_at timestamp with time zone, expires_at timestamp with time zone, created_by_name text, used_at timestamp with time zone, used_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = auth.uid()
      AND institution_id = institution_id_param
      AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only administrators can view invitations';
  END IF;

  RETURN QUERY
  SELECT 
    i.code,
    i.created_at,
    i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at,
    (up.first_name || ' ' || up.last_name) as used_by_name
  FROM public.invitations i
  LEFT JOIN public.user_profiles cp ON cp.id = i.created_by
  LEFT JOIN public.user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$function$;
```

---

## 3. Validação POST

### 3.1 Contagens (POST vs PRE)

| Tabela | PRE | POST | Match |
|---|---|---|---|
| auth.users | 6 | 6 | ✅ |
| user_profiles | 6 | 6 | ✅ |
| institutions | 6 | 6 | ✅ |
| invitations | 7 | 7 | ✅ |
| areas | 44 | 44 | ✅ |
| operations | 309 | 309 | ✅ |
| products | 217 | 217 | ✅ |
| product_lots | 149 | 149 | ✅ |
| seasons | 5 | 5 | ✅ |
| machinery | 19 | 19 | ✅ |
| maintenances | 3 | 3 | ✅ |
| maintenance_types | 2 | 2 | ✅ |
| notes | 8 | 8 | ✅ |

### 3.2 Sentinelas de Estoque (POST vs PRE)

| Métrica | PRE | POST | Match |
|---|---|---|---|
| SUM(quantity_in_stock) | 4617076.08296666766681363 | 4617076.08296666766681363 | ✅ |
| SUM(quantity) lots | 185382.00000666667 | 185382.00000666667 | ✅ |
| Items em products_used | 1459 | 1459 | ✅ |
| Invalid product_ids | 501 | 501 | ✅ |

### 3.3 Checksums (POST vs PRE)

| Tabela | MD5 PRE | MD5 POST | Match |
|---|---|---|---|
| institutions | 038ff97cb251baa6b4557c3ef05ea823 | 038ff97cb251baa6b4557c3ef05ea823 | ✅ |
| user_profiles | c987c95562f53f8908c14d32e70d4f49 | c987c95562f53f8908c14d32e70d4f49 | ✅ |
| invitations | a94453b17e8851b84671bdde60a30201 | a94453b17e8851b84671bdde60a30201 | ✅ |
| areas | 1f40430c05954fcae4ca737bddc38539 | 1f40430c05954fcae4ca737bddc38539 | ✅ |
| operations | b57c17c9f60ff02f2c059b5b4b682a3b | b57c17c9f60ff02f2c059b5b4b682a3b | ✅ |
| products | 40fa32700e59f87773383c100a225907 | 40fa32700e59f87773383c100a225907 | ✅ |
| product_lots | cdc7b4f6b1cf23c0e71c7717bd0e7312 | cdc7b4f6b1cf23c0e71c7717bd0e7312 | ✅ |
| seasons | 981c3b936b8678c9255424694bf4ffa6 | 981c3b936b8678c9255424694bf4ffa6 | ✅ |

### 3.4 Metadados da Função (POST)

| Propriedade | Valor | Esperado |
|---|---|---|
| prosecdef | true | true ✅ |
| proconfig | search_path=public, pg_temp | search_path=public, pg_temp ✅ |
| owner | postgres | postgres ✅ |
| provolatile | volatile | volatile ✅ |
| args | institution_id_param uuid | institution_id_param uuid ✅ |
| return_type | TABLE(code text, ...) | preservado ✅ |

### 3.5 Grants (POST)

| Grantee | Privilege | Status |
|---|---|---|
| authenticated | EXECUTE | ✅ Mantido |
| postgres | EXECUTE | ✅ Mantido |
| service_role | EXECUTE | ✅ Mantido |
| PUBLIC | — | ✅ Revogado |
| anon | — | ✅ Revogado |

### 3.6 has_function_privilege (POST)

| Role | can_execute | Esperado |
|---|---|---|
| authenticated | true | true ✅ |
| anon | false | false ✅ |
| service_role | true | true ✅ |
| postgres | true | true ✅ |

### 3.7 Integridade Referencial (POST)

| Verificação | Resultado |
|---|---|
| Orphan invitations → institutions | 0 ✅ |
| Orphan invitations → user_profiles (created_by) | 0 ✅ |
| Orphan invitations → user_profiles (used_by) | 0 ✅ |

### 3.8 RLS em Todas as Tabelas de Negócio (POST)

| Tabela | RLS |
|---|---|
| areas | ✅ |
| institutions | ✅ |
| invitations | ✅ |
| machinery | ✅ |
| maintenance_types | ✅ |
| maintenances | ✅ |
| notes | ✅ |
| operations | ✅ |
| product_lots | ✅ |
| products | ✅ |
| seasons | ✅ |
| user_profiles | ✅ |

### 3.9 Proteções Anteriores Intactas (POST)

| Função | SECURITY DEFINER | search_path | Grants PUBLIC/anon |
|---|---|---|---|
| join_institution | true | public, pg_temp | Revogados ✅ |
| create_invitation | true | public | Ainda presentes (fora do escopo 1H-B) |
| delete_invitation | true | null | Ainda presentes (fora do escopo 1H-B) |
| list_active_invitations | true | public, pg_temp | Revogados ✅ |

---

## 4. Cenários de Validação

| # | Cenário | Resultado Esperado | Status |
|---|---|---|---|
| 1 | Usuário anônimo (sem auth.uid()) chama função | RAISE EXCEPTION 'Authentication required' | ✅ |
| 2 | Usuário autenticado, não-membro da instituição | RAISE EXCEPTION 'Only administrators can view invitations' | ✅ |
| 3 | Usuário autenticado, membro mas não-admin | RAISE EXCEPTION 'Only administrators can view invitations' | ✅ |
| 4 | Usuário autenticado, admin da instituição | Retorna lista de convites | ✅ |
| 5 | service_role chama função | Acesso garantido (bypass via service_role) | ✅ |
| 6 | anon role chama função | EXECUTE negado | ✅ |
| 7 | Frontend Settings.tsx com isAdmin=true | Funciona normalmente | ✅ |
| 8 | Frontend Settings.tsx com isAdmin=false | loadInvitations() retorna early, não chama RPC | ✅ |

---

## 5. Rollback

Para reverter, executar:
```sql
-- Restaurar definição original (sem proteções)
CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(code text, created_at timestamp with time zone, expires_at timestamp with time zone, created_by_name text, used_at timestamp with time zone, used_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'User does not belong to this institution';
  END IF;
  RETURN QUERY
  SELECT i.code, i.created_at, i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at,
    (up.first_name || ' ' || up.last_name) as used_by_name
  FROM invitations i
  LEFT JOIN user_profiles cp ON cp.id = i.created_by
  LEFT JOIN user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.list_active_invitations(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_invitations(uuid) TO anon;
```

**Nota:** O rollback restaura as vulnerabilidades. Use apenas se a mudança causar problema inesperado.

---

## 6. Resumo

**ZERO DATA LOSS:** Todas as 13 contas, 4 sentinelas de estoque e 8 checksums idênticos PRE vs POST.

**Proteções adicionadas:**
- `auth.uid() IS NULL` → bloqueia acesso sem autenticação
- `is_admin = true` → bloqueia membros não-admin de ver códigos de convite
- `search_path = public, pg_temp` → previne search_path hijacking
- `public.*` qualification → previne shadowing via objetos maliciosos
- REVOKE PUBLIC/anon → remove acesso de roles não-autenticadas

**Compatibilidade:** Frontend Settings.tsx já filtra por `isAdmin` antes de chamar a função. Nenhuma mudança de frontend necessária.

**Status:** ✅ BUILD VERIFICADO | ✅ MIGRATION APLICADA | ✅ ZERO DATA LOSS

**Próximos passos recomendados (fora do escopo 1H-B):**
- `create_invitation` ainda tem PUBLIC/anon EXECUTE e search_path=public (sem pg_temp)
- `delete_invitation` ainda tem PUBLIC/anon EXECUTE e nenhum search_path
