# ETAPA 3F — DELETE OPERATION ATÔMICO

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
- update_operation_with_stock: existe, SECURITY DEFINER, owner postgres
- delete_operation_with_stock: NÃO existia

Baseline histórico:
- 501 items com productId inexistente
- 158 operations com pelo menos 1 productId inexistente
- 0 lotId órfão

---

## B. Fluxo DELETE Antigo Confirmado

```
returnProducts(operation.productsUsed) → DELETE operations
```

P0: se returnProducts funcionar e DELETE falhar, estoque é devolvido sem a operation ser apagada. Esta etapa elimina esse risco.

---

## C. Migration Criada

Migration `create_atomic_delete_operation_with_stock` aplicada via `mcp__supabase__apply_migration`.

---

## D. Assinatura / Retorno RPC

```
public.delete_operation_with_stock(
  p_operation_id uuid
)
RETURNS public.operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
```

Retorna a operation excluída (facilita frontend e auditoria).

---

## E. SECURITY DEFINER / Grants

- SECURITY DEFINER = true
- Owner = postgres
- search_path = public, pg_temp
- ACL: {postgres=X, authenticated=X, service_role=X} — anon e PUBLIC ausentes
- REVOKE ALL FROM PUBLIC e FROM anon executados
- GRANT EXECUTE TO authenticated

---

## F. Auth / Institution

1. auth.uid() IS NOT NULL → senão AUTH_REQUIRED
2. user_profiles.institution_id → senão PROFILE_NOT_FOUND / PROFILE_NO_INSTITUTION
3. institution_id derivado exclusivamente do perfil

---

## G. Operation FOR UPDATE

```sql
SELECT products_used
FROM public.operations
WHERE id = p_operation_id AND institution_id = v_institution_id
FOR UPDATE;
```

Se não encontra → OPERATION_NOT_FOUND_OR_FORBIDDEN. OLD products_used vem exclusivamente dessa row. Não recebe products_used do frontend.

---

## H. Agregação Products

OLD quantities agregadas por productId. Duplicatas somadas em uma única devolução. Processadas em ordem determinística por UUID.

---

## I. Produto Atual Existente

Se productId existe em products E pertence à instituição:

```sql
UPDATE public.products
SET quantity_in_stock = quantity_in_stock + v_quantity
WHERE id = v_product_id AND institution_id = v_institution_id
RETURNING id;
```

Se nenhuma row → PRODUCT_NOT_FOUND_OR_FORBIDDEN. Aritmética atômica, não read-modify-write.

---

## J. Produto Histórico Excluído

Se productId NÃO existe em products (verificado com `PERFORM 1 FROM public.products WHERE id = v_product_uuid`):

- PERMITIR DELETE da operation
- NÃO recriar produto
- NÃO criar placeholder
- NÃO devolver estoque
- NÃO bloquear DELETE

Consistente com o UPDATE aprovado na ETAPA 3E.

---

## K. Proteção Cross-Institution

Antes de classificar como histórico excluído:

- Se productId existe em products mas institution_id diferente → PRODUCT_NOT_FOUND_OR_FORBIDDEN
- Tolerância histórica aplica-se somente quando a row realmente NÃO EXISTE em products

---

## L. Lotes

Para OLD items com lotId:

- Agregar quantity por lotId
- Se lote existe, product_id corresponde, e produto pertence à instituição:

```sql
UPDATE public.product_lots
SET quantity = quantity + v_quantity
WHERE id = v_lot_id AND product_id = v_product_id
RETURNING id;
```

- Se lote existe mas mismatch product ou cross-institution → LOT_NOT_FOUND_OR_MISMATCH
- Ordem determinística por UUID

---

## M. OLD Sem lotId

Se item histórico OLD não possui lotId: devolver somente ao produto atual (se existir). NÃO tentar descobrir/inventar lote.

---

## N. Lote Histórico Inexistente

Se OLD contém lotId mas row não existe em product_lots:

- NÃO recriar lote
- NÃO devolver quantidade
- PERMITIR DELETE da operation
- Tratar como histórico indisponível

Se lote existe mas pertence a outro productId → LOT_NOT_FOUND_OR_MISMATCH.
Se lote existe ligado a produto de outra instituição → LOT_NOT_FOUND_OR_MISMATCH.

Baseline: 0 lotIds órfãos confirmado, mas proteção implementada.

---

## O. Produto Excluído + lotId

Se OLD contém productId histórico excluído E lotId:

- NÃO tentar devolver ao produto inexistente
- Se lote também não existe: ignorar ambos como histórico
- Se lote existe mas produto pai não existe: validar via FK — se lote existe com product_id válido, o produto existe (FK garante). Se product_id do lote não corresponde ao productId do OLD → LOT_NOT_FOUND_OR_MISMATCH
- Cenário estruturalmente impossível (lote existe sem produto pai) não foi encontrado no baseline atual

---

## P. Ordem / Concorrência

1. Lock operation (FOR UPDATE)
2. Agregar products por productId
3. Agregar lots por lotId
4. Devolver products em ordem determinística (array_agg ORDER BY)
5. Devolver lots em ordem determinística (array_agg ORDER BY)
6. DELETE operation

CREATE consumindo X + DELETE devolvendo X simultâneos: PostgreSQL serializa via row locks. Arithmetic UPDATE garante resultado correto independentemente da ordem.

---

## Q. FKs Filhas de operations

| Constraint | Child Table | Delete Rule |
|---|---|---|
| operation_products_operation_id_fkey | operation_products | CASCADE |

operation_products tem CASCADE — DELETE da operation remove automaticamente rows filhas. operation_products está vazio e isolado. Nenhuma FK filha pode bloquear DELETE.

---

## R. DELETE + Rollback Transacional

```sql
DELETE FROM public.operations
WHERE id = p_operation_id AND institution_id = v_institution_id
RETURNING * INTO v_deleted_operation;
```

Se DELETE não retorna row → OPERATION_DELETE_FAILED. Qualquer falha provocada por RAISE EXCEPTION rollback automático de todas as devoluções de estoque realizadas anteriormente (plpgsql transaction semantics).

---

## S. Frontend ONLINE Antes/Depois

**ANTES:**
```
returnProducts(operation.productsUsed) → DELETE operations
```

**DEPOIS:**
```
supabase.rpc('delete_operation_with_stock', { p_operation_id: id })
→ remover operation do state
→ loadProducts() + loadProductLots()
```

---

## T. Confirmação: returnProducts NÃO Chamado no DELETE Online

**SIM.** A nova `deleteOperation` online não chama `returnProducts`. A RPC devolve estoque internamente. O fluxo offline permanece inalterado.

---

## U. Offline Inalterado

SIM. O branch `!isOnline` em `deleteOperation` permanece idêntico: filtra state local, marca pending sync.

---

## V. CREATE / UPDATE Intactos

SIM. Ambas confirmadas existentes com SECURITY DEFINER, owner postgres:
- create_operation_with_stock
- update_operation_with_stock

Não modificadas.

---

## W. Lot Management P1

SIM. `addLot`, `updateLot`, `deleteLot`, `syncProductTotalToDb`, `recomputeProductQuantity` não foram modificados. P1 permanece conhecido.

---

## X. PRE/POST Counts/Sums/Checksums

| Tabela | PRE Count | POST Count | PRE Checksum | POST Checksum |
|---|---|---|---|---|
| operations | 309 | 309 | fbf1eb1ad43d46437c0d98206cf75 | fbf1eb1ad43d46437c87f0d98206cf75 |
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

1. **Frontend:** Reverter `deleteOperation` ao fluxo anterior (returnProducts + DELETE direto)
2. **Database:** `DROP FUNCTION IF EXISTS public.delete_operation_with_stock(uuid)`
3. **CREATE RPC:** Não tocar
4. **UPDATE RPC:** Não tocar
5. **Dados:** Nenhuma alteração necessária (PRE = POST)

Rollback NÃO executado.

---

## AB. Divergências

Nenhuma divergência identificada. Todos os cenários do especificação foram implementados conforme descrito.

---

## AC. STATUS: PASS

RPC criada, frontend online migrado, build passa, PRE = POST, 48 RLS policies intactas, CREATE e UPDATE RPCs intactas, offline inalterado, lot management P1 não modificado.

Os três fluxos online de operation (CREATE, UPDATE, DELETE) agora são atômicos via RPC.

STOP.
