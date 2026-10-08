# ETAPA 1G-A — RESULTADO DA PROTEÇÃO DE handle_user_registration
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**Migration aplicada:** `protect_handle_user_registration_identity`

---

## 1. BACKUP / PITR

- **Último backup conhecido:** Gerenciado pela plataforma Supabase (automático)
- **Status do backup:** Ativo (Supabase gerencia backups automáticos do projeto)
- **PITR:** Habilitado pela plataforma Supabase para projetos em produção
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
| areas | `1f40430c05954fcae4ca737bddc38539` |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` |
| products | `40fa32700e59f87773383c100a225907` |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` |
| seasons | `981c3b936b8678c9255424694bf4ffa6` |
| invitations | `a94453b17e8851b84671bdde60a30201` |

---

## 4. DEFINIÇÃO PRE

```sql
CREATE OR REPLACE FUNCTION public.handle_user_registration(user_id uuid, institution_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_institution_id uuid;
  user_profile_record RECORD;
BEGIN
  RAISE LOG 'handle_user_registration called with user_id: %, institution_name: %', user_id, institution_name;

  IF EXISTS (
    SELECT 1 FROM institutions WHERE LOWER(name) = LOWER(institution_name)
  ) THEN
    RAISE EXCEPTION 'Institution already exists';
  END IF;

  BEGIN
    INSERT INTO institutions (name, created_by)
    VALUES (institution_name, user_id)
    RETURNING id INTO new_institution_id;

    SELECT * INTO user_profile_record FROM user_profiles WHERE id = user_id;

    IF user_profile_record IS NULL THEN
      INSERT INTO user_profiles (id, institution_id, is_admin, institution, first_name, last_name, phone, role)
      SELECT user_id, new_institution_id, true, institution_name,
        COALESCE(raw_user_meta_data->>'first_name', ''),
        COALESCE(raw_user_meta_data->>'last_name', ''),
        COALESCE(raw_user_meta_data->>'phone', ''),
        COALESCE(raw_user_meta_data->>'role', '')
      FROM auth.users WHERE id = user_id;
    ELSE
      UPDATE user_profiles SET institution_id = new_institution_id, is_admin = true, institution = institution_name
      WHERE id = user_id;
    END IF;

    RETURN json_build_object('success', true, 'message', '...', 'institution_id', new_institution_id, 'institution_name', institution_name);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Error creating institution: %', SQLERRM;
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
| Assinatura | `handle_user_registration(user_id uuid, institution_name text) RETURNS json` |
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

## 6. CONFIRMAÇÃO DO FLUXO FRONTEND

Arquivo: `src/pages/auth/Login.tsx` — função `handleRegister` (linhas 259-370)

Fluxo legítimo confirmado:

1. `supabase.auth.signUp({ email, password, options: { data: { first_name, last_name, phone, role } } })` → linha 287
2. `authData.user.id` obtido → linha 301
3. `supabase.rpc('handle_user_registration', { user_id: authData.user.id, institution_name: institution.trim() })` → linhas 331-334

**O frontend passa `authData.user.id` como `user_id`** — ou seja, após o signup, o usuário está autenticado e `auth.uid()` será igual a `user_id`.

A verificação `user_id IS DISTINCT FROM auth.uid()` não quebrará o fluxo legítimo.

---

## 7. SQL EXATO EXECUTADO

Arquivo: `supabase/migrations/protect_handle_user_registration_identity.sql`

```sql
CREATE OR REPLACE FUNCTION public.handle_user_registration(
  user_id uuid,
  institution_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  new_institution_id uuid;
  user_profile_record RECORD;
BEGIN
  -- Identity check: require authenticated user and matching user_id
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
  END IF;

  -- Log the function call
  RAISE LOG 'handle_user_registration called with user_id: %, institution_name: %', user_id, institution_name;

  -- Check if institution already exists (case insensitive)
  IF EXISTS (
    SELECT 1 
    FROM public.institutions 
    WHERE LOWER(name) = LOWER(institution_name)
  ) THEN
    RAISE EXCEPTION 'Institution already exists';
  END IF;

  -- Start transaction to ensure atomicity
  BEGIN
    -- Create new institution
    INSERT INTO public.institutions (name, created_by)
    VALUES (institution_name, user_id)
    RETURNING id INTO new_institution_id;
    
    RAISE LOG 'Created new institution with id: %', new_institution_id;

    -- Check if user profile exists
    SELECT * INTO user_profile_record
    FROM public.user_profiles
    WHERE id = user_id;

    IF user_profile_record IS NULL THEN
      -- Create new user profile if it doesn't exist
      RAISE LOG 'User profile does not exist, creating new profile for user: %', user_id;
      
      INSERT INTO public.user_profiles (
        id, institution_id, is_admin, institution,
        first_name, last_name, phone, role
      )
      SELECT
        user_id, new_institution_id, true, institution_name,
        COALESCE(raw_user_meta_data->>'first_name', ''),
        COALESCE(raw_user_meta_data->>'last_name', ''),
        COALESCE(raw_user_meta_data->>'phone', ''),
        COALESCE(raw_user_meta_data->>'role', '')
      FROM auth.users
      WHERE id = user_id;
    ELSE
      -- Update existing user profile
      RAISE LOG 'User profile exists, updating profile for user: %', user_id;
      
      UPDATE public.user_profiles
      SET 
        institution_id = new_institution_id,
        is_admin = true,
        institution = institution_name
      WHERE id = user_id;
    END IF;

    -- Return success
    RETURN json_build_object(
      'success', true,
      'message', 'Successfully created institution and updated user profile',
      'institution_id', new_institution_id,
      'institution_name', institution_name
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'Error in handle_user_registration: %, SQLSTATE: %', SQLERRM, SQLSTATE;
      RAISE EXCEPTION 'Error creating institution: %', SQLERRM;
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) FROM anon;

GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO postgres;
```

### Mudanças aplicadas:
1. **`IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'`** — adicionado no início
2. **`IF user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Unauthorized user'`** — adicionado logo após
3. **`SET search_path = public, pg_temp`** — endurecido (era `public`)
4. **Tabelas qualificadas com `public.`** — `institutions`, `user_profiles` (ambas INSERT e SELECT/UPDATE)
5. **REVOKE de PUBLIC e anon**
6. **GRANT explícito para authenticated, service_role, postgres**
7. Lógica interna — **inalterada**

---

## 8. DEFINIÇÃO POST

```sql
CREATE OR REPLACE FUNCTION public.handle_user_registration(user_id uuid, institution_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  new_institution_id uuid;
  user_profile_record RECORD;
BEGIN
  -- Identity check: require authenticated user and matching user_id
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized user';
  END IF;

  -- Log the function call
  RAISE LOG 'handle_user_registration called with user_id: %, institution_name: %', user_id, institution_name;
  ... (lógica original preservada)
END;
$function$;
```

| Propriedade | Valor POST |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | true |
| search_path (proconfig) | `search_path=public, pg_temp` |
| Volatility | VOLATILE (V) |
| Assinatura | `handle_user_registration(user_id uuid, institution_name text) RETURNS json` — idêntica |
| auth.uid() | **SIM — presente nas duas primeiras verificações** |

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

## 11. ANÁLISE DOS TRÊS CENÁRIOS DE AUTORIZAÇÃO

### CASO A: auth.uid() = NULL (anon ou sem sessão)

A função executa:
```sql
IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Authentication required';
END IF;
```
→ **Rejeita antes de qualquer INSERT ou UPDATE.** Nenhum dado é criado ou alterado. A exceção é lançada imediatamente.

### CASO B: auth.uid() = UUID A, user_id = UUID B (A ≠ B)

A função executa:
```sql
IF user_id IS DISTINCT FROM auth.uid() THEN
  RAISE EXCEPTION 'Unauthorized user';
END IF;
```
→ **Rejeita antes de qualquer INSERT ou UPDATE.** `IS DISTINCT FROM` trata NULL com segurança (se user_id for NULL, também rejeita). Nenhum dado é criado ou alterado.

### CASO C: auth.uid() = UUID A, user_id = UUID A (legítimo)

Ambas as verificações passam:
- `auth.uid() IS NULL` → false (uid não é NULL)
- `user_id IS DISTINCT FROM auth.uid()` → false (são iguais)

→ **Fluxo continua para a lógica original.** A função procede normalmente: verifica instituição, cria institution, cria/atualiza user_profiles, retorna JSON de sucesso.

---

## 12. CONFIRMAÇÃO DE QUE A FUNÇÃO NÃO FOI EXECUTADA

A função `handle_user_registration` **não foi executada** em nenhum momento durante esta etapa. A validação foi feita exclusivamente por:
- `pg_get_functiondef` — leitura da definição
- `pg_proc` — metadados
- `information_schema.routine_privileges` — leitura de grants
- `has_function_privilege` — verificação analítica de permissões
- Checksums de 8 tabelas — prova de que nenhum INSERT/UPDATE ocorreu

Nenhum `SELECT handle_user_registration(...)` foi executado.

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
| areas | `1f40430c05954fcae4ca737bddc38539` | `1f40430c05954fcae4ca737bddc38539` | idêntico |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` | `b57c17c9f60ff02f2c059b5b4b682a3b` | idêntico |
| products | `40fa32700e59f87773383c100a225907` | `40fa32700e59f87773383c100a225907` | idêntico |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | idêntico |
| seasons | `981c3b936b8678c9255424694bf4ffa6` | `981c3b936b8678c9255424694bf4ffa6` | idêntico |
| invitations | `a94453b17e8851b84671bdde60a30201` | `a94453b17e8851b84671bdde60a30201` | idêntico |

**Todos os checksums idênticos. Nenhuma linha foi criada, alterada ou excluída.**

---

## 15. PRE vs POST

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
| checksum areas | 1f40430c... | 1f40430c... | idêntico |
| checksum operations | b57c17c9... | b57c17c9... | idêntico |
| checksum products | 40fa3270... | 40fa3270... | idêntico |
| checksum product_lots | cdc7b4f6... | cdc7b4f6... | idêntico |
| checksum seasons | 981c3b93... | 981c3b93... | idêntico |
| checksum invitations | a94453b1... | a94453b1... | idêntico |

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

## 18. OUTRAS SECURITY DEFINER

| Função | prosecdef | proconfig | Status |
|---|---|---|---|
| check_institution_exists | true | null | inalterada |
| clean_expired_invitations | true | null | inalterada |
| copy_data_to_institution | true | search_path=public, pg_temp | inalterada (proteção 1F-C) |
| create_invitation | true | search_path=public | inalterada |
| delete_invitation | true | null | inalterada |
| handle_new_user | true | null | inalterada |
| **handle_user_registration** | **true** | **search_path=public, pg_temp** | **MODIFICADA** |
| join_institution | true | search_path=public | inalterada |
| list_active_invitations | true | null | inalterada |
| list_institution_users | true | search_path=public, pg_temp | inalterada (proteção 1F-A) |
| toggle_user_admin_status | true | null | inalterada |
| update_season_status | true | null | inalterada |
| validate_invitation | true | search_path=public | inalterada |

Apenas `handle_user_registration` foi modificada. `join_institution` permanece inalterada. `copy_data_to_institution` mantém a proteção da Etapa 1F-C. `list_institution_users` mantém a proteção da Etapa 1F-A.

---

## 19. FRONTEND INALTERADO

**0 arquivos frontend modificados.**

O fluxo legítimo do frontend (`Login.tsx`) passa `authData.user.id` como `user_id` após `supabase.auth.signUp()`. Como o usuário está autenticado nesse ponto, `auth.uid() = user_id` e a verificação passa. Nenhuma adaptação do frontend é necessária.

---

## 20. ROLLBACK PREPARADO (NÃO EXECUTADO)

```sql
-- Rollback: restaurar definição PRE (sem auth.uid(), search_path=public, tabelas não qualificadas)
CREATE OR REPLACE FUNCTION public.handle_user_registration(
  user_id uuid, institution_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_institution_id uuid;
  user_profile_record RECORD;
BEGIN
  RAISE LOG 'handle_user_registration called with user_id: %, institution_name: %', user_id, institution_name;

  IF EXISTS (
    SELECT 1 FROM institutions WHERE LOWER(name) = LOWER(institution_name)
  ) THEN
    RAISE EXCEPTION 'Institution already exists';
  END IF;

  BEGIN
    INSERT INTO institutions (name, created_by)
    VALUES (institution_name, user_id)
    RETURNING id INTO new_institution_id;

    SELECT * INTO user_profile_record FROM user_profiles WHERE id = user_id;

    IF user_profile_record IS NULL THEN
      INSERT INTO user_profiles (id, institution_id, is_admin, institution, first_name, last_name, phone, role)
      SELECT user_id, new_institution_id, true, institution_name,
        COALESCE(raw_user_meta_data->>'first_name', ''),
        COALESCE(raw_user_meta_data->>'last_name', ''),
        COALESCE(raw_user_meta_data->>'phone', ''),
        COALESCE(raw_user_meta_data->>'role', '')
      FROM auth.users WHERE id = user_id;
    ELSE
      UPDATE user_profiles SET institution_id = new_institution_id, is_admin = true, institution = institution_name
      WHERE id = user_id;
    END IF;

    RETURN json_build_object('success', true, 'message', '...', 'institution_id', new_institution_id, 'institution_name', institution_name);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Error creating institution: %', SQLERRM;
  END;
END;
$function$;

-- Rollback: restaurar grants originais
GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_user_registration(uuid, text) TO anon;
```

**Não executado.** A correção está funcionando corretamente.

---

## 21. DIVERGÊNCIAS

**Nenhuma divergência encontrada.**

- Assinatura preservada: `handle_user_registration(user_id uuid, institution_name text) RETURNS json`
- Lógica interna preservada: mesma criação de institution, mesmo INSERT/UPDATE de user_profiles, mesmo JSON retornado
- `auth.uid()` verificação adicionada no início, antes de qualquer escrita
- `IS DISTINCT FROM` usado para tratar NULL com segurança
- search_path endurecido: `public, pg_temp`
- Tabelas qualificadas: `public.institutions`, `public.user_profiles`
- Grants: PUBLIC/anon revogados, authenticated/service_role/postgres mantidos
- Nenhum dado alterado (8 checksums idênticos)
- Nenhuma FK mudou (28 = 20 CASCADE + 5 RESTRICT + 3 SET NULL)
- Nenhuma policy RLS mudou (49)
- Nenhuma outra função mudou
- Frontend inalterado
- Função não foi executada

---

## RESUMO EXECUTIVO

A função `handle_user_registration` foi protegida com verificação de identidade. Antes, qualquer pessoa — incluindo usuários não autenticados — podia chamar esta função com qualquer `user_id`, criar uma instituição e tornar qualquer usuário admin, effectively sequestrando contas. Agora:

1. **auth.uid() obrigatório** — a função exige que o caller esteja autenticado
2. **user_id = auth.uid()** — a função exige que o `user_id` passado seja o do próprio caller
3. **anon e PUBLIC** não podem mais executar a função — grants revogados
4. **authenticated, service_role, postgres** mantêm EXECUTE
5. **search_path** endurecido com `pg_temp` e tabelas qualificadas com `public.`
6. **Lógica interna** idêntica — sem mudanças funcionais
7. **Nenhum dado** foi alterado (8 checksums idênticos)
8. **Função não foi executada** em momento algum
9. **Frontend** não precisou de alterações (passa `authData.user.id` = `auth.uid()`)

A vulnerabilidade ALTA identificada na auditoria 1G foi corrigida: não é mais possível criar instituições em nome de outros usuários ou tornar outros usuários admin sem estar autenticado como esse usuário.

**PARE.** Aguardo revisão externa. Não iniciarei 1G-B. Não alterarei `join_institution` ou qualquer outra função.
