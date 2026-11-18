import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { syncFieldSubmission } from '../lib/fieldData';
import { discardFieldEntry, readFieldQueue, writeFieldEntry, type FieldDraft, type QueueEntry } from '../lib/fieldQueue';
import { supabase } from '../lib/supabase';

interface FieldSync {
  entries: QueueEntry[];
  enqueue: (draft: FieldDraft) => Promise<void>;
  retry: (entry: QueueEntry) => Promise<void>;
  discard: (entry: QueueEntry) => Promise<void>;
  revision: number;
  localError: boolean;
}

const FieldSyncContext = createContext<FieldSync | null>(null);

export function useFieldSync() {
  const context = useContext(FieldSyncContext);
  if (!context) throw new Error('FieldSyncProvider missing');
  return context;
}

export function FieldSyncProvider({ scope, userId, institutionId, children }: {
  scope: string | null;
  userId: string;
  institutionId: string;
  children: ReactNode;
}) {
  const { isOnline } = useNetworkStatus();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const [localError, setLocalError] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);

  const refresh = useCallback(async () => {
    if (!scope) return;
    try {
      setEntries(await readFieldQueue(scope));
      setLocalError(false);
    } catch (error) {
      console.error('Error reading offline field entries:', error);
      setLocalError(true);
    }
  }, [scope]);

  const notify = useCallback((synced = false) => {
    if (synced) setRevision(value => value + 1);
    channel.current?.postMessage({ synced });
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!scope) return;
    void refresh();
    if (typeof BroadcastChannel !== 'function') return;
    const bus = new BroadcastChannel('agrigest-field:' + scope);
    channel.current = bus;
    bus.onmessage = event => {
      if (event.data?.synced) setRevision(value => value + 1);
      void refresh();
    };
    return () => { channel.current = null; bus.close(); };
  }, [refresh, scope]);

  useEffect(() => {
    if (!scope || !isOnline) return;
    const controller = new AbortController();
    const { signal } = controller;
    let running = false;

    const synchronize = async () => {
      if (running || signal.aborted) return;
      running = true;
      try {
        const run = async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (signal.aborted || session?.user.id !== userId) return;
          const records = await readFieldQueue(scope);
          const byId = new Map(records.map(entry => [entry.id, entry]));
          for (const entry of records) {
            if (signal.aborted) break;
            if (entry.state !== 'pending') continue;
            if (entry.kind === 'recommendation') {
              const parent = byId.get(entry.record.report_id);
              if (parent && parent.state !== 'sent') continue;
            }
            const result = await syncFieldSubmission(entry, userId, session.access_token, signal);
            if (signal.aborted) break;
            if (result.state === 'retry') break;
            const updated = { ...entry, ...result };
            await writeFieldEntry(updated);
            byId.set(entry.id, updated);
            notify(result.state === 'sent');
          }
        };
        if (navigator.locks) await navigator.locks.request('agrigest-field:' + scope, { ifAvailable: true }, lock => lock ? run() : undefined);
        else await run();
      } catch (error) {
        if (!signal.aborted) console.error('Error syncing offline field entries:', error);
      } finally {
        running = false;
      }
    };

    void synchronize();
    const timer = window.setInterval(synchronize, 15000);
    window.addEventListener('agrigest:field-queued', synchronize);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('agrigest:field-queued', synchronize);
    };
  }, [isOnline, notify, scope, userId]);

  const wake = () => {
    notify();
    window.dispatchEvent(new Event('agrigest:field-queued'));
  };

  const enqueue = async (draft: FieldDraft) => {
    if (!scope || draft.record.institution_id !== institutionId) throw new Error('Invalid local scope');
    const id = crypto.randomUUID();
    const metadata = { scope, id, userId, createdAt: new Date().toISOString(), state: 'pending' as const };
    let entry: QueueEntry;
    if (draft.kind === 'report') entry = { ...metadata, kind: draft.kind, record: { ...draft.record, id } };
    else if (draft.kind === 'rainfall') entry = { ...metadata, kind: draft.kind, record: { ...draft.record, id } };
    else if (draft.kind === 'sample') entry = { ...metadata, kind: draft.kind, record: { ...draft.record, id } };
    else entry = { ...metadata, kind: draft.kind, record: { ...draft.record, id } };
    await writeFieldEntry(entry);
    wake();
  };

  const retry = async (entry: QueueEntry) => {
    if (entry.scope !== scope || entry.state !== 'blocked') return;
    await writeFieldEntry({ ...entry, state: 'pending', reason: undefined });
    wake();
  };

  const discard = async (entry: QueueEntry) => {
    if (scope && entry.scope === scope) await discardFieldEntry(scope, entry.id);
    notify();
  };

  return <FieldSyncContext.Provider value={{ entries, enqueue, retry, discard, revision, localError }}>{children}</FieldSyncContext.Provider>;
}
