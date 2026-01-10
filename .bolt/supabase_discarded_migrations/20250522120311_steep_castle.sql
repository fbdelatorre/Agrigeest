/*
  # Add operation_size column to operations table

  1. Changes
    - Add operation_size column to operations table
    - Column type: numeric (to store decimal values)
    - Nullable: false (required field)
    - Default: NULL (must be provided when creating operation)
    
  2. Notes
    - This column will store the actual area size used in the operation
    - Allows tracking partial area operations
*/

ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS operation_size numeric;

