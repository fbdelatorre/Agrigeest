# ETAPA 3J — LOTES ATÔMICOS + SEPARAÇÃO ENTRE ESTOQUE TOTAL E ESTOQUE RASTREADO

**Data:** 2026-10-08
**Modo:** Implementação com ZERO DATA LOSS — EXPAND, VALIDATE, CUTOVER, OBSERVE

---

## A. PRE BASELINE

| Métrica | Valor PRE |
|---|---|
| COUNT products | 217 |
| COUNT product_lots | 149 |
| SUM products.quantity_in_stock | 4,617,076.08 |
| SUM product_lots.quantity | 185,382.00 |
| Products com stock > 0 e zero lots | 122 |
| Products com divergência (stock != SUM(lots)) | 125 |
| Products onde SUM(lots) > quantity_in_stock | 3 |
| Checksum products | `3e4ee40eb2ab1b6f6fbbc0bec44bca6d` |
| Checksum product_lots | `9a606414b40c0420705ddbc6a4a4660b` |
| RLS policies | 48 |
| Operation RPCs | 3 (create, update, delete) — confirmadas |

---

## B. PRODUCTS ONDE SUM(lots) > STOCK

3 produtos em excesso histórico (não corrigidos):

| ID | Nome | quantity_in_stock | SUM(lots) | Excesso |
|---|---|---|---|---|
| c703dca0-... | PK+MICROS | 1,340 | 2,680 | 1,340 |
| 5b657e76-... | STRUTURATO | 740 | 1,760 | 1,020 |
| 226ca3ed-... | CITRUS PRIME | 766.00 | 1,036.00 | 270.00 |

---

## C. REGRA LEGACY APLICADA

A regra legacy está implementada nas 3 novas RPCs:

- **Se `old_sum <= product_stock`:** `new_sum` deve ser `<= product_stock` (bloqueia se exceder)
- **Se `old_sum > product_stock` (legacy excess):** `new_sum` deve ser `<= old_sum` (bloqueia se piorar)

Para os 3 produtos em excesso histórico:
- `create_product_lot`: Bloqueia qualquer novo lote que aumente o excesso (new_sum > old_sum)
- `update_product_lot`: Permite redução (ex: 100→80), bloqueia aumento (ex: 100→120)
- `delete_product_lot`: Sempre permitido (reduz SUM)

---

## D. create_product_lot

**Função:** `public.create_product_lot(p_product_id uuid, p_lot_number text, p_quantity numeric, p_expiration_date date DEFAULT NULL)`

**Fluxo:**
1. Deriva `institution_id` de `auth.uid()` via `user_profiles`
2. Valida inputs (lot_number não vazio, quantity >= 0)
3. Lock `products` row `FOR UPDATE` (serializa com operation RPCs)
4. Computa `old_sum = SUM(product_lots.quantity)` para o produto
5. `new_sum = old_sum + p_quantity`
6. Valida invariant (normal ou legacy)
7. INSERT lot — **NÃO altera `products.quantity_in_stock`**
8. Retorna row criada

**Grants:** REVOKE FROM PUBLIC/anon, GRANT TO authenticated

---

## E. update_product_lot

**Função:** `public.update_product_lot(p_lot_id uuid, p_lot_number text DEFAULT NULL, p_quantity numeric DEFAULT NULL, p_expiration_date date DEFAULT NULL)`

**Fluxo:**
1. Deriva `institution_id` de `auth.uid()` via `user_profiles`
2. Lê lot para obter `product_id`
3. Lock `products` row `FOR UPDATE` (produto primeiro)
4. Lock `product_lots` row `FOR UPDATE` (lote segundo — mesma ordem que operation RPCs)
5. Usa valores do DB (não do cliente) como source of truth
6. `old_sum = SUM(lots)`, `new_sum = old_sum - old_lot.quantity + COALESCE(p_quantity, old_lot.quantity)`
7. Valida invariant (normal ou legacy)
8. UPDATE lot — **NÃO altera `products.quantity_in_stock`**
9. Retorna row atualizada

---

## F. delete_product_lot

**Função:** `public.delete_product_lot(p_lot_id uuid)`

**Fluxo:**
1. Deriva `institution_id` de `auth.uid()` via `user_profiles`
2. Lê lot para obter `product_id`
3. Lock `products` row `FOR UPDATE` (produto primeiro)
4. Lock `product_lots` row `FOR UPDATE` (lote segundo)
5. DELETE lot — **NÃO altera `products.quantity_in_stock`**
6. Retorna row deletada

**Semântica:** O estoque total permanece igual. Os 100 do lote deletado passam conceitualmente para "estoque sem lote".

---

## G. SECURITY / GRANTS

Todas as 3 RPCs seguem o padrão aprovado:

- `LANGUAGE plpgsql`
- `SECURITY DEFINER`
- `SET search_path = public, pg_temp`
- Owner: postgres
- `REVOKE ALL FROM PUBLIC`
- `REVOKE ALL FROM anon`
- `GRANT EXECUTE TO authenticated`
- Institution isolation: `institution_id` derivado exclusivamente de `auth.uid()` → `user_profiles`
- Cross-institution: bloqueado com `PRODUCT_NOT_FOUND_OR_FORBIDDEN`

---

## H. ORDEM DE LOCKS

**Operation RPCs (existentes):**
1. Lock `operations` row (update/delete) ou sem lock (create)
2. Update `products` (arithmetic UPDATE, lock implícito)
3. Update `product_lots` (arithmetic UPDATE, lock implícito)

**Lot RPCs (novas):**
1. Lock `products` row `FOR UPDATE` (explícito)
2. Lock `product_lots` row `FOR UPDATE` (explícito, apenas update/delete)

**Compatibilidade:** As lot RPCs adquire locks na ordem `products → product_lots`, que é a mesma ordem em que as operation RPCs fazem seus updates. Nenhum deadlock é introduzido porque:
- Operation RPCs fazem arithmetic UPDATE (lock implícito de linha) em products primeiro, depois lots
- Lot RPCs fazem `SELECT ... FOR UPDATE` em products primeiro, depois lots
- A ordem é consistente: products sempre antes de lots

---

## I. CONCORRÊNCIA COM OPERATION RPCs

**Cenário:** RPC operation baixa produto X enquanto usuário altera lote de X.

**Antes (ETAPA 3I):** `syncProductTotalToDb` gravava `SUM(lots)` do estado local desatualizado como valor absoluto, sobrescrevendo o delta atômico da RPC de operation. **Perigo real de lost update.**

**Agora:** As lot RPCs fazem `SELECT ... FOR UPDATE` no produto, serializando com as operation RPCs. Se uma operation RPC está em andamento, a lot RPC espera. Se a lot RPC está em andamento, a operation RPC espera no UPDATE do produto. O `FOR UPDATE` garante serialização.

**As lot RPCs NÃO alteram `quantity_in_stock`:** Portanto, mesmo se executarem em paralelo com operations, não há sobrescrita do estoque total. O único concorrente para `quantity_in_stock` são as operation RPCs, que usam arithmetic atômico.

---

## J. RISCO OPERATION SEM LOTID

**Cenário auditado:**
- `quantity_in_stock = 500`, `SUM(lots) = 450`, untracked = 50
- Operation sem lotId de 100: baixa `quantity_in_stock` para 400
- Resultado: `SUM(lots) = 450`, `quantity_in_stock = 400`
- `SUM(lots) > quantity_in_stock` — lotes rastreados excedem estoque total

**Status:** Confirmado que isso É possível nas RPCs atuais. As operation RPCs validam `quantity_in_stock >= v_quantity` mas NÃO validam `SUM(lots) <= quantity_in_stock` após a operation.

**Classificação:** RISCO P1 para próxima etapa. Não alterado nesta etapa.

---

## K. FRONTEND addLot

**Antes:** INSERT direto via `supabase.from('product_lots').insert(...)` + `recomputeProductQuantity` + `syncProductTotalToDb`

**Agora:** Chamada RPC `supabase.rpc('create_product_lot', {...})` + atualização do estado local com a row retornada. **Não recalcula `quantity_in_stock`.**

---

## L. FRONTEND updateLot

**Antes:** UPDATE direto via `supabase.from('product_lots').update(...)` + `recomputeProductQuantity` + `syncProductTotalToDb`

**Agora:** Chamada RPC `supabase.rpc('update_product_lot', {...})` + atualização do estado local com a row retornada. **Não recalcula `quantity_in_stock`.**

---

## M. FRONTEND deleteLot

**Antes:** DELETE direto via `supabase.from('product_lots').delete()` + `recomputeProductQuantity` + `syncProductTotalToDb`

**Agora:** Chamada RPC `supabase.rpc('delete_product_lot', {...})` + remoção do estado local. **Não recalcula `quantity_in_stock`.**

---

## N. recomputeProductQuantity REMOVIDO

**Status:** REMOVIDO. Confirmado via grep — zero referências no código.

---

## O. syncProductTotalToDb REMOVIDO

**Status:** REMOVIDO. Confirmado via grep — zero referências no código.

---

## P. useProducts REMOVIDO

**Status:** REMOVIDO. Confirmado via grep — zero referências no código. Também removido do interface `AppContextType`.

---

## Q. returnProducts REMOVIDO

**Status:** REMOVIDO. Confirmado via grep — zero referências no código. Também removido do interface `AppContextType`.

---

## R. updateProduct CORRIGIDO

**Antes:** Enviava `quantity_in_stock: updatedData.quantityInStock` (que era `SUM(productLots)`) no UPDATE.

**Agora:** `updateProduct` NÃO envia `quantity_in_stock` no payload UPDATE. Apenas atualiza: `name`, `category`, `unit`, `min_stock_level`, `price`, `supplier`, `description`.

---

## S. ProductForm CORRIGIDO

**Antes (edição):** Calculava `totalFromLots = SUM(productLots)` e enviava como `quantityInStock` no submit.

**Agora (edição):** Não envia `quantityInStock`. O submit passa apenas `formData` (name, category, unit, minStockLevel, price, supplier, description).

**Criação:** Mantém comportamento atual — produto novo sem lotes nasce com `quantity_in_stock = 0`. Se tem pending lots, o `addProduct` faz INSERT com `quantity_in_stock: product.quantityInStock` (que é `totalFromLots` dos pending lots). O `addProduct` ainda insere os lotes diretamente (não via RPC) e NÃO recalcula `quantity_in_stock` após inserir lotes.

---

## T. COMPORTAMENTO ProductCreate COM PENDING LOTS

**Comportamento preservado temporariamente:**

O fluxo `ProductCreate` com pending lots continua funcionando da seguinte forma:
1. `ProductForm` coleta pending lots e calcula `pendingLotsTotal`
2. `addProduct` faz INSERT do produto com `quantity_in_stock = product.quantityInStock` (que é `pendingLotsTotal` do ProductForm)
3. `addProduct` insere os lotes diretamente via `supabase.from('product_lots').insert(...)`
4. **NÃO** recalcula `quantity_in_stock` após inserir lotes (o código de recompute foi removido)

**Isso significa:** O produto é criado com `quantity_in_stock = SUM(pending lots)`, que é coerente — o estoque total inicial corresponde à soma dos lotes iniciais. Lotes subsequentes (add, edit, delete) via LotManager usarão as novas RPCs e não alterarão `quantity_in_stock`.

**Risco:** Se o INSERT do produto falhar, os lotes não são inseridos (estão após o INSERT). Se o INSERT dos lotes falhar, o produto fica com `quantity_in_stock > 0` mas sem lotes — isso é aceitável (estoque sem lote). Uma melhoria futura seria criar uma RPC `create_product_with_lots` atômica, mas isso está fora do escopo desta etapa.

---

## U. UI ESTOQUE TOTAL/EM LOTES/SEM LOTE

**LotManager (edição de produto):**
- Mostra "Em lotes: Y {unit}" (soma dos lotes)
- Mostra "Sem lote: X - Y {unit}" (quando >= 0)
- Mostra "Estoque total: X {unit}" (quantity_in_stock do produto)
- Se Y > X (excesso histórico): mostra mensagem "Quantidade em lotes excede o estoque total. Dados históricos precisam de revisão."

**ProductForm (criação de produto):**
- Mostra "Em lots: Y {unit}" (soma dos pending lots)
- Texto atualizado: "Os lotes representam uma parcela do estoque total."

**ProductForm (edição de produto):**
- Texto atualizado: "Os lotes representam uma parcela do estoque total. Criar, editar ou excluir um lote não altera o estoque total do produto."

---

## V. VALIDAÇÃO FRONTEND

A validação no frontend é mínima — os campos de lote já validam `quantity >= 0` e `lotNumber` não vazio. A validação real do invariant `SUM(lots) <= quantity_in_stock` é feita exclusivamente na RPC. O frontend não tenta antecipar esse erro (a UI mostra o estoque total e o estoque em lotes para que o usuário tenha contexto visual).

---

## W. 3 OPERATION RPCs INTACTAS

Confirmadas via `information_schema.routines`:
- `create_operation_with_stock` — intacta
- `update_operation_with_stock` — intacta
- `delete_operation_with_stock` — intacta

Nenhuma alteração foi feita nas operation RPCs.

---

## X. 48 RLS POLICIES

Confirmadas via `pg_policies`: **48 policies** intactas. Nenhuma RLS policy foi alterada.

---

## Y. PRE/POST

| Métrica | PRE | POST | Igual? |
|---|---|---|---|
| COUNT products | 217 | 217 | ✓ |
| COUNT product_lots | 149 | 149 | ✓ |
| SUM products.quantity_in_stock | 4,617,076.08 | 4,617,076.08 | ✓ |
| SUM product_lots.quantity | 185,382.00 | 185,382.00 | ✓ |
| Products com stock > 0 sem lotes | 122 | 122 | ✓ |
| Products divergentes | 125 | 125 | ✓ |
| Products onde SUM(lots) > stock | 3 | 3 | ✓ |
| Checksum products | 3e4ee40eb2ab1b6f6fbbc0bec44bca6d | 3e4ee40eb2ab1b6f6fbbc0bec44bca6d | ✓ |
| Checksum product_lots | 9a606414b40c0420705ddbc6a4a4660b | 9a606414b40c0420705ddbc6a4a4660b | ✓ |

**PRE = POST confirmado. Nenhum dado existente foi alterado.**

---

## Z. BUILD

```
✓ built in 27.75s
```

Build passa sem erros. Apenas warning de chunk size (preexistente, não relacionado).

---

## AA. ROLLBACK

### Frontend rollback:
- Restaurar `addLot`, `updateLot`, `deleteLot` anteriores (INSERT/UPDATE/DELETE direto + recompute + sync)
- Restaurar `recomputeProductQuantity`, `syncProductTotalToDb`, `useProducts`, `returnProducts`
- Restaurar `updateProduct` com `quantity_in_stock` no payload
- Restaurar `ProductForm` com `quantityInStock: totalFromLots` no submit
- Restaurar textos da UI

### Database rollback:
```sql
DROP FUNCTION IF EXISTS public.create_product_lot(uuid, text, numeric, date);
DROP FUNCTION IF EXISTS public.update_product_lot(uuid, text, numeric, date);
DROP FUNCTION IF EXISTS public.delete_product_lot(uuid);
```

**Rollback NÃO executado.**

---

## AB. RISCOS / DIVERGÊNCIAS

| # | Risco | Severidade | Status |
|---|---|---|---|
| 1 | Operation sem lotId pode tornar SUM(lots) > quantity_in_stock | P1 | Reportado, não alterado nesta etapa |
| 2 | ProductCreate com pending lots não é atômico (produto e lotes em steps separados) | P2 | Preservado temporariamente, fora de escopo |
| 3 | 3 produtos em excesso histórico (SUM(lots) > stock) | P2 | Legacy exception aplicada nas RPCs, não corrigido |
| 4 | 122 produtos com stock > 0 sem lotes | P3 | Comportamento correto pela nova regra (estoque sem lote) |
| 5 | 125 produtos com divergência stock != SUM(lots) | P3 | Não corrigido — divergências históricas preservadas |
| 6 | database.types.ts stale | P3 | Não regenerado nesta etapa |

---

## AC. STATUS

**PASS**

Todos os critérios atendidos:
- 3 RPCs de lote criadas (create_product_lot, update_product_lot, delete_product_lot) ✓
- Institution isolation correta ✓
- ACL correta (REVOKE PUBLIC/anon, GRANT authenticated) ✓
- Safe search_path (public, pg_temp) ✓
- Lot mutations não alteram quantity_in_stock ✓
- Frontend usa RPCs ✓
- syncProductTotalToDb removido ✓
- recomputeProductQuantity removido ✓
- useProducts removido ✓
- returnProducts removido ✓
- updateProduct não escreve quantity_in_stock ✓
- ProductForm edição não calcula estoque por SUM(lots) ✓
- UI reflete total/rastreado/sem lote ✓
- Nenhum dado existente alterado (PRE = POST) ✓
- 48 policies intactas ✓
- 3 operation RPCs intactas ✓
- Build passa ✓

**Nenhum dado foi alterado. PRE = POST confirmado.**
