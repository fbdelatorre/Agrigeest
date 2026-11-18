BEGIN;

CREATE TABLE public.seed_crops (
  institution_id uuid NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  PRIMARY KEY (institution_id, name)
);
CREATE TABLE public.seed_product_crops (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL,
  crop_name text NOT NULL,
  FOREIGN KEY (institution_id, crop_name) REFERENCES public.seed_crops(institution_id, name)
);
CREATE INDEX ON public.seed_product_crops (institution_id);
ALTER TABLE public.seed_crops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_product_crops ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seed_crops, public.seed_product_crops FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seed_crops, public.seed_product_crops TO authenticated;
CREATE POLICY read_seed_crops ON public.seed_crops FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = seed_crops.institution_id));
CREATE POLICY read_seed_product_crops ON public.seed_product_crops FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = (SELECT auth.uid()) AND p.institution_id = seed_product_crops.institution_id));

CREATE FUNCTION public.save_seed_product_crop(p_id uuid, p_institution uuid, p_category text, p_crop text)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  crop text := nullif(upper(btrim(p_crop)), '');
BEGIN
  IF crop IS NULL OR lower(btrim(p_category)) NOT IN ('seed', 'seeds', 'semente', 'sementes') THEN
    DELETE FROM public.seed_product_crops WHERE product_id = p_id AND institution_id = p_institution;
    RETURN;
  END IF;
  INSERT INTO public.seed_crops (institution_id, name) VALUES (p_institution, crop) ON CONFLICT DO NOTHING;
  INSERT INTO public.seed_product_crops (product_id, institution_id, crop_name)
  VALUES (p_id, p_institution, crop)
  ON CONFLICT (product_id) DO UPDATE SET crop_name = excluded.crop_name
  WHERE seed_product_crops.institution_id = excluded.institution_id;
END;
$$;
REVOKE ALL ON FUNCTION public.save_seed_product_crop(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_product_with_crop(p_product jsonb, p_crop text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; product jsonb;
BEGIN
  result := public.create_product_with_lots(
    p_product->>'p_name', p_product->>'p_category', p_product->>'p_unit',
    (p_product->>'p_min_stock_level')::numeric, (p_product->>'p_price')::numeric,
    p_product->>'p_supplier', p_product->>'p_description',
    (p_product->>'p_untracked_quantity')::numeric, p_product->'p_lots'
  );
  product := result->'product';
  PERFORM public.save_seed_product_crop((product->>'id')::uuid, (product->>'institution_id')::uuid, product->>'category', p_crop);
  RETURN result;
END;
$$;

CREATE FUNCTION public.update_product_with_crop(p_product jsonb, p_crop text)
RETURNS public.products LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE product public.products;
BEGIN
  product := public.update_product_details(
    (p_product->>'p_product_id')::uuid, p_product->>'p_name', p_product->>'p_category', p_product->>'p_unit',
    (p_product->>'p_min_stock_level')::numeric, (p_product->>'p_price')::numeric,
    p_product->>'p_supplier', p_product->>'p_description', (p_product->>'p_expected_updated_at')::timestamptz
  );
  PERFORM public.save_seed_product_crop(product.id, product.institution_id, product.category, p_crop);
  RETURN product;
END;
$$;
REVOKE ALL ON FUNCTION public.create_product_with_crop(jsonb, text), public.update_product_with_crop(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_product_with_crop(jsonb, text), public.update_product_with_crop(jsonb, text) TO authenticated;

COMMIT;
