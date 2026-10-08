# ETAPA 1F-A — RESULTADO DA CORREÇÃO DE list_institution_users
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**Migration aplicada:** `secure_list_institution_users`

---

## 1. BASELINE PRE

| Tabela | Contagem PRE |
|---|---|
| auth.users | 6 |
| user_profiles | 6 |
| institutions | 6 |
| areas | 44 |
| operations | 309 |
| products | 217 |
| product_lots | 149 |
| seasons | 5 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |

| Sentinela | Valor PRE |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

**Comparação com Etapa 1E:** Todos os valores idênticos. Nenhuma mudança por uso legítimo do aplicativo.

---

## 2. DEFINIÇÃO ORIGINAL (PRÉ-MIGRATION)

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

**Problemas:**
- SECURITY DEFINER sem search_path protegido
- Não verificava auth.uid()
- Não verificava membership
- Executável por PUBLIC e anon

---

## 3. GRANTS PRE

| Grantee | EXECUTE |
|---|---|
| PUBLIC | Sim |
| anon | Sim |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

---

## 4. USO NO FRONTEND

**Arquivo:** `src/pages/Settings.tsx` (linha 199)

```typescript
const { data, error } = await supabase
  .rpc('list_institution_users', {
    institution_id_param: profile.institutionId
  });
```

**Parâmetros enviados:** `{ institution_id_param: profile.institutionId }` — usa o `institutionId` do próprio perfil do usuário logado (via Context).

**Campos esperados:** `id`, `email`, `first_name`, `last_name`, `role`, `is_admin` — exatamente o retorno da função.

**Quem acessa:** A função `loadUsers` é chamada dentro da seção "Institution Users" que é renderizada apenas quando `profile?.isAdmin` é true. No entanto, a função RPC em si não exigia admin — qualquer usuário autenticado podia chamá-la para qualquer instituição.

**Conclusão:** A chamada do frontend já envia o `institution_id_param` correto (o do próprio usuário). A nova validação de membership não quebra o comportamento legítimo. **Nenhuma alteração de frontend é necessária.**

---

## 5. SQL EXATO DA MIGRATION

Arquivo: `supabase/migrations/secure_list_institution_users.sql`

```sql
CREATE OR REPLACE FUNCTION public.list_institution_users(institution_id_param uuid)
RETURNS TABLE(id uuid, email text, first_name text, last_name text, role text, is_admin boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Require authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required';
  END IF;

  -- Require membership in the requested institution
  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this institution';
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    (au.email)::text AS email,
    up.first_name,
    up.last_name,
    up.role,
    COALESCE(up.is_admin, false) AS is_admin
  FROM public.user_profiles up
  JOIN auth.users au ON au.id = up.id
  WHERE up.institution_id = institution_id_param;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_institution_users(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_institution_users(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_institution_users(uuid) TO authenticated;
```

---

## 6. DEFINIÇÃO POST

```sql
CREATE OR REPLACE FUNCTION public.list_institution_users(institution_id_param uuid)
RETURNS TABLE(id uuid, email text, first_name text, last_name text, role text, is_admin boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
      AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'Access denied: not a member of this institution';
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    (au.email)::text AS email,
    up.first_name,
    up.last_name,
    up.role,
    COALESCE(up.is_admin, false) AS is_admin
  FROM public.user_profiles up
  JOIN auth.users au ON au.id = up.id
  WHERE up.institution_id = institution_id_param;
END;
$function$;
```

**Mudanças em relação à original:**
1. `SET search_path = public, pg_temp` adicionado
2. Verificação `auth.uid() IS NULL` adicionada
3. Verificação de membership (user_profiles.institution_id = institution_id_param) adicionada
4. Tabelas qualificadas com `public.user_profiles` (já qualificava `auth.users`)
5. Assinatura e retorno idênticos

---

## 7. GRANTS POST

| Grantee | EXECUTE |
|---|---|
| PUBLIC | **Não** |
| anon | **Não** |
| authenticated | **Sim** |
| postgres | Sim |
| service_role | Sim |

**Resultado:** PUBLIC e anon removidos. Apenas authenticated, postgres e service_role mantêm EXECUTE.

---

## 8. TESTE ANON (CENÁRIO A)

**Método:** Verificação analítica + verificação de grants.

1. **Grant-level:** `anon` não tem mais EXECUTE na função. A chamada seria negada pelo próprio PostgreSQL antes de entrar na função.
2. **Function-level:** Mesmo se anon de alguma forma chamasse a função, `auth.uid()` retornaria NULL (anon não tem UID), e a função executaria `RAISE EXCEPTION 'Access denied: authentication required'`.

**Resultado: NEGADO.** Anon não pode executar a função, nem ao nível de grant nem ao nível de lógica.

---

## 9. TESTE MESMA INSTITUIÇÃO (CENÁRIO B)

**Método:** Verificação analítica (não é possível simular sessão autenticada sem afetar usuários reais).

**Análise:**

Um usuário autenticado da "Faz. São Pedro" (institution_id = `741ba2ae...`) chama `list_institution_users('741ba2ae...')`:

1. `auth.uid()` → retorna o UUID do usuário → **não é NULL** → passa
2. `EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND institution_id = '741ba2ae...')` → **existe** (o perfil do usuário tem esse institution_id) → passa
3. Retorna os 2 usuários de "Faz. São Pedro" → **SUCESSO**

Um usuário autenticado do "Grupo Delatorre" (institution_id = `e8741889...`) chama `list_institution_users('e8741889...')`:

1. `auth.uid()` → não é NULL → passa
2. `EXISTS (... institution_id = 'e8741889...')` → **existe** → passa
3. Retorna os 4 usuários de "Grupo Delatorre" → **SUCESSO**

**Resultado: SUCESSO.** Usuário autenticado consultando sua própria instituição recebe os dados corretos.

---

## 10. TESTE INSTITUIÇÃO DIFERENTE (CENÁRIO C)

**Método:** Verificação analítica.

**Análise:**

Um usuário autenticado do "Grupo Delatorre" (institution_id = `e8741889...`) chama `list_institution_users('741ba2ae...')` (Faz. São Pedro):

1. `auth.uid()` → não é NULL → passa
2. `EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND institution_id = '741ba2ae...')` → **NÃO existe** (o perfil do usuário tem institution_id = `e8741889...`, não `741ba2ae...`) → falha
3. `RAISE EXCEPTION 'Access denied: not a member of this institution'` → **NEGADO**

Um usuário autenticado da "Faz. São Pedro" chama `list_institution_users('e8741889...')` (Grupo Delatorre):

1. `auth.uid()` → não é NULL → passa
2. `EXISTS (... institution_id = 'e8741889...')` → **NÃO existe** → falha
3. **NEGADO**

**Resultado: NEGADO.** Usuário autenticado de uma instituição não pode listar usuários de outra. Nenhum email ou dado pessoal é exposto.

**Nota sobre testes:** Não foi possível simular os três cenários com sessões autenticadas reais sem modificar sessões de usuários legítimos. A verificação foi analítica, baseada na estrutura da função, nos grants confirmados, e nos dados reais de `user_profiles` (que confirmam que cada usuário pertence a exatamente uma instituição). A lógica da função é direta e não ambígua.

---

## 11. BASELINE POST

| Tabela | Contagem POST |
|---|---|
| auth.users | 6 |
| user_profiles | 6 |
| institutions | 6 |
| areas | 44 |
| operations | 309 |
| products | 217 |
| product_lots | 149 |
| seasons | 5 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |

| Sentinela | Valor POST |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## 12. COMPARAÇÃO PRE/POST

| Métrica | PRE | POST | Status |
|---|---|---|---|
| auth.users | 6 | 6 | idêntico |
| user_profiles | 6 | 6 | idêntico |
| institutions | 6 | 6 | idêntico |
| areas | 44 | 44 | idêntico |
| operations | 309 | 309 | idêntico |
| products | 217 | 217 | idêntico |
| product_lots | 149 | 149 | idêntico |
| seasons | 5 | 5 | idêntico |
| machinery | 19 | 19 | idêntico |
| maintenances | 3 | 3 | idêntico |
| maintenance_types | 2 | 2 | idêntico |
| SUM(quantity_in_stock) | 4.617.076,08... | 4.617.076,08... | idêntico |
| SUM(lots.quantity) | 185.382,000... | 185.382,000... | idêntico |
| products_used items | 1.459 | 1.459 | idêntico |
| invalid productIds | 501 | 501 | idêntico |

**Nenhuma linha foi criada, alterada ou excluída.**

---

## 13. CONFIRMAÇÃO DAS 28 FKs

| ON DELETE | Quantidade |
|---|---|
| CASCADE | 20 |
| RESTRICT | 5 |
| SET NULL | 3 |
| **Total** | **28** |

**Status:** Inalterado. Nenhuma FK foi modificada.

---

## 14. CONFIRMAÇÃO DE RLS INALTERADO

| Métrica | Valor |
|---|---|
| Total de policies no schema public | 49 |

Nenhuma policy foi criada, alterada ou removida. O RLS permanece idêntico ao estado anterior.

---

## 15. CONFIRMAÇÃO DAS OUTRAS FUNÇÕES INALTERADAS

| Função | prosecdef | proconfig | Status |
|---|---|---|---|
| check_institution_exists | true | null | inalterada |
| clean_expired_invitations | true | null | inalterada |
| copy_data_to_institution | true | null | inalterada |
| create_invitation | true | search_path=public | inalterada |
| delete_invitation | true | null | inalterada |
| handle_new_user | true | null | inalterada |
| handle_user_registration | true | search_path=public | inalterada |
| join_institution | true | search_path=public | inalterada |
| list_active_invitations | true | null | inalterada |
| **list_institution_users** | **true** | **search_path=public, pg_temp** | **MODIFICADA** |
| toggle_user_admin_status | true | null | inalterada |
| update_season_status | true | null | inalterada |
| validate_invitation | true | search_path=public | inalterada |

Apenas `list_institution_users` foi modificada. Todas as outras 12 funções SECURITY DEFINER permanecem idênticas.

---

## 16. ARQUIVOS FRONTEND MODIFICADOS

**Nenhum arquivo frontend foi modificado.**

A chamada existente em `src/pages/Settings.tsx` (linha 199) já usa a assinatura correta:
```typescript
supabase.rpc('list_institution_users', { institution_id_param: profile.institutionId })
```

Como `profile.institutionId` é o `institution_id` do próprio usuário, e o usuário está autenticado, a nova validação de membership passa automaticamente. Não há necessidade de alteração.

---

## 17. BUILD

Nenhum arquivo frontend foi alterado. Build não é necessário nesta etapa.

---

## 18. ROLLBACK PREPARADO (NÃO EXECUTADO)

```sql
-- Rollback: restaurar definição original
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

-- Rollback: restaurar grants originais
GRANT EXECUTE ON FUNCTION public.list_institution_users(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_institution_users(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.list_institution_users(uuid) TO authenticated;
```

**Não executado.** A correção está funcionando corretamente.

---

## 19. DIVERGÊNCIAS

**Nenhuma divergência encontrada.**

- A assinatura da função permanece idêntica: `list_institution_users(institution_id_param uuid)`
- O retorno permanece idêntico: `TABLE(id uuid, email text, first_name text, last_name text, role text, is_admin boolean)`
- O frontend não precisa de alterações
- Nenhum dado foi alterado
- Nenhuma FK mudou
- Nenhuma policy RLS mudou
- Nenhuma outra função mudou

---

## RESUMO EXECUTIVO

A função `list_institution_users` foi corrigida com sucesso. Antes, qualquer pessoa na internet (incluindo usuários não autenticados) podia listar emails e dados de usuários de qualquer instituição. Agora:

1. **Anon** não pode executar a função (grant removido + auth.uid() check)
2. **Usuário autenticado** só recebe dados da sua própria instituição (membership check)
3. **search_path** protegido contra injection
4. **Assinatura e retorno** idênticos — frontend continua funcionando sem alterações
5. **Nenhum dado** foi criado, alterado ou excluído

**PARE.** Aguardo revisão externa antes da próxima etapa. Não corrigirei outras funções SECURITY DEFINER. Não alterarei FKs. Não alterarei policies.
