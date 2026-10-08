# ETAPA 3I — MICROAUDITORIA FINAL DOS WRITERS DE ESTOQUE

**Data:** 2026-10-08
**Modo:** READ-ONLY ABSOLUTO — nenhuma alteração foi feita no frontend, banco de dados, migrations, RLS, ou dados.

---

## A. TODOS WRITERS DE `products.quantity_in_stock`

| # | Arquivo/Função | Tipo | Chama Quem | Quando Executa | Tipo de Escrita | Usa Arithmetic UPDATE | Read-Modify-Write | Valor Absoluto | Pode Concorrer com RPCs |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `AppContext.addProduct` (L554-614) | Writer direto necessário | ProductForm → ProductCreate | Criação de produto | INSERT + UPDATE | Não (INSERT inicial) | Sim (após insert, recalcula SUM(lots)) | Sim (`totalFromLots`) | Sim |
| 2 | `AppContext.addProduct` (L611-614) | Writer direto necessário | (continuação de addProduct) | Após inserir lotes iniciais | UPDATE `.eq('id', newProduct.id)` | Não | Sim (lê `newLots` do estado local) | Sim (`totalFromLots`) | Sim |
| 3 | `AppContext.updateProduct` (L626-635) | Writer direto perigoso | ProductForm → ProductEdit | Edição manual de produto | UPDATE `.eq('id', id)` | Não | Sim (lê `updatedData` do estado local) | Sim (`updatedData.quantityInStock`) | **SIM — sobrescreve resultado de RPC** |
| 4 | `AppContext.recomputeProductQuantity` (L675-683) | Helper local (não escreve no DB) | addLot, updateLot, deleteLot | Após mutação de lote | Apenas `setProducts` (estado React) | N/A | N/A | Sim (`totalFromLots`) | N/A |
| 5 | `AppContext.syncProductTotalToDb` (L685-690) | Writer direto necessário | addLot, updateLot, deleteLot | Após mutação de lote | UPDATE `.eq('id', productId)` | Não | Sim (recebe `total` calculado do estado) | Sim (`total`) | **SIM — sobrescreve resultado de RPC** |
| 6 | `AppContext.returnProducts` (L817-826) | Código morto (zero callers) | Ninguém | Nunca | UPDATE `.eq('id', product.id)` | Não | Sim (lê `product.quantityInStock` do estado) | Não (`+ usage.quantity` — delta) | Sim |
| 7 | `AppContext.useProducts` (L893-901) | Código morto (zero callers) | Ninguém | Nunca | UPDATE `.eq('id', product.id)` | Não | Sim (lê `product.quantityInStock` do estado) | Não (`- usage.quantity` — delta) | Sim |
| 8 | RPC `create_operation_with_stock` (migration L228-232) | **RPC já segura** | OperationCreate | Criação de operação | UPDATE com `WHERE quantity_in_stock >= v_quantity` | **SIM** (`quantity_in_stock - v_quantity`) | **Não** | Não (delta aritmético) | Não (atômica) |
| 9 | RPC `update_operation_with_stock` (migration L292-296, L305) | **RPC já segura** | OperationEdit | Edição de operação | UPDATE com `WHERE quantity_in_stock >= v_delta` | **SIM** (`quantity_in_stock - v_delta` / `+ ABS(v_delta)`) | **Não** | Não (delta aritmético) | Não (atômica) |
| 10 | RPC `delete_operation_with_stock` (migration L175) | **RPC já segura** | OperationDelete | Exclusão de operação | UPDATE `quantity_in_stock + v_quantity` | **SIM** (`+ v_quantity`) | **Não** | Não (delta aritmético) | Não (atômica) |

**Classificação:**
- **A. RPC operation já segura:** #8, #9, #10 (3 writers)
- **B. Writer direto ainda necessário:** #1, #2, #5 (criação de produto, sync de lotes)
- **C. Writer direto perigoso:** #3 (`updateProduct`), #5 (`syncProductTotalToDb`) — usam valor absoluto, podem sobrescrever RPCs
- **D. Código morto/não utilizado:** #6 (`returnProducts`), #7 (`useProducts`)

---

## B. TODOS WRITERS DE `product_lots.quantity`

| # | Arquivo/Função | Tipo | Chama Quem | Quando Executa | Tipo de Escrita | Usa Arithmetic UPDATE | Read-Modify-Write | Valor Absoluto | Pode Concorrer com RPCs |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `AppContext.addProduct` (L584-588) | Writer direto necessário | ProductCreate | Criação de produto com lotes | INSERT | N/A | Não | Sim (`l.quantity`) | Não (produto novo) |
| 2 | `AppContext.addLot` (L696-705) | Writer direto necessário | LotManager | Adicionar lote a produto existente | INSERT + recompute | N/A | Não | Sim (`lot.quantity`) | Não (INSERT não concorre) |
| 3 | `AppContext.updateLot` (L738-743) | Writer direto perigoso | LotManager | Editar lote existente | UPDATE `.eq('id', id)` | Não | Sim (lê estado local) | Sim (`updatedData.quantity`) | **SIM — sobrescreve RPC** |
| 4 | `AppContext.deleteLot` (L771) | Writer direto perigoso | LotManager | Excluir lote | DELETE `.eq('id', id)` | N/A | Sim (lê estado local para recompute) | N/A | **SIM — recompute sobrescreve RPC** |
| 5 | `AppContext.returnProducts` (L797-800) | Código morto (zero callers) | Ninguém | Nunca | UPDATE `.eq('id', lot.id)` | Não | Sim (lê `lot.quantity` do estado) | Não (`+ usage.quantity`) | Sim |
| 6 | `AppContext.useProducts` (L873-876) | Código morto (zero callers) | Ninguém | Nunca | UPDATE `.eq('id', lot.id)` | Não | Sim (lê `lot.quantity` do estado) | Não (`- usage.quantity`) | Sim |
| 7 | RPC `create_operation_with_stock` (migration L236-240) | **RPC já segura** | OperationCreate | Criação de operação com lotId | UPDATE com `WHERE quantity >= v_quantity` | **SIM** (`quantity - v_quantity`) | **Não** | Não (delta) | Não (atômica) |
| 8 | RPC `update_operation_with_stock` (migration L300-304, L309-313) | **RPC já segura** | OperationEdit | Edição de operação com lotId | UPDATE com `WHERE quantity >= v_delta` | **SIM** (`quantity - v_delta` / `+ ABS(v_delta)`) | **Não** | Não (delta) | Não (atômica) |
| 9 | RPC `delete_operation_with_stock` (migration L178-182) | **RPC já segura** | OperationDelete | Exclusão de operação com lotId | UPDATE `quantity + v_quantity` | **SIM** (`+ v_quantity`) | **Não** | Não (delta) | Não (atômica) |

**Classificação:**
- **A. RPC operation já segura:** #7, #8, #9 (3 writers)
- **B. Writer direto ainda necessário:** #1, #2 (INSERT de novos lotes)
- **C. Writer direto perigoso:** #3 (`updateLot`), #4 (`deleteLot`) — valor absoluto / recompute, sobrescrevem RPCs
- **D. Código morto/não utilizado:** #5 (`returnProducts` lot update), #6 (`useProducts` lot update)

---

## C. useProducts — STATUS/CALLERS

**Status:** CÓDIGO MORTO

**Callers:** ZERO. Grep por `useProducts(` retorna apenas a definição da função (L837) e a declaração no interface (L59). Nenhuma chamada real existe.

**Fluxo original:** Era usada para decrementar estoque quando uma operação consumia produtos. Agora as 3 RPCs atômicas (`create_operation_with_stock`, `update_operation_with_stock`, `delete_operation_with_stock`) fazem isso internamente com arithmetic UPDATE atômico.

**Altera:** `products.quantity_in_stock` (delta: `quantityInStock - usage.quantity`) e `product_lots.quantity` (delta: `lot.quantity - usage.quantity`).

**Pode ser removida?** SIM — candidata a remoção. Nenhum código a chama.

**Precisa ser substituída por RPC?** NÃO — já foi substituída pelas 3 RPCs atômicas de operations.

---

## D. returnProducts — STATUS/CALLERS

**Status:** CÓDIGO MORTO

**Callers:** ZERO. Grep por `returnProducts(` retorna apenas a definição da função (L788) e a declaração no interface (L59). Nenhuma chamada real existe.

**Fluxo original:** Era usada para devolver estoque quando uma operação era desfeita. Agora as RPCs atômicas fazem isso internamente.

**Altera:** `products.quantity_in_stock` (delta: `quantityInStock + usage.quantity`) e `product_lots.quantity` (delta: `lot.quantity + usage.quantity`).

**Pode ser removida?** SIM — candidata a remoção. Nenhum código a chama.

**Precisa ser substituída por RPC?** NÃO — já foi substituída pelas 3 RPCs atômicas de operations.

---

## E. addLot — FLUXO COMPLETO

**Arquivo:** `AppContext.tsx` L692-724

**Fluxo:**
1. Guarda `if (!isOnline) throw new Error(READ_ONLY_MSG)`
2. INSERT na tabela `product_lots` (novo lote com `product_id`, `lot_number`, `quantity`, `expiration_date`)
3. Atualiza estado React: `[newLot, ...productLots]`
4. Chama `recomputeProductQuantity(lot.productId, updatedLots)` → calcula `SUM(lots.quantity)` para o produto e atualiza estado React
5. Chama `syncProductTotalToDb(lot.productId, total)` → UPDATE `products SET quantity_in_stock = total` (valor absoluto)

**Como altera `product_lots.quantity`:** INSERT com valor absoluto do lote (não concorre, é criação).

**Como altera `products.quantity_in_stock`:** Recalcula como **SUM de todos os lotes** do produto e grava valor absoluto.

**Se produto sem lotes anteriores:** `total = 0 + newLot.quantity` = `newLot.quantity`. Produto passa a ter `quantity_in_stock = newLot.quantity`.

**Se produto com lotes anteriores:** `total = SUM(todos_lots)`. `quantity_in_stock` é substituído pela soma de todos os lotes (incluindo o novo).

---

## F. updateLot — FLUXO COMPLETO

**Arquivo:** `AppContext.tsx` L726-762

**Fluxo:**
1. Guarda `if (!isOnline) throw new Error(READ_ONLY_MSG)`
2. UPDATE na tabela `product_lots` (campos: `lot_number`, `quantity`, `expiration_date` — apenas os fornecidos)
3. Atualiza estado React: `productLots.map(l => l.id === id ? updatedLot : l)`
4. Chama `recomputeProductQuantity(updatedLot.productId, updatedLots)` → recalcula SUM(lots)
5. Chama `syncProductTotalToDb(updatedLot.productId, total)` → UPDATE `products SET quantity_in_stock = SUM(lots)`

**Se lote muda de quantity 100 para 80:**
- `product_lots.quantity` do lote: vira 80 (valor absoluto)
- `products.quantity_in_stock`: **vira SUM de todos os lotes** (não diminui 20 — recalcula tudo)

**Exemplo:** Produto com lotes [100, 50]. `quantity_in_stock = 150`.
- Editar lote de 100 → 80: `product_lots = [80, 50]`. `quantity_in_stock = 130` (SUM recalculado).
- Se uma RPC de operation baixou 10 do lote simultaneamente (lote real = 90), mas estado local ainda diz 100, o updateLot escreve 80 no DB (sobrescreve o 90 da RPC) e `quantity_in_stock = 130` (sobrescreve o 140 que a RPC deixou).

---

## G. deleteLot — FLUXO COMPLETO

**Arquivo:** `AppContext.tsx` L764-782

**Fluxo:**
1. Guarda `if (!isOnline) throw new Error(READ_ONLY_MSG)`
2. Encontra lote no estado local: `productLots.find(l => l.id === id)`
3. DELETE na tabela `product_lots` (`.eq('id', id)`)
4. Atualiza estado React: `productLots.filter(l => l.id !== id)`
5. Chama `recomputeProductQuantity(lot.productId, updatedLots)` → recalcula SUM(lots restantes)
6. Chama `syncProductTotalToDb(lot.productId, total)` → UPDATE `products SET quantity_in_stock = SUM(lots restantes)`

**Ao apagar lote com quantity 100:**
- O lote é removido do DB
- `products.quantity_in_stock` = SUM dos lotes restantes (sem o lote apagado)
- Os 100 do lote **desaparecem do produto** — o sistema recalcula `quantity_in_stock` como SUM(lots) sem o lote deletado

**Comportamento:** O estoque do lote deletado é **removido do total do produto**. Não há conceito de "estoque sem lote" — o sistema simplesmente recalcula SUM(lots).

**Se produto com lotes [100, 50], `quantity_in_stock = 150`:**
- Deletar lote de 100: `product_lots = [50]`. `quantity_in_stock = 50` (SUM recalculado).
- Se uma RPC baixou 10 do lote simultaneamente (lote real = 90), o DELETE remove o lote e `quantity_in_stock = 50`, sobrescrevendo o 140 que a RPC deixou.

---

## H. syncProductTotalToDb / recomputeProductQuantity

### `recomputeProductQuantity(productId, lots)` — L675-683

**Ainda existe?** SIM
**Tem callers ativos?** SIM — chamada por `addLot` (L718), `updateLot` (L756), `deleteLot` (L776)
**Em qual fluxo?** Após toda mutação de lote
**Altera `products`?** Apenas estado React (`setProducts`) — não escreve no DB
**Altera `product_lots`?** Não
**Usa valor absoluto ou delta?** Valor absoluto (`SUM(lots.quantity)`)
**Pode ser removida?** Não sem refatorar o fluxo de lotes
**Precisa ser substituída por RPC?** Sim — idealmente a RPC de lote faria o recompute atômico internamente

### `syncProductTotalToDb(productId, total)` — L685-690

**Ainda existe?** SIM
**Tem callers ativos?** SIM — chamada por `addLot` (L719), `updateLot` (L757), `deleteLot` (L777)
**Em qual fluxo?** Após `recomputeProductQuantity`, grava o total no DB
**Altera `products`?** SIM — `UPDATE products SET quantity_in_stock = total` (valor absoluto)
**Altera `product_lots`?** Não
**Usa valor absoluto ou delta?** Valor absoluto
**Pode ser removida?** Não sem refatorar o fluxo de lotes
**Precisa ser substituída por RPC?** SIM — é o writer mais perigoso: grava valor absoluto baseado em estado local, sobrescrevendo deltas atômicos das RPCs de operations

---

## I. COMPORTAMENTO — CRIAÇÃO DE LOTE

**Quando usuário cria um lote para produto que já possui `quantity_in_stock`:**

**Resposta: C. Recalcula estoque total como SUM(lots)**

**Código responsável:** `addLot` (L692-724):
```typescript
const total = recomputeProductQuantity(lot.productId, updatedLots);
await syncProductTotalToDb(lot.productId, total);
```

`recomputeProductQuantity` filtra todos os lotes do produto e soma `.quantity`. O resultado substitui `quantity_in_stock`.

**Exemplo:** Produto com `quantity_in_stock = 500` (sem lotes). Usuário cria lote de 100.
- `updatedLots = [newLot(100)]`
- `total = 100`
- `quantity_in_stock` passa de 500 para **100** (sobrescreve o valor anterior!)

**Isso é um problema conhecido:** Produtos com estoque mas sem lotes perdem seu `quantity_in_stock` quando o primeiro lote é criado, porque o sistema recalcula como SUM(lots) em vez de adicionar.

---

## J. COMPORTAMENTO — EDIÇÃO DE LOTE

**Se lote muda de quantity 100 para 80:**

**`products.quantity_in_stock`: vira SUM de todos os lotes.**

**Fluxo:** `updateLot` (L726-762):
1. UPDATE `product_lots SET quantity = 80 WHERE id = ...`
2. `recomputeProductQuantity`: soma todos os lotes do produto (incluindo o editado com 80)
3. `syncProductTotalToDb`: grava o SUM como `quantity_in_stock`

**Não diminui 20. Recalcula tudo como SUM(lots).**

Se o produto tem lotes [100, 50] → `quantity_in_stock = 150`. Após editar 100→80: lotes [80, 50] → `quantity_in_stock = 130`.

---

## K. COMPORTAMENTO — DELETE DE LOTE

**Ao apagar lote com quantity 100:**

**Esses 100 representam: estoque que deve desaparecer do produto.**

**Comportamento ATUAL:** O sistema recalcula `quantity_in_stock = SUM(lots restantes)`. O lote é removido do DB e seu quantidade some do total.

**Não há conceito de "estoque sem lote".** O DELETE simplesmente remove o lote e recalcula SUM(lots).

**Exemplo:** Produto com lotes [100, 50] → `quantity_in_stock = 150`. Deletar lote de 100: lotes [50] → `quantity_in_stock = 50`.

---

## L. PRODUCT FORM — ESTOQUE MANUAL

**Arquivo:** `ProductForm.tsx`

**Usuário pode editar diretamente `quantity_in_stock`?**

**NÃO há campo de input para `quantity_in_stock` no formulário.**

O formulário contém campos para: `name`, `category`, `unit`, `minStockLevel`, `price`, `supplier`, `description`. Não há campo `quantityInStock`.

**Como `quantityInStock` é determinado no submit:**

```typescript
const totalFromLots = isEditing && initialData.id
  ? productLots
      .filter(l => l.productId === initialData.id)
      .reduce((sum, l) => sum + l.quantity, 0)
  : pendingLotsTotal;

onSubmit({
  ...formData,
  quantityInStock: totalFromLots,
  ...
});
```

- **Criação:** `quantityInStock = SUM(pendingLots)` — soma dos lotes temporários adicionados no formulário
- **Edição:** `quantityInStock = SUM(productLots existentes)` — soma dos lotes já no DB (via `useAppContext`)

**Criação de produto define estoque inicial diretamente?**

SIM — `addProduct` (L554-614) faz INSERT com `quantity_in_stock: product.quantityInStock` (que é `totalFromLots`). Se não há lotes pendentes, `quantityInStock = 0`.

**Edição de produto:** `updateProduct` (L622-651) faz UPDATE com `quantity_in_stock: updatedData.quantityInStock` (que é `SUM(productLots)` do estado local). **Isso é perigoso** — o valor é calculado do estado local e sobrescreve qualquer valor que RPCs de operations tenham gravado.

---

## M. CONCORRÊNCIA COM RPCs

### Cenário: RPC operation baixa produto X enquanto usuário altera lote de X

**Writer 1 — RPC atômica (operation):**
- `UPDATE products SET quantity_in_stock = quantity_in_stock - 10 WHERE id = X AND quantity_in_stock >= 10`
- `UPDATE product_lots SET quantity = quantity - 10 WHERE id = lot_X AND quantity >= 10`
- Atômico, usa arithmetic no UPDATE, não lê estado local

**Writer 2 — Lot management (addLot/updateLot/deleteLot):**
- Lê `productLots` do estado React (que pode estar desatualizado)
- Calcula `SUM(lots)` localmente
- `UPDATE products SET quantity_in_stock = total_local` (valor absoluto)
- `UPDATE product_lots SET quantity = novo_valor` (valor absoluto, no caso de updateLot)

**Concorrência real:**

1. **RPC baixa 10 do lote X** → DB: `product_lots.quantity = 90`, `products.quantity_in_stock = 140`
2. **Estado local do frontend ainda diz** `product_lots.quantity = 100`, `products.quantity_in_stock = 150` (não recarregou)
3. **Usuário edita lote X de 100 para 80** → `updateLot` escreve `quantity = 80` no DB (sobrescreve o 90 da RPC) e `quantity_in_stock = SUM([80, ...]) = 130` (sobrescreve o 140 da RPC)

**Resultado:** A RPC baixou 10 e o updateLot sobrescreveu com base em estado desatualizado. O delta da RPC é perdido. O lote que deveria ter 80 (90-10=80 por coincidência) tem 80, mas `quantity_in_stock` deveria ser 130 (150-10=140, depois 140-10=130) — neste caso coincidentemente funciona, mas se o timing fosse diferente, o resultado seria incorreto.

**Writers que podem sobrescrever o resultado da RPC:**
1. `syncProductTotalToDb` — grava SUM(lots) do estado local (valor absoluto)
2. `updateProduct` — grava `quantityInStock` do estado local (valor absoluto)
3. `updateLot` — grava `quantity` absoluto no lote (sobrescreve delta da RPC)
4. `deleteLot` — remove lote e recalcula SUM(lots) do estado local

---

## N. TRIGGERS / FUNCTIONS DB

**Triggers em `products`:**
- `update_products_updated_at` — apenas atualiza `updated_at`. **Não escreve `quantity_in_stock`.**

**Triggers em `product_lots`:**
- Nenhum trigger.

**Functions (excluindo as 3 RPCs de operations):**
- `copy_data_to_institution` — menciona `quantity_in_stock` apenas no SELECT/INSERT (copia dados entre instituições). **Não é um writer de runtime** — é uma função administrativa isolada.

**Conclusão:** Não há triggers ou functions no DB que escrevam `quantity_in_stock` ou `product_lots.quantity` fora das 3 RPCs de operations.

---

## O. SOURCE OF TRUTH ATUAL

### Estoque total do produto (`products.quantity_in_stock`)

**Na prática, HOJE funciona como:**
- **Para produtos COM lotes:** `quantity_in_stock` = `SUM(product_lots.quantity)` — recalculado a cada mutação de lote
- **Para produtos SEM lotes:** `quantity_in_stock` = valor definido manualmente na criação (sempre 0, pois `totalFromLots = 0` quando não há lotes pendentes)

**Source of truth prático:** `SUM(product_lots.quantity)` para produtos com lotes. Para produtos sem lotes, `quantity_in_stock` é um valor isolado que **nunca é atualizado** (nenhum writer o altera — apenas criação e mutação de lotes o tocam).

### Estoque atribuído a lotes (`product_lots.quantity`)

**Source of truth:** Cada lote tem sua `quantity` independente. A soma dos lotes = estoque total **apenas para produtos que têm lotes**.

### Divergência estrutural

- 122 produtos têm `quantity_in_stock > 0` sem nenhum lote — seu estoque "existe" apenas em `products.quantity_in_stock`
- 125 produtos têm `quantity_in_stock != SUM(lots)` — a divergência pode ser por operações que alteraram `quantity_in_stock` via RPC sem alterar lotes (quando `lotId` não foi fornecido), ou por dados legados

---

## P. BASELINE ATUAL

| Métrica | Valor |
|---|---|
| COUNT products | 217 |
| COUNT product_lots | 149 |
| SUM products.quantity_in_stock | 4,617,076.08 |
| SUM product_lots.quantity | 185,382.00 |
| Products com stock > 0 e zero lots | 122 |
| Products com lotes | 95 |
| Products com divergence (quantity_in_stock != SUM(lots)) | 125 |
| Checksum products | `3e4ee40eb2ab1b6f6fbbc0bec44bca6d` |
| Checksum product_lots | `9a606414b40c0420705ddbc6a4a4660b` |

**Comparação com baseline anterior (ETAPA 3H):**
- Products: 217 → 217 (igual)
- Product lots: 149 → 149 (igual)
- Products com stock > 0 sem lotes: 122 → 122 (igual)
- Products com divergência: 125 → 125 (igual)

**Nenhum dado mudou.**

---

## Q. COMPATIBILIDADE DA ARQUITETURA PROPOSTA

**Proposta conceitual:**
- `products.quantity_in_stock` = estoque total do produto
- `product_lots.quantity` = parcela do estoque atribuída àquele lote
- `SUM(lots)` **NÃO** deve automaticamente substituir estoque total

**Compatível com os dados atuais?**

**SIM, conceitualmente compatível**, mas requer mudanças:

1. **122 produtos sem lotes com stock > 0:** São compatíveis — `quantity_in_stock` é o estoque total, não há lotes para somar.
2. **95 produtos com lotes:** `SUM(lots)` representa a parcela "rastreada". A diferença `quantity_in_stock - SUM(lots)` representa o estoque "não rastreado" (sem lote).
3. **UI atual:** A UI já mostra `quantity_in_stock` como estoque total e `SUM(lots)` na seção de lotes. A mensagem "A quantidade total em estoque é calculada automaticamente pela soma dos lotes" é **incorreta** para produtos sem lotes e precisa ser removida.
4. **addLot/updateLot/deleteLot:** Atualmente sobrescrevem `quantity_in_stock = SUM(lots)`. Para a arquitetura proposta, isso **não deve acontecer** — criar/editar/deletar lote não deve alterar `quantity_in_stock` automaticamente.

**Mudança mínima necessária:**
- Remover `recomputeProductQuantity` + `syncProductTotalToDb` das mutações de lote
- `addLot`: INSERT no lote, não alterar `quantity_in_stock`
- `updateLot`: UPDATE no lote, não alterar `quantity_in_stock`
- `deleteLot`: DELETE no lote, não alterar `quantity_in_stock`
- `updateProduct`: não gravar `quantity_in_stock` baseado em SUM(lots)
- Ajustar mensagem da UI

---

## R. RECOMENDAÇÃO DA PRÓXIMA IMPLEMENTAÇÃO

### Recomendação: 3 RPCs atômicas separadas (create_product_lot, update_product_lot, delete_product_lot)

**Justificativa:**

1. **3 RPCs separadas** é preferível a uma única `manage_product_lot` porque:
   - Cada operação tem semântica e validação diferentes
   - Mantém consistência com o padrão das 3 RPCs de operations
   - É mais fácil de auditar e manter
   - Permite RLS granular por operação

2. **O que cada RPC deve fazer:**
   - `create_product_lot`: INSERT no lote + **não altera `quantity_in_stock`** (ou soma ao total, dependendo da regra de negócio escolhida)
   - `update_product_lot`: UPDATE no lote (valor absoluto) + **não altera `quantity_in_stock`** (ou ajusta delta)
   - `delete_product_lot`: DELETE no lote + **não altera `quantity_in_stock`** (ou subtrai)

3. **Alternativa menor (sem RPC):** Remover apenas `syncProductTotalToDb` e `recomputeProductQuantity` das mutações de lote. Os lotes seriam gravados via Supabase client direto (INSERT/UPDATE/DELETE) sem recompute de `quantity_in_stock`. Isso resolve a concorrência mas não valida no servidor.

4. **Próximo passo ideal:**
   - Fase 1: Remover `useProducts` e `returnProducts` (código morto confirmado)
   - Fase 2: Decidir regra de negócio (lote altera `quantity_in_stock` ou não?)
   - Fase 3: Implementar RPCs atômicas de lotes conforme decisão

---

## S. RISCOS / DIVERGÊNCIAS

| # | Risco | Severidade | Descrição |
|---|---|---|---|
| 1 | `syncProductTotalToDb` sobrescreve RPCs | **ALTO** | Grava SUM(lots) do estado local desatualizado como valor absoluto, sobrescrevendo deltas atômicos das RPCs de operations |
| 2 | `updateProduct` sobrescreve RPCs | **ALTO** | Grava `quantityInStock` do estado local (SUM(lots)) como valor absoluto |
| 3 | `updateLot` sobrescreve RPCs no lote | **ALTO** | Grava `quantity` absoluto no lote, sobrescrevendo delta da RPC |
| 4 | `deleteLot` + recompute sobrescreve RPCs | **ALTO** | Remove lote e recalcula SUM(lots) do estado local |
| 5 | Criação de lote para produto sem lotes | **MÉDIO** | Produto com `quantity_in_stock > 0` sem lotes perde seu estoque ao criar primeiro lote (vira SUM(lots) = novo lote) |
| 6 | 122 produtos com stock > 0 sem lotes | **MÉDIO** | Estoque existe apenas em `products.quantity_in_stock`, sem rastreabilidade de lotes |
| 7 | 125 produtos com divergência | **MÉDIO** | `quantity_in_stock != SUM(lots)` — pode ser por RPCs que alteraram stock sem lotId, ou dados legados |
| 8 | `useProducts` / `returnProducts` código morto | **BAIXO** | Funções existem mas não são chamadas — confusão para futuros desenvolvedores |
| 9 | UI mensagem incorreta | **BAIXO** | "A quantidade total em estoque é calculada automaticamente pela soma dos lotes" — falso para produtos sem lotes |

---

## T. PRE = POST

**Baseline coletado em modo READ-ONLY. Nenhuma alteração foi feita.**

| Métrica | PRE | POST | Igual? |
|---|---|---|---|
| COUNT products | 217 | 217 | ✓ |
| COUNT product_lots | 149 | 149 | ✓ |
| SUM products.quantity_in_stock | 4,617,076.08 | 4,617,076.08 | ✓ |
| SUM product_lots.quantity | 185,382.00 | 185,382.00 | ✓ |
| Products com stock > 0 sem lotes | 122 | 122 | ✓ |
| Products com divergência | 125 | 125 | ✓ |
| Checksum products | 3e4ee40eb2ab1b6f6fbbc0bec44bca6d | 3e4ee40eb2ab1b6f6fbbc0bec44bca6d | ✓ |
| Checksum product_lots | 9a606414b40c0420705ddbc6a4a4660b | 9a606414b40c0420705ddbc6a4a4660b | ✓ |

**PRE = POST confirmado. Nenhum dado foi alterado.**

---

## U. STATUS

**PASS**

Auditoria concluída com sucesso. Todos os writers de `products.quantity_in_stock` e `product_lots.quantity` foram mapeados. `useProducts` e `returnProducts` confirmados como código morto (zero callers). As 3 RPCs atômicas de operations não chamam essas funções. 4 writers diretos perigosos identificados (`syncProductTotalToDb`, `updateProduct`, `updateLot`, `deleteLot`) que podem sobrescrever resultados das RPCs via read-modify-write com valor absoluto. Baseline read-only confirmado: PRE = POST.

**Próximos passos recomendados:**
1. Remover `useProducts` e `returnProducts` (código morto)
2. Decidir regra de negócio: lote altera `quantity_in_stock` ou não?
3. Implementar RPCs atômicas para lotes (create/update/delete)

**Nenhuma alteração foi feita. READ-ONLY ABSOLUTO mantido.**
