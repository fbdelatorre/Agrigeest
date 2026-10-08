# ETAPA 1H-C — AUDITORIA FORENSE DE `delete_invitation`

**Data:** 2026-10-07  
**Modo:** READ-ONLY ABSOLUTO — nenhuma alteração foi feita  
**Objetivo:** Auditar completamente `public.delete_invitation` antes de qualquer correção futura

---

## A. Baseline PRE

### A.1 Contagens

| Tabela | Count PRE |
|---|---|
| auth.users | 6 |
| user_profiles | 6 |
| institutions | 6 |
| invitations | 7 |
| areas | 44 |
| operations | 309 |
| products | 217 |
| product_lots | 149 |
| seasons | 5 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |
| notes | 8 |

### A.2 Sentinelas de Estoque

| Métrica | Valor PRE |
|---|---|
| SUM(products.quantity_in_stock) | 4617076.08296666766681363 |
| SUM(product_lots.quantity) | 185382.00000666667 |
| Items em operations.products_used | 1459 |
| Invalid product_ids | 501 |

---

## B. Checksums PRE

| Tabela | MD5 PRE |
|---|---|
| institutions | 038ff97cb251baa6b4557c3ef05ea823 |
| user_profiles | c987c95562f53f8908c14d32e70d4f49 |
| invitations | a94453b17e8851b84671bdde60a30201 |
| areas | 1f40430c05954fcae4ca737bddc38539 |
| operations | b57c17c9f60ff02f2c059b5b4b682a3b |
| products | 40fa32700e59f87773383c100a225907 |
| product_lots | cdc7b4f6b1cf23c0e71c7717bd0e7312 |
| seasons | 981c3b936b8678c9255424694bf4ffa6 |

---

## C. Identidade da Função

| Propriedade | Valor |
|---|---|
| OID | 17196 |
| Nome | `public.delete_invitation` |
| Assinatura | `delete_invitation(invitation_code text)` |
| Argumentos | `invitation_code text` |
| Tipo retornado | `boolean` |
| Owner | `postgres` |
| Linguagem | `plpgsql` |
| SECURITY DEFINER | **true** |
| Volatilidade | `volatile` |
| proconfig (search_path) | **null** (NENHUM search_path explícito) |
| Overloads | Nenhum — apenas 1 função com esta assinatura |

---

## D. Definição Completa

```sql
CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  -- Get invitation's institution
  SELECT institution_id INTO target_institution_id
  FROM invitations
  WHERE code = invitation_code;

  -- Check if invitation exists
  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if user is admin in the same institution
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  -- Delete the invitation
  DELETE FROM invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id;

  RETURN true;
END;
$function$;
```

### D.1 Elementos Identificados

| Elemento | Presente | Detalhe |
|---|---|---|
| `auth.uid()` | Sim | Usado na cláusula WHERE do EXISTS |
| `user_profiles` | Sim | Não qualificado com `public.` |
| `is_admin` | Sim | `is_admin = true` |
| `institution_id` | Sim | Comparado com `target_institution_id` |
| `invitations` | Sim | Não qualificado com `public.` |
| `invitation_code` | Sim | Parâmetro de entrada |
| `DELETE` | Sim | `DELETE FROM invitations WHERE code = invitation_code AND institution_id = target_institution_id` |
| `RETURN` | Sim | `RETURN false` (não encontrado / não autorizado), `RETURN true` (sucesso) |
| `search_path` | **NÃO** | proconfig = null |
| Tabelas qualificadas | **NÃO** | `invitations` e `user_profiles` sem `public.` |
| `auth.uid() IS NULL` explícito | **NÃO** | Não verificado — se `auth.uid()` for NULL, o EXISTS simplesmente não encontra match e retorna `false` |

---

## E. Grants

### E.1 routine_privileges

| Grantee | Privilege |
|---|---|
| **PUBLIC** | EXECUTE |
| **anon** | EXECUTE |
| authenticated | EXECUTE |
| postgres | EXECUTE |
| service_role | EXECUTE |

### E.2 has_function_privilege

| Role | can_execute |
|---|---|
| authenticated | true |
| **anon** | **true** |
| service_role | true |
| postgres | true |

### E.3 Análise: EXECUTE vs Autorização Interna

**Conceitos distintos que NÃO devem ser confundidos:**

1. **Permissão SQL EXECUTE** — define quem pode *chamar* a função
2. **Autorização interna** — define quem passa pelas checagens `auth.uid()` + `is_admin` dentro da função

**anon tem EXECUTE?** SIM — anon pode *chamar* a função.  
**anon passa pela autorização interna?** NÃO — `auth.uid()` retorna NULL quando chamado por anon, e o EXISTS `WHERE id = auth.uid()` não encontra nenhum `user_profiles` com `id = NULL`. Portanto retorna `false` e o DELETE NÃO é alcançado.

**Conclusão:** anon possui permissão SQL de EXECUTE, mas a barreira de `auth.uid()` impede que o DELETE seja alcançado. No entanto, a concessão de EXECUTE a anon é desnecessária e viola o princípio de menor privilégio. Deve ser revogada.

---

## F. Fluxo Interno

Sequência exata confirmada:

1. **Recebe** `invitation_code` (text)
2. **SELECT institution_id INTO target_institution_id** FROM `invitations` WHERE `code = invitation_code`
3. **Se `target_institution_id IS NULL`** → `RETURN false` (convite não encontrado)
4. **Verifica admin:** `IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = target_institution_id) THEN RETURN false`
5. **Executa DELETE:** `DELETE FROM invitations WHERE code = invitation_code AND institution_id = target_institution_id`
6. **RETURN true**

**Correção em relação ao esperado da auditoria anterior:** A sequência está confirmada exatamente como esperado. Sem divergências.

---

## G. Autorização — Análise Estática por Cenário

| # | Cenário | EXECUTE permitido? | Autorização interna passa? | DELETE alcançado? | Resultado esperado |
|---|---|---|---|---|---|
| A | `auth.uid() = NULL` (anon) | Sim (anon tem EXECUTE) | Não — `auth.uid()` é NULL, EXISTS falha | Não | `RETURN false` |
| B | authenticated sem profile | Sim | Não — `user_profiles` não tem row com `id = auth.uid()` | Não | `RETURN false` |
| C | não-admin da instituição A tentando excluir convite de A | Sim | Não — `is_admin = true` falha | Não | `RETURN false` |
| D | admin da instituição A tentando excluir convite de A | Sim | Sim — `is_admin = true` e `institution_id = target_institution_id` | Sim | `RETURN true`, DELETE executado |
| E | admin da instituição A tentando excluir convite de B | Sim | Não — `institution_id ≠ target_institution_id` | Não | `RETURN false` |
| F | não-admin A tentando excluir convite de B | Sim | Não — falha em `is_admin` e `institution_id` | Não | `RETURN false` |
| G | código inexistente | Sim | N/A — `target_institution_id IS NULL` | Não | `RETURN false` (passo 3) |
| H | código usado (used_at IS NOT NULL) | Sim | Sim se for admin da mesma instituição | **Sim** — DELETE executado | `RETURN true` — **ver seção I** |
| I | código expirado | Sim | Sim se for admin da mesma instituição | **Sim** — DELETE executado | `RETURN true` — **ver seção J** |

---

## H. Unicidade do Código de Convite

### H.1 Constraint

| Constraint | Tipo | Definição |
|---|---|---|
| `invitations_code_key` | UNIQUE | `UNIQUE (code)` |
| `invitations_pkey` | PRIMARY KEY | `PRIMARY KEY (id)` |

### H.2 Índices

| Índice | Definição |
|---|---|
| `invitations_pkey` | `CREATE UNIQUE INDEX invitations_pkey ON public.invitations USING btree (id)` |
| `invitations_code_key` | `CREATE UNIQUE INDEX invitations_code_key ON public.invitations USING btree (code)` |

### H.3 Análise

`code` possui **UNIQUE constraint** e **índice único btree**. Portanto:

- `SELECT institution_id INTO target_institution_id FROM invitations WHERE code = invitation_code` retorna **no máximo 1 row**
- `DELETE FROM invitations WHERE code = invitation_code AND institution_id = target_institution_id` afeta **no máximo 1 row**
- **Não há risco** de excluir múltiplos convites com o mesmo código
- O `INTO` não levanta `TOO_MANY_ROWS` porque o UNIQUE garante 0 ou 1 resultado

---

## I. Convites Usados

### I.1 A Função Permite Excluir Convite Usado?

**SIM.** A função não verifica `used_at IS NOT NULL` antes do DELETE. Qualquer convite (usado ou não) pode ser excluído se o caller for admin da mesma instituição.

### I.2 Impacto da Exclusão

| Pergunta | Resposta |
|---|---|
| A exclusão apaga apenas o registro do convite? | Sim — remove a row de `invitations` |
| Afeta `user_profiles` de quem utilizou? | **NÃO** — `used_by` é FK para `auth.users(id) ON DELETE SET NULL`, mas o DELETE é na direção contrária (deleta a invitation, não o user) |
| Afeta membership do usuário que usou? | **NÃO** — o `user_profiles.institution_id` foi definido por `join_institution` e não tem FK de volta para `invitations` |
| Existe FK de `used_by`? | Sim: `invitations_used_by_fkey` → `auth.users(id) ON DELETE SET NULL` |
| Qual `ON DELETE`? | `SET NULL` — se o *user* for deletado, `used_by` vira NULL. Não relacionado ao DELETE do convite. |

### I.3 Consequência

Excluir um convite **usado** remove permanentemente o registro histórico de:
- Quando foi criado (`created_at`)
- Quem criou (`created_by`)
- Quando foi usado (`used_at`)
- Quem usou (`used_by`)

Isso constitui **perda de histórico de auditoria**. No entanto:
- A membership do usuário que usou o convite **não é afetada**
- Não há FK que impeça a exclusão

### I.4 A UI Impede Excluir Convite Usado?

**SIM.** No frontend (`Settings.tsx` linha 1313):

```tsx
{!invitation.usedAt && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => handleDeleteInvitation(invitation.code)}
    ...
  >
    {language === 'pt' ? 'Excluir' : 'Delete'}
  </Button>
)}
```

O botão "Excluir" **só é renderizado** quando `!invitation.usedAt` (convite não usado). Convites usados não têm botão de exclusão na UI.

### I.5 A Function Impede?

**NÃO.** A function não verifica `used_at`. A proteção existe apenas no frontend. Um chamador direto à API (bypassando o frontend) pode excluir convites usados.

---

## J. Convites Expirados

### J.1 A Função Permite Excluir Convite Expirado?

**SIM.** A função não verifica `expires_at`. Qualquer convite (expirado ou não) pode ser excluído por um admin da mesma instituição.

### J.2 Comportamento da UI

A UI lista todos os convites retornados por `list_active_invitations` (que retorna todos os convites da instituição, sem filtrar por expiração). O botão "Excluir" aparece para todos os convites não usados, incluindo expirados.

### J.3 Avaliação

Permitir excluir convites expirados é **comportamento aceitável** — o admin está limpando convites que não podem mais ser usados. Não há risco funcional.

---

## K. Frontend

### K.1 Localização

| Arquivo | Linha | Contexto |
|---|---|---|
| `src/pages/Settings.tsx` | 310-340 | `handleDeleteInvitation` — função chamadora |
| `src/pages/Settings.tsx` | 313-315 | `.rpc('delete_invitation', { invitation_code: code })` — chamada RPC |
| `src/pages/Settings.tsx` | 1317 | `onClick={() => handleDeleteInvitation(invitation.code)}` — botão |
| `src/pages/Settings.tsx` | 1313 | `{!invitation.usedAt && (` — condição de renderização do botão |
| `src/pages/Settings.tsx` | 1180 | `{profile?.isAdmin && (` — envolve toda a seção de Usuários + Convites |

### K.2 Parâmetro Enviado

O frontend envia diretamente `invitation.code` (o código texto do convite) como `invitation_code`.

### K.3 Condições de Renderização

| Condição | Aplicada |
|---|---|
| Somente admin vê o botão excluir | **Sim** — toda a seção dentro de `{profile?.isAdmin && (...)}` |
| Somente convite não usado mostra botão | **Sim** — `{!invitation.usedAt && (...)}` |
| Convite expirado pode ser excluído | **Sim** — sem verificação de `expires_at` na UI |
| Frontend envia código diretamente | **Sim** — `invitation.code` passado sem transformação |

### K.4 Confirmação de Exclusão

**ATENÇÃO:** `handleDeleteInvitation` **não pede confirmação** antes de excluir. Não há `confirm()` dialog. O clique no botão "Excluir" executa o DELETE imediatamente. Isso é uma preocupação de UX, não de segurança.

---

## L. Relação com 1H-B (`list_active_invitations`)

### L.1 Como a Lista Alimenta `handleDeleteInvitation`

1. `loadInvitations()` chama `list_active_invitations` (proteção 1H-B aplicada — requer `is_admin = true`)
2. A resposta popula o estado `invitations` com objetos contendo `code`, `usedAt`, `expiresAt`, etc.
3. O método `.map()` renderiza cada convite
4. Para convites não usados (`!invitation.usedAt`), o botão "Excluir" é renderizado
5. O clique chama `handleDeleteInvitation(invitation.code)` que chama `delete_invitation`

### L.2 Impacto da Correção 1H-B

A correção 1H-B (adicionar `is_admin = true` ao `list_active_invitations`) **não muda nenhuma expectativa** para `delete_invitation`:

- O frontend já filtrava por `isAdmin` antes de chamar `list_active_invitations` (linha 220)
- Apenas admins veem a lista de convites e portanto apenas admins podem clicar "Excluir"
- `delete_invitation` já verifica `is_admin = true` internamente
- A mudança 1H-B apenas alinhou a função `list_active_invitations` com o que o frontend já garantia

**Nenhuma expectativa nova foi introduzida.** A correção 1H-B é compatível com `delete_invitation`.

---

## M. RLS

### M.1 Policies em `invitations`

| Policy | CMD | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| Admins can create invitations | INSERT (a) | authenticated | — | `EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = invitations.institution_id)` |
| Users can read invitations for their institution | SELECT (r) | authenticated | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | — |

### M.2 Policies em `user_profiles`

| Policy | CMD | Roles | USING/WITH CHECK |
|---|---|---|---|
| Users can create own profile | INSERT | authenticated | `auth.uid() = id` |
| Users can read own profile | SELECT | authenticated | `auth.uid() = id` |
| Users can update own profile | UPDATE | authenticated | `auth.uid() = id` |

### M.3 RLS Status

| Tabela | RLS | FORCE RLS |
|---|---|---|
| invitations | true | **false** |

### M.4 Bypass por SECURITY DEFINER

A função `delete_invitation` é `SECURITY DEFINER` com owner `postgres`. Durante sua execução:

- **RLS é bypassada** — o owner `postgres` é superuser e bypassa RLS automaticamente
- O `DELETE FROM invitations` executa **sem verificar** as policies de RLS
- O `SELECT institution_id FROM invitations` também executa sem RLS
- O `SELECT 1 FROM user_profiles` também executa sem RLS

**Proteções que dependem exclusivamente da lógica interna:**

1. Verificação de que o convite existe (`target_institution_id IS NULL`)
2. Verificação de que `auth.uid()` corresponde a um `user_profiles` com `is_admin = true` e mesma `institution_id`
3. O `DELETE` filtra por `code = invitation_code AND institution_id = target_institution_id`

**Não há nenhuma policy DELETE em `invitations`.** Mesmo se RLS fosse aplicada (FORCE RLS = true), não há policy DELETE permitindo a operação — o acesso dependeria inteiramente da função SECURITY DEFINER.

### M.5 Implicação

Como RLS é bypassada e não há policy DELETE, a **única barreira** entre um chamador e o DELETE é a lógica interna da função. Se essa lógica tiver uma falha (ex: não verificar `is_admin`), o DELETE seria executado para qualquer caller com EXECUTE.

---

## N. Search Path

### N.1 Estado Atual

| Propriedade | Valor |
|---|---|
| proconfig | **null** |
| search_path explícito | **NENHUM** |

### N.2 Referências Não Qualificadas

| Referência | Schema qualificado? |
|---|---|
| `invitations` (no SELECT) | **NÃO** |
| `user_profiles` (no EXISTS) | **NÃO** |
| `invitations` (no DELETE) | **NÃO** |

### N.3 Risco Específico para DELETE

Esta função executa `DELETE FROM invitations`. Sem `search_path` explícito e sem qualificação `public.`:

- O resolvedor de nomes procura `invitations` no `search_path` do caller
- Se o `search_path` incluir um schema controlado pelo attacker (ex: `pg_temp`), um objeto malicioso chamado `invitations` poderia ser resolvido primeiro
- Para DELETE, o ataque seria: criar uma view ou tabela temporária chamada `invitations` em `pg_temp` que redireciona a operação

**No entanto**, na prática via Supabase API:
- O `search_path` do caller é tipicamente `$user, public` (padrão do Postgres)
- O Supabase API não permite que o caller controle o `search_path` diretamente
- O `pg_temp` é automaticamente incluído no `search_path` para funções que não o definem explicitamente

### N.4 Avaliação de Risco

| Classificação | Nível |
|---|---|
| Risco teórico | Médio — search_path não definido e tabelas não qualificadas |
| Risco prático via Supabase API | Baixo — caller não controla search_path diretamente |
| Risco prático via psql direto | Médio — user autenticado com acesso direto ao banco poderia manipular search_path |

### N.5 Recomendação (sem implementar)

`SET search_path = public, pg_temp` e qualificação `public.invitations` / `public.user_profiles` seriam **apropriadas e recomendadas** para alinhar com:
- `join_institution` (1G-B): search_path=public, pg_temp, tabelas qualificadas
- `list_active_invitations` (1H-B): search_path=public, pg_temp, tabelas qualificadas

---

## O. Shadowing

### O.1 Risco Teórico

Sem qualificação `public.`, os nomes `invitations` e `user_profiles` são resolvidos pelo `search_path`. Se um schema anterior no `search_path` contiver um objeto com o mesmo nome:

- `SELECT institution_id FROM invitations` → poderia resolver para `pg_temp.invitations` em vez de `public.invitations`
- `DELETE FROM invitations` → poderia tentar deletar de `pg_temp.invitations`
- `SELECT 1 FROM user_profiles` → poderia resolver para `pg_temp.user_profiles`

### O.2 Risco Prático via Supabase API

| Vetor | Viável? | Explicação |
|---|---|---|
| Criar objeto em `pg_temp` via Supabase RPC | **Não diretamente** | O Supabase API não executa DDL arbitrário |
| Criar objeto em `public` via Supabase API | **Não** | Roles anônimas/authenticated não têm CREATE em `public` |
| Manipular `search_path` via Supabase API | **Não diretamente** | O `search_path` é determinado pela configuração do role, não pelo caller |

### O.3 Conclusão

| Tipo | Avaliação |
|---|---|
| Risco teórico | Existe — nomes não qualificados sem search_path definido |
| Risco prático via Supabase API | **Baixo** — attacker não consegue criar objetos nem manipular search_path |
| Risco prático via acesso direto ao banco | **Médio** — se attacker tiver acesso SQL direto com CREATE em pg_temp |

**Não exagerar a classificação.** O risco prático via Supabase API é baixo, mas a correção é trivial e alinha com as funções já corrigidas.

---

## P. Uso Legítimo

| Role | Precisa executar? | Justificativa |
|---|---|---|
| A — anon | **NÃO** | Anon não tem auth.uid(), sempre retorna false. EXECUTE desnecessário. |
| B — qualquer authenticated | **NÃO diretamente** | Apenas admins passam pela verificação interna. Non-admins sempre recebem false. |
| C — admin da própria instituição | **SIM** | É o único caso que retorna true e executa DELETE |
| D — service_role | **NÃO VALIDADO** | service_role tem EXECUTE, mas auth.uid() em contexto service_role pode retornar NULL. Ver seção 23. |
| E — função não utilizada | **NÃO** | A função é utilizada pelo frontend |
| F — indeterminado | — | — |

**Conclusão:** Apenas **admins autenticados** precisam executar esta função. Os grants para PUBLIC e anon são desnecessários.

---

## Q. DELETE e Histórico

### Q.1 `invitations` é Usada como Histórico?

Sim. A tabela `invitations` armazena:

| Campo | Uso como histórico |
|---|---|
| `created_at` | Quando o convite foi criado |
| `created_by` | Quem criou o convite |
| `used_at` | Quando o convite foi usado |
| `used_by` | Quem usou o convite |

### Q.2 A Lista de Convites no Settings Exibe Histórico?

Sim. `list_active_invitations` retorna **todos** os convites da instituição, incluindo usados e expirados. A UI exibe:

- Código do convite
- "Criado por": `created_by_name`
- "Expira em": `expires_at`
- Badge "Usado" ou "Pendente"
- Se usado: "Usado por": `used_by_name` + data

### Q.3 Excluir Convite Não Utilizado Faz Sentido?

**Sim.** Um convite pendente que o admin decide revogar (ex: enviado para pessoa errada, gerado por engano) deve poder ser excluído. Isso remove um código válido que ainda poderia ser usado.

### Q.4 Excluir Convite Já Utilizado Faria Perder Histórico?

**Sim.** Excluir um convite usado remove permanentemente o registro de quem usou o convite e quando. Isso é **perda de histórico de auditoria**.

### Q.5 A UI Impede Excluir Convite Usado?

**Sim** — o botão "Excluir" só aparece para `!invitation.usedAt`.

### Q.6 A Function Impede?

**NÃO** — a function não verifica `used_at`. A proteção existe apenas no frontend. Um chamador direto à API pode excluir convites usados e perder histórico.

### Q.7 Recomendação

A function deveria verificar `used_at IS NULL` antes do DELETE para impedir exclusão de convites usados via API direta, alinhando com a proteção do frontend. **No entanto, isso é uma mudança de comportamento funcional, não apenas de segurança.** Recomenda-se avaliar separadamente.

---

## R. Soft Delete

### R.1 Análise Conceitual

Em vez de `DELETE FROM invitations`, seria melhor usar:

| Opção | Coluna | Comportamento |
|---|---|---|
| `revoked_at` | timestamptz | Convite revogado manualmente pelo admin |
| `cancelled_at` | timestamptz | Convite cancelado |
| `deleted_at` | timestamptz | Soft delete genérico |

### R.2 Vantagens

- Preserva histórico de auditoria
- Permite recuperar convite revogado por engano
- Permite análise forense ("quando foi revogado?", "por quem?")

### R.3 Avaliação

**NÃO recomendado para esta etapa.** O objetivo atual é **segurança**, não redesenho de schema. A mudança para soft delete:

- Requer migration com nova coluna (ALTER TABLE)
- Requer mudança na function (UPDATE em vez de DELETE)
- Requer mudança no frontend (exibir convites revogados diferentemente)
- Requer mudança no `list_active_invitations` (filtrar revogados)

**Classificação:** Melhoria futura, não correção de segurança. Não implementar agora.

---

## S. Cenários de Ataque

| # | Cenário | Barreira que impede DELETE | Possibilidade real de exclusão indevida? |
|---|---|---|---|
| 1 | anon conhece `invitation_code` | `auth.uid()` retorna NULL → EXISTS falha → `RETURN false` | **Não** |
| 2 | membro comum conhece `invitation_code` | `is_admin = true` falha → `RETURN false` | **Não** |
| 3 | admin A conhece código de B | `institution_id ≠ target_institution_id` → `RETURN false` | **Não** |
| 4 | attacker manipula search_path | Não há search_path definido, mas via Supabase API o attacker não controla search_path | **Baixo risco prático** |
| 5 | caller envia código inexistente | `target_institution_id IS NULL` → `RETURN false` | **Não** — nada a excluir |
| 6 | caller envia código usado | Sem verificação de `used_at` → **DELETE é executado** se caller for admin | **Sim** — perda de histórico, mas requer admin da mesma instituição |
| 7 | caller envia código expirado | Sem verificação de `expires_at` → DELETE é executado se caller for admin | **Sim** — mas comportamento aceitável (limpeza de expirados) |

### S.1 Resumo de Risco

| Cenário | Risco | Severidade |
|---|---|---|
| 1-3, 5 | Exclusão indevida por não-autorizado | **Muito baixo** — barreira interna de auth.uid() + is_admin funciona |
| 4 | Shadowing via search_path | **Baixo prático** — Supabase API não permite controle de search_path |
| 6 | Exclusão de convite usado | **Médio** — perde histórico, mas requer admin |
| 7 | Exclusão de expirado | **Baixo** — comportamento aceitável |

---

## T. Risco Geral

| Categoria | Nível | Detalhe |
|---|---|---|
| Exclusão por não-autorizado | **Baixo** | auth.uid() + is_admin + institution_id verificam corretamente |
| Exclusão por anon | **Muito baixo** | auth.uid() = NULL bloqueia |
| Cross-institution | **Muito baixo** | institution_id verificado |
| Shadowing/search_path | **Baixo prático** | Não controlável via Supabase API |
| Perda de histórico (convite usado) | **Médio** | Function não verifica used_at, mas frontend impede |
| Grants excessivos | **Médio** | PUBLIC e anon têm EXECUTE desnecessariamente |
| Risco geral | **Médio** | Lógica de autorização interna é sólida, mas grants e search_path são inconsistentes com funções já corrigidas |

---

## U. Correção Cirúrgica Futura

### U.1 Combinação Mínima Recomendada (SEM IMPLEMENTAR)

| Item | Recomendado | Justificativa |
|---|---|---|
| A) `auth.uid() IS NULL` explícito | **Sim** | Early exit claro em vez de depender do EXISTS retornar false |
| B) Preservar `is_admin = true` | **Sim** | Já existe, funciona corretamente |
| C) Preservar same institution | **Sim** | Já existe, funciona corretamente |
| D) REVOKE PUBLIC | **Sim** | Desnecessário, viola menor privilégio |
| E) REVOKE anon | **Sim** | Desnecessário, viola menor privilégio |
| F) GRANT authenticated | **Sim** | Mantém acesso para admins autenticados |
| G) Preservar service_role/postgres | **Sim** | Mantém acesso administrativo |
| H) `SET search_path = public, pg_temp` | **Sim** | Alinha com join_institution e list_active_invitations |
| I) Qualificar `public.invitations` | **Sim** | Previne shadowing |
| J) Qualificar `public.user_profiles` | **Sim** | Previne shadowing |

### U.2 Mudança de Comportamento NÃO Recomendada Nesta Etapa

| Item | Recomendado? | Justificativa |
|---|---|---|
| Verificar `used_at IS NULL` antes do DELETE | **Avaliar separadamente** | É mudança funcional, não de segurança. Frontend já impede. |
| Adicionar `confirm()` no frontend | **Avaliar separadamente** | É melhoria de UX, não de segurança. |
| Migrar para soft delete | **Não agora** | Redesenho de schema, fora do escopo de segurança. |

### U.3 Definição Futura Esperada (referência)

```sql
CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT institution_id INTO target_institution_id
  FROM public.invitations
  WHERE code = invitation_code;

  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM public.invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id;

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.delete_invitation(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_invitation(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_invitation(text) TO postgres;
```

**Nota:** Esta é apenas referência para a próxima etapa. NÃO foi implementada.

---

## V. Rollback Teórico

### V.1 Estado PRE Capturado para Rollback Futuro

**Definição PRE:**
```sql
CREATE OR REPLACE FUNCTION public.delete_invitation(invitation_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_institution_id uuid;
BEGIN
  SELECT institution_id INTO target_institution_id
  FROM invitations
  WHERE code = invitation_code;

  IF target_institution_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = target_institution_id
  ) THEN
    RETURN false;
  END IF;

  DELETE FROM invitations
  WHERE code = invitation_code
  AND institution_id = target_institution_id;

  RETURN true;
END;
$function$;
```

**Grants PRE:**
- PUBLIC: EXECUTE
- anon: EXECUTE
- authenticated: EXECUTE
- postgres: EXECUTE
- service_role: EXECUTE

**search_path PRE:** null (nenhum)

**Owner PRE:** postgres

**Assinatura PRE:** `delete_invitation(invitation_code text)` returns `boolean`

---

## W. Baseline POST

### W.1 Contagens POST

| Tabela | Count PRE | Count POST | Match |
|---|---|---|---|
| auth.users | 6 | 6 | ✅ |
| user_profiles | 6 | 6 | ✅ |
| institutions | 6 | 6 | ✅ |
| invitations | 7 | 7 | ✅ |
| areas | 44 | 44 | ✅ |
| operations | 309 | 309 | ✅ |
| products | 217 | 217 | ✅ |
| product_lots | 149 | 149 | ✅ |
| seasons | 5 | 5 | ✅ |
| machinery | 19 | 19 | ✅ |
| maintenances | 3 | 3 | ✅ |
| maintenance_types | 2 | 2 | ✅ |
| notes | 8 | 8 | ✅ |

### W.2 Sentinelas POST

| Métrica | PRE | POST | Match |
|---|---|---|---|
| SUM(quantity_in_stock) | 4617076.08296666766681363 | 4617076.08296666766681363 | ✅ |
| SUM(quantity) lots | 185382.00000666667 | 185382.00000666667 | ✅ |
| Items em products_used | 1459 | 1459 | ✅ |
| Invalid product_ids | 501 | 501 | ✅ |

---

## X. Checksums POST

| Tabela | MD5 PRE | MD5 POST | Match |
|---|---|---|---|
| institutions | 038ff97cb251baa6b4557c3ef05ea823 | 038ff97cb251baa6b4557c3ef05ea823 | ✅ |
| user_profiles | c987c95562f53f8908c14d32e70d4f49 | c987c95562f53f8908c14d32e70d4f49 | ✅ |
| invitations | a94453b17e8851b84671bdde60a30201 | a94453b17e8851b84671bdde60a30201 | ✅ |
| areas | 1f40430c05954fcae4ca737bddc38539 | 1f40430c05954fcae4ca737bddc38539 | ✅ |
| operations | b57c17c9f60ff02f2c059b5b4b682a3b | b57c17c9f60ff02f2c059b5b4b682a3b | ✅ |
| products | 40fa32700e59f87773383c100a225907 | 40fa32700e59f87773383c100a225907 | ✅ |
| product_lots | cdc7b4f6b1cf23c0e71c7717bd0e7312 | cdc7b4f6b1cf23c0e71c7717bd0e7312 | ✅ |
| seasons | 981c3b936b8678c9255424694bf4ffa6 | 981c3b936b8678c9255424694bf4ffa6 | ✅ |

**ZERO DATA LOSS confirmado.** PRE = POST em todas as métricas.

---

## Y. Proteções Anteriores

### Y.1 Funções SECURITY DEFINER — Estado Atual

| Função | SECURITY DEFINER | search_path | Grants PUBLIC/anon |
|---|---|---|---|
| `list_institution_users` | true | public, pg_temp | **Revogados** ✅ |
| `copy_data_to_institution` | true | public, pg_temp | **Revogados** ✅ |
| `handle_user_registration` | true | public, pg_temp | **Revogados** ✅ |
| `join_institution` | true | public, pg_temp | **Revogados** ✅ |
| `list_active_invitations` | true | public, pg_temp | **Revogados** ✅ (1H-B) |
| `create_invitation` | true | public | **AINDA PRESENTES** ⚠️ |
| `delete_invitation` | true | **null** | **AINDA PRESENTES** ⚠️ |
| `handle_new_user` | true | null | Não analisado (trigger) |
| `clean_expired_invitations` | true | null | Não analisado |
| `validate_invitation` | true | public | Não analisado |
| `toggle_user_admin_status` | true | null | Não analisado |
| `update_season_status` | true | null | Não analisado |
| `check_institution_exists` | true | null | Não analisado |

### Y.2 Confirmação Específica 1H-B

`list_active_invitations`:
- `is_admin = true`: ✅ Confirmado na definição
- `search_path = public, pg_temp`: ✅ Confirmado (proconfig)
- PUBLIC sem EXECUTE: ✅ Confirmado
- anon sem EXECUTE: ✅ Confirmado

### Y.3 Grants Completos de Todas as Funções Protegidas

| Função | authenticated | postgres | service_role | PUBLIC | anon |
|---|---|---|---|---|---|
| list_institution_users | ✅ | ✅ | ✅ | ❌ | ❌ |
| copy_data_to_institution | ❌ | ✅ | ✅ | ❌ | ❌ |
| handle_user_registration | ✅ | ✅ | ✅ | ❌ | ❌ |
| join_institution | ✅ | ✅ | ✅ | ❌ | ❌ |
| list_active_invitations | ✅ | ✅ | ✅ | ❌ | ❌ |
| create_invitation | ✅ | ✅ | ✅ | ⚠️ Sim | ⚠️ Sim |
| delete_invitation | ✅ | ✅ | ✅ | ⚠️ Sim | ⚠️ Sim |

---

## Z. Divergências

### Z.1 Divergências em Relação à Auditoria Anterior (1H-A)

Nenhuma divergência encontrada. A auditoria 1H-A indicava:
- SECURITY DEFINER: **confirmado** ✅
- Verifica is_admin: **confirmado** ✅
- Verifica institution_id: **confirmado** ✅
- Possui PUBLIC EXECUTE: **confirmado** ✅
- Possui anon EXECUTE: **confirmado** ✅
- Não possui search_path: **confirmado** (proconfig = null) ✅
- Usa tabelas sem qualificação: **confirmado** ✅

### Z.2 Divergências em Relação ao Esperado

| Item | Esperado | Encontrado | Status |
|---|---|---|---|
| Fluxo interno | 8 passos | 6 passos (equivalentes) | ✅ Sem divergência real |
| `code` é UNIQUE | Assumido | Confirmado por constraint | ✅ |
| `used_at` verificado antes do DELETE | Não verificado pela function | Confirmado — não verificado | ⚠️ Risco de perda de histórico |
| `confirm()` no frontend | Assumido que existia | **Não existe** — delete sem confirmação | ⚠️ Preocupação de UX |

### Z.3 Observações Adicionais

1. **`handleDeleteInvitation` não pede confirmação** — o clique no botão "Excluir" executa o DELETE imediatamente, sem `confirm()`. Isso é uma preocupação de UX (não de segurança) — um clique acidental pode excluir um convite.

2. **Convite `644ac7` (instituição b380c711)** tem `used_at = NULL` e `used_by = NULL` mas está **expirado** (expires_at = 2025-05-30). Pode ser excluído pela UI se um admin dessa instituição estiver logado.

3. **Convite `24208731`** também tem `used_at = NULL`, expirado em 2026-09-29. É o único convite pendente não expirado... na verdade está expirado (data atual 2026-10-07 > 2026-09-29).

4. **Todos os 7 convites na tabela estão expirados** — 4 usados, 3 não usados mas expirados. Não há convites válidos no momento.

---

## AA. Resumo Final

### Vulnerabilidades Identificadas

| # | Vulnerabilidade | Severidade | Tipo |
|---|---|---|---|
| 1 | Grants PUBLIC e anon EXECUTE | Média | Princípio de menor privilégio |
| 2 | Sem search_path explícito | Média | Hardening |
| 3 | Tabelas não qualificadas (public.*) | Baixa | Hardening |
| 4 | Sem auth.uid() IS NULL explícito | Baixa | Clareza de código |
| 5 | Sem verificação de used_at antes do DELETE | Média | Perda de histórico (frontend protege, mas API direta não) |
| 6 | Frontend sem confirm() antes do delete | Baixa | UX |

### O Que Funciona Corretamente

| # | Proteção | Status |
|---|---|---|
| 1 | is_admin = true verificado | ✅ Funciona |
| 2 | institution_id verificado (mesma instituição) | ✅ Funciona |
| 3 | anon não consegue executar DELETE (auth.uid() = NULL) | ✅ Funciona |
| 4 | Non-admin não consegue executar DELETE | ✅ Funciona |
| 5 | Cross-institution bloqueado | ✅ Funciona |
| 6 | Código inexistente retorna false | ✅ Funciona |
| 7 | UNIQUE constraint em code | ✅ Garantido |

### Recomendação para Próxima Etapa (1H-D)

Correção cirúrgica recomendada:
1. Adicionar `IF auth.uid() IS NULL THEN RETURN false` (early exit)
2. Adicionar `SET search_path = public, pg_temp`
3. Qualificar todas as tabelas com `public.*`
4. REVOKE PUBLIC e anon
5. GRANT authenticated, service_role, postgres
6. **Preservar** toda a lógica de autorização existente (is_admin, institution_id)
7. **Não alterar** o comportamento do DELETE (não adicionar verificação de used_at nesta etapa)

**Status:** READ-ONLY ABSOLUTO. Nenhuma alteração foi feita. ZERO DATA LOSS. Aguardando revisão externa.
