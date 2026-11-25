import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';import {useAuth} from '../hooks/useAuth';
import Select from '../components/ui/Select';
import OperationalTeam,{type OperationalTeamData} from '../features/licensing/OperationalTeam';
import OwnerDevices from '../features/licensing/OwnerDevices';
import type {TeamFarm} from '../features/licensing/FarmAccessChoices';
import {roleName,teamProblem} from '../features/licensing/team';
import ClientAccountAccess from '../features/licensing/ClientAccountAccess';
import '../features/licensing/ownerPlans.css';
type Company={id:string;name:string;kind:string;owner:boolean;role:string;license_id:string;active:boolean};
export default function ConsultancyTeam(){
 const {session,loading:authLoading}=useAuth(),[companies,setCompanies]=useState<Company[]>([]),[selected,setSelected]=useState(''),[team,setTeam]=useState<OperationalTeamData>(),[farms,setFarms]=useState<TeamFarm[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');const generation=useRef(0);
 const [accountId,setAccountId]=useState('');
 const client=supabase as unknown as SupabaseClient,connectionId=import.meta.env.VITE_SUPABASE_URL;
 const refresh=useCallback(async()=>{if(!session)return;const current=++generation.current;setBusy(true);setError('');try{
  const home=await client.schema('licensing').rpc('workspace_home');if(home.error)throw home.error;
  const list=(home.data.organizations as Company[]).filter(o=>o.kind==='consultancy');
  const org=list.find(o=>o.id===selected)??list[0];
  let detail:OperationalTeamData|undefined,available:TeamFarm[]=[];
  if(org?.owner){const [t,f]=await Promise.all([client.schema('licensing').rpc('workspace_team',{p_org:org.id}),client.schema('licensing').rpc('workspace_available_farms',{p_org:org.id})]);if(t.error)throw t.error;if(f.error)throw f.error;detail=t.data;available=f.data;}
  if(generation.current===current){setAccountId(session.user.id);setCompanies(list);setSelected(org?.id??'');setTeam(detail);setFarms(available);}
 }catch(e){if(generation.current===current){setTeam(undefined);setFarms([]);setError(teamProblem(e));}}finally{if(generation.current===current)setBusy(false);}},[session?.user.id,selected]);
 useEffect(()=>{setTeam(undefined);setFarms([]);void refresh();return()=>{generation.current++;};},[refresh]);
 const company=accountId===session?.user.id?companies.find(o=>o.id===selected):undefined;
 return <main className="min-h-screen bg-gray-50 px-4 py-6"><div className="mx-auto max-w-4xl space-y-5">
  <header className="space-y-3"><h1 className="text-2xl font-semibold">Equipe da consultoria</h1><p className="rounded-lg border border-amber-200 bg-amber-50 p-3">Teste local. Contas e lançamentos em produção permanecem separados.</p><nav className="flex flex-wrap gap-4"><Link className="underline" to="/members-license">Membros e licença da fazenda</Link><Link className="underline" to="/convite">Minha conta e convites</Link></nav></header>
  {authLoading?<p>Verificando sua conta…</p>:!session?<div className="owner-plans !p-0"><ClientAccountAccess client={client} connectionId={connectionId} redirectTo="http://127.0.0.1:48780/convite"/></div>:<>
   <p className="break-all">Conta: {session.user.email}</p><button className="rounded-lg border px-4 py-2" disabled={busy} onClick={()=>void refresh()}>Atualizar equipe da consultoria</button>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
   {!busy&&!error&&!companies.length&&<p>Sua conta não está vinculada a uma empresa de consultoria neste piloto. O cadastro de conta, por si só, não cria uma empresa ou licença.</p>}
   {accountId===session.user.id&&companies.length>1&&<Select label="Consultoria selecionada" value={selected} options={companies.map(o=>({value:o.id,label:o.name}))} disabled={busy} onChange={e=>{generation.current++;setTeam(undefined);setFarms([]);setSelected(e.target.value);}}/>}
   {company&&<section className="rounded-xl border bg-white p-4 lg:p-6 space-y-4"><h2 className="text-xl font-semibold">{company.name}</h2><p>{roleName(company.role)} · {company.active?'Licença ativa':'Licença inativa — somente consulta'}</p><p>Proprietário + 3 funcionários e 5 aparelhos base. Cada usuário adicional contratado libera mais 2 aparelhos. A cota é compartilhada pela empresa.</p>
    <p className="text-sm text-gray-600">Nos clientes, administrador e responsável por aplicação continuam limitados às permissões da consultoria: não executam operações nem movimentam estoque por esse vínculo. O monitor lança apenas seus próprios monitoramentos e chuvas. Só o titular gerencia a equipe e autoriza aparelhos.</p>
    {company.owner&&team?<OperationalTeam key={company.id} org={company.id} active={company.active} team={team} ownerEmail={session.user.email??''} refresh={refresh} farms={farms}/>:busy?<p>Consultando equipe e fazendas…</p>:!company.owner&&<p>Sua função é {roleName(company.role)}. Somente o titular pode consultar a equipe completa e modificar as fazendas permitidas.</p>}
    <div className="owner-plans !p-0 !max-w-none [&_label]:flex-wrap [&_input]:!min-w-0 [&_input]:w-full break-words"><OwnerDevices key={company.license_id} client={client} connectionId={connectionId} userId={session.user.id} licenseId={company.license_id} member={!company.owner} operational onChange={refresh}/></div>
   </section>}
  </>}
 </div></main>;
}
