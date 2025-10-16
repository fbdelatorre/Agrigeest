/*
  # Add cultivar field to areas table

  1. Changes
    - Add `cultivar` column to areas table
    - Make it nullable since not all areas may have a cultivar planted
    
  2. Notes
    - This complements the existing current_crop field
    - Allows tracking both the crop type and specific cultivar
*/

ALTER TABLE areas 
ADD COLUMN IF NOT EXISTS cultivar text;