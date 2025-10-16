import { useState, useEffect } from 'react';

// Tipo genérico para os dados
type StorageData<T> = {
  data: T;
  timestamp: number;
  pendingSync?: boolean;
};

export function useOfflineStorage<T>(key: string, initialData: T) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pendingSync, setPendingSync] = useState(false);

  // Carrega os dados do localStorage ao montar o componente
  useEffect(() => {
    try {
      const storedItem = localStorage.getItem(key);
      
      if (storedItem) {
        const parsedData: StorageData<T> = JSON.parse(storedItem);
        setData(parsedData.data);
        setPendingSync(!!parsedData.pendingSync);
      }
    } catch (err) {
      console.error(`Erro ao carregar dados para a chave ${key}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [key]);

  // Salva os dados no localStorage
  const saveData = (newData: T, needsSync: boolean = false) => {
    try {
      const storageData: StorageData<T> = {
        data: newData,
        timestamp: Date.now(),
        pendingSync: needsSync
      };
      
      localStorage.setItem(key, JSON.stringify(storageData));
      setData(newData);
      setPendingSync(needsSync);
      
      // Se precisar sincronizar, adiciona à lista de pendências
      if (needsSync) {
        const pendingSyncItems = JSON.parse(localStorage.getItem('pendingSync') || '[]');
        if (!pendingSyncItems.includes(key)) {
          pendingSyncItems.push(key);
          localStorage.setItem('pendingSync', JSON.stringify(pendingSyncItems));
        }
      }
      
      return true;
    } catch (err) {
      console.error(`Erro ao salvar dados para a chave ${key}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Marca os dados como sincronizados
  const markAsSynced = () => {
    try {
      const storedItem = localStorage.getItem(key);
      
      if (storedItem) {
        const parsedData: StorageData<T> = JSON.parse(storedItem);
        parsedData.pendingSync = false;
        localStorage.setItem(key, JSON.stringify(parsedData));
        setPendingSync(false);
        
        // Remove da lista de pendências
        const pendingSyncItems = JSON.parse(localStorage.getItem('pendingSync') || '[]');
        const updatedPendingItems = pendingSyncItems.filter((item: string) => item !== key);
        localStorage.setItem('pendingSync', JSON.stringify(updatedPendingItems));
      }
      
      return true;
    } catch (err) {
      console.error(`Erro ao marcar dados como sincronizados para a chave ${key}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  // Remove os dados do localStorage
  const removeData = () => {
    try {
      localStorage.removeItem(key);
      setData(initialData);
      setPendingSync(false);
      
      // Remove da lista de pendências
      const pendingSyncItems = JSON.parse(localStorage.getItem('pendingSync') || '[]');
      const updatedPendingItems = pendingSyncItems.filter((item: string) => item !== key);
      localStorage.setItem('pendingSync', JSON.stringify(updatedPendingItems));
      
      return true;
    } catch (err) {
      console.error(`Erro ao remover dados para a chave ${key}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  return {
    data,
    setData: saveData,
    loading,
    error,
    pendingSync,
    markAsSynced,
    removeData
  };
}