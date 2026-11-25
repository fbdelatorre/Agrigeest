import {useCallback,useEffect,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {supabase} from '../lib/supabase';
import {useAppContext} from '../context/AppContext';
import {usePilotAccess,usePilotControls} from '../features/licensing/OperationalPilotGate';
import OwnerDevices from '../features/licensing/OwnerDevices';
import {roleName,teamProblem} from '../features/licensing/team';
import '../features/licensing/ownerPlans.css';
import OperationalTeam,{type OperationalTeamData} from '../features/licensing/OperationalTeam';
type Organization={id:string;license_id:string;active:boolean};
type Team=OperationalTeamData;
export default function MembersLicense(){
 const access=usePilotAccess(),controls=usePilotControls(),{profile}=useAppContext();
 const [organization,setOrganization]=useState<Organization>(),[team,setTeam]=useState<Team>(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const refresh=useCallback(async()=>{if(!access)return;setLoading(true);setError('');try{
  const client=supabase as unknown as SupabaseClient;
  const home=await client.schema('licensing').rpc('workspace_home');if(home.error)throw home.error;
  const org=(home.data.organizations as Organization[]).find(o=>o.license_id===access.license_id);setOrganization(org);
  if(access.role==='owner'&&org){const r=await client.schema('licensing').rpc('workspace_team',{p_org:org.id});if(r.error)throw r.error;setTeam(r.data);}else setTeam(undefined);
  await controls?.refresh();
 }catch(e){setError(teamProblem(e));}finally{setLoading(false);}},[access?.license_id,access?.role]);
 useEffect(()=>{void refresh();},[refresh]);
 if(!access||!profile)return null;
 return <div className="space-y-5" data-members-license>
  <section className="rounded-xl border border-gray-200 bg-white p-4 lg:p-6 space-y-3">
   <h2 className="text-xl font-semibold">Licença da propriedade</h2><p className="font-medium break-words">{access.name}</p>
   <p>Sua função: <strong>{roleName(access.role)}</strong></p>
   {organization&&<p>{organization.active?'Licença de teste ativa':'Licença inativa — histórico disponível para consulta'}</p>}
   <p className="text-sm text-gray-600">Este piloto não gera cobranças. Cada instalação autorizada ocupa uma vaga. Somente o proprietário pode autorizar aparelhos, convidar, alterar funções e desligar funcionários.</p>
   <button className="rounded-lg border px-4 py-2" disabled={loading||controls?.busy} onClick={()=>void refresh()}>Atualizar permissões do aplicativo</button>
   {error&&<p role="alert" className="text-red-700">{error}</p>}
  </section>
  <section className="rounded-xl border border-gray-200 bg-white p-4 lg:p-6">
   <h2 className="text-xl font-semibold">Aparelhos</h2><div className="owner-plans !p-0 !max-w-none [&_label]:flex-wrap [&_input]:!min-w-0 [&_input]:w-full break-words">
   <OwnerDevices client={supabase as unknown as SupabaseClient} connectionId={import.meta.env.VITE_SUPABASE_URL} userId={profile.id} licenseId={access.license_id} member={access.role!=='owner'} operational/>
   </div><p className="text-sm text-gray-600">Funcionários solicitam a autorização; somente o proprietário pode aprovar. Após a aprovação, atualize as permissões acima para liberar as ações permitidas à sua função.</p>
  </section>
  <section className="rounded-xl border border-gray-200 bg-white p-4 lg:p-6 space-y-3">
   <h2 className="text-xl font-semibold">Membros da equipe</h2>
   {team&&organization?<OperationalTeam org={organization.id} active={organization.active} team={team} ownerEmail={profile.email} refresh={refresh}/>:<p>{access.role==='owner'?'Carregando equipe…':'Sua função: '+roleName(access.role)+'. A gestão da equipe fica com o proprietário.'}</p>}
   <p className="text-sm text-gray-600">Convites de funcionários e alterações da equipe utilizam somente esta cópia local. Consultores e contratação de adicionais terão uma etapa própria nesta integração.</p>
  </section>
 </div>;
}
