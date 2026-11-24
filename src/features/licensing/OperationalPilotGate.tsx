import {createContext,useContext,useCallback,useEffect,useState,type ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '../../lib/supabase';
import OwnerDevices from './OwnerDevices';
import {roleName} from './team';
import './ownerPlans.css';
export type PilotContext={institution_id:string;name:string;license_id:string;role:string;permissions:Record<string,{read:boolean;write:boolean}>};
const PilotAccess=createContext<PilotContext|null>(null);
export const usePilotAccess=()=>useContext(PilotAccess);
export function pilotModule(path:string){if(path.startsWith('/monitoring'))return 'monitoring';if(path.startsWith('/rainfall'))return 'rainfall';if(path.startsWith('/inventory'))return 'inventory';if(path.startsWith('/operations'))return 'operations';if(path.startsWith('/areas'))return 'areas';if(path.startsWith('/farm-map'))return 'maps';if(path.startsWith('/precision'))return 'precision';return 'maintenance';}
export default function OperationalPilotGate({userId,children}:{userId:string;children:(context:PilotContext)=>ReactNode}){
 const [context,setContext]=useState<PilotContext>(),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
 const location=useLocation();
 const refresh=useCallback(async()=>{setBusy(true);try{const r=await (supabase as unknown as SupabaseClient).schema('licensing').rpc('operational_context');if(r.error)throw r.error;setContext(r.data);setFailed(false);}catch{setContext(undefined);setFailed(true);}finally{setBusy(false);}},[]);
 useEffect(()=>{void refresh();const check=()=>void refresh();window.addEventListener('focus',check);const timer=setInterval(check,60000);return()=>{window.removeEventListener('focus',check);clearInterval(timer);};},[refresh]);
 const module=pilotModule(location.pathname),permission=context?.permissions[module];
 const isForm=/\/(new|edit)(\/|$)/.test(location.pathname);
 const allowed=permission?.read&&(!isForm||permission.write);
 return <PilotAccess.Provider value={context??null}><aside className="p-3 bg-amber-100 text-amber-950" role="status"><strong>AgriGest — TESTE LOCAL</strong> · Cópia isolada. Lançamentos feitos aqui não vão para a fazenda em produção.</aside>
 {!context?<section className="p-6"><p role={failed?'alert':'status'}>{failed?'Não foi possível confirmar seu acesso ao piloto. Verifique o Docker e o vínculo da conta.':'Verificando acesso ao piloto…'}</p><button disabled={busy} onClick={()=>void refresh()}>Tentar novamente</button><button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sair</button></section>:<>
 <details className="p-3 border-b"><summary>{context.name} · {roleName(context.role)} · Licença e acesso de teste</summary><div className="owner-plans"><OwnerDevices client={supabase as unknown as SupabaseClient} connectionId={import.meta.env.VITE_SUPABASE_URL} userId={userId} licenseId={context.license_id} member={context.role!=='owner'}/><button disabled={busy} onClick={()=>void refresh()}>Atualizar permissões do aplicativo</button><p>Autorize a instalação e atualize as permissões para testar gravações. Serviços de cobrança, convites por email e satélite não estão conectados neste piloto.</p></div></details>
 {!permission?.write&&<p className="p-3 bg-amber-50" role="status">Esta seção está em modo de consulta. Para gravar, são necessários função permitida, licença ativa e instalação autorizada.</p>}
 {allowed?children(context):<section className="p-6"><p role="alert">Sua permissão atual não permite abrir esta página.</p><Link className="underline" to="/monitoring">Monitoramento</Link> · <Link className="underline" to="/rainfall">Pluviometria</Link> · <Link className="underline" to="/areas">Áreas</Link><button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sair</button></section>}
 </>}
 </PilotAccess.Provider>;
}
