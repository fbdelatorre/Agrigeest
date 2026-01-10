/*
  # Add seasons functionality
  
  1. New Tables
    - `seasons`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `start_date` (timestamptz, not null)
      - `end_date` (timestamptz)
      - `status` (text, not null) - 'active', 'completed', 'planned'
      - `description` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `user_id` (uuid, references auth.users)

  2. Changes
    - Add `season_id` to operations table
    - Update RLS policies
*/

-- Create seasons table
CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  status text NOT NULL DEFAULT 'active',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE
);

-- Enable RLS on seasons
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

-- Create policies for seasons
CREATE POLICY "Users can read own seasons"
  ON seasons
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own seasons"
  ON seasons
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own seasons"
  ON seasons
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own seasons"
  ON seasons
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add season_id to operations
ALTER TABLE operations 
ADD COLUMN season_id uuid REFERENCES seasons(id) ON DELETE CASCADE;

-- Create trigger for seasons updated_at
CREATE TRIGGER update_seasons_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create function to copy areas to new season
CREATE OR REPLACE FUNCTION copy_areas_to_new_season(
  old_season_id uuid,
  new_season_id uuid
) RETURNS void AS $$
BEGIN
  -- Get all areas from operations in the old season
  INSERT INTO areas (
    name,
    size,
    unit,
    location,
    description,
    user_id
  )
  SELECT DISTINCT ON (a.id)
    a.name,
    a.size,
    a.unit,
    a.location,
    a.description,
    a.user_id
  FROM areas a
  INNER JOIN operations o ON o.area_id = a.id
  WHERE o.season_id = old_season_id;
END;
$$ LANGUAGE plpgsql;