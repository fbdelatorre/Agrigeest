import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { authStorageKey, supabase } from '../lib/supabase';
import { readOfflineValue } from './useOfflineStorage';

function savedOfflineSession() {
  if (navigator.onLine) return null;
  const saved = readOfflineValue<Session | null>(authStorageKey, null);
  if (!saved?.user?.id || !saved.access_token || !saved.refresh_token) return null;
  const profile = readOfflineValue<{ id?: string } | null>('agrigest:v2:profile:' + saved.user.id, null);
  return profile?.id === saved.user.id ? saved : null;
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(savedOfflineSession);
  const [loading, setLoading] = useState(navigator.onLine);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let disposed = false;
    let generation = 0;

    const refresh = async () => {
      const current = ++generation;
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (disposed || current !== generation) return;
        setError(error);
        setSession(session ?? savedOfflineSession());
      } catch (error) {
        if (disposed || current !== generation) return;
        setError(error instanceof Error ? error : new Error(String(error)));
        setSession(savedOfflineSession());
      } finally {
        if (!disposed && current === generation) setLoading(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      generation++;
      setSession(event === 'SIGNED_OUT' ? null : session ?? savedOfflineSession());
      setLoading(false);
    });

    if (navigator.onLine) void refresh();
    window.addEventListener('online', refresh);
    return () => {
      disposed = true;
      subscription.unsubscribe();
      window.removeEventListener('online', refresh);
    };
  }, []);

  return { session, loading, error };
}
