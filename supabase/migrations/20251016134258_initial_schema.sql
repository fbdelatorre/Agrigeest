/*
  # Schema Inicial Completo do AgriGest
  
  Este arquivo consolida todo o schema do banco de dados incluindo:
  
  1. Funções e triggers auxiliares
  2. Tabela de produtos (inventário)
  3. Tabela de perfis de usuário
  4. Tabela de instituições
  5. Tabela de convites
  6. Tabelas de áreas e safras
  7. Tabelas de maquinário e manutenção
  8. Tabelas de operações
  9. Tabela de anotações
  
  Todas as tabelas incluem Row Level Security (RLS) configurado.
*/

-- ============================================
-- FUNÇÕES AUXILIARES
-- ============================================

-- Função para atualizar o campo updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- TABELA: institutions
-- ============================================

CREATE TABLE IF NOT EXISTS institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_institutions_updated_at
  BEFORE UPDATE ON institutions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: user_profiles
-- ============================================

CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  phone text,
  role text NOT NULL,
  institution text,
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: invitations
-- ============================================

CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE NOT NULL,
  code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TABELA: products
-- ============================================

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  unit text NOT NULL,
  quantity_in_stock numeric NOT NULL DEFAULT 0,
  min_stock_level numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  supplier text,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: areas
-- ============================================

CREATE TABLE IF NOT EXISTS areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  size numeric NOT NULL,
  location text,
  soil_type text,
  irrigation_system text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_areas_updated_at
  BEFORE UPDATE ON areas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: harvests
-- ============================================

CREATE TABLE IF NOT EXISTS harvests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  crop_type text NOT NULL,
  area_id uuid REFERENCES areas(id) ON DELETE CASCADE NOT NULL,
  start_date date NOT NULL,
  expected_end_date date,
  actual_end_date date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE harvests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_harvests_updated_at
  BEFORE UPDATE ON harvests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: machinery
-- ============================================

CREATE TABLE IF NOT EXISTS machinery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  brand text,
  model text,
  year integer,
  serial_number text,
  purchase_date date,
  purchase_price numeric,
  status text NOT NULL DEFAULT 'active',
  location text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE machinery ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_machinery_updated_at
  BEFORE UPDATE ON machinery
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: maintenance
-- ============================================

CREATE TABLE IF NOT EXISTS maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machinery_id uuid REFERENCES machinery(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  description text,
  scheduled_date date NOT NULL,
  completed_date date,
  cost numeric,
  performed_by text,
  status text NOT NULL DEFAULT 'scheduled',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_maintenance_updated_at
  BEFORE UPDATE ON maintenance
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: operations
-- ============================================

CREATE TABLE IF NOT EXISTS operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type text NOT NULL,
  area_id uuid REFERENCES areas(id) ON DELETE CASCADE,
  harvest_id uuid REFERENCES harvests(id) ON DELETE CASCADE,
  machinery_id uuid REFERENCES machinery(id) ON DELETE CASCADE,
  date date NOT NULL,
  duration numeric,
  cost numeric DEFAULT 0,
  notes text,
  weather_conditions text,
  performed_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  institution_id uuid REFERENCES institutions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE operations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_operations_updated_at
  BEFORE UPDATE ON operations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABELA: notes
-- ============================================

CREATE TABLE IF NOT EXISTS notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  note_date date NOT NULL DEFAULT CURRENT_DATE,
  is_completed boolean DEFAULT false,
  completed_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions ON DELETE CASCADE
);

ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- POLÍTICAS RLS: institutions
-- ============================================

CREATE POLICY "Users can read their own institution"
  ON institutions FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create institutions"
  ON institutions FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 
      FROM user_profiles 
      WHERE id = auth.uid() 
      AND institution_id IS NOT NULL
    )
  );

-- ============================================
-- POLÍTICAS RLS: user_profiles
-- ============================================

CREATE POLICY "Users can read profiles from same institution"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update own profile"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- POLÍTICAS RLS: invitations
-- ============================================

CREATE POLICY "Users can read invitations for their institution"
  ON invitations FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create invitations for their institution"
  ON invitations FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id 
      FROM user_profiles 
      WHERE id = auth.uid()
    )
  );

-- ============================================
-- POLÍTICAS RLS: products
-- ============================================

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

-- ============================================
-- POLÍTICAS RLS: areas
-- ============================================

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

-- ============================================
-- POLÍTICAS RLS: harvests
-- ============================================

CREATE POLICY "Users can read harvests from their institution"
  ON harvests FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create harvests in their institution"
  ON harvests FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update harvests in their institution"
  ON harvests FOR UPDATE
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

CREATE POLICY "Users can delete harvests in their institution"
  ON harvests FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

-- ============================================
-- POLÍTICAS RLS: machinery
-- ============================================

CREATE POLICY "Users can read machinery from their institution"
  ON machinery FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create machinery in their institution"
  ON machinery FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update machinery in their institution"
  ON machinery FOR UPDATE
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

CREATE POLICY "Users can delete machinery in their institution"
  ON machinery FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

-- ============================================
-- POLÍTICAS RLS: maintenance
-- ============================================

CREATE POLICY "Users can read maintenance from their institution"
  ON maintenance FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create maintenance in their institution"
  ON maintenance FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update maintenance in their institution"
  ON maintenance FOR UPDATE
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

CREATE POLICY "Users can delete maintenance in their institution"
  ON maintenance FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

-- ============================================
-- POLÍTICAS RLS: operations
-- ============================================

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

-- ============================================
-- POLÍTICAS RLS: notes
-- ============================================

CREATE POLICY "Users can read notes from their institution"
  ON notes FOR SELECT
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create notes in their institution"
  ON notes FOR INSERT
  TO authenticated
  WITH CHECK (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update notes in their institution"
  ON notes FOR UPDATE
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

CREATE POLICY "Users can delete notes in their institution"
  ON notes FOR DELETE
  TO authenticated
  USING (
    institution_id IN (
      SELECT institution_id
      FROM user_profiles
      WHERE id = auth.uid()
    )
  );

-- ============================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_institution_id ON user_profiles(institution_id);
CREATE INDEX IF NOT EXISTS idx_products_institution_id ON products(institution_id);
CREATE INDEX IF NOT EXISTS idx_areas_institution_id ON areas(institution_id);
CREATE INDEX IF NOT EXISTS idx_harvests_institution_id ON harvests(institution_id);
CREATE INDEX IF NOT EXISTS idx_harvests_area_id ON harvests(area_id);
CREATE INDEX IF NOT EXISTS idx_machinery_institution_id ON machinery(institution_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_institution_id ON maintenance(institution_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_machinery_id ON maintenance(machinery_id);
CREATE INDEX IF NOT EXISTS idx_operations_institution_id ON operations(institution_id);
CREATE INDEX IF NOT EXISTS idx_operations_area_id ON operations(area_id);
CREATE INDEX IF NOT EXISTS idx_operations_harvest_id ON operations(harvest_id);
CREATE INDEX IF NOT EXISTS idx_notes_institution_id ON notes(institution_id);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_notes_is_completed ON notes(is_completed);
CREATE INDEX IF NOT EXISTS idx_notes_note_date ON notes(note_date);

-- ============================================
-- FUNÇÃO PARA GERAR CÓDIGO DE CONVITE
-- ============================================

CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text AS $$
DECLARE
  code text;
  valid boolean;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    
    SELECT NOT EXISTS (
      SELECT 1 
      FROM invitations 
      WHERE invitations.code = code
    ) INTO valid;
    
    EXIT WHEN valid;
  END LOOP;
  
  RETURN code;
END;
$$ LANGUAGE plpgsql;