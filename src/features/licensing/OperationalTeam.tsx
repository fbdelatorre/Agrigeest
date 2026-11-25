import {useRef,useState} from 'react';import type {SupabaseClient} from '@supabase/supabase-js';
import Select from '../../components/ui/Select';import {supabase} from '../../lib/supabase';import {requestKey} from '../../lib/businessWrites';import {employeeRoles,roleName,teamProblem} from './team';
import LocalPortalLink from './LocalPortalLink';
import FarmAccessChoices,{type TeamFarm} from './FarmAccessChoices';
export type TeamMember={id:string;email:string;role:string;version:string;revoked_at:string|null;authorized_devices?:number;farms?:string[]};
export type OperationalTeamData={used:number;limit:number;owner_authorized_devices?:number;members:TeamMember[];invitations:{id:string;email:string;role:string;state:string;delivery:string}[]};
type Run=(task:()=>Promise<string>)=>Promise<void>;
const roleOptions=employeeRoles.map(value=>({value,label:roleName(value)}));
function DeviceCount({count}:{count?:number}){return count===undefined?null:<span className="inline-flex rounded-full bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800" data-authorized-device-count={count}>{count} {count===1?'aparelho autorizado':'aparelhos autorizados'}</span>;}
async function mutate(fn:string,args:Record<string,unknown>){const key=await requestKey({pilotTeam:fn,...args});const r=await(supabase as unknown as SupabaseClient).schema('licensing').rpc(fn,{...args,p_request:key.id});if(r.error)throw r.error;key.acknowledge();return r.data;}
function Member({member,org,active,busy,run,farms}:{member:TeamMember;org:string;active:boolean;busy:boolean;run:Run;farms?:TeamFarm[]}){
 const [role,setRole]=useState(member.role),[selected,setSelected]=useState(member.farms??[]);
 const changed=role!==member.role||JSON.stringify([...selected].sort())!==JSON.stringify([...(member.farms??[])].sort());
 return <li className="py-4 space-y-3"><div className="flex flex-wrap items-center gap-2"><strong className="break-all">{member.email}</strong><DeviceCount count={member.authorized_devices}/></div><p>{roleName(member.role)}{member.revoked_at?' · Desligado':''}</p>{!member.revoked_at&&<details><summary className="cursor-pointer font-medium">Gerenciar funcionário</summary><div className="mt-3 space-y-3">
 <Select label={'Função de '+member.email} options={roleOptions} value={role} onChange={e=>setRole(e.target.value)} disabled={busy||!active}/>
 {farms&&<FarmAccessChoices farms={farms} selected={selected} onChange={setSelected} disabled={busy||!active}/>}
 <button className="rounded-lg border px-4 py-2" disabled={busy||!active||!changed} onClick={()=>{if(window.confirm('Salvar a função de '+member.email+' como '+roleName(role)+(farms?' e as fazendas selecionadas':'')+'?'))void run(async()=>{await mutate('workspace_update_member',{p_org:org,p_member:member.id,p_role:role,p_farms:farms?selected:[],p_version:member.version});return farms?'Função e fazendas atualizadas. Os acessos serão conferidos pelo servidor nas próximas ações do funcionário.':'Função atualizada. A nova permissão será conferida pelo servidor nas próximas ações do funcionário.';});}}>{farms?'Salvar função e fazendas':'Salvar função'}</button>
 <button className="rounded-lg border border-red-200 px-4 py-2 text-red-700" disabled={busy} onClick={()=>{if(window.confirm('Desligar '+member.email+' desta empresa? A conta, a autoria e os lançamentos serão preservados. A cota contratada será mantida.'))void run(async()=>{await mutate('workspace_remove_member',{p_org:org,p_member:member.id,p_cancel_extra:false});return 'Funcionário desligado e autorizações desta licença revogadas. A conta e o histórico continuam salvos; a vaga fica disponível para outro convite.';});}}>Desligar funcionário</button>
 </div></details>}</li>;
}
export default function OperationalTeam({org,active,team,ownerEmail,refresh,farms}:{org:string;active:boolean;team:OperationalTeamData;ownerEmail:string;refresh:()=>Promise<void>;farms?:TeamFarm[]}){
 const [email,setEmail]=useState(''),[role,setRole]=useState('administrator'),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false),[selected,setSelected]=useState<string[]>([]);const lock=useRef(false);
 const run:Run=async task=>{if(lock.current)return;lock.current=true;setBusy(true);setNotice('');try{const message=await task();await refresh();setFailed(false);setNotice(message);}catch(e){setFailed(true);setNotice(teamProblem(e));}finally{lock.current=false;setBusy(false);}};
 const send=()=>run(async()=>{const body={organization_id:org,email:email.trim().toLowerCase(),role,farms:farms?selected:[],consultancy_id:null};const key=await requestKey({pilotInvite:body});const r=await(supabase as unknown as SupabaseClient).functions.invoke('team-invite',{body:{...body,request_id:key.id}});if(r.error){let code='';if(r.error.context instanceof Response)code=(await r.error.context.clone().json().catch(()=>null))?.error??'';throw Error(code||'TEAM_INVITE_UNAVAILABLE');}if(r.data?.state==='email_failed')return 'Convite reservado, mas o email não chegou à caixa local. Tente enviar novamente com os mesmos dados para recuperar esta tentativa.';if(r.data?.state!=='sent')throw Error('TEAM_INVITE_UNAVAILABLE');key.acknowledge();setEmail('');setSelected([]);return r.data.registered?'Convite enviado à caixa local. A conta já existe; o destinatário precisa entrar e aceitar para receber a função.':'Convite enviado à caixa local com link para cadastro. Empresa e função serão preenchidas automaticamente; o acesso depende da confirmação do email e da aceitação.';});
 const recovering=team.invitations.some(i=>i.state==='pending'&&i.delivery==='failed'&&i.email===email.trim().toLowerCase()&&i.role===role);
 return <div className="space-y-4">
  <p>{team.used} de {team.limit} vagas, incluindo proprietário e convites pendentes.</p>
  {notice&&<p className={failed?'text-red-700':'text-brand-800'} role={failed?'alert':'status'}>{notice}</p>}
  <details><summary className="cursor-pointer font-medium">Convidar funcionário</summary><div className="mt-3 space-y-3">
   <label className="block">Email do convidado<input className="mt-1 block w-full rounded-lg border px-3 py-2" type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} disabled={busy||!active}/></label>
   <Select label="Função no convite" options={roleOptions} value={role} onChange={e=>setRole(e.target.value)} disabled={busy||!active}/>
   {farms&&<FarmAccessChoices farms={farms} selected={selected} onChange={setSelected} disabled={busy||!active}/>}
   {team.used>=team.limit&&<p className="text-sm text-amber-800">Todas as vagas estão ocupadas ou reservadas. Libere uma vaga ou revogue um convite pendente antes de convidar outra pessoa.</p>}
   <button className="rounded-lg border px-4 py-2" disabled={busy||!active||!email.includes('@')||(team.used>=team.limit&&!recovering)} onClick={()=>void send()}>Enviar convite de teste</button>
   <p className="text-sm text-gray-600">Nesta etapa o email fica somente na caixa local de testes. Nenhuma mensagem será enviada para a caixa real do destinatário.</p><LocalPortalLink page="mailbox" label="Abrir caixa local de emails"/>
  </div></details>
  <ul className="divide-y"><li className="py-3"><div className="flex flex-wrap items-center gap-2"><strong className="break-all">{ownerEmail}</strong><DeviceCount count={team.owner_authorized_devices}/></div><p>Proprietário</p></li>{team.members.filter(m=>!m.revoked_at).map(member=><Member key={member.id+':'+member.version+':'+JSON.stringify(member.farms??[])} member={member} org={org} active={active} busy={busy} run={run} farms={farms}/>)}</ul>
  <details><summary className="cursor-pointer font-medium">Convites e funcionários desligados</summary>
   {team.invitations.length===0&&<p className="py-3">Nenhum convite registrado.</p>}
   {team.invitations.map(i=><article className="py-3 space-y-2" key={i.id}><strong className="break-all">{i.email}</strong><p>{roleName(i.role)} · {({pending:'Pendente',accepted:'Aceito',revoked:'Revogado',expired:'Expirado'} as Record<string,string>)[i.state]??i.state} · {i.delivery==='sent'?'Email na caixa local':i.delivery==='failed'?'Email não entregue':'Email em preparação'}</p>{i.state==='pending'&&<button className="rounded-lg border px-4 py-2" disabled={busy} onClick={()=>void run(async()=>{const r=await(supabase as unknown as SupabaseClient).schema('licensing').rpc('workspace_revoke_invite',{p_org:org,p_invite:i.id});if(r.error)throw r.error;return 'Convite revogado. A vaga reservada foi liberada.';})}>Revogar convite</button>}</article>)}
   <ul className="divide-y">{team.members.filter(m=>m.revoked_at).map(member=><Member key={member.id} member={member} org={org} active={active} busy={busy} run={run} farms={farms}/>)}</ul>
  </details>
 </div>;
}
