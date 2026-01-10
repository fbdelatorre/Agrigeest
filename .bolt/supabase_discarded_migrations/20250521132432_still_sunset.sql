/*
  # Add areas and operations tables

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
    - Add policies for authenticated users to manage their own data
*/

-- Create areas table
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
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Enable RLS on areas
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

-- Create policies for areas
CREATE POLICY "Users can read own areas"
  ON areas
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own areas"
  ON areas
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own areas"
  ON areas
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own areas"
  ON areas
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create operations table
CREATE TABLE IF NOT EXISTS operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid REFERENCES areas(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz,
  next_operation_date timestamptz,
  description text NOT NULL,
  operated_by text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL
);

-- Enable RLS on operations
ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

-- Create policies for operations
CREATE POLICY "Users can read own operations"
  ON operations
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own operations"
  ON operations
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own operations"
  ON operations
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own operations"
  ON operations
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create operation_products table
CREATE TABLE IF NOT EXISTS operation_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid REFERENCES operations(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity numeric NOT NULL,
  dose numeric,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on operation_products
ALTER TABLE operation_products ENABLE ROW LEVEL SECURITY;

-- Create policies for operation_products
CREATE POLICY "Users can read own operation products"
  ON operation_products
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = operation_products.operation_id
      AND operations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own operation products"
  ON operation_products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = operation_products.operation_id
      AND operations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own operation products"
  ON operation_products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = operation_products.operation_id
      AND operations.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = operation_products.operation_id
      AND operations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own operation products"
  ON operation_products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM operations
      WHERE operations.id = operation_products.operation_id
      AND operations.user_id = auth.uid()
    )
  );

-- Create triggers for updated_at
CREATE TRIGGER update_areas_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_operations_updated_at
  BEFORE UPDATE ON operations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();