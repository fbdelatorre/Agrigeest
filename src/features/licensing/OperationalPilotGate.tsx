import {createContext,useContext,useCallback,useEffect,useState,useRef,type ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase,pilotInstitutionForUser,pilotRequestInstitution} from '../../lib/supabase';
export type PilotContext={institution_id:string;name:string;license_id:string;role:string;permissions:Record<string,{read:boolean;write:boolean}>};
const PilotAccess=createContext<PilotContext|null>(null);
const PilotControls=createContext<{refresh:()=>Promise<void>;busy:boolean}|null>(null);
export const usePilotAccess=()=>useContext(PilotAccess);
export const usePilotControls=()=>useContext(PilotControls);
export function OperationalPilotNotices(){
 const context=usePilotAccess(),{pathname}=useLocation();
 if(!context)return null;
 const write=context.permissions[pilotModule(pathname)]?.write;
 return <div className="mb-4 space-y-2" data-pilot-notices>
  <aside className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status"><strong>AgriGest — TESTE LOCAL</strong> · Cópia isolada. Lançamentos feitos aqui não vão para a fazenda em produção. <Link className="underline font-medium" to="/members-license">Membros e licença</Link> · <Link className="underline font-medium" to="/farms">Trocar fazenda</Link></aside>
  {!write&&pathname!=='/members-license'&&<p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">Esta seção está em modo de consulta. Para gravar, são necessários função permitida, licença ativa e instalação autorizada.</p>}
 </div>;
}
export function pilotModule(path:string){if(path.startsWith('/monitoring'))return 'monitoring';if(path.startsWith('/rainfall'))return 'rainfall';if(path.startsWith('/inventory'))return 'inventory';if(path.startsWith('/operations'))return 'operations';if(path.startsWith('/areas'))return 'areas';if(path.startsWith('/farm-map'))return 'maps';if(path.startsWith('/precision'))return 'precision';return 'maintenance';}
export default function OperationalPilotGate({userId,children}:{userId:string;children:(context:PilotContext)=>ReactNode}){
 const [context,setContext]=useState<PilotContext>(),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
 const location=useLocation(),selectionChecked=useRef(false);
 const refresh=useCallback(async()=>{setBusy(true);try{if(!selectionChecked.current){selectionChecked.current=true;if(pilotInstitutionForUser(userId)!==pilotRequestInstitution){window.location.reload();return;}}const r=await (supabase as unknown as SupabaseClient).schema('licensing').rpc('operational_context');if(r.error)throw r.error;setContext(r.data);setFailed(false);}catch{setContext(undefined);setFailed(true);}finally{setBusy(false);}},[userId]);
 useEffect(()=>{void refresh();const check=()=>void refresh();window.addEventListener('focus',check);const timer=setInterval(check,60000);return()=>{window.removeEventListener('focus',check);clearInterval(timer);};},[refresh]);
 const module=pilotModule(location.pathname),permission=context?.permissions[module];
 const isForm=/\/(new|edit)(\/|$)/.test(location.pathname);
 const allowed=location.pathname==='/members-license'||(permission?.read&&(!isForm||permission.write));
 return <PilotAccess.Provider value={context??null}><PilotControls.Provider value={{refresh,busy}}>
 {!context?<section className="p-6"><p role={failed?'alert':'status'}>{failed?'Não foi possível confirmar seu acesso ao piloto. Verifique o Docker e o vínculo da conta.':'Verificando acesso ao piloto…'}</p><button disabled={busy} onClick={()=>void refresh()}>Tentar novamente</button><Link className="block underline my-3" to="/farms">Escolher outra fazenda</Link><Link className="block underline my-3" to="/convite">Minha conta e convites recebidos</Link><button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sair</button></section>:<>
 {allowed?children(context):<section className="p-6"><OperationalPilotNotices/><p role="alert">Sua permissão atual não permite abrir esta página.</p><Link className="underline" to="/monitoring">Monitoramento</Link> · <Link className="underline" to="/rainfall">Pluviometria</Link> · <Link className="underline" to="/areas">Áreas</Link> · <Link className="underline" to="/members-license">Membros e licença</Link><button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sair</button></section>}
 </>}
 </PilotControls.Provider></PilotAccess.Provider>;
}
