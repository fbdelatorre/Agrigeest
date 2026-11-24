import type {SupabaseClient} from '@supabase/supabase-js';
import OwnerPlanPortal from '../features/licensing/OwnerPlanPortal';
import {supabase} from '../lib/supabase';
import {useAppContext} from '../context/AppContext';
export default function LicensePlans(){const {profile}=useAppContext();return <OwnerPlanPortal key={profile?.id??'no-profile'} client={supabase as unknown as SupabaseClient} connectionId={import.meta.env.VITE_SUPABASE_URL} initialLabel={profile?.institution??''}/>;}
