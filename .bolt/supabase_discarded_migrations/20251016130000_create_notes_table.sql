/*
  # Sistema de Anotações para Fazenda

  1. Nova Tabela
    - `notes`
      - `id` (uuid, primary key)
      - `title` (text, not null) - Título da anotação
      - `content` (text, not null) - Conteúdo da anotação
      - `note_date` (date, not null) - Data da anotação (editável)
      - `is_completed` (boolean, default false) - Status de conclusão
      - `completed_date` (date, nullable) - Data de conclusão
      - `created_at` (timestamptz) - Data de criação do registro
      - `updated_at` (timestamptz) - Data de atualização do registro
      - `user_id` (uuid, references auth.users)
      - `institution_id` (uuid, references institutions)

  2. Segurança
    - Habilitar RLS na tabela notes
    - Adicionar políticas para usuários autenticados acessarem apenas dados de sua instituição
    - Anotações são compartilhadas entre todas as safras da instituição

  3. Índices
    - Índice em title para pesquisa rápida
    - Índice em institution_id para filtros
    - Índice em is_completed para filtros de status
*/

-- Criar tabela de anotações
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

-- Habilitar RLS na tabela notes
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Criar políticas para notes
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

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_notes_institution_id ON notes(institution_id);
CREATE INDEX IF NOT EXISTS idx_notes_title ON notes(title);
CREATE INDEX IF NOT EXISTS idx_notes_is_completed ON notes(is_completed);
CREATE INDEX IF NOT EXISTS idx_notes_note_date ON notes(note_date);

-- Criar trigger para updated_at
CREATE TRIGGER update_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Adicionar constraint para garantir que completed_date só existe quando is_completed é true
ALTER TABLE notes ADD CONSTRAINT check_completed_date
  CHECK (
    (is_completed = true AND completed_date IS NOT NULL) OR
    (is_completed = false AND completed_date IS NULL) OR
    (is_completed = false AND completed_date IS NOT NULL)
  );
