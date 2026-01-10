/*
  # Add institution-based access control
  
  1. Changes
    - Add institution_id to areas, operations, and products tables
    - Update existing records with institution data
    - Add institution-based RLS policies
    
  2. Security
    - Users can only access data from their own institution
    - All operations require institution membership
*/

-- Add institution_id columns as nullable first
ALTER TABLE areas
ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE operations
ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

ALTER TABLE products
ADD COLUMN institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE;

-- Get the first institution id to use as default
DO $$ 
DECLARE
  default_institution_id uuid;
BEGIN
  SELECT id INTO default_institution_id FROM institutions LIMIT 1;

  -- Update existing records with institution data
  UPDATE areas a
  SET institution_id = COALESCE(
    (SELECT institution_id FROM user_profiles up WHERE up.id = a.user_id),
    default_institution_id
  );

  UPDATE operations o
  SET institution_id = COALESCE(
    (SELECT institution_id FROM user_profiles up WHERE up.id = o.user_id),
    default_institution_id
  );

  UPDATE products
  SET institution_id = default_institution_id;

  -- Now make the columns NOT NULL
  IF default_institution_id IS NOT NULL THEN
    ALTER TABLE areas ALTER COLUMN institution_id SET NOT NULL;
    ALTER TABLE operations ALTER COLUMN institution_id SET NOT NULL;
    ALTER TABLE products ALTER COLUMN institution_id SET NOT NULL;
  END IF;
END $$;

-- Update RLS policies for areas
DROP POLICY IF EXISTS "Users can read own areas" ON areas;
DROP POLICY IF EXISTS "Users can create own areas" ON areas;
DROP POLICY IF EXISTS "Users can update own areas" ON areas;
DROP POLICY IF EXISTS "Users can delete own areas" ON areas;

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

-- Update RLS policies for operations
DROP POLICY IF EXISTS "Users can read own operations" ON operations;
DROP POLICY IF EXISTS "Users can create own operations" ON operations;
DROP POLICY IF EXISTS "Users can update own operations" ON operations;
DROP POLICY IF EXISTS "Users can delete own operations" ON operations;

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

-- Update RLS policies for products
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON products;
DROP POLICY IF EXISTS "Allow insert access to all authenticated users" ON products;
DROP POLICY IF EXISTS "Allow update access to all authenticated users" ON products;
DROP POLICY IF EXISTS "Allow delete access to all authenticated users" ON products;

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