import { useContext, useEffect, useMemo, useState } from 'react';
import { useFieldSync } from '../context/FieldSyncContext';
import { OfflineScope, readOfflineValue, writeOfflineValue } from './useOfflineStorage';
import { listMonitoringMetadata } from '../lib/fieldData';
import { latestMonitoringByArea, monitoringCacheKey, type MonitoringMetadata } from '../utils/monitoringStages';

export function useMonitoringStages(seasonId: string | undefined, institutionId: string, isOnline: boolean) {
  const scope = useContext(OfflineScope);
  const { entries, revision } = useFieldSync();
  const key = scope && seasonId ? monitoringCacheKey(scope, seasonId) : null;
  const [snapshot, setSnapshot] = useState<{ key: string | null; rows: MonitoringMetadata[] | null }>({ key:null, rows:null });
  useEffect(() => {
    const cached = key ? readOfflineValue<MonitoringMetadata[] | null>(key, null) : null;
    setSnapshot({ key, rows:cached });
    if (!key || !seasonId || !isOnline) return;
    const controller = new AbortController();
    void listMonitoringMetadata(seasonId, institutionId, controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      writeOfflineValue(key, rows);
      setSnapshot({ key, rows });
    }).catch(error => { if (!controller.signal.aborted) console.error('Error loading monitoring stages:', error); });
    return () => controller.abort();
  }, [key, seasonId, institutionId, isOnline, revision]);

  return useMemo(() => {
    const cached = snapshot.key === key ? snapshot.rows : key ? readOfflineValue<MonitoringMetadata[] | null>(key, null) : null;
    const rows = new Map((cached ?? []).map(row => [row.id, row]));
    const pending = new Set<string>();
    for (const entry of entries) {
      if (entry.kind !== 'report' || entry.record.season_id !== seasonId || entry.state === 'blocked') continue;
      // A complete server snapshot is authoritative for previously sent records.
      if (entry.state === 'sent' && cached !== null) continue;
      rows.set(entry.id, { ...entry.record, created_at:entry.createdAt });
      if (entry.state === 'pending') pending.add(entry.id);
    }
    return { latest:latestMonitoringByArea([...rows.values()], seasonId), pending };
  }, [snapshot, key, entries, seasonId]);
}
