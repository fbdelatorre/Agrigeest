-- ETAPA 2C: Fix P0 RLS vulnerabilities
-- 1. Drop permissive bypass policy on areas INSERT
-- 2. Revoke API access on operation_products (empty, unused, RLS stays OFF intentionally)

-- ============================================================
-- 1. AREAS: Remove INSERT bypass policy
-- ============================================================
-- The policy "Enable insert for authenticated users only" has WITH CHECK = true,
-- which when OR-combined with the institutional INSERT policy makes the effective
-- check always true, allowing cross-institution inserts.
-- The institutional policy "Users can create areas in their institution" remains
-- and correctly validates institution_id against the authenticated user's profile.

DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.areas;

-- ============================================================
-- 2. OPERATION_PRODUCTS: Revoke API access
-- ============================================================
-- Table is empty (0 rows), has zero frontend callers, and products history
-- is stored in operations.products_used JSONB.
-- Existing 4 policies use ownership model (user_id) which is incompatible
-- with the institutional sharing model. RLS remains OFF intentionally.
-- Revoking privileges from anon/authenticated/PUBLIC blocks all API access
-- while preserving postgres and service_role administrative access.

REVOKE ALL PRIVILEGES ON TABLE public.operation_products FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.operation_products FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.operation_products FROM PUBLIC;
