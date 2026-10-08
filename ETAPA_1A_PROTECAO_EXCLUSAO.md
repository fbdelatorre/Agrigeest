# ETAPA 1A — ANÁLISE DE PROTEÇÃO CONTRA EXCLUSÃO
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**Tipo:** Read-only (apenas SELECT e inspeção de código)
**Banco:** PRODUÇÃO — backup automático diário confirmado, PITR NÃO habilitado
**Status:** NENHUMA modificação foi executada. Nenhuma migration aplicada. Nenhum código alterado. Nenhum dado alterado.

---

### NOTA DE ESCOPO

> NÃO foram executados: INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE, GRANT, REVOKE.
> Nenhuma migration foi aplicada. Nenhum arquivo do aplicativo foi modificado.
> Nenhuma FK foi alterada. Nenhuma RLS foi alterada. Nenhuma RPC foi alterada.
> Apenas SELECTs, inspeção de metadados, e leitura de código-fonte foram executados.

---

## A. ESTADO ATUAL

O banco de dados AgriGest contém **775 registros de negócio** em 14 tabelas. A baseline é idêntica à documentada na Etapa 0. Existem **28 foreign keys**, sendo **25 ON DELETE CASCADE** e **3 ON DELETE SET NULL**. O frontend executa **10 funções de exclusão direta** mais **2 RPCs de exclusão**.

**RISCO PRINCIPAL:** Um único clique do usuário em "Excluir Safra" pode apagar até **194 operações** em cascata. Um clique em "Excluir Área" pode apagar até **16 operações**. O frontend **não avisa** sobre estas perdas.

---

## B. AS 28 FOREIGN KEYS (ESTADO REAL DO POSTGRESQL)

`[SCHEMA]` Inventário obtido via `pg_constraint` em 2026-10-07:

| # | Constraint | Source Table | Source Column | Target Table | Target Column | ON DELETE | ON UPDATE |
|---|---|---|---|---|---|---|---|
| 1 | areas_institution_id_fkey | areas | institution_id | institutions | id | CASCADE | NO ACTION |
| 2 | areas_user_id_fkey | areas | user_id | auth.users | id | CASCADE | NO ACTION |
| 3 | institutions_created_by_fkey | institutions | created_by | auth.users | id | SET NULL | NO ACTION |
| 4 | invitations_created_by_fkey | invitations | created_by | auth.users | id | SET NULL | NO ACTION |
| 5 | invitations_institution_id_fkey | invitations | institution_id | institutions | id | CASCADE | NO ACTION |
| 6 | invitations_used_by_fkey | invitations | used_by | auth.users | id | SET NULL | NO ACTION |
| 7 | machinery_institution_id_fkey | machinery | institution_id | institutions | id | CASCADE | NO ACTION |
| 8 | machinery_user_id_fkey | machinery | user_id | auth.users | id | CASCADE | NO ACTION |
| 9 | maintenances_institution_id_fkey | maintenances | institution_id | institutions | id | CASCADE | NO ACTION |
| 10 | maintenances_machinery_id_fkey | maintenances | machinery_id | machinery | id | CASCADE | NO ACTION |
| 11 | maintenances_maintenance_type_id_fkey | maintenances | maintenance_type_id | maintenance_types | id | CASCADE | NO ACTION |
| 12 | maintenances_user_id_fkey | maintenances | user_id | auth.users | id | CASCADE | NO ACTION |
| 13 | maintenance_types_institution_id_fkey | maintenance_types | institution_id | institutions | id | CASCADE | NO ACTION |
| 14 | maintenance_types_user_id_fkey | maintenance_types | user_id | auth.users | id | CASCADE | NO ACTION |
| 15 | notes_institution_id_fkey | notes | institution_id | institutions | id | CASCADE | NO ACTION |
| 16 | notes_user_id_fkey | notes | user_id | auth.users | id | CASCADE | NO ACTION |
| 17 | operation_products_operation_id_fkey | operation_products | operation_id | operations | id | CASCADE | NO ACTION |
| 18 | operation_products_product_id_fkey | operation_products | product_id | products | id | CASCADE | NO ACTION |
| 19 | operations_area_id_fkey | operations | area_id | areas | id | CASCADE | NO ACTION |
| 20 | operations_institution_id_fkey | operations | institution_id | institutions | id | CASCADE | NO ACTION |
| 21 | operations_season_id_fkey | operations | season_id | seasons | id | CASCADE | NO ACTION |
| 22 | operations_user_id_fkey | operations | user_id | auth.users | id | CASCADE | NO ACTION |
| 23 | product_lots_product_id_fkey | product_lots | product_id | products | id | CASCADE | NO ACTION |
| 24 | products_institution_id_fkey | products | institution_id | institutions | id | CASCADE | NO ACTION |
| 25 | seasons_institution_id_fkey | seasons | institution_id | institutions | id | CASCADE | NO ACTION |
| 26 | seasons_user_id_fkey | seasons | user_id | auth.users | id | CASCADE | NO ACTION |
| 27 | user_profiles_id_fkey | user_profiles | id | auth.users | id | CASCADE | NO ACTION |
| 28 | user_profiles_institution_id_fkey | user_profiles | institution_id | institutions | id | CASCADE | NO ACTION |

**Resumo:**
- CASCADE: 25 FKs
- SET NULL: 3 FKs (institutions.created_by, invitations.created_by, invitations.used_by)
- ON UPDATE: TODAS são NO ACTION

---

## C. CLASSIFICAÇÃO DE DADOS

| Tabela | Classificação | Justificativa |
|---|---|---|
| institutions | MASTER DATA | Entidade raiz; tudo depende dela |
| user_profiles | AUTH/SECURITY DATA | Vinculada a auth.users; contém role e is_admin |
| auth.users | AUTH/SECURITY DATA | Tabela interna do Supabase; credenciais |
| seasons | MASTER DATA | Entidade organizacional; operations dependem dela |
| areas | MASTER DATA + HISTORICAL | Contém dados de cultivo + geometry (1 área) |
| operations | HISTORICAL DATA | Registro irreversível de atividades agrícolas |
| operations.products_used | HISTORICAL DATA (JSONB) | Histórico de produtos usados; 1.459 itens |
| products | MASTER DATA + HISTORICAL | Cadastro de produtos + estoque |
| products.quantity_in_stock | HISTORICAL DATA | Estoque acumulado; 4.617.076 unidades |
| product_lots | DEPENDENT DATA | Lotes vinculados a products; 149 registros |
| operation_products | DEPENDENT DATA | Tabela vazia (0 registros); não usada pelo frontend |
| machinery | MASTER DATA | Cadastro de máquinas |
| maintenance_types | MASTER DATA | Tipos de manutenção |
| maintenances | HISTORICAL DATA | Registro de manutenções realizadas |
| notes | DEPENDENT DATA | Notas operacionais; 8 registros |
| invitations | DEPENDENT DATA | Convites temporários; 7 registros |

---

## D. DELETES DO FRONTEND

`[CÓDIGO]` Mapeamento completo de todas as funções de exclusão:

### D.1 — deleteArea (AppContext.tsx:419)

| Item | Valor |
|---|---|
| Arquivo | src/context/AppContext.tsx |
| Função | deleteArea |
| Tabela | areas |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em AreaDetail.tsx:39 e AreasList.tsx:22 |
| Mensagem de confirmação | "Tem certeza que deseja excluir esta área? **Todas as operações associadas permanecerão, mas não estarão mais vinculadas a esta área.**" |
| Dependências (CASCADE) | operations (TODAS as operações da área são DELETADAS) |
| **PROBLEMA** | A mensagem diz que as operações "permanecerão" — **MENTIRA**. O CASCADE DELETA as operações. O frontend não sabe disso. |
| Offline | Remove localmente, marca para sync. Sync NÃO envia deletes. |

### D.2 — deleteOperation (AppContext.tsx:581)

| Item | Valor |
|---|---|
| Arquivo | src/context/AppContext.tsx |
| Função | deleteOperation |
| Tabela | operations |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em OperationsList.tsx:42 e AreaDetail.tsx:49 |
| Mensagem | "Tem certeza que deseja excluir esta operação?" |
| Fluxo | 1. returnProducts() — devolve estoque 2. .delete().eq('id', id) |
| Dependências (CASCADE) | operation_products (vazia — sem impacto) |
| **PROBLEMA** | returnProducts() é executado ANTES do delete. Se delete falha, estoque já foi devolvido. |
| Offline | Remove localmente, marca para sync. Sync NÃO envia deletes. |

### D.3 — deleteProduct (AppContext.tsx:750)

| Item | Valor |
|---|---|
| Arquivo | src/context/AppContext.tsx |
| Função | deleteProduct |
| Tabela | products |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em InventoryList.tsx:82 |
| Mensagem | "Tem certeza que deseja excluir este produto?" |
| Dependências (CASCADE) | product_lots (TODOS os lotes do produto são DELETADOS) |
| **PROBLEMA** | Não avisa sobre lotes. Não avisa sobre referências em operations.products_used (JSONB) que ficarão órfãs. |
| Offline | Remove localmente, marca para sync. Sync NÃO envia deletes. |

### D.4 — deleteLot (AppContext.tsx:861)

| Item | Valor |
|---|---|
| Arquivo | src/context/AppContext.tsx |
| Função | deleteLot |
| Tabela | product_lots |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em LotManager.tsx:115 |
| Mensagem | "Tem certeza que deseja excluir este lote?" |
| Dependências | Nenhuma (product_lots é folha) |
| Pós-delete | recomputeProductQuantity() + syncProductTotalToDb() recalculam estoque |
| **SEM PROBLEMA** | Operação isolada, sem cascade. |

### D.5 — deleteSeason (Settings.tsx:508)

| Item | Valor |
|---|---|
| Arquivo | src/pages/Settings.tsx |
| Função | handleDeleteSeason |
| Tabela | seasons |
| Filtro | `.eq('id', seasonId)` |
| Confirmação ao usuário | SIM — `confirm()` em Settings.tsx:509 |
| Mensagem | "Tem certeza que deseja excluir esta safra? Esta ação não pode ser desfeita." |
| Dependências (CASCADE) | operations (TODAS as operações da safra são DELETADAS) |
| **PROBLEMA CRÍTICO** | Não avisa que TODAS as operações da safra serão apagadas. Safra "2025-2026" tem 194 operações. |
| **NÃO passa por Context** | Delete executado diretamente na página Settings, não via AppContext. |

### D.6 — deleteMachinery (MachineryContext.tsx:313)

| Item | Valor |
|---|---|
| Arquivo | src/context/MachineryContext.tsx |
| Função | deleteMachinery |
| Tabela | machinery |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em MachineryDetail.tsx:42 e MachineryList.tsx:22 |
| Mensagem | "Tem certeza que deseja excluir esta máquina?" |
| Dependências (CASCADE) | maintenances (TODAS as manutenções da máquina são DELETADAS) |
| **PROBLEMA** | Não avisa sobre manutenções que serão apagadas. |
| Offline | Remove localmente, marca para sync. Sync é STUB (não envia nada). |

### D.7 — deleteMaintenanceType (MachineryContext.tsx:466)

| Item | Valor |
|---|---|
| Arquivo | src/context/MachineryContext.tsx |
| Função | deleteMaintenanceType |
| Tabela | maintenance_types |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em MaintenanceList.tsx:43 |
| Mensagem | (presumido) "Tem certeza que deseja excluir este tipo de manutenção?" |
| Dependências (CASCADE) | maintenances (TODAS as manutenções daquele tipo são DELETADAS) |
| **PROBLEMA** | Não avisa sobre manutenções que serão apagadas. |
| Offline | Remove localmente, marca para sync. Sync é STUB. |

### D.8 — deleteMaintenance (MachineryContext.tsx:640)

| Item | Valor |
|---|---|
| Arquivo | src/context/MachineryContext.tsx |
| Função | deleteMaintenance |
| Tabela | maintenances |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em MaintenanceList.tsx:43 |
| Dependências | Nenhuma (maintenances é folha) |
| Offline | Remove localmente, marca para sync. Sync é STUB. |

### D.9 — deleteNote (NotesContext.tsx:244)

| Item | Valor |
|---|---|
| Arquivo | src/context/NotesContext.tsx |
| Função | deleteNote |
| Tabela | notes |
| Filtro | `.eq('id', id)` |
| Confirmação ao usuário | SIM — `window.confirm()` em NotesList.tsx:28 |
| Dependências | Nenhuma (notes é folha) |
| Offline | Remove localmente, marca para sync. Sync é PARCIAL (recarrega do DB, não re-envia). |

### D.10 — Exclusões em componentes sem passar pelos Contexts

`[CÓDIGO]` A exclusão de safra (handleDeleteSeason) é feita **diretamente em Settings.tsx** sem passar por nenhum Context. Isto significa que não há camada de abstração para validar, auditar, ou interceptar a exclusão.

**Nenhuma outra exclusão direta foi encontrada fora dos Contexts.**

### D.11 — GeometryManager.tsx (não é delete de dados)

`[CÓDIGO]` O `confirm()` em GeometryManager.tsx:123 é para **limpar a geometria do mapa** (clearGeometry), não para deletar a área. Não é uma exclusão de dados de negócio.

---

## E. DELETES DAS RPCs

`[SCHEMA]` Funções PostgreSQL que contêm `DELETE FROM`:

### E.1 — delete_invitation

| Item | Valor |
|---|---|
| Nome | delete_invitation |
| SECURITY | SECURITY DEFINER |
| Tabela afetada | invitations |
| WHERE | `code = invitation_code AND institution_id = target_institution_id` |
| Verificação de auth | SIM — verifica se `auth.uid()` é admin da mesma instituição |
| Quem pode executar | anon, authenticated, public (EXECUTE grant) |
| Dados apagados indiretamente | Nenhum (invitations é folha — não há FKs apontando PARA ela) |
| **AVALIAÇÃO** | Segura. Verifica permissão. Dados afetados são convites temporários. |

### E.2 — clean_expired_invitations

| Item | Valor |
|---|---|
| Nome | clean_expired_invitations |
| SECURITY | SECURITY DEFINER |
| Tabela afetada | invitations |
| WHERE | `expires_at <= timezone('UTC', now()) AND used_at IS NULL` |
| Verificação de auth | NÃO — não verifica auth.uid(). Qualquer chamador pode executar. |
| Quem pode executar | anon, authenticated, public (EXECUTE grant) |
| Dados apagados | Convites expirados não utilizados |
| **AVALIAÇÃO** | RISCO MÉDIO — não verifica auth, mas só deleta convites expirados. Impacto limitado. |

### E.3 — lockrow / unlockrows

| Item | Valor |
|---|---|
| Nome | lockrow, unlockrows |
| SECURITY | SECURITY INVOKER |
| Origem | Funções internas do Supabase Realtime (não de negócio) |
| **AVALIAÇÃO** | Não relevante para proteção de dados de negócio. |

---

## F. ÁRVORES DE CASCADE (SIMULAÇÃO LÓGICA)

`[SELECT]` Contagens ATUAIS de registros que seriam afetados por cada delete:

### F.1 — DELETE institution

```
DELETE institution
  ↓ CASCADE
  areas (44 total, variável por instituição)
  operations (309 total, variável)
  products (217 total, variável)
    ↓ CASCADE
    product_lots (149 total, variável)
  seasons (5 total, variável)
  machinery (19 total, variável)
  maintenance_types (2 total, variável)
    ↓ CASCADE
    maintenances (3 total, variável)
  notes (8 total, variável)
  invitations (7 total, variável)
  user_profiles (6 total, variável)
```

**Impacto por instituição `[SELECT]`:**

| Instituição | Áreas | Operations | Products | Lots | Seasons | Machinery | Maints | MaintTypes | Notes | Invits | Profiles |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Grupo Delatorre | 26 | 201 | 188 | 137 | 3 | 4 | 1 | 1 | 8 | 5 | 4 |
| Faz. São Pedro | 18 | 108 | 29 | 12 | 2 | 15 | 2 | 1 | 0 | 1 | 2 |
| Sao Joao | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| b610d2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| sao pedro | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Girassol | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |

**RISCO CRÍTICO:** Deletar "Grupo Delatorre" apagaria **575 registros** em cascata.

### F.2 — DELETE user (auth.users)

```
DELETE auth.users
  ↓ CASCADE
  user_profiles (1 perfil)
  areas (áreas onde user_id = este usuário)
    ↓ CASCADE
    operations (operações dessas áreas)
  operations (operações onde user_id = este usuário)
  seasons (safras onde user_id = este usuário)
    ↓ CASCADE
    operations (operações dessas safras)
  machinery (máquinas onde user_id = este usuário)
  maintenance_types (tipos onde user_id = este usuário)
    ↓ CASCADE
    maintenances (manutenções desses tipos)
  maintenances (manutenções onde user_id = este usuário)
  notes (notas onde user_id = este usuário)
  ↓ SET NULL
  institutions.created_by → NULL
  invitations.created_by → NULL
  invitations.used_by → NULL
```

**RISCO ALTO:** Deletar um usuário pode apagar áreas, operações, safras, máquinas, e notas — dependendo de quais registros têm `user_id` igual ao usuário deletado.

### F.3 — DELETE season

```
DELETE season
  ↓ CASCADE
  operations (TODAS as operações da safra)
```

**Contagens atuais `[SELECT]`:**

| Safra | Operações que seriam DELETADAS |
|---|---|
| 2025-2026 | **194** |
| 25-26 | **108** |
| safrinha 2026 | **5** |
| SAFRA 2026/2027 | **2** |
| 26-27 | **0** |

**RISCO CRÍTICO:** Deletar a safra "2025-2026" apaga **194 operações** — 63% de todo o histórico operacional.

### F.4 — DELETE area

```
DELETE area
  ↓ CASCADE
  operations (TODAS as operações da área)
```

**Top 10 áreas com mais operações `[SELECT]`:**

| Área | Operações |
|---|---|
| STEFANELLO | 16 |
| FUGANTE | 12 |
| ILSON LADO 600 | 12 |
| ALEX | 12 |
| 400 | 11 |
| 300 MINGORI | 11 |
| 525 | 11 |
| 600 LADO ILSON | 10 |
| ILSON LADO SEDE | 10 |
| SANTIN | 10 |

**Áreas sem operações (seguras para deletar):** 4 áreas (Arlindo, Atraz da sede total, Sede e lado da boa esperança, Boa esperança divisa arlindo)

**RISCO CRÍTICO:** Deletar qualquer uma das 40 áreas com operações apaga histórico irreversível.

### F.5 — DELETE operation

```
DELETE operation
  ↓ CASCADE
  operation_products (0 registros — tabela vazia, sem impacto)
```

**SEM RISCO DE CASCADE.** Operations é folha na árvore de FKs (apenas operation_products depende dela, e está vazia).

### F.6 — DELETE product

```
DELETE product
  ↓ CASCADE
  product_lots (TODOS os lotes do produto)
```

**Produtos com mais lotes `[SELECT]`:** Até 7 lotes por produto (PD). 95 produtos têm pelo menos 1 lote. 122 produtos têm 0 lotes.

**Referências em JSONB:** operations.products_used contém `productId` que aponta para o produto deletado. O JSONB NÃO é afetado pelo CASCADE — a referência fica órfã.

### F.7 — DELETE product_lot

```
DELETE product_lot
  (sem cascade — product_lots é folha)
```

**SEM RISCO DE CASCADE.**

### F.8 — DELETE machinery

```
DELETE machinery
  ↓ CASCADE
  maintenances (TODAS as manutenções da máquina)
```

**Contagens `[SELECT]`:** 3 máquinas têm 1 manutenção cada. 16 máquinas têm 0 manutenções.

### F.9 — DELETE maintenance_type

```
DELETE maintenance_type
  ↓ CASCADE
  maintenances (TODAS as manutenções daquele tipo)
```

**Contagens `[SELECT]`:** "Troca de óleo" tem 2 manutenções. "Troca de Óleo do Motor" tem 1 manutenção.

### F.10 — DELETE note

```
DELETE note
  (sem cascade — notes é folha)
```

**SEM RISCO DE CASCADE.**

---

## G. ANÁLISE ESPECÍFICA — EXCLUSÃO DE SAFRA

### G.1 — Perguntas e respostas

| Pergunta | Resposta |
|---|---|
| Usuário consegue excluir safra? | **SIM** — Settings.tsx:508, handleDeleteSeason |
| Existe confirmação? | **SIM** — `confirm("Tem certeza que deseja excluir esta safra? Esta ação não pode ser desfeita.")` |
| Quais operações seriam apagadas? | **TODAS** as operações com `season_id = id da safra` via CASCADE |
| Outros dados seriam apagados? | **NÃO** — apenas operations (e operation_products, que está vazia) |
| Quantidade atual de operações por safra | 194 + 108 + 5 + 2 + 0 = 309 |
| Existe safra sem operações? | **SIM** — "26-27" tem 0 operações |
| Frontend sabe que operações serão apagadas? | **NÃO** — a mensagem diz apenas "Esta ação não pode ser desfeita" sem mencionar operações |
| Banco impede alguma dessas exclusões? | **NÃO** — CASCADE é automático, não há RESTRICT |

### G.2 — Veredicto

**CRÍTICO.** O usuário pode apagar 194 operações históricas com um único clique. A mensagem de confirmação **não menciona** que as operações serão perdidas. O banco não impede a exclusão.

---

## H. ANÁLISE ESPECÍFICA — EXCLUSÃO DE ÁREA

### H.1 — Perguntas e respostas

| Pergunta | Resposta |
|---|---|
| Quantas operations dependem de cada área? | De 0 a 16 (ver Seção F.4) |
| Excluir área apagaria operações? | **SIM** — via CASCADE |
| Geometry seria perdida? | **SIM** — apenas 1 área tem geometry; se for essa, a geometria é perdida |
| Existe confirmação? | **SIM** — `confirm("Tem certeza que deseja excluir esta área?")` |
| Existe área sem histórico? | **SIM** — 4 áreas têm 0 operações |
| Frontend avisa sobre histórico relacionado? | **NÃO** — pior, diz que "as operações permanecerão, mas não estarão mais vinculadas" — **MENTIRA** |

### H.2 — Veredicto

**CRÍTICO.** A mensagem de confirmação é **ATIVAMENTE ENGANOSA**. Diz que as operações "permanecerão" quando na verdade serão **DELETADAS** pelo CASCADE. Isto é um bug de UX que pode causar perda de dados irreversível.

---

## I. ANÁLISE ESPECÍFICA — EXCLUSÃO DE PRODUTO

### I.1 — Perguntas e respostas

| Pergunta | Resposta |
|---|---|
| Quantos product_lots seriam apagados? | Variável: 0 a 7 por produto (95 produtos têm lotes) |
| Impacto em products_used JSONB? | O JSONB em operations NÃO é afetado pelo CASCADE. O `productId` no JSONB fica órfão. |
| Impacto em operation_products? | CASCADE deletaria registros com `product_id = id`. Tabela está vazia — sem impacto. |
| Referências históricas permanecem no JSONB? | **SIM** — o JSONB permanece, mas aponta para um produto que não existe mais |
| Isso explica parte dos 501 productIds inválidos atuais? | **HIPÓTESE — NÃO COMPROVADA.** É plausível que produtos deletados no passado tenham deixado referências órfãs no JSONB. No entanto, não há como provar因果idade sem auditoria de logs (indisponíveis). A correlação é consistente mas não conclusiva. |

### I.2 — Veredicto

**ALTO.** Deletar um produto apaga seus lotes (perda de dados de estoque) e cria referências órfãs no histórico de operações. O frontend não avisa sobre nenhum dos dois.

---

## J. ANÁLISE ESPECÍFICA — EXCLUSÃO DE OPERAÇÃO

### J.1 — Perguntas e respostas

| Pergunta | Resposta |
|---|---|
| Devolução de estoque? | **SIM** — returnProducts() é chamado antes do delete |
| Momento da devolução? | **ANTES** do delete — linha 584-585 |
| Momento do DELETE? | **DEPOIS** — linha 596 |
| Comportamento se DELETE falhar? | **INCONSISTÊNCIA** — estoque já foi devolvido, mas a operação ainda existe. O usuário vê a operação, mas o estoque foi incrementado. |
| operation_products relacionados? | Tabela vazia — sem impacto |
| Histórico perdido? | **SIM** — a operação e seu products_used JSONB são permanentemente deletados |
| Possibilidade de inconsistência? | **SIM** — se returnProducts() succeede mas delete falha, estoque está inconsistente |

### J.2 — Fluxo detalhado

```
deleteOperation(id):
  1. operation = find(op => op.id === id)
  2. if operation.productsUsed.length > 0:
     returnProducts(operation.productsUsed)  ← ESTOQUE DEVOLVIDO
  3. supabase.from('operations').delete().eq('id', id)  ← DELETE
  4. updatedOperations = operations.filter(op => op.id !== id)
```

Se passo 3 falha: estoque foi devolvido (passo 2) mas operação ainda existe. O usuário vê a operação na lista, mas o estoque foi incrementado. **Inconsistência silenciosa.**

### J.3 — Veredicto

**ALTO.** A operação não é atômica. Há risco de inconsistência de estoque se o delete falhar após a devolução.

---

## K. AVALIAÇÃO DE SOFT DELETE

### K.1 — Avaliação por tabela

| Tabela | Recomendação | Justificativa |
|---|---|---|
| seasons | **RECOMENDADO** | Deletar safra apaga 194 operações em cascata. Soft delete permitiria preservar o histórico. |
| areas | **RECOMENDADO** | Deletar área apaga até 16 operações. Soft delete preservaria o vínculo. |
| operations | **RECOMENDADO** | Histórico irreversível. Soft delete permitiria "desfazer" exclusões acidentais. |
| products | **RECOMENDADO** | Deletar produto apaga lotes e cria órfãos no JSONB. Soft delete preservaria lotes e referências. |
| product_lots | **PRECISA INVESTIGAÇÃO** | Lotes podem ser legitimamente descartados quando vazios. Soft delete pode ser excessivo. |
| machinery | **RECOMENDADO** | Deletar máquina apaga manutenções. Soft delete preservaria histórico. |
| maintenances | **RECOMENDADO** | Histórico de manutenção é irreversível. |
| notes | **NÃO NECESSÁRIO** | Notas são efêmeras por natureza. 8 registros apenas. Soft delete adiciona complexidade sem benefício significativo. |

### K.2 — Campos propostos (NÃO implementados)

```sql
deleted_at timestamptz NULL
deleted_by uuid NULL  -- REFERENCES auth.users(id) ON DELETE SET NULL
```

### K.3 — Considerações

- Soft delete requer que TODAS as queries do frontend filtrem `WHERE deleted_at IS NULL`
- Soft delete requer que o frontend tenha uma forma de "restaurar" registros
- Soft delete NÃO substitui a correção das FKs CASCADE — ambas são necessárias
- Soft delete adiciona complexidade ao schema e ao código

---

## L. RECOMENDAÇÃO INDIVIDUAL DAS 28 FKs

### L.1 — FKs para MANTER CASCADE (10)

| FK | Justificativa |
|---|---|
| operation_products_operation_id_fkey | Tabela vazia, dependência legítima |
| operation_products_product_id_fkey | Tabela vazia, dependência legítima |
| invitations_institution_id_fkey | Convites sem instituição não fazem sentido |
| notes_institution_id_fkey | Notas sem instituição não fazem sentido |
| notes_user_id_fkey | Notas sem usuário não fazem sentido |
| maintenance_types_institution_id_fkey | Tipos sem instituição não fazem sentido |
| maintenance_types_user_id_fkey | Tipos sem usuário não fazem sentido |
| maintenances_institution_id_fkey | Manutenções sem instituição não fazem sentido |
| maintenances_user_id_fkey | Manutenções sem usuário não fazem sentido |
| products_institution_id_fkey | Produtos sem instituição não fazem sentido |

### L.2 — FKs para ALTERAR PARA RESTRICT (11)

| FK | Justificativa |
|---|---|
| operations_season_id_fkey | **CRÍTICO** — deletar safra apaga até 194 operações. RESTRICT obriga a verificar antes. |
| operations_area_id_fkey | **CRÍTICO** — deletar área apaga até 16 operações. RESTRICT obriga a verificar antes. |
| operations_institution_id_fkey | Deletar instituição apaga operações históricas. |
| areas_institution_id_fkey | Deletar instituição apaga áreas e suas operações em cascata. |
| seasons_institution_id_fkey | Deletar instituição apaga safras e suas operações em cascata. |
| machinery_institution_id_fkey | Deletar instituição apaga máquinas e manutenções. |
| user_profiles_institution_id_fkey | Deletar instituição apaga perfis de usuário. |
| product_lots_product_id_fkey | Deletar produto apaga lotes (perda de dados de estoque). |
| maintenances_machinery_id_fkey | Deletar máquina apaga manutenções (perda de histórico). |
| maintenances_maintenance_type_id_fkey | Deletar tipo apaga manutenções (perda de histórico). |
| operations_user_id_fkey | Deletar usuário apaga operações que ele registrou. |

### L.3 — FKs para MANTER SET NULL (3)

| FK | Justificativa |
|---|---|
| institutions_created_by_fkey | SET NULL é correto — preserva a instituição mesmo se o criador for deletado |
| invitations_created_by_fkey | SET NULL é correto — preserva o convite mesmo se o criador for deletado |
| invitations_used_by_fkey | SET NULL é correto — preserva o registro de uso mesmo se o usuário for deletado |

### L.4 — FKs que PRECISAM INVESTIGAÇÃO (4)

| FK | Justificativa |
|---|---|
| areas_user_id_fkey | CASCADE deleta áreas do usuário. Mas áreas são institucionais, não pessoais. Precisa investigar se áreas devem sobreviver à deleção do usuário. |
| seasons_user_id_fkey | CASCADE deleta safras do usuário. Mas safras são institucionais. Precisa investigar. |
| machinery_user_id_fkey | CASCADE deleta máquinas do usuário. Mas máquinas são institucionais. Precisa investigar. |
| user_profiles_id_fkey | CASCADE deleta o perfil quando o auth.user é deletado. Isto é padrão do Supabase, mas pode ser preferível SET NULL para preservar dados. |

---

## M. PROPOSTA DE MIGRATION (NÃO EXECUTADA)

> **IMPORTANTE:** Esta é uma PROPOSTA. Nenhum arquivo de migration foi criado. Nenhum SQL foi executado.

### M.1 — Objetivo

Alterar 11 FKs de CASCADE para RESTRICT, adicionar soft delete em 7 tabelas, e corrigir as mensagens de confirmação do frontend — SEM PERDER NENHUM DADO.

### M.2 — Estrutura da migration proposta

```sql
-- Migration: protect_historical_data_from_cascade
-- Data: [FUTURO]
-- Objetivo: Prevenir exclusão acidental de dados históricos

-- PASSO 1: Adicionar colunas de soft delete (EXPAND — não destrutivo)
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

ALTER TABLE areas ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE areas ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

ALTER TABLE operations ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

ALTER TABLE machinery ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE machinery ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE maintenances ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

-- PASSO 2: Alterar FKs de CASCADE para RESTRICT
-- (Cada ALTER separado para permitir rollback granular)

ALTER TABLE operations DROP CONSTRAINT operations_season_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_season_id_fkey
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE RESTRICT;

ALTER TABLE operations DROP CONSTRAINT operations_area_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_area_id_fkey
  FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE RESTRICT;

ALTER TABLE operations DROP CONSTRAINT operations_institution_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT;

ALTER TABLE areas DROP CONSTRAINT areas_institution_id_fkey;
ALTER TABLE areas ADD CONSTRAINT areas_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT;

ALTER TABLE seasons DROP CONSTRAINT seasons_institution_id_fkey;
ALTER TABLE seasons ADD CONSTRAINT seasons_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT;

ALTER TABLE machinery DROP CONSTRAINT machinery_institution_id_fkey;
ALTER TABLE machinery ADD CONSTRAINT machinery_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT;

ALTER TABLE user_profiles DROP CONSTRAINT user_profiles_institution_id_fkey;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_institution_id_fkey
  FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE RESTRICT;

ALTER TABLE product_lots DROP CONSTRAINT product_lots_product_id_fkey;
ALTER TABLE product_lots ADD CONSTRAINT product_lots_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE maintenances DROP CONSTRAINT maintenances_machinery_id_fkey;
ALTER TABLE maintenances ADD CONSTRAINT maintenances_machinery_id_fkey
  FOREIGN KEY (machinery_id) REFERENCES machinery(id) ON DELETE RESTRICT;

ALTER TABLE maintenances DROP CONSTRAINT maintenances_maintenance_type_id_fkey;
ALTER TABLE maintenances ADD CONSTRAINT maintenances_maintenance_type_id_fkey
  FOREIGN KEY (maintenance_type_id) REFERENCES maintenance_types(id) ON DELETE RESTRICT;

ALTER TABLE operations DROP CONSTRAINT operations_user_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

-- PASSO 3: Adicionar índices nas colunas deleted_at para performance
CREATE INDEX IF NOT EXISTS idx_seasons_deleted_at ON seasons(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_areas_deleted_at ON areas(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operations_deleted_at ON operations(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON products(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_machinery_deleted_at ON machinery(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenances_deleted_at ON maintenances(deleted_at) WHERE deleted_at IS NOT NULL;
```

### M.3 — O que NÃO faz

- NÃO deleta nenhum registro
- NÃO altera nenhum dado existente
- NÃO remove nenhuma coluna
- NÃO remove nenhuma tabela
- NÃO altera RLS
- NÃO altera RPCs
- NÃO altera o JSONB products_used
- NÃO altera quantity_in_stock
- NÃO altera geometrias

### M.4 — O que requer ALTERAÇÃO DE CÓDIGO (futuro, não nesta etapa)

Após a migration, o frontend precisará:
1. Filtrar `deleted_at IS NULL` em todas as queries
2. Alterar `deleteArea()` para fazer `UPDATE SET deleted_at = now()` em vez de `DELETE`
3. Alterar `deleteSeason()` para fazer `UPDATE SET deleted_at = now()` em vez de `DELETE`
4. O mesmo para operations, products, machinery, maintenances
5. Corrigir as mensagens de confirmação (especialmente AreaDetail.tsx e AreasList.tsx que mentem sobre operações)
6. Adicionar UI para "restaurar" registros deletados

---

## N. PLANO DE ROLLBACK

### N.1 — Rollback da migration

Para cada FK alterada, o rollback é:

```sql
-- Exemplo: reverter operations_season_id_fkey para CASCADE
ALTER TABLE operations DROP CONSTRAINT operations_season_id_fkey;
ALTER TABLE operations ADD CONSTRAINT operations_season_id_fkey
  FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
```

Repetir para cada uma das 11 FKs alteradas.

### N.2 — Rollback das colunas de soft delete

```sql
ALTER TABLE seasons DROP COLUMN IF EXISTS deleted_at;
ALTER TABLE seasons DROP COLUMN IF EXISTS deleted_by;
-- Repetir para areas, operations, products, machinery, maintenances
```

**Nota:** Dropar colunas é seguro porque elas são nullable e não contêm dados (todos os valores são NULL após a migration).

### N.3 — Rollback do código

Reverter o código do frontend para a versão anterior (git checkout ou reaplicar a versão antiga).

### N.4 — Rollback sem PITR

Como PITR não está habilitado, o rollback depende de:
1. **Rollback lógico** (re-executar SQL inverso) — funciona para FKs e colunas
2. **Backup diário** — se algo der errado, restaurar do backup do dia anterior (perda de até 24h de dados)
3. **NÃO há rollback para dados deletados por CASCADE** — se um CASCADE ocorrer antes da migration, os dados são perdidos permanentemente

---

## O. VALIDAÇÃO ANTES E DEPOIS DA FUTURA MIGRATION

### O.1 — ANTES da migration

Executar `supabase/validation/pre_migration_validation.sql` e confirmar:
- Todas as contagens iguais à BASELINE_PRE_MIGRATION_V1
- Todos os checksums iguais
- Zero órfãos
- RLS status documentado

### O.2 — DEPOIS da migration

Executar `supabase/validation/pre_migration_validation.sql` e confirmar:

| Validação | Expectativa |
|---|---|
| A. Contagem de todas as tabelas | **IDÊNTICA** — nenhum registro pode ser perdido |
| B. Checksums MD5 | **DIFERENTE** — esperado, pois colunas deleted_at foram adicionadas (muda row::text) |
| B2. Somatórios numéricos | **IDÊNTICOS** — somas de quantity_in_stock, product_lots.quantity, areas.size não mudam |
| C. Órfãos | **ZERO** — nenhuma FK quebrada |
| D. NULLs críticos | **IDÊNTICO** — deleted_at é NULL em todos os registros existentes |
| E. Quantidade de operations | 309 (idêntico) |
| F. Itens em products_used | 1.459 (idêntico) |
| G. productIds inválidos | 501 (idêntico) |
| H. Produtos | 217 (idêntico) |
| I. Product_lots | 149 (idêntico) |
| J. Produtos com stock sem lotes | 122 (idêntico) |
| K. Divergência de estoque | 125 (idêntico) |
| L. Áreas com geometry | 1 (idêntico) |
| M. RLS habilitado | Mesmo status (idêntico) |
| N. Policies | 49 (idêntico) |
| O. Functions | 762 + 6 (novas funções de soft delete, se criadas) |
| P. Triggers | 9 + 6 (novos triggers de updated_at para deleted_at, se criados) |
| Q. Foreign keys | 28 (mesma quantidade, mas 11 com ON DELETE RESTRICT em vez de CASCADE) |
| R. Extensões | 6 (idêntico) |

### O.3 — Validação específica pós-migration

```sql
-- Verificar que nenhuma FK foi perdida
SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f';
-- Esperado: 28

-- Verificar que as 11 FKs agora são RESTRICT
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace AND contype = 'f'
AND pg_get_constraintdef(oid) ILIKE '%RESTRICT%';
-- Esperado: 11

-- Verificar que deleted_at é NULL em todos os registros
SELECT count(*) FROM seasons WHERE deleted_at IS NOT NULL;
SELECT count(*) FROM areas WHERE deleted_at IS NOT NULL;
SELECT count(*) FROM operations WHERE deleted_at IS NOT NULL;
SELECT count(*) FROM products WHERE deleted_at IS NOT NULL;
SELECT count(*) FROM machinery WHERE deleted_at IS NOT NULL;
SELECT count(*) FROM maintenances WHERE deleted_at IS NOT NULL;
-- Esperado: 0 em todas
```

---

## P. RISCOS ENCONTRADOS

| # | Risco | Severidade | Bloco |
|---|---|---|---|
| 1 | Mensagem de confirmação de delete area é **ATIVAMENTE ENGANOSA** | **CRÍTICO** | H |
| 2 | Delete de safra apaga até 194 operações sem aviso | **CRÍTICO** | G |
| 3 | Delete de área apaga até 16 operações (mensagem mente) | **CRÍTICO** | H |
| 4 | Delete de produto apaga lotes e cria órfãos no JSONB | **ALTO** | I |
| 5 | Delete de operação não é atômico (estoque devolvido antes do delete) | **ALTO** | J |
| 6 | Delete de máquina apaga manutenções sem aviso | **ALTO** | D.6 |
| 7 | Delete de tipo de manutenção apaga manutenções sem aviso | **ALTO** | D.7 |
| 8 | clean_expired_invitations RPC não verifica auth | **MÉDIO** | E.2 |
| 9 | Delete de instituição apaga 575 registros em cascata | **CRÍTICO** | F.1 |
| 10 | Delete de auth.user apaga áreas, operações, safras em cascata | **ALTO** | F.2 |
| 11 | Sync offline NÃO envia deletes — exclusões offline são perdidas | **ALTO** | D |
| 12 | Sync offline em MachineryContext é STUB — dados offline perdidos | **CRÍTICO** | D.6-D.8 |
| 13 | PITR não habilitado — sem rollback para dados deletados por CASCADE | **ALTO** | N.4 |

---

## Q. INFORMAÇÕES INDETERMINADAS

| Item | Status |
|---|---|
| Causalidade entre deletes de produto e 501 productIds órfãos | HIPÓTESE — NÃO COMPROVADA |
| Quais produtos foram deletados no passado (para explicar órfãos) | [INDETERMINADO — sem logs de auditoria] |
| Se algum usuário já excluiu safras/áreas no passado | [INDETERMINADO — sem logs] |
| Se as 4 instituições vazias foram criadas por erro | [INDETERMINADO] |

---

## R. RESUMO EXECUTIVO

O AgriGest tem **28 foreign keys**, das quais **25 são CASCADE**. Isto significa que a maioria das exclusões de "pais" (instituição, safra, área, produto, máquina) apaga automaticamente todos os "filhos" (operações, lotes, manutenções) — **sem aviso ao usuário e sem possibilidade de desfazer**.

**Os 3 riscos mais críticos são:**

1. **Mensagem enganosa ao excluir área:** O frontend diz que "as operações permanecerão" quando na verdade serão DELETADAS pelo CASCADE. Isto é um bug ativo que pode causar perda de dados irreversível a qualquer momento.

2. **Exclusão de safra sem aviso de impacto:** Um único clique em "Excluir Safra" na página de Configurações apaga até 194 operações históricas. A mensagem de confirmação menciona apenas que "a ação não pode ser desfeita" sem dizer que 194 operações serão perdidas.

3. **Estoque não-atômico ao excluir operação:** O estoque é devolvido ANTES do delete. Se o delete falha, o estoque fica inconsistente (devolvido mas a operação ainda existe).

**A proposta de migration (NÃO executada) alteraria 11 FKs de CASCADE para RESTRICT** e adicionaria colunas de soft delete em 6 tabelas. Isto preveniria exclusões acidentais sem perder nenhum dado existente.

---

**PAREI. Aguardando revisão externa.**

Nenhuma migration foi criada. Nenhum código foi alterado. Nenhum dado foi modificado. Nenhuma FK foi alterada.

**FIM DO RELATÓRIO — ETAPA 1A**
