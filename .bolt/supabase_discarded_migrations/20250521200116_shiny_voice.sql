/*
  # Add name fields to user profiles

  1. Changes
    - Add first_name and last_name columns to user_profiles table
    - Make columns nullable initially to handle existing records
    - Add NOT NULL constraint after setting default values
    
  2. Notes
    - Handles existing records by setting default values
    - Maintains data integrity while adding required fields
*/

-- Add columns as nullable first
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text;

-- Set default values for existing records
UPDATE user_profiles
SET 
  first_name = COALESCE(first_name, 'User'),
  last_name = COALESCE(last_name, institution);

-- Now make the columns required
ALTER TABLE user_profiles
ALTER COLUMN first_name SET NOT NULL,
ALTER COLUMN last_name SET NOT NULL;