import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Machinery, MaintenanceType, Maintenance } from '../types/machinery';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useOfflineStorage } from '../hooks/useOfflineStorage';

interface MachineryContextType {
  // Máquinas
  machinery: Machinery[];
  addMachinery: (machinery: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => Promise<void>;
  updateMachinery: (id: string, machinery: Partial<Machinery>) => Promise<void>;
  deleteMachinery: (id: string) => Promise<void>;
  getMachineryById: (id: string) => Machinery | undefined;
  
  // Tipos de manutenção
  maintenanceTypes: MaintenanceType[];
  addMaintenanceType: (type: Omit<MaintenanceType, 'id' | 'createdAt' | 'userId' | 'institutionId'>) => Promise<MaintenanceType>;
  updateMaintenanceType: (id: string, type: Partial<MaintenanceType>) => Promise<void>;
  deleteMaintenanceType: (id: string) => Promise<void>;
  
  // Manutenções
  maintenances: Maintenance[];
  addMaintenance: (maintenance: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => Promise<void>;
  updateMaintenance: (id: string, maintenance: Partial<Maintenance>) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  getMaintenancesByMachineryId: (machineryId: string) => Maintenance[];
  
  // Status da rede
  isOnline: boolean;
  hasPendingSync: boolean;
  syncData: () => Promise<void>;
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
  const [hasPendingSync, setHasPendingSync] = useState(false);
  
  // Status da rede
  const { isOnline } = useNetworkStatus();
  
  // Armazenamento offline
  const { 
    data: offlineMachinery,
    setData: setOfflineMachinery,
    pendingSync: machineryPendingSync,
    markAsSynced: markMachinerySynced
  } = useOfflineStorage<Machinery[]>('machinery', []);
  
  const { 
    data: offlineMaintenanceTypes,
    setData: setOfflineMaintenanceTypes,
    pendingSync: maintenanceTypesPendingSync,
    markAsSynced: markMaintenanceTypesSynced
  } = useOfflineStorage<MaintenanceType[]>('maintenanceTypes', []);
  
  const { 
    data: offlineMaintenances,
    setData: setOfflineMaintenances,
    pendingSync: maintenancesPendingSync,
    markAsSynced: markMaintenancesSynced
  } = useOfflineStorage<Maintenance[]>('maintenances', []);

  // Carregar dados iniciais
  useEffect(() => {
    if (isOnline) {
      loadMachinery();
      loadMaintenanceTypes();
      loadMaintenances();
      
      // Verificar se há sincronização pendente
      if (machineryPendingSync || maintenanceTypesPendingSync || maintenancesPendingSync) {
        setHasPendingSync(true);
      }
    } else {
      // Usar dados offline
      setMachinery(offlineMachinery);
      setMaintenanceTypes(offlineMaintenanceTypes);
      setMaintenances(offlineMaintenances);
      
      // Verificar se há sincronização pendente
      setHasPendingSync(machineryPendingSync || maintenanceTypesPendingSync || maintenancesPendingSync);
    }
  }, [isOnline]);

  // Funções de carregamento
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
      setOfflineMachinery(formattedMachinery, false);
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
      setOfflineMaintenanceTypes(formattedTypes, false);
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
      setOfflineMaintenances(formattedMaintenances, false);
    } catch (error) {
      console.error('Error loading maintenances:', error);
    }
  };

  // Funções de máquinas
  const addMachinery = async (machineryData: Omit<Machinery, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to add machinery');
      }

      if (!isOnline) {
        // Modo offline: salva localmente para sincronização posterior
        const newMachinery: Machinery = {
          ...machineryData,
          id: `local-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: user.id,
          institutionId: 'temp'
        };
        
        const updatedMachinery = [newMachinery, ...machinery];
        setMachinery(updatedMachinery);
        setOfflineMachinery(updatedMachinery, true);
        setHasPendingSync(true);
        return;
      }

      // Obter institution_id do usuário
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

      if (error) {
        console.error('Error adding machinery:', error);
        throw error;
      }

      const newMachinery: Machinery = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedMachinery = [newMachinery, ...machinery];
      setMachinery(updatedMachinery);
      setOfflineMachinery(updatedMachinery, false);
    } catch (error) {
      console.error('Error adding machinery:', error);
      throw error;
    }
  };

  const updateMachinery = async (id: string, updatedData: Partial<Machinery>) => {
    if (!isOnline) {
      // Modo offline: atualiza localmente para sincronização posterior
      const updatedMachinery = machinery.map(machine => 
        machine.id === id ? { ...machine, ...updatedData, updatedAt: new Date() } : machine
      );
      
      setMachinery(updatedMachinery);
      setOfflineMachinery(updatedMachinery, true);
      setHasPendingSync(true);
      return;
    }

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

      if (error) {
        console.error('Error updating machinery:', error);
        throw error;
      }

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
      setOfflineMachinery(updatedMachinery, false);
    } catch (error) {
      console.error('Error updating machinery:', error);
      throw error;
    }
  };

  const deleteMachinery = async (id: string) => {
    if (!isOnline) {
      // Modo offline: marca para exclusão na sincronização
      const updatedMachinery = machinery.filter(machine => machine.id !== id);
      setMachinery(updatedMachinery);
      setOfflineMachinery(updatedMachinery, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('machinery')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting machinery:', error);
        throw error;
      }

      const updatedMachinery = machinery.filter(machine => machine.id !== id);
      setMachinery(updatedMachinery);
      setOfflineMachinery(updatedMachinery, false);
    } catch (error) {
      console.error('Error deleting machinery:', error);
      throw error;
    }
  };

  const getMachineryById = (id: string) => {
    return machinery.find((machine) => machine.id === id);
  };

  // Funções de tipos de manutenção
  const addMaintenanceType = async (typeData: Omit<MaintenanceType, 'id' | 'createdAt' | 'userId' | 'institutionId'>): Promise<MaintenanceType> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to add maintenance type');
      }

      if (!isOnline) {
        // Modo offline: salva localmente para sincronização posterior
        const newType: MaintenanceType = {
          ...typeData,
          id: `local-${Date.now()}`,
          createdAt: new Date(),
          userId: user.id,
          institutionId: 'temp'
        };
        
        const updatedTypes = [newType, ...maintenanceTypes];
        setMaintenanceTypes(updatedTypes);
        setOfflineMaintenanceTypes(updatedTypes, true);
        setHasPendingSync(true);
        return newType;
      }

      // Obter institution_id do usuário
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

      if (error) {
        console.error('Error adding maintenance type:', error);
        throw error;
      }

      const newType: MaintenanceType = {
        ...data,
        userId: data.user_id,
        institutionId: data.institution_id,
        createdAt: new Date(data.created_at)
      };

      const updatedTypes = [newType, ...maintenanceTypes];
      setMaintenanceTypes(updatedTypes);
      setOfflineMaintenanceTypes(updatedTypes, false);
      
      return newType;
    } catch (error) {
      console.error('Error adding maintenance type:', error);
      throw error;
    }
  };

  const updateMaintenanceType = async (id: string, updatedData: Partial<MaintenanceType>) => {
    if (!isOnline) {
      // Modo offline: atualiza localmente para sincronização posterior
      const updatedTypes = maintenanceTypes.map(type => 
        type.id === id ? { ...type, ...updatedData } : type
      );
      
      setMaintenanceTypes(updatedTypes);
      setOfflineMaintenanceTypes(updatedTypes, true);
      setHasPendingSync(true);
      return;
    }

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

      if (error) {
        console.error('Error updating maintenance type:', error);
        throw error;
      }

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
      setOfflineMaintenanceTypes(updatedTypes, false);
    } catch (error) {
      console.error('Error updating maintenance type:', error);
      throw error;
    }
  };

  const deleteMaintenanceType = async (id: string) => {
    if (!isOnline) {
      // Modo offline: marca para exclusão na sincronização
      const updatedTypes = maintenanceTypes.filter(type => type.id !== id);
      setMaintenanceTypes(updatedTypes);
      setOfflineMaintenanceTypes(updatedTypes, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('maintenance_types')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting maintenance type:', error);
        throw error;
      }

      const updatedTypes = maintenanceTypes.filter(type => type.id !== id);
      setMaintenanceTypes(updatedTypes);
      setOfflineMaintenanceTypes(updatedTypes, false);
    } catch (error) {
      console.error('Error deleting maintenance type:', error);
      throw error;
    }
  };

  // Funções de manutenções
  const addMaintenance = async (maintenanceData: Omit<Maintenance, 'id' | 'createdAt' | 'updatedAt' | 'userId' | 'institutionId'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User must be authenticated to add maintenance');
      }

      if (!isOnline) {
        // Modo offline: salva localmente para sincronização posterior
        const newMaintenance: Maintenance = {
          ...maintenanceData,
          id: `local-${Date.now()}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: user.id,
          institutionId: 'temp'
        };
        
        const updatedMaintenances = [newMaintenance, ...maintenances];
        setMaintenances(updatedMaintenances);
        setOfflineMaintenances(updatedMaintenances, true);
        setHasPendingSync(true);
        return;
      }

      // Obter institution_id do usuário
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
          date: maintenanceData.date.toISOString(),
          machine_hours: maintenanceData.machineHours || null,
          cost: maintenanceData.cost || 0,
          notes: maintenanceData.notes || null,
          user_id: user.id,
          institution_id: userProfile.institution_id
        }])
        .select()
        .single();

      if (error) {
        console.error('Error adding maintenance:', error);
        throw error;
      }

      const newMaintenance: Maintenance = {
        ...data,
        machineryId: data.machinery_id,
        maintenanceTypeId: data.maintenance_type_id,
        description: data.description,
        materialUsed: data.material_used,
        machineHours: data.machine_hours,
        userId: data.user_id,
        institutionId: data.institution_id,
        date: new Date(data.date),
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedMaintenances = [newMaintenance, ...maintenances];
      setMaintenances(updatedMaintenances);
      setOfflineMaintenances(updatedMaintenances, false);
    } catch (error) {
      console.error('Error adding maintenance:', error);
      throw error;
    }
  };

  const updateMaintenance = async (id: string, updatedData: Partial<Maintenance>) => {
    if (!isOnline) {
      // Modo offline: atualiza localmente para sincronização posterior
      const updatedMaintenances = maintenances.map(maintenance => 
        maintenance.id === id ? { ...maintenance, ...updatedData, updatedAt: new Date() } : maintenance
      );
      
      setMaintenances(updatedMaintenances);
      setOfflineMaintenances(updatedMaintenances, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('maintenances')
        .update({
          machinery_id: updatedData.machineryId,
          maintenance_type_id: updatedData.maintenanceTypeId,
          description: updatedData.description || null,
          material_used: updatedData.materialUsed,
          date: updatedData.date?.toISOString(),
          machine_hours: updatedData.machineHours,
          cost: updatedData.cost,
          notes: updatedData.notes
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating maintenance:', error);
        throw error;
      }

      const updatedMaintenance: Maintenance = {
        ...data,
        machineryId: data.machinery_id,
        maintenanceTypeId: data.maintenance_type_id,
        description: data.description,
        materialUsed: data.material_used,
        machineHours: data.machine_hours,
        userId: data.user_id,
        institutionId: data.institution_id,
        date: new Date(data.date),
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

      const updatedMaintenances = maintenances.map(maintenance => 
        maintenance.id === id ? updatedMaintenance : maintenance
      );
      
      setMaintenances(updatedMaintenances);
      setOfflineMaintenances(updatedMaintenances, false);
    } catch (error) {
      console.error('Error updating maintenance:', error);
      throw error;
    }
  };

  const deleteMaintenance = async (id: string) => {
    if (!isOnline) {
      // Modo offline: marca para exclusão na sincronização
      const updatedMaintenances = maintenances.filter(maintenance => maintenance.id !== id);
      setMaintenances(updatedMaintenances);
      setOfflineMaintenances(updatedMaintenances, true);
      setHasPendingSync(true);
      return;
    }

    try {
      const { error } = await supabase
        .from('maintenances')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting maintenance:', error);
        throw error;
      }

      const updatedMaintenances = maintenances.filter(maintenance => maintenance.id !== id);
      setMaintenances(updatedMaintenances);
      setOfflineMaintenances(updatedMaintenances, false);
    } catch (error) {
      console.error('Error deleting maintenance:', error);
      throw error;
    }
  };

  const getMaintenancesByMachineryId = (machineryId: string) => {
    return maintenances.filter((maintenance) => maintenance.machineryId === machineryId);
  };

  // Sincronizar dados pendentes com o servidor
  const syncData = async () => {
    if (!isOnline) {
      console.log('Não é possível sincronizar dados offline');
      return;
    }
    
    try {
      console.log('Iniciando sincronização de dados de máquinas...');
      
      // Sincronizar máquinas
      if (machineryPendingSync) {
        await syncMachinery();
      }
      
      // Sincronizar tipos de manutenção
      if (maintenanceTypesPendingSync) {
        await syncMaintenanceTypes();
      }
      
      // Sincronizar manutenções
      if (maintenancesPendingSync) {
        await syncMaintenances();
      }
      
      setHasPendingSync(false);
      console.log('Sincronização de dados de máquinas concluída com sucesso');
    } catch (error) {
      console.error('Erro ao sincronizar dados de máquinas:', error);
      throw error;
    }
  };

  const syncMachinery = async () => {
    // Implementar sincronização de máquinas
    console.log('Sincronizando máquinas...');
    markMachinerySynced();
  };

  const syncMaintenanceTypes = async () => {
    // Implementar sincronização de tipos de manutenção
    console.log('Sincronizando tipos de manutenção...');
    markMaintenanceTypesSynced();
  };

  const syncMaintenances = async () => {
    // Implementar sincronização de manutenções
    console.log('Sincronizando manutenções...');
    markMaintenancesSynced();
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
    hasPendingSync,
    syncData
  };

  return <MachineryContext.Provider value={value}>{children}</MachineryContext.Provider>;
};