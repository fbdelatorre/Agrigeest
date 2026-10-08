# ETAPA 2B — MICROVALIDAÇÃO P0 DE RLS

**Data:** 2026-10-07
**Modo:** READ-ONLY ABSOLUTO

---

## 1. AREAS

### Policies INSERT (2)

| Policy | Cmd | Perm | Roles | USING | WITH CHECK |
|---|---|---|---|---|---|
| Enable insert for authenticated users only | INSERT | PERMISSIVE | authenticated | — | **true** |
| Users can create areas in their institution | INSERT | PERMISSIVE | authenticated | — | institution_id IN (SELECT user_profiles.institution_id WHERE id = auth.uid()) |

### Confirmações

1. "Enable insert for authenticated users only" é PERMISSIVE? **SIM**
2. Aplica-se a INSERT? **SIM**
3. Role inclui authenticated? **SIM**
4. WITH CHECK = true? **SIM**
5. Existe outra policy INSERT que valida institution_id? **SIM** — "Users can create areas in their institution"
6. Expressão completa da policy institucional: `institution_id IN (SELECT user_profiles.institution_id FROM user_profiles WHERE user_profiles.id = auth.uid())`

### Lógica efetiva INSERT

Ambas PERMISSIVE → combinadas por OR:
`true OR (institution_id IN (...))` = **sempre true**

Qualquer usuário autenticado pode inserir area com qualquer institution_id, inclusive de outra instituição.

### Efeito de remover SOMENTE "Enable insert for authenticated users only"

- A policy institucional restante permite inserir area na SUA instituição? **SIM**
- Impede institution_id de outra instituição? **SIM**
- O fluxo normal depende da policy WITH CHECK(true)? **NÃO** — o frontend sempre busca `userProfile.institution_id` do banco e envia esse valor. Nunca envia institution_id arbitrário.

### Compatibilidade frontend

O frontend (AppContext.addArea e syncAreas) sempre:
1. Busca `user_profiles.institution_id` do usuário autenticado
2. Envia esse institution_id no INSERT

O fluxo normal **não depende** da policy permissiva. Removê-la não quebra nenhum caminho do frontend.

---

## 2. OPERATION_PRODUCTS

### RLS/Grants/Count

| Atributo | Valor |
|---|---|
| RLS Enabled | **false** |
| RLS Forced | false |
| COUNT(*) | **0** |

Grants: anon e authenticated têm SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES. postgres e service_role idem. **Sem deny.**

### 4 Policies

| Policy | Cmd | Perm | USING | WITH CHECK |
|---|---|---|---|---|
| Users can create own operation products | INSERT | P | — | EXISTS(SELECT 1 FROM operations WHERE operations.id = operation_products.operation_id AND operations.user_id = auth.uid()) |
| Users can read own operation products | SELECT | P | EXISTS(...) | — |
| Users can update own operation products | UPDATE | P | EXISTS(...) | EXISTS(...) |
| Users can delete own operation products | DELETE | P | EXISTS(...) | — |

Todas usam modelo **A = operations.user_id = auth.uid()**. Nenhuma usa institution_id.

### Callers/Dependências

| Tipo | Encontrado |
|---|---|
| Frontend (.from('operation_products')) | **0** — apenas type definition em database.types.ts |
| Migrations | 0 (apenas validation count em pre_migration_validation.sql) |
| Functions/Triggers | 0 |
| Views | 0 |
| FKs | 2: operation_id→operations(id) CASCADE, product_id→products(id) CASCADE |

Histórico real de produtos: armazenado em `operations.products_used` JSONB. Nenhuma migração/backfill escreve em operation_products.

### Modelo de autorização efetivo

Todas as 4 policies usam **A = operations.user_id = auth.uid()** (ownership). Nenhuma usa B = institution_id. Nenhuma usa C = outro modelo.

---

## 3. Efeito de simplesmente ENABLE RLS (sem alterar policies)

1. Usuário acessa operation_products de operação criada por outro usuário da MESMA instituição?
   **NÃO** — policies verificam user_id, não institution_id.

2. Usuário acessa operation_products de operação de OUTRA instituição?
   **NÃO** — user_id bloqueia.

3. Comportamento consistente com modelo AgriGest (dados compartilhados por institution)?
   **NÃO** — o modelo é ownership (user_id), não institutional. Usuários da mesma instituição não conseguiriam compartilhar dados de operation_products.

---

## 4. Recomendação

**OPÇÃO 3: Isolar/revogar acesso à tabela por enquanto.**

Justificativa:
- Tabela está **vazia** (0 registros)
- **Nenhum caller** no frontend ou backend
- Products usados são armazenados em `operations.products_used` JSONB
- As 4 policies existentes usam modelo **ownership (user_id)**, incompatível com o modelo institucional do AgriGest
- Simplesmente ENABLE RLS ativaria policies semanticamente erradas (isolamento por user_id em vez de institution_id)
- Zero data loss garantido (tabela vazia)
- Quando a tabela for necessária no futuro, implementar OPÇÃO 2 (reescrever policies para modelo institutional + ENABLE RLS)

Ação conceitual: revogar grants de anon/authenticated, manter estrutura para uso futuro.

---

## 5. Counts PRE/POST

| Tabela | PRE | POST | Match |
|---|---|---|---|
| areas | 44 | 44 | SIM |
| operation_products | 0 | 0 | SIM |

**ZERO DATA LOSS.**

---

## 6. Divergências

1. operation_products: RLS OFF + grants plenos para anon — CRÍTICO, mas tabela vazia e sem callers.
2. areas: policy permissiva WITH CHECK(true) anula isolamento INSERT — CRÍTICO, frontend não depende dela.
3. operation_products policies usam user_id (ownership) em vez de institution_id — inconsistente com modelo AgriGest.
4. Sem divergências estruturais adicionais.

---

## 7. STATUS: PASS

READ-ONLY ABSOLUTO. Nenhuma alteração feita. Aguardando revisão externa.

STOP.
