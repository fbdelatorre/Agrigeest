// Define the core types for the farm management application

export type AreaUnit = 'hectare' | 'acre' | 'squareMeter';

export interface Area {
  id: string;
  name: string;
  size: number;
  unit: AreaUnit;
  location: string;
  description?: string;
  current_crop?: string;
  cultivar?: string;
  geometry?: string | object;
  createdAt: Date;
  updatedAt: Date;
}

export type OperationType = 'gradagem' | 'subsolagem' | 'plantio' | 'colheita' | 'dessecacao' | 'herbicida' | 'fungicida' | string;

export interface Operation {
  id: string;
  areaId: string;
  type: OperationType;
  startDate: Date;
  endDate?: Date;
  nextOperationDate?: Date;
  description: string;
  operatedBy: string;
  productsUsed: ProductUsage[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  operationSize: number;
  yieldPerHectare?: number;
  seedsPerHectare?: number;
  status?: string;
  season_id?: string;
}

export type ProductCategory = 'seed' | 'fertilizer' | 'pesticide' | 'herbicide' | 'equipment' | 'other';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  unit: string; // kg, L, bags, etc.
  quantityInStock: number;
  minStockLevel: number;
  price: number;
  supplier?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductLot {
  id: string;
  productId: string;
  lotNumber: string;
  quantity: number;
  expirationDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
}

export interface LotAllocation {
  lotId: string | null; // null = untracked stock (no lot)
  quantity: number;
}

export interface ProductUsage {
  productId: string;
  quantity: number;
  dose?: number; // Dose per hectare/acre
  lotId?: string; // LEGACY: single lot, preserved for historical operations
  lotAllocations?: LotAllocation[]; // NEW: multiple lot sources per product
  productNameSnapshot?: string;
  unitSnapshot?: string;
  unitPriceSnapshot?: number;
}