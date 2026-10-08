# ETAPA 1G — AUDITORIA DO FLUXO DE CADASTRO, CONVITES E INSTITUIÇÕES
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**MODO:** READ-ONLY ABSOLUTO. Nenhuma migration criada. Nenhuma função alterada. Nenhum dado modificado.

---

## A. BASELINE PRE

| Tabela | Contagem |
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

| Sentinela | Valor |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## B. INVENTÁRIO DE FUNÇÕES

| Função | Assinatura | Owner | SD | Vol | search_path | auth.uid() |
|---|---|---|---|---|---|---|
| check_institution_exists | (institution_name text) → boolean | postgres | Sim | V | NULL | NÃO |
| clean_expired_invitations | () → void | postgres | Sim | V | NULL | NÃO |
| create_invitation | (p_institution_id uuid, p_expires_in_days int) → text | postgres | Sim | V | public | SIM |
| delete_invitation | (invitation_code text) → boolean | postgres | Sim | V | NULL | SIM |
| handle_new_user | () → trigger | postgres | Sim | V | NULL | NÃO (usa NEW) |
| handle_user_registration | (user_id uuid, institution_name text) → json | postgres | Sim | V | public | NÃO |
| join_institution | (user_id uuid, invitation_code text) → json | postgres | Sim | V | public | NÃO |
| list_active_invitations | (institution_id_param uuid) → TABLE | postgres | Sim | V | NULL | SIM |
| validate_invitation | (invitation_code text) → jsonb | postgres | Sim | V | public | NÃO |

### Grants (TODAS as 9 funções têm o MESMO padrão):

| Grantee | EXECUTE |
|---|---|
| PUBLIC | Sim (todas) |
| anon | Sim (todas) |
| authenticated | Sim (todas) |
| postgres | Sim (todas) |
| service_role | Sim (todas) |

### Operações por função:

| Função | SELECT | INSERT | UPDATE | DELETE | Tabelas |
|---|---|---|---|---|---|
| check_institution_exists | institutions | — | — | — | institutions |
| clean_expired_invitations | — | — | — | invitations | invitations |
| create_invitation | user_profiles | invitations | — | — | user_profiles, invitations |
| delete_invitation | invitations, user_profiles | — | — | invitations | invitations, user_profiles |
| handle_new_user | — | user_profiles | — | — | user_profiles |
| handle_user_registration | institutions, user_profiles, auth.users | institutions, user_profiles | user_profiles | — | institutions, user_profiles, auth.users |
| join_institution | invitations, institutions, auth.users | user_profiles | invitations | — | invitations, institutions, auth.users, user_profiles |
| list_active_invitations | user_profiles, invitations | — | — | — | user_profiles, invitations |
| validate_invitation | invitations, institutions | — | — | — | invitations, institutions |

---

## C. DEFINIÇÕES SQL COMPLETAS

### check_institution_exists
```sql
CREATE OR REPLACE FUNCTION public.check_institution_exists(institution_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM institutions
    WHERE LOWER(name) = LOWER(institution_name)
  );
END;
$function$;
```
- **search_path:** NULL (não protegido)
- **Tabelas não qualificadas:** `institutions`
- **usa auth.uid():** NÃO
- **usa auth.users:** NÃO

### clean_expired_invitations
```sql
CREATE OR REPLACE FUNCTION public.clean_expired_invitations()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  DELETE FROM invitations
  WHERE expires_at <= timezone('UTC', now())
  AND used_at IS NULL;
END;
$function$;
```
- **search_path:** NULL (não protegido)
- **Tabelas não qualificadas:** `invitations`
- **usa auth.uid():** NÃO
- **Faz DELETE** sem verificar quem chamou

### create_invitation
```sql
CREATE OR REPLACE FUNCTION public.create_invitation(p_institution_id uuid, p_expires_in_days integer DEFAULT 7)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_code text;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;

  -- Generate unique code
  new_code := upper(substring(md5(random()::text) from 1 for 8));

  -- Create invitation with expiration date
  INSERT INTO invitations (
    institution_id, code, expires_at, created_by
  ) VALUES (
    p_institution_id, new_code,
    now() + (p_expires_in_days || ' days')::interval,
    auth.uid()
  );

  RETURN new_code;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating invitation: %', SQLERRM;
END;
$function$;
```
- **search_path:** public (protegido)
- **usa auth.uid():** SIM — verifica admin + membership
- **Tabelas não qualificadas:** `user_profiles`, `invitations` (mas search_path protegido)
- **Código do convite:** `upper(substring(md5(random()::text) from 1 for 8))` — 8 chars hex = 16^8 = 4.294.967.296 combinações
- **Segurança do código:** Usa `random()` que NÃO é criptograficamente seguro. `md5(random()::text)` gera apenas 8 chars hex maiúsculos. Enumerável com força bruta moderada.

### delete_invitation
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
  FROM invitations WHERE code = invitation_code;

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
- **search_path:** NULL (não protegido)
- **usa auth.uid():** SIM — verifica admin + membership
- **Tabelas não qualificadas:** `invitations`, `user_profiles`

### handle_new_user (TRIGGER)
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  first_name text; last_name text; phone text; role text;
BEGIN
  first_name := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  last_name := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
  role := COALESCE(NEW.raw_user_meta_data->>'role', '');

  RAISE LOG 'Creating user profile for new user: %, first_name: %, last_name: %',
    NEW.id, first_name, last_name;

  INSERT INTO public.user_profiles (
    id, first_name, last_name, phone, role, institution, is_admin, institution_id, email
  ) VALUES (
    NEW.id, first_name, last_name, phone, role, '', false, NULL, NEW.email
  );

  RETURN NEW;
END;
$function$;
```
- **search_path:** NULL (não protegido)
- **É trigger function** — chamada via trigger `on_auth_user_created AFTER INSERT ON auth.users`
- **Cria user_profiles:** SIM, com institution_id = NULL, is_admin = false
- **Confia em raw_user_meta_data:** SIM — lê first_name, last_name, phone, role do metadata do cliente
- **role é controlado pelo cliente:** O cliente pode definir qualquer valor de `role` no metadata

### handle_user_registration
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

  -- Check if institution already exists (case insensitive)
  IF EXISTS (
    SELECT 1 FROM institutions WHERE LOWER(name) = LOWER(institution_name)
  ) THEN
    RAISE EXCEPTION 'Institution already exists';
  END IF;

  BEGIN
    -- Create new institution
    INSERT INTO institutions (name, created_by)
    VALUES (institution_name, user_id)
    RETURNING id INTO new_institution_id;

    -- Check if user profile exists
    SELECT * INTO user_profile_record FROM user_profiles WHERE id = user_id;

    IF user_profile_record IS NULL THEN
      -- Create new user profile
      INSERT INTO user_profiles (
        id, institution_id, is_admin, institution,
        first_name, last_name, phone, role
      )
      SELECT
        user_id, new_institution_id, true, institution_name,
        COALESCE(raw_user_meta_data->>'first_name', ''),
        COALESCE(raw_user_meta_data->>'last_name', ''),
        COALESCE(raw_user_meta_data->>'phone', ''),
        COALESCE(raw_user_meta_data->>'role', '')
      FROM auth.users WHERE id = user_id;
    ELSE
      -- Update existing user profile
      UPDATE user_profiles
      SET institution_id = new_institution_id, is_admin = true, institution = institution_name
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
- **search_path:** public (protegido)
- **usa auth.uid():** NÃO — recebe `user_id` como parâmetro
- **Define is_admin = true:** SIM — sempre torna o criador admin
- **Cria institution:** SIM
- **Cria/atualiza user_profiles:** SIM
- **Lê auth.users:** SIM (para metadata se profile não existir)
- **Tabelas não qualificadas:** `institutions`, `user_profiles`, `auth.users` (mas search_path protegido)

### join_institution
```sql
CREATE OR REPLACE FUNCTION public.join_institution(user_id uuid, invitation_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD; user_record RECORD; profile_record RECORD;
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
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'Already used');
      END IF;
      IF invitation_record.expires_at < now() THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'Expired');
      END IF;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RETURN json_build_object('success', false, 'type', 'error', 'message', 'Invalid invitation code');
    END;

    SELECT * INTO user_record FROM auth.users WHERE id = user_id;
    IF user_record IS NULL THEN
      RETURN json_build_object('success', false, 'type', 'error', 'message', 'User not found');
    END IF;

    -- Create or update profile (ON CONFLICT)
    INSERT INTO public.user_profiles (
      id, institution_id, is_admin, institution,
      first_name, last_name, phone, role, email
    ) VALUES (
      user_id, invitation_record.institution_id, false,
      invitation_record.institution_name,
      user_record.raw_user_meta_data->>'first_name',
      user_record.raw_user_meta_data->>'last_name',
      user_record.raw_user_meta_data->>'phone',
      user_record.raw_user_meta_data->>'role',
      user_record.email
    )
    ON CONFLICT (id) DO UPDATE
    SET institution_id = EXCLUDED.institution_id, is_admin = EXCLUDED.is_admin,
        institution = EXCLUDED.institution, first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name, phone = EXCLUDED.phone, role = EXCLUDED.role, email = EXCLUDED.email
    RETURNING * INTO profile_record;

    -- Mark invitation as used
    UPDATE public.invitations
    SET used_at = now(), used_by = user_id
    WHERE id = invitation_record.id;

    RETURN json_build_object('success', true, ...);
  EXCEPTION
    WHEN OTHERS THEN
      RETURN json_build_object('success', false, 'type', 'error', 'message', 'Error: ' || SQLERRM);
  END;
END;
$function$;
```
- **search_path:** public (protegido)
- **usa auth.uid():** NÃO — recebe `user_id` como parâmetro
- **Define is_admin = false:** SIM — sempre false para quem entra via convite
- **Valida convite:** SIM — verifica existência, expiração, uso prévio (com FOR UPDATE lock)
- **Sobrescreve user_profiles:** SIM — ON CONFLICT DO UPDATE sobrescreve institution_id, is_admin, role, etc.
- **Pode mover usuário entre instituições:** SIM — se um usuário já existe com institution_id A, e usa um convite da instituição B, seu institution_id muda para B e is_admin vira false

### list_active_invitations
```sql
CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(code text, created_at timestamptz, expires_at timestamptz, created_by_name text, used_at timestamptz, used_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Check if user belongs to institution
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'User does not belong to this institution';
  END IF;

  RETURN QUERY
  SELECT i.code, i.created_at, i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at, (up.first_name || ' ' || up.last_name) as used_by_name
  FROM invitations i
  LEFT JOIN user_profiles cp ON cp.id = i.created_by
  LEFT JOIN user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$function$;
```
- **search_path:** NULL (não protegido)
- **usa auth.uid():** SIM — verifica membership (mas NÃO verifica is_admin)
- **Tabelas não qualificadas:** `user_profiles`, `invitations`
- **Retorna:** código do convite, datas, nomes de criador/usuário — **expõe códigos de convite ativos**

### validate_invitation
```sql
CREATE OR REPLACE FUNCTION public.validate_invitation(invitation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD; institution_name text;
BEGIN
  SELECT i.*, inst.name as institution_name
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON i.institution_id = inst.id
  WHERE i.code = invitation_code
  LIMIT 1;

  IF invitation_record IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invalid invitation code');
  END IF;

  IF invitation_record.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invitation code has expired');
  END IF;

  IF invitation_record.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invitation code has already been used');
  END IF;

  RETURN jsonb_build_object('valid', true, 'message', 'Valid invitation code',
    'institution_name', invitation_record.institution_name);
END;
$function$;
```
- **search_path:** public (protegido)
- **usa auth.uid():** NÃO
- **Retorna:** `valid` (bool), `message`, `institution_name` (se válido)
- **Diferencia mensagens de erro:** "Invalid", "expired", "already used" — permite enumerar
- **Expõe nome da instituição:** SIM — revela o nome da instituição ao inserir um código válido

---

## D. TRIGGER auth.users

```
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user()
```

### Fluxo:
1. `supabase.auth.signUp()` cria registro em `auth.users`
2. Trigger `on_auth_user_created` disporta automaticamente
3. `handle_new_user()` lê `NEW.raw_user_meta_data` (first_name, last_name, phone, role)
4. Cria `user_profiles` com:
   - `id` = NEW.id
   - `institution_id` = NULL
   - `is_admin` = false
   - `institution` = '' (vazio)
   - `email` = NEW.email

### Respostas:
- **Cria user_profiles?** SIM
- **Cria institution?** NÃO
- **Usa invitation_code?** NÃO
- **Confia em metadata do cliente?** SIM — `first_name`, `last_name`, `phone`, `role` são todos controlados pelo cliente

---

## E. SIGNUP NO FRONTEND

Arquivo: `src/pages/auth/Login.tsx`

### Fluxo NOVO USUÁRIO + NOVA INSTITUIÇÃO:

1. **PASSO 1:** Usuário preenche firstName, lastName, email, password, phone, role, institution name
2. **PASSO 2:** Frontend chama `check_institution_exists({ institution_name })` — RPC anon
3. **PASSO 3:** Se instituição não existe, frontend chama `supabase.auth.signUp()` com:
   ```
   options.data = { first_name, last_name, phone, role }
   ```
4. **PASSO 4:** Trigger `handle_new_user()` cria `user_profiles` com institution_id=NULL
5. **PASSO 5:** Frontend chama `handle_user_registration({ user_id, institution_name })` — RPC authenticated
6. **PASSO 6:** `handle_user_registration` cria `institutions` + atualiza `user_profiles` com institution_id + is_admin=true

### Fluxo NOVO USUÁRIO + CONVITE (JOIN):

1. **PASSO 1:** Usuário preenche firstName, lastName, email, password, phone, role, invitationCode
2. **PASSO 2:** Frontend valida convite chamando `validate_invitation({ invitation_code })` — RPC anon
3. **PASSO 3:** Se válido, frontend chama `supabase.auth.signUp()` com:
   ```
   options.data = { first_name, last_name, phone, role }
   ```
4. **PASSO 4:** Trigger `handle_new_user()` cria `user_profiles` com institution_id=NULL
5. **PASSO 5:** Frontend chama `join_institution({ user_id, invitation_code })` — RPC authenticated
6. **PASSO 6:** `join_institution` valida convite, cria/atualiza `user_profiles` com institution_id do convite, is_admin=false, marca convite como usado

### Dados enviados ao Auth:
- email, password (credenciais)
- metadata: first_name, last_name, phone, role (controlados pelo cliente)

### RPCs chamadas:
- Antes do signup: `check_institution_exists` ou `validate_invitation` (como anon)
- Depois do signup: `handle_user_registration` ou `join_institution` (como authenticated)

---

## F. LOGIN EXISTENTE

Arquivo: `src/hooks/useAuth.ts` + `src/context/AppContext.tsx`

### Fluxo:
1. `supabase.auth.signInWithPassword({ email, password })`
2. `useAuth` detecta sessão via `onAuthStateChange`
3. `AppContext.loadUserProfile()` busca `user_profiles` onde `id = user.id`
4. Se profile não existe: `console.error('Error loading user profile')` — o app continua mas `profile` é NULL
5. Se profile existe: define `profile` com institutionId, isAdmin, etc.
6. Se `session` existe: redireciona para `/` (Dashboard)

### Se auth.users existe MAS user_profiles não existe:
- O app carrega mas `profile` fica NULL
- O usuário não terá `institutionId`, então nenhuma operação que depende de instituição funcionará
- O Dashboard provavelmente mostra estado vazio/erro
- **Não há fluxo de recuperação** — o usuário fica preso sem instituição

---

## G. FLUXO DE CONVITE COMPLETO

### Admin cria convite:
1. **Frontend:** Settings.tsx → `handleCreateInvitation()` → `create_invitation({ p_institution_id: profile.institutionId })`
2. **RPC:** `create_invitation` verifica admin + membership, gera código de 8 chars, insere em `invitations`
3. **Retorno:** código do convite (ex: "A3F8B2C1")
4. **Admin:** copia código e envia ao convidado (manualmente, fora do app)

### Usuário recebe e usa convite:
1. **Frontend:** Login.tsx → checkbox "Tem um convite?" → digita código
2. **RPC (anon):** `validate_invitation({ invitation_code })` → retorna `{ valid, institution_name }`
3. **Frontend:** mostra nome da instituição, habilita submit
4. **Auth:** `supabase.auth.signUp()` → trigger cria `user_profiles` com institution_id=NULL
5. **RPC (authenticated):** `join_institution({ user_id, invitation_code })` → valida convite, atualiza profile, marca convite como usado

### Admin gerencia convites:
1. **Listar:** `list_active_invitations({ institution_id_param })` → mostra todos convites da instituição
2. **Excluir:** `delete_invitation({ invitation_code })` → verifica admin + membership, exclui

---

## H. EDGE FUNCTION invites

| Propriedade | Valor |
|---|---|
| Slug | invites |
| Status | ACTIVE |
| verify_jwt | true |
| ID | 97f037f4-d315-4986-86e6-2aa5b55ee4eb |

### Código-fonte:
**CÓDIGO NÃO DISPONÍVEL.** O diretório `supabase/functions/` não existe no repositório local. A Edge Function está deployada no Supabase mas seu código-fonte não está versionado no projeto.

### Análise:
- `verify_jwt = true` significa que apenas usuários autenticados podem chamá-la
- O nome `invites` sugere que trata de convites, mas **não posso confirmar** sem ver o código
- Não há referências a `invites` no frontend (busca por `invites` em `src/` não encontrou chamadas diretas à Edge Function)
- Pode ser uma função administrativa ou um endpoint que chama as RPCs existentes

---

## I. VALIDATE_INVITATION

### Precisa ser callable por anon?
**SIM** — o fluxo de signup chama `validate_invitation` ANTES de `supabase.auth.signUp()`. O usuário ainda não está autenticado quando valida o convite. Se revogarmos anon, o fluxo de "entrar com convite" quebra.

### Informações retornadas:
- `valid` (bool)
- `message` (string)
- `institution_name` (string, apenas se válido)

### Enumeração:
- **Código inválido:** retorna "Invalid invitation code"
- **Código expirado:** retorna "Invitation code has expired"
- **Código já usado:** retorna "Invitation code has already been used"
- **Diferença entre mensagens:** SIM — um atacante pode distinguir entre códigos que existem (expirados/usados) e códigos que não existem

### Rate limit:
**NÃO** — não há rate limit na função. O Supabase pode ter rate limits na API, mas a função em si não implementa.

### Brute force:
O código tem 8 chars hex (0-9, A-F) = 16^8 = 4.294.967.296 combinações. Com `random()` (não criptograficamente seguro) e apenas 8 chars, é teoricamente enumerável com bots, mas o espaço é grande o suficiente para dificultar ataques práticos sem rate limit excessivo.

### Retorna institution_id?
NÃO — apenas `institution_name`.

### Retorna email?
NÃO.

---

## J. CHECK_INSTITUTION_EXISTS

### Precisa ser anon?
**SIM** — o fluxo de signup chama `check_institution_exists` ANTES de `supabase.auth.signUp()`. O usuário ainda não está autenticado.

### Parâmetro:
`institution_name text`

### Retorno:
`boolean` — true se existe, false se não

### Enumeração:
- Permite verificar se uma instituição com determinado nome existe (case insensitive)
- **NÃO expõe ID, nem dados da instituição** — apenas sim/não
- Um atacante pode enumerar nomes de instituições tentando valores comuns ("Fazenda São Pedro", "Grupo Delatorre", etc.)
- **Risco BAIXO** — apenas confirma existência de nome, não expõe dados

### Usada pelo frontend?
**SIM** — `Login.tsx` linhas 62-64 e 271-273, chamada antes do signup para evitar duplicação

---

## K. HANDLE_USER_REGISTRATION

### Quem chama?
**Frontend** — `Login.tsx` linha 331, após `supabase.auth.signUp()`, chamada como RPC authenticated

### Pode ser chamada diretamente via RPC?
**SIM** — EXECUTE para PUBLIC, anon, authenticated

### Confia em parâmetros do caller?
**SIM** — recebe `user_id` e `institution_name` como parâmetros sem verificar que `user_id = auth.uid()`

### Pode escolher institution_id arbitrário?
**NÃO diretamente** — a função cria uma NOVA instituição com o nome fornecido. Não permite escolher um institution_id existente.

### Pode definir is_admin?
**SIM** — sempre define `is_admin = true` para o `user_id` fornecido

### Pode definir role?
**NÃO diretamente** — role vem de `auth.users.raw_user_meta_data`, que é controlado pelo cliente no signup

### Pode criar institution?
**SIM** — cria uma nova instituição com o nome fornecido

### Pode modificar user_profiles?
**SIM** — se o profile já existe (criado pelo trigger), atualiza `institution_id`, `is_admin = true`, `institution = institution_name`

### Usa auth.uid()?
**NÃO**

### Risco:
Um atacante autenticado pode:
1. Chamar `handle_user_registration` com qualquer `user_id` (não apenas o seu)
2. Criar uma instituição com qualquer nome (se não existir)
3. Tornar QUALQUER usuário admin da nova instituição
4. Se o `user_id` já tem um profile, sobrescrever seu `institution_id` e torná-lo admin da nova instituição

**Risco: ALTO** — um atacante pode criar instituições arbitrárias e tornar qualquer usuário admin, effectively sequestrando contas de outros usuários movendo-os para uma instituição controlada.

---

## L. HANDLE_NEW_USER

### É trigger function?
**SIM** — `RETURNS trigger`, chamada via `on_auth_user_created AFTER INSERT ON auth.users`

### EXECUTE via RPC é necessário?
**NÃO** — trigger functions são chamadas automaticamente pelo PostgreSQL quando o evento ocorre. Não precisam ser chamadas diretamente via RPC. O grant EXECUTE é irrelevante para o funcionamento do trigger.

### Deveria estar exposta para anon/authenticated?
**NÃO** — não há motivo para permitir chamada direta. A função lê `NEW.raw_user_meta_data` que só faz sentido no contexto de um trigger.

### Se chamada diretamente:
A função espera `NEW` como registro de trigger. Chamada direta via RPC falharia com erro de "NEW is not defined" ou similar. Portanto, o grant EXECUTE é inofensivo na prática, mas é má prática.

### Usa NEW?
**SIM** — `NEW.id`, `NEW.raw_user_meta_data`, `NEW.email`

---

## M. JOIN_INSTITUTION

### Quem chama?
**Frontend** — `Login.tsx` linha 310, após `supabase.auth.signUp()`, chamada como RPC authenticated

### Parâmetros:
`user_id uuid, invitation_code text`

### Caller escolhe institution_id?
**NÃO diretamente** — institution_id vem do convite validado

### Usa invitation_code?
**SIM** — valida existência, expiração, uso prévio (com FOR UPDATE lock)

### Usa auth.uid()?
**NÃO** — recebe `user_id` como parâmetro. **NÃO verifica que `user_id = auth.uid()`**

### Pode mover usuário entre instituições?
**SIM** — se um usuário já tem institution_id A, e alguém chama `join_institution` com seu `user_id` e um convite válido da instituição B, o usuário é movido para B com is_admin=false

### Pode sobrescrever user_profiles.institution_id?
**SIM** — via `ON CONFLICT (id) DO UPDATE SET institution_id = EXCLUDED.institution_id`

### Pode elevar role/is_admin?
- `is_admin` é sempre definido como `false` — **não permite escalonamento para admin**
- `role` vem de `auth.users.raw_user_meta_data` — controlado pelo cliente

### Risco:
Um atacante autenticado pode:
1. Obter um código de convite válido (próprio ou roubado)
2. Chamar `join_institution` com o `user_id` de OUTRO usuário e o código
3. Mover o outro usuário para a instituição do convite, removendo-o de sua instituição original
4. O outro usuário perde acesso aos seus dados e ganha acesso à instituição do atacante

**Risco: ALTO** — account takeover parcial. Um atacante pode mover usuários entre instituições sem consentimento.

---

## N. CREATE_INVITATION

### Quem pode criar?
A função verifica `auth.uid() IS NOT NULL` + `is_admin = true` + `institution_id = p_institution_id`.

### institution_id vem do caller?
**SIM** — `p_institution_id` é parâmetro. A função verifica que o caller é admin da MESMA instituição.

### Permite criar convite para outra instituição?
**NÃO** — a verificação `institution_id = p_institution_id` garante que o caller deve ser admin da instituição para a qual está criando o convite.

### Geração de código:
`upper(substring(md5(random()::text) from 1 for 8))` — 8 chars hex maiúsculos. Usa `random()` (não criptograficamente seguro). Espaço: 16^8 ≈ 4.3 bilhões.

### Risco:
- **BAIXO para criação** — verificação de admin + membership está correta
- **MÉDIO para força do código** — `random()` não é criptograficamente seguro, 8 chars é curto para força bruta se não há rate limit

---

## O. LIST_ACTIVE_INVITATIONS

### Quem pode listar?
A função verifica `auth.uid() IS NOT NULL` + `institution_id = institution_id_param` (membership). **NÃO verifica is_admin** — qualquer membro da instituição pode listar convites.

### Restringe à própria instituição?
**SIM** — verifica membership

### Dados retornados:
- `code` — **expõe códigos de convite ativos**
- `created_at`, `expires_at`
- `created_by_name` — nome completo de quem criou
- `used_at`, `used_by_name` — nome completo de quem usou

### Risco:
- **MÉDIO** — qualquer membro (não apenas admin) pode ver códigos de convite ativos. Um membro não-admin pode pegar um código e compartilhar com pessoas não convidadas.
- **BAIXO para cross-institution** — verifica membership corretamente

---

## P. DELETE_INVITATION

### Quem pode apagar?
Verifica `auth.uid() IS NOT NULL` + `is_admin = true` + `institution_id = target_institution_id`.

### Restringe à própria instituição?
**SIM** — verifica que o caller é admin da instituição do convite

### Pode apagar convite de outra instituição?
**NÃO** — a verificação garante que o caller deve ser admin da mesma instituição

### Risco:
**BAIXO** — verificação correta de admin + membership

---

## Q. CLEAN_EXPIRED_INVITATIONS

### Quem pode executar?
**TODOS** — PUBLIC, anon, authenticated. A função não verifica `auth.uid()`.

### O que faz?
`DELETE FROM invitations WHERE expires_at <= timezone('UTC', now()) AND used_at IS NULL`

### Precisa ser RPC?
**NÃO** — esta é uma função de manutenção que deveria ser executada por cron/job, não por clientes da API.

### Existe cron/job chamando-a?
**NÃO DETECTADO** — não há referências no frontend, nem em edge functions, nem em triggers.

### Risco:
- **BAIXO para dados** — apenas exclui convites expirados não usados (efetivamente inúteis)
- **MÉDIO para superfície de ataque** — permite que anon dispare DELETE na tabela invitations, consumindo recursos
- **search_path não protegido**

---

## R. MATRIZ DE ACESSO NECESSÁRIO

| Função | PUBLIC | anon | authenticated | service_role | postgres | Motivo |
|---|---|---|---|---|---|---|
| check_institution_exists | — | SIM | SIM | SIM | SIM | Chamada antes do signup (anon) |
| validate_invitation | — | SIM | SIM | SIM | SIM | Chamada antes do signup (anon) |
| handle_user_registration | — | NÃO | SIM | SIM | SIM | Chamada após signup (authenticated) |
| join_institution | — | NÃO | SIM | SIM | SIM | Chamada após signup (authenticated) |
| handle_new_user | — | NÃO | NÃO | SIM | SIM | Trigger function, não precisa de EXECUTE via API |
| create_invitation | — | NÃO | SIM | SIM | SIM | Chamada por admin autenticado |
| list_active_invitations | — | NÃO | SIM | SIM | SIM | Chamada por membro autenticado |
| delete_invitation | — | NÃO | SIM | SIM | SIM | Chamada por admin autenticado |
| clean_expired_invitations | — | NÃO | NÃO | SIM | SIM | Manutenção, deveria ser cron/service_role apenas |

**Nota:** "—" em PUBLIC significa que PUBLIC não deveria ter EXECUTE em nenhuma função. As roles específicas (anon, authenticated) recebem apenas o necessário.

---

## S. MATRIZ DE RISCO

| Função | Risco | Justificativa |
|---|---|---|
| check_institution_exists | BAIXO | Apenas confirma existência de nome, não expõe dados |
| validate_invitation | MÉDIO | Diferencia mensagens de erro (enumeração), expõe nome da instituição, sem rate limit |
| handle_user_registration | **ALTO** | Não verifica auth.uid(), pode criar instituição para qualquer user_id, torna qualquer usuário admin |
| handle_new_user | BAIXO | Trigger function, chamada direta via RPC falha, mas search_path desprotegido |
| join_institution | **ALTO** | Não verifica auth.uid(), pode mover qualquer usuário entre instituições |
| create_invitation | BAIXO | Verifica admin + membership corretamente, código fraco mas aceitável |
| list_active_invitations | MÉDIO | Não exige admin, expõe códigos de convite ativos a qualquer membro |
| delete_invitation | BAIXO | Verifica admin + membership corretamente |
| clean_expired_invitations | MÉDIO | Executável por anon, dispara DELETE, sem necessidade de RPC, search_path desprotegido |

---

## T. CENÁRIOS DE ATAQUE

### A. anon sem conta:
- Pode chamar `check_institution_exists` → enumerar nomes de instituições
- Pode chamar `validate_invitation` → enumerar códigos de convite (diferencia inválido/expirado/usado)
- Pode chamar `handle_user_registration` com qualquer user_id → **criar instituição e tornar qualquer usuário admin** (se o user_id existe em auth.users)
- Pode chamar `join_institution` com qualquer user_id + código válido → **mover qualquer usuário para a instituição do convite**
- Pode chamar `clean_expired_invitations` → disparar DELETE
- Pode chamar `handle_new_user` diretamente → provavelmente falha (NEW não definido)
- Pode chamar `create_invitation` → falha (auth.uid() é NULL)
- Pode chamar `list_active_invitations` → falha (auth.uid() é NULL)
- Pode chamar `delete_invitation` → falha (auth.uid() é NULL)

### B. authenticated da instituição A:
- Tudo que anon pode, MAIS:
- Pode chamar `handle_user_registration` com user_id de usuário da instituição B → criar nova instituição e mover o usuário de B para a nova instituição como admin
- Pode chamar `join_institution` com user_id de outro usuário + convite da instituição A → mover o outro usuário para A
- Pode chamar `list_active_invitations` com institution_id de A → ver códigos de convite de A (mesmo sem ser admin)
- Pode chamar `create_invitation` apenas se for admin de A

### C. admin da instituição A:
- Tudo que authenticated pode, MAIS:
- Pode criar convites para A
- Pode excluir convites de A
- Pode listar convites de A

### D. usuário convidado ainda sem cadastro:
- Pode validar convite (anon)
- Após signup, o trigger cria profile sem instituição
- O frontend chama `join_institution` para associar

### E. usuário recém-criado:
- Tem auth.users + user_profiles (institution_id=NULL, is_admin=false)
- Se o frontend falhar entre signup e `handle_user_registration`/`join_institution`, o usuário fica sem instituição
- Não há fluxo de recuperação

### F. convite expirado:
- `validate_invitation` retorna `{ valid: false, message: "expired" }`
- `join_institution` retorna `{ success: false, message: "expired" }`

### G. convite já usado:
- `validate_invitation` retorna `{ valid: false, message: "already used" }`
- `join_institution` retorna `{ success: false, message: "already used" }`

---

## U. PRIVILEGE ESCALATION

### Caminho 1: anon → admin de nova instituição (ALTO)
```
anon
→ handle_user_registration(user_id_de_admin_existente, "Instituição Atacante")
→ Cria instituição "Instituição Atacante"
→ Define user_id_de_admin_existente.is_admin = true
→ Define user_id_de_admin_existente.institution_id = nova instituição
```
**Resultado:** O atacante criou uma instituição e moveu um usuário existente para ela como admin. O usuário perde acesso à sua instituição original.

### Caminho 2: authenticated → mover outro usuário (ALTO)
```
authenticated (instituição A)
→ join_institution(user_id_de_outro_usuario, codigo_de_convite_de_A)
→ Valida convite (válido, pertence a A)
→ Atualiza user_id_de_outro_usuario: institution_id = A, is_admin = false
→ Marca convite como usado
```
**Resultado:** O atacante moveu outro usuário para sua instituição sem consentimento. O outro usuário perde acesso aos seus dados originais.

### Caminho 3: authenticated → admin de nova instituição (ALTO)
```
authenticated (instituição A)
→ handle_user_registration(auth.uid(), "Nova Fazenda")
→ Cria instituição "Nova Fazenda"
→ Define auth.uid().is_admin = true
→ Define auth.uid().institution_id = Nova Fazenda
```
**Resultado:** Usuário comum cria sua própria instituição e se torna admin. Embora isso seja similar ao fluxo de registro normal, permite que qualquer usuário autenticado crie instituições ilimitadas.

### Caminho 4: membro não-admin → ver códigos de convite (MÉDIO)
```
authenticated (instituição A, não admin)
→ list_active_invitations(institution_id_de_A)
→ Retorna todos os códigos de convite ativos de A
```
**Resultado:** Membro não-admin pode ver e usar códigos de convite, convidando pessoas para a instituição sem autorização do admin.

### Não encontrado:
- Não há caminho para escalonar is_admin de false para true via `join_institution` (sempre false)
- Não há caminho para escolher role privilegiado via RPC (role vem de metadata do cliente no signup, mas não é usado para autorização no backend)

---

## V. RLS RELACIONADO

### user_profiles:

| Policy | cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can read own profile | SELECT | `auth.uid() = id` | — |
| Users can create own profile | INSERT | — | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` | `auth.uid() = id` |

### institutions:

| Policy | cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can read their own institution | SELECT | `id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | — |
| Users can create institutions | INSERT | — | `NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND institution_id IS NOT NULL)` |

### invitations:

| Policy | cmd | USING | WITH CHECK |
|---|---|---|---|
| Users can read invitations for their institution | SELECT | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | — |
| Admins can create invitations | INSERT | — | `EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = invitations.institution_id)` |

### Interação com SECURITY DEFINER:

Todas as 9 funções são SECURITY DEFINER, executam como postgres, e **bypassam RLS completamente**. As policies acima só se aplicam quando o frontend faz queries diretas (ex: `supabase.from('user_profiles').select(...)`) — não quando chama RPCs.

**Isso significa que:**
- `handle_user_registration` pode criar institutions e modificar user_profiles ignorando RLS
- `join_institution` pode modificar user_profiles ignorando RLS
- `list_active_invitations` pode ler invitations ignorando RLS
- `create_invitation` pode inserir em invitations ignorando RLS
- `delete_invitation` pode excluir de invitations ignorando RLS

---

## W. SEARCH PATHS

| Função | proconfig | Tabelas não qualificadas | Risco |
|---|---|---|---|
| check_institution_exists | NULL | institutions | MÉDIO |
| clean_expired_invitations | NULL | invitations | MÉDIO |
| create_invitation | search_path=public | user_profiles, invitations | BAIXO |
| delete_invitation | NULL | invitations, user_profiles | MÉDIO |
| handle_new_user | NULL | public.user_profiles (qualificada) | BAIXO |
| handle_user_registration | search_path=public | institutions, user_profiles, auth.users | BAIXO |
| join_institution | search_path=public | public.* (qualificadas) | BAIXO |
| list_active_invitations | NULL | user_profiles, invitations | MÉDIO |
| validate_invitation | search_path=public | invitations, institutions | BAIXO |

5 funções sem search_path protegido: `check_institution_exists`, `clean_expired_invitations`, `delete_invitation`, `handle_new_user`, `list_active_invitations`

---

## X. FRONTEND VS BANCO

| Caso | Frontend impede? | Banco/RPC permite? | Risco |
|---|---|---|---|
| Usuário chama handle_user_registration para outro user_id | SIM (frontend usa authData.user.id) | SIM (não verifica auth.uid()) | ALTO |
| Usuário chama join_institution para outro user_id | SIM (frontend usa authData.user.id) | SIM (não verifica auth.uid()) | ALTO |
| Usuário não-admin lista convites | SIM (frontend verifica isAdmin antes de chamar) | SIM (list_active_invitations não exige admin) | MÉDIO |
| Usuário cria instituição já tendo uma | SIM (frontend verifica institutionExists) | SIM (handle_user_registration não verifica) | BAIXO |
| Anon chama clean_expired_invitations | N/A (não há botão no frontend) | SIM (anon tem EXECUTE) | MÉDIO |
| Usuário define role malicioso no metadata | NÃO (frontend envia role livremente) | SIM (handle_new_user confia no metadata) | BAIXO (role não é usado para autorização) |

---

## Y. RECOMENDAÇÕES

| Função | Recomendação | Justificativa |
|---|---|---|
| check_institution_exists | B+D (search_path + revogar PUBLIC, manter anon) | Necessita anon para fluxo de signup. Apenas proteger search_path |
| validate_invitation | A+B (manter + search_path) | Já tem search_path. Manter como está. Considerar mensagens de erro uniformes no futuro |
| handle_user_registration | F+G+B (auth.uid + membership + search_path) | **CRÍTICO:** deve verificar user_id = auth.uid() |
| handle_new_user | B+D (search_path + revogar PUBLIC/anon/authenticated) | Trigger não precisa de EXECUTE via API |
| join_institution | F+G+B (auth.uid + membership + search_path) | **CRÍTICO:** deve verificar user_id = auth.uid() |
| create_invitation | A (manter como está) | Já tem auth.uid + admin + membership + search_path |
| list_active_invitations | H+B (exigir admin + search_path) | Deveria exigir admin, não apenas membership |
| delete_invitation | B (apenas search_path) | Já tem auth.uid + admin + membership. Apenas falta search_path |
| clean_expired_invitations | I+B (service_role/postgres apenas + search_path) | Não precisa ser RPC. Restringir a service_role |

---

## Z. PLANO DE CORREÇÃO

### Prioridade 1 — Vulnerabilidades críticas (ALTO):

**1G-A: `handle_user_registration`** — adicionar `auth.uid()` check (user_id = auth.uid()), proteger search_path, revogar anon
- Maior risco: qualquer pessoa pode criar instituição e tornar qualquer usuário admin
- Menor risco de quebrar cadastro: o fluxo normal usa auth.uid() = user_id

**1G-B: `join_institution`** — adicionar `auth.uid()` check (user_id = auth.uid())
- Maior risco: qualquer pessoa pode mover outro usuário entre instituições
- Menor risco de quebrar cadastro: o fluxo normal usa auth.uid() = user_id

### Prioridade 2 — Vulnerabilidades médias:

**1G-C: `handle_new_user`** — revogar EXECUTE de PUBLIC/anon/authenticated (trigger não precisa), proteger search_path
- Baixo risco de quebrar: trigger funciona sem grants de API

**1G-D: `clean_expired_invitations`** — revogar PUBLIC/anon/authenticated, restringir a service_role, proteger search_path
- Baixo risco de quebrar: ninguém chama esta função

**1G-E: `list_active_invitations`** — adicionar verificação de is_admin, proteger search_path
- Risco médio de quebrar: se houver usuários não-admin que veem convites (mas frontend já restringe a admin)

### Prioridade 3 — Melhorias menores:

**1G-F: `delete_invitation` + `check_institution_exists`** — proteger search_path, revogar PUBLIC
- Baixo risco

---

## AA. BASELINE POST

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

| Sentinela | Valor POST |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## AB. DIVERGÊNCIAS

**Nenhuma divergência.** PRE e POST são idênticos. Nenhum dado foi alterado. Nenhuma função foi modificada. Nenhuma migration foi criada.

---

## RESUMO EXECUTIVO

Esta auditoria mapeou completamente o fluxo de cadastro, convites e entrada em instituições. Encontrou **2 vulnerabilidades ALTAS** e várias médias:

### Vulnerabilidades ALTAS:
1. **`handle_user_registration`** não verifica `auth.uid()` — qualquer pessoa pode criar instituições e tornar qualquer usuário admin, effectively sequestrando contas
2. **`join_institution`** não verifica `auth.uid()` — qualquer pessoa pode mover outro usuário entre instituições sem consentimento

### Vulnerabilidades MÉDIAS:
3. **`handle_new_user`** tem EXECUTE para anon/authenticated desnecessariamente (é trigger)
4. **`clean_expired_invitations`** executável por anon, deveria ser service_role apenas
5. **`list_active_invitations`** não exige admin, expõe códigos de convite a qualquer membro
6. 5 funções sem search_path protegido
7. `validate_invitation` diferencia mensagens de erro (enumeração)

### Pontos importantes:
- `check_institution_exists` e `validate_invitation` **precisam** ser callable por anon (fluxo de signup pré-autenticação)
- `create_invitation` e `delete_invitation` têm verificação correta de admin + membership
- O trigger `handle_new_user` confia em `raw_user_meta_data` do cliente, mas `role` não é usado para autorização no backend
- A Edge Function `invites` está deployada mas seu código-fonte não está no repositório

### Plano de correção proposto:
6 etapas isoladas (1G-A a 1G-F), priorizando as 2 vulnerabilidades ALTAS primeiro, com menor alteração possível em cada etapa.

**PARE.** Aguardo revisão externa. Nenhuma vulnerabilidade foi corrigida nesta etapa.
