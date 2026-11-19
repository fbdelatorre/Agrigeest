import { insertBusinessRecord, type StoredDates } from '../lib/businessWrites';
import React, { createContext, useContext, ReactNode, useEffect, useCallback } from 'react';
import { useAppContext } from './AppContext';
import { supabase } from '../lib/supabase';
import { Machinery, MaintenanceType, Maintenance } from '../types/machinery';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';
import { dateToDateString, isDateInSeason, parseDate } from '../utils/dateHelpers';

const READ_ONLY_MSG = 'Sem conexão. O AgriGest está em modo somente leitura.';

interface MachineryContextType {
  machinery: Machinery[];
  addMachinery: (machinery: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => Promise<void>;
  updateMachinery: (id: string, machinery: Partial<Machinery>) => Promise<void>;
  deleteMachinery: (id: string) => Promise<void>;
  getMachineryById: (id: string) => Machinery | undefined;

  maintenanceTypes: MaintenanceType[];
  refreshMaintenanceTypes: () => Promise<void>;
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

  const { isOnline } = useNetworkStatus();
  const { profile, activeSeason } = useAppContext();
  const institutionId = profile?.institutionId ?? '';

  const [machinery, setMachinery] = useOfflineStorage<Machinery[]>('machinery', []);

  const [maintenanceTypes, setMaintenanceTypes] = useOfflineStorage<MaintenanceType[]>('maintenanceTypes', []);

  const [maintenances, setMaintenances] = useOfflineStorage<Maintenance[]>('maintenances', []);

  const loadMachinery = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('machinery')
        .select('*')
        .eq('institution_id', institutionId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading machinery:', error);
        return;
      }

      const formattedMachinery = data.map(machine => ({
        ...machine,
        description: machine.description ?? undefined, model: machine.model ?? undefined, year: machine.year ?? undefined,
        userId: machine.user_id,
        institutionId: machine.institution_id,
        createdAt: new Date(machine.created_at ?? 0),
        updatedAt: new Date(machine.updated_at ?? 0)
      }));

      setMachinery(formattedMachinery);
    } catch (error) {
      console.error('Error loading machinery:', error);
    }
  }, [institutionId, setMachinery]);

  const loadMaintenanceTypes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('maintenance_types')
        .select('*')
        .eq('institution_id', institutionId)
        .order('name', { ascending: true });

      if (error) {
        console.error('Error loading maintenance types:', error);
        return;
      }

      const formattedTypes = data.map(type => ({
        ...type,
        description: type.description ?? undefined,
        userId: type.user_id,
        institutionId: type.institution_id,
        createdAt: new Date(type.created_at ?? 0)
      }));

      setMaintenanceTypes(formattedTypes);
    } catch (error) {
      console.error('Error loading maintenance types:', error);
    }
  }, [institutionId, setMaintenanceTypes]);

  const loadMaintenances = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('maintenances')
        .select('*')
        .eq('institution_id', institutionId)
        .order('date', { ascending: false });

      if (error) {
        console.error('Error loading maintenances:', error);
        return;
      }

      const formattedMaintenances = data.map(maintenance => ({
        ...maintenance,
        notes: maintenance.notes ?? undefined,
        machineryId: maintenance.machinery_id,
        maintenanceTypeId: maintenance.maintenance_type_id,
        description: maintenance.description ?? undefined,
        materialUsed: maintenance.material_used ?? undefined,
        machineHours: maintenance.machine_hours ?? undefined,
        userId: maintenance.user_id,
        institutionId: maintenance.institution_id,
        date: parseDate(maintenance.date)!,
        createdAt: new Date(maintenance.created_at ?? 0),
        updatedAt: new Date(maintenance.updated_at ?? 0)
      }));

      setMaintenances(formattedMaintenances);
    } catch (error) {
      console.error('Error loading maintenances:', error);
    }
  }, [institutionId, setMaintenances]);

  useEffect(() => {
    if (isOnline && institutionId) {
      loadMachinery();
      loadMaintenanceTypes();
      loadMaintenances();
    }
  }, [isOnline, institutionId, loadMachinery, loadMaintenanceTypes, loadMaintenances]);

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

      const { data, error } = await insertBusinessRecord<Omit<Machinery, 'createdAt' | 'updatedAt'> & StoredDates>('machinery', {
          name: machineryData.name,
          description: machineryData.description,
          model: machineryData.model,
          year: machineryData.year,
          user_id: user.id,
          institution_id: userProfile.institution_id
        });

      if (error) throw error;

      const newMachinery: Machinery = {
        ...data,
        description: data.description ?? undefined, model: data.model ?? undefined, year: data.year ?? undefined,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setMachinery(previous => [newMachinery, ...previous]);
    } catch (error) {
      console.error('Error adding machinery:', error);
      throw error;
    }
  };

  const updateMachinery = async (id: string, updatedData: Partial<Machinery>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const original = machinery.find(item => item.id === id);
      if (!original) throw new Error("Registro indisponível. Atualize a página.");
      const expected = updatedData.updatedAt ?? original.updatedAt;
      const { data, error } = await supabase
        .from('machinery')
        .update({
          name: updatedData.name,
          description: updatedData.description,
          model: updatedData.model,
          year: 'year' in updatedData ? updatedData.year ?? null : undefined
        })
        .eq('id', id)
        .gte('updated_at', expected.toISOString())
        .lt('updated_at', new Date(expected.getTime() + 1).toISOString())
        .select()
        .single();

      if (error) throw error;

      const updatedMachine: Machinery = {
        ...data,
        description: data.description ?? undefined, model: data.model ?? undefined, year: data.year ?? undefined,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setMachinery(previous => previous.map(machine =>
        machine.id === id ? updatedMachine : machine
      ));
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
        .eq('id', id).select('id').single();

      if (error) throw error;

      setMachinery(previous => previous.filter(machine => machine.id !== id));
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

      const { data, error } = await insertBusinessRecord<Omit<MaintenanceType, 'createdAt'> & StoredDates>('maintenance_types', {
          name: typeData.name,
          description: typeData.description,
          user_id: user.id,
          institution_id: userProfile.institution_id
        });

      if (error) throw error;

      const newType: MaintenanceType = {
        ...data,
        description: data.description ?? undefined,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at ?? 0)
      };

      setMaintenanceTypes(previous => [newType, ...previous]);

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
        description: data.description ?? undefined,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at ?? 0)
      };

      setMaintenanceTypes(previous => previous.map(type =>
        type.id === id ? updatedType : type
      ));
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
        .eq('id', id).select('id').single();

      if (error) throw error;

      setMaintenanceTypes(previous => previous.filter(type => type.id !== id));
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

      const { data, error } = await insertBusinessRecord<Omit<Maintenance, 'createdAt' | 'updatedAt' | 'date'> & StoredDates & { date: string; machinery_id: string; maintenance_type_id: string; material_used?: string; machine_hours?: number }>('maintenances', {
          machinery_id: maintenanceData.machineryId,
          maintenance_type_id: maintenanceData.maintenanceTypeId,
          description: maintenanceData.description || null,
          material_used: maintenanceData.materialUsed || null,
          date: dateToDateString(maintenanceData.date),
          machine_hours: maintenanceData.machineHours ?? null,
          cost: maintenanceData.cost || 0,
          notes: maintenanceData.notes || null,
          user_id: user.id,
          institution_id: userProfile.institution_id
        });

      if (error) throw error;

      const newMaintenance: Maintenance = {
        ...data,
        notes: data.notes ?? undefined,
        machineryId: data.machinery_id,
        maintenanceTypeId: data.maintenance_type_id,
        description: data.description ?? undefined,
        materialUsed: data.material_used ?? undefined,
        machineHours: data.machine_hours ?? undefined,
        userId: data.user_id,
        institutionId: data.institution_id,
        date: parseDate(data.date)!,
        createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setMaintenances(previous => [newMaintenance, ...previous]);
    } catch (error) {
      console.error('Error adding maintenance:', error);
      throw error;
    }
  };

  const updateMaintenance = async (id: string, updatedData: Partial<Maintenance>) => {
    if (!isOnline) throw new Error(READ_ONLY_MSG);

    try {
      const original = maintenances.find(item => item.id === id);
      if (!original) throw new Error("Registro indisponível. Atualize a página.");
      const expected = updatedData.updatedAt ?? original.updatedAt;
      const { data, error } = await supabase
        .from('maintenances')
        .update({
          machinery_id: updatedData.machineryId,
          maintenance_type_id: updatedData.maintenanceTypeId,
          description: 'description' in updatedData ? updatedData.description || null : undefined,
          material_used: 'materialUsed' in updatedData ? updatedData.materialUsed ?? null : undefined,
          date: updatedData.date ? dateToDateString(updatedData.date)! : undefined,
          machine_hours: 'machineHours' in updatedData ? updatedData.machineHours ?? null : undefined,
          cost: updatedData.cost,
          notes: 'notes' in updatedData ? updatedData.notes ?? null : undefined
        })
        .eq('id', id)
        .gte('updated_at', expected.toISOString())
        .lt('updated_at', new Date(expected.getTime() + 1).toISOString())
        .select()
        .single();

      if (error) throw error;

      const updatedMaintenance: Maintenance = {
        ...data,
        notes: data.notes ?? undefined,
        machineryId: data.machinery_id,
        maintenanceTypeId: data.maintenance_type_id,
        description: data.description ?? undefined,
        materialUsed: data.material_used ?? undefined,
        machineHours: data.machine_hours ?? undefined,
        userId: data.user_id,
        institutionId: data.institution_id,
        date: parseDate(data.date)!,
        createdAt: new Date(data.created_at ?? 0),
        updatedAt: new Date(data.updated_at ?? 0)
      };

      setMaintenances(previous => previous.map(maintenance =>
        maintenance.id === id ? updatedMaintenance : maintenance
      ));
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
        .eq('id', id).select('id').single();

      if (error) throw error;

      setMaintenances(previous => previous.filter(maintenance => maintenance.id !== id));
    } catch (error) {
      console.error('Error deleting maintenance:', error);
      throw error;
    }
  };

  const seasonMaintenances = maintenances.filter(maintenance => isDateInSeason(maintenance.date, activeSeason));

  const getMaintenancesByMachineryId = (machineryId: string) => {
    return seasonMaintenances.filter((maintenance) => maintenance.machineryId === machineryId);
  };

  const value = {
    machinery,
    addMachinery,
    updateMachinery,
    deleteMachinery,
    getMachineryById,
    maintenanceTypes,
    refreshMaintenanceTypes: loadMaintenanceTypes,
    addMaintenanceType,
    updateMaintenanceType,
    deleteMaintenanceType,
    maintenances: seasonMaintenances,
    addMaintenance,
    updateMaintenance,
    deleteMaintenance,
    getMaintenancesByMachineryId,
    isOnline,
  };

  return <MachineryContext.Provider value={value}>{children}</MachineryContext.Provider>;
};
