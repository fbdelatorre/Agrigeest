import { createContext, useCallback, useContext, useLayoutEffect, useRef, useState } from 'react';

export const OfflineScope = createContext<string | null>(null);

export function readOfflineValue<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return JSON.parse(stored, (_key, value) =>
      typeof value?.agriGestDate === 'string' ? new Date(value.agriGestDate) : value
    ) as T;
  } catch (error) {
    console.error('Erro ao ler dados locais do AgriGest:', error);
    return fallback;
  }
}

export function writeOfflineValue<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value, function (this: Record<string, unknown>, field, serialized) {
      const original = this[field];
      return original instanceof Date && Number.isFinite(original.getTime())
        ? { agriGestDate: original.toISOString() }
        : serialized;
    }));
  } catch (error) {
    console.error('Erro ao salvar dados locais do AgriGest:', error);
  }
}

export function useOfflineStorage<T>(name: string, initialData: T) {
  const scope = useContext(OfflineScope);
  const key = scope ? 'agrigest:v2:' + scope + ':' + name : null;
  const [data, setData] = useState(() => key ? readOfflineValue(key, initialData) : initialData);
  const latest = useRef(data);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const save = useCallback((update: T | ((previous: T) => T)) => {
    if (!mounted.current) return;

    const next = typeof update === 'function'
      ? (update as (previous: T) => T)(latest.current)
      : update;
    latest.current = next;
    setData(next);
    if (key) writeOfflineValue(key, next);
  }, [key]);

  return [data, save] as const;
}
