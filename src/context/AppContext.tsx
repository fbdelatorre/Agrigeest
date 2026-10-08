import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Area,
  Operation,
  Product,
  ProductLot
} from '../types';
import { AreaMapSummary } from '../types/farmMap';
import { stripZCoordinates } from '../utils/farmMap/farmMapHelpers';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';
import { dateToISOString, dateToDateString, parseDate } from '../utils/dateHelpers';

const READ_ONLY_MSG = 'Sem conexão. O AgriGest está em modo somente leitura.';

interface Season {
  id: string;
  name: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'planned';
  description: string | null;
}

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  institution: string;
  institutionId: string;
  isAdmin: boolean;
}

interface AppContextType {
  profile: UserProfile | null;
  reloadProfile: () => Promise<void>;

  areas: Area[];
  addArea: (area: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateArea: (id: string, area: Partial<Area>) => Promise<void>;
  deleteArea: (id: string) => Promise<void>;
  getAreaById: (id: string) => Area | undefined;

  operations: Operation[];
  addOperation: (operation: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateOperation: (id: string, operation: Partial<Operation>) => Promise<void>;
  deleteOperation: (id: string) => Promise<void>;
  getOperationsByAreaId: (areaId: string) => Operation[];

  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>, pendingLots?: { lotNumber: string; quantity: number; expirationDate?: Date }[], untrackedQuantity?: number) => Promise<void>;
  updateProduct: (id: string, product: Partial<Product>, expectedUpdatedAt?: Date) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  getProductById: (id: string) => Product | undefined;
  productLots: ProductLot[];
  addLot: (lot: Omit<ProductLot, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateLot: (id: string, lot: Partial<ProductLot>, expectedQuantity?: number) => Promise<void>;
  deleteLot: (id: string) => Promise<void>;
  getLotsByProductId: (productId: string) => ProductLot[];
  addInventoryStock: (productId: string, quantity: number, idempotencyKey: string, lotId?: string | null, reason?: string | null, notes?: string | null, unitCost?: number | null) => Promise<void>;
  adjustInventoryStock: (productId: string, targetQuantity: number, reason: string, idempotencyKey: string, lotId?: string | null, notes?: string | null) => Promise<void>;
  archiveLot: (lotId: string) => Promise<void>;

  seasons: Season[];
  activeSeason: Season | null;
  setActiveSeason: (season: Season | null) => void;

  isOnline: boolean;

  saveAreaGeometry: (areaId: string, geojson: string) => Promise<void>;
  deleteAreaGeometry: (areaId: string) => Promise<void>;
  getAreaMapSummary: (seasonId: string) => Promise<AreaMapSummary[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productLots, setProductLots] = useState<ProductLot[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);

  const { isOnline } = useNetworkStatus();

  const {
    data: cachedAreas,
    setData: setCachedAreas,
  } = useOfflineStorage<Area[]>('areas', []);

  const {
    data: cachedOperations,
    setData: setCachedOperations,
  } = useOfflineStorage<Operation[]>('operations', []);

  const {
    data: cachedProducts,
    setData: setCachedProducts,
  } = useOfflineStorage<Product[]>('products', []);

  const {
    data: cachedSeasons,
    setData: setCachedSeasons,
  } = useOfflineStorage<Season[]>('seasons', []);

  useEffect(() => {
    loadUserProfile();

    if (isOnline) {
      loadAreas();
      loadOperations();
      loadProducts();
      loadProductLots();
      loadSeasons();
    } else {
      if (cachedAreas.length > 0) setAreas(cachedAreas);
      if (cachedOperations.length > 0) setOperations(cachedOperations);
      if (cachedProducts.length > 0) setProducts(cachedProducts);
      if (cachedSeasons.length > 0) setSeasons(cachedSeasons);
    }
  }, [isOnline]);

  const loadUserProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setProfile({
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email || user.email || '',
        phone: data.phone || '',
        role: data.role || '',
        institution: data.institution || '',
        institutionId: data.institution_id || '',
        isAdmin: data.is_admin || false
      });
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const loadAreas = async () => {
    try {
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading areas:', error);
        return;
      }

      const formattedAreas = data.map(area => ({
        ...area,
        current_crop: area.current_crop || undefined,
        cultivar: area.cultivar || undefined,
        createdAt: new Date(area.created_at),
        updatedAt: new Date(area.updated_at)
      }));

      setAreas(formattedAreas);
      setCachedAreas(formattedAreas);
    } catch (error) {
      console.error('Error loading areas:', error);
    }
  };

  const loadOperations = async () => {
    try {
      const { data, error } = await supabase
        .from('operations')
        .select('*')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading operations:', error);
        return;
      }

      const formattedOperations = data.map(operation => ({
        ...operation,
        areaId: operation.area_id,
        startDate: parseDate(operation.start_date)!,
        endDate: parseDate(operation.end_date),
        nextOperationDate: parseDate(operation.next_operation_date),
        operatedBy: operation.operated_by,
        productsUsed: operation.products_used || [],
        operationSize: operation.operation_size ?? 0,
        yieldPerHectare: operation.yield_per_hectare,
        seedsPerHectare: operation.seeds_per_hectare,
        createdAt: new Date(operation.created_at),
        updatedAt: new Date(operation.updated_at)
      }));

      setOperations(formattedOperations);
      setCachedOperations(formattedOperations);
    } catch (error) {
      console.error('Error loading operations:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading products:', error);
        return;
      }

      const formattedProducts = data.map(product => ({
        ...product,
        quantityInStock: product.quantity_in_stock,
        minStockLevel: product.min_stock_level,
        createdAt: new Date(product.created_at),
        updatedAt: new Date(product.updated_at || product.created_at)
      }));

      setProducts(formattedProducts);
      setCachedProducts(formattedProducts);
    } catch (error) {
      console.error('Error loading products:', error);
    }
  };

  const loadProductLots = async () => {
    try {
      const { data, error } = await supabase
        .from('product_lots')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading product lots:', error);
        return;
      }

      const formattedLots: ProductLot[] = (data || []).map(lot => ({
        id: lot.id,
        productId: lot.product_id,
        lotNumber: lot.lot_number,
        quantity: Number(lot.quantity),
        expirationDate: lot.expiration_date ? parseDate(lot.expiration_date) : undefined,
        createdAt: new Date(lot.created_at),
        updatedAt: new Date(lot.updated_at),
        archivedAt: lot.archived_at ? new Date(lot.archived_at) : undefined
      }));

      setProductLots(formattedLots);
    } catch (error) {
      console.error('Error loading product lots:', error);
    }
  };

  const loadSeasons = async () => {
    try {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .order('start_date', { ascending: false });

      if (error) {
        console.error('Error loading seasons:', error);
        if (error.code === 'PGRST205') {
          setSeasons([]);
          setCachedSeasons([]);
          return;
        }
        throw error;
      }

      setSeasons(data || []);
      setCachedSeasons(data || []);

      const activeSeasonData = data?.find(season => season.status === 'active');
      if (activeSeasonData) {
        setActiveSeason(activeSeasonData);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
      setSeasons([]);
      setCachedSeasons([]);
    }
  };

  const addArea = async (area: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User must be authenticated to add an area');

      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add an area');
      }

      const { data, error } = await supabase
        .from('areas')
        .insert([{
          name: area.name, size: area.size, unit: area.unit, location: area.location,
          description: area.description, current_crop: area.current_crop, cultivar: area.cultivar,
          user_id: user.id, institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) throw error;

      const newArea: Area = {
        ...data, current_crop: data.current_crop || undefined, cultivar: data.cultivar || undefined,
        createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at)
      };

      const updatedAreas = [newArea, ...areas];
      setAreas(updatedAreas);
      setCachedAreas(updatedAreas);
    } catch (error) {
      console.error('Error adding area:', error);
      throw error;
    }
  };

  const updateArea = async (id: string, updatedData: Partial<Area>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data, error } = await supabase
        .from('areas')
        .update({
          name: updatedData.name, size: updatedData.size, unit: updatedData.unit,
          location: updatedData.location, description: updatedData.description,
          current_crop: updatedData.current_crop, cultivar: updatedData.cultivar
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedArea: Area = {
        ...data, current_crop: data.current_crop || undefined, cultivar: data.cultivar || undefined,
        createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at)
      };

      const updatedAreas = areas.map(area => area.id === id ? updatedArea : area);
      setAreas(updatedAreas);
      setCachedAreas(updatedAreas);
    } catch (error) {
      console.error('Error updating area:', error);
      throw error;
    }
  };

  const deleteArea = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.from('areas').delete().eq('id', id);
      if (error) throw error;

      const updatedAreas = areas.filter(area => area.id !== id);
      setAreas(updatedAreas);
      setCachedAreas(updatedAreas);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('23503') || msg.includes('restrict') || msg.includes('RESTRICT')) {
        throw new Error('Esta área possui operações vinculadas e não pode ser excluída.');
      }
      console.error('Error deleting area:', error);
      throw error;
    }
  };

  const getAreaById = (id: string) => areas.find((area) => area.id === id);

  const addOperation = async (operation: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);
    if (!activeSeason) throw new Error('No active season selected');

    try {
      const { data, error } = await supabase.rpc('create_operation_with_stock', {
        p_area_id: operation.areaId,
        p_type: operation.type,
        p_start_date: dateToDateString(operation.startDate),
        p_description: operation.description,
        p_operated_by: operation.operatedBy,
        p_season_id: activeSeason.id,
        p_end_date: operation.endDate ? dateToDateString(operation.endDate) : null,
        p_next_operation_date: operation.nextOperationDate ? dateToDateString(operation.nextOperationDate) : null,
        p_notes: operation.notes || null,
        p_products_used: operation.productsUsed || [],
        p_operation_size: operation.operationSize ?? null,
        p_yield_per_hectare: operation.yieldPerHectare ?? null,
        p_seeds_per_hectare: operation.seedsPerHectare ?? null,
      });

      if (error) throw error;

      const newOperation: Operation = {
        ...data, areaId: data.area_id, startDate: parseDate(data.start_date)!,
        endDate: parseDate(data.end_date), nextOperationDate: parseDate(data.next_operation_date),
        operatedBy: data.operated_by, productsUsed: data.products_used || [],
        operationSize: data.operation_size ?? 0, yieldPerHectare: data.yield_per_hectare,
        seedsPerHectare: data.seeds_per_hectare, createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedOperations = [newOperation, ...operations];
      setOperations(updatedOperations);
      setCachedOperations(updatedOperations);

      await loadProducts();
      await loadProductLots();
    } catch (error) {
      console.error('Error adding operation:', error);
      throw error;
    }
  };

  const updateOperation = async (id: string, updatedData: Partial<Operation>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const originalOperation = operations.find(op => op.id === id);
      if (!originalOperation) throw new Error('Operation not found');

      const { data, error } = await supabase.rpc('update_operation_with_stock', {
        p_operation_id: id,
        p_area_id: updatedData.areaId ?? originalOperation.areaId,
        p_type: updatedData.type ?? originalOperation.type,
        p_start_date: dateToDateString(updatedData.startDate ?? originalOperation.startDate),
        p_description: updatedData.description ?? originalOperation.description,
        p_operated_by: updatedData.operatedBy ?? originalOperation.operatedBy,
        p_season_id: (originalOperation as Record<string, unknown>).season_id as string | null,
        p_end_date: updatedData.endDate !== undefined ? (updatedData.endDate ? dateToDateString(updatedData.endDate) : null) : (originalOperation.endDate ? dateToDateString(originalOperation.endDate) : null),
        p_next_operation_date: updatedData.nextOperationDate !== undefined ? (updatedData.nextOperationDate ? dateToDateString(updatedData.nextOperationDate) : null) : (originalOperation.nextOperationDate ? dateToDateString(originalOperation.nextOperationDate) : null),
        p_notes: updatedData.notes !== undefined ? updatedData.notes : (originalOperation.notes || null),
        p_products_used: updatedData.productsUsed ?? (originalOperation.productsUsed || []),
        p_operation_size: updatedData.operationSize ?? originalOperation.operationSize ?? null,
        p_yield_per_hectare: updatedData.yieldPerHectare !== undefined ? updatedData.yieldPerHectare ?? null : (originalOperation.yieldPerHectare ?? null),
        p_seeds_per_hectare: updatedData.seedsPerHectare !== undefined ? updatedData.seedsPerHectare ?? null : (originalOperation.seedsPerHectare ?? null),
      });

      if (error) throw error;

      const updatedOperation: Operation = {
        ...data, areaId: data.area_id, startDate: parseDate(data.start_date)!,
        endDate: parseDate(data.end_date), nextOperationDate: parseDate(data.next_operation_date),
        operatedBy: data.operated_by, productsUsed: data.products_used || [],
        operationSize: data.operation_size ?? 0, yieldPerHectare: data.yield_per_hectare,
        seedsPerHectare: data.seeds_per_hectare, createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedOperations = operations.map(operation =>
        operation.id === id ? updatedOperation : operation
      );
      setOperations(updatedOperations);
      setCachedOperations(updatedOperations);

      await loadProducts();
      await loadProductLots();
    } catch (error) {
      console.error('Error updating operation:', error);
      throw error;
    }
  };

  const deleteOperation = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.rpc('delete_operation_with_stock', {
        p_operation_id: id,
      });

      if (error) throw error;

      await loadOperations();
      await loadProducts();
      await loadProductLots();
    } catch (error) {
      console.error('Error deleting operation:', error);
      throw error;
    }
  };

  const getOperationsByAreaId = (areaId: string) => {
    return operations.filter((operation) =>
      operation.areaId === areaId &&
      (!activeSeason || operation.season_id === activeSeason.id)
    );
  };

  const addProduct = async (
    product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>,
    pendingLots?: { lotNumber: string; quantity: number; expirationDate?: Date }[],
    untrackedQuantity?: number
  ) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const lotsJsonb = (pendingLots || []).map(l => ({
        lot_number: l.lotNumber,
        quantity: l.quantity,
        expiration_date: l.expirationDate ? dateToDateString(l.expirationDate) : null,
      }));

      const { data, error } = await supabase.rpc('create_product_with_lots', {
        p_name: product.name,
        p_category: product.category,
        p_unit: product.unit,
        p_min_stock_level: product.minStockLevel,
        p_price: product.price,
        p_supplier: product.supplier ?? null,
        p_description: product.description ?? null,
        p_untracked_quantity: untrackedQuantity ?? 0,
        p_lots: lotsJsonb,
      });

      if (error) throw error;

      const p = data.product;
      const newProduct: Product = {
        ...p, quantityInStock: Number(p.quantity_in_stock), minStockLevel: Number(p.min_stock_level),
        createdAt: new Date(p.created_at), updatedAt: new Date(p.updated_at)
      };

      const updatedProducts = [newProduct, ...products];
      setProducts(updatedProducts);
      setCachedProducts(updatedProducts);

      if (data.lots && Array.isArray(data.lots) && data.lots.length > 0) {
        const newLots: ProductLot[] = data.lots.map((lot: Record<string, string | number | null>) => ({
          id: lot.id as string,
          productId: lot.product_id as string,
          lotNumber: lot.lot_number as string,
          quantity: Number(lot.quantity),
          expirationDate: lot.expiration_date ? parseDate(lot.expiration_date as string) : undefined,
          createdAt: new Date(lot.created_at as string),
          updatedAt: new Date(lot.updated_at as string),
        }));

        setProductLots(prev => [...newLots, ...prev]);
      }
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  };

  const updateProduct = async (id: string, updatedData: Partial<Product>, expectedUpdatedAt?: Date) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data, error } = await supabase.rpc('update_product_details', {
        p_product_id: id,
        p_name: updatedData.name,
        p_category: updatedData.category,
        p_unit: updatedData.unit,
        p_min_stock_level: updatedData.minStockLevel,
        p_price: updatedData.price,
        p_supplier: updatedData.supplier ?? null,
        p_description: updatedData.description ?? null,
        p_expected_updated_at: expectedUpdatedAt?.toISOString() ?? null,
      });

      if (error) throw error;

      const updatedProduct: Product = {
        ...data, quantityInStock: Number(data.quantity_in_stock), minStockLevel: Number(data.min_stock_level),
        createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at)
      };

      const updatedProducts = products.map(product => product.id === id ? updatedProduct : product);
      setProducts(updatedProducts);
      setCachedProducts(updatedProducts);
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) throw error;

      const updatedProducts = products.filter(product => product.id !== id);
      setProducts(updatedProducts);
      setCachedProducts(updatedProducts);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('23503') || msg.includes('restrict') || msg.includes('RESTRICT')) {
        throw new Error('Não é possível excluir este produto porque existem dados dependentes (lotes ou operações vinculadas).');
      }
      console.error('Error deleting product:', error);
      throw error;
    }
  };

  const getProductById = (id: string) => products.find((product) => product.id === id);

  const addLot = async (lot: Omit<ProductLot, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data, error } = await supabase.rpc('create_product_lot', {
        p_product_id: lot.productId,
        p_lot_number: lot.lotNumber,
        p_quantity: lot.quantity,
        p_expiration_date: lot.expirationDate ? dateToDateString(lot.expirationDate) : null,
      });

      if (error) throw error;

      const newLot: ProductLot = {
        id: data.id, productId: data.product_id, lotNumber: data.lot_number,
        quantity: Number(data.quantity),
        expirationDate: data.expiration_date ? parseDate(data.expiration_date) : undefined,
        createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at)
      };

      setProductLots(prev => [newLot, ...prev]);
    } catch (error) {
      console.error('Error adding lot:', error);
      throw error;
    }
  };

  const updateLot = async (id: string, updatedData: Partial<ProductLot>, expectedQuantity?: number) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data, error } = await supabase.rpc('update_product_lot', {
        p_lot_id: id,
        p_lot_number: updatedData.lotNumber ?? null,
        p_quantity: updatedData.quantity ?? null,
        p_expiration_date: updatedData.expirationDate !== undefined
          ? (updatedData.expirationDate ? dateToDateString(updatedData.expirationDate) : null)
          : null,
        p_expected_quantity: updatedData.quantity !== undefined ? (expectedQuantity ?? null) : null,
      });

      if (error) throw error;

      const updatedLot: ProductLot = {
        id: data.id, productId: data.product_id, lotNumber: data.lot_number,
        quantity: Number(data.quantity),
        expirationDate: data.expiration_date ? parseDate(data.expiration_date) : undefined,
        createdAt: new Date(data.created_at), updatedAt: new Date(data.updated_at)
      };

      setProductLots(prev => prev.map(l => l.id === id ? updatedLot : l));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : '';
      if (errMsg.includes('LOT_QUANTITY_STALE')) {
        await loadProductLots();
        await loadProducts();
      }
      console.error('Error updating lot:', error);
      throw error;
    }
  };

  const deleteLot = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.rpc('delete_product_lot', {
        p_lot_id: id,
      });

      if (error) throw error;

      setProductLots(prev => prev.filter(l => l.id !== id));
    } catch (error) {
      console.error('Error deleting lot:', error);
      throw error;
    }
  };

  const getLotsByProductId = (productId: string) => {
    return productLots.filter(lot => lot.productId === productId && !lot.archivedAt);
  };

  const addInventoryStock = async (
    productId: string,
    quantity: number,
    idempotencyKey: string,
    lotId?: string | null,
    reason?: string | null,
    notes?: string | null,
    unitCost?: number | null
  ) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.rpc('add_inventory_stock', {
        p_product_id: productId,
        p_quantity: quantity,
        p_idempotency_key: idempotencyKey,
        p_lot_id: lotId ?? null,
        p_reason: reason ?? null,
        p_notes: notes ?? null,
        p_unit_cost: unitCost ?? null,
      });

      if (error) throw error;

      await loadProducts();
      await loadProductLots();
    } catch (error) {
      console.error('Error adding inventory stock:', error);
      throw error;
    }
  };

  const adjustInventoryStock = async (
    productId: string,
    targetQuantity: number,
    reason: string,
    idempotencyKey: string,
    lotId?: string | null,
    notes?: string | null
  ) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.rpc('adjust_inventory_stock', {
        p_product_id: productId,
        p_target_quantity: targetQuantity,
        p_reason: reason,
        p_idempotency_key: idempotencyKey,
        p_lot_id: lotId ?? null,
        p_notes: notes ?? null,
      });

      if (error) throw error;

      await loadProducts();
      await loadProductLots();
    } catch (error) {
      console.error('Error adjusting inventory stock:', error);
      throw error;
    }
  };

  const archiveLot = async (lotId: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.rpc('archive_product_lot', {
        p_lot_id: lotId,
      });

      if (error) throw error;

      await loadProductLots();
    } catch (error) {
      console.error('Error archiving lot:', error);
      throw error;
    }
  };

  const saveAreaGeometry = async (areaId: string, geojson: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const parsed = JSON.parse(geojson);
      const geom = parsed.geometry || parsed;

      const cleanGeom = stripZCoordinates(geom);
      const geomStr = JSON.stringify(cleanGeom);

      const { error } = await supabase.rpc('save_area_geometry', {
        area_id_param: areaId,
        geojson_text: geomStr,
      });

      if (error) throw error;

      setAreas(prev => prev.map(a =>
        a.id === areaId ? { ...a, geometry: geomStr, updatedAt: new Date() } : a
      ));
    } catch (error) {
      console.error('Error saving area geometry:', error);
      throw error;
    }
  };

  const deleteAreaGeometry = async (areaId: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase
        .from('areas')
        .update({ geometry: null })
        .eq('id', areaId);

      if (error) throw error;

      setAreas(prev => prev.map(a =>
        a.id === areaId ? { ...a, geometry: undefined, updatedAt: new Date() } : a
      ));
    } catch (error) {
      console.error('Error deleting area geometry:', error);
      throw error;
    }
  };

  const getAreaMapSummary = useCallback(async (seasonId: string): Promise<AreaMapSummary[]> => {
    try {
      const { data, error } = await supabase.rpc('get_area_map_summary', {
        season_id_param: seasonId,
      });

      if (error) throw error;

      return (data || []).map((row: Record<string, unknown>) => ({
        areaId: row.area_id as string,
        areaName: row.area_name as string,
        areaSize: Number(row.area_size),
        areaUnit: row.area_unit as string,
        currentCrop: row.current_crop as string | null,
        cultivar: row.cultivar as string | null,
        geojson: row.geojson as string | null,
        lastOperationDate: row.last_operation_date as string | null,
        lastFungicideDate: row.last_fungicide_date as string | null,
        lastInsecticideDate: row.last_insecticide_date as string | null,
        lastHerbicideDate: row.last_herbicide_date as string | null,
        lastDessecacaoDate: row.last_dessecacao_date as string | null,
        nextOperationDate: row.next_operation_date as string | null,
      }));
    } catch (error) {
      console.error('Error loading area map summary:', error);
      return [];
    }
  }, []);

  const value: AppContextType = {
    profile,
    reloadProfile: loadUserProfile,
    areas, addArea, updateArea, deleteArea, getAreaById,
    operations: operations.filter(op => !activeSeason || op.season_id === activeSeason.id),
    addOperation, updateOperation, deleteOperation, getOperationsByAreaId,
    products, addProduct, updateProduct, deleteProduct, getProductById,
    productLots, addLot, updateLot, deleteLot, getLotsByProductId,
  addInventoryStock, adjustInventoryStock, archiveLot,
    seasons, activeSeason, setActiveSeason,
    isOnline,
    saveAreaGeometry, deleteAreaGeometry, getAreaMapSummary
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
