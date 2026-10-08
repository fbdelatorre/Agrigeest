# ETAPA 1G-D — RESULTADO DO BLOQUEIO DE TROCA DE INSTITUIÇÃO
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**Migration aplicada:** `prevent_existing_member_institution_switch`

---

## 1. BASELINE PRE

| Tabela | Contagem PRE |
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

| Sentinela | Valor PRE |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## 2. CHECKSUM_PRE

| Tabela | Checksum PRE |
|---|---|
| institutions | `038ff97cb251baa6b4557c3ef05ea823` |
| user_profiles | `c987c95562f53f8908c14d32e70d4f49` |
| invitations | `a94453b17e8851b84671bdde60a30201` |
| areas | `1f40430c05954fcae4ca737bddc38539` |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` |
| products | `40fa32700e59f87773383c100a225907` |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` |
| seasons | `981c3b936b8678c9255424694bf4ffa6` |

---

## 3. DEFINIÇÃO PRE

A função POST da etapa 1G-B, confirmada idêntica:

```sql
CREATE OR REPLACE FUNCTION public.join_institution(user_id uuid, invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
  -- Identity check (1G-B)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
  END IF;

  -- Clean input
  clean_code := NULLIF(TRIM(invitation_code), '');
  ... (lógica original: validação, FOR UPDATE, INSERT/ON CONFLICT, UPDATE invitations, JSON retornado)
END;
$function$;
```

| Propriedade | Valor PRE |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | true |
| search_path | `public, pg_temp` |
| auth.uid() | SIM (1G-B) |
| institution_id IS NOT NULL check | **NÃO presente** |

---

## 4. GRANTS PRE

| Grantee | EXECUTE |
|---|---|
| PUBLIC | Não |
| anon | Não |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

**Proteção 1G-B confirmada intacta.**

---

## 5. CONFIRMAÇÃO DO FLUXO DE CADASTRO

### handle_new_user (trigger):
- Cria `user_profiles` com `institution_id = NULL`, `is_admin = false`
- Confirmado na auditoria 1G: o trigger lê `NEW.raw_user_meta_data` e insere profile com `institution_id = NULL`

### Login.tsx fluxo de NOVO usuário com convite:
1. `supabase.auth.signUp()` → cria `auth.users`
2. Trigger `handle_new_user` → cria `user_profiles` com `institution_id = NULL`
3. `join_institution({ user_id: authData.user.id, invitation_code })` → chamada
4. Neste ponto, `user_profiles.institution_id` é `NULL`

**A nova verificação `institution_id IS NOT NULL` NÃO bloqueia o fluxo legítimo** porque o profile recém-criado pelo trigger tem `institution_id = NULL`.

### Comportamento quando profile não existe:
Se o profile não existe (caso de timing/race condition), `EXISTS (SELECT 1 FROM user_profiles WHERE id = user_id AND institution_id IS NOT NULL)` retorna `false` → a função continua para a lógica original. Compatibilidade preservada.

---

## 6. SQL EXATO EXECUTADO

Arquivo: `supabase/migrations/prevent_existing_member_institution_switch.sql`

```sql
CREATE OR REPLACE FUNCTION public.join_institution(
  user_id uuid,
  invitation_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
  -- Identity check: require authenticated user and matching user_id (1G-B)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
  END IF;

  -- Block institution switching: only allow if user does not already belong to an institution
  IF EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE id = user_id
      AND institution_id IS NOT NULL
  ) THEN
    RETURN json_build_object(
      'success', false,
      'type', 'error',
      'message', 'User already belongs to an institution'
    );
  END IF;

  -- Clean input
  clean_code := NULLIF(TRIM(invitation_code), '');
  
  -- Return early if code is null or empty
  IF clean_code IS NULL OR clean_code = '' THEN
    RETURN json_build_object(
      'success', false,
      'type', 'error',
      'message', 'Please enter an invitation code'
    );
  END IF;

  -- Start transaction
  BEGIN
    -- Use exception handling to properly catch NO_DATA_FOUND
    BEGIN
      -- Get invitation details with row lock
      SELECT 
        i.*,
        inst.name as institution_name,
        inst.id as institution_id
      INTO 
        invitation_record
      FROM public.invitations i
      JOIN public.institutions inst ON inst.id = i.institution_id
      WHERE i.code = clean_code
      FOR UPDATE OF i;

      -- Check if invitation is already used
      IF invitation_record.used_at IS NOT NULL THEN
        RETURN json_build_object(
          'success', false,
          'type', 'error',
          'message', 'This invitation code has already been used'
        );
      END IF;

      -- Check if invitation is expired
      IF invitation_record.expires_at < now() THEN
        RETURN json_build_object(
          'success', false,
          'type', 'error',
          'message', 'This invitation code has expired'
        );
      END IF;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        -- No invitation found
        RETURN json_build_object(
          'success', false,
          'type', 'error',
          'message', 'Invalid invitation code'
        );
    END;

    -- Get user details
    SELECT * INTO user_record
    FROM auth.users
    WHERE id = user_id;

    -- Check if user exists
    IF user_record IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'message', 'User not found'
      );
    END IF;

    -- Create or update profile
    INSERT INTO public.user_profiles (
      id,
      institution_id,
      is_admin,
      institution,
      first_name,
      last_name,
      phone,
      role,
      email
    )
    VALUES (
      user_id,
      invitation_record.institution_id,
      false,
      invitation_record.institution_name,
      user_record.raw_user_meta_data->>'first_name',
      user_record.raw_user_meta_data->>'last_name',
      user_record.raw_user_meta_data->>'phone',
      user_record.raw_user_meta_data->>'role',
      user_record.email
    )
    ON CONFLICT (id) DO UPDATE
    SET 
      institution_id = EXCLUDED.institution_id,
      is_admin = EXCLUDED.is_admin,
      institution = EXCLUDED.institution,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      phone = EXCLUDED.phone,
      role = EXCLUDED.role,
      email = EXCLUDED.email
    RETURNING * INTO profile_record;

    -- Mark invitation as used
    UPDATE public.invitations
    SET 
      used_at = now(),
      used_by = user_id
    WHERE id = invitation_record.id;

    -- Return success
    RETURN json_build_object(
      'success', true,
      'type', 'success',
      'message', 'Successfully joined ' || invitation_record.institution_name,
      'institution_id', invitation_record.institution_id,
      'institution_name', invitation_record.institution_name,
      'profile', json_build_object(
        'id', profile_record.id,
        'email', profile_record.email,
        'institution_id', profile_record.institution_id,
        'institution', profile_record.institution,
        'first_name', profile_record.first_name,
        'last_name', profile_record.last_name,
        'role', profile_record.role
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object(
        'success', false,
        'type', 'error',
        'message', 'Error joining institution: ' || SQLERRM
      );
  END;
END;
$function$;

-- Ensure grants remain correct
REVOKE EXECUTE ON FUNCTION public.join_institution(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_institution(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO postgres;
```

### Mudança aplicada:
**Única alteração:** adição do bloco de verificação de membership logo após as proteções 1G-B e antes de `clean_code := NULLIF(TRIM(invitation_code), '')`:

```sql
IF EXISTS (
  SELECT 1
  FROM public.user_profiles
  WHERE id = user_id
    AND institution_id IS NOT NULL
) THEN
  RETURN json_build_object(
    'success', false,
    'type', 'error',
    'message', 'User already belongs to an institution'
  );
END IF;
```

Lógica interna — **inalterada**: clean_code, TRIM, FOR UPDATE, validações, INSERT/ON CONFLICT, UPDATE invitations, JSON retornado, exception handling.

---

## 7. DEFINIÇÃO POST

| Propriedade | Valor POST |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | true |
| search_path | `public, pg_temp` |
| Volatility | VOLATILE (V) |
| Assinatura | `join_institution(user_id uuid, invitation_code text) RETURNS json` — idêntica |
| auth.uid() | SIM (1G-B preservado) |
| institution_id IS NOT NULL check | **SIM — presente** |

---

## 8. POSIÇÃO EXATA DA NOVA VERIFICAÇÃO

A nova verificação ocorre na seguinte ordem:

1. `IF auth.uid() IS NULL` → RAISE EXCEPTION (1G-B)
2. `IF user_id IS DISTINCT FROM auth.uid()` → RAISE EXCEPTION (1G-B)
3. **`IF EXISTS (SELECT 1 FROM user_profiles WHERE id = user_id AND institution_id IS NOT NULL)` → RETURN JSON (1G-D, NOVO)**
4. `clean_code := NULLIF(TRIM(invitation_code), '')` — início da lógica original

A verificação está posicionada:
- **DEPOIS** das proteções de identidade (1G-B)
- **ANTES** de limpar/consultar o convite
- **ANTES** de qualquer `SELECT ... FOR UPDATE` em invitations
- **ANTES** de qualquer INSERT/UPDATE em user_profiles ou invitations

---

## 9. GRANTS POST

| Grantee | EXECUTE |
|---|---|
| PUBLIC | **Não** |
| anon | **Não** |
| authenticated | **Sim** |
| postgres | **Sim** |
| service_role | **Sim** |

| Role | can_execute |
|---|---|
| anon | false |
| authenticated | true |
| service_role | true |
| postgres | true |

**Idêntico ao PRE. Nenhuma alteração.**

---

## 10. ANÁLISE DOS CINCO CENÁRIOS

### CASO A: auth.uid() = NULL (anon ou sem sessão)

A função executa:
```sql
IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication required';
END IF;
```
→ **Rejeita antes de qualquer operação.** Nenhum dado é acessado ou alterado.

### CASO B: auth.uid() = UUID A, user_id = UUID B (A ≠ B)

A função executa:
```sql
IF user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized user';
END IF;
```
→ **Rejeita antes de qualquer operação.** Nenhum dado é acessado ou alterado.

### CASO C: auth.uid() = UUID A, user_id = UUID A, profile não existe

A verificação de membership:
```sql
IF EXISTS (SELECT 1 FROM user_profiles WHERE id = user_id AND institution_id IS NOT NULL)
```
→ `EXISTS` retorna `false` (não há linha). A função **continua para a lógica original**. Compatibilidade com timing/race condition preservada.

### CASO D: auth.uid() = UUID A, user_id = UUID A, profile existe com institution_id = NULL

A verificação:
```sql
IF EXISTS (SELECT 1 FROM user_profiles WHERE id = user_id AND institution_id IS NOT NULL)
```
→ `EXISTS` retorna `false` (linha existe mas `institution_id IS NULL`, que não satisfaz `IS NOT NULL`). A função **continua para a lógica original**.

**Este é o cenário do cadastro legítimo por convite:** o trigger `handle_new_user` cria o profile com `institution_id = NULL`, e `join_institution` é chamado em seguida. A verificação não bloqueia.

### CASO E: auth.uid() = UUID A, user_id = UUID A, profile.institution_id = instituição A

A verificação:
```sql
IF EXISTS (SELECT 1 FROM user_profiles WHERE id = user_id AND institution_id IS NOT NULL)
```
→ `EXISTS` retorna `true` (linha existe e `institution_id` é NOT NULL). A função **retorna imediatamente**:

```json
{
  "success": false,
  "type": "error",
  "message": "User already belongs to an institution"
}
```

→ **Não consulta/trava convite.** Não altera profile. Não altera invitation. Não consome convite. Nenhum dado é modificado.

---

## 11. CONFIRMAÇÃO DE QUE join_institution NÃO FOI EXECUTADA

A função `join_institution` **não foi executada** em nenhum momento. A validação foi feita exclusivamente por:
- `pg_get_functiondef` — leitura da definição
- `pg_proc` — metadados
- `information_schema.routine_privileges` — grants
- `has_function_privilege` — permissões
- Checksums de 8 tabelas — prova de que nenhum INSERT/UPDATE ocorreu

Nenhum `SELECT join_institution(...)` foi executado.

---

## 12. BASELINE POST

| Tabela | Contagem POST |
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

---

## 13. CHECKSUM_POST

| Tabela | Checksum POST | Checksum PRE | Status |
|---|---|---|---|
| institutions | `038ff97cb251baa6b4557c3ef05ea823` | `038ff97cb251baa6b4557c3ef05ea823` | idêntico |
| user_profiles | `c987c95562f53f8908c14d32e70d4f49` | `c987c95562f53f8908c14d32e70d4f49` | idêntico |
| invitations | `a94453b17e8851b84671bdde60a30201` | `a94453b17e8851b84671bdde60a30201` | idêntico |
| areas | `1f40430c05954fcae4ca737bddc38539` | `1f40430c05954fcae4ca737bddc38539` | idêntico |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` | `b57c17c9f60ff02f2c059b5b4b682a3b` | idêntico |
| products | `40fa32700e59f87773383c100a225907` | `40fa32700e59f87773383c100a225907` | idêntico |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | idêntico |
| seasons | `981c3b936b8678c9255424694bf4ffa6` | `981c3b936b8678c9255424694bf4ffa6` | idêntico |

**Todos os checksums idênticos. Nenhuma linha foi criada, alterada ou excluída.**

---

## 14. PRE vs POST

| Métrica | PRE | POST | Status |
|---|---|---|---|
| auth.users | 6 | 6 | idêntico |
| user_profiles | 6 | 6 | idêntico |
| institutions | 6 | 6 | idêntico |
| invitations | 7 | 7 | idêntico |
| areas | 44 | 44 | idêntico |
| operations | 309 | 309 | idêntico |
| products | 217 | 217 | idêntico |
| product_lots | 149 | 149 | idêntico |
| seasons | 5 | 5 | idêntico |
| machinery | 19 | 19 | idêntico |
| maintenances | 3 | 3 | idêntico |
| maintenance_types | 2 | 2 | idêntico |
| notes | 8 | 8 | idêntico |
| SUM(quantity_in_stock) | 4.617.076,08... | 4.617.076,08... | idêntico |
| SUM(lots.quantity) | 185.382,000... | 185.382,000... | idêntico |
| products_used items | 1.459 | 1.459 | idêntico |
| invalid productIds | 501 | 501 | idêntico |

---

## 15. FKs

| ON DELETE | Quantidade |
|---|---|
| CASCADE | 20 |
| RESTRICT | 5 |
| SET NULL | 3 |
| **Total** | **28** |

**Status:** Inalterado.

---

## 16. RLS

| Métrica | Valor |
|---|---|
| Total de policies no schema public | 49 |

**Status:** Inalterado.

---

## 17. PROTEÇÕES ANTERIORES

### 1G-A (handle_user_registration):
| Propriedade | Valor |
|---|---|
| SECURITY DEFINER | true |
| search_path | `public, pg_temp` |
| auth.uid() obrigatório | SIM |
| user_id = auth.uid() | SIM |
| PUBLIC EXECUTE | Não |
| anon EXECUTE | Não |
| authenticated EXECUTE | Sim |

**Intacta.**

### 1G-B (join_institution identity):
| Propriedade | Valor |
|---|---|
| auth.uid() obrigatório | SIM |
| user_id IS DISTINCT FROM auth.uid() | SIM |
| search_path | `public, pg_temp` |

**Intacta.** As duas proteções de identidade permanecem antes da nova verificação.

### 1F-A (list_institution_users):
| Propriedade | Valor |
|---|---|
| search_path | `public, pg_temp` |

**Intacta.**

### 1F-C (copy_data_to_institution):
| Propriedade | Valor |
|---|---|
| search_path | `public, pg_temp` |

**Intacta.**

### Todas as SECURITY DEFINER:

| Função | proconfig | Status |
|---|---|---|
| check_institution_exists | null | inalterada |
| clean_expired_invitations | null | inalterada |
| copy_data_to_institution | search_path=public, pg_temp | inalterada (1F-C) |
| create_invitation | search_path=public | inalterada |
| delete_invitation | null | inalterada |
| handle_new_user | null | inalterada |
| handle_user_registration | search_path=public, pg_temp | inalterada (1G-A) |
| **join_institution** | **search_path=public, pg_temp** | **MODIFICADA (1G-D)** |
| list_active_invitations | null | inalterada |
| list_institution_users | search_path=public, pg_temp | inalterada (1F-A) |
| toggle_user_admin_status | null | inalterada |
| update_season_status | null | inalterada |
| validate_invitation | search_path=public | inalterada |

Apenas `join_institution` foi modificada.

---

## 18. FRONTEND INALTERADO

**0 arquivos frontend modificados.**

Confirmado novamente: não existe UI de troca de instituição. O cadastro por convite permanece conceitualmente compatível porque o trigger cria o profile com `institution_id = NULL` antes da chamada a `join_institution`.

---

## 19. ROLLBACK PREPARADO (NÃO EXECUTADO)

Rollback remove SOMENTE a verificação de membership, restaurando a definição POST da 1G-B:

```sql
CREATE OR REPLACE FUNCTION public.join_institution(
  user_id uuid, invitation_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
  -- Identity check (1G-B) — permanece no rollback
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
  END IF;

  -- A verificação de institution_id IS NOT NULL é REMOVIDA no rollback

  -- Clean input
  clean_code := NULLIF(TRIM(invitation_code), '');
  ... (restante da lógica original da 1G-B)
END;
$function$;
```

**CRÍTICO:** O rollback NÃO remove:
- `auth.uid()` obrigatório (1G-B)
- `user_id = auth.uid()` (1G-B)
- `search_path = public, pg_temp` (1G-B)
- Grants protegidos (1G-B)

O rollback restaura a versão 1G-B (com proteções de identidade), NÃO a versão original insegura.

**Não executado.**

---

## 20. DIVERGÊNCIAS

**Nenhuma divergência encontrada.**

- Assinatura preservada
- Lógica interna preservada: clean_code, TRIM, FOR UPDATE, validações, INSERT/ON CONFLICT, UPDATE invitations, JSON retornado, exception handling
- Proteções 1G-B intactas (auth.uid + user_id = auth.uid)
- Nova verificação adicionada após 1G-B e antes da lógica original
- Usa `RETURN json_build_object` (não RAISE EXCEPTION) — regra funcional esperada
- `EXISTS` retorna false se profile não existe — compatível com timing/race
- `EXISTS` retorna false se institution_id IS NULL — compatível com cadastro legítimo
- Grants idênticos
- Nenhum dado alterado (8 checksums idênticos)
- Nenhuma FK mudou (28)
- Nenhuma policy RLS mudou (49)
- Nenhuma outra função mudou
- Frontend inalterado
- Função não foi executada

---

## RESUMO EXECUTIVO

A função `join_institution` agora bloqueia a troca de instituição por usuários que já pertencem a uma. A verificação foi adicionada logo após as proteções de identidade da etapa 1G-B e antes de qualquer acesso a dados de convites ou profiles:

1. **`auth.uid()` obrigatório** (1G-B, preservado)
2. **`user_id = auth.uid()`** (1G-B, preservado)
3. **NOVO: se o usuário já tem `institution_id` preenchido, retorna JSON de erro sem consultar, travar ou consumir convite, e sem alterar nenhum dado**
4. Lógica original preservada para usuários sem instituição (cadastro legítimo por convite)

### Cenários validados analiticamente:
- **Anon:** rejeitado pela 1G-B
- **User_id ≠ auth.uid():** rejeitado pela 1G-B
- **Profile não existe:** continua (compatível com race condition)
- **Profile com institution_id = NULL:** continua (cadastro legítimo)
- **Profile com institution_id ≠ NULL:** retorna erro sem alterar dados

### Impacto:
- **Cadastro por convite:** não afetado (profile tem institution_id = NULL)
- **Troca de instituição:** bloqueada (retorna erro graceful)
- **Dados existentes:** nenhum alterado (8 checksums idênticos)
- **Frontend:** inalterado (não existe UI de troca)
- **Proteções anteriores:** todas intactas (1F-A, 1F-C, 1G-A, 1G-B)

**PARE.** Aguardo revisão externa. Não iniciarei nova etapa. Não alterarei convites, handle_new_user, RLS ou frontend.
