# ETAPA 3B — DESIGN DA RPC ATÔMICA DE CREATE OPERATION

**Data:** 2026-10-07
**READ-ONLY ABSOLUTO — Nenhuma alteração no banco nem no frontend.**

---

## A. Payload Atual do CREATE

O frontend (`addOperation` em AppContext.tsx L484-498) envia este INSERT:

| Coluna | Tipo | Nullable | Valor/Fonte no Frontend |
|---|---|---|---|
| area_id | uuid | NOT NULL | operation.areaId (URL param ou select) |
| season_id | uuid | NULL | activeSeason.id (context) |
| type | text | NOT NULL | operation.type (form select) |
| start_date | timestamptz | NOT NULL | dateToDateString(operation.startDate) |
| end_date | timestamptz | YES | dateToDateString(operation.endDate) |
| next_operation_date | timestamptz | YES | dateToDateString(operation.nextOperationDate) |
| description | text | NOT NULL | operation.description |
| operated_by | text | NOT NULL | operation.operatedBy |
| notes | text | YES | operation.notes |
| products_used | jsonb | YES | operation.productsUsed (array de ProductUsage) |
| operation_size | numeric | YES | operation.operationSize |
| yield_per_hectare | numeric | YES | operation.yieldPerHectare |
| seeds_per_hectare | numeric | YES | operation.seedsPerHectare |
| user_id | uuid | NOT NULL | user.id (auth.getUser) |
| institution_id | uuid | YES | userProfile.institution_id (SELECT user_profiles) |
| id | uuid | NO | default gen_random_uuid() |
| created_at | timestamptz | YES | default now() |
| updated_at | timestamptz | YES | default now() |

products_used format enviado:
```json
[{"productId":"<uuid>","lotId":"","quantity":50,"dose":2.5}]
```

---

## B. Schema Necessário (operations)

- **PK:** id (uuid, default gen_random_uuid())
- **NOT NULL:** area_id, type, start_date, description, operated_by, user_id
- **Nullable:** end_date, next_operation_date, notes, season_id, institution_id, products_used (default '[]'), operation_size, yield_per_hectare, seeds_per_hectare, created_at, updated_at
- **FKs:**
  - area_id → areas(id) ON DELETE RESTRICT
  - season_id → seasons(id) ON DELETE RESTRICT
  - institution_id → institutions(id) ON DELETE CASCADE
  - user_id → auth.users(id) ON DELETE CASCADE
- **CHECK constraints:** nenhuma encontrada.
- **Indexes:** não auditados (não relevantes para este design).

---

## C. Representação Real de lotId Ausente

Resultado da consulta:

| Condição | Count |
|---|---|
| Chave `lotId` ausente no JSON | 1453 |
| `lotId` = NULL (JSON null) | 1453 |
| `lotId` = "" (string vazia) | 0 |
| `lotId` = "null" | 0 |
| `lotId` com valor válido | 6 |

**Conclusão:** lotId ausente aparece como **chave ausente** no JSONB. O frontend envia `lotId: ''` (string vazia) no formulário, mas o JSONB gravado não contém a chave quando o valor é vazio — o Supabase JSONB serialização omite chaves com valor vazio ou null.

A futura RPC deve tratar tanto `NULL` quanto `""` como "sem lote" para compatibilidade.

---

## D. Regra products.quantity_in_stock

**Regra proposta:** se usage possui productId válido, baixar `products.quantity_in_stock` sempre.

**Isso reproduz o comportamento atual de useProducts? SIM.**

useProducts (L1021-1029) sempre faz UPDATE em products independentemente de lotId. A validação de estoque suficiente (L979) usa `product.quantityInStock` quando não há lotId.

---

## E. Regra product_lots

**Regra proposta:** se usage possui lotId válido, baixar também `product_lots.quantity`. Se NÃO possui lotId, NÃO tocar product_lots.

**Isso reproduz o comportamento atual de useProducts? SIM.**

useProducts (L990-998) só faz UPDATE em product_lots quando `usage.lotId` é truthy. Items sem lotId não tocam lotes.

---

## F. Autorização Institucional Necessária

A RPC deve derivar `caller_institution_id` de:
```sql
SELECT institution_id FROM public.user_profiles WHERE id = auth.uid()
```

Validações explícitas (não depender de RLS):

1. **Season:** `seasons.institution_id = caller_institution_id` AND `seasons.id = p_season_id`
2. **Area:** `areas.institution_id = caller_institution_id` AND `areas.id = p_area_id`
3. **Product:** `products.institution_id = caller_institution_id` AND `products.id = item.productId`
4. **Lot:** `product_lots.product_id = item.productId` (FK garante) E `products.institution_id = caller_institution_id` (via join com products)

product_lots **não possui** coluna `institution_id`. A filiação institucional do lote é derivada via `product_lots → products → institution_id`.

---

## G. user_id / institution_id Derivados do Auth

**user_id hoje:** preenchido com `user.id` de `supabase.auth.getUser()` — enviado pelo frontend.
**institution_id hoje:** preenchido com `userProfile.institution_id` de SELECT em user_profiles — enviado pelo frontend.

**RPC futura:** ambos derivados de `auth.uid()` e da consulta a `user_profiles`. Não confiar em valores do frontend.

**Compatível? SIM** — o frontend já busca esses valores do mesmo lugar. A RPC apenas move a busca para o servidor.

---

## H. SQL Pattern Atômico — products

```sql
UPDATE public.products
SET quantity_in_stock = quantity_in_stock - p_quantity,
    updated_at = now()
WHERE id = p_product_id
  AND institution_id = v_caller_institution_id
  AND quantity_in_stock >= p_quantity
RETURNING id, quantity_in_stock;
```

Se `RETURNING` vazio → RAISE EXCEPTION 'INSUFFICIENT_PRODUCT_STOCK'.

**Confirma eliminação de LOST UPDATE para products: SIM.** A operação `quantity_in_stock = quantity_in_stock - p_quantity` é atômica dentro do UPDATE. PostgreSQL adquire row lock. Dois UPDATEs concorrentes serializam automaticamente.

---

## I. SQL Pattern Atômico — lots

```sql
UPDATE public.product_lots
SET quantity = quantity - p_quantity,
    updated_at = now()
WHERE id = p_lot_id
  AND product_id = p_product_id
  AND quantity >= p_quantity
RETURNING id, quantity;
```

Validação institucional feita previamente via join:
```sql
SELECT 1 FROM product_lots pl
JOIN products p ON p.id = pl.product_id
WHERE pl.id = p_lot_id
  AND pl.product_id = p_product_id
  AND p.institution_id = v_caller_institution_id;
```

Se `RETURNING` do UPDATE vazio → RAISE EXCEPTION 'INSUFFICIENT_LOT_STOCK'.

**Confirma eliminação de LOST UPDATE do lote: SIM.** Mesmo padrão atômico.

---

## J. Ordem A/B Recomendada

**Recomendado: B — Validar/baixar stock → INSERT operation → retornar operation.**

Justificativa:
- Se o estoque é insuficiente, a operação nunca é criada. Não há row órfã em operations.
- Se o INSERT falha após baixar estoque, a transação faz rollback automático do estoque.
- Na ordem A (INSERT primeiro), se o estoque falha, é necessário rollback explícito ou exception — funcionalmente equivalente em uma function, mas B evita criar a row mesmo temporariamente.
- Em uma PostgreSQL function, ambas são transacionais. B é marginalmente mais seguro porque falha mais cedo.

---

## K. Duplicatas Encontradas + Estratégia

| Métrica | Count |
|---|---|
| Operações com productId duplicado | 0 |
| Operações com lotId duplicado | 0 |

Nenhum caso histórico de duplicata. Mas o frontend permite adicionar o mesmo produto duas vezes (não há validação que impede).

**Estratégia para a RPC:** agregar quantidades por `productId` antes de baixar de products, e por `productId + lotId` antes de baixar de lots. Isso evita que dois items do mesmo produto passem a validação de estoque individualmente mas excedam o total.

Exemplo: dois items com productId=X, quantity=60 cada. Estoque=100. Sem agregação: cada passa (60<=100). Com agregação: total=120 > 100 → rejeita.

---

## L. Validações de Input

| Condição | Comportamento |
|---|---|
| quantity <= 0 | REJECT |
| quantity NULL | REJECT |
| productId vazio ou NULL | REJECT |
| lotId vazio ou NULL | Tratar como "sem lote" (não rejeitar) |
| products_used não-array | REJECT |
| item não-objeto | REJECT |
| dose < 0 | REJECT |
| dose NULL | Tratar como 0 (compatível) |

Comportamento: REJECT WHOLE OPERATION em qualquer item inválido.

---

## M. Operação sem Produtos

**App permite criar operation com products_used = []?** Consulta mostra 0 operações com array vazio no histórico. Mas o frontend (OperationForm) permite submeter sem produtos (não há validação que obrige produto).

A RPC deve permitir INSERT da operation sem alteração de estoque quando `products_used` é `[]` ou `NULL`.

---

## N. Preço Histórico

**products_used atual NÃO possui preço histórico? SIM — não possui.**

Resultado: 0 items com `price`, 0 items com `unit`. Apenas 4 chaves: productId, lotId, quantity, dose.

Custo histórico hoje depende de `products.price` atual (OperationCard L88-89 lê `product.price` em tempo de execução). Isso será tratado posteriormente.

---

## O. Impacto no Offline

**A futura RPC de CREATE online pode ser introduzida sem alterar imediatamente sync offline? SIM.**

- `addOperation` online chamaria a RPC em vez do fluxo atual.
- `syncOperations` (offline sync) faz INSERT direto sem baixar estoque — continua usando fluxo antigo.
- O risco de manter online=RPC + offline=fluxo antigo é: **operações criadas offline não baixam estoque no sync**. O estoque local já foi ajustado no state React, mas o INSERT do sync não toca products/product_lots no banco. Quando `loadProducts` recarrega do banco, o estoque volta ao valor anterior (sem baixa). Isso já é um bug existente, não introduzido pela RPC.

---

## P. Idempotência

**ONLINE RPC: idempotency obrigatória agora? NÃO.** O CREATE online é uma chamada única com resposta síncrona. Se falha, o usuário refaz. Não há retry automático.

**OFFLINE: idempotency obrigatória antes de migrar sync? SIM.** O sync offline pode retryar. Sem idempotency key, um retry após sucesso parcial pode criar operação duplicada ou baixar estoque duas vezes.

---

## Q. Metadata SECURITY DEFINER

```
SECURITY DEFINER
OWNER: postgres
SET search_path = public, pg_temp
```

Permissões:
- PUBLIC: false
- anon: false
- authenticated: true (EXECUTE)
- service_role: não precisa (já bypassa RLS)

---

## R. Retorno Recomendado

Retornar a row completa criada em operations:
```sql
INSERT INTO public.operations (...) VALUES (...)
RETURNING *;
```

Isso é compatível com `addOperation` que hoje faz `.select().single()` e mapeia o resultado para React state. O frontend pode usar o retorno diretamente sem nova consulta.

---

## S. Categorias de Erro

| Categoria | Quando |
|---|---|
| AUTH_REQUIRED | auth.uid() IS NULL |
| PROFILE_NOT_FOUND | user_profiles não encontrado |
| PROFILE_NO_INSTITUTION | institution_id IS NULL |
| SEASON_NOT_FOUND_OR_FORBIDDEN | season não existe ou não pertence à instituição |
| AREA_NOT_FOUND_OR_FORBIDDEN | area não existe ou não pertence à instituição |
| PRODUCT_NOT_FOUND_OR_FORBIDDEN | productId não existe ou não pertence à instituição |
| LOT_NOT_FOUND_OR_MISMATCH | lotId não existe, product_id mismatch, ou instituição mismatch |
| INSUFFICIENT_PRODUCT_STOCK | quantity_in_stock < quantidade |
| INSUFFICIENT_LOT_STOCK | lot.quantity < quantidade |
| INVALID_PRODUCTS_USED | formato inválido, quantity <= 0, etc. |

**Falta alguma categoria essencial?** Não. As 10 categorias cobrem todos os cenários de falha.

---

## T. Baseline PRE/POST

| Tabela | Count | Soma/Items | Checksum |
|---|---|---|---|
| operations | 309 | 1459 items | fbf1eb1ad43d46437c87f0d98206cf75 |
| products | 217 | 4.617.076,08 stock | 3032ef9556d76996095e99876a36a38a |
| product_lots | 149 | 185.382,00 qty | bc7eaba42133b78cafd863cf8b2ee4fb |

PRE = POST. Nenhuma alteração.

---

## U. Riscos/Divergências

1. **product_lots não tem institution_id** — validação institucional do lote exige JOIN com products. Aceitável mas adiciona uma consulta.
2. **501 items históricos com productId órfão** — a RPC rejeitará CREATEs que incluam products inexistentes. Compatível com CREATE novo (não afeta histórico).
3. **122 produtos com stock > 0 e zero lotes** — a RPC baixará apenas products.quantity_in_stock para esses. Correto.
4. **Contradição de source of truth** — addLot/updateLot/deleteLot sobrescrevem quantity_in_stock com SUM(lots). A RPC trata quantity_in_stock como independente. Se um addLot rodar concorrentemente, pode sobrescrever a baixa da RPC. Risco P1.
5. **Sync offline não baixa estoque** — bug pré-existente. A RPC não piora nem resolve.

---

## V. Desenho Recomendado da Futura RPC (20 passos)

```
FUNCTION create_operation_with_stock(
  p_area_id uuid,
  p_season_id uuid,
  p_type text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_next_operation_date timestamptz,
  p_description text,
  p_operated_by text,
  p_notes text,
  p_products_used jsonb,
  p_operation_size numeric,
  p_yield_per_hectare numeric,
  p_seeds_per_hectare numeric
) RETURNS public.operations
```

1. Verificar `auth.uid()`. Se NULL → RAISE AUTH_REQUIRED.
2. Buscar `institution_id` em user_profiles WHERE id = auth.uid(). Se não achar → PROFILE_NOT_FOUND. Se institution_id NULL → PROFILE_NO_INSTITUTION.
3. Validar season: SELECT 1 FROM seasons WHERE id = p_season_id AND institution_id = v_institution. Se 0 rows → SEASON_NOT_FOUND_OR_FORBIDDEN.
4. Validar area: SELECT 1 FROM areas WHERE id = p_area_id AND institution_id = v_institution. Se 0 rows → AREA_NOT_FOUND_OR_FORBIDDEN.
5. Parse p_products_used como JSON array. Se não-array → INVALID_PRODUCTS_USED.
6. Se array vazio → pular para passo 16 (INSERT sem baixa).
7. Para cada item: validar productId não-vazio, quantity > 0, dose >= 0. Se inválido → INVALID_PRODUCTS_USED.
8. Agregar quantidades por productId (somar duplicates).
9. Para cada productId agregado: validar existência e instituição.
   ```sql
   SELECT 1 FROM products WHERE id = pid AND institution_id = v_institution
   ```
   Se 0 rows → PRODUCT_NOT_FOUND_OR_FORBIDDEN.
10. Baixar estoque de products atomicamente:
    ```sql
    UPDATE products SET quantity_in_stock = quantity_in_stock - agg_qty
    WHERE id = pid AND institution_id = v_institution AND quantity_in_stock >= agg_qty
    RETURNING id
    ```
    Se 0 rows → INSUFFICIENT_PRODUCT_STOCK.
11. Para items com lotId não-vazio: agregar por productId + lotId.
12. Para cada lot: validar existência, product_id match, e instituição via JOIN com products.
13. Baixar quantidade do lote atomicamente:
    ```sql
    UPDATE product_lots SET quantity = quantity - agg_lot_qty
    WHERE id = lot_id AND product_id = pid AND quantity >= agg_lot_qty
    RETURNING id
    ```
    Se 0 rows → INSUFFICIENT_LOT_STOCK.
14. Se todos os UPDATEs de products e lots retornaram rows → todo o estoque foi baixado.
15. Qualquer RAISE EXCEPTION até aqui → PostgreSQL faz rollback automático de todos os UPDATEs. Estado intacto.
16. INSERT em operations com user_id = auth.uid(), institution_id = v_institution, products_used = p_products_used.
17. RETURNING * → retorna a row criada.
18. O trigger update_operations_updated_at dispara normalmente (BEFORE UPDATE — não afeta INSERT).
19. Se INSERT falha → rollback automático de todos os UPDATEs de estoque.
20. Retornar a row completa para o frontend atualizar React state.

---

## W. STATUS: PASS

Design completo. PRE = POST. Nenhuma alteração no banco nem no frontend.

STOP.
