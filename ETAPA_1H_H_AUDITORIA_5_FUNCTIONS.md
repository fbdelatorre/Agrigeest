# ETAPA 1H-H — AUDITORIA COMPACTA CONJUNTA

**Data:** 2026-10-07  
**Modo:** READ-ONLY ABSOLUTO  
**Funções auditadas:** `handle_new_user`, `clean_expired_invitations`, `toggle_user_admin_status`, `update_season_status`, `check_institution_exists`

---

## A. Definições Completas

### A.1 handle_new_user

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

  RAISE LOG 'Creating user profile for new user: %, first_name: %, last_name: %', NEW.id, first_name, last_name;

  INSERT INTO public.user_profiles (id, first_name, last_name, phone, role, institution, is_admin, institution_id, email)
  VALUES (NEW.id, first_name, last_name, phone, role, '', false, NULL, NEW.email);

  RETURN NEW;
END;
$function$;
```

| Item | Valor |
|---|---|
| Assinatura | `handle_new_user()` returns `trigger` |
| Owner | postgres |
| SECURITY DEFINER | true |
| proconfig/search_path | **null** (nenhum) |
| Tabelas | `public.user_profiles` (qualificada) |
| auth.uid() | Não usado (não aplicável — trigger) |
| INSERT | Sim — `user_profiles` |
| É trigger? | **Sim** |
| Trigger | `on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW` |
| Usa NEW.id | Sim |
| Usa NEW.email | Sim |
| Usa raw_user_meta_data | Sim — first_name, last_name, phone, role |
| institution_id inicial | NULL |
| is_admin inicial | false |
| Pode ser chamada como RPC? | Não — retorna trigger, não chamável via `.rpc()` |
| Frontend chama? | **Não** — nenhum caller encontrado |

### A.2 clean_expired_invitations

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

| Item | Valor |
|---|---|
| Assinatura | `clean_expired_invitations()` returns `void` |
| Owner | postgres |
| SECURITY DEFINER | true |
| proconfig/search_path | **null** |
| Tabelas | `invitations` (**não qualificada**) |
| auth.uid() | Não |
| Autorização | **Nenhuma** — sem verificação |
| DELETE | Sim — `invitations WHERE expires_at <= now() AND used_at IS NULL` |
| Apaga convite usado? | **Não** — `used_at IS NULL` protege |
| Apaga somente expirado? | Sim — `expires_at <= now()` |
| Retorna | void |
| Frontend caller | **Nenhum** |
| Cron/job/schedule | **Nenhum encontrado** no projeto |
| Outra function chamando | **Nenhuma** |

### A.3 toggle_user_admin_status

```sql
CREATE OR REPLACE FUNCTION public.toggle_user_admin_status(user_id_param uuid, new_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  SELECT institution_id INTO target_institution_id
  FROM user_profiles
  WHERE id = user_id_param;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = target_institution_id
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only administrators can modify admin status';
  END IF;

  UPDATE user_profiles
  SET is_admin = new_status
  WHERE id = user_id_param
  AND institution_id = target_institution_id;
END;
$function$;
```

| Item | Valor |
|---|---|
| Assinatura | `toggle_user_admin_status(user_id_param uuid, new_status boolean)` returns `void` |
| Owner | postgres |
| SECURITY DEFINER | true |
| proconfig/search_path | **null** |
| Tabelas | `user_profiles` (**não qualificada**) |
| auth.uid() | Sim — verifica caller is_admin |
| Caller-controlled user_id | Sim — `user_id_param` |
| Verifica mesma institution | Sim — `institution_id = target_institution_id` |
| Impede alterar outra instituição | Sim |
| Admin altera próprio is_admin | **Sim** — sem bloqueio (pode se auto-rebaixar) |
| Remove último admin | **Sim** — sem proteção (pode deixar instituição sem admin) |
| UPDATE | Sim — `is_admin` em `user_profiles` |
| auth.uid() IS NULL explícito | **Não** — se NULL, EXISTS falha → RAISE EXCEPTION |

### A.4 update_season_status

```sql
CREATE OR REPLACE FUNCTION public.update_season_status(season_id_param uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF new_status = 'active' THEN
    UPDATE seasons
    SET status = 'completed'
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND id != season_id_param;
  END IF;

  UPDATE seasons
  SET status = new_status, updated_at = now()
  WHERE id = season_id_param
    AND user_id = auth.uid();
END;
$function$;
```

| Item | Valor |
|---|---|
| Assinatura | `update_season_status(season_id_param uuid, new_status text)` returns `void` |
| Owner | postgres |
| SECURITY DEFINER | true |
| proconfig/search_path | **null** |
| Tabelas | `seasons` (**não qualificada**) |
| auth.uid() | Sim — `user_id = auth.uid()` em ambos UPDATEs |
| Verifica institution_id | **Não** — usa `user_id = auth.uid()` |
| Ownership | Por `user_id` — somente o criador da season pode atualizar |
| Pode atualizar de outra instituição | Não — seasons têm `user_id`, filtra por auth.uid() |
| UPDATE | Sim — `status` e `updated_at` em `seasons` |
| auth.uid() IS NULL explícito | **Não** — se NULL, UPDATE afeta 0 rows (silencioso) |
| new_status validado | **Não** — qualquer texto aceito |

### A.5 check_institution_exists

```sql
CREATE OR REPLACE FUNCTION public.check_institution_exists(institution_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM institutions
    WHERE LOWER(name) = LOWER(institution_name)
  );
END;
$function$;
```

| Item | Valor |
|---|---|
| Assinatura | `check_institution_exists(institution_name text)` returns `boolean` |
| Owner | postgres |
| SECURITY DEFINER | true |
| proconfig/search_path | **null** |
| Tabelas | `institutions` (**não qualificada**) |
| auth.uid() | Não |
| Escrita | **Não** — somente leitura (SELECT EXISTS) |
| Informações revela | Apenas se instituição com aquele nome existe (boolean) |
| Chamada antes do login | **Sim** — Login.tsx linha 62-65 (useEffect) e linha 271-274 (handleRegister) |

---

## B. Grants

Todas as 5 funções têm grants idênticos:

| Grantee | handle_new_user | clean_expired | toggle_admin | update_season | check_institution |
|---|---|---|---|---|---|
| PUBLIC | EXECUTE | EXECUTE | EXECUTE | EXECUTE | EXECUTE |
| anon | EXECUTE | EXECUTE | EXECUTE | EXECUTE | EXECUTE |
| authenticated | EXECUTE | EXECUTE | EXECUTE | EXECUTE | EXECUTE |
| service_role | EXECUTE | EXECUTE | EXECUTE | EXECUTE | EXECUTE |
| postgres | EXECUTE | EXECUTE | EXECUTE | EXECUTE | EXECUTE |

**Todas têm PUBLIC e anon EXECUTE.**

---

## C. Callers

### handle_new_user
- **Nenhum caller frontend.**
- Trigger: `on_auth_user_created AFTER INSERT ON auth.users`

### clean_expired_invitations
- **Nenhum caller encontrado** (frontend, migrations, ou SQL).
- Nenhum cron/job/schedule encontrado no projeto.

### toggle_user_admin_status
- **Settings.tsx linha 265** — `.rpc('toggle_user_admin_status', { user_id_param: userId, new_status: newStatus })`
- Contexto: admin toggling admin status de usuário na mesma instituição

### update_season_status
- **Navbar.tsx linha 33** — `.rpc('update_season_status', { season_id_param: season.id, new_status: 'active' })`
- **Settings.tsx linha 489** — `.rpc('update_season_status', { season_id_param: seasonId, new_status: newStatus })`

### check_institution_exists
- **Login.tsx linha 63** — `.rpc('check_institution_exists', { institution_name: institution.trim() })` (useEffect, antes do login)
- **Login.tsx linha 272** — `.rpc('check_institution_exists', { institution_name: institution.trim() })` (handleRegister)

---

## D. Riscos Relevantes

| Função | Risco | Detalhe |
|---|---|---|
| handle_new_user | **Baixo** | Trigger-only, não chamável como RPC. Sem search_path. |
| clean_expired_invitations | **Médio** | Sem autorização — qualquer caller com EXECUTE pode deletar convites expirados não-usados. Sem caller legítimo encontrado. |
| toggle_user_admin_status | **Médio** | Sem auth.uid() IS NULL explícito. Admin pode se auto-rebaixar. Pode remover último admin. Sem search_path, tabelas não qualificadas. |
| update_season_status | **Baixo-Médio** | Sem auth.uid() IS NULL explícito (UPDATE silenciosamente afeta 0 rows). new_status não validado. Sem search_path, tabelas não qualificadas. |
| check_institution_exists | **Baixo** | Somente leitura, revela apenas existência (boolean). anon precisa para fluxo de registro. Sem search_path, tabela não qualificada. |

---

## E. Classificação

| Função | Classe | Justificativa |
|---|---|---|
| handle_new_user | **D** | Trigger-only, não deve ser executável como RPC. Remover EXECUTE de todos exceto postgres. |
| clean_expired_invitations | **D** | Sem caller legítimo. Deve ser interna/postgres apenas. Sem autorização é perigoso com EXECUTE público. |
| toggle_user_admin_status | **B** | Precisa correção individual: auth.uid() explícito, search_path, qualificar tabelas, bloquear auto-rebaixamento e último admin. |
| update_season_status | **A** | Hardening simples: search_path, qualificar tabelas, auth.uid() explícito. Lógica de ownership OK. |
| check_institution_exists | **C** | Manter anon (necessário para registro). Hardening: search_path, qualificar tabela, REVOKE PUBLIC. |

---

## F. Plano de Correção Sugerido (SEM IMPLEMENTAR)

| Função | PUBLIC | anon | authenticated | service_role | postgres | search_path | Qualificar? | Alterar lógica? | Pode agrupar? |
|---|---|---|---|---|---|---|---|---|---|
| handle_new_user | REVOKE | REVOKE | REVOKE | REVOKE | manter | public, pg_temp | Sim (user_profiles) | Não | Sim — agrupar com clean_expired |
| clean_expired_invitations | REVOKE | REVOKE | REVOKE | REVOKE | manter | public, pg_temp | Sim (invitations) | Não | Sim — agrupar com handle_new_user |
| toggle_user_admin_status | REVOKE | REVOKE | manter | manter | manter | public, pg_temp | Sim (user_profiles) | Sim — avaliar auto-rebaixamento e último admin | Individual (B) |
| update_season_status | REVOKE | REVOKE | manter | manter | manter | public, pg_temp | Sim (seasons) | Não (ownership OK) | Sim — pode agrupar com check_institution |
| check_institution_exists | REVOKE | **manter** | manter | manter | manter | public, pg_temp | Sim (institutions) | Não | Sim — pode agrupar com update_season |

### Agrupamento sugerido:
- **Migration 1:** `handle_new_user` + `clean_expired_invitations` (ambas categoria D — revogar todos grants exceto postgres, hardening search_path/qualificação)
- **Migration 2:** `update_season_status` + `check_institution_exists` (categoria A/C — hardening simples, manter authenticated/anon conforme necessário)
- **Migration 3:** `toggle_user_admin_status` (categoria B — correção individual, pode exigir mudança de lógica para auto-rebaixamento/último admin)

---

## G. Proteções Anteriores

| Função | search_path | PUBLIC | anon | Status |
|---|---|---|---|---|
| list_institution_users | public, pg_temp | false | false | OK |
| copy_data_to_institution | public, pg_temp | false | false | OK |
| handle_user_registration | public, pg_temp | false | false | OK |
| join_institution | public, pg_temp | false | false | OK |
| list_active_invitations | public, pg_temp | false | false | OK |
| delete_invitation | public, pg_temp | false | false | OK |
| create_invitation | public, pg_temp | false | false | OK |
| validate_invitation | public, pg_temp | false | **true** (intencional) | OK |

**Todas as 8 proteções anteriores confirmadas intactas.**

---

## H. Counts PRE/POST

| Tabela | PRE | POST | Match |
|---|---|---|---|
| invitations | 7 | 7 | ✅ |
| user_profiles | 6 | 6 | ✅ |
| seasons | 5 | 5 | ✅ |

**ZERO DATA LOSS.** Etapa exclusivamente read-only.

---

## I. Divergências

Nenhuma divergência encontrada. Todos os estados correspondem ao esperado.

### Observações adicionais:
1. **handle_new_user** já qualifica `public.user_profiles` no INSERT, mas não tem search_path definido. Como trigger, é executada pelo postgres automaticamente — revogar EXECUTE não afeta o trigger (triggers executam como owner da tabela).
2. **clean_expired_invitations** não tem nenhum caller no projeto. Possivelmente era para ser usada por um cron job que não existe mais, ou nunca foi implementada. DELETE sem autorização com EXECUTE público é o maior risco deste conjunto.
3. **toggle_user_admin_status** permite que admin se auto-rebaixe e remova o último admin — isso pode deixar uma instituição sem administrador. Avaliar se isso deve ser corrigido na migration B.
4. **update_season_status** filtra por `user_id = auth.uid()` — se auth.uid() for NULL, ambos UPDATEs afetam 0 rows silenciosamente. Não é um risco de segurança (nada é alterado), mas seria melhor ter um early exit explícito.
5. **check_institution_exists** revela apenas se uma instituição com dado nome existe — é uma informação de baixa sensibilidade, necessária para o fluxo de registro (anon).

---

**Status:** READ-ONLY ABSOLUTO. Nenhuma alteração foi feita. ZERO DATA LOSS. Aguardando revisão externa.

STOP.
