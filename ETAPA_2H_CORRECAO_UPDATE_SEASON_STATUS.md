# ETAPA 2H — CORREÇÃO INSTITUCIONAL DE update_season_status

**Data:** 2026-10-07
**Migration:** institutionalize_update_season_status

---

## 1. PRE CHECK: PASS

- Assinatura: `update_season_status(season_id_param uuid, new_status text) RETURNS void`
- SECURITY DEFINER: SIM | Owner: postgres | search_path: public, pg_temp
- Grants: authenticated=EXECUTE, postgres=EXECUTE, service_role=EXECUTE, anon=nenhum
- Lógica atual baseada em `user_id = auth.uid()`: confirmado
- COUNT(seasons) = 5 | CHECKSUM = 1f7fd6e4c4ba9506fd13b3add361c45d
- INST_741ba2ae: 2 seasons, 2 active | INST_e8741889: 3 seasons, 0 active
- Instituição com 2 active: confirmado (INST_741ba2ae)
- Estado coincide com 2G: SIM

---

## 2. ASSINATURA REAL

```
update_season_status(season_id_param uuid, new_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
```

---

## 3. SQL EXECUTADO

`CREATE OR REPLACE FUNCTION` com nova lógica institucional. Ver definição POST abaixo.

---

## 4. DEFINIÇÃO POST COMPLETA

```sql
CREATE OR REPLACE FUNCTION public.update_season_status(season_id_param uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  caller_institution_id uuid;
  target_institution_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT institution_id INTO caller_institution_id
  FROM public.user_profiles WHERE id = auth.uid();

  IF caller_institution_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to an institution';
  END IF;

  SELECT institution_id INTO target_institution_id
  FROM public.seasons WHERE id = season_id_param;

  IF target_institution_id IS NULL THEN
    RAISE EXCEPTION 'Season not found';
  END IF;

  IF target_institution_id <> caller_institution_id THEN
    RAISE EXCEPTION 'Unauthorized: season belongs to a different institution';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(caller_institution_id::text));

  SELECT institution_id INTO target_institution_id
  FROM public.seasons WHERE id = season_id_param;

  IF target_institution_id IS NULL THEN
    RAISE EXCEPTION 'Season not found after lock';
  END IF;

  IF target_institution_id <> caller_institution_id THEN
    RAISE EXCEPTION 'Unauthorized: season institution changed';
  END IF;

  IF new_status = 'active' THEN
    UPDATE public.seasons SET status = 'completed'
    WHERE institution_id = caller_institution_id
    AND status = 'active' AND id <> season_id_param;
  END IF;

  UPDATE public.seasons SET status = new_status, updated_at = now()
  WHERE id = season_id_param AND institution_id = caller_institution_id;
END;
$function$;
```

---

## 5. AUTORIZAÇÃO

| Cenário | Resultado |
|---|---|
| Mesma instituição (usuário A altera season criada por B) | PERMITIDO |
| Outra instituição (usuário A altera season da inst. B) | BLOQUEADO |
| user_id usado para autorização | NÃO |
| institution_id usado para autorização | SIM |

---

## 6. ADVISORY LOCK

| Aspecto | Estado |
|---|---|
| Posição | Após validação inicial, antes dos UPDATEs |
| Tipo | pg_advisory_xact_lock (transaction) |
| Revalidação pós-lock | SIM (re-lê season alvo) |
| Concorrência protegida | SIM |

---

## 7. ATIVAÇÃO

| Aspecto | Estado |
|---|---|
| Escopo de desativação | `institution_id = caller_institution_id` |
| Status usado ao desativar | `completed` (mesmo valor da function PRE) |
| Máximo 1 active após futura chamada | SIM |

---

## 8. SEASONS COUNT/CHECKSUM PRE/POST

| Metric | PRE | POST |
|---|---|---|
| COUNT | 5 | 5 |
| CHECKSUM | 1f7fd6e4c4ba9506fd13b3add361c45d | 1f7fd6e4c4ba9506fd13b3add361c45d |
| INST_741ba2ae active | 2 | 2 |
| INST_e8741889 active | 0 | 0 |

PRE = POST. ZERO DATA LOSS.

---

## 9. INCONSISTÊNCIA HISTÓRICA DE 2 ACTIVE

Preservada: SIM. Nenhum dado histórico foi alterado. A instituição INST_741ba2ae continua com 2 seasons active. Será resolvida separadamente com decisão explícita do usuário.

---

## 10. ESTADO 2C/2F/POLICIES/FUNCTIONS INTACTO: SIM

| Check | Estado |
|---|---|
| areas RLS | true |
| Total policies | 48 |
| user_profiles.institution_id UPDATE por authenticated | false |
| user_profiles.is_admin UPDATE por authenticated | false |
| toggle_user_admin_status SEC DEF / owner postgres | SIM |

---

## 11. FRONTEND/BUILD

0 arquivos frontend alterados. Build executado e aprovado.

---

## 12. ROLLBACK PREPARADO (NÃO EXECUTADO)

```sql
CREATE OR REPLACE FUNCTION public.update_season_status(season_id_param uuid, new_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF new_status = 'active' THEN
    UPDATE public.seasons
    SET status = 'completed'
    WHERE user_id = auth.uid()
    AND status = 'active'
    AND id != season_id_param;
  END IF;

  UPDATE public.seasons
  SET status = new_status, updated_at = now()
  WHERE id = season_id_param
  AND user_id = auth.uid();
END;
$function$;
```

---

## 13. DIVERGÊNCIAS

Nenhuma. O status `completed` usado ao desativar outras seasons foi preservado exatamente da function PRE.

---

## 14. STATUS: PASS

P1 corrigido. Autorização agora é institucional. Colegas da mesma instituição podem gerenciar safras uns dos outros. Acesso cross-institution bloqueado. Ativação serializada por instituição. Zero data loss. Inconsistência histórica de 2 active preservada para tratamento futuro.

STOP.
