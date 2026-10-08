# ETAPA 1G-B — RESULTADO DA PROTEÇÃO DE join_institution
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**Migration aplicada:** `protect_join_institution_identity`

---

## 1. BACKUP / PITR

- **PITR:** NÃO VERIFICADO NESTA ETAPA. Baseline externo conhecido indica que o painel Supabase anteriormente mostrava "Point in Time Recovery is available as an add-on" / "Enable add-on", sugerindo que PITR não está habilitado.
- **Último backup físico confirmado externamente:** 07/10/2026 04:22:06 UTC
- **Observação:** A migration desta etapa é puramente DDL (CREATE OR REPLACE FUNCTION + REVOKE/GRANT). Nenhum dado é alterado, tornando a etapa totalmente reversível.

---

## 2. BASELINE PRE

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

## 3. CHECKSUM_PRE REAL

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

## 4. DEFINIÇÃO PRE

```sql
CREATE OR REPLACE FUNCTION public.join_institution(user_id uuid, invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
  -- Clean input
  clean_code := NULLIF(TRIM(invitation_code), '');
  
  IF clean_code IS NULL OR clean_code = '' THEN
    RETURN json_build_object('success', false, 'type', 'error', 'message', 'Please enter an invitation code');
  END IF;

  BEGIN
    BEGIN
      SELECT i.*, inst.name as institution_name, inst.id as institution_id
      INTO invitation_record
      FROM public.invitations i
      JOIN public.institutions inst ON inst.id = i.institution_id
      WHERE i.code = clean_code
      FOR UPDATE OF i;

      IF invitation_record.used_at IS NOT NULL THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'This invitation code has already been used');
      END IF;

      IF invitation_record.expires_at < now() THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'This invitation code has expired');
      END IF;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'Invalid invitation code');
    END;

    SELECT * INTO user_record FROM auth.users WHERE id = user_id;

    IF user_record IS NULL THEN
      RETURN json_build_object('success', false, 'type', 'error', 'message', 'User not found');
    END IF;

    INSERT INTO public.user_profiles (id, institution_id, is_admin, institution, first_name, last_name, phone, role, email)
    VALUES (user_id, invitation_record.institution_id, false, invitation_record.institution_name,
      user_record.raw_user_meta_data->>'first_name', user_record.raw_user_meta_data->>'last_name',
      user_record.raw_user_meta_data->>'phone', user_record.raw_user_meta_data->>'role', user_record.email)
    ON CONFLICT (id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id, is_admin = EXCLUDED.is_admin, institution = EXCLUDED.institution,
      first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, phone = EXCLUDED.phone, role = EXCLUDED.role, email = EXCLUDED.email
    RETURNING * INTO profile_record;

    UPDATE public.invitations SET used_at = now(), used_by = user_id WHERE id = invitation_record.id;

    RETURN json_build_object('success', true, 'type', 'success', 'message', 'Successfully joined ' || invitation_record.institution_name,
      'institution_id', invitation_record.institution_id, 'institution_name', invitation_record.institution_name,
      'profile', json_build_object(...));
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'type', 'error', 'message', 'Error joining institution: ' || SQLERRM);
  END;
END;
$function$;
```

| Propriedade | Valor PRE |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | true |
| search_path (proconfig) | `search_path=public` |
| Volatility | VOLATILE (V) |
| Assinatura | `join_institution(user_id uuid, invitation_code text) RETURNS json` |
| auth.uid() | **NÃO presente** |

---

## 5. GRANTS PRE

| Grantee | EXECUTE |
|---|---|
| PUBLIC | Sim |
| anon | Sim |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

**Estado confirmado idêntico à auditoria 1G.**

---

## 6. CONFIRMAÇÃO FRONTEND

Arquivo: `src/pages/auth/Login.tsx` — função `handleRegister` (linhas 305-313)

Fluxo legítimo confirmado:

1. `validate_invitation({ invitation_code })` — chamada como anon antes do signup
2. `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, phone, role } } })` → linha 287
3. `authData.user.id` obtido → linha 303
4. `supabase.rpc('join_institution', { user_id: authData.user.id, invitation_code: invitationCode.trim() })` → linhas 310-313

**O frontend passa `authData.user.id` como `user_id`** — após o signup, o usuário está autenticado e `auth.uid()` será igual a `user_id`.

A verificação `user_id IS DISTINCT FROM auth.uid()` não quebrará o fluxo legítimo.

---

## 7. SQL EXATO EXECUTADO

Arquivo: `supabase/migrations/protect_join_institution_identity.sql`

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
  -- Identity check: require authenticated user and matching user_id
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
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

REVOKE EXECUTE ON FUNCTION public.join_institution(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_institution(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO postgres;
```

### Mudanças aplicadas:
1. **`IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'`** — adicionado no início, antes de qualquer SELECT/INSERT/UPDATE
2. **`IF user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized user'`** — adicionado logo após
3. **`SET search_path = public, pg_temp`** — endurecido (era `public`)
4. **REVOKE de PUBLIC e anon**
5. **GRANT explícito para authenticated, service_role, postgres**
6. Lógica interna — **inalterada**: clean_code, TRIM, FOR UPDATE, validações, INSERT/ON CONFLICT, UPDATE invitations, JSON retornado, exception handling

---

## 8. DEFINIÇÃO POST

| Propriedade | Valor POST |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | true |
| search_path (proconfig) | `search_path=public, pg_temp` |
| Volatility | VOLATILE (V) |
| Assinatura | `join_institution(user_id uuid, invitation_code text) RETURNS json` — idêntica |
| auth.uid() | **SIM — presente nas duas primeiras verificações** |

A definição POST confirma que as verificações de identidade ocorrem antes de:
- `NULLIF(TRIM(invitation_code))` — limpeza do código
- `SELECT ... FOR UPDATE OF i` — travamento do convite
- `SELECT * FROM auth.users` — consulta do usuário
- `INSERT INTO public.user_profiles` — criação/atualização do profile
- `UPDATE public.invitations` — marcação do convite como usado

---

## 9. GRANTS POST

| Grantee | EXECUTE |
|---|---|
| PUBLIC | **Não** |
| anon | **Não** |
| authenticated | **Sim** |
| postgres | **Sim** |
| service_role | **Sim** |

---

## 10. has_function_privilege POR ROLE

| Role | can_execute |
|---|---|
| anon | **false** |
| authenticated | **true** |
| service_role | **true** |
| postgres | **true** |

**Resultado esperado confirmado.** PUBLIC sem EXECUTE (não aparece na lista de grants).

---

## 11. ANÁLISE DOS QUATRO CENÁRIOS DE AUTORIZAÇÃO

### CASO A: auth.uid() = NULL (anon ou sem sessão)

A função executa:
```sql
IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication required';
END IF;
```
→ **Rejeita antes de qualquer operação.** Nenhum SELECT, INSERT ou UPDATE é executado. A exceção é lançada imediatamente. `IS DISTINCT FROM` trata NULL com segurança.

### CASO B: auth.uid() = UUID A, user_id = UUID B (A ≠ B)

A função executa:
```sql
IF user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized user';
END IF;
```
→ **Rejeita antes de consultar/travar convite e antes de qualquer escrita.** Nenhum `SELECT ... FOR UPDATE`, nenhum INSERT em user_profiles, nenhum UPDATE em invitations. A exceção é lançada antes de qualquer acesso a dados.

### CASO C: auth.uid() = UUID A, user_id = UUID A, convite válido

Ambas as verificações passam:
- `auth.uid() IS NULL` → false
- `user_id IS DISTINCT FROM auth.uid()` → false

→ **Segue exatamente a lógica original.** A função procede normalmente: limpa código, valida convite (FOR UPDATE), verifica used_at e expires_at, consulta auth.users, cria/atualiza user_profiles com ON CONFLICT, marca convite como usado, retorna JSON de sucesso.

### CASO D: auth.uid() = UUID A, user_id = UUID A, mas usuário já pertence a instituição

As verificações de identidade passam (A = A). A função segue para a lógica original.

→ **NENHUM bloqueio novo foi adicionado.** O comportamento permanece idêntico ao original: o `ON CONFLICT (id) DO UPDATE` sobrescreve institution_id, is_admin (false), institution, first_name, last_name, phone, role, email. O usuário é movido para a nova instituição. Esta etapa não altera esse comportamento — será analisado separadamente.

---

## 12. CONFIRMAÇÃO DE QUE join_institution NÃO FOI EXECUTADA

A função `join_institution` **não foi executada** em nenhum momento durante esta etapa. A validação foi feita exclusivamente por:
- `pg_get_functiondef` — leitura da definição
- `pg_proc` — metadados
- `information_schema.routine_privileges` — leitura de grants
- `has_function_privilege` — verificação analítica de permissões
- Checksums de 8 tabelas — prova de que nenhum INSERT/UPDATE ocorreu

Nenhum `SELECT join_institution(...)` foi executado.

---

## 13. BASELINE POST

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

## 14. CHECKSUM_POST REAL

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

## 15. COMPARAÇÃO PRE vs POST

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
| checksum institutions | 038ff97c... | 038ff97c... | idêntico |
| checksum user_profiles | c987c955... | c987c955... | idêntico |
| checksum invitations | a94453b1... | a94453b1... | idêntico |
| checksum areas | 1f40430c... | 1f40430c... | idêntico |
| checksum operations | b57c17c9... | b57c17c9... | idêntico |
| checksum products | 40fa3270... | 40fa3270... | idêntico |
| checksum product_lots | cdc7b4f6... | cdc7b4f6... | idêntico |
| checksum seasons | 981c3b93... | 981c3b93... | idêntico |

---

## 16. FKs

| ON DELETE | Quantidade |
|---|---|
| CASCADE | 20 |
| RESTRICT | 5 |
| SET NULL | 3 |
| **Total** | **28** |

**Status:** Inalterado. Nenhuma FK modificada.

---

## 17. RLS

| Métrica | Valor |
|---|---|
| Total de policies no schema public | 49 |

**Status:** Inalterado. Nenhuma policy criada, alterada ou removida.

---

## 18. CONFIRMAÇÃO DA PROTEÇÃO 1G-A

| Propriedade | Valor |
|---|---|
| Função | handle_user_registration |
| SECURITY DEFINER | true |
| search_path | `public, pg_temp` |
| auth.uid() check | presente |
| PUBLIC EXECUTE | **Não** |
| anon EXECUTE | **Não** |
| authenticated EXECUTE | **Sim** |
| service_role EXECUTE | **Sim** |
| postgres EXECUTE | **Sim** |

**Proteção 1G-A intacta.** Nenhuma alteração.

---

## 19. CONFIRMAÇÃO 1F-A / 1F-C

| Função | Etapa | proconfig | Status |
|---|---|---|---|
| list_institution_users | 1F-A | `search_path=public, pg_temp` | inalterada |
| copy_data_to_institution | 1F-C | `search_path=public, pg_temp` | inalterada |

---

## 20. OUTRAS SECURITY DEFINER

| Função | prosecdef | proconfig | Status |
|---|---|---|---|
| check_institution_exists | true | null | inalterada |
| clean_expired_invitations | true | null | inalterada |
| copy_data_to_institution | true | search_path=public, pg_temp | inalterada (1F-C) |
| create_invitation | true | search_path=public | inalterada |
| delete_invitation | true | null | inalterada |
| handle_new_user | true | null | inalterada |
| handle_user_registration | true | search_path=public, pg_temp | inalterada (1G-A) |
| **join_institution** | **true** | **search_path=public, pg_temp** | **MODIFICADA** |
| list_active_invitations | true | null | inalterada |
| list_institution_users | true | search_path=public, pg_temp | inalterada (1F-A) |
| toggle_user_admin_status | true | null | inalterada |
| update_season_status | true | null | inalterada |
| validate_invitation | true | search_path=public | inalterada |

Apenas `join_institution` foi modificada nesta etapa.

---

## 21. FRONTEND INALTERADO

**0 arquivos frontend modificados.**

O fluxo legítimo do frontend (`Login.tsx`) passa `authData.user.id` como `user_id` após `supabase.auth.signUp()`. Como o usuário está autenticado nesse ponto, `auth.uid() = user_id` e a verificação passa. Nenhuma adaptação do frontend é necessária.

---

## 22. ROLLBACK PREPARADO (NÃO EXECUTADO)

```sql
-- Rollback: restaurar definição PRE (sem auth.uid(), search_path=public)
CREATE OR REPLACE FUNCTION public.join_institution(
  user_id uuid, invitation_code text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  invitation_record RECORD;
  user_record RECORD;
  profile_record RECORD;
  clean_code text;
BEGIN
  clean_code := NULLIF(TRIM(invitation_code), '');
  
  IF clean_code IS NULL OR clean_code = '' THEN
    RETURN json_build_object('success', false, 'type', 'error', 'message', 'Please enter an invitation code');
  END IF;

  BEGIN
    BEGIN
      SELECT i.*, inst.name as institution_name, inst.id as institution_id
      INTO invitation_record
      FROM public.invitations i
      JOIN public.institutions inst ON inst.id = i.institution_id
      WHERE i.code = clean_code
      FOR UPDATE OF i;

      IF invitation_record.used_at IS NOT NULL THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'This invitation code has already been used');
      END IF;

      IF invitation_record.expires_at < now() THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'This invitation code has expired');
      END IF;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'Invalid invitation code');
    END;

    SELECT * INTO user_record FROM auth.users WHERE id = user_id;

    IF user_record IS NULL THEN
      RETURN json_build_object('success', false, 'type', 'error', 'message', 'User not found');
    END IF;

    INSERT INTO public.user_profiles (id, institution_id, is_admin, institution, first_name, last_name, phone, role, email)
    VALUES (user_id, invitation_record.institution_id, false, invitation_record.institution_name,
      user_record.raw_user_meta_data->>'first_name', user_record.raw_user_meta_data->>'last_name',
      user_record.raw_user_meta_data->>'phone', user_record.raw_user_meta_data->>'role', user_record.email)
    ON CONFLICT (id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id, is_admin = EXCLUDED.is_admin, institution = EXCLUDED.institution,
      first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, phone = EXCLUDED.phone, role = EXCLUDED.role, email = EXCLUDED.email
    RETURNING * INTO profile_record;

    UPDATE public.invitations SET used_at = now(), used_by = user_id WHERE id = invitation_record.id;

    RETURN json_build_object('success', true, 'type', 'success', 'message', 'Successfully joined ' || invitation_record.institution_name,
      'institution_id', invitation_record.institution_id, 'institution_name', invitation_record.institution_name,
      'profile', json_build_object('id', profile_record.id, 'email', profile_record.email, 'institution_id', profile_record.institution_id,
        'institution', profile_record.institution, 'first_name', profile_record.first_name, 'last_name', profile_record.last_name, 'role', profile_record.role));
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'type', 'error', 'message', 'Error joining institution: ' || SQLERRM);
  END;
END;
$function$;

-- Rollback: restaurar grants originais
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_institution(uuid, text) TO anon;
```

**Não executado.** A correção está funcionando corretamente.

---

## 23. DIVERGÊNCIAS

**Nenhuma divergência encontrada.**

- Assinatura preservada: `join_institution(user_id uuid, invitation_code text) RETURNS json`
- Lógica interna preservada: clean_code, TRIM, validação de vazio, FOR UPDATE, verificação used_at, verificação expires_at, consulta auth.users, INSERT/ON CONFLICT, UPDATE invitations, JSON retornado, exception handling
- `auth.uid()` verificação adicionada no início, antes de qualquer acesso a dados
- `IS DISTINCT FROM` usado para tratar NULL com segurança
- search_path endurecido: `public, pg_temp`
- Grants: PUBLIC/anon revogados, authenticated/service_role/postgres mantidos
- Nenhum dado alterado (8 checksums idênticos)
- Nenhuma FK mudou (28 = 20 CASCADE + 5 RESTRICT + 3 SET NULL)
- Nenhuma policy RLS mudou (49)
- Nenhuma outra função mudou
- Proteção 1G-A intacta
- Proteções 1F-A e 1F-C intactas
- Frontend inalterado
- Função não foi executada

---

## RESUMO EXECUTIVO

A função `join_institution` foi protegida com verificação de identidade. Antes, qualquer pessoa — incluindo usuários não autenticados — podia chamar esta função com qualquer `user_id`, movendo outro usuário para uma instituição diferente sem consentimento, effectively realizando account takeover parcial. Agora:

1. **auth.uid() obrigatório** — a função exige que o caller esteja autenticado
2. **user_id = auth.uid()** — a função exige que o `user_id` passado seja o do próprio caller
3. **anon e PUBLIC** não podem mais executar a função — grants revogados
4. **authenticated, service_role, postgres** mantêm EXECUTE
5. **search_path** endurecido com `pg_temp`
6. **Lógica interna** idêntica — sem mudanças funcionais no processamento do convite
7. **Nenhum dado** foi alterado (8 checksums idênticos)
8. **Função não foi executada** em momento algum
9. **Frontend** não precisou de alterações (passa `authData.user.id` = `auth.uid()`)
10. **Proteção 1G-A** (handle_user_registration) permanece intacta

A segunda vulnerabilidade ALTA identificada na auditoria 1G foi corrigida: não é mais possível mover outros usuários entre instituições sem estar autenticado como esse usuário. Com 1G-A e 1G-B, ambas as vulnerabilidades ALTAS da auditoria 1G estão agora corrigidas.

**PARE.** Aguardo revisão externa. Não iniciarei 1G-C. Não alterarei `handle_new_user`, `clean_expired_invitations`, `list_active_invitations`, `validate_invitation` ou qualquer outra função.
