# ETAPA 1F-B — AUDITORIA DE copy_data_to_institution
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
| areas | 44 |
| operations | 309 |
| products | 217 |
| product_lots | 149 |
| seasons | 5 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |
| notes | 8 |
| invitations | 7 |

| Sentinela | Valor |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

**Comparação com Etapa 1F-A:** Todos os valores idênticos. Nenhuma mudança.

---

## B. DEFINIÇÃO COMPLETA

```sql
CREATE OR REPLACE FUNCTION public.copy_data_to_institution(
  source_institution_id uuid,
  target_institution_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Copy areas
  INSERT INTO areas (
    name, size, unit, location, description, current_crop, cultivar,
    user_id, institution_id
  )
  SELECT
    name, size, unit, location, description, current_crop, cultivar,
    user_id, target_institution_id
  FROM areas
  WHERE institution_id = source_institution_id;

  -- Copy products
  INSERT INTO products (
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, institution_id
  )
  SELECT
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, target_institution_id
  FROM products
  WHERE institution_id = source_institution_id;

  -- Copy seasons
  INSERT INTO seasons (
    name, start_date, end_date, status, description,
    user_id, institution_id
  )
  SELECT
    name, start_date, end_date, status, description,
    user_id, target_institution_id
  FROM seasons
  WHERE institution_id = source_institution_id;
END;
$function$;
```

### Metadados:

| Propriedade | Valor |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | Sim |
| Volatility | VOLATILE (V) |
| search_path (proconfig) | NULL (não definido) |
| Language | plpgsql |

### Tabelas lidas:
- `areas` (SELECT WHERE institution_id = source)
- `products` (SELECT WHERE institution_id = source)
- `seasons` (SELECT WHERE institution_id = source)

### Tabelas escritas:
- `areas` (INSERT)
- `products` (INSERT)
- `seasons` (INSERT)

### Colunas copiadas por tabela:

**areas:** name, size, unit, location, description, current_crop, cultivar, user_id, institution_id (substituído por target)
- **NÃO copia:** id (gera novo UUID automaticamente), created_at, updated_at, geometry
- **user_id:** copia o user_id original (não substitui por auth.uid())
- **institution_id:** substitui por target_institution_id

**products:** name, category, unit, quantity_in_stock, min_stock_level, price, supplier, description, institution_id (substituído por target)
- **NÃO copia:** id (gera novo UUID), created_at, updated_at
- **quantity_in_stock:** copia o valor atual (pode duplicar estoque)
- **institution_id:** substitui por target_institution_id

**seasons:** name, start_date, end_date, status, description, user_id, institution_id (substituído por target)
- **NÃO copia:** id (gera novo UUID), created_at, updated_at
- **user_id:** copia o user_id original
- **institution_id:** substitui por target_institution_id

### Tratamento de relacionamentos:

A função **NÃO copia**:
- operations
- product_lots
- machinery
- maintenance_types
- maintenances
- notes
- invitations
- user_profiles

A função **NÃO preserva IDs** — novos UUIDs são gerados para cada registro copiado. Isso significa que relacionamentos entre as tabelas copiadas são perdidos:
- Áreas copiadas recebem novos IDs. Operações que referenciavam as áreas originais NÃO são copiadas, então não há problema de integridade imediato, mas as áreas copiadas ficam órfãs de qualquer operação futura.
- Produtos copiados recebem novos IDs. Lotes de produtos NÃO são copiados, então os produtos copiados ficam sem lotes.
- Safras copiadas recebem novos IDs. Operações que referenciavam as safras originais NÃO são copiadas.

### Tratamento de geometry:

A coluna `geometry` existe em `areas` (tipo USER-DEFINED, provavelmente PostGIS geometry/geometry). A função **NÃO copia geometry**. As áreas copiadas terão `geometry = NULL`.

### Tratamento de timestamps:

A função não copia `created_at` nem `updated_at`. As novas linhas terão timestamps gerados por DEFAULT.

---

## C. GRANTS

| Grantee | EXECUTE |
|---|---|
| PUBLIC | Sim |
| anon | Sim |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

**Mesmo padrão da função original list_institution_users antes da Etapa 1F-A.** Qualquer pessoa, incluindo anon, pode executar.

---

## D. REFERÊNCIAS NO CÓDIGO

### Busca exaustiva no projeto:

| Localização | Resultado |
|---|---|
| `src/` (todo código frontend) | **ZERO ocorrências** |
| `supabase/migrations/` | **ZERO ocorrências** |
| `supabase/functions/` | Diretório não existe no disco |
| `.bolt/supabase_discarded_migrations/` | Diretório não existe no disco (apenas `.bolt/config.json` presente) |
| Arquivos `.sql` no projeto | **ZERO ocorrências** |
| Documentos `.md` | Encontrada apenas em relatórios de auditoria (Etapa 1E e 1F-A) |

### Conclusão:

`copy_data_to_institution` **não aparece em nenhum arquivo SQL, nenhum arquivo TypeScript, nenhum arquivo JavaScript, nenhuma migration, nenhuma edge function**. As únicas ocorrências são em documentos de auditoria markdown.

---

## E. USO NO FRONTEND

### **NÃO EXISTE CHAMADA ATIVA NO FRONTEND.**

A busca por `copy_data_to_institution`, `copyData`, `copy_data_to` em `src/` retornou zero resultados. A função não é chamada de nenhuma página, componente, hook, context, ou service do frontend.

---

## F. USO BACKEND/RPC

### Nenhuma outra função chama copy_data_to_institution.

A query `SELECT pg_get_functiondef(p.oid) ... LIKE '%copy_data_to_institution%'` em todas as funções do schema public retornou vazio (excluindo a própria função).

### Edge Functions:

Existe uma Edge Function `invites` (ativa, verify_jwt=true). A busca por `copy_data_to_institution` em `supabase/functions/` retornou zero — o diretório não existe no disco. A Edge Function provavelmente está deployada no Supabase mas seu código-fonte não está no repositório local. No entanto, dado o nome `invites`, é muito improvável que chame `copy_data_to_institution`.

### Triggers:

A busca por triggers (Etapa 1E) encontrou apenas `on_auth_user_created`, `update_institutions_updated_at`, e `update_user_profiles_updated_at`. Nenhum trigger chama `copy_data_to_institution`.

### Mapa de callers:

```
NENHUM CALLER IDENTIFICADO
→ copy_data_to_institution
→ areas (INSERT)
→ products (INSERT)
→ seasons (INSERT)
```

---

## G. HISTÓRICO

### Quando a função foi criada:

**INDETERMINADO.** A função não aparece em nenhuma migration no repositório. As migrations existentes são:

1. `20251016134258_initial_schema.sql` — schema inicial
2. `20251016212020_create_maintenances_and_maintenance_types_tables.sql`
3. `20260113142014_update_operations_table_structure.sql`
4. `20260806172737_create_product_lots_table.sql`
5. `20260826121507_..._fix_save_area_geometry_polygon_conversion.sql`
6. `20260826134002_..._output_polygon_geojson_from_map_summary.sql`
7. `20261007141523_protect_operations_from_season_area_cascade.sql`
8. `20261007142324_protect_product_lots_from_product_cascade.sql`
9. `20261007142920_protect_maintenance_history_from_cascade.sql`
10. `20261007163526_secure_list_institution_users.sql`

Nenhuma destas contém `copy_data_to_institution`. O diretório `.bolt/supabase_discarded_migrations/` listado no inventário de arquivos não existe fisicamente no disco.

### Hipótese mais provável:

A função foi criada durante o desenvolvimento inicial (antes das migrations atuais), possivelmente via Supabase Dashboard ou SQL direto, como uma utility function para copiar dados entre instituições. Pode ter sido parte de um fluxo de "clonar instituição" ou "migrar dados entre instituições" que foi posteriormente abandonado. O código frontend que a chamava (se existiu) foi removido, mas a função permaneceu no banco.

### Finalidade:

A função parece ter sido projetada para copiar dados base (áreas, produtos, safras) de uma instituição para outra. Isso poderia ser útil em cenários como:
- Criar uma nova instituição com dados template
- Migrar dados entre instituições após fusão/aquisição
- Duplicar configurações entre fazendas

No entanto, a função é incompleta: não copia operações, lotes, máquinas, manutenções, notas, nem preserva geometries ou relacionamentos.

---

## H. TABELAS E CAMPOS AFETADOS

### Se `copy_data_to_institution(A, B)` fosse chamada hoje:

#### ÁREAS:
- **Quantas seriam copiadas:** Depende de quantas áreas a instituição A tem (ex: Grupo Delatorre = 26, Faz. São Pedro = 18)
- **Campos copiados:** name, size, unit, location, description, current_crop, cultivar, user_id
- **institution_id:** substituído por B
- **Novos UUIDs:** Sim (id não é copiado, DEFAULT gen_random_uuid())
- **geometry:** NÃO copiada (NULL na cópia)
- **user_id:** copiado do original (mantém o autor original, não o caller)
- **created_at/updated_at:** DEFAULT (novos timestamps)

#### PRODUTOS:
- **Quantos seriam copiados:** Depende de quantos produtos a instituição A tem (ex: Grupo Delatorre = 188)
- **Campos copiados:** name, category, unit, quantity_in_stock, min_stock_level, price, supplier, description
- **institution_id:** substituído por B
- **Novos UUIDs:** Sim
- **quantity_in_stock:** copiado do valor atual — **DUPLICA ESTOQUE**
- **created_at/updated_at:** DEFAULT

#### SAFRAS:
- **Quantas seriam copiadas:** Depende de quantas safras a instituição A tem (ex: Grupo Delatorre = 3)
- **Campos copiados:** name, start_date, end_date, status, description, user_id
- **institution_id:** substituído por B
- **Novos UUIDs:** Sim
- **user_id:** copiado do original
- **created_at/updated_at:** DEFAULT

#### OPERAÇÕES: **NÃO SÃO COPIADAS.**

#### LOTES: **NÃO SÃO COPIADOS.**

#### MÁQUINAS: **NÃO SÃO COPIADAS.**

#### MANUTENÇÕES: **NÃO SÃO COPIADAS.**

#### NOTAS: **NÃO SÃO COPIADAS.**

#### CONVITES/PERFIS: **NÃO SÃO COPIADOS.**

---

## I. COMPORTAMENTO SOURCE → TARGET

### O que aconteceria se `copy_data_to_institution('e8741889...', '741ba2ae...')` (Grupo Delatorre → Faz. São Pedro) fosse chamada:

1. **26 áreas** do Grupo Delatorre seriam copiadas para Faz. São Pedro com novos UUIDs, sem geometry, com user_id dos usuários do Grupo Delatorre
2. **188 produtos** do Grupo Delatorre seriam copiados para Faz. São Pedro com novos UUIDs, duplicando o estoque (quantity_in_stock somaria aos 29 produtos existentes de Faz. São Pedro)
3. **3 safras** do Grupo Delatorre seriam copiadas para Faz. São Pedro com novos UUIDs
4. Total: +26 áreas, +188 produtos, +3 safras na instituição target
5. As 309 operações do Grupo Delatorre NÃO seriam copiadas
6. Os 149 lotes do Grupo Delatorre NÃO seriam copiados (produtos copiados ficariam sem lotes)

### Impacto nos dados existentes da target:
- As áreas/produtos/safras existentes de Faz. São Pedro permaneceriam
- Novas linhas seriam ADICIONADAS (INSERT, não UPDATE)
- O estoque total de produtos de Faz. São Pedro aumentaria pela soma dos estoques copiados
- Nenhuma linha existente seria alterada ou excluída

---

## J. RISCO DE DUPLICAÇÃO

### Se a função for chamada duas vezes para as mesmas instituições (A → B, A → B):

- **ON CONFLICT:** Não existe. A função usa INSERT puro sem ON CONFLICT.
- **Verificação de existência:** Não existe. A função não verifica se os dados já foram copiados.
- **IDs novos:** Cada chamada gera novos UUIDs, então não viola constraints de PK.
- **Duplicação semântica:** **SIM.** As mesmas áreas, produtos e safras seriam copiadas novamente com novos UUIDs. A instituição B teria duas cópias idênticas (mesmo nome, mesmo tamanho, mesmo estoque, etc.).
- **Estoque:** **DUPLICADO.** Se um produto com 1000 unidades for copiado duas vezes, a instituição B terá dois produtos idênticos cada um com 1000 unidades.

### Classificação: **ALTO**

A ausência de ON CONFLICT, verificação de existência, ou idempotência significa que chamadas repetidas criam duplicatas sem limites. Para estoque, isso é **CRÍTICO** pois infla artificialmente a quantidade disponível.

---

## K. RISCO CROSS-INSTITUTION

### Cenário A: anon chama source=A, target=B

- **Permitido atualmente?** SIM — anon tem EXECUTE, a função não verifica auth.uid()
- **Dados lidos:** Todos os dados de áreas, produtos e safras da instituição A (via SECURITY DEFINER, bypassa RLS)
- **Dados criados:** Novas linhas em áreas, produtos e safras da instituição B
- **Bypass de RLS:** SIM — SECURITY DEFINER executa como postgres, ignorando RLS
- **Risco:** **CRÍTICO** — anon pode copiar dados privados de qualquer instituição para qualquer outra, efetivamente exfiltrando dados

### Cenário B: authenticated da instituição A chama source=A, target=B

- **Permitido atualmente?** SIM — authenticated tem EXECUTE, a função não verifica auth.uid() nem membership
- **Dados lidos:** Todos os dados de áreas, produtos e safras da instituição A (bypassa RLS via SECURITY DEFINER — embora o usuário pertença à A, a função lê sem passar por RLS)
- **Dados criados:** Novas linhas em B, com institution_id = B
- **Bypass de RLS:** SIM — SECURITY DEFINER. Mesmo que o usuário só pudesse ver dados de A via RLS, a função lê dados de A como postgres. Mas o problema maior é que também pode ler dados de B, C, etc.
- **Risco:** **ALTO** — usuário de A pode copiar dados de qualquer instituição (não apenas A) para qualquer outra

### Cenário C: authenticated da instituição A chama source=B, target=A

- **Permitido atualmente?** SIM
- **Dados lidos:** Todos os dados de áreas, produtos e safras da instituição B — **dados de outra instituição que o usuário não deveria ver**
- **Dados criados:** Novas linhas em A
- **Bypass de RLS:** SIM — a função lê dados de B via SECURITY DEFINER, bypassando o RLS que normalmente impediria o usuário de A de ver dados de B
- **Risco:** **CRÍTICO** — esta é uma violação de confidencialidade cross-institution. Um usuário pode exfiltrar dados de qualquer instituição copiando-os para a sua própria.

### Cenário D: authenticated da instituição A chama source=B, target=C

- **Permitido atualmente?** SIM
- **Dados lidos:** Todos os dados de B (bypass RLS)
- **Dados criados:** Novas linhas em C (instituição que não é a do usuário)
- **Bypass de RLS:** SIM
- **Risco:** **CRÍTICO** — usuário pode copiar dados entre duas instituições das quais não é membro

---

## L. CLASSIFICAÇÃO DE USO

### Classificação: **D — LEGADO/ÓRFÃ SEM USO IDENTIFICADO**

**Justificativa com evidência:**

1. **Zero chamadas no frontend** — busca exaustiva em `src/` retornou vazio
2. **Zero chamadas em outras funções/RPCs** — busca no catálogo pg_proc retornou vazio
3. **Zero chamadas em triggers** — nenhum trigger referencia a função
4. **Zero ocorrências em migrations** — a função não está em nenhuma migration do repositório
5. **Zero ocorrências em edge functions** — o código-fonte da edge function `invites` não está no repositório, mas o nome sugere que trata de convites, não cópia de dados
6. **Função incompleta** — não copia operações, lotes, máquinas, manutenções, notas, nem geometry, tornando-a inútil para migração real de dados
7. **Sem verificação de autorização** — não tem auth.uid(), membership, ou admin, indicando que foi criada como utility sem考虑 de segurança

A função parece ter sido criada durante o desenvolvimento inicial como uma utility para copiar dados template entre instituições, e posteriormente abandonada quando o aplicativo evoluiu. O código que a chamava (se existiu) foi removido, mas a função permaneceu no banco de dados.

---

## M. OPÇÕES DE CORREÇÃO

### OPÇÃO 1: Revogar PUBLIC e anon, manter authenticated, adicionar auth.uid() + admin/membership

- **Vantagem:** Mantém a função disponível para uso autenticado
- **Desvantagem:** O modelo 1 usuário → 1 instituição torna impossível verificar admin de ambas as instituições (source e target) simultaneamente. Um usuário só pode ser admin de uma instituição.
- **Viabilidade:** Requer redesigned da autorização (ver seção N)

### OPÇÃO 2: Revogar PUBLIC, anon e authenticated, permitir apenas service_role/postgres

- **Vantagem:** Simples, seguro, elimina completamente o risco cross-institution via API
- **Desvantagem:** A função só pode ser chamada via service_role (backend/admin). Se houver um futuro caso de uso legítimo do frontend, seria necessário criar uma nova função com autorização adequada.
- **Viabilidade:** Alta. Dado que não há chamadas no frontend, não quebra nada.

### OPÇÃO 3: Remover a função

- **Vantagem:** Elimina completamente a superfície de ataque
- **Desvantagem:** Zero Data Loss também significa preservar compatibilidade. Remover uma função pode quebrar algo que não detectamos (ex: um script externo, um job, uma chamada via Supabase Dashboard)
- **Viabilidade:** Média. Recomenda-se apenas após confirmar que não há nenhum uso externo.

---

## N. REGRA RECOMENDADA (SE A FUNÇÃO PRECISAR CONTINUAR)

### O problema do modelo 1 usuário → 1 instituição:

Se a função precisar continuar disponível para usuários autenticados, a regra de autorização ideal seria:

> "O caller deve ser admin da instituição source E admin da instituição target."

Mas o modelo atual é 1 usuário → 1 instituição. Um usuário só tem `institution_id` em um valor. Ele não pode ser admin de duas instituições simultaneamente.

### Possíveis regras:

**Regra A:** Caller deve ser admin da institution target. Pode copiar dados de qualquer source.
- Problema: permite exfiltrar dados de qualquer instituição

**Regra B:** Caller deve ser admin da institution source. Pode copiar para qualquer target.
- Problema: permite injetar dados em instituição de terceiros

**Regra C:** Caller deve ser admin da institution source E target.
- Problema: impossível no modelo atual (1 usuário → 1 instituição)

**Regra D:** Caller deve ser admin da institution target, e source deve ser a mesma instituição do caller.
- Isso torna a função equivalente a "duplicar dados dentro da mesma instituição", o que provavelmente não é a finalidade.

### Conclusão:

**No modelo atual 1 usuário → 1 instituição, não existe uma regra de autorização que permita uso legítimo de copy_data_to_institution via API sem criar riscos de confidencialidade ou integridade.**

A única opção segura é **OPÇÃO 2**: restringir EXECUTE a service_role/postgres apenas. Se no futuro o modelo evoluir para multi-instituição, a função pode ser redesenhada com autorização adequada.

---

## O. SEARCH PATH

### Nomes não qualificados na função:

| Referência | Tipo | Qualificada? |
|---|---|---|
| `areas` (INSERT INTO) | Tabela | NÃO |
| `areas` (SELECT FROM) | Tabela | NÃO |
| `products` (INSERT INTO) | Tabela | NÃO |
| `products` (SELECT FROM) | Tabela | NÃO |
| `seasons` (INSERT INTO) | Tabela | NÃO |
| `seasons` (SELECT FROM) | Tabela | NÃO |

A função não qualifica nenhuma tabela com `public.`. Com search_path não definido, um atacante poderia criar uma tabela `public.areas` maliciosa (se tiver permissão) e interceptar a leitura/escrita.

### Configuração segura recomendada:

```sql
SET search_path = public, pg_temp
```

E qualificar todas as tabelas explicitamente:
```sql
INSERT INTO public.areas (...)
SELECT ... FROM public.areas WHERE ...
```

**NÃO alterar nesta etapa.**

---

## P. ROLLBACK NECESSÁRIO (para futura correção)

Se a função for corrigida na próxima etapa, preservar:

### Definição original:
```sql
CREATE OR REPLACE FUNCTION public.copy_data_to_institution(
  source_institution_id uuid, target_institution_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Copy areas
  INSERT INTO areas (name, size, unit, location, description, current_crop, cultivar, user_id, institution_id)
  SELECT name, size, unit, location, description, current_crop, cultivar, user_id, target_institution_id
  FROM areas WHERE institution_id = source_institution_id;

  -- Copy products
  INSERT INTO products (name, category, unit, quantity_in_stock, min_stock_level, price, supplier, description, institution_id)
  SELECT name, category, unit, quantity_in_stock, min_stock_level, price, supplier, description, target_institution_id
  FROM products WHERE institution_id = source_institution_id;

  -- Copy seasons
  INSERT INTO seasons (name, start_date, end_date, status, description, user_id, institution_id)
  SELECT name, start_date, end_date, status, description, user_id, target_institution_id
  FROM seasons WHERE institution_id = source_institution_id;
END;
$function$;
```

### Grants originais:
```sql
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO authenticated;
```

### Metadados:
- Owner: postgres
- prosecdef: true
- proconfig: null
- provolatile: v

---

## Q. BASELINE POST

| Tabela | Contagem POST |
|---|---|
| auth.users | 6 |
| user_profiles | 6 |
| institutions | 6 |
| areas | 44 |
| operations | 309 |
| products | 217 |
| product_lots | 149 |
| seasons | 5 |
| machinery | 19 |
| maintenances | 3 |
| maintenance_types | 2 |
| notes | 8 |
| invitations | 7 |

| Sentinela | Valor POST |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## R. DIVERGÊNCIAS

**Nenhuma divergência.** PRE e POST são idênticos. Nenhum dado foi alterado. Nenhuma função foi modificada. Nenhuma migration foi criada.

---

## S. RECOMENDAÇÃO PARA PRÓXIMA ETAPA

### Recomendação: **OPÇÃO 2 — Restringir EXECUTE a service_role/postgres apenas**

**Justificativa:**
1. A função é classificada como **D — LEGADO/ÓRFÃ** (zero uso no frontend, backend, migrations, triggers)
2. O modelo 1 usuário → 1 instituição torna impossível criar uma regra de autorização que permita uso legítimo via API sem riscos
3. A função tem risco **CRÍTICO** de exfiltração cross-institution (cenários A, C, D)
4. A função tem risco **ALTO** de duplicação de estoque (sem ON CONFLICT, sem idempotência)
5. Restringir a service_role não quebra nenhum fluxo existente (não há chamadas no frontend)
6. Preserva a função para possível uso administrativo futuro via service_role

### Migration proposta (NÃO IMPLEMENTAR):
```sql
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM authenticated;
-- service_role e postgres mantêm EXECUTE implicitamente
```

### Adicionalmente:
- Adicionar `SET search_path = public, pg_temp` à função
- Qualificar tabelas com `public.`

### NÃO RECOMENDADO nesta etapa:
- Não remover a função (OPÇÃO 3) — sem certeza absoluta de que não há uso externo
- Não adicionar auth.uid() + membership (OPÇÃO 1) — modelo atual torna a regra impossível

---

## RESUMO EXECUTIVO

`copy_data_to_institution` é uma função órfã — não é chamada de nenhum lugar no frontend, backend, migrations, ou triggers. Foi provavelmente criada durante o desenvolvimento inicial e abandonada. Ela permite que qualquer pessoa (incluindo usuários não autenticados) copie áreas, produtos e safras entre quaisquer instituições, bypassando RLS via SECURITY DEFINER. O risco é **CRÍTICO**: exfiltração de dados cross-institution, duplicação de estoque sem controle, e injeção de dados em instituições de terceiros.

A recomendação é restringir EXECUTE a `service_role`/`postgres` apenas (removendo grants de PUBLIC, anon e authenticated), e adicionar `search_path` protegido. Isso elimina o risco via API sem quebrar nenhum fluxo existente, e preserva a função para uso administrativo futuro se necessário.

**PARE.** Aguardo revisão externa. Não modificarei `copy_data_to_institution`. Não mexerei em outras funções, RLS, FKs, ou frontend.
