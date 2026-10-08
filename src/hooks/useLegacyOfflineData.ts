import { useState, useEffect } from 'react';

const OFFLINE_KEYS = [
  'areas',
  'operations',
  'products',
  'seasons',
  'machinery',
  'maintenanceTypes',
  'maintenances',
  'notes',
];

interface LegacyDataInfo {
  hasLegacyData: boolean;
  keys: string[];
  localItemCount: number;
}

function detectLegacyOfflineData(): LegacyDataInfo {
  const keysWithPending: string[] = [];
  let localItemCount = 0;

  try {
    const pendingSyncRaw = localStorage.getItem('pendingSync');
    if (pendingSyncRaw) {
      const pendingItems = JSON.parse(pendingSyncRaw) as string[];
      if (Array.isArray(pendingItems) && pendingItems.length > 0) {
        keysWithPending.push(...pendingItems);
      }
    }
  } catch {
    // ignore parse errors
  }

  for (const key of OFFLINE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.pendingSync === true) {
        if (!keysWithPending.includes(key)) {
          keysWithPending.push(key);
        }
      }
      if (parsed && Array.isArray(parsed.data)) {
        for (const item of parsed.data) {
          if (item && typeof item.id === 'string' && item.id.startsWith('local-')) {
            localItemCount++;
          }
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  return {
    hasLegacyData: keysWithPending.length > 0 || localItemCount > 0,
    keys: [...new Set(keysWithPending)],
    localItemCount,
  };
}

export function useLegacyOfflineData() {
  const [legacyData, setLegacyData] = useState<LegacyDataInfo>({
    hasLegacyData: false,
    keys: [],
    localItemCount: 0,
  });

  useEffect(() => {
    setLegacyData(detectLegacyOfflineData());
  }, []);

  return legacyData;
}
