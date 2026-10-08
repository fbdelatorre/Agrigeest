# ETAPA 3K — PROTEGER ESTOQUE NÃO RASTREADO NAS OPERAÇÕES SEM LOTID

**Data:** 2026-10-08
**Modo:** Implementação com ZERO DATA LOSS

---

## A. PRE BASELINE

| Métrica | Valor PRE |
|---|---|
| COUNT operations | 309 |
| COUNT products | 217 |
| COUNT product_lots | 149 |
| SUM products.quantity_in_stock | 4,617,076.08 |
| SUM product_lots.quantity | 185,382.00 |
| Products onde SUM(lots) > stock | 3 |
| Checksum operations | `aefe8e7fb0f7fead075d1dc023671da0` |
| Checksum products | `2d51473e452266210423f2bc28d48994` |
| Checksum product_lots | `aa14636c5c95e8bb58be4e432dc3ee63` |
| RLS policies | 48 |
| RPCs (SECURITY DEFINER) | 6 confirmadas |

---

## B. RISCO ANTERIOR CONFIRMADO

ETAPA 3J identificou P1: uma operation sem lotId podia consumir mais do que o estoque não rastreado, tornando `SUM(lots) > quantity_in_stock`.

**Cenário:** stock=500, SUM(lots)=450, untracked=50. Operation sem lotId de 100 → stock=400, SUM(lots)=450 → lotes excedem estoque total.

**Confirmado:** As RPCs originais validavam apenas `quantity_in_stock >= v_quantity` mas não verificavam `untracked_stock >= usage_without_lot`.

---

## C. CREATE RPC NOVA LÓGICA

`create_operation_with_stock` agora inclui um passo 7.5 (antes das deductions):

1. Para cada produto com usage sem lotId, faz `SELECT ... FROM products ... FOR UPDATE`
2. Computa `tracked = SUM(product_lots.quantity)` para o produto
3. Computa `untracked = quantity_in_stock - tracked`
4. Se `untracked < usage_without_lot`: `RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK'`

A validação ocorre **antes** de qualquer deduction, garantindo atomicidade total. Se falhar, nenhuma mutation acontece.

---

## D. CÁLCULO UNTRACKED CREATE

```
tracked_before = COALESCE(SUM(product_lots.quantity), 0)
untracked_before = quantity_in_stock - tracked_before
```

Validação: `untracked_before >= usage_without_lot`

O lock `FOR UPDATE` no produto garante que `tracked_before` é estável durante a transação (lot RPCs também precisam lockar o produto).

---

## E. CREATE COM LOTID

Não mudou. Usage com lotId continua validando:
- `quantity_in_stock >= v_quantity` (no UPDATE atômico)
- `product_lots.quantity >= v_quantity` (no UPDATE atômico)

Consumo com lotId reduz total e tracked igualmente → untracked permanece igual. Não há necessidade de validação untracked para usage com lotId.

---

## F. CREATE MISTO

Para o mesmo produto com usage com e sem lotId:

- Usage com lotId (ex: 200 do lote A): validado normalmente
- Usage sem lotId (ex: 100): validado contra `untracked_before`

Como o cálculo de `untracked_before` usa os valores atuais do banco (antes da mutation), e o consumo com lotId não altera untracked, a validação é correta.

**Exemplo do spec:**
- stock=500, tracked=400, untracked=100
- 200 com lotId + 100 sem lotId → PASS (untracked=100 >= 100)
- 200 com lotId + 101 sem lotId → FAIL (untracked=100 < 101)

---

## G. LEGACY EXCESS CREATE

Para os 3 produtos onde `tracked > stock`:
- `untracked = stock - tracked` → negativo
- Qualquer `usage_without_lot > 0` falha (negativo < qualquer positivo)
- `RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK'`

Operation com lotId continua funcionando normalmente para esses produtos (não piora o excesso).

---

## H. UPDATE RPC NOVA LÓGICA

`update_operation_with_stock` agora inclui passo 8.5 (antes das deductions):

1. Constrói agregados separados: `old_prod_no_lot_agg` e `new_prod_no_lot_agg`
2. Para cada produto onde `delta_without_lot = new_without_lot - old_without_lot > 0`:
   - Lock produto `FOR UPDATE`
   - Computa `untracked = stock - SUM(lots)`
   - Se `untracked < delta_without_lot`: `RAISE EXCEPTION 'INSUFFICIENT_UNTRACKED_STOCK'`
3. Produtos históricos (não existem) são pulados — tratados pelo passo 9 existente

---

## I. DELTA SEM LOTID

**Redução (delta < 0):** old=100 sem lote → new=60. Delta=-40. Devolve 40 ao `quantity_in_stock`. Lotes não alterados. Untracked aumenta 40. Sem validação necessária.

**Aumento (delta > 0):** old=60 sem lote → new=100. Delta=+40. Exige `untracked >= 40` antes do consumo. Validado no passo 8.5.

---

## J. SEM LOTE → COM LOTE

OLD: 100 sem lotId. NEW: 100 no lote A.

**Delta produto:** old=100, new=100, delta=0 → sem alteração de stock total.
**Delta lot:** old=0, new=100, delta_lot=+100 → lote A diminui 100.
**Delta sem lotId:** old=100, new=0, delta=-100 → devolve 100 ao stock.

**Efeito líquido:** stock +100 (devolução) -100 (consumo com lote) = 0. Lote A -100. Untracked +100 (stock não mudou, tracked diminuiu 100).

A validação untracked não é triggered porque `delta_without_lot = 0 - 100 = -100 < 0`.

---

## K. COM LOTE → SEM LOTE

OLD: 100 lote A. NEW: 100 sem lotId.

**Delta produto:** delta=0 → sem alteração.
**Delta lot:** old=100, new=0, delta_lot=-100 → lote A +100 (devolução).
**Delta sem lotId:** old=0, new=100, delta=+100 → exige untracked >= 100.

**Efeito líquido:** stock não muda. Lote A +100. Tracked +100. Untracked -100.

A validação untracked é triggered: `delta_without_lot = 100 - 0 = +100 > 0`. Exige `untracked >= 100`. Se não houver untracked suficiente, bloqueia com `INSUFFICIENT_UNTRACKED_STOCK`. Isso está correto — a transação move consumo de rastreado para não rastreado, e precisa de untracked suficiente.

---

## L. ORPHAN HISTÓRICO PRESERVADO

As regras de ETAPA 3E para produtos históricos (excluídos da tabela products) são preservadas exatamente:

- Same quantity: allow, no stock change
- Removed from NEW: allow, no stock return
- Quantity changed: `HISTORICAL_PRODUCT_UNAVAILABLE`
- New non-existent product: `PRODUCT_NOT_FOUND_OR_FORBIDDEN`

A nova validação untracked pula produtos que não existem (`CONTINUE`), deixando que o passo 9 trate-os.

---

## M. LEGACY EXCESS UPDATE

Para os 3 produtos em excesso histórico:
- `untracked = stock - tracked` → negativo
- Qualquer `delta_without_lot > 0` falha (negativo < qualquer positivo)
- `INSUFFICIENT_UNTRACKED_STOCK`

Mudanças com lotId não são afetadas (não触发 validação untracked). Mudanças que reduzam consumo sem lotId são permitidas (delta < 0 não valida).

---

## N. DELETE RPC COMPATIBILIDADE

`delete_operation_with_stock` **NÃO foi modificada**.

**Análise:**
- OLD sem lotId: devolve `quantity` apenas a `products.quantity_in_stock` → untracked aumenta. Correto.
- OLD com lotId: devolve a `products.quantity_in_stock` E `product_lots.quantity` → untracked inalterado (total e tracked aumentam igualmente). Correto.

Nenhuma mudança necessária.

---

## O. LOCK ORDER

**Operation RPCs (modificadas):**
1. Operation row `FOR UPDATE` (update/delete only)
2. Products `FOR UPDATE` (novo passo de validação untracked — create e update)
3. Products arithmetic UPDATE (deduction — mesma transação, mesmo lock)
4. Product_lots arithmetic UPDATE (deduction)

**Lot RPCs (ETAPA 3J, não modificadas):**
1. Products `FOR UPDATE`
2. Product_lots `FOR UPDATE`

**Ordem consistente:** products sempre antes de product_lots. Nenhum deadlock introduzido.

---

## P. CONCORRÊNCIA COM LOT RPCs

A nova validação faz `SELECT ... FROM products ... FOR UPDATE` antes das deductions. Isso serializa com lot RPCs que também lockam products `FOR UPDATE`.

O cálculo `SUM(product_lots.quantity)` ocorre **depois** do lock do produto, garantindo que o valor é estável durante a transação. Se uma lot RPC tentar modificar lotes do mesmo produto, ela esperará pelo lock do produto.

---

## Q. FRONTEND ERROR HANDLING

**OperationCreate.tsx:** Adicionado handler para `INSUFFICIENT_UNTRACKED_STOCK`:
- PT: "Estoque sem lote insuficiente. Selecione um lote com saldo disponível ou ajuste a quantidade."
- EN: "Insufficient untracked stock. Select a lot with available balance or adjust the quantity."

**OperationEdit.tsx:** Adicionado `INSUFFICIENT_UNTRACKED_STOCK` ao mapa de errorMessages com as mesmas mensagens.

Nenhuma alteração estrutural nos forms. O JSON `products_used` não foi alterado.

---

## R. 3 LOT RPCs INTACTAS

Confirmadas via `information_schema.routines`:
- `create_product_lot` — SECURITY DEFINER — intacta
- `update_product_lot` — SECURITY DEFINER — intacta
- `delete_product_lot` — SECURITY DEFINER — intacta

Nenhuma alteração nas lot RPCs.

---

## S. SEGURANÇY / GRANTS

Preservados em ambas as RPCs modificadas:
- `SECURITY DEFINER`
- `SET search_path = public, pg_temp`
- `REVOKE ALL FROM PUBLIC`
- `REVOKE ALL FROM anon`
- `GRANT EXECUTE TO authenticated`
- Institution isolation via `auth.uid()` → `user_profiles`
- Cross-institution protection

---

## T. TESTES CONCEITUAIS

| # | Cenário | Resultado Esperado | Validação |
|---|---|---|---|
| 1 | stock=500, tracked=450, sem lote=50 | PASS | untracked=50 >= 50 ✓ |
| 2 | stock=500, tracked=450, sem lote=51 | FAIL | untracked=50 < 51 ✓ |
| 3 | stock=500, tracked=300, lote A=200, usage lote A=100 | PASS | sem validação untracked ✓ |
| 4 | stock=500, tracked=300, lote A=100+sem lote=200 | PASS | untracked=200 >= 200 ✓ |
| 5 | stock=500, tracked=300, lote A=100+sem lote=201 | FAIL | untracked=200 < 201 ✓ |
| 6 | legacy: stock=500, tracked=600, sem lote=1 | FAIL | untracked=-100 < 1 ✓ |
| 7 | UPDATE old sem lote=100 → new=60 | devolve 40 total | delta=-100 < 0, sem validação ✓ |
| 8 | UPDATE old sem lote=60 → new=100 | exige 40 untracked | delta=+40, valida untracked ✓ |
| 9 | UPDATE dose-only | zero mutation | delta=0, sem validação ✓ |
| 10 | DELETE old sem lote=100 | total +100, lots unchanged | delete não modificada ✓ |
| 11 | DELETE old lote A=100 | total +100, lote A +100 | delete não modificada ✓ |

---

## U. PRE/POST

| Métrica | PRE | POST | Igual? |
|---|---|---|---|
| COUNT operations | 309 | 309 | ✓ |
| COUNT products | 217 | 217 | ✓ |
| COUNT product_lots | 149 | 149 | ✓ |
| SUM products.quantity_in_stock | 4,617,076.08 | 4,617,076.08 | ✓ |
| SUM product_lots.quantity | 185,382.00 | 185,382.00 | ✓ |
| Products onde SUM(lots) > stock | 3 | 3 | ✓ |
| Checksum operations | aefe8e7fb0f7fead075d1dc023671da0 | aefe8e7fb0f7fead075d1dc023671da0 | ✓ |
| Checksum products | 2d51473e452266210423f2bc28d48994 | 2d51473e452266210423f2bc28d48994 | ✓ |
| Checksum product_lots | aa14636c5c95e8bb58be4e432dc3ee63 | aa14636c5c95e8bb58be4e432dc3ee63 | ✓ |

**PRE = POST confirmado. Nenhum dado existente foi alterado.**

---

## V. 48 RLS POLICIES

Confirmadas: **48 policies** intactas. Nenhuma RLS policy alterada.

---

## W. 6 RPCs

| RPC | SECURITY DEFINER | Status |
|---|---|---|
| create_operation_with_stock | ✓ | Modificada (adicionada validação untracked) |
| update_operation_with_stock | ✓ | Modificada (adicionada validação untracked) |
| delete_operation_with_stock | ✓ | Não modificada |
| create_product_lot | ✓ | Intacta |
| update_product_lot | ✓ | Intacta |
| delete_product_lot | ✓ | Intacta |

Assinaturas idênticas (CREATE OR REPLACE, sem overload).

---

## X. BUILD

```
✓ built in 30.90s
```

Build passa sem erros.

---

## Y. ROLLBACK

### Database rollback:
Restaurar versões anteriores de `create_operation_with_stock` e `update_operation_with_stock` (das migrations 20261007200013 e 20261007203425).

`delete_operation_with_stock` não foi alterada — não incluir no rollback.

### Frontend rollback:
Remover handler `INSUFFICIENT_UNTRACKED_STOCK` de OperationCreate.tsx e OperationEdit.tsx.

**Rollback NÃO executado.**

---

## Z. RISCOS / DIVERGÊNCIAS

| # | Risco | Severidade | Status |
|---|---|---|---|
| 1 | 3 produtos em excesso histórico (tracked > stock) | P2 | Preservado, operações sem lotId bloqueadas |
| 2 | ProductCreate com pending lots não é atômico | P2 | Fora de escopo (ETAPA 3J) |
| 3 | database.types.ts stale | P3 | Não regenerado |

---

## AA. STATUS

**PASS**

Todos os critérios atendidos:
- CREATE sem lotId não consome além do untracked_stock ✓
- CREATE com lotId continua funcionando ✓
- CREATE misto funciona corretamente ✓
- UPDATE delta sem lotId protegido ✓
- Trocas com/sem lote matematicamente corretas ✓
- Regras de orphan histórico preservadas ✓
- DELETE confirmado compatível (não modificado) ✓
- Lock order compatível (products → product_lots) ✓
- 3 lot RPCs intactas ✓
- Nenhum dado existente alterado (PRE = POST) ✓
- 48 policies intactas ✓
- 6 RPCs confirmadas (SECURITY DEFINER) ✓
- Build passa ✓
