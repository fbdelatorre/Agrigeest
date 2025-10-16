/*
  # Add products_used column to operations table

  1. Changes
    - Add `products_used` column to `operations` table with JSONB type
    - Column will store an array of product usage data
    - Default value is an empty JSON array
    - Column is nullable

  2. Security
    - Existing RLS policies will cover the new column
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'operations' 
    AND column_name = 'products_used'
  ) THEN
    ALTER TABLE operations 
    ADD COLUMN products_used JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;