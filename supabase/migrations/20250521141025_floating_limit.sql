/*
  # Fix area_id column name in operations table
  
  1. Changes
    - Rename `area_id` column to `areaId` in operations table to match application expectations
    
  2. Security
    - No changes to RLS policies needed
    - Foreign key constraint will be preserved
*/

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'area_id'
  ) THEN
    ALTER TABLE operations RENAME COLUMN area_id TO "areaId";
  END IF;
END $$;