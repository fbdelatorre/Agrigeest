/*
  # Add current_crop column to areas table

  1. Changes
    - Add current_crop column to areas table if it doesn't exist
    - Make it nullable since not all areas may have a current crop

  2. Security
    - No changes to security policies needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'areas' AND column_name = 'current_crop'
  ) THEN
    ALTER TABLE areas ADD COLUMN current_crop text;
  END IF;
END $$;