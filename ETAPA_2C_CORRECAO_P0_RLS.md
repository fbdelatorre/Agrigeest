# ETAPA 2C — CORREÇÃO P0 DE RLS

**Data:** 2026-10-07
**Migration:** fix_p0_rls_areas_and_isolate_operation_products

---

## 1. PRE CHECK: PASS

- areas: RLS ON, policy "Enable insert for authenticated users only" (PERMISSIVE, INSERT, WITH CHECK=true) existe, policy institucional existe
- operation_products: RLS OFF, count=0, 4 policies intactas
- grants: anon + authenticated com privilégios plenos
- Total policies: 49
- Counts: areas=44, operation_products=0

## 2. SQL EXECUTADO

```sql
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.areas;

REVOKE ALL PRIVILEGES ON TABLE public.operation_products FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.operation_products FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.operation_products FROM PUBLIC;
```

## 3. AREAS POST

- RLS enabled: **true**
- Policies INSERT restantes: 1 — "Users can create areas in their institution" (PERMISSIVE, WITH CHECK = institution_id IN (SELECT user_profiles.institution_id WHERE id = auth.uid()))
- Lógica efetiva: somente a policy institucional. Sem OR com true.
- Own institution insert: **SIM**
- Cross-institution insert: **NÃO**

## 4. OPERATION_PRODUCTS POST

- Count: **0**
- RLS enabled: **false** (intencional)
- Total policies: **4** (inalteradas)
- Grants POST:

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| PUBLIC | false | false | false | false |
| anon | false | false | false | false |
| authenticated | false | false | false | false |
| service_role | true | true | true | true (preservado) |
| postgres | true | true | true | true (preservado) |

## 5. POLICIES TOTAL

- PRE: 49
- POST: 48
- Diferença: -1 (DROP intencional da policy bypass de areas)

## 6. COUNTS

| Tabela | PRE | POST | Match |
|---|---|---|---|
| areas | 44 | 44 | SIM |
| operation_products | 0 | 0 | SIM |

## 7. FUNCTIONS/FKS/OUTRAS POLICIES INTACTAS

- FKs areas: areas_institution_id_fkey, areas_user_id_fkey — **SIM**
- FKs operation_products: operation_products_operation_id_fkey, operation_products_product_id_fkey — **SIM**
- FK operations_area_id_fkey — **SIM**
- 4 policies de operation_products inalteradas — **SIM**
- Nenhuma outra policy alterada — **SIM**

## 8. FRONTEND

- Arquivos alterados: **0**
- Build: **PASS** (exit 0)

## 9. DIVERGÊNCIAS

Nenhuma.

## 10. STATUS: PASS

STOP.
