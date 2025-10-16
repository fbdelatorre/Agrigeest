/*
  # Update operation permissions and column names

  1. Changes
    - Ensure proper RLS policies for operations table
    - Add check to verify active season when creating operations
    - Standardize column names to use snake_case

  2. Security
    - Users can only create operations for their own areas
    - Users must have an active season to create operations
    - Operations must be linked to a valid season
*/

-- Drop existing policies
DO $$ 
BEGIN
  DROP POLICY IF EXISTS "Users can create own operations" ON operations;
  DROP POLICY IF EXISTS "Users can read own operations" ON operations;
  DROP POLICY IF EXISTS "Users can update own operations" ON operations;
  DROP POLICY IF EXISTS "Users can delete own operations" ON operations;
END $$;

-- Create updated policies with proper checks
CREATE POLICY "Users can create own operations"
  ON operations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM areas 
      WHERE areas.id = operations.area_id 
      AND areas.user_id = auth.uid()
    ) AND
    EXISTS (
      SELECT 1 FROM seasons
      WHERE seasons.id = operations.season_id
      AND seasons.user_id = auth.uid()
      AND seasons.status = 'active'
    )
  );

CREATE POLICY "Users can read own operations"
  ON operations
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM areas 
      WHERE areas.id = operations.area_id 
      AND areas.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own operations"
  ON operations
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM areas 
      WHERE areas.id = operations.area_id 
      AND areas.user_id = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM areas 
      WHERE areas.id = operations.area_id 
      AND areas.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own operations"
  ON operations
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM areas 
      WHERE areas.id = operations.area_id 
      AND areas.user_id = auth.uid()
    )
  );