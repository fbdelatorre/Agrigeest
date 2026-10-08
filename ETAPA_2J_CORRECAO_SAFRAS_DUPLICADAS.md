# ETAPA 2J — VALIDAR REVERSIBILIDADE E CORRIGIR SAFRAS ATIVAS DUPLICADAS

**Data:** 2026-10-07

---

## 1. BANCO PERMITE completed -> active? SIM

A função `update_season_status` aceita qualquer valor em `new_status`. Quando `new_status = 'active'`, ela desativa as outras active da mesma instituição e ativa a alvo. Não há restrição que impeça receber uma season `completed` e passá-la para `active`.

## 2. FRONTEND PERMITE completed -> active? SIM

Settings.tsx (linha 1120): botão "Ativar" aparece para toda season com `status !== 'active'` (inclui `completed` e `planned`). O clique chama `handleUpdateSeasonStatus(season.id, 'active')` que executa `rpc('update_season_status', { new_status: 'active' })`.

Navbar.tsx (linha 33): o dropdown de safra lista todas as seasons da instituição e ao selecionar uma chama `update_season_status` com `'active'`. Funciona para qualquer season, incluindo `completed`.

## 3. REVERSIBILIDADE COMPLETA CONFIRMADA? SIM

Banco: SIM. Frontend: SIM. Uma safra `completed` pode ser reativada a qualquer momento pelo fluxo normal.

---

## 4. PRE CHECK: PASS

- 25-26: id=cda5c595..., status=active, inst=741ba2ae... — confirmado
- 26-27: id=c24a9b18..., status=active, inst=741ba2ae... — confirmado
- Mesma institution_id: SIM (741ba2ae-c70a-4a00-9d58-e84e4875f460)
- Instituição possui exatamente 2 seasons: SIM
- Ambas active: SIM
- Status de conclusão usado pelo sistema = 'completed': SIM

---

## 5. 25-26 PRE/POST

| | PRE | POST |
|---|---|---|
| status | active | completed |

## 6. 26-27 PRE/POST

| | PRE | POST |
|---|---|---|
| status | active | active (inalterado) |

---

## 7. ROW_COUNT

Exatamente 1 linha atualizada. O UPDATE incluía `AND status = 'active'` e `AND institution_id = (subquery)` — apenas 1 row correspondia.

---

## 8. INSTITUTIONS COM >1 ACTIVE POST: 0

Nenhuma instituição possui mais de 1 season active.

---

## 9. SIMULAÇÃO DE REATIVAÇÃO

**Simulação 1: reativar 25-26**
- Chamada: `update_season_status('cda5c595...', 'active')`
- Resultado esperado:
  - 25-26: completed -> active
  - 26-27: active -> completed (desativada pela função, mesma instituição)
- Confirma: SIM

**Simulação 2: reativar 26-27**
- Chamada: `update_season_status('c24a9b18...', 'active')`
- Resultado esperado:
  - 26-27: completed -> active
  - 25-26: active -> completed (desativada pela função, mesma instituição)
- Confirma: SIM

REVERSIBILIDADE = SIM.

---

## 10. DADOS HISTÓRICOS PRESERVADOS: SIM

O UPDATE alterou apenas `status` e `updated_at` da season 25-26. Nenhuma trigger de cascade em seasons. FKs de operations/areas/products referenciam `season_id` (não `status`). user_id e institution_id não foram alterados. Nenhuma operação, área, produto ou lote foi afetado.

---

## 11. COUNT/CHECKSUM PRE/POST

| Metric | PRE | POST |
|---|---|---|
| COUNT | 5 | 5 |
| CHECKSUM | 0ae43462cf76d7dc05d2891c6cc70e06 | 5adfe77d78750665729b1f4f06ab633d |

Checksum mudou apenas pela alteração intencional de status de 25-26 (active -> completed). Nenhuma linha criada ou excluída.

| Instituição | PRE | POST |
|---|---|---|
| INST_741ba2ae | 2 seasons, 2 active, 0 completed | 2 seasons, 1 active, 1 completed |
| INST_e8741889 | 3 seasons, 1 active, 2 completed | 3 seasons, 1 active, 2 completed (inalterado) |

---

## 12. 2C/2F/2H + 48 POLICIES INTACTAS: SIM

| Check | Estado |
|---|---|
| areas RLS | true |
| Total policies | 48 |
| user_profiles.institution_id UPDATE por authenticated | false |
| user_profiles.is_admin UPDATE por authenticated | false |
| update_season_status SECURITY DEFINER | true |

---

## 13. ROLLBACK PREPARADO (NÃO EXECUTADO)

```sql
UPDATE public.seasons
SET status = 'active'
WHERE id = 'cda5c595-266e-43a6-85e8-8af42a4fd734'
AND status = 'completed';
```

---

## 14. DIVERGÊNCIAS

Nenhuma. A correção foi exatamente conforme especificado: 25-26 passou para completed, 26-27 permanece active. A reversibilidade foi confirmada tanto no banco quanto no frontend.

---

## 15. STATUS: PASS

Safra 25-26 foi concluída. Safra 26-27 permanece ativa. A instituição não possui mais safras duplicadas ativas. A safra 25-26 pode ser reativada a qualquer momento pelo fluxo normal do aplicativo — tanto pela tela de Configurações (botão "Ativar") quanto pelo seletor de safra no menu lateral.

STOP.
