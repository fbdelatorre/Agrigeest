/*
  # Make location field optional in areas table

  1. Changes
    - Modify `location` column in `areas` table to be nullable
    - Update existing records with NULL location if empty
    
  2. Security
    - No changes to RLS policies needed
*/

ALTER TABLE areas ALTER COLUMN location DROP NOT NULL;