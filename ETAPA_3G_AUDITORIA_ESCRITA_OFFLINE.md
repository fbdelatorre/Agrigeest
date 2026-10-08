# ETAPA 3G — AUDITORIA PARA REMOVER ESCRITA OFFLINE

**Data:** 2026-10-07
**STATUS: PASS**
**READ-ONLY ABSOLUTO — Nenhuma alteração foi feita no código ou banco.**

---

## A. Entidades com Writes Offline

| Entidade | CREATE offline | UPDATE offline | DELETE offline | Fila/pending | Sincroniza depois | Função |
|---|---|---|---|---|---|---|
| operations | SIM | SIM | SIM | SIM | SIM | addOperation, updateOperation, deleteOperation |
| products | SIM | SIM | SIM | SIM | SIM | addProduct, updateProduct, deleteProduct |
| areas | SIM | SIM | SIM | SIM | SIM | addArea, updateArea, deleteArea |
| seasons | NÃO | NÃO | NÃO | SIM (flag) | SIM | (cache only, sem mutation direta) |
| machinery | SIM | SIM | SIM | SIM | SIM (stub) | addMachinery, updateMachinery, deleteMachinery |
| maintenance_types | SIM | SIM | SIM | SIM | SIM (stub) | addMaintenanceType, updateMaintenanceType, deleteMaintenanceType |
| maintenances | SIM | SIM | SIM | SIM | SIM (stub) | addMaintenance, updateMaintenance, deleteMaintenance |
| notes | SIM | SIM | SIM | SIM | SIM (stub) | addNote, updateNote, deleteNote |
| product_lots | NÃO | NÃO | NÃO | NÃO | NÃO | addLot, updateLot, deleteLot (online only) |
| invitations | NÃO | NÃO | NÃO | NÃO | NÃO | (online only) |
| user profile | NÃO | NÃO | NÃO | NÃO | NÃO | (online only) |

---

## B. Operations Offline Atual

**addOperation** (AppContext.tsx L451-504):
- Condição: `if (!isOnline)` (L455)
- Salva em: React state `setOperations` + localStorage `setOfflineOperations(updatedOperations, true)` (L461-463)
- Gera ID: `local-${Date.now()}` (L457)
- Marca pending: `setHasPendingSync(true)` (L463)
- Altera estoque local: NÃO (não chama useProducts/returnProducts no branch offline)
- Sincroniza depois: `syncOperations()` que faz INSERT direto na tabela operations (L1086-1096) — **sem chamar create_operation_with_stock RPC**

**updateOperation** (AppContext.tsx L506-561):
- Condição: `if (!isOnline)` (L511)
- Salva em: React state + localStorage com pending=true (L512-518)
- Não gera ID (preserva existente)
- Marca pending: `setHasPendingSync(true)` (L517)
- Altera estoque local: NÃO (não chama useProducts/returnProducts no branch offline)
- Sincroniza depois: `syncOperations()` faz UPDATE direto (L1099-1108) — **sem chamar update_operation_with_stock RPC**

**deleteOperation** (AppContext.tsx L563-588):
- Condição: `if (!isOnline)` (L565)
- Salva em: React state + localStorage com pending=true (L566-569)
- Marca pending: `setHasPendingSync(true)` (L569)
- Altera estoque local: NÃO (não chama returnProducts no branch offline — removido na ETAPA 3F)
- Sincroniza depois: `syncOperations()` não reconhece deletes — apenas faz INSERT/UPDATE de operations existentes. **Deletes offline são perdidos na sincronização.**

**localStorage key:** `operations` (estrutura: `{data: Operation[], timestamp, pendingSync: boolean}`)

---

## C. Products Offline Atual

**addProduct** (AppContext.tsx L597-691):
- Condição: `if (!isOnline)` (L605)
- Salva em: React state + localStorage `setOfflineProducts(updatedProducts, true)` (L608-609)
- Gera ID: `local-${Date.now()}` (L607)
- Marca pending: `setHasPendingSync(true)` (L610)
- Sincroniza depois: `syncProducts()` faz INSERT direto (L1134-1139)

**updateProduct** (AppContext.tsx L693-730):
- Condição: `if (!isOnline)` (L694)
- Salva em: React state + localStorage com pending=true (L695-700)
- Marca pending: `setHasPendingSync(true)` (L700)
- Sincroniza depois: `syncProducts()` faz UPDATE direto, **incluindo `quantity_in_stock`** (L1142-1146)

**deleteProduct** (AppContext.tsx L732-760):
- Condição: `if (!isOnline)` (L733)
- Salva em: React state + localStorage com pending=true (L734-738)
- Marca pending: `setHasPendingSync(true)` (L738)
- Sincroniza depois: `syncProducts()` não reconhece deletes — apenas INSERT/UPDATE. **Deletes offline são perdidos.**

**useProducts** (AppContext.tsx L932-1014):
- Condição: `if (!isOnline)` (L989)
- Modifica: React state `setProducts` + localStorage `setOfflineProducts(updatedProducts, true)` (L990-991)
- Marca pending: `setHasPendingSync(true)` (L992)
- **ALTO RISCO:** Quando online, faz UPDATE direto em `products.quantity_in_stock` (L999-1001) com read-modify-write
- Quando offline: apenas modifica state/localStorage

**returnProducts** (AppContext.tsx L876-930):
- Condição: `if (!isOnline)` (L905)
- Modifica: React state + localStorage com pending=true (L906-908)
- Marca pending: `setHasPendingSync(true)` (L908)
- **ALTO RISCO:** Quando online, faz UPDATE direto em `products.quantity_in_stock` (L915-918) com read-modify-write
- Quando offline: apenas modifica state/localStorage

**localStorage key:** `products`

---

## D. Product Lots Offline Atual

**addLot** (AppContext.tsx L783-813): **NÃO tem branch offline.** Sempre faz INSERT no Supabase.
**updateLot** (AppContext.tsx L815-849): **NÃO tem branch offline.** Sempre faz UPDATE no Supabase.
**deleteLot** (AppContext.tsx L851-867): **NÃO tem branch offline.** Sempre faz DELETE no Supabase.

Product lots não têm localStorage próprio, nem pending sync, nem geração de IDs `local-*`.

---

## E. Outras Entidades Offline

**areas** — AppContext.tsx:
- `addArea` (L330-378): branch offline SIM, ID `local-${Date.now()}`, localStorage `areas`, pending sync, `syncAreas()` faz INSERT/UPDATE direto
- `updateArea` (L380-417): branch offline SIM, localStorage pending, `syncAreas()` UPDATE direto
- `deleteArea` (L419-447): branch offline SIM, localStorage pending, `syncAreas()` não reconhece deletes — **perdido**

**seasons** — AppContext.tsx:
- `loadSeasons` salva cache em localStorage `seasons` com `setOfflineSeasons` (L317)
- `syncSeasons()` existe (L1158-1192) faz INSERT/UPDATE direto
- **NÃO existe addSeason, updateSeason, deleteSeason com branch offline** — seasons são gerenciadas via RPC `update_season_status` (online only)
- localStorage funciona apenas como cache de leitura

**machinery** — MachineryContext.tsx:
- `addMachinery` (L190-260): branch offline SIM, ID `local-`, localStorage `machinery`, pending
- `updateMachinery` (L262-311): branch offline SIM, localStorage pending
- `deleteMachinery` (L313-346): branch offline SIM, localStorage pending
- `syncMachinery()` (L717-721): **STUB** — apenas `console.log` + `markMachinerySynced()`. **Não sincroniza dados reais.**

**maintenance_types** — MachineryContext.tsx:
- `addMaintenanceType` (L353-421): branch offline SIM, ID `local-`, localStorage `maintenanceTypes`, pending
- `updateMaintenanceType` (L423-469): branch offline SIM, pending
- `deleteMaintenanceType` (L471-504): branch offline SIM, pending
- `syncMaintenanceTypes()` (L723-727): **STUB** — apenas `console.log` + `markSynced()`. **Não sincroniza.**

**maintenances** — MachineryContext.tsx:
- `addMaintenance` (L507-587): branch offline SIM, ID `local-`, localStorage `maintenances`, pending
- `updateMaintenance` (L589-648): branch offline SIM, pending
- `deleteMaintenance` (L650-678): branch offline SIM, pending
- `syncMaintenances()` (L729-733): **STUB** — apenas `console.log` + `markSynced()`. **Não sincroniza.**

**notes** — NotesContext.tsx:
- `addNote` (L89-182): branch offline SIM, ID `local-`, localStorage `notes`, pending
- `updateNote` (L184-242): branch offline SIM, pending
- `deleteNote` (L244-271): branch offline SIM, pending
- `syncData()` (L290-310): chama `loadNotes()` + `markNotesSynced()` — **recarrega do servidor, não envia dados locais. Dados offline são perdidos.**

**invitations**: NÃO. Online only.
**user profile**: NÃO. Online only (loadUserProfile faz SELECT do Supabase).

---

## F. Todas localStorage Keys + Classificação

| Key | Classificação | Origem |
|---|---|---|
| `areas` | A — dados de negócio offline | useOfflineStorage em AppContext |
| `operations` | A — dados de negócio offline | useOfflineStorage em AppContext |
| `products` | A — dados de negócio offline | useOfflineStorage em AppContext |
| `seasons` | C — cache (somente leitura) | useOfflineStorage em AppContext |
| `machinery` | A — dados de negócio offline | useOfflineStorage em MachineryContext |
| `maintenanceTypes` | A — dados de negócio offline | useOfflineStorage em MachineryContext |
| `maintenances` | A — dados de negócio offline | useOfflineStorage em MachineryContext |
| `notes` | A — dados de negócio offline | useOfflineStorage em NotesContext |
| `pendingSync` | B — fila/pending sync | useOfflineStorage (array de keys com pending) |
| `sb-<ref>-auth-token` | E — autenticação/sessão | Supabase Auth (gerado automaticamente) |

Keys de classificação A contêm estrutura: `{data: T[], timestamp: number, pendingSync: boolean}`.

A key `pendingSync` contém: `string[]` com nomes das keys que têm `pendingSync: true`.

---

## G. Estrutura de Pending Data

**Detecção de pendentes:**

1. **localStorage `pendingSync`** (useOfflineStorage.ts L49-52): array `string[]` com nomes de keys que têm `pendingSync: true`. Ex: `["operations", "products", "areas"]`.

2. **Flag `pendingSync` dentro de cada key**: cada key (ex: `operations`) contém `{data: ..., timestamp: ..., pendingSync: boolean}`. Se `pendingSync: true`, existem dados não sincronizados.

3. **React state `hasPendingSync`**: boolean em AppContext (L100) e MachineryContext (L53) e NotesContext (L36). Setado quando qualquer branch offline executa.

4. **IDs `local-*`**: qualquer item com `id.startsWith('local-')` dentro das arrays de dados é um registro criado offline não sincronizado.

**Como verificar antes da remoção:**
- Ler `localStorage.getItem('pendingSync')` — se não vazio, existem pendentes
- Para cada key listada, ler a key e verificar `pendingSync === true`
- Para cada key com pending, inspecionar `data` em busca de items com `id.startsWith('local-')`

---

## H. Risco de Dados Ainda Não Sincronizados

**SIM.** Existe possibilidade real de dados presos no browser.

Estruturas que podem conter dados não sincronizados:

1. **`operations`** — items com `id` começando `local-` nunca enviados ao servidor. `syncOperations()` faz INSERT direto (sem RPC), mas só é chamada se `hasPendingSync` for true e usuário voltar a ficar online.

2. **`products`** — items `local-` nunca enviados. `syncProducts()` faz INSERT direto.

3. **`areas`** — items `local-` nunca enviados. `syncAreas()` faz INSERT direto.

4. **`machinery`** — items `local-` nunca enviados. `syncMachinery()` é **STUB** — **dados offline de machinery JAMAIS são sincronizados.** Sempre perdidos.

5. **`maintenanceTypes`** — items `local-` nunca enviados. `syncMaintenanceTypes()` é **STUB** — **sempre perdidos.**

6. **`maintenances`** — items `local-` nunca enviados. `syncMaintenances()` é **STUB** — **sempre perdidos.**

7. **`notes`** — items `local-` nunca enviados. `syncData()` em NotesContext apenas recarrega do servidor — **dados offline são sempre perdidos.**

8. **Deletes offline** — operations, products, areas, machinery, maintenanceTypes, maintenances, notes: **todos os deletes offline são perdidos** porque as funções de sync apenas fazem INSERT/UPDATE, nunca DELETE.

**Conclusão:** Antes de remover a infraestrutura offline, é obrigatório verificar `localStorage` de cada usuário para `pendingSync` e items `local-*`. Machinery, maintenanceTypes, maintenances e notes já perdem dados offline mesmo no sistema atual.

---

## I. Funções de Sync

### AppContext

| Função | Origem | Destino | Quando | Automática | Sobrescreve servidor |
|---|---|---|---|---|---|
| `syncData()` (L1018) | — | — | chamada ao reconectar se hasPendingSync | SIM (L1215-1221) | delega |
| `syncAreas()` (L1036) | localStorage `areas` | Supabase `areas` (INSERT/UPDATE) | syncData() | SIM | SIM — UPDATE pode sobrescrever |
| `syncOperations()` (L1072) | localStorage `operations` | Supabase `operations` (INSERT/UPDATE direto) | syncData() | SIM | SIM — UPDATE sem RPC |
| `syncProducts()` (L1120) | localStorage `products` | Supabase `products` (INSERT/UPDATE direto, **inclui quantity_in_stock**) | syncData() | SIM | **SIM — ALTO RISCO** |
| `syncSeasons()` (L1158) | localStorage `seasons` | Supabase `seasons` (INSERT/UPDATE) | syncData() | SIM | SIM |

### MachineryContext

| Função | Origem | Destino | Quando | Automática | Sobrescreve servidor |
|---|---|---|---|---|---|
| `syncData()` (L685) | — | — | chamada ao reconectar se hasPendingSync | SIM | delega |
| `syncMachinery()` (L717) | localStorage | **STUB — não envia nada** | syncData() | SIM | NÃO |
| `syncMaintenanceTypes()` (L723) | localStorage | **STUB — não envia nada** | syncData() | SIM | NÃO |
| `syncMaintenances()` (L729) | localStorage | **STUB — não envia nada** | syncData() | SIM | NÃO |

### NotesContext

| Função | Origem | Destino | Quando | Automática | Sobrescreve servidor |
|---|---|---|---|---|---|
| `syncData()` (L290) | localStorage `notes` | **recarrega do servidor** (loadNotes) | chamada ao reconectar | SIM | NÃO — apenas descarta local |

---

## J. Comportamento ao Reconectar

**useNetworkStatus.ts:**
- Escuta `window.addEventListener('online', handleOnline)` (L28)
- `handleOnline` seta `isOnline = true` e dispara `window.dispatchEvent(new CustomEvent('app:online'))` (L17)

**AppContext.tsx:**
- `useEffect([isOnline])` (L132-152): se online, carrega todas as entidades do Supabase e verifica pending
- `useEffect([isOnline])` (L1207-1212): se online e `pendingSync` tem items, seta `hasPendingSync = true`
- `useEffect([hasPendingSync])` (L1214-1222): escuta `window.addEventListener('online', ...)` — se `hasPendingSync`, chama `syncData()` automaticamente

**MachineryContext.tsx:**
- `useEffect([isOnline])` (L81-100): se online, carrega do Supabase; se offline, usa localStorage; verifica pending

**NotesContext.tsx:**
- `useEffect([isOnline])` (L47-57): se online, carrega do Supabase; se offline, usa localStorage

**DataSyncIndicator.tsx:**
- Mostra indicador visual de sync pendente
- Se `hasPendingSync && isOnline`, chama `syncData()` automaticamente (L67-73)

---

## K. Writers Offline que Podem Alterar Estoque no Servidor

**ALTO RISCO — caminhos que escrevem `products.quantity_in_stock` no servidor via sync:**

1. **`syncProducts()`** (AppContext.tsx L1120-1156):
   - Faz `UPDATE products SET quantity_in_stock = product.quantityInStock` (L1142-1146)
   - Origem: `quantityInStock` do localStorage (que pode ter sido modificado offline por `useProducts` ou `returnProducts`)
   - **Pode sobrescrever estoque real do servidor com valor stale do browser**

2. **`useProducts()` online** (AppContext.tsx L996-1004):
   - Faz `UPDATE products SET quantity_in_stock = product.quantityInStock - usage.quantity` (read-modify-write)
   - **Não é atomic, não usa RPC**

3. **`returnProducts()` online** (AppContext.tsx L912-921):
   - Faz `UPDATE products SET quantity_in_stock = product.quantityInStock + usage.quantity` (read-modify-write)
   - **Não é atomic, não usa RPC**
   - Atualmente só é chamado em contextos que não são operation CRUD (que já usam RPCs)

4. **`syncOperations()`** (AppContext.tsx L1072-1118):
   - Faz INSERT/UPDATE direto em `operations` com `products_used` mas **não ajusta estoque**
   - **Cria operation sem devolver/consumir estoque — inconsistência silenciosa**

**ALTO RISCO — caminhos que escrevem `product_lots.quantity` no servidor:**

1. **`addLot` / `updateLot` / `deleteLot`**: sempre online, fazem UPDATE direto com read-modify-write (L786-867). Não usam RPC. P1 conhecido.

2. **`useProducts()` online** (L965-973): faz `UPDATE product_lots SET quantity = lot.quantity - usage.quantity` (read-modify-write)

3. **`returnProducts()` online** (L881-889): faz `UPDATE product_lots SET quantity = lot.quantity + usage.quantity` (read-modify-write)

---

## L. PWA / Service Worker: O Que É Independente

**Service worker (`public/service-worker.js`):**
- Cache de assets estáticos: `/`, `/index.html`, `/manifest.json`, `/offline.html` (L5-9)
- Cache de navegação: serve `offline.html` quando fetch de página falha (L107-109)
- Cache de API: tenta network-first para `supabase` e `/api/` (L43-73)
- Background sync: `sync` event listener (L116-120) que chama `syncData()` que lê `pendingSync` do localStorage — **isto é acoplado a dados offline**
- Push notifications (L172-188) — independente

**PWA helpers (`src/pwa.ts`):**
- `isPWAInstalled()` — instalação, independente
- `canInstallPWA()` / `showInstallPrompt()` — instalação, independente
- `setupConnectionListeners()` — eventos online/offline, independente
- `isOnline()` — navigator.onLine, independente
- `checkForUpdates()` — service worker update, independente
- `setupPushNotifications()` / `sendNotification()` — notificações, independentes

**vite-plugin-pwa** (vite.config.ts):
- Gera `dist/sw.js` e workbox para precaching de assets build
- Independente de dados de negócio

**Conclusão:** Instalação PWA, ícone, cache de arquivos estáticos, e abertura do app são **totalmente independentes** da escrita offline de dados. A única parte acoplada é o `sync` event handler no service-worker.js (L116-120) que lê `pendingSync` do localStorage.

---

## M. Supabase Auth Storage

**useAuth.ts:**
- `supabase.auth.getSession()` (L12) — obtém sessão atual
- `supabase.auth.onAuthStateChange()` (L29-31) — escuta mudanças
- Sessão é persistida automaticamente pelo `@supabase/supabase-js` em localStorage sob key `sb-<ref>-auth-token`

**supabase.ts:**
- Cria client com `persistSession: true` (presumido — comportamento default)

**Conclusão:** Storage de autenticação é gerenciado pelo Supabase SDK, não pelo código do app. É independente da infraestrutura offline de negócio. **NÃO remover.**

---

## N. Desenho do Modo Read-Only Offline

**Comportamento futuro concebido:**

Quando `navigator.onLine === false` (ou `isOnline === false`):
- Bloquear qualquer CREATE, UPDATE, DELETE de dados de negócio
- Interface mostra mensagem: "Sem conexão. O AgriGest está em modo somente leitura. As alterações estarão disponíveis quando a conexão for restabelecida."
- Dados previamente carregados permanecem visíveis (cache em React state)
- Botões de criar/editar/excluir desabilitados ou escondidos
- Formulários não permitem submit

**Implementação:**
- Cada função de mutation (addOperation, updateOperation, deleteOperation, addProduct, etc.) deve ter early return com erro amigável quando `!isOnline`
- UI deve ler `isOnline` do contexto e condicionalmente desabilitar ações
- Nenhum dado deve ser salvo em localStorage com `pendingSync: true`

---

## O. Proteção UI + Mutation Layer

**CAMADA 1 — UI:**
- Desabilitar/esconder botões de salvar/excluir/criar quando `!isOnline`
- Usar `isOnline` do `useNetworkStatus` ou `useAppContext` em cada página de formulário
- Mostrar banner "modo somente leitura" quando offline

**CAMADA 2 — Funções/Contextos (OBRIGATÓRIA):**
- Cada mutation deve verificar `isOnline` no momento da execução
- Se `!isOnline`, abortar com erro antes de alterar React state ou localStorage
- Não confiar somente em botão desabilitado — usuário pode abrir formulário online e clicar salvar após cair internet

**Ambas as camadas são necessárias. A camada 2 é obrigatória.**

---

## P. Race de Conexão

**Cenário:** usuário está online, abre formulário, internet cai, clica Salvar.

**Comportamento atual:** A função de mutation verifica `if (!isOnline)` no início. Se a internet caiu entre abrir o formulário e clicar Salvar, `isOnline` será `false` e o branch offline será executado — salvando em localStorage com pending.

**Comportamento futuro desejado:** A função deve verificar `isOnline` NO MOMENTO da gravação. Se `!isOnline`, abortar com erro amigável em vez de salvar localmente. O usuário recebe a mensagem "Sem conexão" e pode tentar novamente quando voltar a internet.

**Race adicional:** Mesmo se `isOnline === true` no momento do check, a chamada Supabase pode falhar por timeout de rede. Neste caso, o erro da chamada deve ser tratado normalmente — não salvar em localStorage como fallback.

---

## Q. RPCs Online Confirmadas

| RPC | Existe | SECURITY DEFINER | Owner |
|---|---|---|---|
| create_operation_with_stock | SIM | SIM | postgres |
| update_operation_with_stock | SIM | SIM | postgres |
| delete_operation_with_stock | SIM | SIM | postgres |

**As três RPCs não precisam de nenhuma alteração para a arquitetura online-only.** Elas já são online-only por design — SECURITY DEFINER, autenticação obrigatória, institution isolation. Não há branch offline dentro das RPCs.

---

## R. REMOVER na Futura 3H

### Funções de sync — REMOVER:
- `syncData()` em AppContext (L1018-1034)
- `syncAreas()` em AppContext (L1036-1070)
- `syncOperations()` em AppContext (L1072-1118)
- `syncProducts()` em AppContext (L1120-1156)
- `syncSeasons()` em AppContext (L1158-1192)
- `syncData()` em MachineryContext (L685-715)
- `syncMachinery()` em MachineryContext (L717-721)
- `syncMaintenanceTypes()` em MachineryContext (L723-727)
- `syncMaintenances()` em MachineryContext (L729-733)
- `syncData()` em NotesContext (L290-310)

### Branches offline — REMOVER (substituir por abort com erro):
- `addOperation` branch `!isOnline` (L455-465)
- `updateOperation` branch `!isOnline` (L511-519)
- `deleteOperation` branch `!isOnline` (L565-570)
- `addArea` branch `!isOnline` (L335-341)
- `updateArea` branch `!isOnline` (L381-388)
- `deleteArea` branch `!isOnline` (L420-425)
- `addProduct` branch `!isOnline` (L605-611)
- `updateProduct` branch `!isOnline` (L694-701)
- `deleteProduct` branch `!isOnline` (L733-738)
- `useProducts` branch `!isOnline` (L989-993)
- `returnProducts` branch `!isOnline` (L905-909)
- `addMachinery` branch `!isOnline` (L198-213)
- `updateMachinery` branch `!isOnline` (L263-272)
- `deleteMachinery` branch `!isOnline` (L314-320)
- `addMaintenanceType` branch `!isOnline` (L361-375)
- `updateMaintenanceType` branch `!isOnline` (L424-433)
- `deleteMaintenanceType` branch `!isOnline` (L472-478)
- `addMaintenance` branch `!isOnline` (L515-530)
- `updateMaintenance` branch `!isOnline` (L590-599)
- `deleteMaintenance` branch `!isOnline` (L651-657)
- `addNote` branch `!isOnline` (L100-114)
- `updateNote` branch `!isOnline` (L185-193)
- `deleteNote` branch `!isOnline` (L245-250)

### Geração de IDs `local-*` — REMOVER:
- `local-${Date.now()}` em: addArea, addOperation, addProduct, addMachinery, addMaintenanceType, addMaintenance, addNote

### localStorage keys — REMOVER (após verificar sem pendentes):
- `areas`, `operations`, `products`, `seasons`, `machinery`, `maintenanceTypes`, `maintenances`, `notes`
- `pendingSync`

### Effects de sync — REMOVER:
- `useEffect([hasPendingSync])` que escuta `online` e chama `syncData()` (AppContext L1214-1222)
- `useEffect` que lê `pendingSync` do localStorage (AppContext L1207-1212)
- `useEffect` que escuta `SYNC_COMPLETE` do service worker (AppContext L1194-1205)

### State — REMOVER:
- `hasPendingSync` em AppContext, MachineryContext, NotesContext

### Interface — REMOVER/ADAPTAR:
- `DataSyncIndicator.tsx` — remover completamente
- `hasPendingSync` e `syncData` da interface `AppContextType` (L70-71)
- `hasPendingSync` e `syncData` da interface `MachineryContextType`
- `hasPendingSync` e `syncData` da interface `NotesContextType`

### Service worker — REMOVER:
- `sync` event handler (L116-120)
- `syncData()` function (L123-169)
- `message` event handler para `SYNC_REQUEST` (L202-205)

---

## S. MANTER na Futura 3H

### Hooks:
- `useNetworkStatus.ts` — manter inteiro (necessário para detectar online/offline e mostrar modo leitura)
- `useAuth.ts` — manter inteiro (autenticação Supabase)

### PWA:
- `pwa.ts` — manter: `isPWAInstalled()`, `canInstallPWA()`, `showInstallPrompt()`, `setupInstallPrompt()`, `isOnline()`, `setupConnectionListeners()`, `checkForUpdates()`, `setupPushNotifications()`, `sendNotification()`
- `public/service-worker.js` — manter: install, activate, fetch handlers, notification handlers
- `public/manifest.json` — manter
- `public/offline.html` — manter
- `public/icons/*` — manter
- `vite-plugin-pwa` config — manter
- `PWAInstallPrompt.tsx` — manter

### Supabase:
- `supabase.ts` — manter
- Storage de auth (`sb-*-auth-token`) — manter

### UI:
- `OfflineIndicator.tsx` — manter (mostra status offline)
- `useOfflineStorage.ts` — **ver ADAPTAR abaixo**

### Contextos:
- `AppContext`, `MachineryContext`, `NotesContext` — manter, mas adaptar (ver ADAPTAR)

### Cache de leitura:
- localStorage de entidades pode ser mantido como **cache somente leitura** se desejado, mas sem `pendingSync` e sem writes offline

---

## T. ADAPTAR na Futura 3H

### `useOfflineStorage.ts`:
- Remover `pendingSync` da estrutura `StorageData`
- Remover `saveData` com `needsSync = true`
- Remover `markAsSynced()`
- Remover escrita em `pendingSync` array
- Pode manter como cache read-only: carregar dados iniciais, salvar cache do servidor, mas nunca salvar mutations locais
- Ou simplificar para apenas ler/escrever cache sem flag de pending

### Funções de mutation (todas):
- Substituir branch `if (!isOnline)` por:
```typescript
if (!isOnline) {
  throw new Error('Sem conexão. O AgriGest está em modo somente leitura.');
}
```
- Não salvar em localStorage
- Não setar `hasPendingSync`
- Não gerar IDs `local-*`

### `AppContext.tsx`:
- `useEffect([isOnline])` (L132-152): remover uso de `offlineAreas`, `offlineOperations`, etc. como source de dados quando offline. Em vez disso, manter últimos dados carregados do servidor em React state (cache em memória)
- Remover `setOfflineAreas`, `setOfflineOperations`, etc. com `pendingSync = true`
- Manter `setOffline*(data, false)` apenas como cache de leitura opcional

### `MachineryContext.tsx` e `NotesContext.tsx`:
- Mesma adaptação que AppContext
- Remover branches offline
- Remover sync stubs

### UI:
- `Layout.tsx` — remover `DataSyncIndicator`, adicionar banner "modo somente leitura" quando `!isOnline`
- Todas as páginas de formulário (AreaCreate, AreaEdit, OperationCreate, OperationEdit, ProductCreate, ProductEdit, MachineryCreate, MachineryEdit, MaintenanceCreate, MaintenanceEdit, NoteCreate, NoteEdit) — desabilitar submit quando `!isOnline`
- Todas as listas com botão delete — desabilitar delete quando `!isOnline`

---

## U. Estratégia para Não Perder Pending Data Existente

**Antes de remover a infraestrutura offline:**

1. **Verificar `localStorage` de cada usuário ativo:**
   - Ler `localStorage.getItem('pendingSync')` — se `[]` ou null, não há pendentes
   - Se não vazio, para cada key listada, ler a key e verificar `pendingSync === true`
   - Para cada key com pending, inspecionar `data` em busca de items com `id.startsWith('local-')`

2. **Para items `local-*` em operations/products/areas:**
   - Sincronizar manualmente antes de remover a infraestrutura
   - Ou exportar os dados e inserir manualmente no Supabase
   - Operations offline não passam pela RPC `create_operation_with_stock` — estoque não foi ajustado

3. **Para machinery/maintenanceTypes/maintenances/notes:**
   - Sync já é STUB ou descarta dados — **estes dados já estão perdidos no sistema atual**
   - Documentar e aceitar perda, ou recuperar manualmente do localStorage se possível

4. **Para deletes offline:**
   - Já são perdidos no sistema atual (sync não processa deletes)
   - Documentar e aceitar perda

5. **Após confirmação de que não há pendentes críticos:**
   - Proceder com a remoção da ETAPA 3H
   - Limpar `pendingSync` do localStorage
   - Remover flags `pendingSync` das estruturas de cache

---

## V. Baseline PRE/POST

| Tabela | Count | Checksum |
|---|---|---|
| operations | 309 | fbf1eb1ad43d46437c87f0d98206cf75 |
| products | 217 | 3032ef9556d76996095e99876a36a38a |
| product_lots | 149 | bc7eaba42133b78cafd863cf8b2ee4fb |

| Soma | Valor |
|---|---|
| SUM products.quantity_in_stock | 4617076.08296666766681363 |
| SUM product_lots.quantity | 185382.00000666667 |

PRE = POST (read-only, nenhuma alteração foi feita).

---

## W. 48 Policies + 3 RPCs Confirmadas

- Total RLS policies: **48**
- RPCs atômicas SECURITY DEFINER owner postgres: **3** (create, update, delete)

---

## X. Riscos / Divergências

1. **Machinery/MaintenanceTypes/Maintenances/Notes sync são STUBs** — dados offline criados nessas entidades JAMAIS são sincronizados. Isto é um bug existente, não introduzido por esta auditoria.

2. **Deletes offline são perdidos em todas as entidades** — nenhuma função de sync processa deletes.

3. **`syncProducts()` pode sobrescrever `quantity_in_stock` do servidor** com valor stale do browser — ALTO RISCO de corrupção de estoque.

4. **`syncOperations()` faz INSERT/UPDATE direto sem RPC** — não ajusta estoque. Se uma operation offline for sincronizada, o estoque não será consumido/devolvido.

5. **`useProducts()` e `returnProducts()` online fazem read-modify-write** — não são atômicos. As RPCs de operation já não dependem deles, mas ainda existem como caminhos diretos de escrita de estoque.

6. **Service worker `syncData()`** lê `pendingSync` do localStorage mas tem comentário "Aqui você implementaria a lógica" (L137) — **não envia dados reais para o servidor.** É um stub no service worker também.

7. **`seasons` localStorage** é cache only (sem mutations offline diretas), mas `syncSeasons()` existe e faz INSERT/UPDATE — pode sobrescrever dados do servidor se `pendingSync` for true por erro.

---

## Y. STATUS: PASS

Auditoria completa. Toda a infraestrutura de escrita offline está mapeada. Nenhuma alteração foi feita no código ou banco de dados. Baseline PRE = POST confirmado. 48 RLS policies e 3 RPCs atômicas confirmadas.

A ETAPA 3H (implementação) deve:
1. Verificar pending data em browsers antes de remover
2. Remover branches offline de todas as mutations
3. Remover funções de sync
4. Adaptar `useOfflineStorage` para cache read-only
5. Adicionar bloqueio em duas camadas (UI + mutation)
6. Adicionar mensagem "modo somente leitura"
7. Remover `DataSyncIndicator` e `hasPendingSync`
8. Limpar sync handler do service worker

STOP.
