import { useState, useEffect } from 'react';

type StorageData<T> = {
  data: T;
  timestamp: number;
  pendingSync?: boolean;
};

const READ_ONLY_ERROR = 'Sem conexão. O AgriGest está em modo somente leitura.';

export function useOfflineStorage<T>(key: string, initialData: T) {
  const [data, setData] = useState<T>(initialData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      const storedItem = localStorage.getItem(key);
      if (storedItem) {
        const parsedData: StorageData<T> = JSON.parse(storedItem);
        setData(parsedData.data);
      }
    } catch (err) {
      console.error(`Erro ao carregar dados para a chave ${key}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [key]);

  const saveCache = (newData: T) => {
    try {
      const storageData: StorageData<T> = {
        data: newData,
        timestamp: Date.now(),
        pendingSync: false,
      };
      localStorage.setItem(key, JSON.stringify(storageData));
      setData(newData);
      return true;
    } catch (err) {
      console.error(`Erro ao salvar cache para a chave ${key}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  const removeData = () => {
    try {
      localStorage.removeItem(key);
      setData(initialData);
      return true;
    } catch (err) {
      console.error(`Erro ao remover dados para a chave ${key}:`, err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  };

  return {
    data,
    setData: saveCache,
    loading,
    error,
    removeData,
  };
}
