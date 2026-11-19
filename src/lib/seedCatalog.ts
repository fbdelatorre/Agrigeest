import type { SupabaseClient } from '@supabase/supabase-js';
import { auditedStockRpc } from './businessWrites';
import type { Database, Json } from './database.types';
import type { Product } from '../types';
import { supabase } from './supabase';

export type ProductRow = Database['public']['Tables']['products']['Row'];
type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };
type CreateArgs = {
  p_name: string; p_category: string; p_unit: string; p_min_stock_level: number;
  p_price: number; p_supplier: string | null; p_description: string | null;
  p_untracked_quantity: number; p_lots: Json;
};
type UpdateArgs = {
  p_product_id: string; p_name?: string; p_category?: string; p_unit?: string;
  p_min_stock_level?: number; p_price?: number; p_supplier: string | null;
  p_description: string | null; p_expected_updated_at: string | null;
};
type CreatedProduct = { product: ProductRow; lots: Record<string, string | number | null>[] };
type SeedDatabase = { public: {
  Tables: {
    seed_crops: ReadOnlyTable<{ institution_id: string; name: string }>;
    seed_product_crops: ReadOnlyTable<{ product_id: string; institution_id: string; crop_name: string }>;
  };
  Views: Record<never, never>;
  Functions: {
    create_product_with_crop: { Args: { p_product: CreateArgs; p_crop: string }; Returns: CreatedProduct };
    update_product_with_crop: { Args: { p_product: UpdateArgs; p_crop: string | null }; Returns: ProductRow };
    create_product_with_lots: { Args: CreateArgs; Returns: CreatedProduct };
    update_product_details: { Args: UpdateArgs; Returns: ProductRow };
  };
}};

const seedClient = supabase as unknown as SupabaseClient<SeedDatabase>;

export async function loadSeedCatalog(institutionId: string) {
  const [crops, assignments] = await Promise.all([
    seedClient.from('seed_crops').select('name').eq('institution_id', institutionId),
    seedClient.from('seed_product_crops').select('product_id,crop_name').eq('institution_id', institutionId),
  ]);
  if (crops.error) throw crops.error;
  if (assignments.error) throw assignments.error;
  return {
    names: crops.data.map(row => row.name),
    byProduct: new Map(assignments.data.map(row => [row.product_id, row.crop_name])),
  };
}

export async function readProductCrop(productId: string) {
  const { data, error } = await seedClient.from('seed_product_crops').select('crop_name')
    .eq('product_id', productId).maybeSingle();
  if (error) throw error;
  return data?.crop_name;
}

export function createProductWithCrop(payload: CreateArgs, crop?: string) {
  return crop
    ? auditedStockRpc<CreatedProduct>('create_product_with_crop', { p_product: payload, p_crop: crop })
    : auditedStockRpc<CreatedProduct>('create_product_with_lots', payload);
}

export function updateProductWithCrop(payload: UpdateArgs, crop: string | null | undefined) {
  return crop !== undefined
    ? auditedStockRpc<ProductRow>('update_product_with_crop', { p_product: payload, p_crop: crop })
    : auditedStockRpc<ProductRow>('update_product_details', payload);
}

export function toInventoryProduct(row: ProductRow, crop?: string): Product {
  return {
    ...row,
    crop,
    category: row.category as Product['category'],
    description: row.description ?? undefined,
    supplier: row.supplier ?? undefined,
    quantityInStock: Number(row.quantity_in_stock),
    minStockLevel: Number(row.min_stock_level),
    price: Number(row.price),
    createdAt: new Date(row.created_at ?? 0),
    updatedAt: new Date(row.updated_at ?? row.created_at ?? 0),
  };
}
