import {createContext,useContext,useCallback,useEffect,useState,useRef,type ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase,authStorageKey,pilotInstitutionForUser,pilotRequestInstitution} from '../../lib/supabase';
import type {Session} from '@supabase/supabase-js';
import {clearPilotOffline,preparePilotOffline,readPilotOffline} from './pilotOffline';
import OwnPendingNotice from './OwnPendingNotice';
export type PilotContext={institution_id:string;name:string;license_id:string;role:string;permissions:Record<string,{read:boolean;write:boolean}>;offline?:boolean;offlineUntil?:number;offlineReason?:string;offlineReadyUntil?:number};
const PilotAccess=createContext<PilotContext|null>(null);
const PilotControls=createContext<{refresh:()=>Promise<void>;busy:boolean}|null>(null);
export const usePilotAccess=()=>useContext(PilotAccess);
export const usePilotControls=()=>useContext(PilotControls);
function cachedSession(userId:string){try{const session=JSON.parse(localStorage.getItem(authStorageKey)??'null') as Session|null;return session?.user.id===userId?session:null;}catch{return null;}}
export function OperationalPilotNotices(){
 const context=usePilotAccess(),{pathname}=useLocation();
 if(!context)return null;
 const write=context.permissions[pilotModule(pathname)]?.write;
 return <div className="mb-4 space-y-2" data-pilot-notices>
  <aside className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status"><strong>AgriGest — TESTE LOCAL</strong> · Cópia isolada. Lançamentos feitos aqui não vão para a fazenda em produção. <Link className="underline font-medium" to="/members-license">Membros e licença</Link> · <Link className="underline font-medium" to="/farms">Trocar fazenda</Link></aside>
  {!context.offline&&context.offlineReadyUntil&&<p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm" data-offline-ready>Autorização para uso offline válida até {new Date(context.offlineReadyUntil).toLocaleString('pt-BR')}. Antes de sair, selecione a safra e carregue os talhões e produtos que vai utilizar.</p>}
  {context.offline&&<p role="status" className="rounded-lg border bg-blue-50 p-3">{context.offlineReason==='valid'?'Modo offline: monitoramentos, recomendações e chuvas conforme sua função. Autorização válida até '+new Date(context.offlineUntil!).toLocaleString('pt-BR')+'. Os envios dependem da revalidação no servidor.':context.offlineReason==='clock'?'O relógio deste aparelho precisa ser conferido. Novos registros estão bloqueados até reconectar; os registros salvos permanecem disponíveis.':'A autorização offline venceu. Reconecte para renovar. Os registros e as pendências permanecem preservados para consulta.'}</p>}
  {!write&&pathname!=='/members-license'&&<p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">Esta seção está em modo de consulta. Para gravar, são necessários função permitida, licença ativa e instalação autorizada.</p>}
 </div>;
}
export function pilotModule(path:string){if(path.startsWith('/monitoring'))return 'monitoring';if(path.startsWith('/rainfall'))return 'rainfall';if(path.startsWith('/inventory'))return 'inventory';if(path.startsWith('/operations'))return 'operations';if(path.startsWith('/areas'))return 'areas';if(path.startsWith('/farm-map'))return 'maps';if(path.startsWith('/precision'))return 'precision';return 'maintenance';}
export default function OperationalPilotGate({userId,children}:{userId:string;children:(context:PilotContext)=>ReactNode}){
 const [context,setContext]=useState<PilotContext>(),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
 const location=useLocation(),selectionChecked=useRef(false),generation=useRef(0),controller=useRef<AbortController>();
 const refresh=useCallback(async()=>{const current=++generation.current;controller.current?.abort();const active=new AbortController();controller.current=active;const timeout=setTimeout(()=>active.abort(),8000);setBusy(true);
  try{if(!selectionChecked.current){selectionChecked.current=true;if(pilotInstitutionForUser(userId)!==pilotRequestInstitution){window.location.reload();return;}}
   const session=navigator.onLine?await Promise.race([supabase.auth.getSession().then(r=>r.data.session),new Promise<null>(resolve=>active.signal.addEventListener('abort',()=>resolve(null),{once:true}))]):cachedSession(userId);if(!session||session.user.id!==userId){if(active.signal.aborted)throw Error('NETWORK_UNAVAILABLE');throw Error('ACCOUNT_CHANGED');}
   if(!navigator.onLine){const cached=await readPilotOffline(session,pilotRequestInstitution!);if(current===generation.current){setContext(cached);setFailed(false);}return;}
   const r=await (supabase as unknown as SupabaseClient).schema('licensing').rpc('operational_context').abortSignal(active.signal);
   if(current!==generation.current)return;
   if(r.error){if(r.status===401||r.status===403||['42501','P0001'].includes(r.error.code)){clearPilotOffline(userId,pilotRequestInstitution!);throw Error('ACCESS_DENIED');}throw r.error;}
   if(current!==generation.current)return;
   setContext(r.data);setFailed(false);
   try{const previous=await readPilotOffline(session,pilotRequestInstitution!);if(current!==generation.current)return;if(previous.license_id!==r.data.license_id||Object.entries(previous.permissions).some(([module,v])=>(v.write&&!r.data.permissions[module]?.write)||(v.read&&!r.data.permissions[module]?.read)))clearPilotOffline(userId,pilotRequestInstitution!);}catch{/* No verified authorization exists to reuse. */}
   if(current!==generation.current)return;
   try{const prepared=await preparePilotOffline(supabase as unknown as SupabaseClient,session,pilotRequestInstitution!,active.signal);if(!prepared&&!active.signal.aborted)clearPilotOffline(userId,pilotRequestInstitution!);if(prepared&&current===generation.current&&!active.signal.aborted){const lease=await readPilotOffline(session,pilotRequestInstitution!);if(current===generation.current)setContext({...r.data,offlineReadyUntil:lease.offlineUntil});}}catch{/* A transport failure does not discard a still valid signed lease. */}
  }catch(e){if(current!==generation.current)return;try{if(e instanceof Error&&['ACCESS_DENIED','ACCOUNT_CHANGED'].includes(e.message))throw e;const session=cachedSession(userId);if(!session)throw Error('SESSION_REQUIRED');const cached=await readPilotOffline(session,pilotRequestInstitution!);if(current===generation.current){setContext(cached);setFailed(false);}}catch{if(current===generation.current){setContext(undefined);setFailed(true);}}}
  finally{clearTimeout(timeout);if(current===generation.current)setBusy(false);}
 },[userId]);
 useEffect(()=>{void refresh();const check=()=>void refresh();window.addEventListener('focus',check);window.addEventListener('online',check);window.addEventListener('offline',check);const timer=setInterval(check,60000);return()=>{generation.current++;controller.current?.abort();window.removeEventListener('focus',check);window.removeEventListener('online',check);window.removeEventListener('offline',check);clearInterval(timer);};},[refresh]);
 const module=pilotModule(location.pathname),permission=context?.permissions[module];
 const isForm=/\/(new|edit)(\/|$)/.test(location.pathname);
 const allowed=location.pathname==='/members-license'||(permission?.read&&(!isForm||permission.write));
 return <PilotAccess.Provider value={context??null}><PilotControls.Provider value={{refresh,busy}}>
 {!context?<section className="p-6"><OwnPendingNotice userId={userId} institution={pilotRequestInstitution}/><Link className="block underline my-3" to="/pending-records">Meus lançamentos não enviados</Link><p role={failed?'alert':'status'}>{failed?(navigator.onLine?'Não foi possível confirmar seu acesso ao piloto. Confira o servidor, a licença e o vínculo da conta.':'Não há autorização offline válida neste aparelho para esta fazenda. Reconecte e confira Membros e licença. Seus registros locais continuam preservados.'):'Verificando acesso ao piloto…'}</p><button disabled={busy} onClick={()=>void refresh()}>Tentar novamente</button><Link className="block underline my-3" to="/pilot-plans">Plano e licenças</Link><Link className="block underline my-3" to="/farms">Escolher outra fazenda</Link><Link className="block underline my-3" to="/convite">Minha conta e convites recebidos</Link><button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sair</button></section>:<>
 {allowed?children(context):<section className="p-6"><OperationalPilotNotices/><p role="alert">Sua permissão atual não permite abrir esta página.</p><Link className="underline" to="/monitoring">Monitoramento</Link> · <Link className="underline" to="/rainfall">Pluviometria</Link> · <Link className="underline" to="/areas">Áreas</Link> · <Link className="underline" to="/members-license">Membros e licença</Link><button onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sair</button></section>}
 </>}
 </PilotControls.Provider></PilotAccess.Provider>;
}
