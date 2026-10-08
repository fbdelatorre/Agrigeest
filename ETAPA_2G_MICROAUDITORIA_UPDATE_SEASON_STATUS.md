# ETAPA 2G — MICROAUDITORIA DE AUTORIZAÇÃO update_season_status

**Data:** 2026-10-07
**Modo:** READ-ONLY ABSOLUTO

---

## A. DEFINIÇÃO ATUAL

- **Assinatura:** `update_season_status(season_id_param uuid, new_status text) RETURNS void`
- **Linguagem:** plpgsql
- **SECURITY DEFINER:** SIM
- **Owner:** postgres
- **search_path:** `'public', 'pg_temp'`
- **Grants:** authenticated=EXECUTE, postgres=EXECUTE (grantable), service_role=EXECUTE
- **anon:** sem grant (bloqueado)

**Hardening 1H-I confirmado:**
- search_path = public, pg_temp: SIM
- auth.uid() IS NULL protegido: SIM
- public.seasons qualificado: SIM
- PUBLIC=false: SIM (não listado)
- anon=false: SIM
- authenticated=true: SIM

**pg_get_functiondef completo:**
```sql
CREATE OR REPLACE FUNCTION public.update_season_status(season_id_param uuid, new_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- If setting a season to active, deactivate all other seasons first
  IF new_status = 'active' THEN
    UPDATE public.seasons
    SET status = 'completed'
    WHERE user_id = auth.uid()
    AND status = 'active'
    AND id != season_id_param;
  END IF;

  -- Update the target season's status
  UPDATE public.seasons
  SET status = new_status, updated_at = now()
  WHERE id = season_id_param
  AND user_id = auth.uid();
END;
$function$
```

---

## B. LÓGICA ATUAL

1. **Auth check:** `auth.uid() IS NULL` → exceção.
2. **Desativa outras safras (se new_status='active'):** `UPDATE seasons SET status='completed' WHERE user_id = auth.uid() AND status='active' AND id != season_id_param` — filtra por **user_id**, não institution_id.
3. **Atualiza safra alvo:** `UPDATE seasons SET status=new_status WHERE id = season_id_param AND user_id = auth.uid()` — também filtra por **user_id**.

**Problema:** autorização usa `user_id = auth.uid()` (modelo pessoal), mas o app é institucional. Colegas da mesma instituição não podem ativar safras criadas por outros membros. A desativação também é escopo pessoal — poderia permitir múltiplas safras active na mesma instituição se criadas por usuários diferentes.

---

## C. CALLERS

| Arquivo | Linha | Parâmetros | Contexto |
|---|---|---|---|
| Settings.tsx | ~489 | season_id_param, new_status | Admin ativa/conclui safra na tabela de gerenciamento |
| Navbar.tsx | ~33 | season.id, 'active' | Qualquer usuário troca safra ativa no dropdown de navegação |

Settings.tsx lista safras por `institution_id = profile.institutionId` (linha 249). Criação (linha 435) envia `institution_id: profile.institutionId` e `user_id: user.id`.

Frontend pressupõe compartilhamento institucional: lista todas as safras da instituição para todos os membros.

---

## D. DADOS REAIS

| Metric | Value |
|---|---|
| TOTAL SEASONS | 5 |
| MATCH (user_id pertence à mesma institution_id) | 5 |
| MISMATCH | 0 |
| NULL user_id | 0 |

| Instituição | Total | Active | Planned | Completed |
|---|---|---|---|---|
| INST_741ba2ae | 2 | 2 | 0 | 0 |
| INST_e8741889 | 3 | 0 | 0 | 3 |

**Anomalia:** INST_741ba2ae tem 2 safras active simultaneamente — confirma que a desativação por user_id permite múltiplas active se criadas por usuários diferentes (ou se a function não foi usada para alternar).

---

## E. MODELO SEASONS: B (compartilhadas por instituição)

**Evidência:**
- RLS de seasons: todas as 4 policies usam `institution_id IN (SELECT user_profiles.institution_id WHERE id = auth.uid())` — escopo institucional.
- Settings.tsx lista por `institution_id = profile.institutionId` — não filtra por user_id.
- Criação envia `institution_id` — não apenas user_id.
- Navbar exibe todas as safras da instituição no dropdown.

**Resposta: B.** Seasons são compartilhadas por instituição.

---

## F. CENÁRIO ENTRE COLEGAS

Usuário A criou a season. Usuário B (mesma instituição) tenta ativá-la.

- **Com a function atual:** BLOQUEADO — `user_id = auth.uid()` falha porque B != A.
- **Com o modelo esperado:** DEVERIA SER PERMITIDO — B pertence à mesma instituição.

---

## G. CROSS-INSTITUTION

Usuário A da instituição X tentando alterar season da instituição Y.

Futura regra: `season.institution_id = (SELECT institution_id FROM user_profiles WHERE id = auth.uid())`

**Bloquearia corretamente?** SIM. A subquery retorna institution_id de X; season.institution_id é Y; X != Y → 0 rows afetados.

---

## H. ESCOPO CORRETO DA DESATIVAÇÃO

**Atual:** `WHERE user_id = auth.uid()` — escopo pessoal.

**Correto:** `WHERE institution_id = <institution_id do caller> AND id != season_id_param` — escopo institucional.

**Risco atual:** Múltiplas safras active na mesma instituição quando criadas por usuários diferentes. Confirmado nos dados: INST_741ba2ae tem 2 active.

**Resposta:** O escopo deve ser institution_id, consistente com o modelo AgriGest.

---

## I. REGRA CONCEITUAL COMPATÍVEL: SIM

Regra proposta (sem implementar):

1. `auth.uid()` obrigatório.
2. Obter `caller_inst_id` de `user_profiles WHERE id = auth.uid()`.
3. Season alvo deve ter `institution_id = caller_inst_id`.
4. UPDATE da season alvo por `id = season_id_param AND institution_id = caller_inst_id`.
5. Se `new_status = 'active'`: desativar outras seasons da MESMA `institution_id`.
6. Nunca confiar em institution_id do frontend.
7. Manter assinatura atual.
8. Manter SECURITY DEFINER.
9. Manter grants atuais.

**Compatível:** SIM.

---

## J. CONCORRÊNCIA

**Podem duas requisições simultâneas ativar duas seasons diferentes da mesma instituição?**

SIM. A função atual não usa lock. Mesmo com a correção de escopo, sem serialização, duas transações concorrentes poderiam ler nenhuma season active e ambas ativar a sua.

**Solução recomendada:** `pg_advisory_xact_lock(hashtext(caller_inst_id::text))` no início da função, antes de qualquer UPDATE — igual ao padrão já usado em `toggle_user_admin_status`. Serializa ativação por instituição.

---

## K. SEASONS COUNT/CHECKSUM PRE/POST

| Metric | PRE | POST |
|---|---|---|
| COUNT | 5 | 5 |
| CHECKSUM | 1f7fd6e4c4ba9506fd13b3add361c45d | 1f7fd6e4c4ba9506fd13b3add361c45d |

| Instituição | PRE | POST |
|---|---|---|
| INST_741ba2ae | 2 seasons, 2 active | 2 seasons, 2 active |
| INST_e8741889 | 3 seasons, 0 active, 3 completed | 3 seasons, 0 active, 3 completed |

PRE = POST. ZERO DATA LOSS. Nenhuma alteração feita.

---

## L. ESTADO 2C/2F

| Check | Estado |
|---|---|
| areas RLS | SIM (enabled) |
| operation_products RLS | false (intencional) |
| Total policies | 48 (inalterado) |
| user_profiles.institution_id UPDATE por authenticated | false (bloqueado) |
| user_profiles.is_admin UPDATE por authenticated | false (bloqueado) |

ETAPA 2C: intacta. ETAPA 2F: intacta.

---

## M. DIVERGÊNCIAS

1. **P1 confirmado:** function usa `user_id = auth.uid()` mas o modelo é institucional. Colegas não podem gerenciar safras uns dos outros.
2. **Múltiplas active:** INST_741ba2ae tem 2 safras active — decorrência direta do escopo pessoal na desativação.
3. **Navbar.tsx (linha 33):** qualquer membro pode tentar ativar, mas se não for o criador, a função silenciosamente não atualiza (0 rows) sem erro — o usuário não recebe feedback de falha.

---

## N. STATUS: PASS

Auditoria read-only completa. P1 confirmado e caracterizado. Regra conceitual definida e compatível. Nenhuma alteração feita.

STOP.
