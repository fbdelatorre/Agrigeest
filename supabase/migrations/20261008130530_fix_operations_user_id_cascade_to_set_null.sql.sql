/*
# Fix P0: operations.user_id CASCADE → SET NULL

## Problem
The FK `operations_user_id_fkey` uses ON DELETE CASCADE. Deleting a user from
auth.users (via Supabase Dashboard or API) silently deletes ALL operations
created by that user — 309 historical records belonging to the institution,
not to the individual user.

## Fix
1. ALTER COLUMN user_id DROP NOT NULL (required for SET NULL to work)
2. DROP and re-create the FK with ON DELETE SET NULL

## What changes
- `operations.user_id` becomes nullable (uuid, no default, was NOT NULL)
- FK `operations_user_id_fkey` changes from CASCADE to SET NULL

## What does NOT change
- No data rows are modified, deleted, or inserted
- No other FK is touched
- No RLS policy is touched
- No RPC is touched
- New operations still get user_id = auth.uid() from the RPC

## Semantics
- When a user is deleted from auth.users, their operations remain
- `operations.user_id` becomes NULL for those rows
- The institution retains full historical data
- RLS is institutional (not user-scoped), so NULL user_id rows remain accessible

## Rollback (DO NOT execute)
- Only safe if NO user_id NULL values exist in operations
- ALTER TABLE operations ALTER COLUMN user_id SET NOT NULL;
- DROP CONSTRAINT and re-add with ON DELETE CASCADE
*/

-- Step 1: Allow NULL (currently NOT NULL)
ALTER TABLE public.operations ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Replace CASCADE with SET NULL
ALTER TABLE public.operations DROP CONSTRAINT operations_user_id_fkey;
ALTER TABLE public.operations ADD CONSTRAINT operations_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
