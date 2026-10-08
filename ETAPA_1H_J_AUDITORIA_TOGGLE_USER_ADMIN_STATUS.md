# ETAPA 1H-J — MICROAUDITORIA FINAL DE toggle_user_admin_status

**Data:** 2026-10-07  
**Modo:** READ-ONLY ABSOLUTO

---

## A. Definição Atual

```sql
CREATE OR REPLACE FUNCTION public.toggle_user_admin_status(user_id_param uuid, new_status boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  -- Get the target user's institution
  SELECT institution_id INTO target_institution_id
  FROM user_profiles
  WHERE id = user_id_param;

  -- Check if requesting user is admin in the same institution
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = target_institution_id
    AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Only administrators can modify admin status';
  END IF;

  -- Update user's admin status
  UPDATE user_profiles
  SET is_admin = new_status
  WHERE id = user_id_param
  AND institution_id = target_institution_id;
END;
$function$;
```

| Item | Valor |
|---|---|
| Assinatura | `toggle_user_admin_status(user_id_param uuid, new_status boolean)` |
| RETURNS | `void` |
| Owner | postgres |
| SECURITY DEFINER | true |
| search_path | **null** (nenhum) |
| Tabelas | `user_profiles` (não qualificada) |

### Grants

| Grantee | EXECUTE |
|---|---|
| PUBLIC | true |
| anon | true |
| authenticated | true |
| service_role | true |
| postgres | true |

---

## B. Autorização Atual

**A. Como identifica o caller?** → `auth.uid()` na consulta de verificação.

**B. Como verifica que caller é admin?** → `EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = target_institution_id)`.

**C. Como determina institution_id do caller?** → Indiretamente — busca o `institution_id` do **target** primeiro, depois verifica se o caller é admin na **mesma** instituição do target.

**D. Como verifica que target pertence à mesma instituição?** → O UPDATE filtra por `institution_id = target_institution_id`, e a verificação de admin usa `institution_id = target_institution_id` — se o caller não for da mesma instituição, `is_admin = true` falha.

**E. Target user_id é caller-controlled?** → Sim — `user_id_param` é parâmetro livre.

**F. Novo valor de is_admin é caller-controlled?** → Sim — `new_status` é parâmetro livre.

**G. Pode promover usuário comum para admin?** → Sim — `new_status = true` é aceito sem restrição.

**H. Pode rebaixar admin?** → Sim — `new_status = false` é aceito sem restrição.

**I. Pode alterar usuário de outra instituição?** → Não — a verificação de admin na mesma instituição bloqueia.

**J. Pode alterar usuário sem institution_id?** → Se target tem `institution_id = NULL`, `target_institution_id` será NULL. A verificação `institution_id = NULL` nunca é true em SQL. Logo, a verificação EXISTS falha → RAISE EXCEPTION. **Não pode.**

**K. Pode alterar a si próprio?** → Sim — não há bloqueio no SQL. O bloqueio existe apenas no frontend (`disabled={user.id === profile.id}`).

---

## C. Admins por Instituição

| institution_id (mascarado) | total_users | total_admins |
|---|---|---|
| inst_3188d1 | 2 | 1 |
| inst_78e0a3 | 4 | 4 |

| Métrica | Valor |
|---|---|
| Instituições com 0 admins | 0 |
| Instituições com exatamente 1 admin | 1 (inst_3188d1) |
| Instituições com >1 admin | 1 (inst_78e0a3) |

**Risco atual:** inst_3188d1 tem exatamente 1 admin. Se esse admin for rebaixado (ou rebaixar a si próprio via API direta, bypassando o frontend), a instituição fica sem administrador.

---

## D. Frontend Caller

| Item | Valor |
|---|---|
| Arquivo | `src/pages/Settings.tsx` |
| Linha | 265 |
| Função chamadora | `handleToggleAdmin(userId, newStatus)` |
| Parâmetros | `{ user_id_param: userId, new_status: newStatus }` |

### Controle visual:
- **Quem vê o toggle:** A página de Settings é acessível a usuários autenticados. O toggle aparece na lista de usuários da instituição.
- **Pode clicar no próprio usuário:** **Não** — `disabled={user.id === profile.id || loadingToggle === user.id}` (linha 1230). O toggle é desabilitado para o próprio usuário.
- **Existe confirmação:** **Não** — o `onChange` chama `handleToggleAdmin` diretamente, sem `confirm()`.
- **Proteção frontend contra último admin:** **Não** — nenhuma verificação de contagem de admins antes de chamar a RPC.
- **Comportamento após sucesso:** Atualiza `users` no estado local (`setUsers`) refletindo o novo `isAdmin`.
- **Comportamento após erro:** `alert()` com mensagem de erro.

---

## E. Compatibilidade da Regra Proposta

**REGRA:** Um admin pode promover qualquer usuário da própria instituição. Um admin pode rebaixar outro admin SOMENTE se permanecer ≥1 admin. Um admin pode rebaixar a si próprio SOMENTE se existir ≥1 outro admin. A instituição NUNCA pode terminar com zero admins.

**COMPATÍVEL: SIM**

A regra é compatível com a lógica atual. A função já verifica caller is_admin + mesma instituição. A adição necessária é: (1) quando `new_status = false`, contar admins restantes antes do UPDATE; (2) permitir auto-rebaixamento no SQL (atualmente bloqueado só no frontend — a regra permite desde que haja outro admin). A lógica de promoção (`new_status = true`) não precisa de verificação adicional.

---

## F. Análise de Concorrência

**Cenário:** Dois admins da mesma instituição são rebaixados simultaneamente. Uma simples `SELECT COUNT` antes do UPDATE permitiria que ambos passassem na validação?

**SIM.** Uma consulta COUNT simples antes do UPDATE é vulnerável a race condition: ambas as transações podem ler `count = 2`, passar na validação (`count > 1`), e ambas executar o UPDATE, deixando `count = 0`.

### Solução recomendada:

**`SELECT ... FOR UPDATE` + `LOCK TABLE`** — A forma mais simples e segura em PL/pgSQL é:

1. Antes da validação, fazer `SELECT 1 FROM public.user_profiles WHERE institution_id = target_institution_id AND is_admin = true FOR UPDATE` — isso adquire row locks em todos os admins da instituição.
2. Qualquer transação concorrente tentando ler ou modificar esses mesmos rows ficará bloqueada até a primeira transação completar.
3. Após o lock, fazer o COUNT — o valor será serializado e correto.

Alternativamente, **advisory transaction lock** (`pg_advisory_xact_lock(hashtext(institution_id::text))`) serializa todas as operações de admin na mesma instituição sem depender de row locks, e é mais simples de implementar. **Recomendado: advisory lock** pela simplicidade e por não depender de quais rows específicas lockar.

---

## G. Hardening Recomendado (SEM IMPLEMENTAR)

| Item | Recomendado | Justificativa |
|---|---|---|
| `auth.uid() IS NULL` explícito | **Sim** | Early exit antes de qualquer consulta |
| `SET search_path = public, pg_temp` | **Sim** | Prevenção contra search_path hijacking |
| `public.user_profiles` qualificado | **Sim** | Todas as 3 referências |
| `REVOKE PUBLIC` | **Sim** | Não deve ser executável por todos |
| `REVOKE anon` | **Sim** | Não faz sentido para função de admin |
| `authenticated = true` | **Sim** | Caller precisa estar logado |
| `service_role = true` | **Sim** | Operações administrativas |
| `postgres = true` | **Sim** | Owner |

### Adicionalmente:
- Verificação de último admin antes do rebaixamento (`new_status = false`)
- `pg_advisory_xact_lock` para serializar operações por instituição
- Permitir auto-rebaixamento no SQL (remover barreira implícita) mas com proteção de último admin

---

## H. user_profiles Count/Checksum PRE/POST

| Métrica | PRE | POST | Match |
|---|---|---|---|
| count | 6 | 6 | SIM |
| checksum | `c987c95562f53f8908c14d32e70d4f49` | `c987c95562f53f8908c14d32e70d4f49` | SIM |

**ZERO DATA LOSS.** Etapa exclusivamente read-only.

---

## I. Divergências

Nenhuma divergência encontrada.

### Observações:
1. A função **não tem** `auth.uid() IS NULL` explícito — se `auth.uid()` for NULL, a verificação EXISTS falha (NULL nunca matcha `id = NULL`) → RAISE EXCEPTION. Funcionalmente seguro, mas não explícito.
2. O frontend bloqueia auto-toggle (`disabled={user.id === profile.id}`), mas a função SQL **não bloqueia** — um chamador direto via API pode rebaixar a si próprio.
3. Não há proteção contra último admin nem no frontend nem no SQL.
4. Não há confirmação (confirm dialog) no frontend antes do toggle.
5. `inst_3188d1` tem exatamente 1 admin — está vulnerável a ficar sem administrador se a correção não for aplicada.

---

**Status:** READ-ONLY ABSOLUTO. Nenhuma alteração foi feita. ZERO DATA LOSS. Aguardando revisão externa.

STOP.
