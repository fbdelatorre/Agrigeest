/*
  # Atualizar estrutura da tabela operations
  
  1. Alterações
    - Renomear coluna `date` para `start_date` (tipo date)
    - Adicionar coluna `end_date` (tipo date, opcional)
    - Adicionar coluna `next_operation_date` (tipo date, opcional)
    - Renomear coluna `operation_type` para `type`
    - Renomear coluna `performed_by` para `operated_by`
    - Adicionar coluna `description` (text)
    - Adicionar coluna `season_id` (uuid, referência para seasons)
    - Adicionar colunas `products_used` (jsonb), `operation_size` (numeric), 
      `yield_per_hectare` (numeric), `seeds_per_hectare` (numeric)
  
  2. Segurança
    - Manter RLS habilitado
*/

-- Adicionar novas colunas primeiro
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'start_date'
  ) THEN
    ALTER TABLE operations ADD COLUMN start_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE operations ADD COLUMN end_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'next_operation_date'
  ) THEN
    ALTER TABLE operations ADD COLUMN next_operation_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'type'
  ) THEN
    ALTER TABLE operations ADD COLUMN type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'operated_by'
  ) THEN
    ALTER TABLE operations ADD COLUMN operated_by text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'description'
  ) THEN
    ALTER TABLE operations ADD COLUMN description text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'season_id'
  ) THEN
    ALTER TABLE operations ADD COLUMN season_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'products_used'
  ) THEN
    ALTER TABLE operations ADD COLUMN products_used jsonb DEFAULT '[]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'operation_size'
  ) THEN
    ALTER TABLE operations ADD COLUMN operation_size numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'yield_per_hectare'
  ) THEN
    ALTER TABLE operations ADD COLUMN yield_per_hectare numeric;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'operations' AND column_name = 'seeds_per_hectare'
  ) THEN
    ALTER TABLE operations ADD COLUMN seeds_per_hectare numeric;
  END IF;
END $$;

-- Copiar dados das colunas antigas para as novas
UPDATE operations 
SET start_date = date,
    type = operation_type,
    operated_by = performed_by
WHERE start_date IS NULL;

-- Tornar as novas colunas obrigatórias após migrar os dados
ALTER TABLE operations ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE operations ALTER COLUMN type SET NOT NULL;

-- Criar tabela seasons se não existir
CREATE TABLE IF NOT EXISTS seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES institutions ON DELETE CASCADE
);

-- Habilitar RLS em seasons
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para seasons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'seasons' AND policyname = 'Users can read seasons from their institution'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'seasons' AND policyname = 'Users can create seasons in their institution'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'seasons' AND policyname = 'Users can update seasons in their institution'
  ) THEN
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
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'seasons' AND policyname = 'Users can delete seasons in their institution'
  ) THEN
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
  END IF;
END $$;

-- Adicionar trigger para updated_at em seasons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_seasons_updated_at'
  ) THEN
    CREATE TRIGGER update_seasons_updated_at
      BEFORE UPDATE ON seasons
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Remover colunas antigas (se existirem dados, precisamos manter por segurança)
-- Comentado para não perder dados
-- ALTER TABLE operations DROP COLUMN IF EXISTS date;
-- ALTER TABLE operations DROP COLUMN IF EXISTS operation_type;
-- ALTER TABLE operations DROP COLUMN IF EXISTS performed_by;