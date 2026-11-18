import { nativeFieldStore } from './nativeFieldStore';
import type { FieldSubmission, RecommendedProduct } from './fieldData';

export type FieldDraft =
  | { kind: 'report'; record: Omit<Extract<FieldSubmission, { kind: 'report' }>['record'], 'id'> }
  | { kind: 'rainfall'; record: Omit<Extract<FieldSubmission, { kind: 'rainfall' }>['record'], 'id'> }
  | { kind: 'sample'; record: Omit<Extract<FieldSubmission, { kind: 'sample' }>['record'], 'id'> }
  | { kind: 'recommendation'; record: Omit<Extract<FieldSubmission, { kind: 'recommendation' }>['record'], 'id' | 'products'> & { products: RecommendedProduct[] } };
export type QueueEntry = (
  | Exclude<FieldSubmission, { kind: 'recommendation' }>
  | { kind: 'recommendation'; record: Extract<FieldDraft, { kind: 'recommendation' }>['record'] & { id: string } }
) & {
  scope: string;
  id: string;
  createdAt: string;
  userId: string;
  state: 'pending' | 'sent' | 'blocked';
  reason?: 'duplicate-rainfall' | 'rejected';
};

const storeName = 'field-records';
let connection: Promise<IDBDatabase> | undefined;

function database() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('agrigest-field-data', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: ['scope', 'id'] })
      .createIndex('scope', 'scope');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('Local transaction aborted'));
  });
}

export async function readFieldQueue(scope: string): Promise<QueueEntry[]> {
  const native = nativeFieldStore();
  const entries = native
    ? (await native.list(scope)).map(row => JSON.parse(row) as QueueEntry)
    : await transact('readonly', store => store.index('scope').getAll(scope)) as QueueEntry[];
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function writeFieldEntry(entry: QueueEntry) {
  const native = nativeFieldStore();
  if (native) return native.put({
    scope: entry.scope, id: entry.id, state: entry.state,
    parentId: entry.kind === 'recommendation' ? entry.record.report_id : null,
    payload: JSON.stringify(entry),
  });
  return transact('readwrite', store => store.put(entry));
}

export async function discardFieldEntry(scope: string, id: string) {
  const native = nativeFieldStore();
  if (native) return native.discard(scope, id);
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.index('scope').getAll(scope);
    request.onsuccess = () => {
      const entries = request.result as QueueEntry[];
      if (!entries.some(entry => entry.id === id && entry.state === 'blocked')) return;
      for (const entry of entries) {
        if (entry.id === id || (entry.state !== 'sent' && entry.kind === 'recommendation' && entry.record.report_id === id)) {
          store.delete([scope, entry.id]);
        }
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
