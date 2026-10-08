import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Machinery, MaintenanceType, Maintenance } from '../types/machinery';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';
import { dateToDateString, parseDate } from '../utils/dateHelpers';

const READ_ONLY_MSG = 'Sem conexão. O AgriGest está em modo somente leitura.';

interface MachineryContextType {
  machinery: Machinery[];
  addMachinery: (machinery: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => Promise<void>;
  updateMachinery: (id: string, machinery: Partial<Machinery>) => Promise<void>;
  deleteMachinery: (id: string) => Promise<void>;
  getMachineryById: (id: string) => Machinery | undefined;

  maintenanceTypes: MaintenanceType[];
  addMaintenanceType: (type: Omit<MaintenanceType, 'id' | 'createdAt' | 'userId' | 'institutionId'>) => Promise<MaintenanceType>;
  updateMaintenanceType: (id: string, type: Partial<MaintenanceType>) => Promise<void>;
  deleteMaintenanceType: (id: string) => Promise<void>;

  maintenances: Maintenance[];
  addMaintenance: (maintenance: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => Promise<void>;
  updateMaintenance: (id: string, maintenance: Partial<Maintenance>) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  getMaintenancesByMachineryId: (machineryId: string) => Maintenance[];

  isOnline: boolean;
}

const MachineryContext = createContext<MachineryContextType | undefined>(undefined);

export const useMachineryContext = () => {
  const context = useContext(MachineryContext);
  if (!context) {
    throw new Error('useMachineryContext must be used within a MachineryProvider');
  }
  return context;
};

interface MachineryProviderProps {
  children: ReactNode;
}

export const MachineryProvider: React.FC<MachineryProviderProps> = ({ children }) => {
  const [machinery, setMachinery] = useState<Machinery[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<MaintenanceType[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);

  const { isOnline } = useNetworkStatus();

  const {
    data: cachedMachinery,
    setData: setCachedMachinery,
  } = useOfflineStorage<Machinery[]>('machinery', []);

  const {
    data: cachedMaintenanceTypes,
    setData: setCachedMaintenanceTypes,
  } = useOfflineStorage<MaintenanceType[]>('maintenanceTypes', []);

  const {
    data: cachedMaintenances,
    setData: setCachedMaintenances,
  } = useOfflineStorage<Maintenance[]>('maintenances', []);

  useEffect(() => {
    if (isOnline) {
      loadMachinery();
      loadMaintenanceTypes();
      loadMaintenances();
    } else {
      if (cachedMachinery.length > 0) setMachinery(cachedMachinery);
      if (cachedMaintenanceTypes.length > 0) setMaintenanceTypes(cachedMaintenanceTypes);
      if (cachedMaintenances.length > 0) setMaintenances(cachedMaintenances);
    }
  }, [isOnline]);

  const loadMachinery = async () => {
    try {
      const { data, error } = await supabase
        .from('machinery')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading machinery:', error);
        return;
      }

      const formattedMachinery = data.map(machine => ({
        ...machine,
        userId: machine.user_id,
        institutionId: machine.institution_id,
        createdAt: new Date(machine.created_at),
        updatedAt: new Date(machine.updated_at)
      }));

      setMachinery(formattedMachinery);
      setCachedMachinery(formattedMachinery);
    } catch (error) {
      console.error('Error loading machinery:', error);
    }
  };

  const loadMaintenanceTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('maintenance_types')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading maintenance types:', error);
        return;
      }

      const formattedTypes = data.map(type => ({
        ...type,
        userId: type.user_id,
        institutionId: type.institution_id,
        createdAt: new Date(type.created_at)
      }));

      setMaintenanceTypes(formattedTypes);
      setCachedMaintenanceTypes(formattedTypes);
    } catch (error) {
      console.error('Error loading maintenance types:', error);
    }
  };

  const loadMaintenances = async () => {
    try {
      const { data, error } = await supabase
        .from('maintenances')
        .select('*')
        .order('date', { ascending: false });

      if (error) {
        console.error('Error loading maintenances:', error);
        return;
      }

      const formattedMaintenances = data.map(maintenance => ({
        ...maintenance,
        machineryId: maintenance.machinery_id,
        maintenanceTypeId: maintenance.maintenance_type_id,
        description: maintenance.description,
        materialUsed: maintenance.material_used,
        machineHours: maintenance.machine_hours,
        userId: maintenance.user_id,
        institutionId: maintenance.institution_id,
        date: new Date(maintenance.date),
        createdAt: new Date(maintenance.created_at),
        updatedAt: new Date(maintenance.updated_at)
      }));

      setMaintenances(formattedMaintenances);
      setCachedMaintenances(formattedMaintenances);
    } catch (error) {
      console.error('Error loading maintenances:', error);
    }
  };

  const addMachinery = async (machineryData: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User must be authenticated to add machinery');

      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add machinery');
      }

      const { data, error } = await supabase
        .from('machinery')
        .insert([{
          name: machineryData.name,
          description: machineryData.description,
          model: machineryData.model,
          year: machineryData.year,
          user_id: user.id,
          institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) throw error;

      const newMachinery: Machinery = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedMachinery = [newMachinery, ...machinery];
      setMachinery(updatedMachinery);
      setCachedMachinery(updatedMachinery);
    } catch (error) {
      console.error('Error adding machinery:', error);
      throw error;
    }
  };

  const updateMachinery = async (id: string, updatedData: Partial<Machinery>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data, error } = await supabase
        .from('machinery')
        .update({
          name: updatedData.name,
          description: updatedData.description,
          model: updatedData.model,
          year: updatedData.year
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedMachine: Machinery = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedMachinery = machinery.map(machine =>
        machine.id === id ? updatedMachine : machine
      );

      setMachinery(updatedMachinery);
      setCachedMachinery(updatedMachinery);
    } catch (error) {
      console.error('Error updating machinery:', error);
      throw error;
    }
  };

  const deleteMachinery = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase
        .from('machinery')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const updatedMachinery = machinery.filter(machine => machine.id !== id);
      setMachinery(updatedMachinery);
      setCachedMachinery(updatedMachinery);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('23503') || msg.includes('restrict') || msg.includes('RESTRICT')) {
        throw new Error('Não é possível excluir esta máquina porque existem dados dependentes (manutenções vinculadas).');
      }
      console.error('Error deleting machinery:', error);
      throw error;
    }
  };

  const getMachineryById = (id: string) => {
    return machinery.find((machine) => machine.id === id);
  };

  const addMaintenanceType = async (typeData: Omit<MaintenanceType, 'id' | 'createdAt' | 'userId' | 'institutionId'>): Promise<MaintenanceType> => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User must be authenticated to add maintenance type');

      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add maintenance type');
      }

      const { data, error } = await supabase
        .from('maintenance_types')
        .insert([{
          name: typeData.name,
          description: typeData.description,
          user_id: user.id,
          institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) throw error;

      const newType: MaintenanceType = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at)
      };

      const updatedTypes = [newType, ...maintenanceTypes];
      setMaintenanceTypes(updatedTypes);
      setCachedMaintenanceTypes(updatedTypes);

      return newType;
    } catch (error) {
      console.error('Error adding maintenance type:', error);
      throw error;
    }
  };

  const updateMaintenanceType = async (id: string, updatedData: Partial<MaintenanceType>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data, error } = await supabase
        .from('maintenance_types')
        .update({
          name: updatedData.name,
          description: updatedData.description
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedType: MaintenanceType = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at)
      };

      const updatedTypes = maintenanceTypes.map(type =>
        type.id === id ? updatedType : type
      );

      setMaintenanceTypes(updatedTypes);
      setCachedMaintenanceTypes(updatedTypes);
    } catch (error) {
      console.error('Error updating maintenance type:', error);
      throw error;
    }
  };

  const deleteMaintenanceType = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase
        .from('maintenance_types')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const updatedTypes = maintenanceTypes.filter(type => type.id !== id);
      setMaintenanceTypes(updatedTypes);
      setCachedMaintenanceTypes(updatedTypes);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('23503') || msg.includes('restrict') || msg.includes('RESTRICT')) {
        throw new Error('Não é possível excluir este tipo de manutenção porque existem registros históricos vinculados.');
      }
      console.error('Error deleting maintenance type:', error);
      throw error;
    }
  };

  const addMaintenance = async (maintenanceData: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User must be authenticated to add maintenance');

      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('institution_id')
        .eq('id', user.id)
        .single();

      if (userError || !userProfile?.institution_id) {
        throw new Error('User must belong to an institution to add maintenance');
      }

      const { data, error } = await supabase
        .from('maintenances')
        .insert([{
          machinery_id: maintenanceData.machineryId,
          maintenance_type_id: maintenanceData.maintenanceTypeId,
          description: maintenanceData.description || null,
          material_used: maintenanceData.materialUsed || null,
          date: dateToDateString(maintenanceData.date),
          machine_hours: maintenanceData.machineHours || null,
          cost: maintenanceData.cost || 0,
          notes: maintenanceData.notes || null,
          user_id: user.id,
          institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) throw error;

      const newMaintenance: Maintenance = {
        ...data,
        machineryId: data.machinery_id,
        maintenanceTypeId: data.maintenance_type_id,
        description: data.description,
        materialUsed: data.material_used,
        machineHours: data.machine_hours,
        userId: data.user_id,
        institutionId: data.institution_id,
        date: parseDate(data.date)!,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedMaintenances = [newMaintenance, ...maintenances];
      setMaintenances(updatedMaintenances);
      setCachedMaintenances(updatedMaintenances);
    } catch (error) {
      console.error('Error adding maintenance:', error);
      throw error;
    }
  };

  const updateMaintenance = async (id: string, updatedData: Partial<Maintenance>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { data, error } = await supabase
        .from('maintenances')
        .update({
          machinery_id: updatedData.machineryId,
          maintenance_type_id: updatedData.maintenanceTypeId,
          description: updatedData.description || null,
          material_used: updatedData.materialUsed,
          date: updatedData.date ? dateToDateString(updatedData.date) : undefined,
          machine_hours: updatedData.machineHours,
          cost: updatedData.cost,
          notes: updatedData.notes
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const updatedMaintenance: Maintenance = {
        ...data,
        machineryId: data.machinery_id,
        maintenanceTypeId: data.maintenance_type_id,
        description: data.description,
        materialUsed: data.material_used,
        machineHours: data.machine_hours,
        userId: data.user_id,
        institutionId: data.institution_id,
        date: parseDate(data.date)!,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedMaintenances = maintenances.map(maintenance =>
        maintenance.id === id ? updatedMaintenance : maintenance
      );

      setMaintenances(updatedMaintenances);
      setCachedMaintenances(updatedMaintenances);
    } catch (error) {
      console.error('Error updating maintenance:', error);
      throw error;
    }
  };

  const deleteMaintenance = async (id: string) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const { error } = await supabase
        .from('maintenances')
        .delete()
        .eq('id', id);

      if (error) throw error;

      const updatedMaintenances = maintenances.filter(maintenance => maintenance.id !== id);
      setMaintenances(updatedMaintenances);
      setCachedMaintenances(updatedMaintenances);
    } catch (error) {
      console.error('Error deleting maintenance:', error);
      throw error;
    }
  };

  const getMaintenancesByMachineryId = (machineryId: string) => {
    return maintenances.filter((maintenance) => maintenance.machineryId === machineryId);
  };

  const value = {
    machinery,
    addMachinery,
    updateMachinery,
    deleteMachinery,
    getMachineryById,
    maintenanceTypes,
    addMaintenanceType,
    updateMaintenanceType,
    deleteMaintenanceType,
    maintenances,
    addMaintenance,
    updateMaintenance,
    deleteMaintenance,
    getMaintenancesByMachineryId,
    isOnline,
  };

  return <MachineryContext.Provider value={value}>{children}</MachineryContext.Provider>;
};
