# AUDITORIA DE CÁLCULOS AGRIGEST

**Data:** 2026-10-08  
**Tipo:** READ-ONLY — nenhuma alteração foi feita  
**Status:** REVIEW

---

## 1. MAPEAMENTO DE CÁLCULOS

Total de cálculos identificados: **68**

Distribuição por domínio:

| Domínio | Cálculos | Arquivos |
|---------|----------|----------|
| Operações (custo, dose, área) | 39 | OperationCard, OperationForm, OperationsList, OperationCreate, OperationEdit |
| Dashboard (área, estoque, gráficos) | 18 | Dashboard.tsx |
| Estatísticas (custo, área, produto) | 14 | Statistics.tsx |
| Estoque/Inventário (quantidade, lotes, preço) | 25 | ProductCard, ProductForm, LotManager, StockActions, InventoryList, ProductEdit, ProductCreate |
| Áreas (custo/ha, PDF) | 8 | AreaDetail, AreaCard, AreaForm, GeometryManager |
| Manutenção (custo total, horas) | 7 | MachineryCard, MachineryDetail, MaintenanceList, MaintenanceForm, MaintenanceCard |
| RPCs SQL (estoque, ledger, reconciliação) | 12 | migrations/*.sql |

---

## 2. CUSTOS DE OPERAÇÕES

### Fórmula dominante (3 telas)

| Tela | Arquivo | Fórmula | Unidade |
|------|---------|---------|---------|
| OperationCard | OperationCard.tsx → calculateOperationCost | `Σ(usage.quantity × product.price)` | BRL |
| AreaDetail | AreaDetail.tsx → calculateCosts | `Σ(usage.quantity × product.price)` | BRL |
| Statistics | Statistics.tsx → productUsage | `Σ(usage.quantity × product.price)` | BRL |

### Custo por hectare

| Tela | Fórmula | Denominador |
|------|---------|-------------|
| OperationCard | `totalCost / areaSize` | `operation.operationSize > 0 ? operation.operationSize : area.size` |
| AreaDetail | `Σ(operationCost / area.size)` | **area.size** (área total da gleba, NÃO operationSize) |

**ATENÇÃO:** OperationCard divide pelo operationSize (área aplicada), AreaDetail divide pela área total da gleba. Ver §12.

### Operações com múltiplos lotes

O OperationForm suporta `lotAllocations[]` por produto. A quantidade total é distribuída via FEFO (greedy: `Math.min(lot.quantity, remaining)`). O custo usa `usage.quantity × product.price` independente do lote — o preço é do produto, não do lote.

### Operações canceladas

O AppContext carrega operações com `.neq('status', 'cancelled')`. Operações canceladas são excluídas de todas as listas, dashboards e estatísticas. **PASS.**

---

## 3. PREÇO HISTÓRICO — ANÁLISE CRÍTICA

**Resposta direta: Uma operação antiga usa o PREÇO ATUAL do cadastro do produto.**

### Demonstração pelo código

**OperationCard.tsx (linha ~calculateOperationCost):**
```typescript
const product = getProductById(usage.productId);
if (product) {
  operationCost += usage.quantity * product.price;
}
```

**AreaDetail.tsx (linha 126-128):**
```typescript
const product = getProductById(usage.productId);
if (product) {
  operationCost += usage.quantity * product.price;
}
```

**Statistics.tsx (productUsage):**
```typescript
stats.productUsage[product.id].totalCost += usage.quantity * product.price;
```

Em todos os 3 casos, `product.price` é buscado em tempo real via `getProductById()` do AppContext, que reflete o estado atual de `products[].price` carregado do Supabase.

**Nenhum preço é congelado no momento da operação.** A operação armazena apenas `productId`, `quantity`, `dose` e `lotAllocations` em `products_used` (JSONB). O preço não é persistido na operação.

### Classificação: **CRÍTICO**

Se o preço de um produto for alterado hoje, o custo de todas as operações históricas que usam esse produto muda retroativamente. O histórico financeiro é mutável.

### Produto deletado

Se o produto é deletado, `getProductById()` retorna `undefined` e o custo da operação cai para **0** silenciosamente. Nenhum warning é exibido. O custo histórico desaparece sem aviso.

### Classificação: **CRÍTICO**

---

## 4. UNIDADES

### Unidades existentes

`products.unit` é um text livre — qualquer valor é aceito. O sistema não valida nem converte unidades. Valores observados no banco: kg, L, unidade, saco, tonelada, mL (presumido).

### Soma de unidades incompatíveis

**Statistics.tsx → productUsage:** soma `usage.quantity` por produto. Como cada produto tem sua própria unidade, a soma é dentro do mesmo produto — **PASS**.

**No entanto**, o `formatCurrency(usage.totalCost)` é por produto, não agregado entre produtos de unidades diferentes. **PASS.**

### Conversões implícitas

**Nenhuma encontrada.** O sistema não converte kg↔tonelada, L↔mL, etc. Se um produto está em "kg" e outro em "tonelada", eles são tratados como entidades separadas sem conversão. **PASS** (sem risco, pois não há agregação cross-unidade).

---

## 5. DOSE E ÁREA

### Fórmula: quantity = dose × area

Implementada em **5 locais** no OperationForm:

| Local | Trigger | Fórmula |
|-------|---------|---------|
| handleChange (areaId) | Troca de área | `parseNumber(usage.dose) × newSize` |
| handleChange (operationSize) | Edição de tamanho | `parseNumber(usage.dose) × newSize` |
| handleProductChange (productId) | Troca de produto | `parseNumber(dose) × operationSize` |
| handleProductChange (dose) | Edição de dose | `parseNumber(formattedValue) × operationSize` |
| checkbox onChange (edit size) | Toggle edição tamanho | `parseNumber(usage.dose) × selectedArea.size` |

### Quando quantity é digitada diretamente

O usuário pode editar o campo "Total Quantity" manualmente após a auto-computação. Neste caso, a relação dose×área é quebrada — o sistema não revalida. **PASS** (comportamento esperado: flexibilidade operacional).

### Arredondamento e precisão

- `parseNumber` usa `Number(value.replace(',', '.'))` — converte vírgula decimal brasileira
- Validação de allocation mismatch usa tolerância `1e-6` — **PASS**
- `toFixed(1)` em Statistics para área; `toFixed(2)` em distribution status
- Nenhum arredondamento intermediário em cálculos de custo — usa precisão nativa JS (double)

---

## 6. ESTOQUE

### Cálculos frontend

| Tela | Cálculo | Fórmula | Compatível com modelo? |
|------|---------|---------|----------------------|
| LotManager | trackedStock | `lots.reduce((sum, l) => sum + l.quantity, 0)` | SIM |
| LotManager | untrackedStock | `product.quantityInStock - trackedStock` | SIM |
| StockActions | trackedStock | `lots.reduce((sum, l) => sum + l.quantity, 0)` | SIM |
| StockActions | untrackedStock | `product.quantityInStock - trackedStock` | SIM |
| ProductForm | pendingLotsTotal | `pendingLots.reduce((sum, l) => sum + Number(l.quantity), 0)` | SIM |
| ProductForm | totalInitialStock | `pendingLotsTotal + Number(formData.untrackedQuantity)` | SIM |
| Dashboard | stockPct | `Math.min(100, Math.round((qty / minStock) × 100))` | SIM |
| Dashboard | lowStock | `products.filter(p => p.quantityInStock <= p.minStockLevel)` | SIM |

Todos os cálculos frontend usam `products.quantity_in_stock` e `product_lots.quantity` diretamente, que são os campos materializados mantidos pelas RPCs. **PASS.**

### RPCs SQL — cálculos de estoque

| RPC | Cálculo | Fórmula |
|-----|---------|---------|
| add_inventory_stock | new_stock | `quantity_in_stock + p_quantity` |
| adjust_inventory_stock (lot) | delta | `p_target_quantity - v_current_qty` |
| adjust_inventory_stock (untracked) | delta | `p_target_quantity - (quantity_in_stock - tracked_sum)` |
| adjust_inventory_stock | new_stock | `quantity_in_stock + v_delta` |
| check_inventory_reconciliation | difference | `quantity_in_stock - COALESCE(SUM(im.quantity), 0)` |
| check_inventory_reconciliation | untracked diff | `(quantity_in_stock - SUM(pl.quantity)) - SUM(im.quantity WHERE lot_id IS NULL)` |
| create_product_lot | new_sum | `v_old_sum + p_quantity` |
| update_product_lot | new_sum | `v_old_sum - v_old_lot_quantity + COALESCE(p_quantity, v_old_lot_quantity)` |
| update_product_lot | delta | `p_quantity - v_old_lot_quantity` |
| create_operation_with_stock | deduction | `quantity_in_stock - v_quantity` |
| update_operation_with_stock | delta | `quantity_in_stock - v_delta` (net of old/new) |

Todos usam `FOR UPDATE` locks e validam `quantity_in_stock >= v_quantity` antes de deduzir. **PASS.**

---

## 7. VALORIZAÇÃO DO ESTOQUE

### Cálculos encontrados

**Nenhum cálculo de valor em estoque existe no frontend.**

- `product.price` é exibido como preço unitário (ProductCard: `formatCurrency(product.price) por {unit}`)
- `StockActions` aceita `unitCost` opcional na entrada de estoque, que é passado para `add_inventory_stock` e armazenado em `inventory_movements.unit_cost` e `total_cost = unit_cost × quantity`
- **Nenhuma tela calcula** `price × quantityInStock` (valor total em estoque)
- **Nenhum WAC** (Weighted Average Cost) é implementado
- **Nenhum custo médio** é calculado
- **Nenhum valor por lote** é exibido

### Classificação: **PASS** (não implementado = não pode estar errado)

O `unit_cost` e `total_cost` no ledger são armazenados mas não utilizados em nenhuma tela. Dado armazenado para uso futuro. Sem risco atual.

---

## 8. SAFRA / ÁREAS

### Cálculos encontrados

| Tela | Cálculo | Fórmula |
|------|---------|---------|
| Dashboard | totalArea | `areas.reduce((acc, a) => acc + a.size, 0)` |
| Statistics | totalArea | `areas.reduce((acc, area) => acc + area.size, 0)` |
| Statistics | areaPerType | `stats.operationsByType[type].area += area.size` |
| Statistics | areaPercent | `(data.area / stats.totalArea × 100).toFixed(1)` |
| AreaDetail | costPerHectare | `Σ(operationCost / area.size)` |
| GeometryManager | areaHectares | `polygon.areaHectares.toFixed(1)` (from imported shapefile) |

### Duplicação de área em somatórios

**Statistics.tsx:** `stats.operationsByType[type].area += area.size` acumula a área da gleba para cada operação naquela área. Se uma área tem 3 operações do mesmo tipo, a área é contada 3 vezes no somatório por tipo.

**Classificação: ATENÇÃO** — isso pode inflar a "área por tipo" se interpretado como área cultivada. Mas se a intenção é "área acumulada por operação do tipo X", está correto. Ambiguidade conceitual, não erro matemático.

### População / Produtividade

`seedsPerHectare` e `yieldPerHectare` são exibidos em AreaDetail (PDF e tela) como valores diretos sem cálculo. Nenhum cálculo deriva desses valores (ex: produção total = yield × area não existe). **PASS** (display only).

---

## 9. DASHBOARDS E ESTATÍSTICAS

### Dashboard.tsx

| Indicador | Fórmula | Filtros | Safra | Instituição | Canceladas |
|-----------|---------|---------|-------|-------------|------------|
| Área total | `Σ areas.size` | n/a | todas as áreas da instituição | RLS isola | n/a |
| Operações (count) | `operations.length` | n/a | filtrada por activeSeason no AppContext | RLS isola | excluídas (neq cancelled) |
| Produtos (count) | `products.length` | n/a | n/a | RLS isola | n/a |
| Máquinas (count) | `machinery.length` | n/a | n/a | RLS isola | n/a |
| Estoque baixo | `products.filter(qty <= min)` | n/a | n/a | RLS isola | n/a |
| Operações por mês | group+count by startDate | últimos 6 meses | filtrada por safra | RLS isola | excluídas |
| Operações por categoria | group+count by type | n/a | filtrada por safra | RLS isola | excluídas |
| % estoque | `Math.min(100, round(qty/min × 100))` | n/a | n/a | RLS isola | n/a |

**AppContext filtragem por safra:** `operations: operations.filter(op => !activeSeason || op.season_id === activeSeason.id)` — quando há safra ativa, só operações dessa safra aparecem. **PASS.**

### Statistics.tsx

| Indicador | Fórmula | Filtros | Problemas? |
|-----------|---------|---------|-----------|
| Área total | `Σ areas.size` | n/a | PASS |
| Operações no período | `filteredOperations.length` | date range (week/month/season) | PASS |
| Áreas sem operações | `areas.filter(!operations.some(areaId))` | date range | PASS |
| Produtos em baixa | `products.filter(qty <= min).length` | n/a | PASS |
| Custo por produto | `Σ(quantity × product.price)` | date range | **CRÍTICO** — usa preço atual, ver §3 |
| Área por tipo | `Σ area.size per type` | date range | ATENÇÃO — ver §8 |

---

## 10. MANUTENÇÃO E MÁQUINAS

### Cálculos encontrados

| Tela | Cálculo | Fórmula | Unidade |
|------|---------|---------|---------|
| MachineryCard | totalCost | `maintenances.reduce((sum, m) => sum + m.cost, 0)` | BRL |
| MachineryCard | totalMaintenances | `machineryMaintenances.length` | count |
| MachineryDetail | totalCost | `maintenances.reduce((sum, m) => sum + m.cost, 0)` | BRL |
| MachineryDetail | totalMaintenances | `maintenances.length` | count |
| MaintenanceList | totalCost | `sortedMaintenances.reduce((sum, m) => sum + m.cost, 0)` | BRL |
| MaintenanceCard | machineHours | `maintenance.machineHours.toLocaleString()` | horas (display only) |
| MaintenanceForm | cost validation | `isNaN(Number(cost)) || Number(cost) < 0` | BRL |

### Horímetro / Quilometragem

`machineHours` é exibido como valor direto. Nenhum cálculo deriva dele (ex: intervalo desde última manutenção, consumo por hora, etc.). **Não existe cálculo de intervalo de manutenção.** **PASS** (display only).

### Custos de manutenção

O custo é inserido manualmente pelo usuário no formulário (`formData.cost`). Não é derivado de peças × preço ou taxa × horas. **PASS** — é um input direto, não um cálculo.

---

## 11. OUTROS CÁLCULOS

### Datas / Intervalos

| Tela | Cálculo | Fórmula |
|------|---------|---------|
| OperationForm | dias até vencimento | `Math.round((exp - today) / 86400000)` |
| ProductCard | dias até vencimento | `Math.floor((date - now) / 86400000)` |
| LotManager | dias até vencimento | `Math.floor((date - now) / 86400000)` |
| InventoryList | dias até vencimento | `Math.floor((date - now) / 86400000)` |
| Dashboard | ordenação por data | `new Date(b.startDate).getTime() - new Date(a.startDate).getTime()` |
| Planning | isToday | `new Date(nextDate).toDateString() === today.toDateString()` |

**ATENÇÃO:** `Math.round` vs `Math.floor` para dias até vencimento. OperationForm usa `Math.round`, enquanto ProductCard/LotManager/InventoryList usam `Math.floor`. Pode haver diferença de 1 dia na exibição entre telas.

### Percentuais

| Tela | Cálculo |
|------|---------|
| Dashboard | `Math.min(100, Math.round((qty/min) × 100))` — estoque vs mínimo |
| Statistics | `(data.area / totalArea × 100).toFixed(1)` — área por tipo |
| Dashboard | `(count / maxCount) × 90` — altura barra (px) |
| Dashboard | `(count / maxCount) × 100` — largura barra (%) |

### Validações numéricas

Todos os formulários validam com `isNaN(Number(value))` e checam limites (≤ 0, < 0). **PASS.**

---

## 12. DUPLICAÇÃO DE LÓGICA

### Custo de operação — 3 implementações independentes

| Tela | Arquivo | Fórmula custo | Denominador custo/ha |
|------|---------|---------------|---------------------|
| OperationCard | OperationCard.tsx | `Σ(qty × price)` | `operationSize \|\| area.size` |
| AreaDetail | AreaDetail.tsx | `Σ(qty × price)` | `area.size` (sempre) |
| Statistics | Statistics.tsx | `Σ(qty × price)` | não calcula custo/ha |

**Divergência:** OperationCard calcula custo/ha dividindo pela área aplicada (operationSize). AreaDetail calcula dividindo pela área total da gleba (area.size). Se operationSize < area.size (operação parcial), o custo/ha será diferente entre as duas telas para a mesma operação.

**Classificação: IMPORTANTE** — o usuário vê valores diferentes para a mesma operação dependendo da tela.

### Dias até vencimento — Math.round vs Math.floor

| Tela | Método |
|------|--------|
| OperationForm | `Math.round` |
| ProductCard | `Math.floor` |
| LotManager | `Math.floor` |
| InventoryList | `Math.floor` |

**Classificação: BAIXO** — diferença máxima de 1 dia na exibição.

---

## 13. CASOS DE BORDA

| Cenário | Comportamento | Status |
|---------|--------------|--------|
| quantity = 0 | Validado: `qty <= 0` → erro no OperationForm | PASS |
| area = 0 | Validado: `size <= 0` → erro no AreaForm; `area.size > 0` guard em custo/ha | PASS |
| price = 0 | Validado: `price <= 0` → erro no ProductForm | PASS |
| price = NULL | `product.price` undefined → `qty × undefined = NaN` → custo NaN | **ATENÇÃO** |
| Produto deletado | `getProductById` retorna undefined → custo = 0 silencioso | **CRÍTICO** |
| Produto histórico indisponível | Mesmo que deletado → custo = 0 | **CRÍTICO** |
| Lote arquivado | Filtrado em `getLotsByProductId` (archivedAt check) | PASS |
| Operação cancelada | Excluída no load (neq cancelled) | PASS |
| Produto sem lote | `untracked = stock - tracked` calculado corretamente | PASS |
| Produto multilote | FEFO distribution + allocation validation | PASS |
| Decimais longos | Precisão nativa JS double; toFixed(1/2) na exibição | PASS |
| Divisão por zero | area.size = 0 guardado em custo/ha; maxCount = 1 quando vazio | PASS |
| NaN propagation | `qty × undefined` (produto não encontrado) → NaN em totais | **ATENÇÃO** |

---

## 14. CLASSIFICAÇÃO

### Cálculos: PASS / ATENÇÃO / ERRO

| Categoria | Status |
|-----------|--------|
| Estoque (quantidades, lotes, untracked) | PASS |
| Dose × área = quantidade | PASS |
| RPCs SQL (atomicidade, locks, validação) | PASS |
| Ledger (reconciliação, classification net-zero) | PASS |
| Manutenção (custo manual, contagem) | PASS |
| Dashboard (contagens, filtros, safra) | PASS |
| Validações numéricas | PASS |
| Custo de operação (fórmula base) | PASS |
| Custo de operação (preço histórico) | **ERRO** |
| Custo/ha (denominador divergente) | **ATENÇÃO** |
| Área por tipo (potencial dupla contagem) | ATENÇÃO |
| Dias até vencimento (round vs floor) | ATENÇÃO |
| NaN com produto deletado | ATENÇÃO |

### Problemas: CRÍTICO / IMPORTANTE / BAIXO

| # | Problema | Severidade | Tela(s) |
|---|----------|-----------|---------|
| 1 | Preço histórico usa preço atual do produto — histórico financeiro é mutável retroativamente | **CRÍTICO** | OperationCard, AreaDetail, Statistics |
| 2 | Produto deletado → custo da operação cai para 0 silenciosamente | **CRÍTICO** | OperationCard, AreaDetail, Statistics |
| 3 | Custo/ha divergente: OperationCard usa operationSize, AreaDetail usa area.size | **IMPORTANTE** | OperationCard vs AreaDetail |
| 4 | NaN quando product.price é undefined (produto não encontrado) — propagado em totais | **IMPORTANTE** | OperationCard, AreaDetail, Statistics |
| 5 | Área por tipo em Statistics soma area.size uma vez por operação (inflação se múltiplas ops na mesma área) | **BAIXO** | Statistics |
| 6 | Math.round vs Math.floor em dias até vencimento (diferença de 1 dia) | **BAIXO** | OperationForm vs ProductCard/LotManager/InventoryList |

---

## 15. TABELA CONSOLIDADA

| Cálculo | Tela | Arquivo/Função | Fórmula | Fonte | Unidade | Status | Problema | Severidade | Correção recomendada |
|---------|------|----------------|---------|-------|---------|--------|----------|-----------|---------------------|
| Custo operação | Card | OperationCard.calculateOperationCost | Σ(qty × product.price) | products[].price | BRL | ERRO | Preço atual, não histórico | CRÍTICO | Congelar price em products_used na criação da operação |
| Custo operação | AreaDetail | AreaDetail.calculateCosts | Σ(qty × product.price) | products[].price | BRL | ERRO | Mesmo que acima | CRÍTICO | Idem |
| Custo operação | Statistics | Statistics.productUsage | Σ(qty × product.price) | products[].price | BRL | ERRO | Mesmo que acima | CRÍTICO | Idem |
| Produto deletado | Card/Area/Stats | getProductById → undefined | custo = 0 | n/a | BRL | ERRO | Custo perdido sem aviso | CRÍTICO | Armazenar nome+preço snapshot em products_used |
| Custo/ha | OperationCard | calculateOperationCost | totalCost / (operationSize \|\| area.size) | operation+area | BRL/ha | ATENÇÃO | Denominador diferente de AreaDetail | IMPORTANTE | Padronizar denominador |
| Custo/ha | AreaDetail | calculateCosts | Σ(opCost / area.size) | area.size | BRL/ha | ATENÇÃO | Denominador diferente de OperationCard | IMPORTANTE | Padronizar denominador |
| NaN em preço | Card/Area/Stats | qty × undefined | NaN | product.price undefined | BRL | ATENÇÃO | NaN propagado em totais | IMPORTANTE | Guard: if (!product) skip ou usar preço 0 com warning |
| Área por tipo | Statistics | operationsByType.area | Σ area.size per op | areas[].size | ha | ATENÇÃO | Dupla contagem se múltiplas ops | BAIXO | Documentar ou usar DISTINCT area |
| Dias vencimento | OperationForm | getDaysUntilExpiration | Math.round((exp-today)/86400000) | lot.expirationDate | dias | ATENÇÃO | Math.round vs Math.floor | BAIXO | Padronizar Math.floor |
| Estoque total | LotManager | totalStock | product.quantityInStock | products | unit | PASS | — | — | — |
| Tracked stock | LotManager/StockActions | lots.reduce(Σ qty) | lot quantities | product_lots | unit | PASS | — | — | — |
| Untracked stock | LotManager/StockActions | stock - tracked | derived | derived | unit | PASS | — | — | — |
| Dose × área | OperationForm | parseNumber(dose) × size | form inputs | user input | unit | PASS | — | — | — |
| FEFO distribution | OperationForm | min(lot.qty, remaining) greedy | lots sorted by expiration | product_lots | unit | PASS | — | — | — |
| Allocation match | OperationForm validate | abs(allocTotal - qty) > 1e-6 | form inputs | form | unit | PASS | — | — | — |
| Stock % | Dashboard | min(100, round(qty/min × 100)) | products | products | % | PASS | — | — | — |
| Área total | Dashboard/Stats | areas.reduce(Σ size) | areas | areas | ha | PASS | — | — | — |
| Manutenção total | MachineryCard/Detail/MaintenanceList | reduce(Σ m.cost) | maintenances | maintenances | BRL | PASS | — | — | — |
| RPC stock deduction | create/update/delete_operation | quantity_in_stock - v_quantity | SQL UPDATE | products | unit | PASS | — | — | — |
| RPC stock addition | add_inventory_stock | quantity_in_stock + p_quantity | SQL UPDATE | products | unit | PASS | — | — | — |
| RPC adjustment delta | adjust_inventory_stock | target - current | SQL | products/lots | unit | PASS | — | — | — |
| RPC reconciliation | check_inventory_reconciliation | materialized - SUM(ledger) | SQL | products + movements | unit | PASS | — | — | — |
| Classification net-zero | create/update_product_lot | +lot / -untracked paired | SQL | movements | unit | PASS | — | — | — |
| Opening balance | activate_ledger | quantity_in_stock - SUM(lots) = untracked | SQL | products + lots | unit | PASS | — | — | — |

---

## 16. CORREÇÕES NECESSÁRIAS ANTES DE NOVAS FUNCIONALIDADES

### CRÍTICAS

1. **Congelar preço do produto na operação ao criá-la**
   - Adicionar campo `unitPrice` (e opcionalmente `productName`) em cada item de `products_used` no momento da criação
   - `create_operation_with_stock` deve fazer `SELECT price FROM products WHERE id = p_product_id` e armazenar em `products_used`
   - Todas as telas de custo devem usar `usage.unitPrice` (snapshot) em vez de `getProductById(usage.productId).price` (atual)
   - Impacto: OperationCard, AreaDetail, Statistics, OperationForm (submit), create_operation_with_stock, update_operation_with_stock

2. **Preservar custo histórico quando produto é deletado**
   - Ao deletar um produto, o `products_used` das operações já contém `productId` — se o snapshot de preço for implementado (correção #1), o custo é preservado automaticamente
   - Adicionalmente, exibir `usage.productName || 'Produto removido'` quando `getProductById` retorna undefined

### IMPORTANTES

3. **Padronizar denominador de custo/hectare**
   - Decidir se custo/ha usa `operationSize` (área efetivamente aplicada) ou `area.size` (área total da gleba)
   - Recomendação: usar `operationSize` em ambos, pois reflete a área real da operação
   - Aplicar em AreaDetail.calculateCosts: substituir `area.size` por `operation.operationSize > 0 ? operation.operationSize : area.size`

4. **Guardar contra NaN quando produto não é encontrado**
   - Em calculateOperationCost (OperationCard e AreaDetail) e productUsage (Statistics): se `getProductById` retorna undefined, pular o item OU usar 0 com indicação visual de "produto não encontrado"
   - Evita NaN propagar para totais
