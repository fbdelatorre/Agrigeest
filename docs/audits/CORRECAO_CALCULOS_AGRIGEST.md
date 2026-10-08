# CORREÇÃO DE CÁLCULOS AGRIGEST

**Data:** 2026-10-08  
**Status:** PASS  
**Build:** PASS

---

## 1. RESUMO EXECUTIVO

Foram corrigidos os 4 problemas CRÍTICOS e IMPORTANTES identificados na auditoria:

| # | Problema | Severidade | Correção | Status |
|---|----------|-----------|----------|--------|
| 1 | Preço histórico usava preço atual do produto | CRÍTICO | Snapshot financeiro na criação | PASS |
| 2 | Produto deletado → custo = 0 silencioso | CRÍTICO | Helper distingue known/unknown/estimated | PASS |
| 3 | Custo/ha divergente entre telas | IMPORTANTE | Padronizado para operationSize \|\| area.size | PASS |
| 4 | NaN quando produto não encontrado | IMPORTANTE | Helper retorna cost=0 + source=unknown | PASS |

**Backlog (não corrigido, conforme instrução):**
- Área por tipo potencialmente duplicada em Statistics (BAIXO)
- Math.round vs Math.floor em dias até vencimento (BAIXO)

---

## 2. SNAPSHOT FINANCEIRO

### Campos adicionados ao ProductUsage

```typescript
productNameSnapshot?: string;
unitSnapshot?: string;
unitPriceSnapshot?: number;
```

Campos opcionais — backward compatible com as 309 operações legacy.

### RPC create_operation_with_stock

- Após validação e dedução de estoque, antes do INSERT
- Loop sobre products_used: SELECT name, unit, price FROM products
- Enriquece cada item JSONB com os 3 campos de snapshot
- O INSERT persiste o array enriquecido como products_used
- Snapshots são autoritativos do banco, não do frontend

### RPC update_operation_with_stock

3 regras implementadas:

**A) Item existente com snapshot, productId unchanged:**
- Preserva snapshots do OLD products_used
- Não reprifica com preço atual

**B) Item legacy (sem snapshot), productId unchanged:**
- Preserva ausência de snapshot
- Não converte silenciosamente para preço atual

**C) Novo productId ou item novo:**
- SELECT name, unit, price FROM products
- Se produto existe: gera snapshots frescos
- Se produto não existe (historical): mantém item sem snapshots

---

## 3. HELPER CENTRALIZADO

Arquivo: `src/utils/costCalculation.ts`

### Funções

```typescript
calculateUsageCost(usage, getProductById) → UsageCostResult
calculateOperationCost(operation, getProductById) → OperationCostResult
getEffectiveArea(operation, area) → number
calculateCostPerHectare(operation, area, getProductById) → { costPerHectare, hasUnknownCost, hasEstimatedCost }
```

### Regras de custo

| Condição | Source | Cost | Comportamento |
|----------|--------|------|---------------|
| unitPriceSnapshot existe e é número válido | `snapshot` | qty × snapshot | Custo histórico exato |
| Sem snapshot, produto existe | `fallback` | qty × product.price | Custo estimado, marcado |
| Sem snapshot, produto não existe | `unknown` | 0 | Custo indisponível, não gera NaN |

### Resultado estruturado

```typescript
interface OperationCostResult {
  knownCost: number;        // soma de snapshot + fallback
  hasUnknownCost: boolean;  // algum item com source=unknown
  hasEstimatedCost: boolean;// algum item com source=fallback
  perUsage: UsageCostResult[];
}
```

---

## 4. CUSTO POR HECTARE PADRONIZADO

Fórmula única em todas as telas:

```
effectiveArea = operation.operationSize > 0 ? operation.operationSize : area.size
costPerHectare = knownCost / effectiveArea
```

Aplicado em:
- OperationCard (via `calculateCostPerHectare`)
- AreaDetail (via `getEffectiveArea` + `calculateOperationCost`)

Antes: AreaDetail dividia sempre por `area.size`. Agora: divide por `operationSize` quando > 0.

---

## 5. UI PARA CUSTO LEGACY

### OperationCard
- Custo normal exibido quando total > 0
- Badge âmbar "Custo estimado pelo preço atual" quando hasEstimatedCost
- Badge cinza "Custo histórico indisponível" quando hasUnknownCost
- Seção de custo exibida mesmo quando hasUnknownCost (mesmo se total = 0)

### AreaDetail
- Mesmas indicações no painel de custos
- PDF mantém formatCurrency(totalSpent) — total reflete knownCost apenas

### Statistics
- Badge âmbar/cinza no rodapé da página
- "Total parcial" quando hasUnknownCost
- "Custo estimado" quando hasEstimatedCost

---

## 6. STATISTICS

- Usa `calculateUsageCost` por item
- Produto removido: source=unknown, hasUnknownCost=true, custo não somado
- Produto existente sem snapshot: source=fallback, hasEstimatedCost=true, custo somado
- Produto com snapshot: source=snapshot, custo somado normalmente
- UI exibe aviso no rodapé quando há custo estimado ou indisponível

---

## 7. SEGURANÇA — REVOKE FROM PUBLIC

4 RPCs tinham EXECUTE aberto para PUBLIC:

| RPC | Status |
|-----|--------|
| add_inventory_stock | REVOKE FROM PUBLIC + GRANT TO authenticated |
| adjust_inventory_stock | REVOKE FROM PUBLIC + GRANT TO authenticated |
| archive_product_lot | REVOKE FROM PUBLIC + GRANT TO authenticated |
| check_inventory_reconciliation | REVOKE FROM PUBLIC + GRANT TO authenticated |

Lógica das funções não foi alterada.

---

## 8. MIGRAÇÕES APLICADAS

| Migration | Descrição |
|-----------|-----------|
| add_snapshot_to_create_operation | CREATE OR REPLACE com snapshot enriquecido |
| add_snapshot_to_update_operation | CREATE OR REPLACE com preservação/adição de snapshots |
| revoke_public_from_ledger_rpcs | REVOKE EXECUTE FROM PUBLIC em 4 RPCs |

---

## 9. VERIFICAÇÃO DE NÃO-ALTERAÇÃO HISTÓRICA

| Verificação | Status |
|-------------|--------|
| 309 operações existentes não foram alteradas | PASS — nenhuma migration toca em rows existentes |
| products_used das operações existentes inalterado | PASS — CREATE OR REPLACE só afeta novas chamadas |
| Nenhum unitPriceSnapshot adicionado retroativamente | PASS |
| Nenhum productNameSnapshot adicionado retroativamente | PASS |
| Nenhum unitSnapshot adicionado retroativamente | PASS |
| Estoque não foi alterado | PASS |
| Lotes não foram alterados | PASS |
| inventory_movements inalterado | PASS |

---

## 10. TESTES LÓGICOS

| Cenário | Resultado Esperado | Status |
|----------|-------------------|--------|
| Nova operação: price 50, qty 100 → snapshot 50 → cost = 5000 | cost = 5000 | PASS |
| Depois product.price muda para 80 → operação continua cost = 5000 | Snapshot preservado | PASS |
| Produto muda de nome → operação mantém productNameSnapshot | Snapshot preservado | PASS |
| Produto muda de unidade → operação mantém unitSnapshot | Snapshot preservado | PASS |
| Legacy sem snapshot + produto existente → fallback marcado estimado | source=fallback, hasEstimatedCost=true | PASS |
| Legacy sem snapshot + produto removido → sem NaN, sem custo zero falso | source=unknown, cost=0, hasUnknownCost=true | PASS |
| operationSize 50, area.size 100, cost 5000 → cost/ha = 100 | 5000/50 = 100 | PASS |

---

## 11. ARQUIVOS MODIFICADOS

| Arquivo | Mudança |
|---------|---------|
| src/types/index.ts | 3 campos opcionais em ProductUsage |
| src/utils/costCalculation.ts | NOVO — helper centralizado |
| src/components/operations/OperationCard.tsx | Usa helper, custo/ha consistente, UI legacy |
| src/pages/area/AreaDetail.tsx | Usa helper, custo/ha consistente, UI legacy |
| src/pages/Statistics.tsx | Usa helper, UI aviso custo parcial/estimado |

---

## 12. BACKLOG

| Item | Severidade | Nota |
|------|-----------|------|
| Área por tipo em Statistics soma area.size uma vez por operação | BAIXO | Pode inflar "área acumulada por tipo" |
| Math.round vs Math.floor em dias até vencimento | BAIXO | Diferença máxima de 1 dia |
