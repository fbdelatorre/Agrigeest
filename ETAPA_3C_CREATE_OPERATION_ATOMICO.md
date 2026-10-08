# ETAPA 3C — CREATE OPERATION ATÔMICO: RPC + FRONTEND

**Data:** 2026-10-07

---

## A. PRE CHECK

| Tabela | Count | Checksum |
|---|---|---|
| operations | 309 | fbf1eb1ad43d46437c87f0d98206cf75 |
| products | 217 | 3032ef9556d76996095e99876a36a38a |
| product_lots | 149 | bc7eaba42133b78cafd863cf8b2ee4fb |

- SUM products.quantity_in_stock = 4.617.076,08
- SUM product_lots.quantity = 185.382,00
- RPC `create_operation_with_stock` não existia → OK, prosseguiu.

---

## B. season_id Nullable

- 0 operações com season_id NULL no histórico.
- `addOperation` sempre envia `activeSeason.id` — nunca NULL.
- Assinatura aceita `p_season_id uuid DEFAULT NULL` para compatibilidade futura.
- Validação só executa quando non-NULL.

---

## C. Migration Criada

Migration `create_atomic_operation_with_stock` aplicada com sucesso.

---

## D. Assinatura RPC

```
public.create_operation_with_stock(
  p_area_id        uuid,
  p_type           text,
  p_start_date     timestamptz,
  p_description    text,
  p_operated_by    text,
  p_season_id      uuid       DEFAULT NULL,
  p_end_date       timestamptz DEFAULT NULL,
  p_next_operation_date timestamptz DEFAULT NULL,
  p_notes          text       DEFAULT NULL,
  p_products_used  jsonb      DEFAULT NULL,
  p_operation_size numeric    DEFAULT NULL,
  p_yield_per_hectare numeric DEFAULT NULL,
  p_seeds_per_hectare  numeric DEFAULT NULL
) RETURNS public.operations
```

Parâmetros obrigatórios sem default aparecem primeiro (requisito PostgreSQL).

---

## E. SECURITY DEFINER / Grants

| Propriedade | Valor |
|---|---|
| SECURITY DEFINER | true |
| Owner | postgres |
| search_path | public, pg_temp |
| PUBLIC EXECUTE | false |
| anon EXECUTE | false |
| authenticated EXECUTE | true |
| service_role EXECUTE | true (herdado) |

---

## F. Validações Institucionais

1. `auth.uid()` → se NULL: AUTH_REQUIRED
2. `user_profiles.institution_id` → se profile não existe: PROFILE_NOT_FOUND; se institution_id NULL: PROFILE_NO_INSTITUTION
3. `areas.id = p_area_id AND areas.institution_id = v_institution_id` → se não: AREA_NOT_FOUND_OR_FORBIDDEN
4. `seasons.id = p_season_id AND seasons.institution_id = v_institution_id` (só quando non-NULL)
5. `products.id AND products.institution_id` para cada productId
6. `product_lots → products → institution_id` via JOIN para cada lotId

Nenhum institution_id ou user_id do frontend é utilizado.

---

## G. products_used Validation

- NULL ou '[]' → operação sem produtos (permitido)
- Não-array → INVALID_PRODUCTS_USED
- Cada item deve ser objeto JSON com:
  - productId: não-vazio, UUID válido
  - quantity: numérico > 0
  - dose: opcional, >= 0
  - lotId: ausente/NULL/"" = sem lote; UUID válido = lote informado
- UUID inválido (cast seguro com BEGIN/EXCEPTION) → INVALID_PRODUCTS_USED

---

## H. Agregação Duplicates

- Quantidades agregadas por productId antes da baixa.
- Quantidades agregadas por lotId quando presente.
- Exemplo: produto X duas vezes (60+60=120) com estoque 100 → INSUFFICIENT_PRODUCT_STOCK.
- Histórico: 0 operações com productId duplicado, 0 com lotId duplicado.

---

## I. Atomic Product Update

```sql
UPDATE public.products
SET quantity_in_stock = quantity_in_stock - v_quantity, updated_at = now()
WHERE id = v_product_uuid AND institution_id = v_institution_id AND quantity_in_stock >= v_quantity
RETURNING id INTO v_updated_count;
IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_PRODUCT_STOCK'; END IF;
```

Aritmética dentro do UPDATE. Row lock PostgreSQL. Elimina LOST UPDATE.

---

## J. Atomic Lot Update

```sql
UPDATE public.product_lots
SET quantity = quantity - v_quantity, updated_at = now()
WHERE id = v_lot_uuid AND product_id = v_product_uuid AND quantity >= v_quantity
RETURNING id INTO v_updated_count;
IF NOT FOUND THEN RAISE EXCEPTION 'INSUFFICIENT_LOT_STOCK'; END IF;
```

Mesmo padrão atômico. Elimina LOST UPDATE do lote.

---

## K. Ordem Determinística

Products processados em `ORDER BY jsonb_object_keys(v_product_agg)`.
Lots processados em `ORDER BY jsonb_object_keys(v_lot_agg)`.
Reduz risco de deadlock entre transações concorrentes.

---

## L. INSERT Operation

- `user_id = auth.uid()` (derivado, nunca do frontend)
- `institution_id = v_institution_id` (derivado, nunca do frontend)
- `products_used = v_products` (payload original preservado)
- `RETURNING * INTO v_operation` → retorna a row completa

---

## M. Frontend ONLINE — Antes/Depois

**Antes:**
1. `useProducts(productsUsed)` — baixa estoque via 3+ chamadas Supabase separadas
2. `INSERT operations` — chamada separada

**Depois:**
1. `supabase.rpc('create_operation_with_stock', payload)` — uma única chamada atômica
2. `loadProducts()` + `loadProductLots()` — recarrega estoque atualizado do banco

**Offline:** inalterado — cria local-{id}, salva em localStorage, não chama RPC.

---

## N. Confirmação: useProducts não chamado no CREATE online

**CONFIRMADO.** `useProducts` não é chamado em nenhum caminho online de `addOperation`. O fluxo online agora chama apenas `supabase.rpc(...)`. Estoque é baixado dentro da RPC.

---

## O. Offline Inalterado + Risco Conhecido

- `addOperation` offline: fluxo original preservado (local-{id}, localStorage).
- `syncOperations`: inalterado (INSERT direto sem baixar estoque).
- `syncProducts`: inalterado.
- **RISCO CONHECIDO = SIM.** Sync offline não baixa estoque no banco. Bug pré-existente.

---

## P. Update/Delete Inalterados + Risco Conhecido

- `updateOperation`: ainda usa `returnProducts` + `useProducts` + UPDATE separados.
- `deleteOperation`: ainda usa `returnProducts` + DELETE separado.
- **RISCO P0 PERMANECE** para update e delete. Será tratado em etapa futura.

---

## Q. Lot Management P1 Permanence

- `addLot`/`updateLot`/`deleteLot`/`syncProductTotalToDb` inalterados.
- `recomputeProductQuantity` ainda sobrescreve `quantity_in_stock` com `SUM(lots)`.
- **RISCO P1 PERMANECE.** Pode sobrescrever baixa da RPC se executar concorrentemente.

---

## R. Counts/Sums/Checksums PRE/POST

| Tabela | Count PRE | Count POST | Checksum PRE | Checksum POST |
|---|---|---|---|---|
| operations | 309 | 309 | fbf1eb1ad43d46437c87f0d98206cf75 | fbf1eb1ad43d46437c87f0d98206cf75 |
| products | 217 | 217 | 3032ef9556d76996095e99876a36a38a | 3032ef9556d76996095e99876a36a38a |
| product_lots | 149 | 149 | bc7eaba42133b78cafd863cf8b2ee4fb | bc7eaba42133b78cafd863cf8b2ee4fb |

PRE = POST. Nenhuma alteração nos dados.

---

## S. Proteções 2C/2F/2H

| Proteção | Status |
|---|---|
| 2C — RLS areas/operations | Intacta (4 policies em areas) |
| 2F — user_profiles update columns | Intacta (3 policies em user_profiles) |
| 2H — update_season_status SECURITY DEFINER | Intacta (prosecdef = true) |
| Total policies (todas tabelas) | 40 |

---

## T. Build

Build frontend executado com sucesso (exit 0). Sem erros TypeScript. Sem erros de compilação.

---

## U. Rollback Preparado (não executado)

1. Restaurar `addOperation` ao fluxo anterior (useProducts + INSERT direto).
2. `DROP FUNCTION IF EXISTS public.create_operation_with_stock(...)`.
3. Reverter OperationCreate.tsx ao tratamento de erro anterior.

---

## V. Divergências

1. `database.types.ts` não tem tipagem para a nova RPC — `supabase.rpc()` retorna `any`. Build passa porque TypeScript não valida props de `any`. Regenerar tipos é recomendado mas foi explicitamente excluído desta etapa.
2. `loadProducts()` + `loadProductLots()` após RPC para sincronizar React state com estoque real do banco. Substitui o read-modify-write anterior.
3. RPC não testada com dados reais (conforme instrução).

---

## W. STATUS: PASS

RPC criada e verificada. Frontend online modificado. Offline inalterado. Update/delete/lot management inalterados. PRE = POST. Build passa.

STOP.
