
CREATE TABLE product_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lot_number text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  expiration_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_lots_product_id ON product_lots(product_id);
CREATE INDEX idx_product_lots_expiration_date ON product_lots(expiration_date);

ALTER TABLE product_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_product_lots" ON product_lots FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_lots.product_id
        AND p.institution_id = (
          SELECT institution_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  );

CREATE POLICY "insert_own_product_lots" ON product_lots FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_lots.product_id
        AND p.institution_id = (
          SELECT institution_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  );

CREATE POLICY "update_own_product_lots" ON product_lots FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_lots.product_id
        AND p.institution_id = (
          SELECT institution_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_lots.product_id
        AND p.institution_id = (
          SELECT institution_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  );

CREATE POLICY "delete_own_product_lots" ON product_lots FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_lots.product_id
        AND p.institution_id = (
          SELECT institution_id FROM user_profiles WHERE id = auth.uid()
        )
    )
  );
