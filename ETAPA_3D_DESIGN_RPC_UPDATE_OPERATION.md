# ETAPA 3D — DESIGN DO UPDATE OPERATION ATÔMICO

**Data:** 2026-10-07
**READ-ONLY ABSOLUTO — Nenhuma alteração no banco nem no frontend.**

---

## A. Payload UPDATE Atual

`updateOperation(id, updatedData)` envia um UPDATE parcial para `operations`:

| Campo Frontend | Campo DB | Enviado quando |
|---|---|---|
| areaId | area_id | updatedData.areaId !== undefined |
| type | type | updatedData.type !== undefined |
| startDate | start_date | updatedData.startDate !== undefined |
| endDate | end_date | updatedData.endDate !== undefined |
| nextOperationDate | next_operation_date | updatedData.nextOperationDate !== undefined |
| description | description | updatedData.description !== undefined |
| operatedBy | operated_by | updatedData.operatedBy !== undefined |
| notes | notes | updatedData.notes !== undefined |
| productsUsed | products_used | updatedData.productsUsed !== undefined |
| operationSize | operation_size | updatedData.operationSize !== undefined |
| yieldPerHectare | yield_per_hectare | updatedData.yieldPerHectare !== undefined |
| seedsPerHectare | seeds_per_hectare | updatedData.seedsPerHectare !== undefined |

**NUNCA enviados no UPDATE:** id, user_id, institution_id, created_at.

Antes do UPDATE, se `productsUsed` mudou (comparado por `JSON.stringify`):
1. `returnProducts(oldProducts)` — devolve OLD ao estoque
2. `useProducts(newProducts)` — baixa NEW do estoque

Ambos usam read-modify-write com React state: `product.quantityInStock ± usage.quantity`.

---

## B. Campos Editáveis

OperationForm permite editar todos os campos listados em A. O formulário envia um objeto `Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>` completo.

A futura RPC deve aceitar todos esses campos. NÃO aceitar: id, user_id, institution_id, created_at.

---

## C. Authorization Model

Modelo institucional (ETAPA 2C): `operations.institution_id = caller_institution_id`. Qualquer membro da instituição pode editar operações da instituição. NÃO exigir `user_id = auth.uid()`.

**Compatível com ETAPA 2: SIM.**

---

## D. Lock da Operation

A RPC deve obter lock antes de calcular delta:

```sql
SELECT products_used, institution_id, user_id
FROM public.operations
WHERE id = p_operation_id AND institution_id = v_institution_id
FOR UPDATE;
```

Isso impede que duas edições simultâneas leiam o mesmo OLD e calculem deltas conflitantes.

**Confirmado: SIM.** `FOR UPDATE` adquire row lock até commit/rollback.

---

## E. OLD Source of Truth

OLD `products_used` deve vir exclusivamente da row bloqueada em D. NUNCA do React state.

**Compatível: SIM.** O frontend envia apenas o NEW; o banco tem o OLD.

---

## F. Produtos Históricos Excluídos

| Métrica | Valor |
|---|---|
| Items órfãos (productId não existe em products) | 501 |
| Operations com pelo menos 1 productId órfão | 158 de 309 (51%) |

### Comportamento por Cenário

| Cenário | Descrição | Resultado |
|---|---|---|
| A | OLD órfão, NEW mantém mesmo productId+quantity | PERMITIR. Não tocar estoque. Permitir mudança de dose. |
| B | OLD órfão, NEW remove item | PERMITIR. Não devolver estoque. |
| C | OLD órfão, NEW mantém productId mas altera quantity | BLOQUEAR: HISTORICAL_PRODUCT_UNAVAILABLE |
| D | NEW introduz productId inexistente | BLOQUEAR: PRODUCT_NOT_FOUND_OR_FORBIDDEN |
| E | OLD órfão X removido + NEW produto atual Y adicionado | PERMITIR. X: não devolver. Y: baixar normalmente. |
| F | OLD órfão X qty=100 dose=2, NEW X qty=100 dose=2.5 | PERMITIR. Alterar dose. Não tocar estoque. |

**Edições não relacionadas a produtos** (description, dates, notes, area, season, operated_by) devem continuar permitidas mesmo com produtos órfãos no histórico.

---

## G. Delta Products

Para produtos que AINDA EXISTEM em `public.products`:

```
delta(productId) = new_total(productId) - old_total(productId)
```

| delta | Ação |
|---|---|
| > 0 | `SET quantity_in_stock = quantity_in_stock - delta WHERE quantity_in_stock >= delta` |
| < 0 | `SET quantity_in_stock = quantity_in_stock + ABS(delta)` |
| = 0 | Não tocar |

Para produtos históricos excluídos: seguir regras da SEÇÃO F.

**Semanticamente equivalente ao fluxo atual para produtos válidos? SIM.** O fluxo atual faz `returnProducts(OLD)` (+quantity) depois `useProducts(NEW)` (-quantity), resultado líquido = `-delta`.

---

## H. Delta Lots

Delta independente por `productId + lotId`:

```
delta_lot(lotId) = new_total(lotId) - old_total(lotId)
```

| delta | Ação |
|---|---|
| > 0 | `SET quantity = quantity - delta WHERE quantity >= delta` |
| < 0 | `SET quantity = quantity + ABS(delta)` |
| = 0 | Não tocar |

Troca de lote (A→B, mesma quantidade): lote A delta=-50 (devolver), lote B delta=+50 (baixar). Produto total delta=0.

**Semanticamente desejado: SIM.**

---

## I. Sem lotId → Com lotId

OLD sem lotId, NEW com lotId para o mesmo produto:
- Produto: delta = new_total - old_total (se quantity igual, delta=0, não tocar products)
- Lote: NEW lotId não estava no OLD → delta_lot = +new_quantity (baixar do lote)
- Não inventar devolução para lote antigo (lote antigo era desconhecido)

**Semântica recomendada:** baixar apenas o lote NEW. Não devolver para lote imaginário.

OLD com lotId, NEW sem lotId:
- Lote OLD: delta_lot = -old_quantity (devolver)
- Produto: delta de produto normal

---

## J. Duplicatas

OLD e NEW devem ser agregados por `productId` (e por `lotId` quando presente) antes de calcular delta. Histórico: 0 duplicatas, mas o design deve prever.

---

## K. Validações NEW

Aplicar as mesmas validações da RPC CREATE:
- productId: UUID válido, não-vazio
- quantity: > 0
- dose: >= 0
- lotId: opcional (ausente/NULL/"" = sem lote)

**Para produtos que existem em `products`:** validar institution_id.
**Para productId histórico do OLD mantido no NEW:** validar apenas se quantity permanece igual (cenário A/F). Se quantity mudou → HISTORICAL_PRODUCT_UNAVAILABLE.

**NEW nunca pode introduzir productId inexistente.** Exceção: productId histórico que já estava no OLD.

---

## L. Area e Season

- Se `p_area_id` diferente do atual: validar `areas.id AND areas.institution_id`.
- Se `p_season_id` diferente e non-NULL: validar `seasons.id AND seasons.institution_id`.
- Nunca confiar em institution_id do frontend.

---

## M. user_id / institution_id

- `user_id`: PRESERVAR o valor existente. NÃO substituir por `auth.uid()`. O user_id original representa quem criou a operação.
- `institution_id`: PRESERVAR o valor existente (que já foi validado como pertencente à instituição do caller via WHERE clause).
- A RPC NÃO recebe user_id nem institution_id como parâmetros.

**Compatível com comportamento atual: SIM.** O UPDATE atual não envia user_id nem institution_id.

---

## N. Ordem / Locks

1. Lock operation row (`FOR UPDATE`)
2. Agregar OLD e NEW por productId
3. Agregar OLD e NEW por lotId
4. Para produtos atuais com delta != 0: UPDATE em ordem determinística por UUID
5. Para lotes atuais com delta != 0: UPDATE em ordem determinística por UUID
6. UPDATE operation row

Os UPDATEs atômicos (`SET quantity = quantity - delta WHERE quantity >= delta`) já adquirem row locks. Lock adicional explícito nos products/lots não é necessário — o `FOR UPDATE` na operation impede edits concorrentes da mesma operação, e os row locks nos products serializam concorrência entre operações diferentes.

---

## O. Concorrência CREATE × UPDATE

CREATE consumindo produto X (delta=+50) simultaneamente com UPDATE aumentando consumo de X (delta=+20):

Ambos executam `SET quantity_in_stock = quantity_in_stock - delta WHERE quantity_in_stock >= delta`.

PostgreSQL serializa os dois UPDATEs na mesma row de products. O segundo UPDATE vê o resultado do primeiro. Se estoque era 60: CREATE baixa 50 (estoque=10), UPDATE tenta baixar 20 → 10 < 20 → INSUFFICIENT_PRODUCT_STOCK.

CREATE consumindo + UPDATE devolvendo: CREATE baixa 50 (estoque 100→50), UPDATE devolve 20 (estoque 50→70). Serialized corretamente.

**PostgreSQL serializa corretamente: SIM.**

---

## P. Concorrência com Lot Management

`addLot`/`updateLot`/`deleteLot`/`syncProductTotalToDb` ainda sobrescreve `quantity_in_stock` com `SUM(lots)`.

A UPDATE RPC ficará sujeita ao mesmo P1 da CREATE RPC: se `recomputeProductQuantity` executar concorrentemente, pode sobrescrever o delta aplicado pela RPC.

**RISCO P1 PERMANECE.** Documentado, não corrigido nesta etapa.

---

## Q. Mudanças Sem Impacto em Estoque

Se OLD e NEW têm os mesmos valores agregados por `productId + lotId + quantity`:
- Nenhum UPDATE em products
- Nenhum UPDATE em product_lots
- Apenas UPDATE em operations (description, dates, notes, etc.)

Comparação deve ser por valores agregados (productId, lotId, quantity), não por `JSON.stringify` nem ordem dos itens.

Produtos históricos excluídos com mesma quantity: não impedir o UPDATE.

---

## R. Dose

Se somente dose muda e quantity permanece igual: estoque NÃO deve mudar.

**Confirmado pelo comportamento atual: SIM.** `returnProducts` e `useProducts` operam apenas com `quantity`, nunca com `dose`.

Isso vale também para produto histórico excluído (cenário F).

---

## S. Operação [] Transitions

| OLD | NEW | Comportamento |
|---|---|---|
| Produtos atuais | [] | Devolver estoque de todos os produtos atuais |
| [] | Produtos atuais | Baixar estoque normalmente |
| [] | [] | Não tocar estoque |
| Produto histórico excluído | [] | Permitir. Não devolver estoque do produto excluído |
| Histórico + atual | [] | Histórico: não devolver. Atual: devolver normalmente |

---

## T. Categorias de Erro

| Categoria | Quando |
|---|---|
| AUTH_REQUIRED | auth.uid() IS NULL |
| PROFILE_NOT_FOUND | user_profiles não encontrado |
| PROFILE_NO_INSTITUTION | institution_id IS NULL |
| OPERATION_NOT_FOUND_OR_FORBIDDEN | operation não existe ou não pertence à instituição |
| AREA_NOT_FOUND_OR_FORBIDDEN | area não existe ou não pertence à instituição |
| SEASON_NOT_FOUND_OR_FORBIDDEN | season não existe ou não pertence à instituição |
| PRODUCT_NOT_FOUND_OR_FORBIDDEN | NEW introduz productId inexistente |
| LOT_NOT_FOUND_OR_MISMATCH | lotId não existe, mismatch, ou instituição errada |
| INSUFFICIENT_PRODUCT_STOCK | delta > 0 e estoque insuficiente |
| INSUFFICIENT_LOT_STOCK | delta_lot > 0 e lote insuficiente |
| INVALID_PRODUCTS_USED | formato inválido |
| HISTORICAL_PRODUCT_UNAVAILABLE | tentativa de alterar quantity de produto histórico excluído |
| HISTORICAL_LOT_UNAVAILABLE | tentativa de alterar quantity de lote histórico excluído |

**Falta alguma?** HISTORICAL_LOT_UNAVAILABLE pode ser desnecessária se orphan_lot_refs = 0 (confirmado). Mas deve existir para robustez futura. Nenhuma categoria essencial falta.

---

## U. Frontend Futuro

`updateOperation` ONLINE muda de:

```
returnProducts(old) -> useProducts(new) -> UPDATE operations
```

para:

```
supabase.rpc('update_operation_with_stock', payload) -> loadProducts() + loadProductLots()
```

Payload: `p_operation_id` + todos os campos editáveis (A) + `p_products_used`.

Frontend NÃO deve validar se produto histórico existe. A RPC é a fonte definitiva.

---

## V. Offline

UPDATE offline continuará com fluxo antigo (React state, localStorage, sync posterior). **Risco conhecido permanece: SIM.** Será tratado em etapa própria.

---

## W. Impacto Futuro da Exclusão Física de Produtos

158 de 309 operações (51%) contêm pelo menos um productId órfão. Quando produtos zerados são excluídos:
- Nome, preço, unidade e categoria ficam indisponíveis para exibição
- OperationCard já lida com isso mostrando "Produto desconhecido"
- Custo histórico depende de `products.price` que não existe mais

**Problema documentado.** Arquivamento de produtos (soft delete ou snapshot de preço) será analisado em etapa futura. NÃO resolver agora.

---

## X. Baseline PRE/POST

| Tabela | Count | Checksum |
|---|---|---|
| operations | 309 | fbf1eb1ad43d46437c87f0d98206cf75 |
| products | 217 | 3032ef9556d76996095e99876a36a38a |
| product_lots | 149 | bc7eaba42133b78cafd863cf8b2ee4fb |

- SUM products.quantity_in_stock = 4.617.076,08
- SUM product_lots.quantity = 185.382,00

PRE = POST. Nenhuma alteração.

---

## Y. Desenho Recomendado da Futura RPC (20 passos)

```
FUNCTION update_operation_with_stock(
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
) RETURNS public.operations
```

1. Verificar `auth.uid()`. Se NULL → AUTH_REQUIRED.
2. Buscar `institution_id` em user_profiles. Se profile não existe → PROFILE_NOT_FOUND. Se NULL → PROFILE_NO_INSTITUTION.
3. Lock operation: `SELECT products_used, user_id FROM operations WHERE id = p_operation_id AND institution_id = v_institution FOR UPDATE`. Se não encontra → OPERATION_NOT_FOUND_OR_FORBIDDEN.
4. Se `p_area_id` difere do atual: validar area. Se não → AREA_NOT_FOUND_OR_FORBIDDEN.
5. Se `p_season_id` non-NULL e difere do atual: validar season. Se não → SEASON_NOT_FOUND_OR_FORBIDDEN.
6. Parse `p_products_used` (NEW) e `old_products_used` (da row lockada) como arrays. Se não-array → INVALID_PRODUCTS_USED.
7. Validar cada item NEW: productId válido, quantity > 0, dose >= 0, lotId opcional. Se inválido → INVALID_PRODUCTS_USED.
8. Agregar NEW por productId → `new_prod_agg`. Agregar NEW por lotId → `new_lot_agg`.
9. Agregar OLD por productId → `old_prod_agg`. Agregar OLD por lotId → `old_lot_agg`.
10. Para cada productId em (NEW ∪ OLD):
    - Se produto existe em products E institution_id = v_institution:
      - delta = new_total - old_total
      - Se delta > 0: UPDATE atomic (baixar). Se falhar → INSUFFICIENT_PRODUCT_STOCK.
      - Se delta < 0: UPDATE atomic (devolver).
      - Se delta = 0: não tocar.
    - Se produto NÃO existe (histórico excluído):
      - Se new_total = old_total: permitir (não tocar estoque).
      - Se new_total != old_total: → HISTORICAL_PRODUCT_UNAVAILABLE.
11. Para cada lotId em (NEW ∪ OLD):
    - Se lote existe em product_lots E product_id corresponde E institution via products = v_institution:
      - delta_lot = new_total - old_total
      - Se delta_lot > 0: UPDATE atomic (baixar). Se falhar → INSUFFICIENT_LOT_STOCK.
      - Se delta_lot < 0: UPDATE atomic (devolver).
      - Se delta_lot = 0: não tocar.
    - Se lote NÃO existe (histórico excluído):
      - Se new_total = old_total: permitir.
      - Se new_total != old_total: → HISTORICAL_LOT_UNAVAILABLE.
12. Processar products em ordem determinística por UUID.
13. Processar lots em ordem determinística por UUID.
14. UPDATE operations SET (camros editáveis) WHERE id = p_operation_id. NÃO alterar user_id, institution_id, created_at.
15. SET updated_at = now() (ou trigger existente).
16. products_used = p_products_used (NEW original, não agregado).
17. RETURNING * INTO v_operation.
18. Qualquer RAISE EXCEPTION → rollback automático de todos os UPDATEs de estoque + operation.
19. Retornar v_operation.
20. Frontend: loadProducts() + loadProductLots() para sincronizar state.

---

## Z. Riscos / Divergências

1. **158/309 operações (51%)** têm produtos órfãos. A RPC deve suportar edição dessas operações sem bloquear indevidamente.
2. **Lot management P1** permanece: `recomputeProductQuantity` pode sobrescrever deltas da RPC.
3. **JSON.stringify** no frontend para detectar mudanças é frágil (ordem de chaves). A RPC compara por valores agregados, não por string.
4. **OLD sem lotId → NEW com lotId:** baixar apenas lote NEW, não devolver lote imaginário. Comportamento diferente do fluxo atual (que devolve OLD sem lote e baixa NEW com lote). Divergência aceitável pois OLD sem lote nunca tocou lotes.
5. **returnProducts ignora produtos inexistentes** (L924-925: `if (!product) return`). A RPC deve replicar: produtos históricos não devolvem estoque.

---

## AA. STATUS: PASS

Design completo. PRE = POST. Nenhuma alteração no banco nem no frontend. 51% das operações dependem da compatibilidade histórica — design suporta todos os cenários A-F.

STOP.
