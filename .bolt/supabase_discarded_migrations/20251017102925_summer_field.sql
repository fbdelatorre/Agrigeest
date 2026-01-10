/*
  # Create seasons table

  1. New Tables
    - `seasons`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `start_date` (date, not null)
      - `end_date` (date, nullable)
      - `status` (text, default 'active')
      - `description` (text, nullable)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
      - `user_id` (uuid, foreign key to users)
      - `institution_id` (uuid, foreign key to institutions)

  2. Security
    - Enable RLS on `seasons` table
    - Add policies for users to manage seasons in their institution

  3. Indexes
    - Add index on institution_id for performance
    - Add index on status for filtering active seasons
*/

CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status text DEFAULT 'active' NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL,
  institution_id uuid NOT NULL
);

ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

-- Add foreign key constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'seasons_user_id_fkey'
  ) THEN
    ALTER TABLE seasons ADD CONSTRAINT seasons_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'seasons_institution_id_fkey'
  ) THEN
    ALTER TABLE seasons ADD CONSTRAINT seasons_institution_id_fkey 
    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_seasons_institution_id ON seasons(institution_id);
CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_seasons_start_date ON seasons(start_date);

-- Add updated_at trigger
CREATE TRIGGER update_seasons_updated_at
  BEFORE UPDATE ON seasons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
CREATE POLICY "Users can create seasons in their institution"
  ON seasons
  FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT user_profiles.institution_id
      FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can read seasons from their institution"
  ON seasons
  FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT user_profiles.institution_id
      FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can update seasons in their institution"
  ON seasons
  FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT user_profiles.institution_id
      FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT user_profiles.institution_id
      FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );

CREATE POLICY "Users can delete seasons in their institution"
  ON seasons
  FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT user_profiles.institution_id
      FROM user_profiles
      WHERE user_profiles.id = auth.uid()
    )
  );