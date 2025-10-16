-- Drop existing function first
DROP FUNCTION IF EXISTS handle_user_registration(uuid, text);

-- Recreate function with correct implementation
CREATE OR REPLACE FUNCTION handle_user_registration(
  user_id uuid,
  institution_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_institution_id uuid;
BEGIN
  -- Create new institution
  INSERT INTO institutions (name, created_by)
  VALUES (institution_name, user_id)
  RETURNING id INTO new_institution_id;

  -- Update user profile with the new institution
  UPDATE user_profiles
  SET 
    institution_id = new_institution_id,
    is_admin = true
  WHERE user_profiles.id = user_id;
END;
$$;

-- Drop existing policies
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
  DROP POLICY IF EXISTS "Users can read seasons from their institution" ON seasons;
  DROP POLICY IF EXISTS "Users can create seasons in their institution" ON seasons;
  DROP POLICY IF EXISTS "Users can update seasons in their institution" ON seasons;
  DROP POLICY IF EXISTS "Users can delete seasons in their institution" ON seasons;
END $$;

-- Enable RLS on all tables
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

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

-- Update all existing records to have institution_id from their creator's profile
UPDATE areas a
SET institution_id = (
  SELECT institution_id 
  FROM user_profiles up 
  WHERE up.id = a.user_id
)
WHERE institution_id IS NULL;

UPDATE operations o
SET institution_id = (
  SELECT institution_id 
  FROM user_profiles up 
  WHERE up.id = o.user_id
)
WHERE institution_id IS NULL;

-- For products, use the first institution since we don't have a creator reference
UPDATE products p
SET institution_id = (
  SELECT id FROM institutions LIMIT 1
)
WHERE institution_id IS NULL;

UPDATE seasons s
SET institution_id = (
  SELECT institution_id 
  FROM user_profiles up 
  WHERE up.id = s.user_id
)
WHERE institution_id IS NULL;