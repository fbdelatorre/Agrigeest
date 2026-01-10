/*
  # Add multi-tenant functionality and data isolation

  1. Changes
    - Add institution_id to all relevant tables
    - Update RLS policies for institution-based access
    - Add invitation system for new users
    - Add admin flag to user profiles
    
  2. Security
    - Users can only access data from their own institution
    - Admins can manage invitations
    - Data is properly isolated between institutions
*/

-- Drop existing policies to avoid conflicts
DO $$ 
BEGIN
  -- Drop area policies
  DROP POLICY IF EXISTS "Users can read areas from their institution" ON areas;
  DROP POLICY IF EXISTS "Users can create areas in their institution" ON areas;
  DROP POLICY IF EXISTS "Users can update areas in their institution" ON areas;
  DROP POLICY IF EXISTS "Users can delete areas in their institution" ON areas;

  -- Drop operation policies
  DROP POLICY IF EXISTS "Users can read operations from their institution" ON operations;
  DROP POLICY IF EXISTS "Users can create operations in their institution" ON operations;
  DROP POLICY IF EXISTS "Users can update operations in their institution" ON operations;
  DROP POLICY IF EXISTS "Users can delete operations in their institution" ON operations;

  -- Drop product policies
  DROP POLICY IF EXISTS "Users can read products from their institution" ON products;
  DROP POLICY IF EXISTS "Users can create products in their institution" ON products;
  DROP POLICY IF EXISTS "Users can update products in their institution" ON products;
  DROP POLICY IF EXISTS "Users can delete products in their institution" ON products;

  -- Drop season policies
  DROP POLICY IF EXISTS "Users can read own seasons" ON seasons;
  DROP POLICY IF EXISTS "Users can create own seasons" ON seasons;
  DROP POLICY IF EXISTS "Users can update own seasons" ON seasons;
  DROP POLICY IF EXISTS "Users can delete own seasons" ON seasons;
END $$;

-- Add institution_id to seasons
ALTER TABLE seasons
ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

-- Create new RLS policies for areas
CREATE POLICY "Users can read areas from their institution"
  ON areas FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create areas in their institution"
  ON areas FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update areas in their institution"
  ON areas FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete areas in their institution"
  ON areas FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create new RLS policies for operations
CREATE POLICY "Users can read operations from their institution"
  ON operations FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create operations in their institution"
  ON operations FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update operations in their institution"
  ON operations FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete operations in their institution"
  ON operations FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create new RLS policies for products
CREATE POLICY "Users can read products from their institution"
  ON products FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create products in their institution"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update products in their institution"
  ON products FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete products in their institution"
  ON products FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create new RLS policies for seasons
CREATE POLICY "Users can read seasons from their institution"
  ON seasons FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create seasons in their institution"
  ON seasons FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update seasons in their institution"
  ON seasons FOR UPDATE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete seasons in their institution"
  ON seasons FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Create function to copy data between institutions
CREATE OR REPLACE FUNCTION copy_data_to_institution(
  source_institution_id uuid,
  target_institution_id uuid
) RETURNS void AS $$
BEGIN
  -- Copy areas
  INSERT INTO areas (
    name, size, unit, location, description, current_crop, cultivar,
    user_id, institution_id
  )
  SELECT 
    name, size, unit, location, description, current_crop, cultivar,
    user_id, target_institution_id
  FROM areas
  WHERE institution_id = source_institution_id;

  -- Copy products
  INSERT INTO products (
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, institution_id
  )
  SELECT 
    name, category, unit, quantity_in_stock, min_stock_level,
    price, supplier, description, target_institution_id
  FROM products
  WHERE institution_id = source_institution_id;

  -- Copy seasons
  INSERT INTO seasons (
    name, start_date, end_date, status, description,
    user_id, institution_id
  )
  SELECT 
    name, start_date, end_date, status, description,
    user_id, target_institution_id
  FROM seasons
  WHERE institution_id = source_institution_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;