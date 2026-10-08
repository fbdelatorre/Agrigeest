# ETAPA 4D.1 — FECHAMENTO ARQUITETURAL DO LEDGER

**Data da auditoria:** 2026-10-08 17:09:55 UTC
**Tipo:** READ-ONLY — projeto e auditoria
**Status:** PASS

---

## A. READ-ONLY confirmado

Nenhuma migration foi aplicada. Nenhuma tabela foi criada. Nenhuma RPC foi alterada. Nenhum grant foi revogado. Nenhum dado foi modificado. Nenhum arquivo frontend foi editado. Apenas SELECTs de auditoria foram executados.

---

## B. Snapshot atual (2026-10-08 17:09:55 UTC)

| Métrica | Valor |
|---|---|
| products | 219 |
| product_lots | 171 |
| operations | 309 |
| operation_products | 0 (vazia) |
| SUM(quantity_in_stock) | 4,638,907.93 |
| SUM(product_lots.quantity) | 213,560 |
| produtos com stock > 0 | 219 |
| produtos com stock = 0 | 0 |
| produtos com lotes | 102 |
| produtos sem lotes | 117 |
| instituições | 2 |
| lotes com quantity = 0 | 0 |
| lotId órfãos em operations | 0 |
| productId órfãos em operations | 501 |

### Categorias de tracking

| Categoria | Produtos | Stock total | Lot stock | Untracked |
|---|---|---|---|---|
| fully_tracked | 102 | 213,560 | 213,560 | 0 |
| no_lots | 117 | 4,425,347.93 | 0 | 4,425,347.93 |
| partially_tracked | 0 | 0 | 0 | 0 |

**Invariante confirmada:** SUM(stock) = SUM(lot_stock) + SUM(untracked) = 213,560 + 4,425,347.93 = 4,638,907.93 ✓

---

## C. Decisões D1-D8 consolidadas

### D1. Soft delete de operações — APROVADO

Futuro: `operations` deve preservar operações canceladas com `status`, `cancelled_at`, `cancelled_by`. Operação cancelada não desaparece fisicamente. Não implementar agora.

### D2. Marco do ledger — APROVADO

`ledger_started_at` por instituição. Cada instituição pode ter seu próprio cutover. Novas instituições criadas após o cutover não precisam de opening balance histórico. Não implementar agora.

### D3. Custos — APROVADO COM AJUSTE

`inventory_movements` poderá possuir futuramente `unit_cost numeric NULL` e `total_cost numeric NULL`. Mas NÃO implementar WAC agora. Não calcular custo médio automaticamente. O ledger físico nasce primeiro. STOCK_IN futuro poderá congelar custo real informado. Motor de valuation/custo histórico será etapa posterior.

### D4. Ajustes e reversões — APROVADO

Somente admin (`is_admin = true`) poderá executar `ADJUSTMENT_IN`, `ADJUSTMENT_OUT` e `REVERSAL`. Consumo normal via operação continua permitido para usuários normais.

### D5. Delete product — APROVADO

Futuramente remover DELETE direto de `products` pelo frontend. Criar RPC controlada em etapa posterior. Produto com `inventory_movements` não deverá ser fisicamente deletado. Avaliar futura estratégia `archive/active=false`. Não implementar agora.

### D6. Unit snapshot — ALTERADO

`unit_snapshot text NOT NULL` preenchido em TODOS os `inventory_movements`. Motivo: a unidade histórica não pode mudar semanticamente se `products.unit` for alterado posteriormente. Exemplo: movimento antigo `quantity=100 unit=L`; produto muda para `mL`; o movimento deve continuar significando 100 L.

### D7. UI — APROVADO

UI do ledger será posterior ao backend/cutover validado.

### D8. Lot number snapshot — APROVADO

Manter `lot_number_snapshot` mesmo que o lote continue existindo. É redundância auditável intencional.

---

## D. Decisão lot_id

### Decisão aprovada: `lot_id REFERENCES product_lots(id) ON DELETE RESTRICT`

**Princípio:** depois que um lote participar do ledger, ele faz parte do histórico e NÃO deve ser fisicamente deletado.

Lote esgotado deve poder permanecer com `quantity = 0` e futuramente `active/archived_at` se necessário. Não devemos apagar a identidade histórica do lote. `lot_number_snapshot` continua existindo como redundância auditável.

### Impacto sobre delete_product_lot

**Impacto CRÍTICO.** A RPC `delete_product_lot` atual faz `DELETE FROM product_lots WHERE id = p_lot_id`. Com `ON DELETE RESTRICT` em `inventory_movements.lot_id`, este DELETE falhará se o lote tiver qualquer movimento no ledger.

Cenários:

| Cenário | Comportamento atual | Comportamento futuro com RESTRICT |
|---|---|---|
| Lote sem movimentos no ledger | DELETE físico sucede | DELETE físico sucede (sem FK violation) |
| Lote com movimentos no ledger | DELETE físico sucede (não há FK) | DELETE físico FALHA (RESTRICT) |
| Lote criado por engano, sem uso | DELETE físico sucede | DELETE físico sucede (aceitável) |
| Lote esgotado (quantity=0) com histórico | DELETE físico sucede | DELETE físico FALHA — deve ser arquivado |

### Impacto sobre lotes atuais

Os 171 lotes atuais não têm `inventory_movements` (tabela não existe). Após o cutover, novos movimentos serão criados. Lotes que receberem movimentos não poderão mais ser deletados.

### Impacto sobre frontend

O frontend (`LotManager.tsx`) tem botão "Delete" para lotes. Após o ledger, este botão deve:
- Verificar se o lote tem movimentos (ou tentar e capturar o erro FK)
- Se tem movimentos: oferecer "Arquivar" em vez de "Delete"
- Se não tem movimentos: permitir Delete (caso de lote criado por engano)

### Impacto sobre RPCs

`delete_product_lot` deverá ser adaptada para:
1. Verificar se o lote tem `inventory_movements`
2. Se sim: rejeitar com `LOT_HAS_LEDGER_HISTORY` (ou oferecer archive)
3. Se não: DELETE físico (preservar comportamento para lotes sem histórico)

### Impacto sobre FKs

A FK `inventory_movements.lot_id → product_lots(id) ON DELETE RESTRICT` é a única FK nova que afeta `product_lots`. A FK existente `product_lots.product_id → products(id) ON DELETE RESTRICT` permanece inalterada.

### Impacto sobre histórico

O histórico do ledger torna-se completo e imutável. A identidade do lote (UUID + lot_number_snapshot) é preservada permanentemente. Mesmo após o lote ser arquivado, seus movimentos permanecem referenciando-o.

---

## E. create_product_lot — implementação atual

```sql
CREATE OR REPLACE FUNCTION public.create_product_lot(
  p_product_id uuid, p_lot_number text, p_quantity numeric, 
  p_expiration_date date DEFAULT NULL
) RETURNS product_lots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
```

### Lógica

1. Autentica usuário e obtém `institution_id`
2. TRIM `p_lot_number`, valida não vazio
3. Valida `p_quantity >= 0`
4. **Lock product FOR UPDATE** — obtém `v_product_stock`
5. Computa `v_old_sum = SUM(product_lots.quantity) WHERE product_id = p_product_id`
6. **Valida invariante:**
   - Se `v_old_sum <= v_product_stock` (lotes cabem dentro do estoque):
     - Se `v_new_sum > v_product_stock` → `LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK`
   - Se `v_old_sum > v_product_stock` (lotes já excedem — situação anômala):
     - Se `v_new_sum > v_old_sum` → `LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK`
7. Verifica duplicidade `(product_id, lot_number)` → `LOT_NUMBER_ALREADY_EXISTS`
8. INSERT lote (captura `unique_violation`)
9. **NÃO altera `products.quantity_in_stock`**

### Quando altera products.quantity_in_stock

**NUNCA.** A RPC atual `create_product_lot` NÃO altera `products.quantity_in_stock`. Ela apenas insere um novo lote e valida que `SUM(lots) <= quantity_in_stock`.

### Simulação READ-ONLY

**Cenário 1:** Produto total=500, untracked=500, criar lote A=200

- `v_old_sum = 0`, `v_product_stock = 500`
- `v_new_sum = 0 + 200 = 200 <= 500` ✓
- Resultado: lote A=200 criado. Total permanece 500. Untracked = 300. **Correto.**

**Cenário 2:** Produto total=500, untracked=100, lotes existentes=400, criar lote B=200

- `v_old_sum = 400`, `v_product_stock = 500`
- `v_new_sum = 400 + 200 = 600 > 500` → `LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK`
- Resultado: **BLOQUEADO**. Não cria estoque físico automaticamente. **Correto.**

### Veredicto

`create_product_lot` **NÃO** cria estoque físico silenciosamente. Apenas classifica estoque existente (untracked → tracked). O bloqueio ocorre quando não há untracked suficiente. **Compatível com o modelo desejado.**

---

## F. update_product_lot — implementação atual

```sql
CREATE OR REPLACE FUNCTION public.update_product_lot(
  p_lot_id uuid, p_lot_number text DEFAULT NULL,
  p_quantity numeric DEFAULT NULL, p_expiration_date date DEFAULT NULL,
  p_expected_quantity numeric DEFAULT NULL
) RETURNS product_lots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
```

### Lógica

1. Autentica usuário e obtém `institution_id`
2. TRIM `p_lot_number` quando fornecido
3. Valida `p_quantity >= 0`
4. Lê lote atual para obter `product_id`
5. **Lock product FOR UPDATE** — obtém `v_product_stock`
6. **Lock lot FOR UPDATE** — obtém `v_old_lot_quantity`
7. Otimistic concurrency: `p_expected_quantity != v_old_lot_quantity` → `LOT_QUANTITY_STALE`
8. Duplicate lot_number check (exclui self)
9. Computa `v_old_sum = SUM(product_lots.quantity)`
10. Computa `v_new_sum = v_old_sum - v_old_lot_quantity + COALESCE(p_quantity, v_old_lot_quantity)`
11. **Valida invariante:**
    - Se `v_old_sum <= v_product_stock`:
      - Se `v_new_sum > v_product_stock` → `LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK`
    - Se `v_old_sum > v_product_stock`:
      - Se `v_new_sum > v_old_sum` → `LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK`
12. UPDATE lote
13. **NÃO altera `products.quantity_in_stock`**

### Quando altera products.quantity_in_stock

**NUNCA.** A RPC atual `update_product_lot` NÃO altera `products.quantity_in_stock`. Ela apenas atualiza a quantidade do lote e valida que `SUM(lots) <= quantity_in_stock`.

### Simulação READ-ONLY

**Cenário 1:** Produto total=500, lote A=200, untracked=300. Editar lote A para 250.

- `v_old_sum = 200`, `v_product_stock = 500`
- `v_new_sum = 200 - 200 + 250 = 250 <= 500` ✓
- Resultado: lote A=250. Total permanece 500. Untracked = 250. **Correto.**

**Cenário 2:** Produto total=500, lote A=200, untracked=300. Editar lote A para 600.

- `v_old_sum = 200`, `v_product_stock = 500`
- `v_new_sum = 200 - 200 + 600 = 600 > 500` → `LOT_QUANTITY_EXCEEDS_PRODUCT_STOCK`
- Resultado: **BLOQUEADO**. Não aumenta estoque físico automaticamente. **Correto.**

### Veredicto

`update_product_lot` **NÃO** aumenta estoque físico automaticamente. Apenas reclassifica entre tracked/untracked e bloqueia quando não há untracked suficiente. **Compatível com o modelo desejado.**

---

## G. delete_product_lot — implementação atual

```sql
CREATE OR REPLACE FUNCTION public.delete_product_lot(
  p_lot_id uuid
) RETURNS product_lots
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
```

### Lógica

1. Autentica usuário e obtém `institution_id`
2. Lê lote para obter `product_id`
3. **Lock product FOR UPDATE**
4. **Lock lot FOR UPDATE**
5. **DELETE lote** (`DELETE FROM product_lots WHERE id = p_lot_id`)
6. **NÃO altera `products.quantity_in_stock`**

### Quando altera products.quantity_in_stock

**NUNCA.** A RPC atual `delete_product_lot` NÃO altera `products.quantity_in_stock`. Ela apenas remove o lote. O estoque que estava rastreado no lote volta conceitualmente para untracked, mas o total físico (`quantity_in_stock`) não muda.

### Simulação READ-ONLY

**Cenário:** Produto total=500, lote A=200, untracked=300. Remover lote A.

- DELETE lote A (200)
- `quantity_in_stock` permanece 500
- `SUM(lots) = 0`
- Untracked = 500 - 0 = 500
- Resultado: total=500, lotes=0, untracked=500. **Correto.**

### Veredicto

`delete_product_lot` **NÃO** reduz estoque físico. Apenas remove a classificação. **Compatível com o modelo desejado.**

### Impacto da futura FK RESTRICT

Com `lot_id ON DELETE RESTRICT` em `inventory_movements`, se o lote tiver movimentos no ledger, o DELETE físico falhará. A RPC deverá ser adaptada para:
1. Verificar `EXISTS(SELECT 1 FROM inventory_movements WHERE lot_id = p_lot_id)`
2. Se sim: rejeitar com `LOT_HAS_LEDGER_HISTORY`
3. Se não: DELETE físico (preservar comportamento para lotes sem histórico)

---

## H. Divergências entre comportamento atual e modelo desejado

### Resumo

| RPC | Altera quantity_in_stock? | Comportamento desejado | Divergência? |
|---|---|---|---|
| create_product_lot | NÃO | NÃO (apenas classificação) | **NÃO** |
| update_product_lot | NÃO | NÃO (apenas classificação) | **NÃO** |
| delete_product_lot | NÃO | NÃO (apenas classificação) | **NÃO** |

### Conclusão

**As três RPCs de lote NÃO alteram `products.quantity_in_stock`.** O relatório 4D original afirmava que `create_product_lot` e `update_product_lot` podiam alterar o total físico — isto foi reanalisado e **NÃO é o caso**. A validação `v_new_sum > v_product_stock` bloqueia qualquer tentativa de expandir o estoque físico via criação/edição de lote.

### Divergência identificada no relatório 4D original

O relatório 4D afirmou:
> "create_product_lot: SIM (ajusta total quando classificação muda)"
> "update_product_lot: SIM (ajusta total quando classificação muda)"

**CORREÇÃO:** Após análise detalhada do código SQL, `create_product_lot` e `update_product_lot` **NÃO** alteram `products.quantity_in_stock`. Apenas `create_product_with_lots` (INSERT inicial), `create_operation_with_stock` (consumo), `update_operation_with_stock` (delta) e `delete_operation_with_stock` (devolução) alteram `quantity_in_stock`.

### Tabela corrigida de caminhos de mutation

| Caminho | Altera products.quantity_in_stock | Altera product_lots.quantity |
|---|---|---|
| create_operation_with_stock | SIM (decrementa) | SIM (decrementa lotes alocados) |
| update_operation_with_stock | SIM (delta) | SIM (delta por lote) |
| delete_operation_with_stock | SIM (incrementa/devolve) | SIM (incrementa/devolve) |
| create_product_with_lots | SIM (INSERT com total inicial) | SIM (INSERT lotes) |
| create_product_lot | **NÃO** | SIM (INSERT novo lote) |
| update_product_lot | **NÃO** | SIM (UPDATE quantity) |
| delete_product_lot | **NÃO** | SIM (DELETE row) |
| update_product_details | NÃO (apenas metadados) | NÃO |

---

## I. Separação STOCK_IN / STOCK_OUT / CLASSIFICATION

### Três intenções distintas

#### 1. STOCK_IN — entrada física

Quantidade física entrou no estoque.

- **Altera:** `products.quantity_in_stock` (incrementa) e `product_lots.quantity` (incrementa, se lote informado)
- **Gera:** PHYSICAL movement com `quantity > 0`
- **movement_type:** `STOCK_IN`
- **Futuro:** pode congelar `unit_cost` informado pelo usuário

#### 2. STOCK_OUT — saída física

Quantidade física saiu do estoque.

- **Altera:** `products.quantity_in_stock` (decrementa) e `product_lots.quantity` (decrementa, se lote informado)
- **Gera:** PHYSICAL movement com `quantity < 0`
- **movement_type:** `STOCK_IN` com quantity negativa, ou `OPERATION_CONSUMPTION`, ou `ADJUSTMENT_OUT`

#### 3. LOT_CLASSIFICATION — reclassificação de rastreabilidade

Nenhuma quantidade física entrou ou saiu. Move quantidade entre untracked e lote.

- **Altera:** `product_lots.quantity` (incrementa ou decrementa)
- **NÃO altera:** `products.quantity_in_stock`
- **Gera:** CLASSIFICATION movements (par, net zero)
- **movement_type:** `LOT_CLASSIFICATION`

### Regra fundamental

**Nunca inferir STOCK_IN automaticamente porque usuário aumentou `quantity` de um lote.** A intenção deve ser explícita. Hoje, `create_product_lot` e `update_product_lot` apenas reclassificam (não alteram total físico), o que está correto. No futuro com ledger, estas operações devem gerar `LOT_CLASSIFICATION` movements, não `STOCK_IN`.

---

## J. create_product_with_lots — futura semântica

### Comportamento atual

`create_product_with_lots` cria um produto com `quantity_in_stock = SUM(lots) + untracked_quantity` e insere os lotes. É um INSERT inicial que estabelece o estoque físico.

### Futuro com ledger

Para NOVO produto criado já com estoque **antes do cutover** (instituição ainda não passou pelo ledger):
- Se o produto é criado antes do cutover da instituição: o produto fará parte do opening balance futuro. Não gerar movimentos agora.

Para NOVO produto criado já com estoque **depois do cutover** (instituição já passou pelo ledger):
- Não usar `OPENING_BALANCE` (reservado exclusivamente ao cutover)
- Gerar `STOCK_IN` ou `INITIAL_STOCK` equivalente

### Qual tipo é semanticamente melhor?

**Recomendação: `STOCK_IN`** com `source_type = 'manual'` e `reason = 'initial_stock'`.

Justificativa:
- `OPENING_BALANCE` deve ser reservado exclusivamente ao cutover
- `STOCK_IN` é semanticamente correto: estoque físico entrou
- `INITIAL_STOCK` como tipo separado adicionaria um enum desnecessário
- `reason = 'initial_stock'` distingue de outras entradas

### Fluxo futuro

1. `create_product_with_lots` (adaptada):
2. INSERT produto com `quantity_in_stock = 0`
3. Para cada lote: INSERT lote com `quantity = 0`
4. Se instituição já passou pelo cutover:
   a. Para cada lote: INSERT `STOCK_IN` movement (+quantity, lot_id)
   b. Para untracked: INSERT `STOCK_IN` movement (+untracked_quantity, lot_id=NULL)
   c. UPDATE `products.quantity_in_stock = total`
   d. UPDATE `product_lots.quantity` para cada lote
5. Se instituição NÃO passou pelo cutover: apenas INSERT produto e lotes com quantidades (fará parte do opening balance futuro)

---

## K. Regra OPENING_BALANCE

### Confirmado

`OPENING_BALANCE` só ocorre **UMA VEZ** no marco do ledger para os estoques já existentes.

### Regras

1. **Único cutover por instituição:** quando o ledger é ativado para uma instituição, todos os produtos com `quantity_in_stock > 0` recebem `OPENING_BALANCE` movements.
2. **Nunca repetido:** após o cutover, `OPENING_BALANCE` nunca é usado novamente.
3. **Produtos criados depois do cutover:** NUNCA usam `OPENING_BALANCE`. Usam `STOCK_IN` com `reason = 'initial_stock'`.
4. **Produtos com zero:** não recebem `OPENING_BALANCE`.
5. **Data:** `effective_at = ledger_started_at` para todos os movements de opening.

---

## L. Matemática CLASSIFICATION

### Modelo confirmado

Produto 500, untracked 300, lote A 200. Classificar 100 para lote B:

| Movimento | product_id | lot_id | quantity | movement_kind |
|---|---|---|---|---|
| 1 | P | NULL | -100 | CLASSIFICATION |
| 2 | P | B | +100 | CLASSIFICATION |

**SUM produto = -100 + 100 = 0.** Saldo físico total não muda.

**SUM lote B = +100.** Saldo do lote B aumenta 100.

**SUM untracked (lot_id IS NULL) = -100.** Saldo sem lote diminui 100.

### Regra

CLASSIFICATION sempre produz um par de movimentos compensados (net zero no nível do produto). Cada unidade física é contabilizada uma única vez.

---

## M. Saldo produto/lote/untracked

### Verificação matemática

Para qualquer produto P:

```
saldo_produto(P) = SUM(quantity WHERE product_id = P)
```

Este saldo inclui PHYSICAL e CLASSIFICATION movements. Mas CLASSIFICATION é sempre net zero, então:

```
saldo_produto(P) = SUM(quantity WHERE product_id = P AND kind = 'PHYSICAL')
```

Para qualquer lote L:

```
saldo_lote(L) = SUM(quantity WHERE lot_id = L)
```

Inclui CLASSIFICATION (que move quantidade para dentro do lote) e PHYSICAL (STOCK_IN para o lote).

Para untracked:

```
saldo_untracked(P) = SUM(quantity WHERE product_id = P AND lot_id IS NULL)
```

Inclui CLASSIFICATION (que move quantidade para fora do untracked, negativo) e PHYSICAL (STOCK_IN sem lote).

### Demonstrações com exemplos

#### Exemplo 1: Produto sem lotes

```
OPENING_BALANCE: product=P, lot=NULL, quantity=+500, kind=PHYSICAL

saldo_produto(P) = +500
saldo_untracked(P) = +500
saldo_lote(any) = 0
```

#### Exemplo 2: Produto totalmente rastreado

```
OPENING_BALANCE: product=P, lot=A, quantity=+300, kind=PHYSICAL
OPENING_BALANCE: product=P, lot=B, quantity=+200, kind=PHYSICAL

saldo_produto(P) = +300 + 200 = +500
saldo_lote(A) = +300
saldo_lote(B) = +200
saldo_untracked(P) = 0
```

#### Exemplo 3: Produto parcialmente rastreado após classificação

```
OPENING_BALANCE: product=P, lot=A, quantity=+200, kind=PHYSICAL
OPENING_BALANCE: product=P, lot=NULL, quantity=+300, kind=PHYSICAL
CLASSIFICATION: product=P, lot=NULL, quantity=-100, kind=CLASSIFICATION
CLASSIFICATION: product=P, lot=B, quantity=+100, kind=CLASSIFICATION

saldo_produto(P) = +200 + 300 - 100 + 100 = +500
saldo_lote(A) = +200
saldo_lote(B) = +100
saldo_untracked(P) = +300 - 100 = +200
SUM(lotes) = 200 + 100 = 300 <= 500 = saldo_produto ✓
```

#### Exemplo 4: Consumo por operação

```
(saldo anterior: produto=500, lote A=200, lote B=100, untracked=200)

OPERATION_CONSUMPTION: product=P, lot=A, quantity=-100, kind=PHYSICAL
OPERATION_CONSUMPTION: product=P, lot=B, quantity=-50, kind=PHYSICAL
OPERATION_CONSUMPTION: product=P, lot=NULL, quantity=-50, kind=PHYSICAL

saldo_produto(P) = 500 - 100 - 50 - 50 = 300
saldo_lote(A) = 200 - 100 = 100
saldo_lote(B) = 100 - 50 = 50
saldo_untracked(P) = 200 - 50 = 150
SUM(lotes) = 100 + 50 = 150 <= 300 = saldo_produto ✓
```

---

## N. Política futura de archive/delete lote

### Regras propostas

| Situação do lote | Ação permitida | Motivo |
|---|---|---|
| Lote sem movimentos no ledger | DELETE físico | Criado por engano, sem histórico |
| Lote com movimentos e quantity > 0 | NENHUMA (apenas editar) | Lote ativo com estoque |
| Lote com movimentos e quantity = 0 | ARQUIVAR (set archived_at) | Lote esgotado, preservar histórico |
| Lote com movimentos, qualquer quantity | DELETE físico BLOQUEADO | FK RESTRICT impede |

### Modelo futuro de archive

```
ALTER TABLE product_lots ADD COLUMN archived_at timestamptz NULL;
ALTER TABLE product_lots ADD COLUMN archived_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL;
```

Lote arquivado:
- `quantity` permanece 0 (ou o valor final)
- `archived_at` preenchido
- Não aparece na UI de lotes ativos
- Permanece no banco para referência do ledger
- `lot_number_snapshot` no ledger preserva redundância

### Regra simples e auditável

1. Se lote tem `inventory_movements`: DELETE proibido. Apenas archive.
2. Se lote não tem `inventory_movements`: DELETE permitido (erro de cadastro).
3. Archive só permitido se `quantity = 0`.
4. Unarchive não suportado (simplicidade).

---

## O. Schema inventory_movements revisado

| # | Coluna | Tipo | Nullable | Default | FK | ON DELETE | Finalidade |
|---|---|---|---|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() | — | — | PK |
| 2 | institution_id | uuid | NO | — | institutions(id) | RESTRICT | Isolamento RLS |
| 3 | product_id | uuid | NO | — | products(id) | RESTRICT | Produto movimentado |
| 4 | lot_id | uuid | YES | — | product_lots(id) | **RESTRICT** | Lote (NULL = untracked) |
| 5 | lot_number_snapshot | text | YES | — | — | — | Redundância auditável do lot_number |
| 6 | operation_id | uuid | YES | — | operations(id) | SET NULL | Operação que gerou o movimento |
| 7 | movement_group_id | uuid | NO | gen_random_uuid() | — | — | Correlação de movimentos do mesmo evento |
| 8 | movement_kind | text | NO | — | — | — | PHYSICAL / CLASSIFICATION |
| 9 | movement_type | text | NO | — | — | — | OPENING_BALANCE / STOCK_IN / etc. |
| 10 | quantity | numeric | NO | — | — | — | Signed: + entrada, - saída |
| 11 | unit_snapshot | text | **NO** | — | — | — | Unidade do produto no momento (sempre preenchido) |
| 12 | unit_cost | numeric | YES | — | — | — | Custo unitário informado (sem WAC automático) |
| 13 | total_cost | numeric | YES | — | — | — | quantity × unit_cost |
| 14 | reason | text | YES | — | — | — | Motivo curto (obrigatório para ADJUSTMENT) |
| 15 | notes | text | YES | — | — | — | Notas livres |
| 16 | source_type | text | NO | 'manual' | — | — | operation / opening_balance / manual / receipt |
| 17 | reversal_of | uuid | YES | — | inventory_movements(id) | SET NULL | Movimento revertido (self-reference) |
| 18 | idempotency_key | text | NO | — | — | — | Chave anti-duplicação |
| 19 | created_by | uuid | YES | — | auth.users(id) | SET NULL | Usuário responsável |
| 20 | created_at | timestamptz | NO | now() | — | — | Timestamp de registro |
| 21 | effective_at | timestamptz | NO | now() | — | — | Data real do evento |

### Mudanças em relação ao schema 4D original

| Coluna | 4D original | 4D.1 revisado | Motivo |
|---|---|---|---|
| lot_id FK | ON DELETE SET NULL | **ON DELETE RESTRICT** | Lote no ledger é histórico permanente |
| unit_snapshot | text NULL | **text NOT NULL** | Unidade histórica nunca deve mudar semanticamente |
| unit_cost | numeric NULL | numeric NULL (mantido) | Sem WAC automático, mas campo existe |
| lot_number_snapshot | text NULL | text NULL (mantido) | Redundância auditável aprovada |

### Constraints revisadas

| # | Nome | Tipo | Definição |
|---|---|---|---|
| 1 | ck_im_quantity_not_zero | CHECK | `quantity != 0` |
| 2 | ck_im_movement_kind | CHECK | `movement_kind IN ('PHYSICAL', 'CLASSIFICATION')` |
| 3 | ck_im_movement_type | CHECK | `movement_type IN ('OPENING_BALANCE', 'STOCK_IN', 'OPERATION_CONSUMPTION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL', 'LOT_CLASSIFICATION')` |
| 4 | ck_im_adjustment_reason | CHECK | `movement_type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') OR reason IS NOT NULL` |
| 5 | ck_im_source_type | CHECK | `source_type IN ('operation', 'opening_balance', 'manual', 'receipt')` |
| 6 | ck_im_reversal_type | CHECK | `reversal_of IS NULL OR movement_type = 'REVERSAL'` |
| 7 | ck_im_unit_snapshot_not_null | CHECK | `unit_snapshot IS NOT NULL` (implícito pela coluna NOT NULL) |
| 8 | uq_im_idempotency | UNIQUE | `(institution_id, idempotency_key)` |

---

## P. Opening balance simulado (2026-10-08 17:09:55 UTC)

| Métrica | Valor |
|---|---|
| Lotes com quantity > 0 | 171 |
| Produtos com untracked > 0 | 117 |
| **Total de movimentos OPENING_BALANCE** | **288** |
| Soma dos movimentos por lote | 213,560 |
| Soma dos movimentos untracked | 4,425,347.93 |
| **Soma total dos opening balances** | **4,638,907.93** |
| SUM(products.quantity_in_stock) | 4,638,907.93 |
| **Diferença** | **0 ✓** |

### Valores inalterados

Os valores são idênticos aos da ETAPA 4D (auditoria anterior). Nenhuma atividade legítima alterou os saldos entre as duas auditorias.

---

## Q. Riscos restantes

| # | Risco | Severidade | Mitigação |
|---|---|---|---|
| R1 | Double counting produto/lote | ALTA | Um movimento por (product, lot) allocation. Não criar movimento de total do produto. |
| R2 | Opening balance incorreto | ALTA | Validação pós-backfill: SUM(opening) = SUM(quantity_in_stock). ABORT se diff. Confirmado: 4,638,907.93 = 4,638,907.93 |
| R3 | RPC legacy fora do ledger | ALTA | Cutover atômico: todas as RPCs adaptadas na mesma migration. |
| R4 | Race condition | MÉDIA | Locks determinísticos (produto sorted, lote sorted). Já implementado. |
| R5 | Retroactive effective_at | MÉDIA | RPC rejeita effective_at > now(). Permite passado (NF de ontem). |
| R6 | Reversal duplicado | MÉDIA | RPC verifica NOT EXISTS(reversal_of = original). |
| R7 | Orphan source (operation deletada) | BAIXA | operation_id SET NULL. movement_group_id preserva UUID. Soft delete preferido (D1). |
| R8 | Cost valuation incorreto | BAIXO | Campos existem mas WAC não calculado automaticamente (D3). |
| R9 | Manual admin SQL desvia do ledger | BAIXO | Política operacional. service_role sempre pode. |
| R10 | 501 productId órfãos em operações legacy | BAIXO | Não gerar movimentos retroativos. Opening balance incorpora resultado. |
| R11 | products ainda tem grants diretos de UPDATE | MÉDIA | Fase E revoga UPDATE em products.quantity_in_stock. |
| R12 | Frontend ainda faz DELETE direto em products | BAIXO | deleteProduct faz .from('products').delete() — não altera quantity_in_stock. Fase E: criar RPC (D5). |
| R13 | operation_products vazia | BAIXO | Ignorar. products_used JSONB é a fonte. |
| R14 | Lote deletado perde referência no movimento | BAIXO | lot_id ON DELETE RESTRICT impede delete físico. Archive em vez de delete (N). |
| R15 | delete_product_lot falha com FK RESTRICT | MÉDIA | Adaptar RPC: verificar LOT_HAS_LEDGER_HISTORY antes de tentar DELETE. |
| R16 | Lotes atuais (171) sem movimentos podem ser deletados | BAIXO | Após cutover, lotes que receberem movimentos não podem mais ser deletados. Lotes sem movimentos podem. |
| R17 | Correção do relatório 4D: create/update/delete_product_lot NÃO alteram quantity_in_stock | — | Comportamento atual já é compatível com o modelo desejado. Nenhuma divergência. |

---

## R. Decisões ainda pendentes

| # | Decisão | Status |
|---|---|---|
| P1 | Quando implementar o ledger (Fase A-F)? | Pendente de aprovação humana |
| P2 | Qual timestamp exato para ledger_started_at de cada instituição? | Pendente |
| P3 | Criar RPC delete_product antes ou junto com o ledger? | Pendente (D5 aprovado, timing não) |
| P4 | Modelo de archive de lotes: coluna archived_at ou tabela separada? | Recomendação: coluna em product_lots. Pendente de aprovação. |
| P5 | Adicionar colunas status/cancelled_at/cancelled_by a operations antes ou junto com o ledger? | Pendente (D1 aprovado, timing não) |
| P6 | Como tratar os 501 productId órfãos no cutover? | Recomendação: ignorar (não criar placeholder). Pendente de confirmação. |

---

## S. STATUS

**PASS** — Projeto revisado e fechado. Decisões D1-D8 consolidadas. Decisão lot_id ON DELETE RESTRICT aprovada com análise de impacto. Divergência do relatório 4D original corrigida (RPCs de lote NÃO alteram quantity_in_stock). Schema revisado com unit_snapshot NOT NULL e lot_id RESTRICT. Opening balance simulado e verificado: 288 movimentos, soma = 4,638,907.93 = SUM(quantity_in_stock). Read-only confirmado. Nenhuma implementação executada.
