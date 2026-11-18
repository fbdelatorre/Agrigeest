import { Capacitor, registerPlugin } from '@capacitor/core';
import { invoke, isTauri } from '@tauri-apps/api/core';

interface FieldStorePlugin {
  list(options: { scope: string }): Promise<{ rows: string[] }>;
  put(options: FieldRow): Promise<void>;
  discard(options: { scope: string; id: string }): Promise<void>;
}

interface FieldRow {
  scope: string;
  id: string;
  state: string;
  parentId: string | null;
  payload: string;
}

const androidStore = registerPlugin<FieldStorePlugin>('FieldStore');

export function nativeFieldStore() {
  if (Capacitor.getPlatform() === 'android') {
    return {
      list: async (scope: string) => (await androidStore.list({ scope })).rows,
      put: (row: FieldRow) => androidStore.put(row),
      discard: (scope: string, id: string) => androidStore.discard({ scope, id }),
    };
  }
  if (isTauri()) {
    return {
      list: (scope: string) => invoke<string[]>('list_field_entries', { scope }),
      put: (row: FieldRow) => invoke<void>('put_field_entry', { row }),
      discard: (scope: string, id: string) => invoke<void>('discard_field_entry', { scope, id }),
    };
  }
  return null;
}
