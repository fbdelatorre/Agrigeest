/*
# Restrict user_profiles UPDATE to self-editable columns only

## Purpose
Eliminates P0-1 and P0-2 from ETAPA 2D/2E audit:
- P0-1: authenticated users could directly alter their own institution_id
- P0-2: authenticated users could directly alter their own is_admin (self-elevation)

## Strategy
Column-level UPDATE privileges (Strategy A from 2E):
1. REVOKE table-level UPDATE from anon and authenticated
2. GRANT UPDATE only on the 4 self-editable columns to authenticated:
   first_name, last_name, phone, role

## What does NOT change
- RLS policies (unchanged — auth.uid() = id still controls which rows)
- SECURITY DEFINER functions (run as postgres, bypass column-level grants)
- SELECT, INSERT, DELETE privileges (unchanged)
- postgres and service_role privileges (unchanged)
- No schema changes, no data changes, no frontend changes

## Security impact
- institution_id: BLOCKED for direct UPDATE by authenticated
- is_admin: BLOCKED for direct UPDATE by authenticated
- id, email, institution, created_at, updated_at: BLOCKED for direct UPDATE
- first_name, last_name, phone, role: PERMITTED (still subject to RLS auth.uid() = id)
- anon: UPDATE fully revoked (was incorrectly granted)
- handle_new_user, handle_user_registration, join_institution, toggle_user_admin_status:
  all run as SECURITY DEFINER (owner postgres), unaffected by column-level grants
*/

-- Step 1: Revoke table-level UPDATE from anon and authenticated
REVOKE UPDATE ON TABLE public.user_profiles FROM anon;
REVOKE UPDATE ON TABLE public.user_profiles FROM authenticated;

-- Step 2: Grant UPDATE only on self-editable columns to authenticated
GRANT UPDATE (first_name, last_name, phone, role) ON public.user_profiles TO authenticated;
