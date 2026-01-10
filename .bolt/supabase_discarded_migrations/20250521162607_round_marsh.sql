/*
  # Fix column names in operations table
  
  1. Changes
    - Rename columns to use snake_case for consistency with PostgreSQL conventions:
      - "endDate" -> "end_date"
      - "areaId" -> "area_id"
      - "nextOperationDate" -> "next_operation_date"
      - "operatedBy" -> "operated_by"
    
  2. Notes
    - This ensures all column names follow PostgreSQL naming conventions
    - Makes the schema more consistent
*/

DO $$ 
BEGIN
  -- Rename endDate to end_date if it exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'endDate'
  ) THEN
    ALTER TABLE operations RENAME COLUMN "endDate" TO end_date;
  END IF;

  -- Rename areaId to area_id if it exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'areaId'
  ) THEN
    ALTER TABLE operations RENAME COLUMN "areaId" TO area_id;
  END IF;

  -- Rename nextOperationDate to next_operation_date if it exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'nextOperationDate'
  ) THEN
    ALTER TABLE operations RENAME COLUMN "nextOperationDate" TO next_operation_date;
  END IF;

  -- Rename operatedBy to operated_by if it exists
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'operatedBy'
  ) THEN
    ALTER TABLE operations RENAME COLUMN "operatedBy" TO operated_by;
  END IF;
END $$;