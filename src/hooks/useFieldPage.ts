import { useContext, useEffect, useState } from 'react';
import { OfflineScope, readOfflineValue, writeOfflineValue } from './useOfflineStorage';

export function useFieldPage<T>(
  kind: string, season: string, area: string, page: number, isOnline: boolean, revision: number,
  load: (season: string, area: string, page: number, signal: AbortSignal) => Promise<T>,
) {
  const scope = useContext(OfflineScope);
  const key = scope ? 'agrigest:v2:field:' + [scope, kind, season, area, page].join(':') : null;
  const [result, setResult] = useState<{ key: string | null; data: T | null; failed: boolean; loading: boolean }>({
    key: null, data: null, failed: false, loading: true,
  });

  useEffect(() => {
    const cached = key ? readOfflineValue<T | null>(key, null) : null;
    setResult(current => ({ key, data: current.key === key ? current.data ?? cached : cached, failed: false, loading: isOnline }));
    if (!isOnline) return;
    const controller = new AbortController();
    void load(season, area, page, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (key) writeOfflineValue(key, data);
      setResult({ key, data, failed: false, loading: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult(current => ({ ...current, failed: true, loading: false }));
    });
    return () => controller.abort();
  }, [area, isOnline, key, load, page, revision, season]);

  return result.key === key ? result : { data: null, failed: false, loading: isOnline };
}
