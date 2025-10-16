/*
  # Criar tabelas de manutenções e tipos de manutenção

  1. Novas Tabelas
    - `maintenance_types` - Tipos de manutenção configuráveis
      - `id` (uuid, primary key)
      - `name` (text, not null)
      - `description` (text, optional)
      - `created_at` (timestamptz)
      - `user_id` (uuid, references auth.users)
      - `institution_id` (uuid, references institutions)

    - `maintenances` - Registros de manutenções realizadas
      - `id` (uuid, primary key)
      - `machinery_id` (uuid, references machinery)
      - `maintenance_type_id` (uuid, references maintenance_types)
      - `description` (text, optional)
      - `material_used` (text, optional)
      - `date` (timestamptz, not null)
      - `machine_hours` (numeric, optional)
      - `cost` (numeric, default 0)
      - `notes` (text, optional)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `user_id` (uuid, references auth.users)
      - `institution_id` (uuid, references institutions)

  2. Segurança
    - Habilitar RLS em ambas as tabelas
    - Políticas para acesso restrito à instituição do usuário
*/

-- Criar tabela de tipos de manutenção
CREATE TABLE IF NOT EXISTS maintenance_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE maintenance_types ENABLE ROW LEVEL SECURITY;

-- Políticas para maintenance_types
CREATE POLICY "Users can read maintenance types from their institution"
  ON maintenance_types FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create maintenance types in their institution"
  ON maintenance_types FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update maintenance types in their institution"
  ON maintenance_types FOR UPDATE
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

CREATE POLICY "Users can delete maintenance types in their institution"
  ON maintenance_types FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Criar tabela de manutenções (description é opcional)
CREATE TABLE IF NOT EXISTS maintenances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machinery_id uuid NOT NULL REFERENCES machinery ON DELETE CASCADE,
  maintenance_type_id uuid NOT NULL REFERENCES maintenance_types ON DELETE CASCADE,
  description text,
  material_used text,
  date timestamptz NOT NULL,
  machine_hours numeric,
  cost numeric DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions ON DELETE CASCADE
);

-- Habilitar RLS
ALTER TABLE maintenances ENABLE ROW LEVEL SECURITY;

-- Políticas para maintenances
CREATE POLICY "Users can read maintenances from their institution"
  ON maintenances FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create maintenances in their institution"
  ON maintenances FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update maintenances in their institution"
  ON maintenances FOR UPDATE
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

CREATE POLICY "Users can delete maintenances in their institution"
  ON maintenances FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- Criar trigger para updated_at
CREATE TRIGGER update_maintenances_updated_at
  BEFORE UPDATE ON maintenances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
