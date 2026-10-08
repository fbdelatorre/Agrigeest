# ETAPA 1H-D — PROTEÇÃO DE `delete_invitation`

**Data:** 2026-10-07  
**Objetivo:** Adicionar verificação de `auth.uid()`, endurecimento de `search_path`, qualificação de tabelas, proteção de histórico (`used_at IS NULL`), padrão `FOUND`, e revogação de grants PUBLIC/anon na função `delete_invitation`.

---

## 1. Baseline PRE

### 1.1 Contagens

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

### 1.2 Sentinelas de Estoque

| Métrica | Valor PRE |
|---|---|
| SUM(products.quantity_in_stock) | 4617076.08296666766681363 |
| SUM(product_lots.quantity) | 185382.00000666667 |
| Items em operations.products_used | 1459 |
| Invalid product_ids | 501 |

### 1.3 Checksums

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

---

## 2. Definição PRE

```sql
CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  SELECT institution_id INTO target_institution_id
  FROM invitations
  WHERE code = invitation_code;

  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id;

  RETURN true;
END;
$function$;
```

**Vulnerabilidades PRE:**
1. Sem `auth.uid() IS NULL` explícito
2. Sem `search_path` definido (proconfig = null)
3. Tabelas não qualificadas (`invitations`, `user_profiles` sem `public.`)
4. Sem proteção de `used_at` — convites usados podem ser excluídos via API direta
5. `RETURN true` incondicional após DELETE — não reflete se DELETE afetou rows
6. Grants PUBLIC e anon ativos

---

## 3. Grants PRE

| Grantee | Privilege |
|---|---|
| PUBLIC | EXECUTE |
| anon | EXECUTE |
| authenticated | EXECUTE |
| postgres | EXECUTE |
| service_role | EXECUTE |

---

## 4. Confirmação Frontend

Confirmado na Etapa 1H-C (não modificado):

- `Settings.tsx` linha 1180: `{profile?.isAdmin && (` — envolve toda a seção de Convites
- `Settings.tsx` linha 1313: `{!invitation.usedAt && (` — botão "Excluir" só aparece para convites não usados
- `Settings.tsx` linha 1317: `onClick={() => handleDeleteInvitation(invitation.code)}` — envia código
- `Settings.tsx` linha 220: `if (!profile?.institutionId || !profile.isAdmin) return;` — guarda `loadInvitations`
- Convites expirados não usados ainda mostram botão "Excluir" (comportamento legítimo)

**Nenhum arquivo frontend foi alterado.**

---

## 5. SQL Exato Executado

```sql
CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT institution_id INTO target_institution_id
  FROM public.invitations
  WHERE code = invitation_code;

  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id
  AND used_at IS NULL;

  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_invitation(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO postgres;
```

---

## 6. Definição POST

```sql
CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT institution_id INTO target_institution_id
  FROM public.invitations
  WHERE code = invitation_code;

  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id
  AND used_at IS NULL;

  IF FOUND THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
```

---

## 7. auth.uid() POST

`IF auth.uid() IS NULL THEN RETURN false;` — adicionado como primeira verificação, antes de qualquer consulta. Preserva o contrato `RETURNS boolean` (não usa exception).

---

## 8. Autorização Admin POST

Preservada integralmente:
```sql
IF NOT EXISTS (
  SELECT 1 FROM public.user_profiles
  WHERE id = auth.uid()
  AND is_admin = true
  AND institution_id = target_institution_id
) THEN
  RETURN false;
END IF;
```

- `is_admin = true`: mantido
- `institution_id = target_institution_id`: mantido (mesma instituição)
- `public.user_profiles`: agora qualificado

---

## 9. Proteção used_at POST

```sql
DELETE FROM public.invitations
WHERE code = invitation_code
AND institution_id = target_institution_id
AND used_at IS NULL;
```

A condição `used_at IS NULL` foi adicionada ao DELETE. Isso significa:
- Convite pendente (não usado): DELETE afeta 1 row
- Convite já utilizado: DELETE afeta 0 rows (histórico preservado)
- Sem SELECT adicional desnecessário — a proteção é inline no DELETE

---

## 10. Uso de FOUND

```sql
IF FOUND THEN
  RETURN true;
END IF;

RETURN false;
```

O padrão `FOUND` verifica se o último DELETE afetou pelo menos 1 row:

| Situação | DELETE afeta | FOUND | Retorno |
|---|---|---|---|
| Convite pendente excluído | 1 row | true | `true` |
| Convite usado (tentativa) | 0 rows | false | `false` |
| Código inexistente | já retornou false antes | — | `false` |
| Não autorizado | já retornou false antes | — | `false` |

**O boolean agora reflete exatamente o que ocorreu.**

---

## 11. search_path POST

| Propriedade | Valor PRE | Valor POST |
|---|---|---|
| proconfig | null | `search_path=public, pg_temp` |

---

## 12. Grants POST

| Grantee | PRE | POST | Status |
|---|---|---|---|
| PUBLIC | EXECUTE | — | ✅ Revogado |
| anon | EXECUTE | — | ✅ Revogado |
| authenticated | EXECUTE | EXECUTE | ✅ Mantido |
| postgres | EXECUTE | EXECUTE | ✅ Mantido |
| service_role | EXECUTE | EXECUTE | ✅ Mantido |

---

## 13. has_function_privilege POST

| Role | can_execute | Esperado |
|---|---|---|
| authenticated | true | true ✅ |
| anon | false | false ✅ |
| service_role | true | true ✅ |
| postgres | true | true ✅ |

**Nota sobre service_role:** Possui EXECUTE (permissão SQL), mas a lógica interna requer `auth.uid()` não-NULL e `is_admin = true`. Em contexto service_role sem JWT de usuário, `auth.uid()` pode retornar NULL, fazendo a função retornar `false`. O grant EXECUTE e a autorização interna são conceitos separados — service_role não passa automaticamente pela lógica interna apenas por ter EXECUTE.

---

## 14. Análise dos Oito Cenários

| # | Cenário | EXECUTE? | auth.uid() | is_admin? | institution? | DELETE alcançado? | used_at IS NULL? | FOUND? | Resultado |
|---|---|---|---|---|---|---|---|---|---|
| A | anon | ❌ Não | NULL → false | — | — | Não | — | — | `false` |
| B | authenticated sem profile | ✅ Sim | não-NULL | não encontra profile | — | Não | — | — | `false` |
| C | não-admin A + convite A | ✅ Sim | não-NULL | is_admin=false | — | Não | — | — | `false` |
| D | admin A + convite B | ✅ Sim | não-NULL | is_admin=true | institution_id ≠ target | Não | — | — | `false` |
| E | admin A + código inexistente | ✅ Sim | não-NULL | — | target IS NULL | Não | — | — | `false` |
| F | admin A + convite A pendente válido | ✅ Sim | não-NULL | is_admin=true | mesma inst | Sim | Sim (NULL) | true | `true` — excluído |
| G | admin A + convite A pendente expirado | ✅ Sim | não-NULL | is_admin=true | mesma inst | Sim | Sim (NULL) | true | `true` — excluído |
| H | admin A + convite A já utilizado | ✅ Sim | não-NULL | is_admin=true | mesma inst | Sim | **Não** (used_at NOT NULL) | false | `false` — **histórico preservado** |

---

## 15. Confirmação: delete_invitation NÃO Foi Executada

A função `delete_invitation` **não foi chamada** em nenhuma etapa deste processo. Nenhum convite foi criado, excluído, ou modificado. A migration alterou apenas a definição da função e seus grants. Todos os 7 convites permanecem intactos — confirmado pelo checksum idêntico da tabela `invitations`.

---

## 16. Baseline POST

### 16.1 Contagens

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

### 16.2 Sentinelas

| Métrica | PRE | POST | Match |
|---|---|---|---|
| SUM(quantity_in_stock) | 4617076.08296666766681363 | 4617076.08296666766681363 | ✅ |
| SUM(quantity) lots | 185382.00000666667 | 185382.00000666667 | ✅ |
| Items em products_used | 1459 | 1459 | ✅ |
| Invalid product_ids | 501 | 501 | ✅ |

---

## 17. Checksums POST

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

**ZERO DATA LOSS confirmado.**

---

## 18. FKs

| Métrica | Valor |
|---|---|
| Total FKs | 28 |
| CASCADE | 20 |
| RESTRICT | 5 |
| SET NULL | 3 |

Nenhuma alteração em FKs.

---

## 19. RLS

| Métrica | Valor |
|---|---|
| Total RLS policies | 49 |

Nenhuma alteração em RLS.

---

## 20. Proteções Anteriores

| Função | SECURITY DEFINER | search_path | PUBLIC/anon |
|---|---|---|---|
| list_institution_users | true | public, pg_temp | Revogados ✅ |
| copy_data_to_institution | true | public, pg_temp | Revogados ✅ |
| handle_user_registration | true | public, pg_temp | Revogados ✅ |
| join_institution | true | public, pg_temp | Revogados ✅ |
| list_active_invitations | true | public, pg_temp | Revogados ✅ |
| **delete_invitation** | **true** | **public, pg_temp** | **Revogados ✅** |

Todas as 6 funções SECURITY DEFINER de negócio crítico agora têm:
- `search_path = public, pg_temp`
- Grants restritos a authenticated/service_role/postgres
- PUBLIC e anon sem EXECUTE

---

## 21. Outras Functions

Confirmado inalteradas (proconfig e assinatura preservados):

| Função | proconfig | Alterada? |
|---|---|---|
| create_invitation | search_path=public | ❌ Não |
| validate_invitation | search_path=public | ❌ Não |
| clean_expired_invitations | null | ❌ Não |
| handle_new_user | null | ❌ Não |
| toggle_user_admin_status | null | ❌ Não |
| update_season_status | null | ❌ Não |
| check_institution_exists | null | ❌ Não |

Apenas `delete_invitation` foi modificada.

---

## 22. Frontend Inalterado

| Arquivo | Alterado? |
|---|---|
| src/pages/Settings.tsx | ❌ Não |
| src/App.tsx | ❌ Não |
| src/pages/auth/Login.tsx | ❌ Não |
| Qualquer outro arquivo .tsx | ❌ Não |

Nenhum arquivo frontend foi modificado. `npm run build` executado e aprovado sem erros.

---

## 23. Rollback Preparado

Para reverter ao estado PRE (restaurando vulnerabilidades):

```sql
CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  SELECT institution_id INTO target_institution_id
  FROM invitations
  WHERE code = invitation_code;

  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id;

  RETURN true;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO anon;
```

**Nota:** O rollback restaura as vulnerabilidades (sem search_path, sem used_at, sem FOUND, grants PUBLIC/anon). Use apenas se a mudança causar problema inesperado.

---

## 24. Divergências

Nenhuma divergência encontrada. Todos os valores POST correspondem exatamente ao esperado:

- Contagens: idênticas PRE vs POST
- Sentinelas: idênticas PRE vs POST
- Checksums: idênticos PRE vs POST
- FKs: 28/20/5/3 (inalterados)
- RLS: 49 policies (inalteradas)
- Grants: PUBLIC e anon revogados, authenticated/service_role/postgres mantidos
- has_function_privilege: anon=false, authenticated=true, service_role=true, postgres=true
- Função: search_path=public, pg_temp, tabelas qualificadas, auth.uid() IS NULL, used_at IS NULL, FOUND
- Outras funções: inalteradas
- Frontend: inalterado
- Build: aprovado

**Status:** ✅ ZERO DATA LOSS | ✅ MIGRATION APLICADA | ✅ BUILD APROVADO

---

## 25. Resumo

**Proteções adicionadas:**
1. `auth.uid() IS NULL` → early exit antes de qualquer consulta
2. `SET search_path = public, pg_temp` → previne search_path hijacking
3. `public.invitations` e `public.user_profiles` → previne shadowing
4. `AND used_at IS NULL` no DELETE → impede exclusão de convites usados, preservando histórico
5. `IF FOUND THEN RETURN true; END IF; RETURN false;` → boolean reflete resultado real
6. REVOKE PUBLIC e anon → apenas authenticated/service_role/postgres têm EXECUTE

**Compatibilidade:** Frontend já esconde o botão "Excluir" para convites usados (`!invitation.usedAt`). A proteção backend alinha com o frontend e impede bypass via API direta. Convites expirados não usados continuam excluíveis (comportamento legítimo).

STOP — aguardando revisão externa.
