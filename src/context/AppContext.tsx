import { insertBusinessRecord, type StoredDates } from '../lib/businessWrites';
import { createProductWithCrop, loadSeedCatalog, toInventoryProduct, updateProductWithCrop, type ProductRow } from '../lib/seedCatalog';
import { isSeedCategory, plantingDetails, plantingsForSeason, snapshotPlantingSeeds } from '../utils/seasonPlanting';
import { FieldSyncProvider } from './FieldSyncContext';
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { executeFieldRecommendation } from '../lib/fieldData';
import { auditedStockRpc, writeOperationRequest } from '../lib/businessWrites';
import {
  Area,
  Operation,
  Product,
  ProductLot
} from '../types';
type StoredOperation = Omit<Operation, 'areaId' | 'startDate' | 'endDate' | 'nextOperationDate' | 'operatedBy' | 'productsUsed' | 'operationSize' | 'yieldPerHectare' | 'seedsPerHectare' | 'createdAt' | 'updatedAt'> & {
  area_id: string; start_date: string; end_date: string | null; next_operation_date: string | null; operated_by: string;
  products_used: Operation['productsUsed']; operation_size: number | null; yield_per_hectare: number | null;
  seeds_per_hectare: number | null; created_at: string; updated_at: string;
};
import { AreaMapSummary } from '../types/farmMap';
import { parseAreaBoundary } from '../utils/farmMap/areaBoundary';
import { stripZCoordinates } from '../utils/farmMap/farmMapHelpers';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { OfflineScope, readOfflineValue, useOfflineStorage, writeOfflineValue } from '../hooks/useOfflineStorage';
import { dateToDateString, parseDate } from '../utils/dateHelpers';

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
  addOperation: (operation: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>, recommendationId?: string) => Promise<void>;
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
  adjustInventoryStock: (productId: string, targetQuantity: number, reason: string, idempotencyKey: string, lotId?: string | null, notes?: string | null, expectedQuantity?: number) => Promise<void>;
  reloadInventory: () => Promise<void>;
  archiveLot: (lotId: string) => Promise<void>;
  receiveProductLot: (productId: string, quantity: number, idempotencyKey: string, lotNumber?: string | null, expirationDate?: string | null, reason?: string | null, notes?: string | null, unitCost?: number | null) => Promise<void>;
  classifyUntrackedStock: (productId: string, quantity: number, lotNumber: string, expirationDate?: string | null, notes?: string | null) => Promise<void>;

  seasons: Season[];
  reloadSeasons: () => Promise<void>;
  seedCrops: string[];
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
  userId: string;
  email?: string;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, userId, email }) => {
  const profileKey = 'agrigest:v2:profile:' + userId;
  const { isOnline } = useNetworkStatus();
  const [profile, setProfile] = useState<UserProfile | null>(() =>
    navigator.onLine ? null : readOfflineValue(profileKey, null)
  );
  const [profileFailed, setProfileFailed] = useState(false);

  const reloadProfile = useCallback(async (signal?: AbortSignal) => {
    if (!isOnline) {
      setProfile(previous => previous ?? readOfflineValue(profileKey, null));
      return;
    }
    setProfileFailed(false);
    try {
      const query = supabase.from('user_profiles').select('*').eq('id', userId);
      if (signal) query.abortSignal(signal);
      const { data, error } = await query.single();
      if (signal?.aborted) return;
      if (error) throw error;

      const nextProfile: UserProfile = {
        id: data.id,
        firstName: data.first_name,
        lastName: data.last_name,
        email: email || '',
        phone: data.phone || '',
        role: data.role || '',
        institution: data.institution || '',
        institutionId: data.institution_id || '',
        isAdmin: data.is_admin || false
      };
      writeOfflineValue(profileKey, nextProfile);
      setProfile(nextProfile);
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Error loading user profile:', error);
      setProfileFailed(true);
    }
  }, [email, isOnline, profileKey, userId]);

  useEffect(() => {
    const controller = new AbortController();
    void reloadProfile(controller.signal);
    return () => controller.abort();
  }, [reloadProfile]);

  if (!profile) {
    return (
      <div className="p-6" role="status">
        {!isOnline ? 'Conecte-se à internet para carregar seu perfil neste dispositivo.' :
          profileFailed ? (
            <>
              <p>Não foi possível carregar seu perfil.</p>
              <button className="mt-3 underline" onClick={() => void reloadProfile()}>Tentar novamente</button>
            </>
          ) : 'Carregando perfil…'}
      </div>
    );
  }

  const scope = profile.institutionId ? userId + ':' + profile.institutionId : null;
  return (
    <OfflineScope.Provider value={scope}>
      <FieldSyncProvider key={scope ?? userId} scope={scope} userId={userId} institutionId={profile.institutionId}>
        <InstitutionData profile={profile} reloadProfile={reloadProfile}>
          {children}
        </InstitutionData>
      </FieldSyncProvider>
    </OfflineScope.Provider>
  );
};

const InstitutionData: React.FC<{
  children: ReactNode;
  profile: UserProfile;
  reloadProfile: () => Promise<void>;
}> = ({ children, profile, reloadProfile }) => {
  const { institutionId } = profile;
  const scope = useContext(OfflineScope);
  const { isOnline } = useNetworkStatus();

  const [areas, setAreas] = useOfflineStorage<Area[]>('areas', []);

  const [operations, setOperations] = useOfflineStorage<Operation[]>('operations', []);

  const [products, setProducts] = useOfflineStorage<Product[]>('products', []);
  const [seedCrops, setSeedCrops] = useOfflineStorage<string[]>('seedCrops', []);

  const [seasons, setSeasons] = useOfflineStorage<Season[]>('seasons', []);
  const [productLots, setProductLots] = useOfflineStorage<ProductLot[]>('productLots', []);
  const [selectedSeasonId, setSelectedSeasonId] = useOfflineStorage<string | null | undefined>('selectedSeasonId', undefined);
  const activeSeason = selectedSeasonId === null ? null :
    seasons.find(season => season.id === selectedSeasonId) ??
    seasons.find(season => season.status === 'active') ?? null;
  const setActiveSeason = (season: Season | null) => setSelectedSeasonId(season?.id ?? null);


  const seasonalAreas = useMemo(() => {
    const plantings = plantingsForSeason(operations, activeSeason?.id);
    return areas.map(area => ({ ...area, ...plantingDetails(plantings.get(area.id), products) }));
  }, [activeSeason?.id, areas, operations, products]);

  const loadAreas = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('areas')
        .select('*')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading areas:', error);
        return;
      }

      const formattedAreas = data.map(area => ({
        ...area,
        description: area.description ?? undefined, geometry: area.geometry ?? undefined,
        current_crop: area.current_crop || undefined,
        cultivar: area.cultivar || undefined,
        createdAt: new Date(area.created_at ?? 0),
        updatedAt: new Date(area.updated_at ?? 0)
      }));

      setAreas(formattedAreas);
    } catch (error) {
      console.error('Error loading areas:', error);
    }
  }, [institutionId, setAreas]);

  const loadOperations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('operations')
        .select('*')
        .eq('institution_id', institutionId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading operations:', error);
        return;
      }

      const formattedOperations = data.map(operation => ({
        ...operation,
        notes: operation.notes ?? undefined, season_id: operation.season_id ?? undefined,
        areaId: operation.area_id,
        startDate: parseDate(operation.start_date)!,
        endDate: parseDate(operation.end_date),
        nextOperationDate: parseDate(operation.next_operation_date),
        operatedBy: operation.operated_by,
        productsUsed: operation.products_used || [],
        operationSize: operation.operation_size ?? 0,
        yieldPerHectare: operation.yield_per_hectare ?? undefined,
        seedsPerHectare: operation.seeds_per_hectare ?? undefined,
        createdAt: new Date(operation.created_at ?? 0),
        updatedAt: new Date(operation.updated_at ?? 0)
      }));

      setOperations(formattedOperations);
    } catch (error) {
      console.error('Error loading operations:', error);
    }
  }, [institutionId, setOperations]);

  const loadProducts = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading products:', error);
        return;
      }

      const catalog = await loadSeedCatalog(institutionId).catch(error => {
        console.error('Error loading seed cultures:', error);
        return null;
      });
      if (catalog) setSeedCrops(catalog.names);
      const formattedProducts = (data as ProductRow[]).map(product => toInventoryProduct(product, catalog?.byProduct.get(product.id)));

      setProducts(previous => {
        if (catalog) return formattedProducts;
        const previousCrops = new Map(previous.map(product => [product.id, product.crop]));
        return formattedProducts.map(product => ({ ...product, crop: previousCrops.get(product.id) }));
      });
    } catch (error) {
      console.error('Error loading products:', error);
    }
  }, [institutionId, setProducts, setSeedCrops]);

  const loadProductLots = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('product_lots')
        .select('*, products!inner(institution_id)')
        .eq('products.institution_id', institutionId)
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
        createdAt: new Date(lot.created_at ?? 0),
        updatedAt: new Date(lot.updated_at ?? 0),
        archivedAt: lot.archived_at ? new Date(lot.archived_at) : undefined
      }));

      setProductLots(formattedLots);
    } catch (error) {
      console.error('Error loading product lots:', error);
    }
  }, [institutionId, setProductLots]);

  const loadSeasons = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('seasons')
        .select('*')
        .eq('institution_id', institutionId)
        .order('start_date', { ascending: false });

      if (error) {
        console.error('Error loading seasons:', error);
        if (error.code === 'PGRST205') {
          setSeasons([]);
          return;
        }
        throw error;
      }

      setSeasons(data || []);
    } catch (error) {
      console.error('Error loading seasons:', error);
    }
  }, [institutionId, setSeasons]);

  useEffect(() => {
    if (isOnline && institutionId) {
      loadAreas();
      loadOperations();
      loadProducts();
      loadProductLots();
      loadSeasons();
    }
  }, [isOnline, institutionId, loadAreas, loadOperations, loadProducts, loadProductLots, loadSeasons]);

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

      const { data, error } = await insertBusinessRecord<Omit<Area, 'createdAt' | 'updatedAt'> & StoredDates>('areas', {
          name: area.name, size: area.size, unit: area.unit, location: area.location,
          description: area.description,
          user_id: user.id, institution_id: userProfile.institution_id
        });

      if (error) throw error;

      const newArea: Area = {
        ...data, description: data.description ?? undefined, geometry: data.geometry ?? undefined, current_crop: data.current_crop || undefined, cultivar: data.cultivar || undefined,
        createdAt: new Date(data.created_at ?? 0), updatedAt: new Date(data.updated_at ?? 0)
      };

      setAreas(previous => [newArea, ...previous]);
    } catch (error) {
      console.error('Error adding area:', error);
      throw error;
    }
  };

  const updateArea = async (id: string, updatedData: Partial<Area>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const original = areas.find(item => item.id === id);
      if (!original) throw new Error("Registro indisponível. Atualize a página.");
      const expected = updatedData.updatedAt ?? original.updatedAt;
      const { data, error } = await supabase
        .from('areas')
        .update({
          name: updatedData.name, size: updatedData.size, unit: updatedData.unit,
          location: updatedData.location, description: updatedData.description,
        })
        .eq('id', id)
        .gte('updated_at', expected.toISOString())
        .lt('updated_at', new Date(expected.getTime() + 1).toISOString())
        .select()
        .single();

      if (error) throw error;

      const updatedArea: Area = {
        ...data, description: data.description ?? undefined, geometry: data.geometry ?? undefined, current_crop: data.current_crop || undefined, cultivar: data.cultivar || undefined,
        createdAt: new Date(data.created_at ?? 0), updatedAt: new Date(data.updated_at ?? 0)
      };

      setAreas(previous => previous.map(area => area.id === id ? updatedArea : area));
    } catch (error) {
      console.error('Error updating area:', error);
      throw error;
    }
  };

  const deleteArea = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.from('areas').delete().eq('id', id).select('id').single();
      if (error) throw error;

      setAreas(previous => previous.filter(area => area.id !== id));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('23503') || msg.includes('restrict') || msg.includes('RESTRICT')) {
        throw new Error('Esta área possui operações vinculadas e não pode ser excluída.');
      }
      console.error('Error deleting area:', error);
      throw error;
    }
  };

  const getAreaById = (id: string) => seasonalAreas.find((area) => area.id === id);

  const archiveDepletedLots = async (productsUsed: Operation['productsUsed']) => {
    const lotIds = new Set<string>();
    productsUsed.forEach((item) => {
      if (typeof item.lotId === 'string' && item.lotId) lotIds.add(item.lotId);
      const allocations = Array.isArray(item.lotAllocations) ? item.lotAllocations : [];
      allocations.forEach((alloc: { lotId?: string | null }) => {
        if (alloc.lotId) lotIds.add(alloc.lotId);
      });
    });
    if (lotIds.size === 0) return;

    const { data, error } = await supabase
      .from('product_lots')
      .select('id')
      .in('id', [...lotIds])
      .eq('quantity', 0)
      .is('archived_at', null);
    if (error) throw error;

    for (const lot of data ?? []) {
      const { error: archiveError } = await auditedStockRpc('archive_product_lot', { p_lot_id: lot.id });
      if (archiveError) throw archiveError;
    }
    if ((data ?? []).length > 0) await loadProductLots();
  };

  const addOperation = async (operation: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>, recommendationId?: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);
    if (!activeSeason) throw new Error('No active season selected');

    try {
      const used = operation.productsUsed ?? [];
      const plantingProducts = operation.type === 'plantio' ? snapshotPlantingSeeds(used, products) : used;
      const payload = {
        p_start_date: dateToDateString(operation.startDate)!,
        p_description: operation.description,
        p_operated_by: operation.operatedBy,
        p_end_date: dateToDateString(operation.endDate),
        p_next_operation_date: dateToDateString(operation.nextOperationDate),
        p_notes: operation.notes || null,
        p_products_used: plantingProducts.map(({ lotAllocations, ...product }) => ({
          ...product, lotAllocations: lotAllocations?.map(allocation => ({ ...allocation }))
        })),
        p_operation_size: operation.operationSize ?? null,
        p_yield_per_hectare: operation.yieldPerHectare ?? null,
        p_seeds_per_hectare: operation.seedsPerHectare ?? null,
      };

      if (recommendationId) {
        await executeFieldRecommendation(recommendationId, payload);
        await Promise.all([loadOperations(), loadProducts(), loadProductLots()]);
        return;
      }

      const args = {
        ...payload,
        p_area_id: operation.areaId,
        p_type: operation.type,
        p_season_id: activeSeason.id,
      };
      const data = await writeOperationRequest<StoredOperation>('create', Object.fromEntries(Object.entries(args).map(([key, value]) => [key.slice(2), value])));

      const newOperation: Operation = {
        ...data, notes: data.notes ?? undefined, season_id: data.season_id ?? undefined, areaId: data.area_id, startDate: parseDate(data.start_date)!,
        endDate: parseDate(data.end_date), nextOperationDate: parseDate(data.next_operation_date),
        operatedBy: data.operated_by, productsUsed: data.products_used || [],
        operationSize: data.operation_size ?? 0, yieldPerHectare: data.yield_per_hectare ?? undefined,
        seedsPerHectare: data.seeds_per_hectare ?? undefined, createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setOperations(previous => [newOperation, ...previous]);

      await loadProducts();
      await loadProductLots();
      await archiveDepletedLots(data.products_used || []).catch((archiveError) => console.error('Error archiving depleted lots:', archiveError));
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

      const used = updatedData.productsUsed ?? originalOperation.productsUsed ?? [];
      const type = updatedData.type ?? originalOperation.type;
      const plantingProducts = type === 'plantio' ? snapshotPlantingSeeds(used, products, originalOperation.productsUsed) : used;
      const args = {
        p_operation_id: id,
        p_area_id: updatedData.areaId ?? originalOperation.areaId,
        p_type: updatedData.type ?? originalOperation.type,
        p_start_date: dateToDateString(updatedData.startDate ?? originalOperation.startDate),
        p_description: updatedData.description ?? originalOperation.description,
        p_operated_by: updatedData.operatedBy ?? originalOperation.operatedBy,
        p_season_id: originalOperation.season_id ?? null,
        p_end_date: dateToDateString('endDate' in updatedData ? updatedData.endDate : originalOperation.endDate),
        p_next_operation_date: dateToDateString('nextOperationDate' in updatedData ? updatedData.nextOperationDate : originalOperation.nextOperationDate),
        p_notes: updatedData.notes !== undefined ? updatedData.notes : (originalOperation.notes || null),
        p_products_used: plantingProducts,
        p_operation_size: updatedData.operationSize ?? originalOperation.operationSize ?? null,
        p_yield_per_hectare: updatedData.yieldPerHectare !== undefined ? updatedData.yieldPerHectare ?? null : (originalOperation.yieldPerHectare ?? null),
        p_seeds_per_hectare: updatedData.seedsPerHectare !== undefined ? updatedData.seedsPerHectare ?? null : (originalOperation.seedsPerHectare ?? null),
      };
      const data = await writeOperationRequest<StoredOperation>('update', {
        ...Object.fromEntries(Object.entries(args).map(([key, value]) => [key.slice(2), value])), id,
        expected_updated_at: (updatedData.updatedAt ?? originalOperation.updatedAt).toISOString(),
      });

      const updatedOperation: Operation = {
        ...data, notes: data.notes ?? undefined, season_id: data.season_id ?? undefined, areaId: data.area_id, startDate: parseDate(data.start_date)!,
        endDate: parseDate(data.end_date), nextOperationDate: parseDate(data.next_operation_date),
        operatedBy: data.operated_by, productsUsed: data.products_used || [],
        operationSize: data.operation_size ?? 0, yieldPerHectare: data.yield_per_hectare ?? undefined,
        seedsPerHectare: data.seeds_per_hectare ?? undefined, createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setOperations(previous => previous.map(operation =>
        operation.id === id ? updatedOperation : operation
      ));

      await loadProducts();
      await loadProductLots();
      await archiveDepletedLots(data.products_used || []).catch((archiveError) => console.error('Error archiving depleted lots:', archiveError));
    } catch (error) {
      console.error('Error updating operation:', error);
      throw error;
    }
  };

  const deleteOperation = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const original = operations.find(operation => operation.id === id);
      if (!original) throw new Error('Operação indisponível. Atualize a página.');
      await writeOperationRequest('cancel', { id, expected_updated_at: original.updatedAt.toISOString() });

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

      const payload = {
        p_name: product.name,
        p_category: product.category,
        p_unit: product.unit,
        p_min_stock_level: product.minStockLevel,
        p_price: product.price,
        p_supplier: product.supplier ?? null,
        p_description: product.description ?? null,
        p_untracked_quantity: untrackedQuantity ?? 0,
        p_lots: lotsJsonb,
      };
      const crop = isSeedCategory(product.category) ? product.crop?.trim() : undefined;
      const { data, error } = await createProductWithCrop(payload, crop);
      if (error) throw error;
      const newProduct = toInventoryProduct(data.product, crop);

      setProducts(previous => [newProduct, ...previous]);
      if (crop) setSeedCrops(previous => [...new Set([...previous, crop])]);

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
      const payload = {
        p_product_id: id,
        p_name: updatedData.name,
        p_category: updatedData.category,
        p_unit: updatedData.unit,
        p_min_stock_level: updatedData.minStockLevel,
        p_price: updatedData.price,
        p_supplier: updatedData.supplier ?? null,
        p_description: updatedData.description ?? null,
        p_expected_updated_at: expectedUpdatedAt?.toISOString() ?? null,
      };
      const previousProduct = products.find(product => product.id === id);
      const crop = isSeedCategory(updatedData.category ?? previousProduct?.category ?? '')
        ? (updatedData.crop ?? previousProduct?.crop)?.trim() || undefined : undefined;
      const { data, error } = await updateProductWithCrop(payload,
        crop || previousProduct?.crop || updatedData.crop !== undefined ? crop ?? null : undefined);
      if (error) throw error;
      const updatedProduct = toInventoryProduct(data, crop);

      setProducts(previous => previous.map(product => product.id === id ? updatedProduct : product));
      if (crop) setSeedCrops(previous => [...new Set([...previous, crop])]);
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase.from('products').delete().eq('id', id).select('id').single();
      if (error) throw error;

      setProducts(previous => previous.filter(product => product.id !== id));
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
      const { data, error } = await auditedStockRpc<{ id: string; product_id: string; lot_number: string; quantity: number; expiration_date: string | null; created_at: string; updated_at: string }>('create_product_lot', {
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
        createdAt: new Date(data.created_at ?? 0), updatedAt: new Date(data.updated_at ?? 0)
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
      const { data, error } = await auditedStockRpc<{ id: string; product_id: string; lot_number: string; quantity: number; expiration_date: string | null; created_at: string; updated_at: string }>('update_product_lot', {
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
        createdAt: new Date(data.created_at ?? 0), updatedAt: new Date(data.updated_at ?? 0)
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
      const { error } = await auditedStockRpc('delete_product_lot', {
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
      const { error } = await auditedStockRpc('add_inventory_stock', {
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
    notes?: string | null,
    expectedQuantity?: number
  ) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await auditedStockRpc('adjust_inventory_stock', {
        p_product_id: productId,
        p_target_quantity: targetQuantity,
        p_expected_quantity: expectedQuantity ?? null,
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
      const { error } = await auditedStockRpc('archive_product_lot', {
        p_lot_id: lotId,
      });

      if (error) throw error;

      await loadProductLots();
    } catch (error) {
      console.error('Error archiving lot:', error);
      throw error;
    }
  };

  const receiveProductLot = async (
    productId: string,
    quantity: number,
    idempotencyKey: string,
    lotNumber?: string | null,
    expirationDate?: string | null,
    reason?: string | null,
    notes?: string | null,
    unitCost?: number | null
  ) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await auditedStockRpc('receive_product_lot', {
        p_product_id: productId,
        p_quantity: quantity,
        p_idempotency_key: idempotencyKey,
        p_lot_number: lotNumber ?? null,
        p_expiration_date: expirationDate ?? null,
        p_reason: reason ?? null,
        p_notes: notes ?? null,
        p_unit_cost: unitCost ?? null,
      });

      if (error) throw error;

      await loadProducts();
      await loadProductLots();
    } catch (error) {
      console.error('Error receiving product lot:', error);
      throw error;
    }
  };

  const classifyUntrackedStock = async (
    productId: string,
    quantity: number,
    lotNumber: string,
    expirationDate?: string | null,
    notes?: string | null
  ) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await auditedStockRpc('classify_untracked_stock', {
        p_product_id: productId,
        p_quantity: quantity,
        p_lot_number: lotNumber,
        p_expiration_date: expirationDate ?? null,
        p_notes: notes ?? null,
      });

      if (error) throw error;

      await loadProductLots();
    } catch (error) {
      console.error('Error classifying untracked stock:', error);
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
        .eq('id', areaId).select('id').single();

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
    if (!scope) return [];
    const cacheKey = 'agrigest:v2:' + scope + ':map:' + seasonId;
    const mergeAreas = (summaries: AreaMapSummary[]) => {
      const plantings = plantingsForSeason(operations, seasonId);
      const byId = new Map(summaries.map(summary => {
        const geometry = parseAreaBoundary(summary.geojson);
        const details = plantingDetails(plantings.get(summary.areaId), products);
        return [summary.areaId, { ...summary, currentCrop: details.current_crop ?? null, cultivar: details.cultivar ?? null, geojson: geometry ? JSON.stringify(geometry) : null }];
      }));
      for (const area of areas) {
        const summary = byId.get(area.id);
        const geometry = parseAreaBoundary(area.geometry) ?? parseAreaBoundary(summary?.geojson);
        const details = plantingDetails(plantings.get(area.id), products);
        byId.set(area.id, {
          lastOperationDate: null, lastFungicideDate: null, lastInsecticideDate: null,
          lastHerbicideDate: null, lastDessecacaoDate: null, nextOperationDate: null,
          ...summary,
          areaId: area.id, areaName: area.name, areaSize: area.size, areaUnit: area.unit,
          currentCrop: details.current_crop ?? null,
          cultivar: details.cultivar ?? null,
          geojson: geometry ? JSON.stringify(geometry) : null,
        });
      }
      return Array.from(byId.values()).sort((a, b) => a.areaName.localeCompare(b.areaName));
    };
    if (!isOnline) return mergeAreas(readOfflineValue(cacheKey, []));
    try {
      const { data, error } = await supabase.rpc('get_area_map_summary', {
        season_id_param: seasonId,
      });

      if (error) throw error;

      const summary = (data || []).map((row: Record<string, unknown>) => ({
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
      writeOfflineValue(cacheKey, summary);
      return mergeAreas(summary);
    } catch (error) {
      console.error('Error loading area map summary:', error);
      return mergeAreas(readOfflineValue(cacheKey, []));
    }
  }, [areas, isOnline, operations, products, scope]);

  const value: AppContextType = {
    profile,
    reloadProfile,
    areas: seasonalAreas, addArea, updateArea, deleteArea, getAreaById,
    operations: operations.filter(op => !activeSeason || op.season_id === activeSeason.id),
    addOperation, updateOperation, deleteOperation, getOperationsByAreaId,
    products, addProduct, updateProduct, deleteProduct, getProductById,
    productLots, addLot, updateLot, deleteLot, getLotsByProductId,
  addInventoryStock, adjustInventoryStock, archiveLot,
  reloadInventory: async () => { await Promise.all([loadProducts(), loadProductLots()]); },
  receiveProductLot, classifyUntrackedStock,
    seasons, reloadSeasons: loadSeasons, seedCrops, activeSeason, setActiveSeason,
    isOnline,
    saveAreaGeometry, deleteAreaGeometry, getAreaMapSummary
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
