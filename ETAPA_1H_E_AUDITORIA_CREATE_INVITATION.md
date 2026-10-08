# ETAPA 1H-E — AUDITORIA FORENSE DE `create_invitation`

**Data:** 2026-10-07  
**Modo:** READ-ONLY ABSOLUTO — nenhuma alteração foi feita  
**Objetivo:** Auditar completamente `public.create_invitation` antes de qualquer correção futura

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
| OID | 17195 |
| Nome | `public.create_invitation` |
| Assinatura | `create_invitation(p_institution_id uuid, p_expires_in_days integer DEFAULT 7)` |
| Argumentos | `p_institution_id uuid`, `p_expires_in_days integer` (default 7) |
| Tipo retornado | `text` (o código do convite gerado) |
| Owner | `postgres` |
| Linguagem | `plpgsql` |
| SECURITY DEFINER | **true** |
| Volatilidade | `volatile` |
| proconfig (search_path) | `search_path=public` |
| Overloads | Nenhum — apenas 1 função |

---

## D. Definição Completa

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

  -- Generate unique code
  new_code := upper(substring(md5(random()::text) from 1 for 8));

  -- Create invitation with expiration date
  INSERT INTO invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    p_institution_id,
    new_code,
    now() + (p_expires_in_days || ' days')::interval,
    auth.uid()
  );

  RETURN new_code;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating invitation: %', SQLERRM;
END;
$function$;
```

### D.1 Elementos Identificados

| Elemento | Presente | Detalhe |
|---|---|---|
| `auth.uid()` | Sim | Usado no WHERE do EXISTS e como `created_by` |
| `auth.uid() IS NULL` explícito | **NÃO** | Não verificado — se NULL, EXISTS falha e RAISE EXCEPTION |
| `user_profiles` | Sim | **Não qualificado** com `public.` |
| `is_admin` | Sim | `is_admin = true` |
| `institution_id` | Sim | `institution_id = p_institution_id` — caller-controlled, mas validado contra user_profiles |
| `invitations` | Sim | **Não qualificado** com `public.` |
| `code` | Sim | Gerado internamente — não caller-controlled |
| `created_by` | Sim | `auth.uid()` — não caller-controlled |
| `created_at` | Indireto | Default `now()` da coluna |
| `expires_at` | Sim | `now() + (p_expires_in_days || ' days')::interval` |
| `random()` | Sim | `random()::text` → `md5()` → `upper()` → `substring(..., 1, 8)` |
| `md5()` | Sim | Hash do texto de random() |
| `gen_random_uuid()` | Não | Não usado para geração de code |
| Loop de retry | **NÃO** | Sem loop para tentar novamente em colisão |
| Tratamento unique_violation | **Parcial** | `EXCEPTION WHEN OTHERS` captura tudo, mas não tenta novamente |
| `search_path` | `public` | Definido, mas sem `pg_temp` |

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

**anon tem EXECUTE?** SIM.  
**anon passa pela autorização interna?** NÃO — `auth.uid()` retorna NULL para anon, o EXISTS `WHERE id = auth.uid()` não encontra nenhum `user_profiles`, e a função executa `RAISE EXCEPTION 'Only administrators can create invitations'`.

**Conclusão:** anon possui permissão SQL de EXECUTE, mas a barreira de `auth.uid()` impede que o INSERT seja alcançado. A função lança uma exceção em vez de retornar false — isso significa que anon recebe um erro do RPC, não um resultado silencioso.

---

## F. Fluxo Interno Exato

1. **Recebe** `p_institution_id` (uuid) e `p_expires_in_days` (integer, default 7)
2. **Verifica admin:** `IF NOT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = p_institution_id)` → `RAISE EXCEPTION` se falhar
3. **Gera código:** `new_code := upper(substring(md5(random()::text) from 1 for 8))`
4. **INSERT:** `INSERT INTO invitations (institution_id, code, expires_at, created_by) VALUES (p_institution_id, new_code, now() + (p_expires_in_days || ' days')::interval, auth.uid())`
5. **RETURN** `new_code` (o código gerado)
6. **EXCEPTION:** `WHEN OTHERS THEN RAISE EXCEPTION 'Error creating invitation: %', SQLERRM` — captura qualquer erro (incluindo unique_violation) e re-raise com mensagem genérica

---

## G. Autorização — Análise Estática por Cenário

| # | Cenário | EXECUTE? | auth.uid() | is_admin? | institution? | INSERT alcançado? | Resultado |
|---|---|---|---|---|---|---|---|
| A | anon | Sim | NULL | EXISTS falha | — | Não | RAISE EXCEPTION |
| B | authenticated sem profile | Sim | não-NULL | não encontra profile | — | Não | RAISE EXCEPTION |
| C | authenticated sem institution_id | Sim | não-NULL | profile existe mas institution_id NULL | NULL ≠ p_institution_id | Não | RAISE EXCEPTION |
| D | não-admin da instituição A | Sim | não-NULL | is_admin = false | — | Não | RAISE EXCEPTION |
| E | admin da instituição A | Sim | não-NULL | is_admin = true | institution_id = p_institution_id | **Sim** | RETURN new_code |
| F | admin A tentando criar para B | Sim | não-NULL | is_admin = true | institution_id ≠ p_institution_id | Não | RAISE EXCEPTION |
| G | não-admin A tentando criar para B | Sim | não-NULL | is_admin = false | — | Não | RAISE EXCEPTION |

**Cross-institution bloqueado:** O parâmetro `p_institution_id` é caller-controlled, mas a verificação `user_profiles.institution_id = p_institution_id` garante que o caller deve ser admin da **mesma** institução. Admin A não pode criar convites para instituição B.

---

## H. Institution_id

**É caller-controlled?** SIM — `p_institution_id` é o primeiro parâmetro.

**Existe verificação cross-institution?** SIM:
```sql
SELECT 1 FROM user_profiles
WHERE id = auth.uid()
AND is_admin = true
AND institution_id = p_institution_id
```

A cláusula `institution_id = p_institution_id` verifica que o `institution_id` do profile do caller corresponde ao `p_institution_id` solicitado. Um admin só pode criar convites para sua própria instituição.

**Risco cross-institution:** **Nenhum** — a verificação é correta e completa.

---

## I. Geração do Code

### I.1 Expressão Exata

```sql
new_code := upper(substring(md5(random()::text) from 1 for 8));
```

### I.2 Decomposição

| Passo | Expressão | Resultado |
|---|---|---|
| 1 | `random()` | Float entre 0.0 e 1.0 (ex: 0.123456789012345) |
| 2 | `random()::text` | String do float (ex: "0.123456789012345") |
| 3 | `md5(...)` | Hash MD5 de 32 hex chars (ex: "a1b2c3d4e5f6...") |
| 4 | `substring(... from 1 for 8)` | Primeiros 8 chars (ex: "a1b2c3d4") |
| 5 | `upper(...)` | Maiúsculas (ex: "A1B2C3D4") |

### I.3 Características

| Propriedade | Valor |
|---|---|
| Comprimento | 8 caracteres |
| Caracteres possíveis | 0-9, A-F (hexadecimal maiúsculo) |
| Combinações teóricas | 16^8 = 4,294,967,296 (≈ 4.3 bilhões) |
| Origem de aleatoriedade | `random()` do PostgreSQL |
| Usa crypto? | **NÃO** — `random()` é PRNG, não criptograficamente seguro |
| Usa UUID? | Não |
| Existe truncamento? | Sim — MD5 de 32 chars truncado para 8 |

### I.4 Espaço de Códigos

16^8 = 2^32 ≈ 4.3 bilhões de combinações possíveis.

Com 7 convites existentes, a probabilidade de colisão por tentativa é ≈ 7/4.3B ≈ 1.6 × 10^-9 — extremamente baixa.

---

## J. Colisões

### J.1 UNIQUE Constraint

`invitations_code_key`: `UNIQUE (code)` — confirmado. Se dois códigos iguais forem inseridos, o segundo INSERT falha com `unique_violation`.

### J.2 Comportamento em Colisão

| Pergunta | Resposta |
|---|---|
| INSERT falha? | Sim — unique_violation |
| Função captura unique_violation? | **Parcialmente** — `EXCEPTION WHEN OTHERS THEN` captura, mas apenas re-raise com mensagem genérica |
| Tenta gerar novamente? | **NÃO** — não há loop de retry |
| Caller recebe erro? | Sim — RAISE EXCEPTION com "Error creating invitation: ..." |
| Existe loop? | **NÃO** |
| Existe limite de tentativas? | N/A — sem loop |

### J.3 Avaliação

A probabilidade de colisão é extremamente baixa (≈ 1.6 × 10^-9 por tentativa com 7 convites existentes). Mesmo com milhares de convites, a probabilidade permanece negligenciável. A ausência de loop de retry não é um risco material na prática.

**No entanto**, o tratamento de erro é subótimo: se uma colisão ocorrer, o caller recebe um erro genérico em vez de uma nova tentativa automática. Em teoria, o admin precisaria clicar "Novo Convite" novamente.

---

## K. Entropia

### K.1 Classificação

| Critério | Avaliação |
|---|---|
| Tamanho do espaço | 2^32 ≈ 4.3 bilhões — **MÉDIO** |
| Previsibilidade da função | `random()` é PRNG — **BAIXO** (não crypto) |
| Possibilidade de brute force | 4.3B tentativas para cobertura total — **DIFÍCIL mas não impossível** |
| `validate_invitation` acessível antes do login? | **SIM** — anon pode validar códigos |
| Rate limiting conhecido? | **NÃO** — sem evidência de rate limiting na função ou no Supabase API |

### K.2 Classificação Geral: **MÉDIA**

O espaço de 2^32 é grande o suficiente para dificultar brute force em condições normais, mas:

1. `random()` não é criptograficamente seguro — em teoria, o seed é previsível
2. `validate_invitation` é callable por anon sem rate limiting visível — permite enumeração
3. O frontend faz debounce de 500ms no Login.tsx, mas isso é client-side e bypassable
4. O Supabase API pode ter rate limits globais, mas não há evidência de rate limits por usuário/IP na função

### K.3 Risco de Brute Force via validate_invitation

Um atacante com acesso à API poderia chamar `validate_invitation` repetidamente com códigos aleatórios. Para cada chamada:
- Se o código não existe: retorna `{valid: false, message: 'Invalid invitation code'}`
- Se o código existe e é válido: retorna `{valid: true, institution_name: '...'}` — **vaza o nome da instituição**
- Se expirado ou usado: retorna mensagem específica — **vaza informação sobre existência do código**

Com 4.3B possibilidades e sem rate limiting, o brute force é teoricamente possível mas impraticável em volume (mesmo a 1000 req/s seriam ~50 dias para cobertura total).

**No entanto**, para uma instituição específica, o atacante só precisa encontrar UM código válido — e com apenas alguns convites ativos por instituição, a probabilidade por tentativa é baixa.

### K.4 Recomendação (sem implementar)

Não recomendar mudança de formato do código nesta etapa. A entropia de 2^32 é suficiente para o uso atual. Se no futuro houver concern sobre brute force, considerar:
- Aumentar para 12+ chars (16^12 = 2^48)
- Usar `gen_random_bytes()` em vez de `random()`
- Adicionar rate limiting no nível do Supabase API

---

## L. Expiração

### L.1 Duração Padrão

| Propriedade | Valor |
|---|---|
| Default | 7 dias (`p_expires_in_days DEFAULT 7`) |
| Cálculo | `now() + (p_expires_in_days || ' days')::interval` |
| Caller controla duração? | **SIM** — `p_expires_in_days` é parâmetro |
| Existe limite máximo? | **NÃO** — nenhum validação |
| Pode nascer sem expires_at? | **NÃO** — coluna `expires_at` é `NOT NULL` |
| Pode ser no passado? | **SIM** — se caller enviar `p_expires_in_days` negativo |
| Timezone | `now()` retorna `timestamptz` — correto |

### L.2 Risco de expires_at no Passado

Se o caller enviar `p_expires_in_days = -1`, o `expires_at` será `now() - 1 day` — um convite que nasce expirado. Isso não é uma vulnerabilidade de segurança (o convite não pode ser usado), mas é um comportamento indesejado.

### L.3 Frontend

O frontend (Settings.tsx linha 291-294) **não envia** `p_expires_in_days` — usa o default de 7 dias:
```typescript
const { data, error } = await supabase
  .rpc('create_invitation', {
    p_institution_id: profile?.institutionId,
  });
```

Portanto, o risco de expires_at no passado só existe via chamada direta à API, não via frontend.

---

## M. created_by

### M.1 Origem

```sql
created_by = auth.uid()
```

**É caller-controlled?** **NÃO** — `created_by` é obrigatoriamente `auth.uid()`, não um parâmetro. O caller não pode atribuir o convite a outro usuário.

### M.2 Confirmação

O INSERT usa `auth.uid()` como valor para `created_by`. Mesmo que o caller tente manipular o parâmetro, `created_by` não é um parâmetro da função — é derivado do contexto de autenticação.

---

## N. Campos Inseridos

| Campo | Origem | Caller-controlled? |
|---|---|---|
| `id` | `gen_random_uuid()` (default da coluna) | Não |
| `institution_id` | `p_institution_id` (parâmetro) | Sim, mas validado contra user_profiles |
| `code` | `upper(substring(md5(random()::text) from 1 for 8))` | Não — gerado internamente |
| `expires_at` | `now() + (p_expires_in_days \|\| ' days')::interval` | Sim (parâmetro), mas frontend usa default 7 |
| `created_at` | `now()` (default da coluna) | Não |
| `created_by` | `auth.uid()` | Não — derivado da autenticação |
| `used_at` | Não inserido (NULL default) | Não |
| `used_by` | Não inserido (NULL default) | Não |

---

## O. Frontend

### O.1 create_invitation

| Arquivo | Linha | Contexto |
|---|---|---|
| `src/pages/Settings.tsx` | 287-308 | `handleCreateInvitation` — função chamadora |
| `src/pages/Settings.tsx` | 291-294 | `.rpc('create_invitation', { p_institution_id: profile?.institutionId })` |
| `src/pages/Settings.tsx` | 1271-1279 | Botão "Novo Convite" com `onClick={handleCreateInvitation}` |
| `src/pages/Settings.tsx` | 1180 | `{profile?.isAdmin && (` — envolve toda a seção |

### O.2 Parâmetros Enviados

| Parâmetro | Valor | Observação |
|---|---|---|
| `p_institution_id` | `profile?.institutionId` | Da sessão do usuário |
| `p_expires_in_days` | **Não enviado** | Usa default 7 dias |

### O.3 Condições

| Condição | Aplicada |
|---|---|
| Somente admin vê botão | **Sim** — `{profile?.isAdmin && (...)}` |
| `profile.isAdmin` verificado | **Sim** |
| institution_id vem de profile | **Sim** — `profile?.institutionId` |
| Caller escolhe duração | **Não** — usa default |
| Caller escolhe código | **Não** — gerado pela função |

### O.4 validate_invitation no Frontend

| Arquivo | Linha | Contexto |
|---|---|---|
| `src/pages/auth/Login.tsx` | 92-135 | `useEffect` com debounce de 500ms |
| `src/pages/auth/Login.tsx` | 101-104 | `.rpc('validate_invitation', { invitation_code: invitationCode.trim() })` |
| `src/pages/auth/Login.tsx` | 109 | `data.valid === true` — verifica resposta |
| `src/pages/auth/Login.tsx` | 113 | `setInvitationDetails(data)` — armazena institution_name |

### O.5 Fluxo do validate_invitation

1. Usuário na tela de login seleciona modo "Juntar-se"
2. Digita o código de convite
3. Após 500ms sem digitar, `validate_invitation` é chamado
4. Se válido: exibe nome da instituição, habilita registro
5. Se inválido: exibe mensagem de erro
6. **Acontece antes do login** — usuário é anon neste ponto

**Isso explica por que anon precisa de EXECUTE em validate_invitation.**

---

## P. Relação com list_active_invitations

### P.1 Fluxo

1. `handleCreateInvitation` chama `create_invitation` (linha 292)
2. Se sucesso, chama `loadInvitations()` (linha 299)
3. `loadInvitations` chama `list_active_invitations` (linha 223, protegida por 1H-B)
4. A lista atualizada mostra o novo convite

### P.2 Compatibilidade com 1H-B

A correção 1H-B (`is_admin = true` no `list_active_invitations`) **não afeta** `create_invitation`:
- Ambas exigem `is_admin = true`
- Ambas exigem mesma `institution_id`
- O frontend já filtrava por `isAdmin` antes de ambas
- A criação de convite sempre foi admin-only no frontend

**Nenhuma mudança necessária.**

---

## Q. Relação com validate_invitation

### Q.1 Definição

```sql
CREATE OR REPLACE FUNCTION public.validate_invitation(invitation_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  invitation_record RECORD;
  institution_name text;
BEGIN
  SELECT i.*, inst.name as institution_name
  INTO invitation_record
  FROM invitations i
  JOIN institutions inst ON i.institution_id = inst.id
  WHERE i.code = invitation_code
  LIMIT 1;

  IF invitation_record IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invalid invitation code');
  END IF;

  IF invitation_record.expires_at < NOW() THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invitation code has expired');
  END IF;

  IF invitation_record.used_at IS NOT NULL THEN
    RETURN jsonb_build_object('valid', false, 'message', 'Invitation code has already been used');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'message', 'Valid invitation code',
    'institution_name', invitation_record.institution_name
  );
END;
$function$;
```

### Q.2 Características

| Propriedade | Valor |
|---|---|
| Callable por anon? | **SIM** — PUBLIC e anon têm EXECUTE |
| Recebe code? | Sim — `invitation_code text` |
| Informa se válido? | Sim — `{valid: true/false}` |
| Retorna institution_id? | **NÃO** — retorna `institution_name` apenas |
| Retorna institution_name? | **SIM** — quando válido |
| Verifica used_at? | Sim |
| Verifica expires_at? | Sim |
| search_path | `public` (sem pg_temp) |
| Tabelas qualificadas? | **NÃO** — `invitations` e `institutions` sem `public.` |

### Q.3 Risco de Enumeration

`validate_invitation` é callable por anon sem rate limiting. Cada chamada revela:
- Código existe + válido → `institution_name` vazado
- Código existe + expirado → "expired" (confirma existência)
- Código existe + usado → "already used" (confirma existência)
- Código não existe → "Invalid invitation code"

Isso permite **enumeração de códigos** — um atacante pode testar códigos e distinguir entre "não existe" e "existe mas expirado/usado".

**Com 2^32 possibilidades e sem rate limiting**, o brute force é teoricamente possível mas impraticável em volume.

---

## R. Relação com join_institution

### R.1 Confirmação

`join_institution` consome o mesmo `code` gerado por `create_invitation`:

```sql
SELECT i.*, inst.name as institution_name, inst.id as institution_id
INTO invitation_record
FROM public.invitations i
JOIN public.institutions inst ON inst.id = i.institution_id
WHERE i.code = clean_code
FOR UPDATE OF i;
```

### R.2 Verificações em join_institution

| Verificação | Presente | Etapa |
|---|---|---|
| `auth.uid() IS NULL` | Sim | 1G-B |
| `user_id IS DISTINCT FROM auth.uid()` | Sim | 1G-B |
| `institution_id IS NOT NULL` (bloqueia troca) | Sim | 1G-D |
| `used_at IS NOT NULL` | Sim | Original |
| `expires_at < now()` | Sim | Original |
| `FOR UPDATE OF i` (lock) | Sim | Original |

### R.3 Proteção 1G-D Intacta

A proteção 1G-D (bloqueio de troca de instituição) está presente e intacta na definição atual de `join_institution`. O `search_path = public, pg_temp` (1G-B) também está presente.

---

## S. RLS

### S.1 Policies em `invitations`

| Policy | CMD | USING | WITH CHECK |
|---|---|---|---|
| Admins can create invitations | INSERT (a) | — | `EXISTS(SELECT 1 FROM user_profiles WHERE id = auth.uid() AND is_admin = true AND institution_id = invitations.institution_id)` |
| Users can read invitations for their institution | SELECT (r) | `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())` | — |

### S.2 Policies em `user_profiles`

| Policy | CMD | USING/WITH CHECK |
|---|---|---|
| Users can create own profile | INSERT | `auth.uid() = id` |
| Users can read own profile | SELECT | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` |

### S.3 Bypass por SECURITY DEFINER

`create_invitation` é `SECURITY DEFINER` com owner `postgres`. Durante execução:
- **RLS é bypassada** — o owner `postgres` é superuser
- O `INSERT INTO invitations` executa sem verificar as policies de RLS
- O `SELECT 1 FROM user_profiles` também executa sem RLS

**Proteções que dependem exclusivamente da lógica interna:**

1. Verificação `is_admin = true` no EXISTS
2. Verificação `institution_id = p_institution_id` no EXISTS
3. `created_by = auth.uid()` (não caller-controlled)

**Não há policy INSERT que permitiria um usuário criar convites diretamente** via Supabase API (a policy INSERT exige `is_admin = true` e mesma `institution_id`). A função SECURITY DEFINER bypassa RLS, mas a lógica interna replica as mesmas verificações.

### S.4 Não há policy DELETE em invitations

Confirmando o que foi observado em 1H-C: não há policy DELETE em `invitations`. A exclusão depende exclusivamente de `delete_invitation` (protegida em 1H-D).

---

## T. Search Path

### T.1 Estado Atual

| Propriedade | Valor |
|---|---|
| proconfig | `search_path=public` |
| search_path explícito | Sim, mas **sem `pg_temp`** |

### T.2 Referências Não Qualificadas

| Referência | Schema qualificado? |
|---|---|
| `user_profiles` (no EXISTS) | **NÃO** |
| `invitations` (no INSERT) | **NÃO** |

### T.3 Comparação com Funções Protegidas

| Função | search_path | Tabelas qualificadas? |
|---|---|---|
| join_institution | public, pg_temp | Sim (public.*) |
| list_active_invitations | public, pg_temp | Sim (public.*) |
| delete_invitation | public, pg_temp | Sim (public.*) |
| **create_invitation** | **public (sem pg_temp)** | **NÃO** |

### T.4 Recomendação (sem implementar)

`SET search_path = public, pg_temp` e qualificação `public.user_profiles` / `public.invitations` seriam apropriadas para alinhar com as 6 funções já corrigidas.

---

## U. PUBLIC e anon

### U.1 Análise

| Pergunta | Resposta |
|---|---|
| PUBLIC EXECUTE é necessário? | **NÃO** — apenas admins autenticados criam convites |
| anon EXECUTE é necessário? | **NÃO** — anon não pode passar pela verificação `auth.uid()` |
| Frontend cria convites antes de login? | **NÃO** — `handleCreateInvitation` está em Settings.tsx, atrás de PrivateRoute |
| Existe fluxo legítimo em que não-autenticado precise chamar create_invitation? | **NÃO** |

### U.2 Diferença de validate_invitation

`validate_invitation` precisa de anon EXECUTE porque é chamado no Login.tsx antes do login. `create_invitation` não tem esse requisito — só é chamado em Settings.tsx (área autenticada).

### U.3 Conclusão

PUBLIC e anon EXECUTE em `create_invitation` são **desnecessários** e devem ser revogados.

---

## V. service_role

### V.1 Análise

service_role possui EXECUTE em `create_invitation`. No entanto:

- A lógica interna requer `auth.uid()` não-NULL e `is_admin = true`
- Em contexto service_role (sem JWT de usuário), `auth.uid()` pode retornar NULL
- Se `auth.uid()` for NULL, o EXISTS falha e a função lança RAISE EXCEPTION

**Comportamento service_role: NÃO VALIDADO.** Possui permissão SQL de EXECUTE, mas não passa automaticamente pela lógica interna. Se service_role for usado com um JWT que inclui `sub` (user ID), o comportamento dependeria de esse user ser admin — mas isso não é o uso típico de service_role.

---

## W. Cenários de Ataque

| # | Cenário | Barreira | INSERT alcançado? | Risco |
|---|---|---|---|---|
| 1 | anon chama create_invitation | `auth.uid() = NULL` → RAISE EXCEPTION | Não | **Nenhum** |
| 2 | usuário comum chama | `is_admin = false` → RAISE EXCEPTION | Não | **Nenhum** |
| 3 | admin legítimo chama | Passa todas as verificações | Sim — comportamento legítimo | **Nenhum** |
| 4 | admin A tenta instituição B | `institution_id ≠ p_institution_id` → RAISE EXCEPTION | Não | **Nenhum** |
| 5 | brute force de invitation codes | Espaço de 2^32, sem rate limiting em validate_invitation | N/A | **Baixo** — impraticável em volume |
| 6 | colisão de code | UNIQUE constraint + EXCEPTION WHEN OTHERS | Insert falha, erro retornado | **Mínimo** — probabilidade ≈ 10^-9 |
| 7 | caller manipula created_by | **Impossível** — created_by = auth.uid(), não parâmetro | N/A | **Nenhum** |
| 8 | caller manipula expires_at | Pode enviar p_expires_in_days negativo | Sim — convite nasce expirado | **Baixo** — convite inútil, não usável |
| 9 | search_path/shadowing | search_path=public, tabelas não qualificadas | Risco teórico | **Baixo prático** — Supabase API não controla search_path |

---

## X. Histórico Mascarado

| # | Code (mascarado) | Length | Created | Expires | Used | Creator | User | Institution |
|---|---|---|---|---|---|---|---|---|
| 1 | 24**** | 8 | 2026-09-22 | 2026-09-29 | Não | Sim | — | e874**** |
| 2 | E2**** | 8 | 2026-07-30 | 2026-08-06 | Sim | Sim | Sim | e874**** |
| 3 | A4**** | 8 | 2025-10-06 | 2025-10-13 | Sim | Sim | Sim | 741b**** |
| 4 | 6B**** | 8 | 2025-10-02 | 2025-10-09 | Sim | Sim | Sim | e874**** |
| 5 | 60**** | 8 | 2025-09-17 | 2025-09-24 | Sim | Não | Sim | e874**** |
| 6 | 64**** | 6 | 2025-05-23 | 2025-05-30 | Sim | Não | Não | b380**** |
| 7 | 0a**** | 6 | 2025-05-23 | 2025-05-30 | Sim | Não | Sim | e874**** |

### X.1 Observações

- 5 convites têm length 8 (formato atual: `upper(substring(md5(random()::text) from 1 for 8))`)
- 2 convites têm length 6 (formato mais antigo, provavelmente de uma versão anterior da função)
- Os 2 convites sem creator (`has_creator = false`) são os mais antigos (maio 2025), sugerindo que `created_by` foi adicionado posteriormente
- Todos os convites com length 6 também não têm creator — consistente com uma versão anterior que não registrava `created_by`
- O formato atual (8 chars) está sendo usado desde pelo menos setembro 2025

---

## Y. Risco Geral

| Categoria | Nível | Detalhe |
|---|---|---|
| Criação por não-autorizado | **Muito baixo** | auth.uid() + is_admin + institution_id verificam corretamente |
| Criação por anon | **Muito baixo** | auth.uid() = NULL → RAISE EXCEPTION |
| Cross-institution | **Nenhum** | institution_id = p_institution_id verificado |
| Manipulação de created_by | **Nenhum** | auth.uid() não é parâmetro |
| Manipulação de code | **Nenhum** | Gerado internamente |
| Manipulação de expires_at | **Baixo** | p_expires_in_days negativo gera convite expirado (inútil) |
| Brute force de codes | **Baixo** | 2^32 espaço, sem rate limiting, mas impraticável |
| Colisão de code | **Mínimo** | ≈ 10^-9 probabilidade, sem loop de retry |
| Grants excessivos | **Médio** | PUBLIC e anon têm EXECUTE desnecessariamente |
| search_path | **Baixo** | public sem pg_temp, tabelas não qualificadas |
| Risco geral | **Baixo-Médio** | Lógica de autorização sólida, grants e hardening inconsistentes |

---

## Z. Correção Cirúrgica Futura

### Z.1 Combinação Mínima Recomendada (SEM IMPLEMENTAR)

| Item | Recomendado | Justificativa |
|---|---|---|
| A) `auth.uid() IS NULL` explícito | **Sim** | Early exit claro antes de qualquer consulta |
| B) Preservar admin-only | **Sim** | Já existe, funciona corretamente |
| C) Preservar same institution | **Sim** | Já existe, funciona corretamente |
| D) REVOKE PUBLIC | **Sim** | Desnecessário, viola menor privilégio |
| E) REVOKE anon | **Sim** | Desnecessário — create_invitation só é chamado em área autenticada |
| F) GRANT authenticated | **Sim** | Mantém acesso para admins autenticados |
| G) Preservar service_role/postgres | **Sim** | Mantém acesso administrativo |
| H) `SET search_path = public, pg_temp` | **Sim** | Alinha com join_institution, list_active_invitations, delete_invitation |
| I) Qualificar `public.user_profiles` | **Sim** | Previne shadowing |
| J) Qualificar `public.invitations` | **Sim** | Previne shadowing |
| K) Alterar geração do code | **NÃO** | 2^32 é suficiente para uso atual. Mudança de formato requereria compatibilidade com validate_invitation, join_institution, e Settings.tsx. Não há risco material justificando mudança. |
| L) Tratar colisão com loop | **NÃO recomendado agora** | Probabilidade ≈ 10^-9. Adicionar loop aumenta complexidade sem benefício material. O EXCEPTION WHEN OTHERS já captura o erro. |

### Z.2 Não Recomendado

| Item | Razão |
|---|---|
| Mudar formato do code | Sem risco material; requereria compatibilidade com 3 sistemas |
| Adicionar loop de retry | Probabilidade de colisão negligenciável |
| Adicionar validação de p_expires_in_days | Baixo risco (convite expirado é inútil); frontend não envia o parâmetro |
| Soft delete | Fora do escopo de segurança |
| Rate limiting | Seria no nível do Supabase API, não na função |

### Z.3 Definição Futura Esperada (referência)

```sql
CREATE OR REPLACE FUNCTION public.create_invitation(p_institution_id uuid, p_expires_in_days integer DEFAULT 7)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  new_code text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;

  new_code := upper(substring(md5(random()::text) from 1 for 8));

  INSERT INTO public.invitations (
    institution_id,
    code,
    expires_at,
    created_by
  ) VALUES (
    p_institution_id,
    new_code,
    now() + (p_expires_in_days || ' days')::interval,
    auth.uid()
  );

  RETURN new_code;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating invitation: %', SQLERRM;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_invitation(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_invitation(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, integer) TO postgres;
```

**Nota:** Esta é apenas referência para a próxima etapa. NÃO foi implementada.

---

## AA. Rollback Teórico

### AA.1 Estado PRE Capturado

**Definição PRE:**
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
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid()
    AND is_admin = true
    AND institution_id = p_institution_id
  ) THEN
    RAISE EXCEPTION 'Only administrators can create invitations';
  END IF;

  new_code := upper(substring(md5(random()::text) from 1 for 8));

  INSERT INTO invitations (
    institution_id, code, expires_at, created_by
  ) VALUES (
    p_institution_id, new_code,
    now() + (p_expires_in_days || ' days')::interval,
    auth.uid()
  );

  RETURN new_code;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error creating invitation: %', SQLERRM;
END;
$function$;
```

**Grants PRE:** PUBLIC, anon, authenticated, postgres, service_role — todos EXECUTE.  
**search_path PRE:** `public` (sem pg_temp)  
**Owner PRE:** postgres  
**Assinatura PRE:** `create_invitation(p_institution_id uuid, p_expires_in_days integer DEFAULT 7)` returns `text`

---

## AB. Baseline POST

### AB.1 Contagens POST

| Tabela | PRE | POST | Match |
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

### AB.2 Sentinelas POST

| Métrica | PRE | POST | Match |
|---|---|---|---|
| SUM(quantity_in_stock) | 4617076.08296666766681363 | 4617076.08296666766681363 | ✅ |
| SUM(quantity) lots | 185382.00000666667 | 185382.00000666667 | ✅ |
| Items em products_used | 1459 | 1459 | ✅ |
| Invalid product_ids | 501 | 501 | ✅ |

---

## AC. Checksums POST

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

## AD. Proteções Anteriores

### AD.1 Funções SECURITY DEFINER — Estado Atual

| Função | SECURITY DEFINER | search_path | PUBLIC/anon |
|---|---|---|---|
| list_institution_users | true | public, pg_temp | Revogados ✅ |
| copy_data_to_institution | true | public, pg_temp | Revogados ✅ |
| handle_user_registration | true | public, pg_temp | Revogados ✅ |
| join_institution | true | public, pg_temp | Revogados ✅ |
| list_active_invitations | true | public, pg_temp | Revogados ✅ (1H-B) |
| delete_invitation | true | public, pg_temp | Revogados ✅ (1H-D) |
| **create_invitation** | **true** | **public (sem pg_temp)** | **AINDA PRESENTES** ⚠️ |
| validate_invitation | true | public (sem pg_temp) | AINDA PRESENTES (necessário para anon) |
| handle_new_user | true | null | Não analisado (trigger) |
| clean_expired_invitations | true | null | Não analisado |
| toggle_user_admin_status | true | null | Não analisado |
| update_season_status | true | null | Não analisado |
| check_institution_exists | true | null | Não analisado |

### AD.2 Confirmação Específica 1H-D (delete_invitation)

| Propriedade | Esperado | Confirmado |
|---|---|---|
| auth.uid() early exit | Sim | ✅ |
| search_path public, pg_temp | Sim | ✅ |
| public.invitations | Sim | ✅ |
| public.user_profiles | Sim | ✅ |
| used_at IS NULL | Sim | ✅ |
| FOUND | Sim | ✅ |
| PUBLIC sem EXECUTE | Sim | ✅ |
| anon sem EXECUTE | Sim | ✅ |

### AD.3 Grants Completos de Funções Protegidas

| Função | authenticated | postgres | service_role | PUBLIC | anon |
|---|---|---|---|---|---|
| list_institution_users | ✅ | ✅ | ✅ | ❌ | ❌ |
| copy_data_to_institution | ❌ | ✅ | ✅ | ❌ | ❌ |
| handle_user_registration | ✅ | ✅ | ✅ | ❌ | ❌ |
| join_institution | ✅ | ✅ | ✅ | ❌ | ❌ |
| list_active_invitations | ✅ | ✅ | ✅ | ❌ | ❌ |
| delete_invitation | ✅ | ✅ | ✅ | ❌ | ❌ |
| **create_invitation** | ✅ | ✅ | ✅ | ⚠️ Sim | ⚠️ Sim |

### AD.4 FKs e RLS

| Métrica | Valor |
|---|---|
| Total FKs | 28 |
| CASCADE | 20 |
| RESTRICT | 5 |
| SET NULL | 3 |
| Total RLS policies | 49 |

Nenhuma alteração.

---

## AE. Divergências

### AE.1 Em Relação ao Esperado

| Item | Esperado | Encontrado | Status |
|---|---|---|---|
| SECURITY DEFINER | true | true | ✅ |
| search_path | public | public (sem pg_temp) | ✅ Confirmado |
| PUBLIC EXECUTE | Sim | Sim | ✅ Confirmado |
| anon EXECUTE | Sim | Sim | ✅ Confirmado |
| is_admin verificado | Sim | Sim | ✅ Confirmado |
| institution_id verificado | Sim | Sim | ✅ |
| created_by = auth.uid() | Sim | Sim | ✅ |
| Code gerado internamente | Sim | Sim | ✅ |
| Sem auth.uid() IS NULL explícito | Sim | Sim | ✅ |
| Tabelas não qualificadas | Sim | Sim | ✅ |
| Sem loop de retry | Sim | Sim | ✅ |

### AE.2 Observações Adicionais

1. **validate_invitation também tem PUBLIC/anon EXECUTE** — mas neste caso é **necessário** porque é chamado no Login.tsx antes do login. Diferente de create_invitation, validate_invitation precisa de anon.

2. **validate_invitation também tem search_path=public sem pg_temp e tabelas não qualificadas** — é candidata para hardening futuro, mas o anon EXECUTE deve ser mantido.

3. **2 convites antigos têm length 6** (formato mais antigo), enquanto 5 têm length 8 (formato atual). A função atual gera sempre 8 chars.

4. **2 convites antigos não têm created_by** — provavelmente criados antes de a função incluir `created_by = auth.uid()`.

5. **EXCEPTION WHEN OTHERS** captura unique_violation mas não faz retry — apenas re-raise com mensagem genérica. Isso significa que se uma colisão ocorrer (probabilidade ≈ 10^-9), o admin recebe um erro e precisa tentar novamente manualmente.

6. **`p_expires_in_days` não tem validação** — caller poderia enviar valor negativo ou muito grande. Frontend não envia o parâmetro (usa default 7), então o risco só existe via API direta.

---

## AF. Resumo Final

### Vulnerabilidades Identificadas

| # | Vulnerabilidade | Severidade | Tipo |
|---|---|---|---|
| 1 | Grants PUBLIC e anon EXECUTE | Média | Princípio de menor privilégio |
| 2 | search_path sem pg_temp | Baixa | Hardening |
| 3 | Tabelas não qualificadas (public.*) | Baixa | Hardening |
| 4 | Sem auth.uid() IS NULL explícito | Baixa | Clareza de código |
| 5 | Sem validação de p_expires_in_days | Baixa | Validação de input |
| 6 | random() não é crypto-secure | Baixa | Entropia (risco teórico) |
| 7 | Sem loop de retry em colisão | Mínima | Confiabilidade (prob ≈ 10^-9) |

### O Que Funciona Corretamente

| # | Proteção | Status |
|---|---|---|
| 1 | is_admin = true verificado | ✅ |
| 2 | institution_id = p_institution_id (cross-institution bloqueado) | ✅ |
| 3 | created_by = auth.uid() (não caller-controlled) | ✅ |
| 4 | Code gerado internamente (não caller-controlled) | ✅ |
| 5 | anon não consegue criar convite (auth.uid() = NULL → EXCEPTION) | ✅ |
| 6 | Non-admin não consegue criar convite | ✅ |
| 7 | Cross-institution bloqueado | ✅ |
| 8 | UNIQUE constraint em code | ✅ |

### Recomendação para Próxima Etapa (1H-F)

Correção cirúrgica recomendada:
1. Adicionar `IF auth.uid() IS NULL THEN RAISE EXCEPTION` (early exit)
2. Adicionar `SET search_path = public, pg_temp`
3. Qualificar todas as tabelas com `public.*`
4. REVOKE PUBLIC e anon
5. GRANT authenticated, service_role, postgres
6. **Preservar** toda a lógica de autorização existente (is_admin, institution_id)
7. **Preservar** geração de code (não mudar formato)
8. **Preservar** EXCEPTION WHEN OTHERS (não adicionar loop)
9. **Não alterar** validate_invitation (anon EXECUTE é necessário)

**Status:** READ-ONLY ABSOLUTO. Nenhuma alteração foi feita. ZERO DATA LOSS. Aguardando revisão externa.
