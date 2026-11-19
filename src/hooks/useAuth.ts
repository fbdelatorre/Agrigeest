import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authStorageKey, supabase } from '../lib/supabase';
import { readOfflineValue } from './useOfflineStorage';

function savedDeviceSession() {
  // A network interface can stay "online" without internet. Cached identity is
  // enough to open this account's local data; server writes still require JWT/RLS.
  const saved = readOfflineValue<Session | null>(authStorageKey, null);
  if (!saved?.user?.id || !saved.access_token || !saved.refresh_token) return null;
  const profile = readOfflineValue<{ id?: string } | null>('agrigest:v2:profile:' + saved.user.id, null);
  return profile?.id === saved.user.id ? saved : null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(savedDeviceSession);
  const [loading, setLoading] = useState(() => navigator.onLine && !savedDeviceSession());
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;

    const refresh = async () => {
      const current = ++generation;
      clearTimeout(deadline);
      setLoading(navigator.onLine && !savedDeviceSession());
      deadline = setTimeout(() => {
        if (disposed || current !== generation) return;
        setSession(savedDeviceSession());
        setError(new Error('Não foi possível confirmar a conexão. Os dados já salvos neste dispositivo continuam disponíveis.'));
        setLoading(false);
      }, 5000);
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (disposed || current !== generation) return;
        setError(error);
        setSession(session ?? (error ? savedDeviceSession() : null));
      } catch (error) {
        if (disposed || current !== generation) return;
        setError(error instanceof Error ? error : new Error(String(error)));
        setSession(savedDeviceSession());
      } finally {
        if (!disposed && current === generation) {
          clearTimeout(deadline);
          setLoading(false);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      generation++;
      clearTimeout(deadline);
      setSession(event === 'SIGNED_OUT' ? null : session ?? savedDeviceSession());
      setError(null);
      setLoading(false);
    });

    if (navigator.onLine) void refresh();
    const offline = () => {
      generation++;
      clearTimeout(deadline);
      setSession(savedDeviceSession());
      setLoading(false);
    };
    window.addEventListener('online', refresh);
    window.addEventListener('offline', offline);
    return () => {
      disposed = true;
      clearTimeout(deadline);
      subscription.unsubscribe();
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', offline);
    };
  }, [attempt]);

  return { session, loading, error, retry: () => setAttempt(value => value + 1) };
}
