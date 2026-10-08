# ETAPA 3E — IMPLEMENTAR UPDATE OPERATION ATÔMICO

**Data:** 2026-10-07
**STATUS: PASS**

---

## A. PRE Baseline

| Tabela | Count | Checksum |
|---|---|---|
| operations | 309 | fbf1eb1ad43d46437c87f0d98206cf75 |
| products | 217 | 3032ef9556d76996095e99876a36a38a |
| product_lots | 149 | bc7eaba42133b78cafd863cf8b2ee4fb |

- SUM products.quantity_in_stock = 4.617.076,08
- SUM product_lots.quantity = 185.382,00
- 48 RLS policies
- create_operation_with_stock: existe, SECURITY DEFINER, owner postgres
- update_operation_with_stock: NÃO existia

---

## B. Histórico Órfão Confirmado

- 501 items com productId inexistente
- 158 operations com pelo menos 1 productId inexistente
- 0 lotId órfão

---

## C. Migration Criada

Migration `create_atomic_update_operation_with_stock` aplicada via `mcp__supabase__apply_migration`.

---

## D. Assinatura RPC

```
public.update_operation_with_stock(
  p_operation_id uuid,
  p_area_id uuid,
  p_type text,
  p_start_date timestamptz,
  p_description text,
  p_operated_by text,
  p_season_id uuid DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_next_operation_date timestamptz DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_products_used jsonb DEFAULT NULL,
  p_operation_size numeric DEFAULT NULL,
  p_yield_per_hectare numeric DEFAULT NULL,
  p_seeds_per_hectare numeric DEFAULT NULL
)
RETURNS public.operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

Não recebe: user_id, institution_id, created_at, old_products_used.

---

## E. SECURITY DEFINER / Grants

- SECURITY DEFINER = true
- Owner = postgres
- search_path = public, pg_temp
- ACL: {postgres=X, authenticated=X, service_role=X} — anon e PUBLIC ausentes
- REVOKE ALL FROM PUBLIC e FROM anon executados
- GRANT EXECUTE TO authenticated

---

## F. Auth / Institution Validation

1. auth.uid() IS NOT NULL → senão AUTH_REQUIRED
2. user_profiles.institution_id → senão PROFILE_NOT_FOUND / PROFILE_NO_INSTITUTION
3. institution_id derivado exclusivamente do perfil

---

## G. Operation FOR UPDATE

```sql
SELECT products_used, user_id
FROM public.operations
WHERE id = p_operation_id AND institution_id = v_institution_id
FOR UPDATE;
```

Se não encontra → OPERATION_NOT_FOUND_OR_FORBIDDEN. OLD products_used vem exclusivamente dessa row.

---

## H. Validação NEW

- Array JSON obrigatório
- productId: UUID válido, não-vazio
- quantity: numérica > 0
- dose: NULL ou >= 0
- lotId: opcional (ausente/NULL/"" = sem lote)
- NEW nunca introduz productId inexistente (exceto históricos do OLD mantidos)

---

## I. Delta Products Atuais

delta = new_total - old_total por productId.

- delta > 0: `SET quantity_in_stock = quantity_in_stock - delta WHERE quantity_in_stock >= delta`
- delta < 0: `SET quantity_in_stock = quantity_in_stock + ABS(delta)`
- delta = 0: não tocar

Read-modify-write PROIBIDO. Aritmética atômica apenas.

---

## J. Comportamento Produtos Históricos

| Cenário | Descrição | Resultado |
|---|---|---|
| A | OLD > 0, NEW = OLD | PERMITIR. Não tocar estoque. |
| B | OLD > 0, NEW = 0 (removido) | PERMITIR. NÃO devolver estoque. |
| C | OLD > 0, NEW > 0, NEW != OLD | BLOQUEAR: HISTORICAL_PRODUCT_UNAVAILABLE |
| D | OLD = 0, NEW > 0 (introduzir) | BLOQUEAR: PRODUCT_NOT_FOUND_OR_FORBIDDEN |
| E | Órfão removido + produto atual adicionado | Órfão: não devolver. Atual: baixar normalmente. |
| F | Mesma quantity, dose muda | PERMITIR. Não tocar estoque. |

---

## K. Proteção Cross-Institution

Produto que existe em products mas com institution_id diferente → PRODUCT_NOT_FOUND_OR_FORBIDDEN (não tratado como histórico). A tolerância histórica aplica-se somente quando a row realmente NÃO EXISTE em products.

---

## L. Delta Lots

delta_lot = new_total - old_total por lotId.

- delta_lot > 0: `SET quantity = quantity - delta_lot WHERE quantity >= delta_lot`
- delta_lot < 0: `SET quantity = quantity + ABS(delta_lot)`
- delta_lot = 0: não tocar

Validação: lote existe, product_id corresponde, produto pertence à instituição.

---

## M. Sem lotId → Com lotId

- OLD sem lotId, NEW com lotId: baixar apenas lote NEW. Não devolver lote imaginário.
- OLD com lotId, NEW sem lotId: devolver ao lote OLD válido.

---

## N. Lote Histórico Inexistente

- Mesma quantity: permitir sem tocar lote
- Removido do NEW: permitir sem devolver
- Quantity alterada: HISTORICAL_LOT_UNAVAILABLE
- Novo lotId inexistente: LOT_NOT_FOUND_OR_MISMATCH

Baseline: 0 lotIds órfãos confirmado, mas proteção implementada.

---

## O. Ordem / Concorrência

1. Lock operation (FOR UPDATE)
2. Products em ordem determinística por UUID (array_agg ORDER BY)
3. Lots em ordem determinística por UUID
4. UPDATEs aritméticos adquirem row locks PostgreSQL
5. CREATE e UPDATE concorrentes no mesmo product: PostgreSQL serializa via row lock

---

## P. Campos Atualizados da Operation

area_id, season_id, type, start_date, end_date, next_operation_date, description, operated_by, notes, products_used, operation_size, yield_per_hectare, seeds_per_hectare, updated_at.

---

## Q. Preservação user_id / institution_id

- user_id: PRESERVADO (não alterado no UPDATE)
- institution_id: PRESERVADO (WHERE clause garante)
- created_at: PRESERVADO (não incluído no SET)
- id: PRESERVADO (WHERE clause)

---

## R. Frontend ONLINE Antes/Depois

**ANTES:**
```
returnProducts(old) → useProducts(new) → UPDATE operations
```

**DEPOIS:**
```
supabase.rpc('update_operation_with_stock', payload) → loadProducts() + loadProductLots()
```

---

## S. Confirmação: returnProducts/useProducts NÃO chamados no UPDATE online

**SIM.** A nova `updateOperation` online não chama `returnProducts` nem `useProducts`. A RPC calcula deltas internamente. O fluxo offline permanece inalterado (não usa RPC).

---

## T. Offline Inalterado

SIM. O branch `!isOnline` em `updateOperation` permanece idêntico: atualiza state local, marca pending sync.

---

## U. Delete Ainda P0

SIM. `deleteOperation` não foi modificado. Continua usando `returnProducts` → DELETE. Será tratado na próxima etapa.

---

## V. Lot Management Ainda P1

SIM. `addLot`, `updateLot`, `deleteLot`, `syncProductTotalToDb`, `recomputeProductQuantity` não foram modificados. O P1 permanece.

---

## W. CREATE RPC Intacta

SIM. `create_operation_with_stock` não foi modificada. Confirmada existente com SECURITY DEFINER, owner postgres.

---

## X. PRE/POST Counts/Sums/Checksums

| Tabela | PRE Count | POST Count | PRE Checksum | POST Checksum |
|---|---|---|---|---|
| operations | 309 | 309 | fbf1eb1ad43d46437c87f0d98206cf75 | fbf1eb1ad43d46437c87f0d98206cf75 |
| products | 217 | 217 | 3032ef9556d76996095e99876a36a38a | 3032ef9556d76996095e99876a36a38a |
| product_lots | 149 | 149 | bc7eaba42133b78cafd863cf8b2ee4fb | bc7eaba42133b78cafd863cf8b2ee4fb |

| Soma | PRE | POST |
|---|---|---|
| products.quantity_in_stock | 4617076.08296666766681363 | 4617076.08296666766681363 |
| product_lots.quantity | 185382.00000666667 | 185382.00000666667 |

PRE = POST. Zero data loss.

---

## Y. 48 RLS Policies Intactas

SIM. Count = 48 antes e depois.

---

## Z. Build

PASS. `npm run build` completou sem erros TypeScript. Únicos warnings: chunk-size e PWA precache (informativos).

---

## AA. Rollback Preparado

1. **Frontend:** Reverter `updateOperation` ao fluxo anterior (returnProducts + useProducts + UPDATE direto)
2. **Database:** `DROP FUNCTION IF EXISTS public.update_operation_with_stock(...)`
3. **CREATE RPC:** Não tocar
4. **Dados:** Nenhuma alteração necessária (PRE = POST)

Rollback NÃO executado.

---

## AB. Divergências

1. `season_id` não está no tipo `Operation` TypeScript mas existe no DB. O frontend acessa via cast `(originalOperation as Record<string, unknown>).season_id`. Funcional mas requer tipagem futura.
2. `database.types.ts` permanece stale — não regenerado nesta etapa.
3. O `p_season_id` sempre envia o season_id da operação original (não há campo de edição de season no formulário).

---

## AC. STATUS: PASS

RPC criada, frontend online migrado, build passa, PRE = POST, 48 RLS policies intactas, CREATE RPC intacta, offline inalterado, delete e lot management não modificados.

STOP.
