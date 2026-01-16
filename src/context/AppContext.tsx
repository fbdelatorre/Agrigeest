import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  Area,
  Operation,
  Product,
  ProductUsage
} from '../types';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';
import { dateToISOString, dateToDateString, parseDate } from '../utils/dateHelpers';

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
  // User profile
  profile: UserProfile | null;
  
  // Areas
  areas: Area[];
  addArea: (area: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateArea: (id: string, area: Partial<Area>) => Promise<void>;
  deleteArea: (id: string) => Promise<void>;
  getAreaById: (id: string) => Area | undefined;
  
  // Operations
  operations: Operation[];
  addOperation: (operation: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateOperation: (id: string, operation: Partial<Operation>) => Promise<void>;
  deleteOperation: (id: string) => Promise<void>;
  getOperationsByAreaId: (areaId: string) => Operation[];
  
  // Products
  products: Product[];
  addProduct: (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateProduct: (id: string, product: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  getProductById: (id: string) => Product | undefined;
  useProducts: (usages: ProductUsage[]) => Promise<boolean>;

  // Seasons
  seasons: Season[];
  activeSeason: Season | null;
  setActiveSeason: (season: Season | null) => void;
  
  // Network status
  isOnline: boolean;
  hasPendingSync: boolean;
  syncData: () => Promise<void>;
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
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [hasPendingSync, setHasPendingSync] = useState(false);
  
  // Network status
  const { isOnline } = useNetworkStatus();
  
  // Offline storage
  const { 
    data: offlineAreas,
    setData: setOfflineAreas,
    pendingSync: areasPendingSync,
    markAsSynced: markAreasSynced
  } = useOfflineStorage<Area[]>('areas', []);
  
  const { 
    data: offlineOperations,
    setData: setOfflineOperations,
    pendingSync: operationsPendingSync,
    markAsSynced: markOperationsSynced
  } = useOfflineStorage<Operation[]>('operations', []);
  
  const { 
    data: offlineProducts,
    setData: setOfflineProducts,
    pendingSync: productsPendingSync,
    markAsSynced: markProductsSynced
  } = useOfflineStorage<Product[]>('products', []);
  
  const {
    data: offlineSeasons,
    setData: setOfflineSeasons,
    pendingSync: seasonsPendingSync,
    markAsSynced: markSeasonsSynced
  } = useOfflineStorage<Season[]>('seasons', []);

  // Load initial data
  useEffect(() => {
    loadUserProfile();
    
    if (isOnline) {
      loadAreas();
      loadOperations();
      loadProducts();
      loadSeasons();
      
      // Check if there's pending sync when coming back online
      if (areasPendingSync || operationsPendingSync || productsPendingSync || seasonsPendingSync) {
        setHasPendingSync(true);
      }
    } else {
      // Use offline data
      setAreas(offlineAreas);
      setOperations(offlineOperations);
      setProducts(offlineProducts);
      setSeasons(offlineSeasons);
      
      // Check if there's pending sync
      setHasPendingSync(areasPendingSync || operationsPendingSync || productsPendingSync || seasonsPendingSync);
    }
  }, [isOnline]);

  // Load user profile
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

  // Load functions
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
      setOfflineAreas(formattedAreas, false);
    } catch (error) {
      console.error('Error loading areas:', error);
    }
  };

  const loadOperations = async () => {
    try {
      const { data, error } = await supabase
        .from('operations')
        .select('*')
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
      setOfflineOperations(formattedOperations, false);
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
      setOfflineProducts(formattedProducts, false);
    } catch (error) {
      console.error('Error loading products:', error);
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
        // If seasons table doesn't exist yet, just set empty array
        if (error.code === 'PGRST205') {
          setSeasons([]);
          setOfflineSeasons([], false);
          return;
        }
        throw error;
      }

      setSeasons(data || []);
      setOfflineSeasons(data || [], false);

      // Set active season
      const activeSeason = data?.find(season => season.status === 'active');
      if (activeSeason) {
        setActiveSeason(activeSeason);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
      // Set empty seasons array on error to prevent app crash
      setSeasons([]);
      setOfflineSeasons([], false);
    }
  };

  // Area functions
  const addArea = async (area: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to add an area');
      }

      if (!isOnline) {
        // Modo offline: salva localmente para sincronização posterior
        const newArea: Area = {
          ...area,
          id: `local-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const updatedAreas = [newArea, ...areas];
        setAreas(updatedAreas);
        setOfflineAreas(updatedAreas, true);
        setHasPendingSync(true);
        return;
      }

      // Get the user's institution_id
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
          name: area.name,
          size: area.size,
          unit: area.unit,
          location: area.location,
          description: area.description,
          current_crop: area.current_crop,
          cultivar: area.cultivar,
          user_id: user.id,
          institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding area:', error);
        throw error;
      }

      const newArea: Area = {
        ...data,
        current_crop: data.current_crop || undefined,
        cultivar: data.cultivar || undefined,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedAreas = [newArea, ...areas];
      setAreas(updatedAreas);
      setOfflineAreas(updatedAreas, false);
    } catch (error) {
      console.error('Error adding area:', error);
      throw error;
    }
  };

  const updateArea = async (id: string, updatedData: Partial<Area>) => {
    if (!isOnline) {
      // Modo offline: atualiza localmente para sincronização posterior
      const updatedAreas = areas.map(area => 
        area.id === id ? { ...area, ...updatedData, updatedAt: new Date() } : area
      );
      
      setAreas(updatedAreas);
      setOfflineAreas(updatedAreas, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('areas')
        .update({
          name: updatedData.name,
          size: updatedData.size,
          unit: updatedData.unit,
          location: updatedData.location,
          description: updatedData.description,
          current_crop: updatedData.current_crop,
          cultivar: updatedData.cultivar
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating area:', error);
        throw error;
      }

      const updatedArea: Area = {
        ...data,
        current_crop: data.current_crop || undefined,
        cultivar: data.cultivar || undefined,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedAreas = areas.map(area => 
        area.id === id ? updatedArea : area
      );
      
      setAreas(updatedAreas);
      setOfflineAreas(updatedAreas, false);
    } catch (error) {
      console.error('Error updating area:', error);
      throw error;
    }
  };

  const deleteArea = async (id: string) => {
    if (!isOnline) {
      // Modo offline: marca para exclusão na sincronização
      const updatedAreas = areas.filter(area => area.id !== id);
      setAreas(updatedAreas);
      setOfflineAreas(updatedAreas, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('areas')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting area:', error);
        throw error;
      }

      const updatedAreas = areas.filter(area => area.id !== id);
      setAreas(updatedAreas);
      setOfflineAreas(updatedAreas, false);
    } catch (error) {
      console.error('Error deleting area:', error);
      throw error;
    }
  };

  const getAreaById = (id: string) => {
    return areas.find((area) => area.id === id);
  };

  // Operation functions
  const addOperation = async (operation: Omit<Operation, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!activeSeason) {
      throw new Error('No active season selected');
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('User must be authenticated to add an operation');
      }

      // First, check and update product quantities (if any products are used)
      if (operation.productsUsed && operation.productsUsed.length > 0) {
        await useProducts(operation.productsUsed);
      }

      if (!isOnline) {
        // Modo offline: salva localmente para sincronização posterior
        const newOperation: Operation = {
          ...operation,
          id: `local-${Date.now()}`,
          season_id: activeSeason.id,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const updatedOperations = [newOperation, ...operations];
        setOperations(updatedOperations);
        setOfflineOperations(updatedOperations, true);
        setHasPendingSync(true);
        return;
      }

      // Get the user's institution_id
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add an operation');
      }

      const { data, error } = await supabase
        .from('operations')
        .insert([{
          area_id: operation.areaId,
          season_id: activeSeason.id,
          type: operation.type,
          start_date: dateToDateString(operation.startDate),
          end_date: dateToDateString(operation.endDate),
          next_operation_date: dateToDateString(operation.nextOperationDate),
          description: operation.description,
          operated_by: operation.operatedBy,
          notes: operation.notes,
          products_used: operation.productsUsed || [],
          operation_size: operation.operationSize,
          yield_per_hectare: operation.yieldPerHectare,
          seeds_per_hectare: operation.seedsPerHectare,
          user_id: user.id,
          institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding operation:', error);
        throw error;
      }

      const newOperation: Operation = {
        ...data,
        areaId: data.area_id,
        startDate: parseDate(data.start_date)!,
        endDate: parseDate(data.end_date),
        nextOperationDate: parseDate(data.next_operation_date),
        operatedBy: data.operated_by,
        productsUsed: data.products_used || [],
        operationSize: data.operation_size ?? 0,
        yieldPerHectare: data.yield_per_hectare,
        seedsPerHectare: data.seeds_per_hectare,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedOperations = [newOperation, ...operations];
      setOperations(updatedOperations);
      setOfflineOperations(updatedOperations, false);
    } catch (error) {
      console.error('Error adding operation:', error);
      throw error;
    }
  };

  const updateOperation = async (id: string, updatedData: Partial<Operation>) => {
    try {
      // Find the original operation to compare product changes
      const originalOperation = operations.find(op => op.id === id);

      if (!originalOperation) {
        throw new Error('Operation not found');
      }

      // Adjust product quantities if products have changed
      if (updatedData.productsUsed) {
        const oldProducts = originalOperation.productsUsed || [];
        const newProducts = updatedData.productsUsed || [];

        // Check if products actually changed
        const productsChanged = JSON.stringify(oldProducts) !== JSON.stringify(newProducts);

        if (productsChanged) {
          // Return old products to stock
          if (oldProducts.length > 0) {
            await returnProducts(oldProducts);
          }

          // Deduct new products from stock
          if (newProducts.length > 0) {
            await useProducts(newProducts);
          }
        }
      }

      if (!isOnline) {
        // Modo offline: atualiza localmente para sincronização posterior
        const updatedOperations = operations.map(operation =>
          operation.id === id ? { ...operation, ...updatedData, updatedAt: new Date() } : operation
        );

        setOperations(updatedOperations);
        setOfflineOperations(updatedOperations, true);
        setHasPendingSync(true);
        return;
      }

      // Build update object only with provided fields
      const updateFields: any = {};

      if (updatedData.areaId !== undefined) updateFields.area_id = updatedData.areaId;
      if (updatedData.type !== undefined) updateFields.type = updatedData.type;
      if (updatedData.startDate !== undefined) updateFields.start_date = dateToDateString(updatedData.startDate);
      if (updatedData.endDate !== undefined) updateFields.end_date = dateToDateString(updatedData.endDate);
      if (updatedData.nextOperationDate !== undefined) updateFields.next_operation_date = dateToDateString(updatedData.nextOperationDate);
      if (updatedData.description !== undefined) updateFields.description = updatedData.description;
      if (updatedData.operatedBy !== undefined) updateFields.operated_by = updatedData.operatedBy;
      if (updatedData.notes !== undefined) updateFields.notes = updatedData.notes;
      if (updatedData.productsUsed !== undefined) updateFields.products_used = updatedData.productsUsed;
      if (updatedData.operationSize !== undefined) updateFields.operation_size = updatedData.operationSize;
      if (updatedData.yieldPerHectare !== undefined) updateFields.yield_per_hectare = updatedData.yieldPerHectare;
      if (updatedData.seedsPerHectare !== undefined) updateFields.seeds_per_hectare = updatedData.seedsPerHectare;

      const { data, error } = await supabase
        .from('operations')
        .update(updateFields)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating operation:', error);
        throw error;
      }

      const updatedOperation: Operation = {
        ...data,
        areaId: data.area_id,
        startDate: parseDate(data.start_date)!,
        endDate: parseDate(data.end_date),
        nextOperationDate: parseDate(data.next_operation_date),
        operatedBy: data.operated_by,
        productsUsed: data.products_used || [],
        operationSize: data.operation_size ?? 0,
        yieldPerHectare: data.yield_per_hectare,
        seedsPerHectare: data.seeds_per_hectare,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedOperations = operations.map(operation =>
        operation.id === id ? updatedOperation : operation
      );

      setOperations(updatedOperations);
      setOfflineOperations(updatedOperations, false);
    } catch (error) {
      console.error('Error updating operation:', error);
      throw error;
    }
  };

  const deleteOperation = async (id: string) => {
    try {
      // Find the operation to get its products
      const operation = operations.find(op => op.id === id);

      if (operation && operation.productsUsed && operation.productsUsed.length > 0) {
        // Return products to stock before deleting
        await returnProducts(operation.productsUsed);
      }

      if (!isOnline) {
        // Modo offline: marca para exclusão na sincronização
        const updatedOperations = operations.filter(operation => operation.id !== id);
        setOperations(updatedOperations);
        setOfflineOperations(updatedOperations, true);
        setHasPendingSync(true);
        return;
      }

      const { error } = await supabase
        .from('operations')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting operation:', error);
        throw error;
      }

      const updatedOperations = operations.filter(operation => operation.id !== id);
      setOperations(updatedOperations);
      setOfflineOperations(updatedOperations, false);
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

  // Product functions
  const addProduct = async (product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to add a product');
      }

      if (!isOnline) {
        // Modo offline: salva localmente para sincronização posterior
        const newProduct: Product = {
          ...product,
          id: `local-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const updatedProducts = [newProduct, ...products];
        setProducts(updatedProducts);
        setOfflineProducts(updatedProducts, true);
        setHasPendingSync(true);
        return;
      }

      // Get the user's institution_id
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add a product');
      }

      const { data, error } = await supabase
        .from('products')
        .insert([{
          name: product.name,
          category: product.category,
          unit: product.unit,
          quantity_in_stock: product.quantityInStock,
          min_stock_level: product.minStockLevel,
          price: product.price,
          supplier: product.supplier,
          description: product.description,
          institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding product:', error);
        throw error;
      }

      const newProduct: Product = {
        ...data,
        quantityInStock: data.quantity_in_stock,
        minStockLevel: data.min_stock_level,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedProducts = [newProduct, ...products];
      setProducts(updatedProducts);
      setOfflineProducts(updatedProducts, false);
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  };

  const updateProduct = async (id: string, updatedData: Partial<Product>) => {
    if (!isOnline) {
      // Modo offline: atualiza localmente para sincronização posterior
      const updatedProducts = products.map(product => 
        product.id === id ? { ...product, ...updatedData, updatedAt: new Date() } : product
      );
      
      setProducts(updatedProducts);
      setOfflineProducts(updatedProducts, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .update({
          name: updatedData.name,
          category: updatedData.category,
          unit: updatedData.unit,
          quantity_in_stock: updatedData.quantityInStock,
          min_stock_level: updatedData.minStockLevel,
          price: updatedData.price,
          supplier: updatedData.supplier,
          description: updatedData.description,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating product:', error);
        throw error;
      }

      const updatedProduct: Product = {
        ...data,
        quantityInStock: data.quantity_in_stock,
        minStockLevel: data.min_stock_level,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedProducts = products.map(product => 
        product.id === id ? updatedProduct : product
      );
      
      setProducts(updatedProducts);
      setOfflineProducts(updatedProducts, false);
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  };

  const deleteProduct = async (id: string) => {
    if (!isOnline) {
      // Modo offline: marca para exclusão na sincronização
      const updatedProducts = products.filter(product => product.id !== id);
      setProducts(updatedProducts);
      setOfflineProducts(updatedProducts, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting product:', error);
        throw error;
      }

      const updatedProducts = products.filter(product => product.id !== id);
      setProducts(updatedProducts);
      setOfflineProducts(updatedProducts, false);
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  };

  const getProductById = (id: string) => {
    return products.find((product) => product.id === id);
  };

  // Return products to stock (used when updating or deleting operations)
  const returnProducts = async (usages: ProductUsage[]): Promise<boolean> => {
    if (usages.length === 0) {
      return true;
    }

    try {
      console.log('Returning products to stock:', usages);

      // Calculate new quantities for all products (adding back)
      const updatedProducts = products.map(product => {
        const usage = usages.find(u => u.productId === product.id);
        if (usage) {
          return {
            ...product,
            quantityInStock: product.quantityInStock + usage.quantity,
            updatedAt: new Date()
          };
        }
        return product;
      });

      if (!isOnline) {
        // Modo offline: atualiza localmente
        setProducts(updatedProducts);
        setOfflineProducts(updatedProducts, true);
        setHasPendingSync(true);
        return true;
      }

      // Update each product in database
      const updatePromises = usages.map(async (usage) => {
        const product = products.find(p => p.id === usage.productId);
        if (!product) return;

        const newQuantity = product.quantityInStock + usage.quantity;

        console.log(`Returning ${usage.quantity} ${product.unit} of ${product.name}. New stock: ${newQuantity}`);

        const { error } = await supabase
          .from('products')
          .update({ quantity_in_stock: newQuantity })
          .eq('id', product.id);

        if (error) {
          console.error('Error returning product quantity:', error);
          throw error;
        }
      });

      // Wait for all database updates to complete
      await Promise.all(updatePromises);

      // Update local state once after all database updates
      setProducts(updatedProducts);
      setOfflineProducts(updatedProducts, false);

      return true;
    } catch (error) {
      console.error('Error returning products:', error);
      throw error;
    }
  };

  // Use products for an operation
  const useProducts = async (usages: ProductUsage[]): Promise<boolean> => {
    if (usages.length === 0) {
      return true;
    }

    try {
      console.log('Using products from stock:', usages);

      // Check if we have enough of each product
      const insufficientProducts: string[] = [];
      for (const usage of usages) {
        const product = products.find(p => p.id === usage.productId);
        if (!product) {
          console.error(`Product not found: ${usage.productId}`);
          insufficientProducts.push('Produto desconhecido');
          continue;
        }
        if (product.quantityInStock < usage.quantity) {
          console.error(`Insufficient stock for product ${product.name}: needed ${usage.quantity}, available ${product.quantityInStock}`);
          insufficientProducts.push(`${product.name} (disponível: ${product.quantityInStock} ${product.unit}, necessário: ${usage.quantity} ${product.unit})`);
        }
      }

      if (insufficientProducts.length > 0) {
        const errorMsg = `Insufficient product quantity in stock: ${insufficientProducts.join(', ')}`;
        throw new Error(errorMsg);
      }

      // Calculate new quantities for all products
      const updatedProducts = products.map(product => {
        const usage = usages.find(u => u.productId === product.id);
        if (usage) {
          return {
            ...product,
            quantityInStock: product.quantityInStock - usage.quantity,
            updatedAt: new Date()
          };
        }
        return product;
      });

      if (!isOnline) {
        // Modo offline: atualiza localmente
        setProducts(updatedProducts);
        setOfflineProducts(updatedProducts, true);
        setHasPendingSync(true);
        return true;
      }

      // Update each product in database
      const updatePromises = usages.map(async (usage) => {
        const product = products.find(p => p.id === usage.productId);
        if (!product) return;

        const newQuantity = product.quantityInStock - usage.quantity;

        console.log(`Using ${usage.quantity} ${product.unit} of ${product.name}. New stock: ${newQuantity}`);

        const { error } = await supabase
          .from('products')
          .update({ quantity_in_stock: newQuantity })
          .eq('id', product.id);

        if (error) {
          console.error('Error updating product quantity:', error);
          throw error;
        }
      });

      // Wait for all database updates to complete
      await Promise.all(updatePromises);

      // Update local state once after all database updates
      setProducts(updatedProducts);
      setOfflineProducts(updatedProducts, false);

      return true;
    } catch (error) {
      console.error('Error using products:', error);
      throw error;
    }
  };

  // Sincroniza dados pendentes com o servidor
  const syncData = async () => {
    if (!isOnline) {
      console.log('Não é possível sincronizar dados offline');
      return;
    }
    
    try {
      console.log('Iniciando sincronização de dados...');
      
      // Sincronizar áreas
      if (areasPendingSync) {
        await syncAreas();
      }
      
      // Sincronizar operações
      if (operationsPendingSync) {
        await syncOperations();
      }
      
      // Sincronizar produtos
      if (productsPendingSync) {
        await syncProducts();
      }
      
      // Sincronizar safras
      if (seasonsPendingSync) {
        await syncSeasons();
      }
      
      setHasPendingSync(false);
      console.log('Sincronização concluída com sucesso');
      
      // Notificar o service worker que a sincronização foi concluída
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_COMPLETE'
        });
      }
      
      // Disparar evento de sincronização concluída
      window.dispatchEvent(new CustomEvent('sync:complete'));
    } catch (error) {
      console.error('Erro ao sincronizar dados:', error);
      throw error;
    }
  };
  
  // Funções de sincronização específicas
  const syncAreas = async () => {
    try {
      console.log('Sincronizando áreas...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to sync areas');
      }

      // Get the user's institution_id
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to sync areas');
      }
      
      // Processar áreas locais
      for (const area of offlineAreas) {
        // Se o ID começar com "local-", é uma área nova
        if (area.id.startsWith('local-')) {
          // Criar nova área no servidor
          const { data, error } = await supabase
            .from('areas')
            .insert([{
              name: area.name,
              size: area.size,
              unit: area.unit,
              location: area.location,
              description: area.description,
              current_crop: area.current_crop,
              cultivar: area.cultivar,
              user_id: user.id,
              institution_id: userProfile.institution_id
            }])
            .select()
            .single();

          if (error) {
            console.error('Error syncing new area:', error);
            continue;
          }
          
          console.log('Nova área sincronizada:', data.id);
        } 
        // Caso contrário, é uma atualização
        else {
          // Verificar se a área ainda existe no servidor
          const { data: existingArea, error: checkError } = await supabase
            .from('areas')
            .select('id')
            .eq('id', area.id)
            .single();
            
          if (checkError) {
            console.error('Error checking area existence:', checkError);
            continue;
          }
          
          if (existingArea) {
            // Atualizar área existente
            const { error: updateError } = await supabase
              .from('areas')
              .update({
                name: area.name,
                size: area.size,
                unit: area.unit,
                location: area.location,
                description: area.description,
                current_crop: area.current_crop,
                cultivar: area.cultivar
              })
              .eq('id', area.id);

            if (updateError) {
              console.error('Error syncing updated area:', updateError);
              continue;
            }
            
            console.log('Área atualizada sincronizada:', area.id);
          }
        }
      }
      
      // Recarregar áreas do servidor
      await loadAreas();
      
      // Marcar como sincronizado
      markAreasSynced();
      
      console.log('Sincronização de áreas concluída');
    } catch (error) {
      console.error('Error syncing areas:', error);
      throw error;
    }
  };
  
  const syncOperations = async () => {
    try {
      console.log('Sincronizando operações...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to sync operations');
      }

      // Get the user's institution_id
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to sync operations');
      }
      
      // Processar operações locais
      for (const operation of offlineOperations) {
        // Se o ID começar com "local-", é uma operação nova
        if (operation.id.startsWith('local-')) {
          // Criar nova operação no servidor
          const { data, error } = await supabase
            .from('operations')
            .insert([{
              area_id: operation.areaId,
              season_id: operation.season_id,
              type: operation.type,
              start_date: dateToDateString(operation.startDate),
              end_date: dateToDateString(operation.endDate),
              next_operation_date: dateToDateString(operation.nextOperationDate),
              description: operation.description,
              operated_by: operation.operatedBy,
              notes: operation.notes,
              products_used: operation.productsUsed || [],
              operation_size: operation.operationSize,
              yield_per_hectare: operation.yieldPerHectare,
              seeds_per_hectare: operation.seedsPerHectare,
              user_id: user.id,
              institution_id: userProfile.institution_id
            }])
            .select()
            .single();

          if (error) {
            console.error('Error syncing new operation:', error);
            continue;
          }
          
          console.log('Nova operação sincronizada:', data.id);
        } 
        // Caso contrário, é uma atualização
        else {
          // Verificar se a operação ainda existe no servidor
          const { data: existingOperation, error: checkError } = await supabase
            .from('operations')
            .select('id')
            .eq('id', operation.id)
            .single();
            
          if (checkError) {
            console.error('Error checking operation existence:', checkError);
            continue;
          }
          
          if (existingOperation) {
            // Atualizar operação existente
            const { error: updateError } = await supabase
              .from('operations')
              .update({
                area_id: operation.areaId,
                type: operation.type,
                start_date: dateToDateString(operation.startDate),
                end_date: dateToDateString(operation.endDate),
                next_operation_date: dateToDateString(operation.nextOperationDate),
                description: operation.description,
                operated_by: operation.operatedBy,
                notes: operation.notes,
                products_used: operation.productsUsed || [],
                operation_size: operation.operationSize,
                yield_per_hectare: operation.yieldPerHectare,
                seeds_per_hectare: operation.seedsPerHectare
              })
              .eq('id', operation.id);

            if (updateError) {
              console.error('Error syncing updated operation:', updateError);
              continue;
            }
            
            console.log('Operação atualizada sincronizada:', operation.id);
          }
        }
      }
      
      // Recarregar operações do servidor
      await loadOperations();
      
      // Marcar como sincronizado
      markOperationsSynced();
      
      console.log('Sincronização de operações concluída');
    } catch (error) {
      console.error('Error syncing operations:', error);
      throw error;
    }
  };
  
  const syncProducts = async () => {
    try {
      console.log('Sincronizando produtos...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to sync products');
      }

      // Get the user's institution_id
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to sync products');
      }
      
      // Processar produtos locais
      for (const product of offlineProducts) {
        // Se o ID começar com "local-", é um produto novo
        if (product.id.startsWith('local-')) {
          // Criar novo produto no servidor
          const { data, error } = await supabase
            .from('products')
            .insert([{
              name: product.name,
              category: product.category,
              unit: product.unit,
              quantity_in_stock: product.quantityInStock,
              min_stock_level: product.minStockLevel,
              price: product.price,
              supplier: product.supplier,
              description: product.description,
              institution_id: userProfile.institution_id
            }])
            .select()
            .single();

          if (error) {
            console.error('Error syncing new product:', error);
            continue;
          }
          
          console.log('Novo produto sincronizado:', data.id);
        } 
        // Caso contrário, é uma atualização
        else {
          // Verificar se o produto ainda existe no servidor
          const { data: existingProduct, error: checkError } = await supabase
            .from('products')
            .select('id')
            .eq('id', product.id)
            .single();
            
          if (checkError) {
            console.error('Error checking product existence:', checkError);
            continue;
          }
          
          if (existingProduct) {
            // Atualizar produto existente
            const { error: updateError } = await supabase
              .from('products')
              .update({
                name: product.name,
                category: product.category,
                unit: product.unit,
                quantity_in_stock: product.quantityInStock,
                min_stock_level: product.minStockLevel,
                price: product.price,
                supplier: product.supplier,
                description: product.description
              })
              .eq('id', product.id);

            if (updateError) {
              console.error('Error syncing updated product:', updateError);
              continue;
            }
            
            console.log('Produto atualizado sincronizado:', product.id);
          }
        }
      }
      
      // Recarregar produtos do servidor
      await loadProducts();
      
      // Marcar como sincronizado
      markProductsSynced();
      
      console.log('Sincronização de produtos concluída');
    } catch (error) {
      console.error('Error syncing products:', error);
      throw error;
    }
  };
  
  const syncSeasons = async () => {
    try {
      console.log('Sincronizando safras...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to sync seasons');
      }

      // Get the user's institution_id
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to sync seasons');
      }
      
      // Processar safras locais
      for (const season of offlineSeasons) {
        // Se o ID começar com "local-", é uma safra nova
        if (season.id.startsWith('local-')) {
          // Criar nova safra no servidor
          const { data, error } = await supabase
            .from('seasons')
            .insert([{
              name: season.name,
              start_date: season.start_date,
              end_date: season.end_date,
              status: season.status,
              description: season.description,
              user_id: user.id,
              institution_id: userProfile.institution_id
            }])
            .select()
            .single();

          if (error) {
            console.error('Error syncing new season:', error);
            continue;
          }
          
          console.log('Nova safra sincronizada:', data.id);
        } 
        // Caso contrário, é uma atualização
        else {
          // Verificar se a safra ainda existe no servidor
          const { data: existingSeason, error: checkError } = await supabase
            .from('seasons')
            .select('id')
            .eq('id', season.id)
            .single();
            
          if (checkError) {
            console.error('Error checking season existence:', checkError);
            continue;
          }
          
          if (existingSeason) {
            // Atualizar safra existente
            const { error: updateError } = await supabase
              .from('seasons')
              .update({
                name: season.name,
                start_date: season.start_date,
                end_date: season.end_date,
                status: season.status,
                description: season.description
              })
              .eq('id', season.id);

            if (updateError) {
              console.error('Error syncing updated season:', updateError);
              continue;
            }
            
            console.log('Safra atualizada sincronizada:', season.id);
          }
        }
      }
      
      // Recarregar safras do servidor
      await loadSeasons();
      
      // Marcar como sincronizado
      markSeasonsSynced();
      
      console.log('Sincronização de safras concluída');
    } catch (error) {
      console.error('Error syncing seasons:', error);
      throw error;
    }
  };

  // Adicionar listener para eventos de sincronização do service worker
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SYNC_COMPLETE') {
        console.log('Recebido evento de sincronização completa do service worker');
        setHasPendingSync(false);
      }
    };
    
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleMessage);
      
      return () => {
        navigator.serviceWorker.removeEventListener('message', handleMessage);
      };
    }
    
    return undefined;
  }, []);

  // Verificar pendências de sincronização quando ficar online
  useEffect(() => {
    if (isOnline) {
      const pendingItems = JSON.parse(localStorage.getItem('pendingSync') || '[]');
      if (pendingItems.length > 0) {
        setHasPendingSync(true);
      }
    }
  }, [isOnline]);

  // Sincronizar automaticamente quando ficar online
  useEffect(() => {
    const handleOnline = async () => {
      if (hasPendingSync) {
        try {
          await syncData();
        } catch (error) {
          console.error('Erro ao sincronizar automaticamente:', error);
        }
      }
    };
    
    window.addEventListener('online', handleOnline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [hasPendingSync]);

  const value = {
    profile,
    areas,
    addArea,
    updateArea,
    deleteArea,
    getAreaById,
    operations: operations.filter(op => !activeSeason || op.season_id === activeSeason.id),
    addOperation,
    updateOperation,
    deleteOperation,
    getOperationsByAreaId,
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    getProductById,
    useProducts,
    seasons,
    activeSeason,
    setActiveSeason,
    isOnline,
    hasPendingSync,
    syncData
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};