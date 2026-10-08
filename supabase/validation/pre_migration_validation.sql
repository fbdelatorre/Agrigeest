-- ============================================================================
-- AGRIGEST — PRE-MIGRATION VALIDATION SCRIPT
-- ETAPA 0 — PROTEÇÃO PRÉ-MIGRAÇÃO — ZERO DATA LOSS
--
-- Este script contém SOMENTE consultas READ-ONLY.
-- Nenhum INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE, GRANT ou REVOKE.
--
-- Uso: executar antes E depois de cada migration para verificar integridade.
-- Comparar resultados com a BASELINE_PRE_MIGRATION_V1 documentada no relatório.
-- ============================================================================

-- ============================================================================
-- A. CONTAGEM DE TODAS AS TABELAS DE NEGÓCIO
-- ============================================================================
SELECT 'areas' as tabela, count(*) as contagem FROM areas
UNION ALL SELECT 'institutions', count(*) FROM institutions
UNION ALL SELECT 'invitations', count(*) FROM invitations
UNION ALL SELECT 'machinery', count(*) FROM machinery
UNION ALL SELECT 'maintenance_types', count(*) FROM maintenance_types
UNION ALL SELECT 'maintenances', count(*) FROM maintenances
UNION ALL SELECT 'notes', count(*) FROM notes
UNION ALL SELECT 'operation_products', count(*) FROM operation_products
UNION ALL SELECT 'operations', count(*) FROM operations
UNION ALL SELECT 'product_lots', count(*) FROM product_lots
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'seasons', count(*) FROM seasons
UNION ALL SELECT 'user_profiles', count(*) FROM user_profiles
ORDER BY tabela;

-- ============================================================================
-- B. CHECKSUMS DAS TABELAS CRÍTICAS (Método 1: MD5 de string_agg)
-- ============================================================================
SELECT 'areas' as tabela, md5(string_agg(areas::text, '' ORDER BY id)) as checksum_md5, count(*) as cnt FROM areas
UNION ALL SELECT 'institutions', md5(string_agg(institutions::text, '' ORDER BY id)), count(*) FROM institutions
UNION ALL SELECT 'invitations', md5(string_agg(invitations::text, '' ORDER BY id)), count(*) FROM invitations
UNION ALL SELECT 'machinery', md5(string_agg(machinery::text, '' ORDER BY id)), count(*) FROM machinery
UNION ALL SELECT 'maintenance_types', md5(string_agg(maintenance_types::text, '' ORDER BY id)), count(*) FROM maintenance_types
UNION ALL SELECT 'maintenances', md5(string_agg(maintenances::text, '' ORDER BY id)), count(*) FROM maintenances
UNION ALL SELECT 'notes', md5(string_agg(notes::text, '' ORDER BY id)), count(*) FROM notes
UNION ALL SELECT 'operations', md5(string_agg(operations::text, '' ORDER BY id)), count(*) FROM operations
UNION ALL SELECT 'product_lots', md5(string_agg(product_lots::text, '' ORDER BY id)), count(*) FROM product_lots
UNION ALL SELECT 'products', md5(string_agg(products::text, '' ORDER BY id)), count(*) FROM products
UNION ALL SELECT 'seasons', md5(string_agg(seasons::text, '' ORDER BY id)), count(*) FROM seasons
UNION ALL SELECT 'user_profiles', md5(string_agg(user_profiles::text, '' ORDER BY id)), count(*) FROM user_profiles
ORDER BY tabela;

-- ============================================================================
-- B2. CHECKSUMS ROBUSTOS (Método 2: somatórios numéricos)
-- ============================================================================
SELECT 'products_stock_sum' as metric, SUM(quantity_in_stock)::numeric(20,4) as valor FROM products
UNION ALL SELECT 'products_count', count(*)::numeric FROM products
UNION ALL SELECT 'product_lots_qty_sum', SUM(quantity)::numeric(20,4) FROM product_lots
UNION ALL SELECT 'product_lots_count', count(*)::numeric FROM product_lots
UNION ALL SELECT 'operations_count', count(*)::numeric FROM operations
UNION ALL SELECT 'areas_size_sum', SUM(size)::numeric(20,4) FROM areas
UNION ALL SELECT 'areas_count', count(*)::numeric FROM areas
UNION ALL SELECT 'seasons_count', count(*)::numeric FROM seasons
UNION ALL SELECT 'machinery_count', count(*)::numeric FROM machinery
UNION ALL SELECT 'maintenances_count', count(*)::numeric FROM maintenances
UNION ALL SELECT 'notes_count', count(*)::numeric FROM notes
UNION ALL SELECT 'institutions_count', count(*)::numeric FROM institutions
UNION ALL SELECT 'invitations_count', count(*)::numeric FROM invitations
UNION ALL SELECT 'user_profiles_count', count(*)::numeric FROM user_profiles;

-- ============================================================================
-- C. ÓRFÃOS (INTEGRIDADE REFERENCIAL)
-- ============================================================================
SELECT 'areas_sem_institution' as verificacao, count(*) as orfaos FROM areas a LEFT JOIN institutions i ON a.institution_id = i.id WHERE a.institution_id IS NOT NULL AND i.id IS NULL
UNION ALL SELECT 'invitations_sem_institution', count(*) FROM invitations inv LEFT JOIN institutions i ON inv.institution_id = i.id WHERE i.id IS NULL
UNION ALL SELECT 'machinery_sem_institution', count(*) FROM machinery m LEFT JOIN institutions i ON m.institution_id = i.id WHERE i.id IS NULL
UNION ALL SELECT 'maintenance_types_sem_institution', count(*) FROM maintenance_types mt LEFT JOIN institutions i ON mt.institution_id = i.id WHERE i.id IS NULL
UNION ALL SELECT 'maintenances_sem_machinery', count(*) FROM maintenances m LEFT JOIN machinery mac ON m.machinery_id = mac.id WHERE mac.id IS NULL
UNION ALL SELECT 'maintenances_sem_maintenance_type', count(*) FROM maintenances m LEFT JOIN maintenance_types mt ON m.maintenance_type_id = mt.id WHERE mt.id IS NULL
UNION ALL SELECT 'notes_sem_institution', count(*) FROM notes n LEFT JOIN institutions i ON n.institution_id = i.id WHERE i.id IS NULL
UNION ALL SELECT 'operations_sem_area', count(*) FROM operations o LEFT JOIN areas a ON o.area_id = a.id WHERE a.id IS NULL
UNION ALL SELECT 'operations_sem_season', count(*) FROM operations o LEFT JOIN seasons s ON o.season_id = s.id WHERE o.season_id IS NOT NULL AND s.id IS NULL
UNION ALL SELECT 'operations_sem_institution', count(*) FROM operations o LEFT JOIN institutions i ON o.institution_id = i.id WHERE o.institution_id IS NOT NULL AND i.id IS NULL
UNION ALL SELECT 'product_lots_sem_product', count(*) FROM product_lots pl LEFT JOIN products p ON pl.product_id = p.id WHERE p.id IS NULL
UNION ALL SELECT 'products_sem_institution', count(*) FROM products p LEFT JOIN institutions i ON p.institution_id = i.id WHERE p.institution_id IS NOT NULL AND i.id IS NULL
UNION ALL SELECT 'seasons_sem_institution', count(*) FROM seasons s LEFT JOIN institutions i ON s.institution_id = i.id WHERE s.institution_id IS NOT NULL AND i.id IS NULL
UNION ALL SELECT 'user_profiles_sem_institution', count(*) FROM user_profiles up LEFT JOIN institutions i ON up.institution_id = i.id WHERE up.institution_id IS NOT NULL AND i.id IS NULL;

-- ============================================================================
-- D. NULLs CRÍTICOS
-- ============================================================================
SELECT 'areas.name' as campo, count(*) as nulls FROM areas WHERE name IS NULL
UNION ALL SELECT 'areas.size', count(*) FROM areas WHERE size IS NULL
UNION ALL SELECT 'areas.institution_id', count(*) FROM areas WHERE institution_id IS NULL
UNION ALL SELECT 'operations.area_id', count(*) FROM operations WHERE area_id IS NULL
UNION ALL SELECT 'operations.type', count(*) FROM operations WHERE type IS NULL
UNION ALL SELECT 'operations.start_date', count(*) FROM operations WHERE start_date IS NULL
UNION ALL SELECT 'operations.description', count(*) FROM operations WHERE description IS NULL
UNION ALL SELECT 'products.name', count(*) FROM products WHERE name IS NULL
UNION ALL SELECT 'products.quantity_in_stock', count(*) FROM products WHERE quantity_in_stock IS NULL
UNION ALL SELECT 'product_lots.product_id', count(*) FROM product_lots WHERE product_id IS NULL
UNION ALL SELECT 'product_lots.quantity', count(*) FROM product_lots WHERE quantity IS NULL
UNION ALL SELECT 'seasons.name', count(*) FROM seasons WHERE name IS NULL
UNION ALL SELECT 'user_profiles.first_name', count(*) FROM user_profiles WHERE first_name IS NULL
UNION ALL SELECT 'user_profiles.last_name', count(*) FROM user_profiles WHERE last_name IS NULL
UNION ALL SELECT 'user_profiles.institution_id', count(*) FROM user_profiles WHERE institution_id IS NULL;

-- ============================================================================
-- E. QUANTIDADE DE OPERATIONS
-- ============================================================================
SELECT count(*) as total_operations FROM operations;

-- ============================================================================
-- F. QUANTIDADE TOTAL DE ITENS EM operations.products_used
-- ============================================================================
SELECT SUM(jsonb_array_length(products_used)) as total_items_in_products_used FROM operations WHERE products_used IS NOT NULL;

-- ============================================================================
-- G. QUANTIDADE DE productIds INVÁLIDOS EM products_used
-- ============================================================================
SELECT count(*) as invalid_product_ids
FROM operations, jsonb_array_elements(operations.products_used) as pu
WHERE (pu->>'productId')::uuid NOT IN (SELECT id FROM products);

-- ============================================================================
-- H. QUANTIDADE DE PRODUTOS
-- ============================================================================
SELECT count(*) as total_products FROM products;

-- ============================================================================
-- I. QUANTIDADE DE PRODUCT_LOTS
-- ============================================================================
SELECT count(*) as total_product_lots FROM product_lots;

-- ============================================================================
-- J. PRODUTOS COM STOCK MAS SEM LOTES
-- ============================================================================
SELECT count(*) as products_with_stock_no_lots
FROM products p
WHERE p.quantity_in_stock > 0
AND NOT EXISTS (SELECT 1 FROM product_lots pl WHERE pl.product_id = p.id);

-- ============================================================================
-- K. DIVERGÊNCIA products.quantity_in_stock vs SUM(product_lots.quantity)
-- ============================================================================
SELECT 
  count(*) FILTER (WHERE p.quantity_in_stock != COALESCE(lots.sum_qty, 0)) as divergent_count,
  count(*) as total_products,
  SUM(ABS(p.quantity_in_stock - COALESCE(lots.sum_qty, 0))) as total_absolute_divergence
FROM products p
LEFT JOIN (SELECT product_id, SUM(quantity) as sum_qty FROM product_lots GROUP BY product_id) lots ON lots.product_id = p.id;

-- ============================================================================
-- L. ÁREAS COM E SEM GEOMETRY
-- ============================================================================
SELECT 
  count(*) as total_areas,
  count(*) FILTER (WHERE geometry IS NOT NULL) as with_geometry,
  count(*) FILTER (WHERE geometry IS NULL) as without_geometry
FROM areas;

-- ============================================================================
-- M. RLS HABILITADO/DESABILITADO
-- ============================================================================
SELECT relname as tabela, relrowsecurity as rls_enabled
FROM pg_class
WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
ORDER BY relname;

-- ============================================================================
-- N. NÚMERO DE POLICIES
-- ============================================================================
SELECT count(*) as total_policies FROM pg_policies WHERE schemaname = 'public';

-- ============================================================================
-- O. NÚMERO DE FUNCTIONS (schema public)
-- ============================================================================
SELECT count(*) as total_functions
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';

-- ============================================================================
-- P. NÚMERO DE TRIGGERS
-- ============================================================================
SELECT count(*) as total_triggers
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal;

-- ============================================================================
-- Q. FOREIGN KEYS E ON DELETE
-- ============================================================================
SELECT
  conname as constraint_name,
  conrelid::regclass as table_name,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace AND contype = 'f'
ORDER BY conrelid::regclass::text, conname;

-- ============================================================================
-- R. EXTENSÕES INSTALADAS
-- ============================================================================
SELECT extname as name, extversion as version, nspname as schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
ORDER BY extname;

-- ============================================================================
-- EXTRA 1: AUTH USERS COUNT
-- ============================================================================
SELECT count(*) as auth_users_count FROM auth.users;

-- ============================================================================
-- EXTRA 2: STORAGE BUCKETS
-- ============================================================================
SELECT id, name, public as is_public, created_at FROM storage.buckets ORDER BY name;

-- ============================================================================
-- EXTRA 3: SNAPSHOTS DE TIMESTAMPS (para detectar modificações)
-- ============================================================================
SELECT 'areas' as tabela, min(created_at)::text as min_created, max(created_at)::text as max_created, min(updated_at)::text as min_updated, max(updated_at)::text as max_updated FROM areas
UNION ALL SELECT 'institutions', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM institutions
UNION ALL SELECT 'invitations', min(created_at)::text, max(created_at)::text, NULL, NULL FROM invitations
UNION ALL SELECT 'machinery', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM machinery
UNION ALL SELECT 'maintenance_types', min(created_at)::text, max(created_at)::text, NULL, NULL FROM maintenance_types
UNION ALL SELECT 'maintenances', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM maintenances
UNION ALL SELECT 'notes', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM notes
UNION ALL SELECT 'operations', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM operations
UNION ALL SELECT 'product_lots', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM product_lots
UNION ALL SELECT 'products', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM products
UNION ALL SELECT 'seasons', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM seasons
UNION ALL SELECT 'user_profiles', min(created_at)::text, max(created_at)::text, min(updated_at)::text, max(updated_at)::text FROM user_profiles;

-- ============================================================================
-- EXTRA 4: PRODUCTS COM STOCK NEGATIVO
-- ============================================================================
SELECT count(*) as products_negative_stock FROM products WHERE quantity_in_stock < 0;

-- ============================================================================
-- EXTRA 5: SOMATÓRIO DE ÁREAS POR UNIDADE (não misturar unidades)
-- ============================================================================
SELECT unit, count(*) as area_count, SUM(size)::numeric(20,4) as total_size
FROM areas
GROUP BY unit
ORDER BY unit;

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
