# ETAPA 1G-C — AUDITORIA DE TROCA DE INSTITUIÇÃO POR CONVITE
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

## B. PERFIS ATUAIS

| ID mascarado | Instituição | is_admin | role | Áreas | Oper. | Safras | Máq. | Tipos Manut. | Manut. | Notas |
|---|---|---|---|---|---|---|---|---|---|---|
| c046dfb3 | Faz. São Pedro | false | Gerente | 18 | 108 | 1 | 15 | 1 | 2 | 0 |
| 76658ac9 | Faz. São Pedro | true | Agronomo | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| cc8adbd5 | Grupo Delatorre | true | Proprietário | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| ca7e7323 | Grupo Delatorre | true | (vazio) | 26 | 166 | 1 | 3 | 0 | 0 | 3 |
| 470c400e | Grupo Delatorre | true | Agronomo | 0 | 33 | 2 | 1 | 1 | 1 | 5 |
| b5ddba4c | Grupo Delatorre | true | Agronomo | 0 | 2 | 0 | 0 | 0 | 0 | 0 |

**Observações:**
- Emails omitidos por privacidade. 6 perfis confirmados.
- Usuario c046dfb3 (Faz. São Pedro, não-admin) possui a maioria dos dados operacionais: 18 áreas, 108 operações, 15 máquinas, 2 manutenções.
- Usuario ca7e7323 (Grupo Delatorre, admin) possui 26 áreas, 166 operações, 3 notas.
- Usuario 470c400e (Grupo Delatorre, admin) possui 33 operações, 2 safras, 1 máquina, 1 tipo de manutenção, 1 manutenção, 5 notas.
- Usuario cc8adbd5 (Grupo Delatorre, admin, "Proprietário") não possui dados de autoria direta.
- Usuarios 76658ac9 e b5ddba4c possuem dados mínimos.

---

## C. ADMINISTRADORES POR INSTITUIÇÃO

| Instituição | ID mascarado | Usuários | Admins | Não-admins |
|---|---|---|---|---|
| b610d2 (nome não revelado) | 6786a67a | 0 | 0 | 0 |
| Faz. São Pedro | 741ba2ae | 2 | 1 | 1 |
| Girassol | b380c711 | 0 | 0 | 0 |
| Grupo Delatorre | e8741889 | 4 | 4 | 0 |
| Sao Joao | 07561cfd | 0 | 0 | 0 |
| sao pedro | 0e0efe43 | 0 | 0 | 0 |

### Instituições com apenas UM admin:

| Instituição | Admin único | Risco se trocar |
|---|---|---|
| **Faz. São Pedro** | 76658ac9 | **SIM — ficaria com ZERO admins** |

**Faz. São Pedro possui apenas 1 admin (76658ac9).** Se este admin usar um convite de outra instituição, a instituição ficaria sem nenhum administrador. O outro usuário (c046dfb3) é não-admin e não poderia criar convites ou gerenciar a instituição.

Grupo Delatorre possui 4 admins — a troca de um deles não deixaria a instituição sem admin.

---

## D. AUTORIA vs MEMBERSHIP

### Conceito:

- **`user_profiles.institution_id`** = membership atual (a instituição que o usuário vê no momento)
- **`user_id` nas tabelas de negócio** = autoria/origem (quem criou o registro)
- **`institution_id` nas tabelas de negócio** = instituição à qual o registro pertence (independente de quem criou)

### O que acontece se o usuário muda de instituição (A → B):

1. **Registros antigos (áreas, operações, etc.):**
   - Continuam com `institution_id = A` (não são movidos)
   - Continuam com `user_id` apontando para o mesmo usuário
   - **Nenhuma FK move os registros automaticamente**

2. **Acesso aos registros antigos:**
   - RLS filtra por `institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())`
   - Como o profile agora tem `institution_id = B`, o usuário **perde acesso** a todos os registros de A
   - Os registros de A continuam existindo, mas o usuário não pode vê-los, editá-los ou excluí-los

3. **Acesso aos novos registros:**
   - O usuário passa a ver registros de B (se houver)

4. **Inconsistência entre autoria e membership:**
   - **SIM, há inconsistência.** O usuário criou registros em A, mas não pode mais acessá-los
   - Os registros de A permanecem órfãos do ponto de vista do autor — o autor não pode geri-los
   - Outros membros de A continuam vendo os registros normalmente (RLS filtra por institution_id, não por user_id)

---

## E. RLS APÓS TROCA

### Padrão RLS do AgriGest:

Todas as tabelas de negócio (areas, operations, products, seasons, machinery, maintenances, maintenance_types, notes) seguem o mesmo padrão:

```
SELECT: institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())
INSERT: institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())
UPDATE: institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())
DELETE: institution_id IN (SELECT institution_id FROM user_profiles WHERE id = auth.uid())
```

### Simulação estática:

**ANTES:** profile.institution_id = A
- Usuário vê registros de A (areas, operations, products, etc. com institution_id = A)
- Usuário pode criar/editar/excluir registros em A

**DEPOIS:** profile.institution_id = B
- Usuário **perde acesso** a todos os registros de A
- Usuário **passa a ver** registros de B (se houver)
- Usuário pode criar/editar/excluir registros em B
- Registros de A permanecem intactos, visíveis para outros membros de A

### user_profiles RLS:

```
SELECT: auth.uid() = id
INSERT: auth.uid() = id
UPDATE: auth.uid() = id
```

O usuário sempre pode ver e editar o próprio profile. A mudança de institution_id é permitida pela RLS (não há restrição no WITH CHECK além de `auth.uid() = id`).

---

## F. FKs

### Mudar `user_profiles.institution_id` afeta FKs existentes?

A coluna `user_profiles.institution_id` é uma FK para `institutions.id`. Mudar seu valor de A para B é uma operação válida desde que B exista em `institutions`.

### Registros históricos são movidos?

**NÃO.** Nenhuma FK CASCADE ou trigger move registros de negócio quando o profile muda de instituição. Os registros de áreas, operações, produtos, etc. permanecem com seu `institution_id` original.

### Alguma constraint impede a troca?

**NÃO.** Não há constraint que impeça um usuário de mudar de instituição. A única constraint é que o `institution_id` deve existir em `institutions.id`.

---

## G. FRONTEND

### Pesquisa por join_institution / invitation_code / trocar instituição / switch:

| Termo | Arquivo | Linhas | Contexto |
|---|---|---|---|
| `join_institution` | Login.tsx | 310-313 | Chamada RPC após signup (cadastro inicial) |
| `validate_invitation` | Login.tsx | 102-103 | Validação de convite antes do signup |
| `invitationCode` | Login.tsx | 26, 93, 135, 235, 307, 312, 409, 521, 525 | Estado e UI do campo de convite |
| `convite` | Settings.tsx | 303, 336, 1288, 1350 | Texto de erro/sucesso sobre convites (admin gerenciando) |
| `create_invitation` | Settings.tsx | 292-294 | Admin cria convite |
| `delete_invitation` | Settings.tsx | 313-314 | Admin exclui convite |
| `switch institution` / `change institution` / `trocar instituição` | — | — | **NÃO ENCONTRADO** |

### Existe interface para usuário JÁ LOGADO inserir convite?

**NÃO.** A única interface para inserir código de convite está em `Login.tsx`, que é a tela de login/cadastro. O campo de convite aparece apenas quando:
1. O usuário está na tela de Login (não autenticado)
2. Marca o checkbox "Tem um convite?" / "Do you have an invitation?"
3. Preenche email, senha, nome, sobrenome, telefone, cargo + código do convite
4. O sistema executa `supabase.auth.signUp()` seguido de `join_institution()`

### Existe "Trocar instituição" / "Entrar em outra instituição" / switcher?

**NÃO.** Não há nenhuma interface, botão, menu ou rota para trocar de instituição após o login. A página de Settings gerencia convites (criar/excluir/listar) mas não oferece entrada de convite para o próprio usuário.

### join_institution é usado SOMENTE durante cadastro inicial?

**SIM.** Com base na análise do frontend, `join_institution` é chamado exclusivamente durante o fluxo de cadastro (register) quando o usuário marca "Tem um convite?". Não há nenhuma outra chamada para `join_institution` em todo o frontend.

---

## H. FLUXO DE LOGIN / REGISTRO

### Rotas:

- `/login` — Login.tsx (pública, sem PrivateRoute)
- `/` — Dashboard (protegida por PrivateRoute)
- Todas as outras rotas internas são protegidas por PrivateRoute

### Guards:

**Login.tsx linha 36-40:**
```typescript
useEffect(() => {
  if (session) {
    navigate('/');
  }
}, [session, navigate]);
```

Se o usuário já tem sessão ativa, é redirecionado para `/` (Dashboard). Um usuário logado **não consegue permanecer na tela de Login** — é redirecionado automaticamente.

**App.tsx linha 63-71:**
```typescript
const PrivateRoute = ({ children }) => {
  const { session, loading } = useAuth();
  if (loading) return <div>Loading...</div>;
  return session ? children : <Navigate to="/login" replace />;
};
```

### Um usuário já cadastrado consegue chegar ao fluxo join_institution pela UI?

**NÃO.** O fluxo funciona assim:

1. Usuário logado → `session` existe → Login.tsx redireciona para `/`
2. Usuário deslogado → pode acessar Login.tsx → pode usar "Tem um convite?"
3. Se o usuário deslogado já tem conta e tenta se "cadastrar" novamente com o mesmo email:
   - `supabase.auth.signUp()` com email já cadastrado retorna erro ou cria nova sessão (depende da config)
   - O fluxo de signup espera um email NOVO
   - Se tentar com email existente, o `signUp` pode falhar ou comportamento inesperado

**Conclusão: NÃO.** Um usuário já cadastrado e logado não consegue legitimamente chegar ao fluxo `join_institution` pela UI. O redirecionamento automático impede o acesso à tela de Login.

No entanto, um usuário tecnicamente sofisticado poderia:
1. Fazer logout
2. Acessar /login
3. Tentar cadastrar-se novamente com o mesmo email e um código de convite
4. Se o `signUp` retornar uma sessão (Supabase com email confirmation OFF), o trigger `handle_new_user` criaria um novo profile ou o `ON CONFLICT` atualizaria o existente
5. `join_institution` seria chamado, movendo o usuário para a nova instituição

Isso é teoricamente possível mas **não é um fluxo suportado pela UI** — requer conhecimento técnico e tentativa deliberada.

---

## I. HISTÓRICO DE CÓDIGO

### join_institution foi criada para:

A função `join_institution` não está em nenhuma migration local. Foi criada através do dashboard Supabase ou uma migration descartada que não está mais disponível no repositório. A única migration que a modifica é a 1G-B (nossa proteção de identidade).

### Evidências de intenção:

1. **Nome da função:** `join_institution` — "join" sugere entrar em uma instituição, não "switch" ou "transfer"
2. **Parâmetro `user_id`:** Recebido como parâmetro, sugerindo que foi projetada para ser chamada por outro código (frontend) em nome do usuário que acabou de se cadastrar
3. **`is_admin = false`:** Sempre define `is_admin = false`, consistente com um novo membro entrando (não um admin mudando)
4. **`ON CONFLICT (id) DO UPDATE`:** Este é o ponto crítico. O `ON CONFLICT` sugere que a função foi escrita para lidar com o caso de o profile já existir (criado pelo trigger `handle_new_user` antes da chamada). Mas o `DO UPDATE` sobrescreve TODOS os campos, incluindo `institution_id`, o que permite a troca.

### Conclusão:

**INDETERMINADO.** Não há evidência conclusiva de que a troca de instituição foi intencional ou não. O `ON CONFLICT DO UPDATE` pode ter sido escrito para lidar com o caso do trigger criar o profile antes da chamada (cenário legítimo de cadastro), mas o fato de sobrescrever `institution_id` permite a troca como efeito colateral.

---

## J. CONVITES

### Schema da tabela `invitations`:

| Coluna | Tipo | Nullable | Default |
|---|---|---|---|
| id | uuid | NO | gen_random_uuid() |
| institution_id | uuid | NO | — |
| code | text | NO | — |
| expires_at | timestamptz | NO | — |
| created_at | timestamptz | YES | now() |
| created_by | uuid | YES | — |
| used_at | timestamptz | YES | — |
| used_by | uuid | YES | — |

### Campos indicando tipo de convite:

**NÃO EXISTEM.** Não há campos como:
- `invite_type` (novo usuário vs existente)
- `transfer` (transferência)
- `target_user` (usuário específico)
- `membership_type` (membership múltiplo)

O schema é minimalista: um código associado a uma instituição, com expiração e rastreio de uso. Qualquer usuário com o código pode usá-lo — não há destino específico.

---

## K. MODELO DE MEMBERSHIP

### Cada user_profile possui apenas UM institution_id?

**SIM.** A tabela `user_profiles` tem uma coluna `institution_id` (uuid, FK para institutions). Cada profile tem no máximo uma instituição.

### Existe tabela join (user_institutions, institution_members, memberships)?

**NÃO.** A query por tabelas com nomes contendo "member", "membership", "user_institution", "institution_member" retornou **vazio**.

### Modelo confirmado:

**1 usuário → 1 instituição por vez.** Não há membership múltiplo. Mudar de instituição significa abandonar a anterior.

---

## L. CENÁRIOS DE ADMIN

### CENÁRIO A: Único admin da instituição A usa convite de B

**Aplicável a:** Faz. São Pedro (admin único: 76658ac9)

| Aspecto | Resultado |
|---|---|
| Membership resultante | institution_id muda de A → B |
| is_admin resultante | false (sempre false em join_institution) |
| Dados antigos | Permanecem em A com institution_id = A |
| Acesso antigo | Perdido — RLS filtra por institution_id = B |
| Administrar A | **IMPOSSÍVEL** — usuário não é mais membro de A |
| Risco de instituição sem admin | **ALTO** — A fica com 0 admins e 1 não-admin (c046dfb3) |
| Risco de dados órfãos | **MÉDIO** — 1 área, 1 safra do admin permanecem em A sem gerente |

### CENÁRIO B: Um de vários admins de A usa convite de B

**Aplicável a:** Grupo Delatorre (4 admins: cc8adbd5, ca7e7323, 470c400e, b5ddba4c)

| Aspecto | Resultado |
|---|---|
| Membership resultante | institution_id muda de A → B |
| is_admin resultante | false |
| Dados antigos | Permanecem em A |
| Acesso antigo | Perdido |
| Administrar A | Ainda possível pelos 3 admins restantes |
| Risco de instituição sem admin | **BAIXO** — A ainda tem 3 admins |
| Risco de dados órfãos | Variável — se ca7e7323 trocar: 26 áreas, 166 operações, 3 notas ficam sem autor acessível |

### CENÁRIO C: Usuário comum (não-admin) de A usa convite de B

**Aplicável a:** c046dfb3 (Faz. São Pedro, não-admin)

| Aspecto | Resultado |
|---|---|
| Membership resultante | institution_id muda de A → B |
| is_admin resultante | false |
| Dados antigos | Permanecem em A (18 áreas, 108 operações, 15 máquinas, 2 manutenções) |
| Acesso antigo | Perdido |
| Administrar A | N/A — já não era admin |
| Risco de instituição sem admin | Nenhum (não era admin) |
| Risco de dados órfãos | **ALTO** — 18 áreas, 108 operações, 15 máquinas, 2 manutenções ficam sem autor acessível. Faz. São Pedro fica com apenas 1 admin (76658ac9) que tem 0 dados |

---

## M. AUTORIA POR USUÁRIO (registros que ficariam órfãos)

| Usuário | Instituição | Áreas | Oper. | Safras | Máq. | Tipos | Manut. | Notas | Total |
|---|---|---|---|---|---|---|---|---|---|
| c046dfb3 | Faz. São Pedro | 18 | 108 | 1 | 15 | 1 | 2 | 0 | **145** |
| 76658ac9 | Faz. São Pedro | 0 | 0 | 1 | 0 | 0 | 0 | 0 | **1** |
| cc8adbd5 | Grupo Delatorre | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** |
| ca7e7323 | Grupo Delatorre | 26 | 166 | 1 | 3 | 0 | 0 | 3 | **199** |
| 470c400e | Grupo Delatorre | 0 | 33 | 2 | 1 | 1 | 1 | 5 | **43** |
| b5ddba4c | Grupo Delatorre | 0 | 2 | 0 | 0 | 0 | 0 | 0 | **2** |

Se qualquer um destes usuários mudasse de instituição, seus registros permaneceriam na instituição original mas o usuário perderia acesso a eles.

---

## N. CONVITES ATIVOS

| ID mascarado | Instituição | Status | Expira em | Usado por |
|---|---|---|---|---|
| 72518558 | Grupo Delatorre | used | 2025-05-30 | 470c400e |
| 8e06a00e | Girassol | used | 2025-05-30 | (nulo) |
| dab2305b | Grupo Delatorre | used | 2025-09-24 | ca7e7323 |
| 114d3cbe | Grupo Delatorre | used | 2025-10-09 | cc8adbd5 |
| 25b3d1f7 | Faz. São Pedro | used | 2025-10-13 | c046dfb3 |
| 62e95290 | Grupo Delatorre | used | 2026-08-06 | b5ddba4c |
| 883f09f7 | Grupo Delatorre | expired | 2026-09-29 | (nulo) |

### Convites ativos atualmente:

**NENHUM.** Todos os 7 convites estão usados (6) ou expirados (1). Não há convites ativos no momento que poderiam provocar troca de instituição.

### Histórico de uso:

Todos os convites usados foram consumidos durante cadastro inicial (novos usuários entrando em instituições existentes). Não há evidência de convite usado para troca de instituição por usuário já cadastrado.

---

## O. PROTEÇÃO 1G-B

| Propriedade | Valor |
|---|---|
| Função | join_institution |
| SECURITY DEFINER | true |
| search_path | `public, pg_temp` |
| auth.uid() obrigatório | **SIM** |
| user_id = auth.uid() | **SIM** (IS DISTINCT FROM) |
| PUBLIC EXECUTE | **Não** |
| anon EXECUTE | **Não** |
| authenticated EXECUTE | **Sim** |
| service_role EXECUTE | **Sim** |
| postgres EXECUTE | **Sim** |

**Proteção 1G-B intacta.** Nenhuma alteração.

---

## P. OPÇÕES FUTURAS

### OPÇÃO A: join_institution só pode ser usado se institution_id IS NULL

| Aspecto | Avaliação |
|---|---|
| Benefício | Impede troca de instituição. Usuário só entra em instituição se não tiver uma |
| Risco | Usuário sem instituição (profile criado pelo trigger mas sem join/registration) ainda pode entrar. Usuário com instituição não pode trocar |
| Impacto | Nenhum fluxo legítimo quebrado (cadastro inicial sempre tem institution_id NULL antes do join) |
| Complexidade | BAIXA — uma verificação IF |
| Compatibilidade | Totalmente compatível com o modelo atual |

### OPÇÃO B: Permitir troca apenas se usuário não possuir dados/autoria na instituição atual

| Aspecto | Avaliação |
|---|---|
| Benefício | Impede que dados fiquem órfãos. Usuário só troca se não criou nada |
| Risco | Pode impedir troca legítima de usuário que criou poucos dados |
| Impacto | Nenhum fluxo legítimo quebrado (cadastro inicial não tem dados) |
| Complexidade | MÉDIA — verificar count em 7 tabelas |
| Compatibilidade | Compatível, mas adiciona lógica de negócio à função |

### OPÇÃO C: Permitir troca apenas se usuário não for admin

| Aspecto | Avaliação |
|---|---|
| Benefício | Impede que instituição fique sem admin |
| Risco | Admin sem dados (como 76658ac9) não pode trocar mesmo sem causar órfãos |
| Impacto | Pode impedir troca legítima de admin sem dados |
| Complexidade | BAIXA — uma verificação IF |
| Compatibilidade | Compatível |

### OPÇÃO D: Permitir troca somente através de fluxo administrativo explícito

| Aspecto | Avaliação |
|---|---|
| Benefício | Controle total. Admin decide quem troca |
| Risco | Requer nova UI, nova função, nova lógica |
| Impacto | Alto — precisa de desenvolvimento frontend + backend |
| Complexidade | ALTA |
| Compatibilidade | Compatível mas exige mudanças significativas |

### OPÇÃO E: Manter comportamento atual

| Aspecto | Avaliação |
|---|---|
| Benefício | Nenhuma mudança necessária |
| Risco | Usuário pode trocar de instituição, deixar dados órfãos, deixar instituição sem admin |
| Impacto | Nenhum |
| Complexidade | Nenhuma |
| Compatibilidade | Total |

### OPÇÃO F: Futuramente criar membership múltiplo

| Aspecto | Avaliação |
|---|---|
| Benefício | Usuário pertence a múltiplas instituições, sem perder dados |
| Risco | Mudança arquitetural significativa |
| Impacto | Muito alto — mudança de schema, RLS, frontend, lógica de negócio |
| Complexidade | MUITO ALTA |
| Compatibilidade | Incompatível com modelo atual — requer redesign |

---

## Q. RECOMENDAÇÃO

### OPÇÃO A: join_institution só pode ser usado se institution_id IS NULL

**Justificativa:**

1. **Não perde dados:** Registros antigos permanecem na instituição original. Usuário não troca, então não perde acesso.
2. **Não deixa instituição sem admin:** Como a troca é bloqueada, o admin não pode abandonar a instituição via convite.
3. **Não quebra cadastro por convite:** O fluxo legítimo cria o profile com `institution_id = NULL` (via trigger `handle_new_user`), e então chama `join_institution`. O `institution_id` é NULL, então a verificação passa.
4. **Mantém modelo simples:** Uma verificação IF adicional, sem mudança de schema.
5. **Não introduz membership múltiplo:** O modelo 1:1 é preservado.

### Por que não Opção B:

Mais complexa e adiciona lógica de negócio à função. A Opção A é mais simples e atende aos mesmos objetivos.

### Por que não Opção C:

Bloqueia admin sem dados (como 76658ac9, que tem apenas 1 safra) mas não bloqueia não-admin com muitos dados (como c046dfb3, que tem 145 registros). A Opção A é mais abrangente.

### Por que não Opção E:

Mantém o risco de dados órfãos e instituição sem admin.

### Implementação futura (NÃO implementar agora):

Adicionar antes da lógica de validação do convite:
```sql
IF EXISTS (SELECT 1 FROM public.user_profiles WHERE id = user_id AND institution_id IS NOT NULL) THEN
  RETURN json_build_object(
    'success', false,
    'type', 'error',
    'message', 'User already belongs to an institution'
  );
END IF;
```

Isso retornaria um JSON de erro (não rais exception) para o frontend lidar gracefully.

---

## R. BASELINE POST

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

## S. DIVERGÊNCIAS

**Nenhuma divergência.** PRE e POST são idênticos. Nenhum dado foi alterado. Nenhuma função foi modificada. Nenhuma migration foi criada.

---

## RESUMO EXECUTIVO

Esta auditoria investigou o comportamento de troca de instituição via convite. Conclusões principais:

### Descoberta central:
A função `join_institution` permite que um usuário já cadastrado (com `institution_id` preenchido) use um convite de outra instituição e seja movido para ela. O `ON CONFLICT (id) DO UPDATE` sobrescreve `institution_id`, `is_admin` (vira false), e todos os campos do profile. Os registros antigos permanecem na instituição original mas o usuário perde acesso a eles (RLS filtra por `institution_id` do profile).

### É funcionalidade intencional?
**INDETERMINADO.** O `ON CONFLICT` provavelmente foi escrito para lidar com o trigger criando o profile antes da chamada (cadastro normal), mas sobrescreve `institution_id` como efeito colateral. Não há evidência de intenção de permitir troca.

### É acessível pela UI?
**NÃO.** O frontend não oferece nenhuma interface para usuário logado inserir convite. A tela de Login redireciona usuários logados para o Dashboard. `join_institution` só é chamado durante o cadastro inicial.

### Risco atual:
- **Faz. São Pedro tem apenas 1 admin.** Se ele trocar de instituição, fica sem admin.
- **Usuario c046dfb3 (não-admin) tem 145 registros.** Se trocar, todos ficam órfãos.
- **Nenhum convite ativo** no momento — risco imediato é baixo.
- Risco futuro existe se admin criar convite e usuário sofisticado usar via logout + novo cadastro.

### Recomendação:
**OPÇÃO A** — bloquear `join_institution` se `institution_id IS NOT NULL`. Simples, não quebra cadastro, não perde dados, não deixa instituição sem admin. NÃO implementar agora — aguardar revisão externa.

**PARE.** Aguardo revisão externa. Não implementarei a recomendação. Não alterarei `join_institution`, convites, profiles, RLS ou frontend.
