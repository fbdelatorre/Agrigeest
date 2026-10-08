# ETAPA 3L — MICROAUDITORIA: MÚLTIPLOS LOTES POR PRODUTO + PRESERVAÇÃO DE HISTÓRICO

**Data:** 2026-10-08
**Modo:** READ-ONLY ABSOLUTO — nenhuma alteração foi feita.

---

## A. ESTRUTURA products_used ATUAL

### TypeScript (src/types/index.ts linha 65-70)

```typescript
export interface ProductUsage {
  productId: string;
  quantity: number;
  dose?: number;       // Dose per hectare/acre
  lotId?: string;      // Which lot was used (single, optional)
}
```

### Estrutura JSON real no banco (exemplos anônimos)

```json
[
  {"dose": 599, "quantity": 269550, "productId": "71aa4888-..."},
  {"dose": 689, "quantity": 810264, "productId": "db9438b7-..."}
]
```

### Campos atuais

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| productId | string (uuid) | Sim | Identificador do produto |
| quantity | number | Sim | Quantidade total utilizada |
| dose | number | Não | Dose por hectare/área |
| lotId | string (uuid) | Não | Lote único (opcional) |

### Estatísticas de uso atual

| Métrica | Valor |
|---|---|
| Total de items products_used | 1,459 |
| Items COM lotId | 6 |
| Items SEM lotId | 1,453 |
| Produtos distintos referenciados | 128 |

**Observação:** Quase todos os items (99,6%) não têm lotId. Apenas 6 items usam lotId no histórico.

---

## B. CONSUMIDORES FRONTEND DE products_used

| Arquivo | Função | Operação |
|---|---|---|
| `types/index.ts` | `ProductUsage` interface | Define a estrutura |
| `components/operations/OperationForm.tsx` | `handleProductChange`, `addProductUsage`, `removeProductUsage`, `validate`, `handleSubmit` | Lê, escreve, mapeia, valida |
| `components/operations/OperationCard.tsx` | `getProductsUsedText`, `calculateOperationCost` | Exibe (nome + lote), calcula custo |
| `components/farmMap/AreaDetailPanel.tsx` | `lastOperationProducts` (linha 41-47) | Exibe último produto aplicado |
| `pages/operation/OperationCreate.tsx` | `handleSubmit` | Envia para addOperation → RPC |
| `pages/operation/OperationEdit.tsx` | `handleSubmit` | Envia para updateOperation → RPC |
| `pages/operation/OperationsList.tsx` | Apenas usa OperationCard | Indireto |
| `pages/Statistics.tsx` | `productUsage` aggregation (linha 67-79) | Agrega quantity e custo por productId |
| `pages/Planning.tsx` | `productsUsed: []` (linha 69) | Inicializa vazio |
| `pages/area/AreaDetail.tsx` | Custo (linha 124-128) + exportação PDF (linha 305-329) | Calcula custo, gera PDF |
| `pages/inventory/InventoryList.tsx` | Verifica se produto é usado (linha 86) | `op.productsUsed.some(u => u.productId === id)` |
| `context/AppContext.tsx` | `addOperation`, `updateOperation`, `deleteOperation` | Envia products_used para RPCs |

---

## C. FLUXO OPERATIONFORM

### Seleção do produto

1. Usuário clica "Adicionar Produto" → `addProductUsage()` → cria `{ productId: '', quantity: '0', dose: '0' }`
2. Usuário busca produto via `ProductSearchInput` → chama `handleProductChange(index, 'productId', value)`
3. `handleProductChange` para `productId`:
   - Define `lotId: ''` (reset para sem lote)
   - Mantém dose existente ou '0'
   - Recalcula `quantity = dose × operationSize`

### Cálculo dose → quantity

- `handleProductChange` para `dose`: `quantity = parseNumber(dose) × operationSize`
- `handleChange` para `areaId` ou `operationSize`: recalcula `quantity = dose × newSize` para TODOS os produtos

### Seleção de lote

- Dropdown `<select>` lista lotes do produto via `getLotsByProductId(product.id)`
- `handleProductChange(index, 'lotId', value)` → define lotId
- **UM LOTE POR PRODUTO** — não há como adicionar segundo lote ao mesmo produto

### Submit

1. `validate()` — verifica productId, quantity > 0, dose >= 0
2. `handleSubmit` — converte strings para números: `{ ...usage, quantity: parseNumber(...), dose: parseNumber(...) }`
3. `onSubmit(submissionData)` → OperationCreate/OperationEdit
4. → `addOperation`/`updateOperation` em AppContext
5. → RPC `create_operation_with_stock`/`update_operation_with_stock`

### Onde existe lotId único

- **OperationForm.tsx linha 137-140:** `handleProductChange(index, 'lotId', value)` — um lotId por item
- **OperationForm.tsx linha 573:** `<select value={usage.lotId || ''}>` — dropdown único
- **OperationForm.tsx linha 131:** ao trocar produto, `lotId: ''` (reseta)
- **types/index.ts linha 69:** `lotId?: string` — campo escalar único

---

## D. CÁLCULO DO VOLUME

### Regra principal

```
quantity = dose × operationSize
```

### Quando é recalculado

1. Mudança de área (`areaId`) → se operationSize não editável, usa `selectedArea.size`
2. Mudança de operationSize → recalcula todos
3. Mudança de dose → recalcula o item
4. Toggle "Editar tamanho" → recalcula todos

### quantity manual

Sim. O usuário pode editar diretamente o campo "Quantidade Total" via `handleProductChange(index, 'quantity', value)`. Isso sobrescreve o cálculo dose×area. Não há validação que força `quantity == dose × area` no submit.

### Tipos de operação e unidades

- `quantity` e `dose` usam a unidade do produto (`product.unit`)
- Para `colheita`: existe `yieldPerHectare` (kg/ha) — separado de products_used
- Para `plantio`: existe `seedsPerHectare` — separado de products_used
- Products_used é genérico para todos os tipos

### Veredito

`quantity = dose × operationSize` é o comportamento padrão, mas **não é invariante** — o usuário pode sobrescrever manualmente.

---

## E. DESIGN A — NOVO ARRAY lotAllocations

### Estrutura proposta

```json
{
  "productId": "X",
  "quantity": 180,
  "dose": 1.5,
  "lotId": "A",
  "lotAllocations": [
    {"lotId": "A", "quantity": 70},
    {"lotId": "B", "quantity": 80},
    {"lotId": null, "quantity": 30}
  ]
}
```

### Vantagens

- Produto aparece uma vez → custo calculado uma vez (180 × preço)
- Estatísticas corretas: `productUsage[productId].quantity += 180` (não 3×)
- Dose preservada uma vez
- Compatível com UI atual (um card por produto)
- `lotId` antigo preservado para histórico (backward compat)
- RPC pode validar `SUM(lotAllocations.quantity) == quantity`

### Riscos

- Todos os consumidores precisam verificar `lotAllocations` vs `lotId`
- OperaçãoCard precisa exibir múltiplos lotes
- RPCs precisam nova lógica para iterar lotAllocations
- Edição precisa de UI para múltiplas linhas de allocation
- 309 operações históricas NÃO terão `lotAllocations` → RPCs devem detectar ausência e tratar como formato antigo

### Compatibilidade histórica

- Se `lotAllocations` ausente: tratar como formato antigo (lotId único ou sem lote)
- Se `lotAllocations` presente: usar novo formato
- **Sem backfill necessário**

---

## F. DESIGN B — REPETIR PRODUCT NO JSON

### Estrutura proposta

```json
[
  {"productId": "X", "quantity": 70, "dose": 1.5, "lotId": "A"},
  {"productId": "X", "quantity": 80, "dose": 1.5, "lotId": "B"},
  {"productId": "X", "quantity": 30, "dose": 1.5, "lotId": null}
]
```

### Vantagens

- Estrutura JSON não muda (mesmo formato ProductUsage[])
- RPCs já agregam por productId e por lotId — menos mudança
- Backward compatible automaticamente

### Riscos CRÍTICOS

- **Custo duplicado:** OperationCard linha 89-93: `totalCost += usage.quantity * product.price` iterando sobre CADA item. Se produto X aparece 3×, custo = (70+80+30) × preço = 180 × preço. **OK neste caso**, mas se o cálculo fosse por item distinto, seria triplicado.
- **Estatísticas:** Statistics.tsx linha 78: `stats.productUsage[product.id].quantity += usage.quantity` — agregaria 70+80+30=180. **OK** porque soma por productId.
- **OperationForm:** ao editar, mostraria 3 linhas para o mesmo produto. Usuário pode alterar uma dose sem atualizar as outras → inconsistência.
- **Dose inconsistente:** cada item pode ter dose diferente, quebrando a semântica de "dose é do produto inteiro".
- **UI:** OperationForm mostra uma linha por item. Para o mesmo produto repetido, o usuário vê 3 linhas idênticas exceto lotId. Confuso.
- **Edição:** remover uma linha remove uma allocation parcial, mas o usuário pode pensar que removeu o produto inteiro.
- **OperationCard:** `getProductsUsedText` (linha 76) mapeia cada item → mostraria "70 L de X (Lote A), 80 L de X (Lote B), 30 L de X" em vez de "180 L de X (Lotes A, B + sem lote)".
- **Validação:** não há validação de que `SUM(items do mesmo produto) == dose × area`. O usuário poderia criar items com quantidades arbitrárias.

### Veredito

**DESIGN B é mais arriscado** para custos, estatísticas, UI e edição. Parece simples no JSON, mas quebra a semântica de "um produto = uma entrada".

---

## G. DESIGN C — ESTRUTURA ALTERNATIVA

### Proposta: lotIds[] com quantidades inline

```json
{
  "productId": "X",
  "quantity": 180,
  "dose": 1.5,
  "lotDetails": [
    {"lotId": "A", "quantity": 70},
    {"lotId": "B", "quantity": 80}
  ],
  "untrackedQuantity": 30
}
```

### Diferença vs Design A

- Separa explicitamente tracked (lotDetails) e untracked (untrackedQuantity)
- `lotId` antigo não é preservado (ou é derivado do primeiro item de lotDetails)
- RPC pode validar: `SUM(lotDetails.quantity) + untrackedQuantity == quantity`

### Vantagens

- Mais explícito para validação untracked
- Não mistura tracked e untracked no mesmo array

### Riscos

- Mais complexo para UI (dois conceitos: lotes e untracked)
- Menos flexível se regras mudarem
- `untrackedQuantity` como campo separado é redundante (pode ser derivado)

### Veredito

Design C é uma variação de A com mais rigidez. Design A (com `lotId: null` em lotAllocations) é mais uniforme e flexível.

---

## H. COMPATIBILIDADE HISTÓRICA

### 309 operações existentes

- 1,453 items sem lotId
- 6 items com lotId
- Nenhum item com lotAllocations

### Estratégia sem backfill

**Sim, é possível suportar ambos formatos simultaneamente:**

1. **RPCs:** detectar `lotAllocations` no JSON. Se ausente, usar lógica atual (lotId único). Se presente, usar nova lógica.
2. **Frontend:** ao editar operação histórica, OperationForm inicializa com formato antigo. Se usuário não adicionar allocations, salva no formato antigo. Se adicionar, salva no novo.
3. **Display:** OperationCard verifica `lotAllocations` para exibir múltiplos lotes. Se ausente, usa `lotId` único.
4. **Estatísticas:** agregam por `productId` independente do formato.

### Preferência

Backward compatibility sem backfill é viável e recomendada. As 309 operações históricas podem permanecer no formato antigo indefinidamente.

---

## I. IMPACTO CREATE RPC

### Lógica atual

```
agrega quantity por productId
agrega quantity por lotId (quando presente)
agrega quantity sem lotId por productId
valida untracked_stock >= usage_without_lot
deduct product stock
deduct lot stock
```

### Mudança necessária para Design A

1. Iterar `lotAllocations[]` em vez de `lotId` escalar
2. Agregar por productId (total = quantity do item)
3. Agregar por lotId (de cada allocation)
4. Agregar sem lote (allocations com lotId null)
5. Validar: `SUM(lotAllocations.quantity) == item.quantity` (opcional mas recomendado)
6. Validar untracked: `untracked >= SUM(allocations com lotId null)`
7. Deduct product stock por productId (total do item)
8. Deduct lot stock por allocation

### Complexidade

**Moderada.** A estrutura de agregação já existe. A mudança principal é iterar lotAllocations em vez de lotId escalar. A validação untracked de ETAPA 3K já separa com/sem lote.

### Compatibilidade

Se `lotAllocations` ausente: usar lógica atual (lotId único). Se presente: usar nova lógica. Isso pode ser feito com um `IF v_item ? 'lotAllocations'` no loop.

---

## J. IMPACTO UPDATE RPC

### Lógica atual

```
build old_prod_agg, new_prod_agg (por productId)
build old_lot_agg, new_lot_agg (por lotId)
build old_prod_no_lot_agg, new_prod_no_lot_agg
validate untracked delta
compute deltas por productId
compute deltas por lotId
apply deltas
```

### Mudança necessária para Design A

1. Build old aggregates a partir de lotAllocations (se presente) ou lotId (se antigo)
2. Build new aggregates a partir de lotAllocations (se presente) ou lotId (se antigo)
3. Delta computation se mantém igual — apenas a fonte dos dados muda
4. Validar untracked delta: mesma lógica, mas dados vem de lotAllocations
5. Trocas A→C: delta_lot negativo para A, positivo para C → já funciona por lotId
6. Troca sem lote → com lote: delta_no_lot negativo, delta_lot positivo → já funciona

### Exemplos

**A70+B80+null30 → A50+B100+null30:**
- Delta lot A: 50-70 = -20 (devolve 20 ao lote A)
- Delta lot B: 100-80 = +20 (consome 20 do lote B)
- Delta produto: 180-180 = 0
- Delta sem lote: 30-30 = 0

**A70+B80+null30 → A70+C80+null30:**
- Delta lot A: 0
- Delta lot B: 0-80 = -80 (devolve 80 ao lote B)
- Delta lot C: 80-0 = +80 (consome 80 do lote C)
- Delta produto: 0
- Delta sem lote: 0

**Lote único antigo → múltiplos lotes novos:**
- OLD: {productId: X, quantity: 100, lotId: A}
- NEW: {productId: X, quantity: 100, lotAllocations: [{A, 70}, {B, 30}]}
- RPC detecta formato antigo no OLD e novo no NEW
- Delta lot A: 70-100 = -30 (devolve 30 ao lote A)
- Delta lot B: 30-0 = +30 (consome 30 do lote B)
- Delta produto: 0
- Tratar como conversão automática

### Complexidade

**Alta.** A detecção de formato antigo vs novo no OLD e NEW adiciona ramificação. Mas a estrutura delta subjacente não muda.

---

## K. IMPACTO DELETE RPC

### Comportamento atual

```
Para cada item em products_used:
  devolve quantity ao products.quantity_in_stock
  se lotId presente: devolve quantity ao product_lots.quantity
```

### Para Design A

Se `lotAllocations` presente:
```
Para cada item:
  devolve item.quantity ao products.quantity_in_stock
  Para cada allocation:
    se lotId != null: devolve allocation.quantity ao product_lots.quantity
```

Se `lotAllocations` ausente: comportamento atual.

### Complexidade

**Baixa.** Delete apenas devolve. A nova estrutura só muda a fonte dos lotIds e quantidades.

### Compatibilidade

Formato histórico antigo deve continuar funcionando sem alteração. Delete precisa apenas de um branch para detectar `lotAllocations`.

---

## L. ORPHAN PRODUCT PRESERVATION

### Fluxo completo

1. `operation.productsUsed` (inclui productId inexistente) → armazenado no estado `operations` em AppContext
2. `OperationEdit` linha 20: `const operation = operations.find(op => op.id === id)`
3. `OperationEdit` linha 117: `<OperationForm initialData={operation} ... />`
4. `OperationForm` linha 46-50: `productsUsed: (initialData.productsUsed || []).map(usage => ({ ...usage, ... }))`
   - **Copia TODOS os items**, incluindo orphans, preservando `productId`, `quantity`, `dose`, `lotId`
5. `OperationForm` linha 551: `const product = products.find(p => p.id === usage.productId)`
   - Se product não existe: `product = undefined`
   - Dropdown de lotes: `availableLots = []` (vazio)
   - ProductSearchInput mostra productId mas não encontra nome
6. `handleSubmit` linha 277: envia todos os items incluindo orphan
7. `updateOperation` → RPC: OLD products_used contém orphan, NEW também

### Respostas

**a)** Sim, todos os productsUsed são copiados para o estado inicial, inclusive productId inexistente. O spread `{ ...usage }` preserva todos os campos.

**b)** NÃO existe filter/map/find que elimina o item. O `.map()` na linha 46 copia todos. O `products.find()` na linha 551 retorna `undefined` mas não remove o item do array.

**c)** O orphan NÃO fica oculto — ele aparece na UI como uma linha do formulário com o productId (UUID) mostrado no ProductSearchInput, sem nome do produto, sem lotes disponíveis. O usuário VÊ a linha.

**d)** Sim. Alterar SOMENTE description e salvar mantém exatamente `productId`, `quantity`, `dose`, `lotId` do orphan. O `handleSubmit` envia todos os items inalterados. O RPC recebe `p_products_used` com o orphan intacto. O delta é zero para o orphan → nenhuma alteração de estoque.

**e)** NÃO existe normalização que remove/transforma campos. O `handleSubmit` apenas converte strings para números (`parseNumber`). O `...usage` spread preserva campos extras.

**f)** Sim. O usuário pode remover o orphan clicando no botão X (`removeProductUsage`). O item é removido do array. No submit, o RPC detecta `old_qty > 0, new_qty = 0` → permite sem devolver estoque (regra ETAPA 3E).

### STATUS: **PASS**

---

## M. ORPHAN LOT PRESERVATION

### Cenário

Product existe, mas lotId histórico não existe mais em product_lots.

### Comportamento atual no OperationForm

1. `availableLots = getLotsByProductId(product.id)` → retorna apenas lotes atuais
2. `selectedLot = availableLots.find(l => l.id === usage.lotId)` → `undefined` (lote não existe mais)
3. Dropdown `<select value={usage.lotId || ''}>` → nenhum `<option>` corresponde → browser mostra vazio
4. `lotId` permanece no estado (`usage.lotId` não é alterado)
5. No submit, `lotId` é enviado para a RPC

### Comportamento na RPC update

- `v_old_lot_agg` contém o lotId histórico
- `v_new_lot_agg` contém o mesmo lotId (se não foi alterado)
- `v_lot_exists = false` (lote não existe)
- Delta = 0 → `NULL` (nada acontece) — preservado

### Se usuário tentar alterar

- Trocar lotId para um lote existente: delta_lot negativo para lote antigo (não existe → `HISTORICAL_LOT_UNAVAILABLE` se quantity mudou, ou `NULL` se mesma quantity), delta_lot positivo para lote novo
- Remover lotId: delta_lot negativo para lote antigo (não existe → permite se new=0)

### OperationEdit

- Preserva lotId no estado
- Não remove silenciosamente
- Não bloqueia
- Exibe: dropdown mostra opção "Selecione um lote" (vazio), mas lotId permanece no estado

### Risco para múltiplas allocations

Se Design A for implementado, lotAllocations com lotId histórico inexistente deve ser tratado da mesma forma: preservado no OLD, não disponível no dropdown, delta zero permite edição sem alteração.

### STATUS: **PASS** (preservado, mas UI não exibe o lote histórico — o usuário não sabe que aquele produto tinha um lote)

---

## N. TODOS CALLERS updateOperation

### Busca completa

```
src/pages/operation/OperationEdit.tsx:29: await updateOperation(id, operationData);
```

**Apenas UM caller:** `OperationEdit.tsx`.

### Payload enviado

```typescript
await updateOperation(id, operationData);
// operationData: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>
```

`operationData` é o `submissionData` de OperationForm, que inclui:
- `productsUsed: ProductUsage[]` (sempre completo, nunca parcial)
- Todos os outros campos do formulário

### AppContext.updateOperation (linha 453-500)

```typescript
p_products_used: updatedData.productsUsed ?? (originalOperation.productsUsed || []),
```

Se `updatedData.productsUsed` for `undefined`, usa o original. Se for `[]`, envia vazio.

---

## O. RISCO PAYLOAD PARCIAL

### Risco: `p_products_used DEFAULT NULL`

Na RPC: `p_products_used jsonb DEFAULT NULL`. Se receber NULL, `v_products := COALESCE(p_products_used, '[]'::jsonb)` → vazio.

No AppContext linha 471:
```typescript
p_products_used: updatedData.productsUsed ?? (originalOperation.productsUsed || []),
```

O `??` só ativa se `productsUsed` for `null` ou `undefined`. Se for `[]` (vazio), envia `[]`.

### Risco real

OperationForm sempre envia `productsUsed` no submissionData (linha 277). Mesmo que vazio, envia `[]`. O `??` fallback protege contra `undefined`.

**Risco BAIXO.** O único cenário de perda seria se um caller enviasse `productsUsed: undefined` explicitamente, o que não acontece.

---

## P. UI PROPOSTA

### Fluxo desejado

```
Produto X                          [×]
Dose: 1,5 L/ha
Necessário: 180 L

Origem do estoque:
  Lote A  | Disponível: 100 L  | Usar: [70]  L
  Lote B  | Disponível: 150 L  | Usar: [80]  L
  Sem lote | Disponível: 50 L   | Usar: [30]  L
  
  Total distribuído: 180 / 180 L  ✓

  [+ Adicionar origem]
```

### Validação de submit

- `SUM(allocations) == quantity` (obrigatório)
- Cada allocation com lotId: `quantity <= lot.quantity`
- Allocation sem lotId: `SUM(no-lot allocations) <= untracked_stock`

### Compatibilidade com OperationForm atual

- Manter um card por produto (como hoje)
- Dentro do card, substituir dropdown único de lote por seção "Origem do estoque" com múltiplas linhas
- Adicionar validação de total distribuído
- Botão "Adicionar origem" adiciona nova linha de allocation

### Esforço

Moderado. A estrutura do formulário já tem um card por produto. A mudança é interna ao card: substituir um `<select>` por um sub-array de allocations.

---

## Q. AUTO DISTRIBUIÇÃO FEFO

### Dados disponíveis

`product_lots` tem:
- `id`, `product_id`, `lot_number`, `quantity`, `expiration_date`

`expiration_date` é opcional (pode ser NULL).

### Viabilidade

**Sim, os dados atuais permitem auto-distribuição FEFO:**

1. Filtrar lotes do produto com `quantity > 0`
2. Ordenar por `expiration_date ASC NULLS LAST` (FEFO)
3. Iterar lotes alocando `min(remaining, lot.quantity)` até cobrir `quantity`
4. Se lotes insuficientes, alocar restante como "sem lote" (se untracked suficiente)

### Risco

- Lotes sem `expiration_date` ficam por último (não há data de vencimento)
- Se `SUM(lots) + untracked < quantity`: bloquear com erro

### Não implementar agora

Confirmado: apenas avaliação de viabilidade. Implementação futura.

---

## R. CUSTO

### OperationCard.calculateOperationCost (linha 85-101)

```typescript
operation.productsUsed.forEach(usage => {
  const product = getProductById(usage.productId);
  if (product) {
    totalCost += usage.quantity * product.price;
  }
});
```

### Impacto Design A

Produto X com quantity=180 → uma entrada → `180 × price` → **correto**.

### Impacto Design B

Produto X com 3 entradas (70+80+30) → `(70+80+30) × price = 180 × price` → **correto** (soma por item).

### AreaDetail.tsx (linha 124-128)

```typescript
operation.productsUsed.forEach(usage => {
  const product = getProductById(usage.productId);
  if (product) {
    operationCost += usage.quantity * product.price;
  }
});
```

Mesma lógica: soma por item. Design A e B produzem o mesmo custo total.

### Veredito

**Design A é mais seguro** porque o custo é calculado uma vez sobre `quantity=180`. Design B funciona por coincidência (soma), mas se um cálculo futuro usar `items.length` ou média, quebraria.

---

## S. ESTATÍSTICAS

### Statistics.tsx (linha 67-79)

```typescript
operation.productsUsed.forEach(usage => {
  if (!stats.productUsage[product.id]) {
    stats.productUsage[product.id] = { quantity: 0, totalCost: 0 };
  }
  stats.productUsage[product.id].quantity += usage.quantity;
  stats.productUsage[product.id].totalCost += usage.quantity * product.price;
});
```

Agrega por `product.id` somando `quantity`.

### Impacto Design A

Produto X: uma entrada com quantity=180 → `productUsage[X].quantity = 180`. **Correto.**

### Impacto Design B

Produto X: 3 entradas (70+80+30) → `productUsage[X].quantity = 70+80+30 = 180`. **Correto** (por coincidência).

### Risco Design B

Se estatística adicionar `count++` por item, contaria 3 em vez de 1. Não acontece hoje, mas é frágil.

### AreaDetailPanel.tsx (linha 41-47)

```typescript
return lastOperation.productsUsed.map(usage => ({
  name: product?.name,
  quantity: usage.quantity,
  dose: usage.dose,
}));
```

Design B: retornaria 3 entradas para o mesmo produto na lista de "última aplicação". **Incorreto para UI.**

### Veredito

**Design A é superior** para estatísticas e display.

---

## T. RECOMENDAÇÃO FINAL

### **DESIGN A: um produto + lotAllocations[]**

---

## U. JUSTIFICATIVA

| Critério | Design A | Design B | Design C |
|---|---|---|---|
| Compatibilidade histórica | ✓ (lotAllocations ausente → formato antigo) | ✓ (mesmo formato) | ✓ (lógica similar a A) |
| Menor migration | ✓ (apenas CREATE OR REPLACE RPCs) | ✓ (menor mudança JSON) | Similar a A |
| Menor risco | ✓ (produto único, sem duplicação) | ✗ (dose inconsistente, UI confusa) | ✓ mas mais rígido |
| RPC atomicidade | ✓ (valida SUM allocations = quantity) | ✓ (já agrega por productId) | ✓ |
| Facilidade de edição | ✓ (um card por produto com sub-allocations) | ✗ (múltiplas linhas do mesmo produto) | ✓ |
| Custos corretos | ✓ (uma entrada × preço) | ✓ por coincidência (frágil) | ✓ |
| Estatísticas corretas | ✓ (uma entrada por productId) | ✓ por coincidência (frágil) | ✓ |
| Orphan preservation | ✓ (orphan mantém lotId, não usa lotAllocations) | ✓ | ✓ |
| Futuro inventory ledger | ✓ (allocations são rastreabilidade) | ✗ (entries duplicadas confusas) | ✓ |
| UI | ✓ (agrupado, intuitivo) | ✗ (linhas duplicadas) | ✓ |

### Design A vence em todos os critérios exceto "menor mudança JSON" (Design B é mais simples no JSON, mas paga caro na UI e na semântica).

---

## V. BASELINE PRE/POST

| Métrica | PRE | POST |
|---|---|---|
| COUNT operations | 309 | 309 |
| COUNT products | 217 | 217 |
| COUNT product_lots | 149 | 149 |
| Checksum operations | aefe8e7fb0f7fead075d1dc023671da0 | aefe8e7fb0f7fead075d1dc023671da0 |
| Checksum products | 2d51473e452266210423f2bc28d48994 | 2d51473e452266210423f2bc28d48994 |
| Checksum product_lots | aa14636c5c95e8bb58be4e432dc3ee63 | aa14636c5c95e8bb58be4e432dc3ee63 |

**PRE = POST confirmado. Nenhuma alteração foi feita.**

---

## W. 48 POLICIES / 6 RPCs

| Item | Status |
|---|---|
| RLS policies | 48 intactas |
| create_operation_with_stock | SECURITY DEFINER ✓ |
| update_operation_with_stock | SECURITY DEFINER ✓ |
| delete_operation_with_stock | SECURITY DEFINER ✓ |
| create_product_lot | SECURITY DEFINER ✓ |
| update_product_lot | SECURITY DEFINER ✓ |
| delete_product_lot | SECURITY DEFINER ✓ |

Nenhuma alteração.

---

## X. RISCOS

| # | Risco | Severidade | Nota |
|---|---|---|---|
| 1 | OperationForm não exibe nome do lote histórico (orphan lot) | P3 | UI mostra dropdown vazio; lotId preservado no estado |
| 2 | ProductSearchInput não mostra nome para orphan product | P3 | UUID é exibido; usuário vê linha mas sem nome |
| 3 | quantity manual pode divergir de dose × area | P3 | Comportamento existente; não é novo |
| 4 | 3 produtos em excesso histórico (tracked > stock) | P2 | Bloqueado para sem-lot por ETAPA 3K |
| 5 | Design B quebraria AreaDetailPanel (3 entries para 1 produto) | P2 | Motivo adicional para Design A |

---

## Y. STATUS

**PASS**

Todos os critérios de auditoria atendidos:
- Estrutura products_used mapeada ✓
- Todos os consumidores identificados ✓
- Fluxo OperationForm traçado ✓
- Cálculo quantity/dose confirmado ✓
- Designs A, B, C avaliados ✓
- Design A recomendado ✓
- Compatibilidade histórica confirmada (sem backfill) ✓
- Impacto RPCs analisado (não implementado) ✓
- Orphan product preservation: PASS ✓
- Orphan lot preservation: PASS ✓
- Apenas 1 caller de updateOperation ✓
- Risco de payload parcial: BAIXO ✓
- Custo e estatísticas auditados ✓
- Baseline PRE = POST ✓
- 48 policies / 6 RPCs intactas ✓
- Nenhuma alteração feita ✓
