import {useEffect,useState} from 'react';import {Link} from 'react-router-dom';import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';import {useAuth} from '../hooks/useAuth';import ClientAccountAccess from '../features/licensing/ClientAccountAccess';import {roleName,teamProblem} from '../features/licensing/team';import {requestKey} from '../lib/businessWrites';import '../features/licensing/ownerPlans.css';
type Preview={id:string;email:string;organization:string;role:string};type Invite={id:string;organization:string;role:string};
export default function PilotInvite(){
 const {session,loading}=useAuth(),[preview,setPreview]=useState<Preview>(),[invites,setInvites]=useState<Invite[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false);
 const client=supabase as unknown as SupabaseClient,connectionId=import.meta.env.VITE_SUPABASE_URL,key='agrigest-incoming-invite:'+connectionId;
 useEffect(()=>{let live=true;void(async()=>{try{const hash=new URLSearchParams(location.hash.slice(1));let id=hash.get('convite'),token=hash.get('token');if(id&&token&&/^[a-f0-9-]{36}$/i.test(id)&&/^[a-f0-9]{64}$/.test(token)){sessionStorage.setItem(key,JSON.stringify({id,token}));history.replaceState(null,'',location.pathname+location.search);}else{const saved=JSON.parse(sessionStorage.getItem(key)??'null');id=saved?.id;token=saved?.token;}if(id&&token){const r=await client.schema('licensing').rpc('invitation_preview',{p_invite:id,p_token:token});if(r.error)throw r.error;if(live)setPreview(r.data);}
 if(session){const r=await client.schema('licensing').rpc('workspace_home');if(r.error)throw r.error;if(live)setInvites(r.data.invitations);}
 }catch(e){if(live)setNotice(teamProblem(e));}})();return()=>{live=false;};},[session?.user.id,key]);
 const accept=async(id:string)=>{if(busy)return;setBusy(true);setNotice('');try{const request=await requestKey({pilotAcceptInvite:id});const r=await client.schema('licensing').rpc('workspace_accept',{p_invite:id,p_request:request.id});if(r.error)throw r.error;request.acknowledge();sessionStorage.removeItem(key);setAccepted(true);setInvites([]);setNotice('Convite aceito. Sua fazenda e função foram atribuídas sem alterar os lançamentos anteriores.');}catch(e){setNotice(teamProblem(e));}finally{setBusy(false);}};
 const wrong=preview&&session&&preview.email.toLowerCase()!==session.user.email?.toLowerCase();
 return <main className="min-h-screen bg-gray-50 px-4 py-8"><div className="owner-plans !p-0 max-w-xl mx-auto [&_label]:flex-wrap [&_input]:!min-w-0 [&_input]:max-w-full">
 <h1 className="text-2xl font-semibold">AgriGest — conta e convites</h1><p className="my-3">Teste local. A conta é preservada quando um vínculo com a fazenda é encerrado.</p>
 {notice&&<p role="status" className="my-4 rounded-lg border p-3">{notice}</p>}
 {loading?<p>Verificando sua sessão…</p>:!session?<ClientAccountAccess client={client} connectionId={connectionId} redirectTo="http://127.0.0.1:48780/convite"/>:<section>
 <p className="break-all">Conta: {session.user.email}</p>
 {wrong?<p role="alert">Este convite é para outra conta. Saia desta sessão e entre com {preview.email} para aceitar.</p>:<>{invites.map(i=><article className="py-4" key={i.id}><h2 className="font-semibold">Convite para {i.organization}</h2><p>Função: {roleName(i.role)}</p><button disabled={busy} onClick={()=>void accept(i.id)}>Aceitar convite</button></article>)}{!invites.length&&!accepted&&<p className="py-3">Nenhum convite pendente. Sua conta continua cadastrada; aguarde um convite para receber uma fazenda e função.</p>}</>}
 <button disabled={busy} onClick={()=>void supabase.auth.signOut({scope:'local'})}>Sair desta conta</button>{accepted&&<Link to="/members-license">Abrir fazenda e conferir aparelhos</Link>}
 </section>}
 <Link className="block my-3" to="/farms">Escolher fazenda</Link><Link className="block my-3" to="/consultancy-team">Equipe da consultoria e aparelhos</Link><Link to="/">Voltar ao aplicativo</Link>
 </div></main>;
}
