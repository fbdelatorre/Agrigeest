# ESTOQUE E LOTES — RECEBIMENTO E CLASSIFICACAO

**Data:** 2026-10-09  
**Status:** PASS  
**Build:** PASS

---

## 1. RESUMO

Foram implementados os fluxos de recebimento de mercadoria, classificação de estoque sem lote, e visualização do saldo virtual "Sem lote".

### Regra fundamental

`ESTOQUE TOTAL = ESTOQUE SEM LOTE + SOMA DOS LOTES REAIS`

O usuário não informa manualmente o estoque total. O campo `products.quantity_in_stock` é mantido automaticamente pelas RPCs.

---

## 2. RPCs NOVAS

### receive_product_lot

Entrada física de mercadoria. Pode criar lote novo na mesma transação.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| p_product_id | uuid | Produto |
| p_quantity | numeric | Quantidade positiva |
| p_idempotency_key | text | Chave anti-duplicação |
| p_lot_number | text | Opcional — vazio = sem lote |
| p_expiration_date | date | Opcional |
| p_reason | text | Opcional |
| p_notes | text | Opcional |
| p_unit_cost | numeric | Opcional |
| p_effective_at | timestamptz | Opcional |

**Comportamento:**
- Sem número de lote → entrada no saldo sem lote (lot_id = NULL)
- Número novo → cria lote e incrementa estoque
- Número existente → soma ao lote (bloqueia se arquivado, alerta conflito de validade)
- Ledger: PHYSICAL/STOCK_IN
- Idempotência: chave única previne duplicação

### classify_untracked_stock

Transferência de saldo sem lote para lote identificado. Não altera `products.quantity_in_stock`.

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| p_product_id | uuid | Produto |
| p_quantity | numeric | Quantidade a classificar |
| p_lot_number | text | Obrigatório |
| p_expiration_date | date | Opcional |
| p_notes | text | Opcional |

**Comportamento:**
- Valida que untrackedStock >= quantidade
- Cria lote se não existir, ou soma a existente
- Ledger: CLASSIFICATION/LOT_CLASSIFICATION (par soma zero)
- Bloqueia se saldo sem lote insuficiente
- Bloqueia se lote arquivado
- Alerta conflito de validade

### Segurança

Ambas as RPCs:
- SECURITY DEFINER, search_path = public, pg_temp
- Derivam institution_id de auth.uid() via user_profiles
- REVOKE FROM PUBLIC e anon
- GRANT EXECUTE TO authenticated

---

## 3. INTERFACE — LotManager

### Resumo de estoque

Card no topo mostrando 3 colunas:
- Estoque total
- Em lotes identificados
- Sem lote (destaque âmbar se > 0)

### Linha virtual "Sem lote"

Exibida sempre que untrackedStock > 0:
- Fundo âmbar claro
- Sem botões de excluir/arquivar
- Botão de classificar (transferir para lote)
- Unidade do produto
- "—" na validade

### Botões de ação

Substituído "Adicionar Lote" por dois botões distintos:

**Receber** — entrada física de mercadoria
- Número do lote opcional (vazio = sem lote)
- Quantidade obrigatória
- Validade opcional
- Usa RPC receive_product_lot

**Classificar** — transferir saldo sem lote para lote
- Número do lote obrigatório
- Quantidade obrigatória (validada contra saldo sem lote)
- Validade opcional
- Usa RPC classify_untracked_stock
- Desabilitado se untrackedStock = 0

### Edição de lotes

Mantida via botão de editar (lápis). Semântica preservada: edição de metadados sem movimento físico.

### Mensagens de sucesso

- "Entrada registrada: 740 L no lote 26432."
- "Entrada registrada: 1.000 L sem lote."
- "Classificação concluída: 600 L transferidos de Sem lote para o lote A."
- "Saldo sem lote insuficiente para classificar essa quantidade." (erro)

---

## 4. APP CONTEXT

Adicionadas duas funções:

- `receiveProductLot(productId, quantity, idempotencyKey, lotNumber?, expirationDate?, reason?, notes?, unitCost?)`
- `classifyUntrackedStock(productId, quantity, lotNumber, expirationDate?, notes?)`

Ambas recarregam produtos e lotes após sucesso.

---

## 5. PRESERVAÇÃO DE DADOS

| Verificação | Status |
|-------------|--------|
| Produtos existentes inalterados | PASS |
| Lotes existentes inalterados | PASS |
| Estoque legado sem lote preservado | PASS |
| Operações agrícolas inalteradas | PASS |
| Ledger e movimentos anteriores inalterados | PASS |
| Snapshots financeiros inalterados | PASS |
| Isolamento por instituição mantido | PASS |
| Nenhum backfill executado | PASS |
| Nenhum saldo zerado | PASS |
| Nenhum lote fictício "Sem lote" criado | PASS |

---

## 6. CENÁRIOS VALIDADOS

| Cenário | Descrição | Status |
|----------|-----------|--------|
| A | Receber 1.000 L sem lote | PASS — estoque aumenta, sem product_lots |
| B | Receber 740 L em lote novo | PASS — lote criado + estoque aumenta |
| C | Adicionar 200 L a lote existente | PASS — lote incrementado + estoque aumenta |
| D | Classificar 600 L de estoque sem lote | PASS — lote criado/incrementado, estoque total inalterado |
| E | Classificar acima do saldo sem lote | PASS — bloqueado com erro |
| F | Consumo antes de classificar | PASS — saldo sem lote reflete consumo |
| G | Repetir requisição com mesma idempotency_key | PASS — retorna IDEMPOTENT |
| I | Produto legado com saldo e sem lotes | PASS — "Sem lote" exibido corretamente |
| J | Produto com lotes e saldo sem lote | PASS — ambos exibidos |
| K | Receber em lote arquivado | PASS — bloqueado |
| L | Falha na transação | PASS — rollback integral |

---

## 7. ARQUIVOS MODIFICADOS

| Arquivo | Mudança |
|---------|---------|
| src/context/AppContext.tsx | +receiveProductLot, +classifyUntrackedStock |
| src/components/products/LotManager.tsx | Reformulado com receber/classificar, Sem lote row, resumo |

---

## 8. MIGRAÇÃO APLICADA

| Migration | Descrição |
|-----------|-----------|
| create_receive_and_classify_rpcs | 2 novas RPCs: receive_product_lot + classify_untracked_stock |
