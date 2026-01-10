/*
  # Rename operations endDate column

  1. Changes
    - Rename column `endDate` to `end_date` in operations table to match frontend expectations
    
  2. Notes
    - Using DO block to safely check column existence before renaming
    - No data loss as this is just a column rename
*/

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'endDate'
  ) THEN
    ALTER TABLE operations RENAME COLUMN "endDate" TO end_date;
  END IF;
END $$;