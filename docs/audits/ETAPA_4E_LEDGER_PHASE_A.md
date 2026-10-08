# ETAPA 4E — LEDGER FASE A — INFRAESTRUTURA VAZIA

**Timestamp:** 2026-10-08 17:16:21 UTC (PRE) / 2026-10-08 17:18:00 UTC (POST)
**Migration:** `create_inventory_ledger_schema_phase_a`
**Status:** PASS

---

## A. Timestamp

- PRE snapshot: 2026-10-08 17:16:21.382782+00
- Migration applied: 2026-10-08 ~17:17 UTC
- POST validation: 2026-10-08 ~17:18 UTC
- Build: 2026-10-08 ~17:19 UTC

---

## B. Migration criada/aplicada

**Migration:** `create_inventory_ledger_schema_phase_a`

Conteúdo:
1. CREATE TABLE `institution_ledger_config` (vazia)
2. CREATE TABLE `inventory_movements` (vazia)
3. 6 CHECK constraints nomeadas
4. 1 UNIQUE constraint (idempotency)
5. 8 índices (+ PK index + unique index = 10 total)
6. RLS enabled em ambas as tabelas
7. 2 policies SELECT (uma por tabela, scoped por institution_id via user_profiles)
8. REVOKE INSERT, UPDATE, DELETE de authenticated/anon em ambas
9. REVOKE TRUNCATE, TRIGGER de authenticated/anon em ambas (hardening adicional)

Nenhum DML em tabelas existentes. Nenhuma RPC criada ou alterada. Nenhum dado de negócio modificado.

---

## C. PRE snapshot

| Métrica | Valor PRE |
|---|---|
| timestamp | 2026-10-08 17:16:21.382782+00 |
| products_count | 219 |
| product_lots_count | 171 |
| operations_count | 309 |
| operation_products_count | 0 |
| sum_quantity_in_stock | 4,638,907.93 |
| sum_product_lots_quantity | 213,560 |
| products_negative_stock | 0 |
| lots_negative_qty | 0 |
| products_lots_exceed_stock | 0 |
| duplicate_lot_numbers | 0 |
| orphan_lotId | 0 |
| orphan_productId | 501 |
| rls_policies_count | 48 |
| security_definer_count | 25 |
| fk_cascade | 28 |
| fk_restrict | 13 |
| fk_set_null | 12 |
| fk_set_default | 0 |
| fk_no_action | 4 |
| fk_total | 57 |
| products_checksum | a09a9f3c1b6ecfdc04d895dc1b037168 |
| product_lots_checksum | 65901aae132e675f782a8ca3afba3bb5 |
| operations_checksum | b3c7fc871857fd831a009e52c3bd6185 |

---

## D. Schema institution_ledger_config

| Coluna | Tipo | Nullable | Default | FK | ON DELETE |
|---|---|---|---|---|---|
| institution_id | uuid | NO (PK) | — | institutions(id) | RESTRICT |
| ledger_started_at | timestamptz | YES | — | — | — |
| opening_balance_complete | boolean | NO | false | — | — |
| created_at | timestamptz | NO | now() | — | — |
| updated_at | timestamptz | NO | now() | — | — |

**Row count:** 0

---

## E. Schema inventory_movements

| # | Coluna | Tipo | Nullable | Default | FK | ON DELETE |
|---|---|---|---|---|---|---|
| 1 | id | uuid | NO (PK) | gen_random_uuid() | — | — |
| 2 | institution_id | uuid | NO | — | institutions(id) | RESTRICT |
| 3 | product_id | uuid | NO | — | products(id) | RESTRICT |
| 4 | lot_id | uuid | YES | — | product_lots(id) | RESTRICT |
| 5 | lot_number_snapshot | text | YES | — | — | — |
| 6 | operation_id | uuid | YES | — | operations(id) | SET NULL |
| 7 | movement_group_id | uuid | NO | gen_random_uuid() | — | — |
| 8 | movement_kind | text | NO | — | — | — |
| 9 | movement_type | text | NO | — | — | — |
| 10 | quantity | numeric | NO | — | — | — |
| 11 | unit_snapshot | text | NO | — | — | — |
| 12 | unit_cost | numeric | YES | — | — | — |
| 13 | total_cost | numeric | YES | — | — | — |
| 14 | reason | text | YES | — | — | — |
| 15 | notes | text | YES | — | — | — |
| 16 | source_type | text | NO | 'manual' | — | — |
| 17 | reversal_of | uuid | YES | — | inventory_movements(id) | SET NULL |
| 18 | idempotency_key | text | NO | — | — | — |
| 19 | created_by | uuid | YES | — | auth.users(id) | SET NULL |
| 20 | created_at | timestamptz | NO | now() | — | — |
| 21 | effective_at | timestamptz | NO | now() | — | — |

**Row count:** 0

---

## F. FKs (novas)

### inventory_movements FKs

| Constraint | Ref table | ON DELETE |
|---|---|---|
| inventory_movements_institution_id_fkey | institutions | RESTRICT |
| inventory_movements_product_id_fkey | products | RESTRICT |
| inventory_movements_lot_id_fkey | product_lots | RESTRICT |
| inventory_movements_operation_id_fkey | operations | SET NULL |
| inventory_movements_reversal_of_fkey | inventory_movements | SET NULL |
| inventory_movements_created_by_fkey | auth.users | SET NULL |

### institution_ledger_config FKs

| Constraint | Ref table | ON DELETE |
|---|---|---|
| institution_ledger_config_institution_id_fkey | institutions | RESTRICT |

**Total novas FKs:** 7

---

## G. Constraints

| Constraint name | Type | Definition |
|---|---|---|
| ck_im_quantity_not_zero | CHECK | quantity <> 0 |
| ck_im_movement_kind | CHECK | movement_kind IN ('PHYSICAL', 'CLASSIFICATION') |
| ck_im_movement_type | CHECK | movement_type IN ('OPENING_BALANCE', 'STOCK_IN', 'OPERATION_CONSUMPTION', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL', 'LOT_CLASSIFICATION') |
| ck_im_source_type | CHECK | source_type IN ('operation', 'opening_balance', 'manual', 'receipt') |
| ck_im_adjustment_reason | CHECK | movement_type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') OR reason IS NOT NULL |
| ck_im_reversal_type | CHECK | reversal_of IS NULL OR movement_type = 'REVERSAL' |
| uq_inventory_movements_idempotency | UNIQUE | (institution_id, idempotency_key) |
| inventory_movements_pkey | PK | (id) |
| institution_ledger_config_pkey | PK | (institution_id) |

---

## H. Índices

| Index name | Columns | Partial |
|---|---|---|
| inventory_movements_pkey | (id) | — |
| uq_inventory_movements_idempotency | (institution_id, idempotency_key) | — |
| idx_im_product_effective | (product_id, effective_at) | — |
| idx_im_lot_effective | (lot_id, effective_at) | WHERE lot_id IS NOT NULL |
| idx_im_institution_created | (institution_id, created_at) | — |
| idx_im_operation | (operation_id) | WHERE operation_id IS NOT NULL |
| idx_im_group | (movement_group_id) | — |
| idx_im_type | (movement_type) | — |
| idx_im_reversal | (reversal_of) | WHERE reversal_of IS NOT NULL |
| idx_im_product_lot | (product_id, lot_id) | — |

**Total:** 10 indexes (1 PK + 1 UNIQUE + 8 regular)

---

## I. RLS

### inventory_movements

- RLS: **enabled**
- Policy: `select_own_inventory_movements` — SELECT TO authenticated USING (institution_id = user's institution_id via user_profiles)
- No INSERT/UPDATE/DELETE policies (mutations blocked)

### institution_ledger_config

- RLS: **enabled**
- Policy: `select_own_ledger_config` — SELECT TO authenticated USING (institution_id = user's institution_id via user_profiles)
- No INSERT/UPDATE/DELETE policies (mutations blocked)

**anon:** no policies on either table. anon has no access via RLS.

---

## J. Grants

### inventory_movements — effective grants

| Role | Privileges |
|---|---|
| authenticated | SELECT, REFERENCES |
| anon | SELECT, REFERENCES |
| service_role | all (implicit) |
| postgres | all (implicit) |

**INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER: REVOKED from authenticated and anon.**

### institution_ledger_config — effective grants

| Role | Privileges |
|---|---|
| authenticated | SELECT, REFERENCES |
| anon | SELECT, REFERENCES |
| service_role | all (implicit) |
| postgres | all (implicit) |

**INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER: REVOKED from authenticated and anon.**

### Nota sobre REFERENCES

A privilege `REFERENCES` é concedida por padrão e permite criar FKs apontando para a tabela. Não permite leitura/escrita de dados. É inofensiva para o modelo append-only pois não permite mutação de linhas.

### Hardening adicional

Após a migration, `TRUNCATE` e `TRIGGER` foram revogados de authenticated/anon em ambas as tabelas. Embora TRUNCATE não seja tão perigoso quanto DELETE (não tem policy), revogar como defense-in-depth garante que nem mesmo superuser-escalated roles possam truncar via authenticated.

---

## K. inventory_movements row count

**0** — confirmado.

---

## L. institution_ledger_config row count

**0** — confirmado.

---

## M. PRE vs POST business data

| Métrica | PRE | POST | Diferença |
|---|---|---|---|
| products_count | 219 | 219 | 0 ✓ |
| product_lots_count | 171 | 171 | 0 ✓ |
| operations_count | 309 | 309 | 0 ✓ |
| operation_products_count | 0 | 0 | 0 ✓ |
| sum_quantity_in_stock | 4,638,907.93 | 4,638,907.93 | 0 ✓ |
| sum_product_lots_quantity | 213,560 | 213,560 | 0 ✓ |
| products_checksum | a09a9f3c1b6ecfdc04d895dc1b037168 | a09a9f3c1b6ecfdc04d895dc1b037168 | idêntico ✓ |
| product_lots_checksum | 65901aae132e675f782a8ca3afba3bb5 | 65901aae132e675f782a8ca3afba3bb5 | idêntico ✓ |
| operations_checksum | b3c7fc871857fd831a009e52c3bd6185 | b3c7fc871857fd831a009e52c3bd6185 | idêntico ✓ |

**Nenhuma linha de negócio foi modificada.** Checksums MD5 idênticos em products, product_lots e operations.

---

## N. RLS count PRE/POST

| Métrica | PRE | POST | Diferença |
|---|---|---|---|
| rls_policies_count | 48 | 50 | +2 (uma policy SELECT por tabela nova) ✓ |

---

## O. SECURITY DEFINER PRE/POST

| Métrica | PRE | POST | Diferença |
|---|---|---|---|
| security_definer_count | 25 | 25 | 0 ✓ |

Nenhuma nova RPC criada. Nenhuma RPC existente alterada.

---

## P. FK distribution PRE/POST

| Tipo | PRE | POST | Diferença |
|---|---|---|---|
| CASCADE | 28 | 28 | 0 |
| RESTRICT | 13 | 17 | +4 (3 em inventory_movements + 1 em institution_ledger_config) |
| SET NULL | 12 | 15 | +3 (3 em inventory_movements) |
| SET DEFAULT | 0 | 0 | 0 |
| NO ACTION | 4 | 4 | 0 |
| **Total** | **57** | **64** | **+7** |

**+7 FKs novas** correspondem exatamente às 7 FKs das duas tabelas novas:
- 3 RESTRICT em inventory_movements (institutions, products, product_lots)
- 1 RESTRICT em institution_ledger_config (institutions)
- 3 SET NULL em inventory_movements (operations, inventory_movements self-ref, auth.users)

Nenhuma FK existente foi alterada ou removida.

---

## Q. Build result

```
npm run build
```

- **Exit code:** 0
- **Build time:** 31.36s
- **Modules transformed:** 2096
- **Warnings:** chunk size (2.13 MB) — não afeta funcionalidade
- **Result:** PASS

Nenhum arquivo frontend foi alterado. Build passou sem alterações.

---

## R. Divergências

Nenhuma divergência identificada. Todas as condições de PASS foram atendidas:

1. ✅ Duas tabelas criadas corretamente
2. ✅ inventory_movements = 0 rows
3. ✅ institution_ledger_config = 0 rows
4. ✅ Nenhum dado de negócio alterado (checksums idênticos)
5. ✅ Nenhum saldo alterado
6. ✅ Nenhuma RPC existente alterada (SECURITY DEFINER count = 25)
7. ✅ RLS correto (2 policies SELECT, sem mutation policies)
8. ✅ authenticated sem mutation direta no ledger (apenas SELECT + REFERENCES)
9. ✅ anon sem mutation direta (apenas SELECT + REFERENCES, sem policies RLS)
10. ✅ SECURITY DEFINER count inalterado
11. ✅ Build PASS

---

## S. STATUS

**PASS**

A infraestrutura do ledger foi criada com sucesso. Duas tabelas vazias (`inventory_movements` e `institution_ledger_config`) foram adicionadas ao schema, com constraints, índices, RLS e grants configurados. Nenhum dado de negócio foi alterado. Nenhuma RPC existente foi modificada. O build do projeto passou. O ledger está pronto para as próximas fases (opening balance, dual-write, UI) — que não foram iniciadas.
