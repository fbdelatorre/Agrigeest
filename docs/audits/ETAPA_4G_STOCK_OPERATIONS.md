# ETAPA 4G — FINALIZAÇÃO OPERACIONAL DO ESTOQUE

**Data:** 2026-10-08  
**Status:** PASS  
**Depende de:** ETAPA 4F (Ledger Cutover)

---

## 1. PRE

| Entidade | Count | Soma |
|----------|-------|------|
| products | 219 | 4,638,907.93 |
| product_lots | 171 | 213,560 |
| operations | 309 | — |
| inventory_movements | 288 | 4,638,907.93 |

Discrepâncias PRE: 0 (produto, lote, untracked)  
Negativos: 0  
Lots > stock: 0

---

## 2. RPCs Criadas

### 2.1 `add_inventory_stock`
- Entrada física de estoque com idempotência
- Parâmetros: product_id, quantity, idempotency_key, lot_id?, reason?, notes?, unit_cost?, effective_at?
- Valida produto e lote pertencem à instituição do usuário
- Bloqueia lotes arquivados (LOT_ARCHIVED)
- Incrementa products.quantity_in_stock e product_lots.quantity atomicamente
- Escreve movimento PHYSICAL/STOCK_IN se ledger ativo
- Idempotência: se idempotency_key já existe, retorna status=IDEMPOTENT sem duplicar
- Acesso: authenticated

### 2.2 `adjust_inventory_stock`
- Ajuste de inventário (correção de contagem física) — ADMIN ONLY
- Parâmetros: product_id, target_quantity, reason, idempotency_key, lot_id?, notes?
- Recebe quantidade física alvo, não delta — RPC calcula delta com lock
- Com lot_id: ajusta lote + produto (mesmo delta)
- Sem lot_id: ajusta apenas untracked do produto
- Gera ADJUSTMENT_IN (delta>0) ou ADJUSTMENT_OUT (delta<0)
- Delta=0 retorna NO_CHANGE sem criar movement
- Valida não-negativo e SUM(lots) <= stock
- Idempotência: mesma chave retorna IDEMPOTENT
- Acesso: authenticated + is_admin

### 2.3 `archive_product_lot`
- Arquivamento seguro de lote vazio
- Só permite quando quantity=0 (LOT_NOT_EMPTY)
- Soft delete: archived_at=now(), archived_by=auth.uid()
- Não gera movement (quantity=0, nenhum estoque muda)
- Lote arquivado permanece referenciado no ledger
- Acesso: authenticated

### 2.4 `check_inventory_reconciliation`
- Relatório read-only de discrepâncias — ADMIN ONLY
- Verifica: produto, lote, untracked (ledger vs materializado)
- Retorna JSON com total_discrepancies e arrays por escopo
- Se tudo correto: total_discrepancies=0
- Não corrige nada
- Acesso: authenticated + is_admin

### 2.5 `create_product_lot` (adaptada)
- Lot number uniqueness agora ignora lotes arquivados
- Permite recriar lote com mesmo número se o anterior foi arquivado

### 2.6 `update_product_lot` (adaptada)
- Bloqueia edição de lotes arquivados (LOT_ARCHIVED)
- Lot number uniqueness ignora lotes arquivados

---

## 3. Security / Grants

| RPC | Acesso |
|-----|--------|
| add_inventory_stock | authenticated |
| adjust_inventory_stock | authenticated + is_admin |
| archive_product_lot | authenticated |
| check_inventory_reconciliation | authenticated + is_admin |

- Nenhuma mutation direta em inventory_movements liberada
- INSERT/UPDATE/DELETE em inventory_movements permanece revogado para anon/authenticated
- Todas as RPCs derivam institution_id de auth.uid() → user_profiles
- Ajuste e reconciliação verificam is_admin no banco

---

## 4. Frontend Mínimo

### ProductCard
- Botão "Entrada" (Stock In) — visível para todos os usuários autenticados
- Botão "Ajustar" (Adjust) — visível apenas para admins
- Ambos abrem modal StockActions com campos apropriados

### StockActions Modal
- Modo stock-in: produto, quantidade, lote opcional, motivo, notas, custo unitário
- Modo adjust: produto, lote ou "sem lote", quantidade contada, motivo obrigatório, notas
- Idempotency key gerada como UUID no mount, reutilizada em retries
- Botões disabled durante submit (isSubmitting + submittingRef)
- Online-only: bloqueado se offline

### LotManager
- Botão "Arquivar" por lote — disabled quando quantity > 0
- Confirmação antes de arquivar
- Trata erros LOT_NOT_EMPTY e LOT_ALREADY_ARCHIVED

### AppContext
- `addInventoryStock`, `adjustInventoryStock`, `archiveLot` adicionadas
- `getLotsByProductId` agora filtra lotes arquivados
- `loadProductLots` carrega archived_at
- ProductLot type estendido com archivedAt?

---

## 5. Idempotência

- Frontend gera UUID no mount do modal (crypto.randomUUID())
- Mesma chave reutilizada durante retries da mesma submissão
- Botões isSubmitting + submittingRef previnem double-click
- RPCs verificam idempotency_key em inventory_movements antes de processar
- Se chave já existe: retornam status=IDEMPOTENT sem adicionar estoque

---

## 6. POST Validation

| Check | Resultado |
|-------|-----------|
| products count | 219 (inalterado) |
| product_lots count | 171 (inalterado) |
| inventory_movements count | 288 (inalterado) |
| SUM products | 4,638,907.93 (inalterado) |
| SUM product_lots | 213,560 (inalterado) |
| Ledger vs product | 0 discrepâncias |
| Ledger vs lot | 0 discrepâncias |
| Ledger vs untracked | 0 discrepâncias |
| Negativos | 0 |
| Lots > stock | 0 |

---

## 7. Build

`npm run build` — PASS (0 erros, 0 type errors)

---

## 8. STATUS

**PASS**

- Entrada de estoque é atômica com ledger
- Ajuste é atômico com ledger
- Archive não perde histórico
- Idempotência impede duplicação
- Nenhuma mutation direta no ledger foi liberada
- Online-only preservado
- Dados existentes não foram modificados
- Reconciliação retorna 0 divergências
- Build PASS
