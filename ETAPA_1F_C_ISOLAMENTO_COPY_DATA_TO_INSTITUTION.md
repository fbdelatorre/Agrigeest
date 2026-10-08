# ETAPA 1F-C — RESULTADO DO ISOLAMENTO DE copy_data_to_institution
## AGRIGEST ZERO DATA LOSS

**Data/hora:** 2026-10-07
**Migration aplicada:** `isolate_copy_data_to_institution`

---

## 1. BASELINE PRE

| Tabela | Contagem PRE |
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

| Sentinela | Valor PRE |
|---|---|
| SUM(products.quantity_in_stock) | 4.617.076,08296666766681363 |
| SUM(product_lots.quantity) | 185.382,00000666667 |
| items em operations.products_used | 1.459 |
| productIds inválidos em products_used | 501 |

---

## 2. CHECKSUM_PRE

| Tabela | Checksum PRE |
|---|---|
| areas | `1f40430c05954fcae4ca737bddc38539` |
| products | `40fa32700e59f87773383c100a225907` |
| seasons | `981c3b936b8678c9255424694bf4ffa6` |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` |

---

## 3. DEFINIÇÃO PRE

```sql
CREATE OR REPLACE FUNCTION public.copy_data_to_institution(source_institution_id uuid, target_institution_id uuid)
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

| Propriedade | Valor PRE |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | Sim |
| Volatility | VOLATILE (V) |
| search_path (proconfig) | NULL (não definido) |

---

## 4. GRANTS PRE

| Grantee | EXECUTE |
|---|---|
| PUBLIC | Sim |
| anon | Sim |
| authenticated | Sim |
| postgres | Sim |
| service_role | Sim |

**Estado confirmado idêntico à auditoria 1F-B.**

---

## 5. SQL EXATO EXECUTADO

Arquivo: `supabase/migrations/isolate_copy_data_to_institution.sql`

```sql
CREATE OR REPLACE FUNCTION public.copy_data_to_institution(
  source_institution_id uuid,
  target_institution_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  -- Copy areas
  INSERT INTO public.areas (
    name, size, unit, location, description, current_crop, cultivar,
    user_id, institution_id
  )
  SELECT
    name, size, unit, location, description, current_crop, cultivar,
    user_id, target_institution_id
  FROM public.areas
  WHERE institution_id = source_institution_id;

  -- Copy products
  INSERT INTO public.products (
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, institution_id
  )
  SELECT
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, target_institution_id
  FROM public.products
  WHERE institution_id = source_institution_id;

  -- Copy seasons
  INSERT INTO public.seasons (
    name, start_date, end_date, status, description,
    user_id, institution_id
  )
  SELECT
    name, start_date, end_date, status, description,
    user_id, target_institution_id
  FROM public.seasons
  WHERE institution_id = source_institution_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO postgres;
```

**Mudanças aplicadas:**
1. `SET search_path = public, pg_temp` adicionado
2. Todas as tabelas qualificadas com `public.` (areas, products, seasons — tanto INSERT quanto SELECT)
3. REVOKE de PUBLIC, anon, authenticated
4. GRANT explícito para service_role e postgres
5. Lógica interna, campos, parâmetros, retorno — **inalterados**

---

## 6. DEFINIÇÃO POST

```sql
CREATE OR REPLACE FUNCTION public.copy_data_to_institution(source_institution_id uuid, target_institution_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Copy areas
  INSERT INTO public.areas (
    name, size, unit, location, description, current_crop, cultivar,
    user_id, institution_id
  )
  SELECT
    name, size, unit, location, description, current_crop, cultivar,
    user_id, target_institution_id
  FROM public.areas
  WHERE institution_id = source_institution_id;

  -- Copy products
  INSERT INTO public.products (
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, institution_id
  )
  SELECT
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, target_institution_id
  FROM public.products
  WHERE institution_id = source_institution_id;

  -- Copy seasons
  INSERT INTO public.seasons (
    name, start_date, end_date, status, description,
    user_id, institution_id
  )
  SELECT
    name, start_date, end_date, status, description,
    user_id, target_institution_id
  FROM public.seasons
  WHERE institution_id = source_institution_id;
END;
$function$;
```

| Propriedade | Valor POST |
|---|---|
| Owner | postgres |
| SECURITY DEFINER | Sim |
| Volatility | VOLATILE (V) |
| search_path (proconfig) | `search_path=public, pg_temp` |
| Assinatura | `copy_data_to_institution(source_institution_id uuid, target_institution_id uuid) RETURNS void` — idêntica |

---

## 7. GRANTS POST

| Grantee | EXECUTE |
|---|---|
| PUBLIC | **Não** |
| anon | **Não** |
| authenticated | **Não** |
| postgres | **Sim** |
| service_role | **Sim** |

---

## 8. has_function_privilege POR ROLE

| Role | can_execute |
|---|---|
| anon | **false** |
| authenticated | **false** |
| service_role | **true** |
| postgres | **true** |

**Resultado esperado confirmado.**

---

## 9. CONFIRMAÇÃO DE QUE A FUNÇÃO NÃO FOI EXECUTADA

A função `copy_data_to_institution` **não foi executada** em nenhum momento durante esta etapa. A validação foi feita exclusivamente por:
- `pg_get_functiondef` — leitura da definição
- `information_schema.routine_privileges` — leitura de grants
- `has_function_privilege` — verificação analítica de permissões
- `pg_proc` — metadados da função
- Checksums de tabelas — prova de que nenhum INSERT ocorreu

Nenhum `SELECT copy_data_to_institution(...)` foi executado. Nenhum RPC call foi feito.

---

## 10. BASELINE POST

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

## 11. CHECKSUM_POST

| Tabela | Checksum POST | Checksum PRE | Status |
|---|---|---|---|
| areas | `1f40430c05954fcae4ca737bddc38539` | `1f40430c05954fcae4ca737bddc38539` | idêntico |
| products | `40fa32700e59f87773383c100a225907` | `40fa32700e59f87773383c100a225907` | idêntico |
| seasons | `981c3b936b8678c9255424694bf4ffa6` | `981c3b936b8678c9255424694bf4ffa6` | idêntico |
| operations | `b57c17c9f60ff02f2c059b5b4b682a3b` | `b57c17c9f60ff02f2c059b5b4b682a3b` | idêntico |
| product_lots | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | `cdc7b4f6b1cf23c0e71c7717bd0e7312` | idêntico |

**Todos os checksums idênticos. Nenhuma linha foi criada, alterada ou excluída.**

---

## 12. COMPARAÇÃO PRE/POST

| Métrica | PRE | POST | Status |
|---|---|---|---|
| auth.users | 6 | 6 | idêntico |
| user_profiles | 6 | 6 | idêntico |
| institutions | 6 | 6 | idêntico |
| areas | 44 | 44 | idêntico |
| operations | 309 | 309 | idêntico |
| products | 217 | 217 | idêntico |
| product_lots | 149 | 149 | idêntico |
| seasons | 5 | 5 | idêntico |
| machinery | 19 | 19 | idêntico |
| maintenances | 3 | 3 | idêntico |
| maintenance_types | 2 | 2 | idêntico |
| notes | 8 | 8 | idêntico |
| invitations | 7 | 7 | idêntico |
| SUM(quantity_in_stock) | 4.617.076,08... | 4.617.076,08... | idêntico |
| SUM(lots.quantity) | 185.382,000... | 185.382,000... | idêntico |
| products_used items | 1.459 | 1.459 | idêntico |
| invalid productIds | 501 | 501 | idêntico |
| checksum areas | 1f40430c... | 1f40430c... | idêntico |
| checksum products | 40fa3270... | 40fa3270... | idêntico |
| checksum seasons | 981c3b93... | 981c3b93... | idêntico |
| checksum operations | b57c17c9... | b57c17c9... | idêntico |
| checksum product_lots | cdc7b4f6... | cdc7b4f6... | idêntico |

---

## 13. ESTADO DAS 28 FKs

| ON DELETE | Quantidade |
|---|---|
| CASCADE | 20 |
| RESTRICT | 5 |
| SET NULL | 3 |
| **Total** | **28** |

**Status:** Inalterado. Nenhuma FK modificada.

---

## 14. NÚMERO DE POLICIES RLS

| Métrica | Valor |
|---|---|
| Total de policies no schema public | 49 |

**Status:** Inalterado. Nenhuma policy criada, alterada ou removida.

---

## 15. CONFIRMAÇÃO DAS OUTRAS FUNCTIONS

| Função | prosecdef | proconfig | Status |
|---|---|---|---|
| check_institution_exists | true | null | inalterada |
| clean_expired_invitations | true | null | inalterada |
| **copy_data_to_institution** | **true** | **search_path=public, pg_temp** | **MODIFICADA** |
| create_invitation | true | search_path=public | inalterada |
| delete_invitation | true | null | inalterada |
| handle_new_user | true | null | inalterada |
| handle_user_registration | true | search_path=public | inalterada |
| join_institution | true | search_path=public | inalterada |
| list_active_invitations | true | null | inalterada |
| list_institution_users | true | search_path=public, pg_temp | inalterada (proteção 1F-A preservada) |
| toggle_user_admin_status | true | null | inalterada |
| update_season_status | true | null | inalterada |
| validate_invitation | true | search_path=public | inalterada |

Apenas `copy_data_to_institution` foi modificada. `list_institution_users` mantém a proteção da Etapa 1F-A. Todas as outras 12 funções SECURITY DEFINER permanecem idênticas.

---

## 16. CONFIRMAÇÃO DO FRONTEND INALTERADO

**Nenhum arquivo frontend foi modificado.**

A auditoria 1F-B confirmou zero chamadas ativas de `copy_data_to_institution` no frontend. Como a função foi isolada (acesso apenas via service_role/postgres), e nenhum código frontend a chama, não há impacto no frontend.

---

## 17. ROLLBACK PREPARADO (NÃO EXECUTADO)

```sql
-- Rollback: restaurar definição original (sem search_path, tabelas não qualificadas)
CREATE OR REPLACE FUNCTION public.copy_data_to_institution(
  source_institution_id uuid, target_institution_id uuid
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

-- Rollback: restaurar grants originais
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.copy_data_to_institution(uuid, uuid) TO authenticated;
```

**Não executado.** A correção está funcionando corretamente.

---

## 18. DIVERGÊNCIAS

**Nenhuma divergência encontrada.**

- Assinatura preservada: `copy_data_to_institution(source_institution_id uuid, target_institution_id uuid) RETURNS void`
- Lógica interna preservada: mesmas tabelas, mesmos campos, mesmo comportamento
- search_path protegido: `public, pg_temp`
- Tabelas qualificadas: `public.areas`, `public.products`, `public.seasons`
- Grants: PUBLIC/anon/authenticated revogados, service_role/postgres mantidos
- Nenhum dado alterado (checksums idênticos)
- Nenhuma FK mudou (28 = 20 CASCADE + 5 RESTRICT + 3 SET NULL)
- Nenhuma policy RLS mudou (49)
- Nenhuma outra função mudou
- Frontend inalterado
- Função não foi executada

---

## RESUMO EXECUTIVO

A função `copy_data_to_institution` foi isolada com sucesso. Antes, qualquer pessoa na internet (incluindo usuários não autenticados) podia copiar áreas, produtos e safras entre quaisquer instituições, bypassando RLS via SECURITY DEFINER. Agora:

1. **PUBLIC, anon e authenticated** não podem mais executar a função — grants revogados
2. **service_role e postgres** mantêm EXECUTE para uso administrativo
3. **search_path** protegido contra injection (`public, pg_temp`)
4. **Tabelas qualificadas** explicitamente com `public.`
5. **Assinatura e lógica interna** idênticas — sem mudanças funcionais
6. **Nenhum dado** foi criado, alterado ou excluído (checksums idênticos)
7. **Função não foi executada** em momento algum
8. **Frontend** não precisou de alterações (zero chamadas existentes)

A auditoria 1F-B recomendou a OPÇÃO 2 (restringir a service_role/postgres), e esta etapa implementou exatamente essa recomendação.

**PARE.** Aguardo revisão externa. Não modificarei outras funções SECURITY DEFINER. Não alterarei RLS, FKs, ou frontend.
