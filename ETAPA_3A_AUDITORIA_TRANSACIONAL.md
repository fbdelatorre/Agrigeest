# ETAPA 3A — AUDITORIA TRANSACIONAL: OPERAÇÕES + ESTOQUE + LOTES

**Data:** 2026-10-07
**READ-ONLY ABSOLUTO — Nenhuma alteração no banco nem no frontend.**

---

## A. CREATE OPERATION — Flow + Atomicidade

| Passo | Arquivo/Função | Tabela | Ação | Dados |
|---|---|---|---|---|
| 1 | OperationCreate.tsx → handleSubmit | — | Chama addOperation | — |
| 2 | AppContext.tsx → addOperation (L451) | — | Verifica activeSeason + auth | — |
| 3 | AppContext.tsx → addOperation (L458-460) | products + product_lots | **useProducts(productsUsed)** | Baixa estoque ANTES do INSERT |
| 4 | useProducts (L957) | — | Valida estoque suficiente (read from React state) | — |
| 5 | useProducts (L990-998) | product_lots | UPDATE lot.quantity = lot.quantity - usage.quantity (read-modify-write) | Um UPDATE por lot com lotId |
| 6 | useProducts (L1021-1029) | products | UPDATE quantity_in_stock = product.quantityInStock - usage.quantity (read-modify-write) | Um UPDATE por produto |
| 7 | AppContext.tsx → addOperation (L484-498) | operations | INSERT operation com products_used JSONB | — |

**CREATE É ATÔMICO? NÃO.**

Cenários de falha parcial:
1. **useProducts succeeds, INSERT operations fails**: estoque baixado, operação não criada. Estoque perdido sem registro.
2. **Algum UPDATE de lot falha parcialmente (Promise.all)**: alguns lotes baixados, outros não. Estado inconsistente.
3. **Algum UPDATE de product falha parcialmente**: idem para produtos.
4. **Lote baixado com sucesso, produto falha**: lot e product divergem.

---

## B. UPDATE OPERATION — Flow + Atomicidade

| Passo | Arquivo/Função | Tabela | Ação |
|---|---|---|---|
| 1 | OperationEdit.tsx → handleSubmit | — | Chama updateOperation |
| 2 | AppContext.tsx → updateOperation (L520) | — | Busca operação original |
| 3 | updateOperation (L525-533) | products + product_lots | Compara oldProducts vs newProducts (JSON.stringify) |
| 4 | Se changed: returnProducts(oldProducts) | products + product_lots | Devolve estoque antigo (read-modify-write) |
| 5 | Se changed: useProducts(newProducts) | products + product_lots | Baixa estoque novo (read-modify-write) |
| 6 | updateOperation (L560-565) | operations | UPDATE operations SET ... |

**UPDATE É ATÔMICO? NÃO.**

Cenários de falha parcial:
1. **returnProducts succeeds, useProducts fails, UPDATE operations fails**: estoque devolvido mas operação não atualizada. Estoque inflado.
2. **returnProducts succeeds, useProducts succeeds, UPDATE operations fails**: estoque devolvido E rebaixado mas operação ainda tem produtos antigos. Estoque correto mas JSON da operação errado.
3. **returnProducts partial fail**: alguns produtos devolvidos, outros não.
4. **useProducts partial fail**: alguns produtos baixados, outros não.
5. **Troca de area/safra sem alterar produtos**: productsUsed não muda (JSON.stringify igual), estoque não é tocado. Correto.

---

## C. DELETE OPERATION — Flow + Atomicidade

| Passo | Arquivo/Função | Tabela | Ação |
|---|---|---|---|
| 1 | OperationsList.tsx → handleDeleteOperation | — | Confirma + chama deleteOperation |
| 2 | AppContext.tsx → deleteOperation (L589) | — | Busca operação |
| 3 | deleteOperation (L592-594) | products + product_lots | **returnProducts(productsUsed)** ANTES do DELETE |
| 4 | returnProducts (L901) | product_lots | UPDATE lot.quantity = lot.quantity + usage.quantity (read-modify-write) |
| 5 | returnProducts (L937-944) | products | UPDATE quantity_in_stock = product.quantityInStock + usage.quantity (read-modify-write) |
| 6 | deleteOperation (L604) | operations | DELETE FROM operations WHERE id |

**DELETE É ATÔMICO? NÃO.**

Cenários de falha parcial:
1. **returnProducts succeeds, DELETE fails**: estoque devolvido mas operação ainda existe. Estoque inflado, operação pode ser excluída novamente devolvendo estoque duas vezes.
2. **returnProducts partial fail**: alguns produtos devolvidos, outros não.
3. **returnProducts fails, DELETE não executada**: operação permanece, estoque parcialmente devolvido.

---

## D. FORMATO products_used

Estrutura JSONB observada — 4 chaves em todos os 1459 items:

```
{ "productId": string, "lotId": string, "quantity": number, "dose": number }
```

- **309 operations** com products_used
- **1459 items** no total
- Formato único e consistente (sem variações históricas)
- `lotId` presente em apenas 6 items (1453 sem lotId)

---

## E. Referências Históricas

| Métrica | Valor |
|---|---|
| Items sem productId | 0 |
| Items sem lotId | 1453 de 1459 |
| Items com lotId (presente) | 6 |
| Items com lotId órfão (lote não existe) | 0 |
| Items com productId órfão (produto não existe) | 501 |

501 items referenciam produtos que não existem mais na tabela products. Histórico não pode ser usado para devolver estoque nesses casos.

---

## F. Writers de products.quantity_in_stock

| # | Arquivo/Função | Motivo | Tipo | Cálculo | Read-modify-write? | Proteção concorrência? |
|---|---|---|---|---|---|---|
| 1 | AppContext addProduct (L708-711) | Criar produto com lotes | UPDATE | SUM(lots) | Não — usa total calculado | Não |
| 2 | AppContext updateProduct (L731-740) | Editar produto | UPDATE | Valor direto do formulário | Não — valor do form | Não |
| 3 | AppContext syncProductTotalToDb (L802-807) | Recalcular após addLot/updateLot/deleteLot | UPDATE | SUM(lots) via React state | Sim — recomputeProductQuantity lê state | Não |
| 4 | AppContext useProducts (L1021-1029) | Baixar estoque (create/update operation) | UPDATE | product.quantityInStock - usage.quantity | **SIM** — lê do React state | **NÃO** |
| 5 | AppContext returnProducts (L937-944) | Devolver estoque (update/delete operation) | UPDATE | product.quantityInStock + usage.quantity | **SIM** — lê do React state | **NÃO** |
| 6 | AppContext syncProducts (L1167-1171) | Sync offline | UPDATE | Valor do estado local | Não | Não |

**Risco LOST UPDATE: SIM** — writers #4 e #5 leem `product.quantityInStock` do estado React, calculam o novo valor no frontend, e enviam o valor absoluto via UPDATE. Se dois usuários lerem o mesmo valor antes de um gravar, o segundo sobrescreve o primeiro.

---

## G. Writers de product_lots

| # | Arquivo/Função | Campo | Cálculo | Read-modify-write? | Proteção? |
|---|---|---|---|---|---|
| 1 | useProducts (L990-998) | quantity | lot.quantity - usage.quantity | **SIM** — lê do React state | **NÃO** |
| 2 | returnProducts (L906-914) | quantity | lot.quantity + usage.quantity | **SIM** — lê do React state | **NÃO** |
| 3 | addLot (L811-822) | INSERT | Novo lote | Não | Não |
| 4 | updateLot (L851-858) | quantity/lot_number/expiration | Valor do formulário | Não | Não |
| 5 | deleteLot (L882) | DELETE | — | Não | Não |

**Product e lot atualizados na MESMA transação PostgreSQL? NÃO.** Cada UPDATE é uma chamada Supabase separada. useProducts faz `Promise.all` dos UPDATEs de lots e depois `Promise.all` dos UPDATEs de products — duas rodadas independentes.

---

## H. Concorrência

**Cenário:** Estoque produto = 100. Usuário A baixa 10, Usuário B baixa 20 simultaneamente.

**products.quantity_in_stock:**
- A lê 100 (React state), calcula 90, UPDATE = 90
- B lê 100 (React state, ainda não atualizado), calcula 80, UPDATE = 80
- **Resultado: 80** (deveria ser 70)
- Classificação: **LOST UPDATE POSSIBLE**

**product_lots.quantity** (mesmo lote):
- A lê lot.quantity = 100, calcula 90, UPDATE = 90
- B lê lot.quantity = 100, calcula 80, UPDATE = 80
- **Resultado: 80** (deveria ser 70)
- Classificação: **LOST UPDATE POSSIBLE**

---

## I. Matriz de Falhas Parciais

| Ação | Passo que funcionou | Passo que falhou | Estado resultante | Severidade |
|---|---|---|---|---|
| CREATE | useProducts (baixa estoque) | INSERT operations | Estoque baixado sem operação | **P0** |
| CREATE | Baixa lot, falha product | Product não atualizado | Lot e product divergem | P1 |
| CREATE | Baixa primeiro lote, falha segundo | Segundo lote não baixado | Lotes divergem entre si | P1 |
| UPDATE | returnProducts (devolve) | useProducts (baixa novo) | Estoque devolvido, não rebaixado | **P0** |
| UPDATE | returnProducts + useProducts | UPDATE operations | Estoque correto, JSON errado | P1 |
| UPDATE | returnProducts parcial | Alguns produtos devolvidos | Estoque parcialmente inflado | P1 |
| DELETE | returnProducts (devolve) | DELETE operations | Estoque devolvido, operação existe | **P0** |
| DELETE | returnProducts parcial | Alguns produtos não devolvidos | Estoque parcialmente devolvido | P1 |
| DELETE | returnProducts falha | DELETE não executado | Operação existe, estoque intacto | P2 |

---

## J. RPC/Functions Existentes Relevantes

**Nenhuma function/RPC relacionada a operation, stock, inventory, product, lot, use_product ou return_product existe no banco.** Toda a lógica transacional está no frontend.

---

## K. Triggers Relevantes

| Tabela | Trigger | Função |
|---|---|---|
| operations | update_operations_updated_at | Atualiza updated_at (BEFORE UPDATE) |
| products | update_products_updated_at | Atualiza updated_at (BEFORE UPDATE) |
| product_lots | **Nenhum** | — |

**Nenhum trigger mantém estoque automaticamente.** Nenhuma trigger em product_lots.

---

## L. Fluxo Offline

| Pergunta | Resposta |
|---|---|
| Operation pode ser criada offline? | SIM — addOperation cria local-{id}, salva em localStorage |
| Editada offline? | SIM — updateOperation atualiza localStorage |
| Excluída offline? | SIM — deleteOperation remove de localStorage |
| Estoque é alterado localmente offline? | SIM — useProducts/returnProducts atualizam React state e localStorage, mas pulam UPDATEs do Supabase |
| Quando sincroniza? | syncData() ao voltar online (auto ou manual) |
| Sync reutiliza o mesmo fluxo? | **NÃO** — syncOperations faz INSERT/UPDATE direto sem chamar useProducts/returnProducts |
| Risco de baixa duplicada? | **SIM** — offline: useProducts atualiza state local. Sync: INSERT da operation sem baixar estoque novamente. Mas se o INSERT falhar e for retryado, pode duplicar. |
| Idempotency key? | **NÃO** — não existe. local-{Date.now()} como ID é único mas não impede re-processamento. |

**Risco adicional offline:** useProducts offline atualiza quantityInStock no state local. Quando syncProducts roda, envia o quantityInStock do estado local (que já reflete a baixa) via UPDATE. Se outro dispositivo alterou o estoque nesse meio tempo, LOST UPDATE.

---

## M. Source of Truth Atual

**COMPORTAMENTO DO CÓDIGO ATUAL: A. products.quantity_in_stock**

- OperationCard calcula custo lendo `product.price` (não lot).
- useProducts/returnProducts validam e atualizam `products.quantity_in_stock` como campo principal.
- Validação de estoque suficiente usa `product.quantityInStock` quando não há lotId.
- product_lots é secundário — só atualizado quando lotId é fornecido.
- recomputeProductQuantity (addLot/updateLot/deleteLot) recalcula products a partir de lots, sobrescrevendo quantity_in_stock.

**Contradição:** addLot/updateLot/deleteLot tratam SUM(lots) como source of truth e sobrescrevem quantity_in_stock. useProducts/returnProducts tratam quantity_in_stock como source of truth e ajustam lot e product independentemente.

**RECOMENDAÇÃO FUTURA (não implementar):** Criar uma RPC SECURITY DEFINER atômica que receba a operação e os produtos, faça INSERT/UPDATE da operação e baixa/devolve estoque em uma única transação PostgreSQL com advisory lock.

---

## N. Baseline Numérico

| Métrica | Valor |
|---|---|
| COUNT operations | 309 |
| COUNT products | 217 |
| COUNT product_lots | 149 |
| SUM products.quantity_in_stock | 4.617.076,08 |
| SUM product_lots.quantity | 185.382,00 |
| Products com stock > 0 e zero lots | 122 |
| Products divergentes (stock != SUM lots) | 125 |

---

## O. Count/Checksum PRE/POST

| Métrica | PRE | POST |
|---|---|---|
| COUNT operations | 309 | 309 |
| COUNT products | 217 | 217 |
| COUNT product_lots | 149 | 149 |
| CHECKSUM operations | fbf1eb1ad43d46437c87f0d98206cf75 | fbf1eb1ad43d46437c87f0d98206cf75 |
| CHECKSUM products | 3032ef9556d76996095e99876a36a38a | 3032ef9556d76996095e99876a36a38a |
| CHECKSUM product_lots | bc7eaba42133b78cafd863cf8b2ee4fb | bc7eaba42133b78cafd863cf8b2ee4fb |

PRE = POST. Nenhuma alteração.

---

## P. Riscos Classificados

**P0 — Crítico (perda de dados / estoque):**
1. CREATE: estoque baixado antes do INSERT da operação. Se INSERT falha, estoque perdido.
2. UPDATE: returnProducts + useProducts antes do UPDATE da operação. Se UPDATE falha, estoque inconsistente.
3. DELETE: returnProducts antes do DELETE. Se DELETE falha, estoque devolvido mas operação existe (pode devolver duas vezes).
4. LOST UPDATE em products.quantity_in_stock (read-modify-write sem lock).
5. LOST UPDATE em product_lots.quantity (read-modify-write sem lock).

**P1 — Alto (inconsistência parcial):**
6. Promise.all em UPDATEs de lotes/produtos — falha parcial deixa alguns atualizados e outros não.
7. product e lot não estão na mesma transação PostgreSQL.
8. Source of truth contraditório (quantity_in_stock vs SUM(lots)).
9. 501 items com productId órfão — returnProducts/useProducts não consegue devolver/baixar estoque.
10. Offline sync não reutiliza fluxo de estoque — pode aplicar ou pular baixa incorretamente.

**P2 — Médio (dados históricos):**
11. 1453 items sem lotId — não há rastreabilidade de lote.
12. 125 produtos divergentes entre stock e SUM(lots).
13. 122 produtos com stock > 0 e zero lotes.
14. Sem idempotency key em operações offline.

---

## Q. Recomendação da Próxima Etapa (sem implementar)

Criar uma RPC `SECURITY DEFINER` atômica (ex: `create_operation_with_stock`) que em uma única transação PostgreSQL:
1. Insere a operação
2. Baixa estoque de produtos e lotes com `UPDATE ... SET quantity = quantity - x WHERE id = ... AND quantity >= x` (atômico, sem read-modify-write)
3. Retorna erro se estoque insuficiente
4. Faz rollback automático se qualquer passo falhar

Depois refatorar update/delete para RPCs equivalentes. Por último, alinhar source of truth (decidir se quantity_in_stock é derivado de lots ou independente).

---

## R. Divergências

1. SUM(products.quantity_in_stock) = 4.617.076 vs SUM(product_lots.quantity) = 185.382 — divergência massiva, esperada dado histórico.
2. 125 produtos onde quantity_in_stock != SUM(lots) — produto sem lotes contribui (122), mais 3 com divergência real.
3. 501 items em products_used referenciam produtos excluídos — returnProducts não consegue devolver estoque.
4. Source of truth contraditório entre addLot (sobrescreve stock com SUM(lots)) e useProducts (ajusta stock independentemente).

---

## S. STATUS: PASS

Auditoria concluída sem alterações. PRE = POST em todas as tabelas. Nenhum dado modificado.

STOP.
