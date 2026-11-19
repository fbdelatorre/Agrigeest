export type MonitoringMetadata = {
  id: string; area_id: string; season_id: string; observed_on: string;
  created_at: string; phenological_stage: string;
};

export function monitoringMetadata(row: MonitoringMetadata): MonitoringMetadata {
  return { id:row.id, area_id:row.area_id, season_id:row.season_id, observed_on:row.observed_on,
    created_at:row.created_at, phenological_stage:row.phenological_stage };
}

export function compareMonitoringDates(a: MonitoringMetadata, b: MonitoringMetadata, ascending = false) {
  const result = b.observed_on.localeCompare(a.observed_on) || b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
  return ascending ? -result : result;
}

export function latestMonitoringByArea(rows: MonitoringMetadata[], seasonId: string | undefined) {
  const latest = new Map<string, MonitoringMetadata>();
  if (!seasonId) return latest;
  for (const row of rows) {
    if (row.season_id !== seasonId) continue;
    const previous = latest.get(row.area_id);
    if (!previous || compareMonitoringDates(row, previous) < 0) latest.set(row.area_id, row);
  }
  return latest;
}

export const monitoringCachePrefix = (scope: string) => 'agrigest:v2:monitoring-meta:' + scope + ':';
export const monitoringCacheKey = (scope: string, seasonId: string) => monitoringCachePrefix(scope) + seasonId;

export function patchMonitoringMetadata(rows: MonitoringMetadata[], id: string, updated?: object) {
  if (!updated) return rows.filter(row => row.id !== id);
  const changes = updated as Partial<MonitoringMetadata>;
  return rows.map(row => row.id === id ? monitoringMetadata({ ...row, ...changes }) : row);
}
