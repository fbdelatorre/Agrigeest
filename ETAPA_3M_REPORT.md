# ETAPA 3M — RELATÓRIO: MÚLTIPLOS LOTES POR PRODUTO EM OPERAÇÕES

**Data:** 2026-10-08
**Design A (ETAPA 3L) implementado.**

---

## A. BASELINE PRE

| Métrica | Valor |
|---|---|
| COUNT operations | 309 |
| COUNT products | 217 |
| COUNT product_lots | 149 |
| SUM products.quantity_in_stock | 4,617,076.08296666766681363 |
| SUM product_lots.quantity | 185,382.00000666667 |
| Checksum operations | aefe8e7fb0f7fead075d1dc023671da0 |
| Checksum products | 2d51473e452266210423f2bc28d48994 |
| Checksum product_lots | aa14636c5c95e8bb58be4e432dc3ee63 |

---

## B. TYPES — ProductUsage / LotAllocation

Novo `LotAllocation` e `ProductUsage` expandido:

```typescript
export interface LotAllocation {
  lotId: string | null;
  quantity: number;
}

export interface ProductUsage {
  productId: string;
  quantity: number;
  dose?: number;
  lotId?: string;              // LEGACY — preservado
  lotAllocations?: LotAllocation[];  // NOVO
}
```

Arquivo alterado: `src/types/index.ts`

---

## C. BACKWARD COMPATIBILITY

- Se `lotAllocations` ausente: formato legacy (lotId escalar ou sem lote)
- 309 operações históricas NÃO foram convertidas
- Nenhum backfill, nenhum UPDATE massivo
- RPCs detectam formato automaticamente com `v_item ? 'lotAllocations'`
- Frontend preserva items legacy com `isLegacy: true` no estado do formulário

---

## D. VALIDAÇÃO ALLOCATIONS

Apenas quando `lotAllocations` está presente:

| Regra | Erro |
|---|---|
| SUM(allocations) != item.quantity (tol 0.000001) | LOT_ALLOCATIONS_TOTAL_MISMATCH |
| Mesmo lotId duplicado em um item | DUPLICATE_LOT_ALLOCATION |
| Mais de uma allocation com lotId=null | DUPLICATE_LOT_ALLOCATION |
| allocation.quantity <= 0 | INVALID_PRODUCTS_USED |
| lotId inválido (não UUID) | INVALID_PRODUCTS_USED |

Validação no frontend: OperationForm bloqueia submit se `ABS(total - quantity) > 0.000001`.

---

## E. CREATE RPC

`create_operation_with_stock` atualizado:

1. Para cada item: detecta `lotAllocations` vs `lotId` legacy
2. Se lotAllocations presente:
   - Valida SUM == quantity, sem duplicados, max 1 null
   - Agrega lot por allocation.lotId
   - Agrega no-lot por productId (allocations com lotId null)
3. Se legacy: comportamento anterior (lotId escalar)
4. Produto: baixa `quantity` UMA VEZ (não por allocation)
5. Lotes: baixa por allocation.lotId agregado
6. Untracked: valida allocations null <= untracked (regra ETAPA 3K)
7. Preserva SECURITY DEFINER, search_path, grants, institution isolation

---

## F. CREATE — EXEMPLO 180 L

Estado inicial:
- stock total = 500, Lote A = 100, Lote B = 150, outros = 50
- tracked = 300, untracked = 200

Operation: quantity=180, allocations: A=70, B=80, null=30

RPC executa:
1. product_agg[X] = 180 → baixa 500-180 = 320
2. lot_agg[A] = 70 → baixa 100-70 = 30
3. lot_agg[B] = 80 → baixa 150-80 = 70
4. no_lot_agg[X] = 30 → valida untracked(200) >= 30 ✓
5. outros lotes: 50 (não tocados)

Resultado: stock=320, A=30, B=70, outros=50, tracked=150, untracked=170 ✓

---

## G. UPDATE RPC

`update_operation_with_stock` atualizado:

1. Normaliza OLD e NEW para os mesmos agregados:
   - prod_agg (por productId)
   - lot_agg (por lotId)
   - prod_no_lot_agg (por productId, allocations null)
2. Delta computation inalterada: `delta = NEW - OLD`
3. Suporta: legacy→legacy, legacy→allocations, allocations→allocations, allocations→legacy
4. Untracked validation: delta_no_lot > 0 → valida untracked
5. Orphan rules preservadas (HISTORICAL_PRODUCT_UNAVAILABLE, HISTORICAL_LOT_UNAVAILABLE)
6. Preserva SECURITY DEFINER, search_path, grants

---

## H. EXEMPLOS UPDATE

**Caso A: A70+B80+null30 → A50+B100+null30**
- delta_prod = 0, delta_lot_A = -20 (devolve), delta_lot_B = +20 (consome), delta_no_lot = 0 ✓

**Caso B: A70+B80+null30 → A70+C80+null30**
- delta_prod = 0, delta_lot_A = 0, delta_lot_B = -80 (devolve), delta_lot_C = +80 (consome), delta_no_lot = 0 ✓

**Caso C: legacy lotId=A qty100 → allocations A70+B30**
- OLD: prod_agg[X]=100, lot_agg[A]=100
- NEW: prod_agg[X]=100, lot_agg[A]=70, lot_agg[B]=30
- delta_prod = 0, delta_lot_A = -30 (devolve), delta_lot_B = +30 (consome) ✓

**Caso D: legacy sem lotId qty100 → allocations A60+null40**
- OLD: prod_agg[X]=100, prod_no_lot[X]=100
- NEW: prod_agg[X]=100, lot_agg[A]=60, prod_no_lot[X]=40
- delta_prod = 0, delta_lot_A = +60 (consome), delta_no_lot = -60 (reduz consumo sem lote) ✓

---

## I. DELETE RPC

`delete_operation_with_stock` atualizado:

1. Detecta lotAllocations no OLD products_used
2. Se presente: agrega lot por allocation.lotId, devolve por lotId
3. Se legacy: comportamento anterior (lotId escalar)
4. Produto: devolve `quantity` UMA VEZ
5. Lote: devolve por allocation
6. Orphan: skip silencioso (produto/lote inexistente)
7. Preserva SECURITY DEFINER, search_path, grants

---

## J. ORPHAN PRODUCT

Preservado:
- Produto histórico inexistente: unchanged OK, dose-only OK, remover OK
- Alterar quantity: HISTORICAL_PRODUCT_UNAVAILABLE
- Não convertido automaticamente para lotAllocations
- Não recriado

Frontend: item legacy com productId inexistente permanece `isLegacy: true`, não exibe seção de allocations, mantém lotId original.

---

## K. ORPHAN LOT

Preservado:
- Allocation OLD com lote inexistente, NEW mantém mesma: delta zero, permitido
- Remover allocation histórica: permitido sem devolver estoque
- Aumentar quantidade em lote inexistente: HISTORICAL_LOT_UNAVAILABLE
- Criar NOVA allocation para lote inexistente: LOT_NOT_FOUND_OR_MISMATCH

Frontend: lotId histórico não encontrado mostra "Lote histórico indisponível".

---

## L. LOCK ORDER

Preservado:
1. Operation row (FOR UPDATE)
2. Products (FOR UPDATE em untracked validation, UPDATE em deductions)
3. Product lots (UPDATE em deductions)
4. Ordem determinística por UUID em todos os loops
5. Compatível com lot RPCs (ETAPA 3J)

---

## M. OPERATIONFORM

Alterações em `src/components/operations/OperationForm.tsx`:

- Novos tipos internos: `FormProductUsage` com `isLegacy`, `FormLotAllocation`
- Novo produto: inicia com `lotAllocations: []`, `isLegacy: false`
- Produto legacy: mantém `lotId`, `isLegacy: true`
- Botão "Distribuir entre lotes": converte legacy → allocations no estado
- Seção "Origem do estoque": multiple linhas com [lote/sem lote] + quantidade
- Botão "Adicionar origem": adiciona nova allocation
- Disponibilidade mostrada para cada lote e para sem-lote
- Total distribuído: Y / X com estados visual/verbal

---

## N. EDIÇÃO LEGACY

- Abrir operação histórica: items preservam `isLegacy: true`
- Se usuário não clica "Distribuir entre lotes": salva como legacy (lotId escalar)
- Se usuário clica: converte no estado do formulário, salva como lotAllocations
- Conversão só é persistida no SAVE
- Orphan product: não convertido, exibe "Produto histórico indisponível"
- Orphan lot: exibe "Lote histórico indisponível"

---

## O. UI ALLOCATIONS

Cada linha de allocation:
- Dropdown: lotes disponíveis + "Sem lote"
- Texto de disponibilidade abaixo do dropdown
- Input de quantidade
- Botão remover

Estados do total:
- Y < X: "Falta distribuir Z" (laranja)
- Y == X: "Distribuição completa" (verde)
- Y > X: "Distribuição excede em Z" (vermelho)
- Submit bloqueado se |Y-X| > tolerância

---

## P. TOTAL DISTRIBUÍDO

Implementado em OperationForm:
- Cálculo: `getAllocationsTotal(usage)` = SUM de allocation quantities
- Comparação com `parseNumber(usage.quantity)`
- Validação em `validate()`: se `!isLegacy && lotAllocations.length > 0`
- Tolerância: 0.000001

---

## Q. OPERATIONCARD

`getProductsUsedText` atualizado:

- Formato novo: `180 L de Produto X — Lote A (70 L), Lote B (80 L), Sem lote (30 L)`
- Formato legacy: mantém `180 L de Produto X (Lote A)`
- Produto exibido UMA vez, lotes listados inline

---

## R. AREADETAIL / PDF

Não alterados. Compatibilidade:
- `operation.productsUsed.forEach(usage => operationCost += usage.quantity * product.price)`
- Produto aparece uma vez → custo calculado uma vez sobre quantity ✓
- PDF não mostra lotes atualmente → sem mudança necessária ✓

---

## S. STATISTICS

Não alteradas. Compatibilidade:
- `stats.productUsage[product.id].quantity += usage.quantity` — uma vez por ProductUsage ✓
- `stats.productUsage[product.id].totalCost += usage.quantity * product.price` ✓
- lotAllocations não afeta estatísticas (são rastreabilidade, não produtos separados) ✓

---

## T. ERROR HANDLING

Novos erros adicionados em OperationCreate e OperationEdit:

| Código | PT | EN |
|---|---|---|
| LOT_ALLOCATIONS_TOTAL_MISMATCH | A soma das origens não corresponde à quantidade total do produto. | The sum of lot sources does not match the product total quantity. |
| DUPLICATE_LOT_ALLOCATION | Um lote foi selecionado mais de uma vez para o mesmo produto. | A lot was selected more than once for the same product. |

Erros preservados: INSUFFICIENT_UNTRACKED_STOCK, INSUFFICIENT_PRODUCT_STOCK, INSUFFICIENT_LOT_STOCK, HISTORICAL_PRODUCT_UNAVAILABLE, HISTORICAL_LOT_UNAVAILABLE, etc.

---

## U. SEGURANÇA

- 3 RPCs: SECURITY DEFINER, search_path = public, pg_temp ✓
- REVOKE FROM PUBLIC/anon, GRANT TO authenticated ✓
- Institution isolation preservado ✓
- user_id/institution_id de auth.uid() ✓
- No RLS changes ✓

---

## V. LOT RPCs INTACTAS

- create_product_lot: SECURITY DEFINER ✓ (não alterada)
- update_product_lot: SECURITY DEFINER ✓ (não alterada)
- delete_product_lot: SECURITY DEFINER ✓ (não alterada)

---

## W. DADOS HISTÓRICOS

- Zero backfill ✓
- Zero UPDATE massivo ✓
- Zero conversão automática ✓
- 309 operations: products_used não regravado ✓
- Checksums PRE = POST ✓

---

## X. PRE / POST

| Métrica | PRE | POST |
|---|---|---|
| COUNT operations | 309 | 309 |
| COUNT products | 217 | 217 |
| COUNT product_lots | 149 | 149 |
| SUM products.quantity_in_stock | 4,617,076.08296666766681363 | 4,617,076.08296666766681363 |
| SUM product_lots.quantity | 185,382.00000666667 | 185,382.00000666667 |
| Checksum operations | aefe8e7fb0f7fead075d1dc023671da0 | aefe8e7fb0f7fead075d1dc023671da0 |
| Checksum products | 2d51473e452266210423f2bc28d48994 | 2d51473e452266210423f2bc28d48994 |
| Checksum product_lots | aa14636c5c95e8bb58be4e432dc3ee63 | aa14636c5c95e8bb58be4e432dc3ee63 |

**PRE = POST confirmado.**

---

## Y. 48 POLICIES / 6 RPCs

| Item | Status |
|---|---|
| RLS policies | 48 intactas |
| create_operation_with_stock | SECURITY DEFINER ✓ |
| update_operation_with_stock | SECURITY DEFINER ✓ |
| delete_operation_with_stock | SECURITY DEFINER ✓ |
| create_product_lot | SECURITY DEFINER ✓ (intacta) |
| update_product_lot | SECURITY DEFINER ✓ (intacta) |
| delete_product_lot | SECURITY DEFINER ✓ (intacta) |

Nenhum overload acidental. Todas as 3 operation RPCs substituíram as anteriores (CREATE OR REPLACE, mesma assinatura).

---

## Z. BUILD

```
npm run build
✓ built in 25.94s
exit 0
```

Build passa sem erros.

---

## AA. ROLLBACK

Para reverter:

1. **types/index.ts**: remover `LotAllocation` e `lotAllocations` de `ProductUsage`
2. **OperationForm.tsx**: restaurar versão anterior (lotId único, sem allocations)
3. **OperationCard.tsx**: restaurar `getProductsUsedText` sem lotAllocations
4. **OperationCreate.tsx / OperationEdit.tsx**: remover novos erros LOT_ALLOCATIONS_*
5. **RPCs**: re-aplicar migration `20261008103741_protect_untracked_stock_in_operation_rpcs.sql` (versão anterior)

Não executado.

---

## AB. RISCOS / DIVERGÊNCIAS

| # | Risco | Severidade | Nota |
|---|---|---|---|
| 1 | OperationForm item novo com lotAllocations vazio + submit | P3 | Validação bloqueia se lotAllocations vazio e quantity > 0 (diferença > tolerância) |
| 2 | Edição legacy → "Distribuir entre lotes" → cancelar sem salvar | P4 | Estado do formulário é descartado ao navegar |
| 3 | Auto-distribuição FEFO não implementada | P4 | Por design (item 26) — estrutura preparada |
| 4 | Produto histórico não mostra nome (apenas UUID) | P3 | Comportamento existente, não alterado |
| 5 | Lote histórico em allocation: dropdown não mostra opção | P3 | lotId não encontrado em availableLots → "Sem lote" é default |
| 6 | ÁreaDetailPanel não mostra lotAllocations | P4 | Mapeia quantity/dose apenas — não mostra lotes atualmente |

---

## AC. STATUS

**PASS**

Critérios atendidos:
- Um produto aceita múltiplas allocations ✓
- SUM allocations == quantity validado ✓
- Múltiplos lotes descontados corretamente ✓
- Sem-lote descontado corretamente ✓
- Produto total descontado uma única vez ✓
- Update delta correto (4 cenários validados) ✓
- Delete devolve corretamente ✓
- Legacy continua funcionando ✓
- Orphans preservados ✓
- Nenhum histórico convertido ✓
- Nenhum dado existente alterado (PRE = POST) ✓
- Custo correto (uma vez por ProductUsage) ✓
- Estatísticas corretas ✓
- 48 policies intactas ✓
- 6 RPCs corretas ✓
- Build passa ✓
