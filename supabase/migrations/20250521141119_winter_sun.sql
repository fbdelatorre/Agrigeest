/*
  # Rename operations end_date column

  1. Changes
    - Rename `end_date` column to `endDate` in operations table to match frontend naming convention
    
  2. Notes
    - This change aligns the database schema with the frontend's camelCase naming convention
    - No data will be lost during this rename operation
*/

DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'end_date'
  ) THEN
    ALTER TABLE operations RENAME COLUMN end_date TO "endDate";
  END IF;
END $$;