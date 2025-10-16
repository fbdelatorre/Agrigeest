/*
  # Add next_operation_date to operations table

  1. Changes
    - Add `next_operation_date` column to operations table
    - Column type: timestamptz (timestamp with timezone)
    - Nullable: true (some operations may not have a next date)

  2. Notes
    - Using snake_case for column name to match PostgreSQL conventions
    - No need to modify RLS policies as they are already set up for the table
*/

-- Add next_operation_date column to operations table
ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS next_operation_date timestamptz;