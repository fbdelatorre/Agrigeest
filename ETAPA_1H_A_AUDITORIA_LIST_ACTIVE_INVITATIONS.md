# ETAPA 1H-A — AUDITORIA FORENSE DE list_active_invitations
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**MODO:** READ-ONLY ABSOLUTO. Nenhuma migration criada. Nenhuma função alterada. Nenhum dado modificado.

---

## A. BASELINE PRE

| Tabela | Contagem |
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

| Sentinela | Valor |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## B. CHECKSUMS PRE

| Tabela | Checksum |
|---|---|
| institutions | `038ff97cb251baa6b4557c3ef05ea823` |
| user_profiles | `c987c95562f53f8908c14d32e70d4f49` |
| invitations | `a94453b17e8851b84671bdde60a30201` |
| areas | `1f40430c05954fcae4ca737bddc38539` |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` |
| products | `40fa32700e59f87773383c100a225907` |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` |
| seasons | `981c3b936b8678c9255424694bf4ffa6` |

---

## C. IDENTIDADE DA FUNÇÃO

| Propriedade | Valor |
|---|---|
| OID | 17201 |
| Nome | list_active_invitations |
| Assinatura | `list_active_invitations(institution_id_param uuid)` |
| Retorno | `TABLE(code text, created_at timestamptz, expires_at timestamptz, created_by_name text, used_at timestamptz, used_by_name text)` |
| Owner | postgres |
| Language | plpgsql |
| SECURITY DEFINER | **true** |
| Volatility | VOLATILE (V) |
| proconfig / search_path | **null** (nenhum search_path explícito) |
| Overloads | **1** (não há múltiplos overloads) |

---

## D. DEFINIÇÃO COMPLETA

```sql
CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(code text, created_at timestamp with time zone, expires_at timestamp with time zone, created_by_name text, used_at timestamp with time zone, used_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Check if user belongs to institution
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'User does not belong to this institution';
  END IF;

  RETURN QUERY
  SELECT 
    i.code,
    i.created_at,
    i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at,
    (up.first_name || ' ' || up.last_name) as used_by_name
  FROM invitations i
  LEFT JOIN user_profiles cp ON cp.id = i.created_by
  LEFT JOIN user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$function$;
```

### Análise da definição:

| Elemento | Presente | Observação |
|---|---|---|
| `auth.uid()` | **SIM** | Verifica membership |
| `user_profiles` | SIM | Consulta sem qualificar schema |
| `institution_id` | SIM | Compara com parâmetro |
| `is_admin` | **NÃO** | Não verifica se é admin |
| `invitations` | SIM | Consulta sem qualificar schema |
| `institutions` | Não | Não referencia diretamente |
| `expires_at` | Retornado | Mas NÃO filtra por expiração |
| `used_at` | Retornado | Mas NÃO filtra por uso |
| `code` | **Retornado completo** | O código completo do convite é exposto |
| `created_by` | Indireto | Retorna nome do criador, não ID |
| `search_path` | **AUSENTE** | Nenhum `SET search_path` |
| Tabelas qualificadas | **NÃO** | `user_profiles` e `invitations` sem prefixo `public.` |

---

## E. GRANTS

### information_schema.routine_privileges:

| Grantee | EXECUTE |
|---|---|
| **PUBLIC** | **Sim** |
| **anon** | **Sim** |
| **authenticated** | **Sim** |
| postgres | Sim |
| service_role | Sim |

### has_function_privilege:

| Role | can_execute |
|---|---|
| **anon** | **true** |
| authenticated | true |
| service_role | true |
| postgres | true |

### Análise:

**PUBLIC possui EXECUTE.** Isso significa que TODOS os roles herdam EXECUTE, incluindo `anon`. O grant para `anon` é redundante (já coberto por PUBLIC), mas confirma o estado.

**anon pode executar a função.** A função é SECURITY DEFINER, então executa como `postgres` (owner), bypassando RLS. O único controle de acesso dentro da função é a verificação `auth.uid()`.

---

## F. AUTORIZAÇÃO

### Análise estática pela definição SQL:

**A) auth.uid() NULL consegue chegar aos dados?**

A função verifica:
```sql
IF NOT EXISTS (
  SELECT 1 FROM user_profiles
  WHERE id = auth.uid()
  AND institution_id = institution_id_param
) THEN
  RAISE EXCEPTION 'User does not belong to this institution';
END IF;
```

Se `auth.uid()` é NULL, `id = NULL` não satisfaz a condição. `EXISTS` retorna false. `NOT EXISTS` é true. A exceção é lançada.

→ **NÃO.** Anon não consegue chegar aos dados. A exceção é levantada antes do `RETURN QUERY`.

**B) authenticated sem user_profile consegue?**

Se o usuário não tem profile, `EXISTS` retorna false. Exceção é lançada.

→ **NÃO.**

**C) usuário da instituição A consegue solicitar convites de A?**

Se `auth.uid() = user_id` e `user_profiles.institution_id = A = institution_id_param`, `EXISTS` retorna true. `NOT EXISTS` é false. A função continua para `RETURN QUERY`.

→ **SIM.** Qualquer membro de A (admin ou não) consegue ver os convites de A.

**D) usuário NÃO-admin da instituição A consegue?**

A função NÃO verifica `is_admin`. Se o usuário é membro de A (independente de ser admin), a verificação de membership passa.

→ **SIM.** Usuário não-admin consegue ver todos os convites de sua instituição, incluindo códigos completos.

**E) admin da instituição A consegue?**

→ **SIM.** Admin é membro, verificação passa.

**F) usuário da instituição A consegue solicitar convites da instituição B?**

Se `auth.uid()` pertence a A mas `institution_id_param = B`, `EXISTS` verifica `institution_id = B`. Como o profile tem `institution_id = A`, a condição não é satisfeita. Exceção é lançada.

→ **NÃO.** Cross-institution é bloqueado pela verificação de membership.

**G) admin da instituição A consegue solicitar convites da instituição B?**

Mesmo que F. Admin de A tem `institution_id = A`, não `B`. Exceção é lançada.

→ **NÃO.** Cross-institution é bloqueado mesmo para admins.

---

## G. DADOS RETORNADOS

### Campos retornados:

| Campo | Tipo | Conteúdo |
|---|---|---|
| `code` | text | **Código completo do convite** |
| `created_at` | timestamptz | Data de criação |
| `expires_at` | timestamptz | Data de expiração |
| `created_by_name` | text | Nome (first + last) de quem criou |
| `used_at` | timestamptz | Data de uso (NULL se não usado) |
| `used_by_name` | text | Nome de quem usou (NULL se não usado) |

### Análise:

- **O código completo do convite é retornado?** **SIM.** O campo `code` contém o código completo (ex: "A4****" → código real de 8 caracteres).
- **Apenas convites ativos?** **NÃO.** A função se chama `list_active_invitations` mas NÃO filtra por `used_at IS NULL` nem por `expires_at > now()`. Retorna TODOS os convites da instituição, incluindo usados e expirados.
- **Convites usados aparecem?** **SIM.** O `WHERE` é apenas `i.institution_id = institution_id_param`, sem filtro de `used_at`.
- **Convites expirados aparecem?** **SIM.** Não há filtro de `expires_at`.
- **Existe email ou dado pessoal?** Não diretamente. `created_by_name` e `used_by_name` retornam nomes (first + last), não emails. No entanto, nomes podem ser considerados dados pessoais.

### Discrepância de nome:

A função se chama `list_active_invitations` mas retorna **todos** os convites, não apenas os ativos. O frontend trata isso exibindo badges "Pendente" vs "Usado" e permite excluir apenas convites não usados.

---

## H. SENSIBILIDADE DO CÓDIGO DE CONVITE

### O que um invitation code válido permite:

1. **validate_invitation:** Verifica se o código é válido, ativo e não expirado. Qualquer pessoa (incluindo anon) pode validar.
2. **join_institution:** Após signup, usa o código para entrar na instituição. Após 1G-D, apenas usuários sem instituição podem usar.
3. **Acessar dados após cadastro:** Uma vez na instituição, o usuário passa a ver todos os dados da instituição (áreas, operações, produtos, etc.) via RLS.

### Classificação: **ALTA sensibilidade**

**Justificativa:** Possuir um código de convite válido permite criar uma conta associada à instituição e ganhar acesso a todos os dados da instituição. Embora a etapa 1G-D tenha bloqueado troca de instituição, um **novo** usuário sem instituição ainda pode usar o código para entrar. O código é a única barreira entre um atacante externo e o acesso aos dados da instituição.

---

## I. FRONTEND

### Uso de list_active_invitations:

| Arquivo | Linha | Contexto |
|---|---|---|
| `Settings.tsx` | 223 | Chamada RPC em `loadInvitations()` |

### `loadInvitations()` (linha 218-240):

```typescript
const loadInvitations = async () => {
  try {
    if (!profile?.institutionId || !profile.isAdmin) return;  // ← CHECK isAdmin

    const { data, error } = await supabase
      .rpc('list_active_invitations', {
        institution_id_param: profile.institutionId
      });
    ...
  }
};
```

**O frontend verifica `!profile.isAdmin` antes de chamar a RPC.** Se o usuário não é admin, a função retorna early e a RPC não é chamada.

### Renderização da UI (linhas 1180-1357):

```tsx
{profile?.isAdmin && (
  <>
    {/* Institution Users */}
    <Card>...</Card>

    {/* Invitations */}
    <Card>
      ...invitations.map((invitation) => ...)
    </Card>
  </>
)}
```

**A seção de convites é renderizada apenas quando `profile?.isAdmin` é true.** Usuário não-admin não vê a seção de convites na UI.

### `useEffect` que carrega convites (linha 106-112):

```typescript
useEffect(() => {
  if (profile?.institutionId && isOnline) {
    loadUsers();
    loadInvitations();
    loadSeasons();
  }
}, [profile?.institutionId, isOnline]);
```

**Observação:** O `useEffect` chama `loadInvitations()` quando `profile.institutionId` existe e está online. No entanto, `loadInvitations()` internamente verifica `!profile.isAdmin` e retorna early se não for admin. Portanto, a RPC não é chamada para não-admins.

### Diferenciação: "frontend esconde" vs "backend impede":

- **Frontend esconde:** SIM. A UI só renderiza a seção de convites para admins. A função `loadInvitations` retorna early se não for admin.
- **Backend impede:** PARCIALMENTE. A função verifica membership (mesma instituição) mas **NÃO** verifica `is_admin`. Um usuário não-admin que chamasse a RPC diretamente (via console do browser, curl, etc.) com `institution_id_param` da sua própria instituição **conseguiria ver todos os convites incluindo códigos**.

**Isso é uma vulnerabilidade:** o frontend esconde, mas o backend não impede usuário não-admin de ver códigos de convite.

---

## J. PARÂMETROS

### `institution_id_param`:

O frontend obtém este valor de `profile.institutionId` (linha 224), que vem de `user_profiles.institution_id` (linha 172).

**É caller-controlled?** SIM. O parâmetro é passado pelo cliente. Um usuário poderia chamar a RPC manualmente com qualquer UUID como `institution_id_param`.

No entanto, a verificação de membership dentro da função:
```sql
WHERE id = auth.uid() AND institution_id = institution_id_param
```
garante que o usuário só recebe dados se `institution_id_param` corresponder à instituição do seu profile. Passar um `institution_id_param` diferente resulta em exceção.

**Cross-institution é bloqueado** pela verificação de membership.

---

## K. RLS

### Como SECURITY DEFINER afeta RLS:

A função é `SECURITY DEFINER` com owner `postgres`. Isso significa que **RLS é bypassada** durante a execução da função. As queries dentro da função (`SELECT FROM invitations`, `SELECT FROM user_profiles`) executam com os privilégios de `postgres`, que bypassa RLS.

### Policies de `invitations`:

| Policy | Cmd | Qual | Aplica-se dentro da função? |
|---|---|---|---|
| Users can read invitations for their institution | SELECT | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | **NÃO** — RLS bypassada |
| Admins can create invitations | INSERT | — | **NÃO** — RLS bypassada |

### Policies de `user_profiles`:

| Policy | Cmd | Qual | Aplica-se dentro da função? |
|---|---|---|---|
| Users can read own profile | SELECT | `auth.uid() = id` | **NÃO** — RLS bypassada |

### Conclusão:

**RLS NÃO protege chamadas através desta função SECURITY DEFINER.** A única proteção é a verificação manual `auth.uid()` dentro da função. Se essa verificação for bypassada ou contornada, RLS não oferece proteção adicional.

A verificação manual é adequada para membership (mesma instituição), mas **não verifica is_admin**, deixando usuário não-admin ver códigos de convite.

---

## L. SEARCH PATH

### Estado atual:

| Propriedade | Valor |
|---|---|
| proconfig | **null** |
| search_path explícito | **AUSENTE** |
| Referências qualificadas | **NÃO** — `user_profiles` e `invitations` sem `public.` |

### Risco:

**MÉDIO.** Sem `SET search_path`, a função usa o search_path da sessão do caller. Um atacante que controle o search_path (via configuração de conexão) poderia criar objetos em `pg_temp` que sombreariam `user_profiles` ou `invitations`, redirecionando as queries para objetos maliciosos.

No entanto, o atacante precisaria de capacidade de criar objetos em `pg_temp` e manipular o search_path, o que é mais difícil na prática via API Supabase.

### Recomendação futura (não implementar):

- `SET search_path = public, pg_temp`
- Qualificar tabelas: `public.user_profiles`, `public.invitations`

---

## M. USO LEGÍTIMO

### Quem realmente PRECISA usar a função?

O frontend chama `list_active_invitations` apenas em `Settings.tsx` dentro de `loadInvitations()`, que tem check `!profile.isAdmin`. A UI de convites (listar, criar, excluir) está dentro de `{profile?.isAdmin && (...)}`.

**Resposta: B — somente admin da instituição.**

A função serve para gerenciamento administrativo de convites. Usuário comum não precisa ver códigos de convite. O frontend já reflete isso, mas o backend não.

---

## N. CENÁRIOS

### CASO 1: anon (sem sessão)

| Aspecto | Resultado |
|---|---|
| EXECUTE permitido? | **SIM** (PUBLIC grant) |
| Função autoriza? | **NÃO** — `auth.uid()` é NULL, `EXISTS` retorna false, exceção |
| Dados retornáveis? | Nenhum — exceção antes do RETURN QUERY |
| Risco? | **BAIXO** — não consegue extrair dados |

### CASO 2: authenticated sem institution

| Aspecto | Resultado |
|---|---|
| EXECUTE permitido? | SIM |
| Função autoriza? | **NÃO** — sem profile, `EXISTS` retorna false, exceção |
| Dados retornáveis? | Nenhum |
| Risco? | **BAIXO** |

### CASO 3: authenticated não-admin da instituição A

| Aspecto | Resultado |
|---|---|
| EXECUTE permitido? | SIM |
| Função autoriza? | **SIM** — membership verificada, is_admin NÃO verificado |
| Dados retornáveis? | **TODOS os convites de A** incluindo códigos completos, ativos e usados |
| Risco? | **ALTO** — usuário comum vê códigos de convite que permitem criar contas na instituição |

### CASO 4: admin da instituição A

| Aspecto | Resultado |
|---|---|
| EXECUTE permitido? | SIM |
| Função autoriza? | SIM |
| Dados retornáveis? | TODOS os convites de A |
| Risco? | **BAIXO** — uso legítimo |

### CASO 5: não-admin A tentando institution B

| Aspecto | Resultado |
|---|---|
| EXECUTE permitido? | SIM |
| Função autoriza? | **NÃO** — `institution_id = B` não satisfaz membership (profile tem A) |
| Dados retornáveis? | Nenhum — exceção |
| Risco? | **BAIXO** — cross-institution bloqueado |

### CASO 6: admin A tentando institution B

| Aspecto | Resultado |
|---|---|
| EXECUTE permitido? | SIM |
| Função autoriza? | **NÃO** — mesmo que CASO 5, membership verifica institution_id |
| Dados retornáveis? | Nenhum |
| Risco? | **BAIXO** |

---

## O. RELAÇÃO COM create_invitation

### create_invitation:

```sql
CREATE OR REPLACE FUNCTION public.create_invitation(p_institution_id uuid, p_expires_in_days integer DEFAULT 7)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_code text;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;
  ...
```

### Análise:

| Pergunta | Resposta |
|---|---|
| create_invitation exige admin? | **SIM** — verifica `is_admin = true` |
| Frontend usa list_active_invitations após criar? | **SIM** — `handleCreateInvitation` chama `loadInvitations()` |
| A lista serve para gerenciamento administrativo? | **SIM** |

### Grants de create_invitation:

| Grantee | EXECUTE |
|---|---|
| **PUBLIC** | **Sim** |
| **anon** | **Sim** |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

**create_invitation também tem PUBLIC EXECUTE**, mas a função verifica `is_admin = true` internamente, então anon e não-admin são bloqueados pela lógica da função (não pelos grants).

### Discrepância:

`create_invitation` verifica `is_admin = true`. `list_active_invitations` NÃO verifica `is_admin`. Isso é inconsistente — criar exige admin, mas listar não.

---

## P. RELAÇÃO COM delete_invitation

### delete_invitation:

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

### Análise:

| Pergunta | Resposta |
|---|---|
| UI usa a lista para excluir convites? | **SIM** — `handleDeleteInvitation` é chamado a partir da lista |
| delete_invitation exige admin? | **SIM** — verifica `is_admin = true` |
| Isso reforça que list_active_invitations deveria ser admin-only? | **SIM** |

### Grants de delete_invitation:

| Grantee | EXECUTE |
|---|---|
| **PUBLIC** | **Sim** |
| **anon** | **Sim** |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

**delete_invitation também tem PUBLIC EXECUTE**, mas verifica `is_admin = true` internamente.

### Padrão observado:

- `create_invitation`: verifica `is_admin = true` ✓
- `delete_invitation`: verifica `is_admin = true` ✓
- `list_active_invitations`: **NÃO verifica `is_admin`** ✗

**Isso é uma inconsistência clara.** Criar e excluir convites exige admin, mas listar (que expõe os códigos) não exige. A função mais sensível (listar, que expõe códigos) tem a verificação mais fraca.

---

## Q. RISCO

### Classificação geral: **ALTO**

| Vetor | Risco | Justificativa |
|---|---|---|
| anon | BAIXO | `auth.uid()` NULL bloqueia |
| usuário comum da mesma instituição | **ALTO** | Pode ver códigos de convite completos sem ser admin. Códigos permitem criar contas na instituição |
| cross-institution | BAIXO | Verificação de membership bloqueia |
| vazamento do invitation code | **ALTO** | Usuário não-admin pode extrair códigos via chamada RPC direta (console, curl) |
| privilege escalation | **MÉDIO** | Usuário não-admin com código pode convidar outras pessoas para a instituição, potencialmente criando aliados ou acessando dados indiretamente |

### Por que ALTO e não CRÍTICO:

- Cross-institution é bloqueado
- Anon é bloqueado
- O código permite criar conta (não acesso direto sem cadastro)
- A etapa 1G-D bloqueou troca de instituição por usuários existentes
- O atacante precisa estar autenticado como membro da própria instituição

### Por que ALTO e não MÉDIO:

- O código completo do convite é exposto
- Convites ativos (não usados, não expirados) são visíveis
- Um usuário não-admin pode compartilhar códigos com pessoas externas
- A função retorna TODOS os convites (não apenas ativos), incluindo histórico

---

## R. RECOMENDAÇÃO

### Combinação mínima recomendada (NÃO IMPLEMENTAR):

| Item | Recomendar | Justificativa |
|---|---|---|
| A — Revogar PUBLIC e anon | **SIM** | Anon não precisa executar; membership check já bloqueia, mas defense in depth |
| B — Manter authenticated | **SIM** | Usuários autenticados da instituição podem executar |
| C — Exigir membership | Já existe | A função já verifica membership |
| D — Exigir is_admin=true | **SIM** | Criar e excluir convites exige admin; listar deveria também |
| E — SET search_path | **SIM** | Endurecer contra search_path hijacking |
| F — Qualificar tabelas | **SIM** | `public.user_profiles`, `public.invitations` |
| G — service_role/postgres preservados | **SIM** | Manter acesso administrativo |

### Recomendação: **A + B + D + E + F + G**

- Revogar PUBLIC e anon
- Manter authenticated
- Adicionar verificação `is_admin = true`
- Adicionar `SET search_path = public, pg_temp`
- Qualificar tabelas
- Preservar service_role e postgres

---

## S. CORREÇÃO CIRÚRGICA PROPOSTA (NÃO EXECUTAR)

### Menor alteração segura:

1. Adicionar verificação `is_admin = true` após a verificação de membership:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.user_profiles
  WHERE id = auth.uid()
  AND institution_id = institution_id_param
  AND is_admin = true
) THEN
  RAISE EXCEPTION 'Only administrators can view invitations';
END IF;
```

2. Adicionar `SET search_path = public, pg_temp` na definição

3. Qualificar tabelas: `public.user_profiles`, `public.invitations`

4. Revogar PUBLIC e anon:
```sql
REVOKE EXECUTE ON FUNCTION public.list_active_invitations(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_active_invitations(uuid) FROM anon;
```

5. Preservar grants para authenticated, service_role, postgres

### Prioridades atendidas:

1. **Não quebrar Settings:** O frontend já verifica `isAdmin` antes de chamar. A função continuaria funcionando para admins.
2. **Admin continua gerenciando convites:** Admin ainda pode listar, criar, excluir.
3. **Usuário comum não vê códigos:** Bloqueado por `is_admin = true`.
4. **Cross-institution impossível:** Já bloqueado por membership check.
5. **Anon sem acesso:** Bloqueado por `auth.uid()` NULL + revogação de grants.
6. **Zero alteração de dados:** DDL apenas, nenhum UPDATE/INSERT/DELETE.

---

## T. ROLLBACK TEÓRICO

### Definição original completa (capturada para rollback futuro):

```sql
CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(code text, created_at timestamp with time zone, expires_at timestamp with time zone, created_by_name text, used_at timestamp with time zone, used_by_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND institution_id = institution_id_param
  ) THEN
    RAISE EXCEPTION 'User does not belong to this institution';
  END IF;

  RETURN QUERY
  SELECT 
    i.code,
    i.created_at,
    i.expires_at,
    (cp.first_name || ' ' || cp.last_name) as created_by_name,
    i.used_at,
    (up.first_name || ' ' || up.last_name) as used_by_name
  FROM invitations i
  LEFT JOIN user_profiles cp ON cp.id = i.created_by
  LEFT JOIN user_profiles up ON up.id = i.used_by
  WHERE i.institution_id = institution_id_param
  ORDER BY i.created_at DESC;
END;
$function$;
```

### Grants originais:

| Grantee | EXECUTE |
|---|---|
| PUBLIC | Sim |
| anon | Sim |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

### search_path original: null (ausente)

### Rollback SQL:

```sql
-- Restaurar definição original
CREATE OR REPLACE FUNCTION public.list_active_invitations(institution_id_param uuid)
RETURNS TABLE(...) LANGUAGE plpgsql SECURITY DEFINER
AS $function$ ... (definição original acima) ... $function$;

-- Restaurar grants originais
GRANT EXECUTE ON FUNCTION public.list_active_invitations(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_active_invitations(uuid) TO anon;
```

**NÃO executar.**

---

## U. BASELINE POST

| Tabela | Contagem POST |
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

| Sentinela | Valor POST |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## V. CHECKSUMS POST

| Tabela | Checksum POST | Checksum PRE | Status |
|---|---|---|---|
| institutions | `038ff97cb251baa6b4557c3ef05ea823` | `038ff97cb251baa6b4557c3ef05ea823` | idêntico |
| user_profiles | `c987c95562f53f8908c14d32e70d4f49` | `c987c95562f53f8908c14d32e70d4f49` | idêntico |
| invitations | `a94453b17e8851b84671bdde60a30201` | `a94453b17e8851b84671bdde60a30201` | idêntico |
| areas | `1f40430c05954fcae4ca737bddc38539` | `1f40430c05954fcae4ca737bddc38539` | idêntico |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` | `b57c17c9f60ff02f2c059b5b4b682a3b` | idêntico |
| products | `40fa32700e59f87773383c100a225907` | `40fa32700e59f87773383c100a225907` | idêntico |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | idêntico |
| seasons | `981c3b936b8678c9255424694bf4ffa6` | `981c3b936b8678c9255424694bf4ffa6` | idêntico |

**Todos idênticos. Nenhum dado alterado.**

---

## W. PROTEÇÕES ANTERIORES

| Função | Etapa | prosecdef | proconfig | Status |
|---|---|---|---|---|
| list_institution_users | 1F-A | true | `search_path=public, pg_temp` | intacta |
| copy_data_to_institution | 1F-C | true | `search_path=public, pg_temp` | intacta |
| handle_user_registration | 1G-A | true | `search_path=public, pg_temp` | intacta |
| join_institution | 1G-B/1G-D | true | `search_path=public, pg_temp` | intacta |

**Todas as proteções anteriores confirmadas intactas por leitura.**

---

## X. DIVERGÊNCIAS

**Nenhuma divergência nos dados.** PRE e POST são idênticos. Nenhum dado foi alterado.

### Descobertas da auditoria:

1. **VULNERABILIDADE ALTA:** `list_active_invitations` não verifica `is_admin`. Usuário não-admin pode ver códigos de convite completos da sua instituição via chamada RPC direta.

2. **INCONSISTÊNCIA:** `create_invitation` e `delete_invitation` verificam `is_admin = true`, mas `list_active_invitations` não. A função mais sensível (expõe códigos) tem a verificação mais fraca.

3. **GRANTS EXCESSIVOS:** PUBLIC e anon possuem EXECUTE. Embora `auth.uid()` NULL bloqueie anon, defense in depth recomenda revogar.

4. **SEARCH_PATH AUSENTE:** Nenhum `SET search_path` explícito. Tabelas não qualificadas com `public.`.

5. **NOME ENGANOSO:** A função se chama `list_active_invitations` mas retorna TODOS os convites (usados, expirados e ativos), não apenas os ativos.

6. **DADOS PESSOAIS:** Retorna nomes (first + last) de quem criou e usou convites. Embora não sejam emails, são dados pessoais.

7. **RLS BYPASSED:** Como SECURITY DEFINER, RLS é bypassada. A única proteção é a verificação manual dentro da função.

---

## RESUMO EXECUTIVO

Esta auditoria read-only identificou uma **vulnerabilidade ALTA** na função `list_active_invitations`:

### Problema central:
A função verifica membership (mesma instituição) mas **NÃO verifica `is_admin`**. Qualquer usuário autenticado que pertença à instituição pode chamar a RPC diretamente (via console do browser, curl, etc.) e ver **todos os códigos de convite** da sua instituição, incluindo convites ativos não usados.

Isso é inconsistente com `create_invitation` e `delete_invitation`, que ambas verificam `is_admin = true`. A função que **expõe os códigos** (mais sensível) tem a verificação mais fraca.

### O frontend esconde, mas o backend não impede:
O frontend (`Settings.tsx`) verifica `profile.isAdmin` antes de chamar a RPC e renderiza a seção de convites apenas para admins. Mas um usuário não-admin pode bypassar o frontend e chamar a RPC diretamente.

### Outros problemas:
- PUBLIC e anon possuem EXECUTE (defense in depth recomenda revogar)
- Search_path ausente, tabelas não qualificadas
- Nome enganoso: retorna todos os convites, não apenas ativos

### Recomendação (NÃO IMPLEMENTAR):
Adicionar verificação `is_admin = true` à função, revogar PUBLIC/anon, adicionar `SET search_path = public, pg_temp`, qualificar tabelas. Isso alinha `list_active_invitations` com `create_invitation` e `delete_invitation`, não quebra o frontend (que já verifica isAdmin), e bloqueia usuário comum de ver códigos.

**PARE.** Aguardo revisão externa. Não corrigirei a vulnerabilidade. Não criarei migration. Não alterarei função, grants, RLS ou frontend.
