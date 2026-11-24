import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export const operationalPilot = import.meta.env.VITE_OPERATIONAL_PILOT === 'true';
const runtimePilot = operationalPilot ? (window as Window & { __AGRIGEST_PILOT__?: { apiUrl: string; anonKey: string; institutionId: string } }).__AGRIGEST_PILOT__ : undefined;
const supabaseUrl = operationalPilot ? runtimePilot?.apiUrl : import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = operationalPilot ? runtimePilot?.anonKey : import.meta.env.VITE_SUPABASE_ANON_KEY;
const pilotInstitution = runtimePilot?.institutionId;
if (operationalPilot && (supabaseUrl !== 'http://127.0.0.1:48721' || !/^[a-f0-9-]{36}$/i.test(pilotInstitution ?? ''))) {
  throw new Error('Piloto recusado: conexão local ou fazenda inválida.');
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please click "Connect to Supabase" button to set up your project.');
}

export const authStorageKey = (operationalPilot ? 'agrigest-operational-pilot-' : 'sb-') + new URL(supabaseUrl).hostname.split('.')[0] + '-auth-token';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: authStorageKey,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'x-application-name': operationalPilot ? 'agrigest-local-pilot' : 'agrigest',
      ...(operationalPilot ? { 'x-agrigest-institution-id': pilotInstitution } : {})
    }
  }
});
