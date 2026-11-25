import {useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '../../lib/supabase';
import {requestKey} from '../../lib/businessWrites';
import Select from '../../components/ui/Select';
import {teamProblem} from './team';

export type ConsultantGrant={id:string;name:string;revoked_at:string|null};
type Company={id:string;name:string};
export default function OperationalConsultants({org,active,grants,refresh}:{org:string;active:boolean;grants:ConsultantGrant[];refresh:()=>Promise<void>}){
 const [email,setEmail]=useState(''),[companies,setCompanies]=useState<Company[]>([]),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);const lock=useRef(false);
 const client=supabase as unknown as SupabaseClient;
 const run=async(task:()=>Promise<string>)=>{if(lock.current)return;lock.current=true;setBusy(true);setNotice('');setFailed(false);try{setNotice(await task());await refresh();}catch(e){setFailed(true);setNotice(teamProblem(e));}finally{lock.current=false;setBusy(false);}};
 const verify=()=>run(async()=>{const r=await client.schema('licensing').rpc('workspace_consultancies',{p_org:org,p_email:email.trim()});if(r.error)throw r.error;const list=r.data as Company[];setCompanies(list);setSelected(list.length===1?list[0].id:'');return list.length?'Consultoria cadastrada. Confira a empresa antes de enviar o convite.':'Não encontramos uma consultoria com licença ativa neste email. O consultor precisa cadastrar e ativar sua empresa antes de receber o convite.';});
 const send=()=>run(async()=>{const body={organization_id:org,email:email.trim().toLowerCase(),role:'consultant',farms:[],consultancy_id:selected};const key=await requestKey({pilotConsultantInvite:body});const r=await client.functions.invoke('team-invite',{body:{...body,request_id:key.id}});if(r.error){let code='';if(r.error.context instanceof Response)code=(await r.error.context.clone().json().catch(()=>null))?.error??'';throw Error(code||'TEAM_INVITE_UNAVAILABLE');}if(r.data?.state==='email_failed')return 'Convite reservado, mas o email não chegou à caixa local. Repita o envio com os mesmos dados para recuperar esta tentativa.';if(r.data?.state!=='sent')throw Error('TEAM_INVITE_UNAVAILABLE');key.acknowledge();setEmail('');setCompanies([]);setSelected('');return 'Convite de consultoria enviado à caixa local. O titular precisa entrar com o email convidado e aceitar para acessar esta fazenda.';});
 return <div className="space-y-4" data-operational-consultants>
  <p>O consultor terá acesso somente a esta fazenda: consulta de estoque, aplicações e mapas; recomendações, monitoramentos e chuva. Este vínculo não permite executar operações, movimentar estoque ou administrar sua equipe.</p>
  <p className="text-sm text-gray-600">A consultoria usa sua própria licença e cota de aparelhos. Seus funcionários não recebem acesso automaticamente. Convites deste piloto chegam somente à caixa local de testes.</p>
  {notice&&<p role={failed?'alert':'status'} className={failed?'text-red-700':'text-brand-800'}>{notice}</p>}
  <details><summary className="cursor-pointer font-medium">Convidar consultoria</summary><div className="mt-3 space-y-3">
   <label className="block">Email do titular da consultoria<input className="mt-1 block w-full rounded-lg border px-3 py-2" type="email" value={email} maxLength={254} disabled={busy||!active} onChange={e=>{setEmail(e.target.value);setCompanies([]);setSelected('');setNotice('');}}/></label>
   <button className="rounded-lg border px-4 py-2" disabled={busy||!active||!email.includes('@')} onClick={()=>void verify()}>Verificar cadastro da consultoria</button>
   {companies.length>0&&<Select label="Empresa de consultoria" options={companies.map(c=>({value:c.id,label:c.name}))} value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy||!active}/>}
   <button className="rounded-lg border px-4 py-2" disabled={busy||!active||!selected} onClick={()=>{const company=companies.find(c=>c.id===selected);if(company&&window.confirm('Convidar '+company.name+' para acessar esta fazenda?'))void send();}}>Enviar convite de consultoria</button>
  </div></details>
  {grants.length===0&&<p>Nenhuma consultoria vinculada a esta fazenda.</p>}
  {grants.map(c=><article key={c.id} className="rounded-lg border p-3 space-y-2"><strong>{c.name}</strong><p>{c.revoked_at?'Acesso revogado':'Acesso autorizado nesta fazenda'}</p>{!c.revoked_at&&<button className="rounded-lg border border-red-200 px-4 py-2 text-red-700" disabled={busy} onClick={()=>{if(window.confirm('Revogar o acesso de '+c.name+' e dos funcionários que dependem deste vínculo? Contas e lançamentos serão preservados.'))void run(async()=>{const r=await client.schema('licensing').rpc('workspace_revoke_consultant',{p_org:org,p_grant:c.id});if(r.error)throw r.error;return 'Acesso da consultoria revogado. Contas e lançamentos foram preservados.';});}}>Revogar acesso da consultoria</button>}</article>)}
 </div>;
}
