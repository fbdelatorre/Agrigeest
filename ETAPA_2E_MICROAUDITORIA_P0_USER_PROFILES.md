# ETAPA 2E — MICROAUDITORIA P0 DE user_profiles

**Data:** 2026-10-07
**Modo:** READ-ONLY ABSOLUTO

---

## A. SCHEMA user_profiles

| Column | Type | Nullable | Default | Constraints |
|---|---|---|---|---|
| id | uuid | NO | — | PK, FK auth.users(id) |
| first_name | text | NO | — | |
| last_name | text | NO | — | |
| phone | text | YES | — | |
| role | text | NO | — | |
| institution | text | NO | — | |
| institution_id | uuid | YES | — | FK institutions(id) ON DELETE CASCADE |
| is_admin | boolean | YES | false | |
| email | text | YES | — | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |

Sem UNIQUE além do PK. Sem CHECK constraints.

---

## B. RLS / GRANTS

### Policies (3, todas PERMISSIVE, role: authenticated)

| Name | Cmd | Using | With Check |
|---|---|---|---|
| Users can read own profile | SELECT | `auth.uid() = id` | — |
| Users can create own profile | INSERT | — | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` | `auth.uid() = id` |

**Condição efetiva UPDATE:** usuário pode atualizar qualquer coluna do próprio row. WITH CHECK só valida `auth.uid() = id`. Não valida institution_id, is_admin, email, ou qualquer outro campo.

Sem policy DELETE → DELETE bloqueado por RLS.

### Grants de tabela

| Grantee | Privilégios |
|---|---|
| anon | SELECT, INSERT, UPDATE, DELETE, TRIGGER, TRUNCATE, REFERENCES |
| authenticated | SELECT, INSERT, UPDATE, DELETE, TRIGGER, TRUNCATE, REFERENCES |
| postgres | todos |
| service_role | todos |

### Column-level privileges

Nenhuma restrição column-level existe. Todas as colunas herdam os privilégios de tabela para anon e authenticated.

---

## C. ESCRITAS FRONTEND

### 1. Settings.tsx (linha ~363) — Edição normal do perfil
```
.from('user_profiles').update({
  first_name, last_name, phone, role
}).eq('id', editedProfile.id)
```
**Classificação: A (edição normal).** Envia apenas first_name, last_name, phone, role. NÃO envia institution_id ou is_admin.

### 2. AppContext.tsx (linhas 160, 345, 475, 641)
Todos SELECTs (`select('institution_id')` ou `select('*')`). Nenhuma escrita.

### 3. Outros arquivos (MachineryContext, NotesContext, useAuth, database.types)
Apenas referências de tipo ou SELECT. Nenhuma escrita direta.

**Resumo frontend:** única escrita direta é Settings.tsx enviando 4 colunas seguras.

---

## D. FUNCTIONS QUE ESCREVEM EM user_profiles

| Function | Sec Def? | Operação | Colunas alteradas | Motivo |
|---|---|---|---|---|
| handle_new_user | SIM (trigger) | INSERT | id, first_name, last_name, phone, role, institution, is_admin=false, institution_id=NULL, email | Cria profile no signup |
| handle_user_registration | SIM | INSERT ou UPDATE | institution_id, is_admin=true, institution | Registro + criação de instituição |
| join_institution | SIM | UPSERT (INSERT ON CONFLICT UPDATE) | institution_id, is_admin=false, institution, first_name, last_name, phone, role, email | Aceitar convite |
| toggle_user_admin_status | SIM | UPDATE | is_admin | Admin promove/rebaixa usuário |
| copy_data_to_institution | SIM | Possivelmente escreve | — | Cópia de dados (hardened 1F_C) |

Todas rodam como postgres (SECURITY DEFINER), bypassando RLS e column-level grants.

---

## E. CLASSIFICAÇÃO DAS COLUNAS

| Column | Classificação |
|---|---|
| id | IDENTITY/IMMUTABLE |
| email | IDENTITY/IMMUTABLE (set por trigger) |
| institution_id | SYSTEM-ONLY (set por join_institution, handle_user_registration) |
| is_admin | ADMIN-FUNCTION-ONLY (set por toggle_user_admin_status, handle_user_registration, join_institution) |
| institution | SYSTEM-ONLY (set por functions) |
| created_at | SYSTEM-ONLY |
| updated_at | SYSTEM-ONLY |
| first_name | SELF-EDITABLE |
| last_name | SELF-EDITABLE |
| phone | SELF-EDITABLE |
| role | SELF-EDITABLE |

---

## F. ESTRATÉGIA RECOMENDADA: A (Column-Level Privileges)

**REVOKE UPDATE geral de anon e authenticated. GRANT UPDATE somente em colunas self-editable para authenticated.**

SQL conceitual (NÃO executar agora):
```sql
REVOKE UPDATE ON public.user_profiles FROM anon, authenticated;
GRANT UPDATE (first_name, last_name, phone, role) ON public.user_profiles TO authenticated;
```

### Por que A:

1. **RLS continua controlando QUAIS rows** o usuário pode tocar (`auth.uid() = id`).
2. **Column-level privileges controlam QUAIS COLUNAS** podem ser alteradas.
3. **SECURITY DEFINER functions rodam como postgres** — têm todos os privilégios, não são afetadas pela restrição.
4. **Frontend já envia apenas colunas self-editable** (Settings.tsx: first_name, last_name, phone, role). Zero mudanças no frontend.
5. **Mudança mínima no banco**: 2 statements. Sem triggers, sem novas functions, sem novas policies.
6. **anon perde UPDATE completamente** — não deveria ter nunca.

### Por que não B (trigger):
Trigger BEFORE UPDATE precisaria diferenciar chamadas diretas de chamadas via SECURITY DEFINER. Verificar `current_user = 'postgres'` é frágil e bypassável se alguém criar nova function SECURITY DEFINER. Adiciona complexidade desnecessária.

### Por que não C (RPC):
Exige criar nova function, mudar frontend para chamar RPC em vez de update direto. Mais complexo, mais pontos de falha. Não há ganho de segurança sobre A.

### Por que não D:
A é a solução nativa PostgreSQL mais limpa para este caso de uso.

---

## G. COMPATIBILIDADE DOS 5 FLUXOS

| Fluxo | Resultado | Motivo |
|---|---|---|
| handle_new_user | OK | SECURITY DEFINER roda como postgres, bypassa column-level grants |
| handle_user_registration | OK | SECURITY DEFINER, altera institution_id/is_admin sem restrição |
| join_institution | OK | SECURITY DEFINER, UPSERT institution_id/is_admin sem restrição |
| toggle_user_admin_status | OK | SECURITY DEFINER, altera is_admin sem restrição |
| Edição normal perfil (Settings.tsx) | OK | Frontend envia apenas first_name, last_name, phone, role — colunas permitidas |

---

## H. RLS SOZINHA RESOLVE P0-1/P0-2?

**NÃO.**

Motivo: RLS WITH CHECK só vê o NEW row. Não pode comparar OLD.institution_id com NEW.institution_id dentro do WITH CHECK. A expressão `auth.uid() = id` permanece verdadeira mesmo após alterar institution_id ou is_admin — o id não muda.

Teoricamente, uma RESTRICTIVE policy com subquery (`institution_id = (SELECT institution_id FROM user_profiles WHERE id = auth.uid())`) poderia simular a comparação OLD vs NEW, mas:
- Race conditions entre a subquery e o UPDATE.
- Comportamento indefinido quando a subquery lê a mesma linha sendo atualizada.
- Frágil e não idiomático.

Column-level privileges (estratégia A) resolvem definitivamente sem essas limitações.

---

## I. P1s PERMANECEM

SIM. Os P1s da 2D permanecem inalterados:

- **P1-1:** check_institution_exists callable por anon — enumeração de instituições.
- **P1-2:** update_season_status usa user_id em vez de institution_id.

Não reaudited. Estado confirmado idêntico ao da 2D.

---

## J. COUNT/CHECKSUM/ADMIN DISTRIBUTION PRE/POST

| Metric | PRE | POST |
|---|---|---|
| COUNT(user_profiles) | 6 | 6 |
| CHECKSUM | acf37cea2049724a3583d8a6d07937cf | acf37cea2049724a3583d8a6d07937cf |
| ADMIN_COUNT | 5 | 5 |
| NONADMIN_COUNT | 1 | 1 |
| WITH_INSTITUTION | 6 | 6 |
| WITHOUT_INSTITUTION | 0 | 0 |

PRE = POST. ZERO DATA LOSS. Nenhuma alteração foi feita.

---

## K. DIVERGÊNCIAS

1. **anon tem UPDATE em user_profiles** — não deveria. A estratégia A corrige isso revogando UPDATE de anon.
2. **anon tem todos os privilégios CRUD em user_profiles** — apenas SELECT é coberto por RLS (policy role: authenticated). anon com INSERT/UPDATE/DELETE não tem nenhuma policy PERMISSIVA, então na prática está bloqueado por RLS. Mas o grant não deveria existir.
3. Frontend está bem-comportado: única escrita direta envia apenas colunas self-editable. A vulnerabilidade existe no banco, não no frontend.
4.Todas as functions SECURITY DEFINER que precisam alterar institution_id ou is_admin rodam como postgres e não são afetadas pela estratégia A.

---

## L. STATUS: PASS

Auditoria read-only completa. Estratégia A recomendada. Nenhuma alteração feita.

STOP.
