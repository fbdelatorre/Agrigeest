/*
  # Create areas and operations tables

  1. New Tables
    - `areas`
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `size` (numeric, not null)
      - `unit` (text, not null)
      - `location` (text, not null)
      - `description` (text)
      - `current_crop` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `user_id` (uuid, references auth.users)

    - `operations`
      - `id` (uuid, primary key)
      - `area_id` (uuid, references areas)
      - `type` (text, not null)
      - `start_date` (timestamptz, not null)
      - `end_date` (timestamptz)
      - `next_operation_date` (timestamptz)
      - `description` (text, not null)
      - `operated_by` (text, not null)
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `user_id` (uuid, references auth.users)

    - `operation_products`
      - `id` (uuid, primary key)
      - `operation_id` (uuid, references operations)
      - `product_id` (uuid, references products)
      - `quantity` (numeric, not null)
      - `dose` (numeric)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to:
      - Read their own data
      - Create their own data
      - Update their own data
      - Delete their own data
*/

-- Create areas table
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS areas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    size numeric NOT NULL,
    unit text NOT NULL,
    location text NOT NULL,
    description text,
    current_crop text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE
  );
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Enable RLS on areas
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- Create policies for areas
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own areas" ON areas;
  CREATE POLICY "Users can read own areas"
    ON areas
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can create own areas" ON areas;
  CREATE POLICY "Users can create own areas"
    ON areas
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can update own areas" ON areas;
  CREATE POLICY "Users can update own areas"
    ON areas
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can delete own areas" ON areas;
  CREATE POLICY "Users can delete own areas"
    ON areas
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
END $$;

-- Create operations table
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id uuid NOT NULL REFERENCES areas ON DELETE CASCADE,
    type text NOT NULL,
    start_date timestamptz NOT NULL,
    end_date timestamptz,
    next_operation_date timestamptz,
    description text NOT NULL,
    operated_by text NOT NULL,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE
  );
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Enable RLS on operations
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

-- Create policies for operations
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own operations" ON operations;
  CREATE POLICY "Users can read own operations"
    ON operations
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can create own operations" ON operations;
  CREATE POLICY "Users can create own operations"
    ON operations
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can update own operations" ON operations;
  CREATE POLICY "Users can update own operations"
    ON operations
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

  DROP POLICY IF EXISTS "Users can delete own operations" ON operations;
  CREATE POLICY "Users can delete own operations"
    ON operations
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
END $$;

-- Create operation_products table
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS operation_products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id uuid NOT NULL REFERENCES operations ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products ON DELETE CASCADE,
    quantity numeric NOT NULL,
    dose numeric,
    created_at timestamptz DEFAULT now()
  );
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- Enable RLS on operation_products
ALTER TABLE operation_products ENABLE ROW LEVEL SECURITY;

-- Create policies for operation_products
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can read own operation products" ON operation_products;
  CREATE POLICY "Users can read own operation products"
    ON operation_products
    FOR SELECT
    TO authenticated
    USING (EXISTS (
      SELECT 1 FROM operations 
      WHERE operations.id = operation_products.operation_id 
      AND operations.user_id = auth.uid()
    ));

  DROP POLICY IF EXISTS "Users can create own operation products" ON operation_products;
  CREATE POLICY "Users can create own operation products"
    ON operation_products
    FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (
      SELECT 1 FROM operations 
      WHERE operations.id = operation_products.operation_id 
      AND operations.user_id = auth.uid()
    ));

  DROP POLICY IF EXISTS "Users can delete own operation products" ON operation_products;
  CREATE POLICY "Users can delete own operation products"
    ON operation_products
    FOR DELETE
    TO authenticated
    USING (EXISTS (
      SELECT 1 FROM operations 
      WHERE operations.id = operation_products.operation_id 
      AND operations.user_id = auth.uid()
    ));

  DROP POLICY IF EXISTS "Users can update own operation products" ON operation_products;
  CREATE POLICY "Users can update own operation products"
    ON operation_products
    FOR UPDATE
    TO authenticated
    USING (EXISTS (
      SELECT 1 FROM operations 
      WHERE operations.id = operation_products.operation_id 
      AND operations.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
      SELECT 1 FROM operations 
      WHERE operations.id = operation_products.operation_id 
      AND operations.user_id = auth.uid()
    ));
END $$;

-- Create triggers for updated_at
DO $$ BEGIN
  DROP TRIGGER IF EXISTS update_areas_updated_at ON areas;
  CREATE TRIGGER update_areas_updated_at
    BEFORE UPDATE ON areas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS update_operations_updated_at ON operations;
  CREATE TRIGGER update_operations_updated_at
    BEFORE UPDATE ON operations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
END $$;