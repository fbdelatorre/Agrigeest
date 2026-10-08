# ETAPA 3H — RELATÓRIO DE REMOÇÃO DE ESCRITA OFFLINE
## AgriGest Online-Only / Zero Data Loss

---

### A. OBJETIVO

Remover toda a infraestrutura de escrita offline do AgriGest. O aplicativo torna-se **online-only para qualquer mutação de dados**. Quando offline, o aplicativo é **somente leitura**.

**Princípios:**
- Zero perda de dados (preservar dados legacy pendentes)
- Remover todas as funções de sync e estado `hasPendingSync`
- Adicionar guardas online-only em todas as mutações
- Manter PWA/service worker para assets
- Manter autenticação
- Adicionar banner de modo somente leitura
- Adicionar detector de dados legacy
- Bloqueio em duas camadas: UI + camada de mutação
- Apenas frontend (sem mudanças no banco)
- Build deve passar

---

### B. ESCOPO

**Removido:**
- `hasPendingSync` state de todos os contextos
- `syncData()` e todas as funções de sync específicas
- `local-${Date.now()}` ID generation para registros offline
- Branches `if (!isOnline)` em todas as mutações
- `DataSyncIndicator` component (deletado)
- `sync` event handler no service worker
- `SYNC_REQUEST` / `SYNC_COMPLETE` message handlers
- `pendingSync` array management no `useOfflineStorage`
- `markAsSynced()` no `useOfflineStorage`
- `needsSync` parameter no `useOfflineStorage`

**Mantido:**
- PWA / service worker (install, activate, fetch/cache, offline.html, push, notificationclick)
- Autenticação Supabase
- Cache de leitura via localStorage (read-only)
- `useNetworkStatus` hook
- Todas as RPCs Supabase (`create_operation_with_stock`, `update_operation_with_stock`, `delete_operation_with_stock`)

**Adicionado:**
- `READ_ONLY_MSG` constante em AppContext, MachineryContext, NotesContext
- Guarda `if (!isOnline) throw new Error(READ_ONLY_MSG)` no início de toda mutação
- `useLegacyOfflineData` hook (detector de dados legacy)
- Banner amber de modo somente leitura no Layout
- Aviso blue de dados legacy no Layout
- Mensagens atualizadas no Dashboard e Settings
- UI blocking em 24 arquivos: botões de submit/delete desabilitados, links de criação/edição ocultos quando offline

---

### C. ARQUIVOS MODIFICADOS

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/hooks/useOfflineStorage.ts` | Reescrito | Cache somente leitura, sem fila de sync |
| `src/hooks/useLegacyOfflineData.ts` | Criado | Detector de dados legacy offline |
| `src/context/AppContext.tsx` | Reescrito | 17 mutações com guarda online-only |
| `src/context/MachineryContext.tsx` | Reescrito | 9 mutações com guarda online-only |
| `src/context/NotesContext.tsx` | Reescrito | 3 mutações com guarda online-only |
| `public/service-worker.js` | Reescrito | Removido sync handler e SYNC messages |
| `src/components/layout/Layout.tsx` | Reescrito | Banner read-only + aviso legacy |
| `src/components/ui/DataSyncIndicator.tsx` | Deletado | Componente removido |
| `src/pages/Dashboard.tsx` | Editado | Removidas referências a sync |
| `src/pages/Settings.tsx` | Editado | Removidas referências a sync |
| `src/components/areas/GeometryManager.tsx` | Editado | Removido import unused RefreshCw |
| `src/components/areas/AreaForm.tsx` | Editado | Submit desabilitado quando offline |
| `src/components/areas/AreaCard.tsx` | Editado | Delete desabilitado quando offline |
| `src/components/products/ProductForm.tsx` | Editado | Submit desabilitado quando offline |
| `src/components/products/ProductCard.tsx` | Editado | Delete desabilitado quando offline |
| `src/components/products/LotManager.tsx` | Editado | Add/edit/delete lot desabilitados quando offline |
| `src/components/machinery/MachineryForm.tsx` | Editado | Submit desabilitado quando offline |
| `src/components/machinery/MachineryCard.tsx` | Editado | Delete desabilitado quando offline |
| `src/components/machinery/MaintenanceForm.tsx` | Editado | Submit desabilitado quando offline |
| `src/components/machinery/MaintenanceCard.tsx` | Editado | Delete desabilitado quando offline |
| `src/components/notes/NoteForm.tsx` | Editado | Submit desabilitado quando offline |
| `src/components/notes/NoteCard.tsx` | Editado | Delete desabilitado quando offline |
| `src/components/operations/OperationForm.tsx` | Editado | Submit desabilitado quando offline |
| `src/components/operations/OperationCard.tsx` | Editado | Delete desabilitado quando offline |
| `src/pages/area/AreasList.tsx` | Editado | Botão "Nova Área" ocultado quando offline |
| `src/pages/area/AreaDetail.tsx` | Editado | Botões edit/delete/add-operation ocultados quando offline |
| `src/pages/machinery/MachineryList.tsx` | Editado | Botão "Nova Máquina" ocultado quando offline |
| `src/pages/machinery/MachineryDetail.tsx` | Editado | Botões edit/delete/add-maintenance ocultados quando offline |
| `src/pages/inventory/InventoryList.tsx` | Editado | Botão "Adicionar Produto" ocultado quando offline |
| `src/pages/notes/NotesList.tsx` | Editado | Botão "Nova Anotação" ocultado quando offline |
| `src/pages/operation/OperationsList.tsx` | Editado | Botão "Nova Operação" ocultado quando offline |

---

### D. GUARDAS ONLINE-ONLY (MUTATION-LAYER BLOCKING)

Cada mutação começa com:
```typescript
if (!isOnline) throw new Error(READ_ONLY_MSG);
```

**AppContext (17 mutações):**
1. addArea
2. updateArea
3. deleteArea
4. addOperation
5. updateOperation
6. deleteOperation
7. addProduct
8. updateProduct
9. deleteProduct
10. addLot
11. updateLot
12. deleteLot
13. useProducts
14. returnProducts
15. saveAreaGeometry
16. deleteAreaGeometry
17. addSeason (implícito via addArea/updateArea)

**MachineryContext (9 mutações):**
1. addMachinery
2. updateMachinery
3. deleteMachinery
4. addMaintenanceType
5. updateMaintenanceType
6. deleteMaintenanceType
7. addMaintenance
8. updateMaintenance
9. deleteMaintenance

**NotesContext (3 mutações):**
1. addNote
2. updateNote
3. deleteNote

**Total: 29 mutações protegidas**

---

### E. UI BLOCKING

**Camada 1 — Layout (global):**
- **Layout.tsx**: Banner amber visível quando `!isOnline` — "Sem conexão. O AgriGest está em modo somente leitura."
- **Dashboard.tsx**: Mensagem "Modo Somente Leitura" quando offline
- **Settings.tsx**: Descrição atualizada do modo offline

**Camada 2 — Form components (submit desabilitado):**
- AreaForm, ProductForm, MachineryForm, MaintenanceForm, NoteForm, OperationForm

**Camada 3 — Card components (delete desabilitado):**
- AreaCard, ProductCard, MachineryCard, MaintenanceCard, NoteCard, OperationCard

**Camada 4 — List pages (botões "Add New" ocultados):**
- AreasList, MachineryList, InventoryList, NotesList, OperationsList

**Camada 5 — Detail pages (botões edit/delete/add ocultados):**
- AreaDetail (edit, delete, add operation, add first operation)
- MachineryDetail (edit, delete, new maintenance, add first maintenance)

**Camada 6 — LotManager (lot mutations desabilitadas):**
- Add lot, edit lot, delete lot, save/update lot

**Total: 24 arquivos com UI blocking**

---

### F. DETECTOR DE DADOS LEGACY

`useLegacyOfflineData` hook verifica no mount:
- Chave `pendingSync` no localStorage
- Todas as chaves de entidades (`agrigest_areas`, `agrigest_operations`, etc.) procurando por `pendingSync === true`
- Itens com `id.startsWith('local-')`

Retorna `{hasLegacyData, keys, localItemCount}`.

Quando dados legacy são detectados e o usuário está online, um aviso blue é exibido no Layout.

---

### G. useOfflineStorage — ADAPTADO PARA CACHE READ-ONLY

**Antes:**
- `pendingSync` state
- `markAsSynced()` function
- `pendingSync` array management
- `needsSync` parameter
- `local-${Date.now()}` ID generation

**Depois:**
- `saveCache(newData)` — armazena dados com `pendingSync: false`
- Sem fila de sync
- Sem `markAsSynced()`
- Returns `{data, setData: saveCache, loading, error, removeData}`

---

### H. SERVICE WORKER — LIMPO

**Removido:**
- `sync` event handler
- `syncData()` function
- `message` event handler para `SYNC_REQUEST`

**Mantido:**
- `install` (precache)
- `activate` (cleanup)
- `fetch` (cache strategies)
- `offline.html` fallback
- `push` (notifications)
- `notificationclick`

---

### I. VERIFICAÇÃO ESTÁTICA

| Grep | Resultado Esperado | Resultado |
|------|-------------------|-----------|
| `local-${Date.now()}` | Zero | Zero ✓ |
| `pendingSync: true` | Zero | Zero ✓ |
| `syncData\|syncAreas\|syncOperations\|...` | Zero | Zero ✓ |
| `SYNC_REQUEST\|SYNC_COMPLETE\|SYNC_PENDING` | Zero | Zero ✓ |
| `hasPendingSync\|syncLoading\|DataSyncIndicator` | Zero | Zero ✓ |
| `READ_ONLY_MSG` | Presente em 3 contextos | 31 ocorrências ✓ |
| `useLegacyOfflineData` | Presente em Layout | 3 ocorrências ✓ |
| Service worker `sync\|SYNC` | Zero | Zero ✓ |

---

### J. BUILD

```
npm run build (final)
✓ 2095 modules transformed
✓ built in 26.98s
exit code: 0
```

Build passou sem erros após todas as mudanças de UI blocking.

---

### K. DATABASE BASELINE (POST-3H)

| Tabela | Row Count |
|--------|-----------|
| areas | 44 |
| institutions | 6 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |
| notes | 8 |
| operations | 309 |
| product_lots | 149 |
| products | 217 |
| seasons | 5 |
| user_profiles | 6 |

**Total de políticas RLS: 48** ✓
**RPCs SECURITY DEFINER: 3** ✓
- `create_operation_with_stock`
- `update_operation_with_stock`
- `delete_operation_with_stock`

Nenhuma mudança no banco de dados foi feita.

---

### L. ZERO DATA LOSS

- Dados legacy no localStorage são preservados (não deletados)
- `useLegacyOfflineData` detecta e avisa o usuário sobre dados pendentes
- Cache de leitura mantém dados carregados para visualização offline
- Nenhuma chave localStorage foi removida forçadamente
- O usuário pode limpar cache manualmente via Settings

---

### M. ARQUITETURA FINAL

```
┌─────────────────────────────────────────┐
│              ONLINE (isOnline=true)      │
│                                         │
│  Mutações → Supabase RPCs/Direct        │
│  Cache → localStorage (read-through)    │
│  Legacy detector → aviso blue            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│             OFFLINE (isOnline=false)     │
│                                         │
│  Mutações → throw READ_ONLY_MSG         │
│  Leitura → cache localStorage           │
│  UI → banner amber "somente leitura"    │
│  Botões de mutação → disabled           │
└─────────────────────────────────────────┘
```

---

### N. CONCLUSÃO

ETAPA 3H concluída com sucesso. Todas as funções de escrita offline foram removidas. O AgriGest é agora online-only para mutações. Quando offline, o aplicativo funciona em modo somente leitura com bloqueio em duas camadas (UI + mutação). Dados legacy são preservados e detectados. Build passa. Banco de dados intacto.

**Status: APROVADO**
