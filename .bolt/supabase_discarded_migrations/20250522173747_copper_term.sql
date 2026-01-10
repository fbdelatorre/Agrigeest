/*
  # Add yield and seeding rate fields to operations table

  1. Changes
    - Add yield_per_hectare column for harvest operations
    - Add seeds_per_hectare column for planting operations
    - Both columns are numeric and nullable
    
  2. Notes
    - yield_per_hectare stores yield in kg/ha
    - seeds_per_hectare stores population in seeds/ha
    - No changes to RLS policies needed
*/

ALTER TABLE operations 
ADD COLUMN IF NOT EXISTS yield_per_hectare numeric,
ADD COLUMN IF NOT EXISTS seeds_per_hectare numeric;