import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import type {SupabaseClient} from '@supabase/supabase-js';
import Select from '../../components/ui/Select';
import {requestKey} from '../../lib/businessWrites';

type License={id:string;name:string;kind:string;version:string;ready:boolean;users_limit:number};
type Company={id:string;name:string;kind:string;license_id:string;version:string;replaceable:boolean;users_used:number};
type Choices={licenses:License[];companies:Company[]};
export function companySetupProblem(error:unknown){
 const code=String((error as {message?:string})?.message??error);
 if(/VERIFIED_PAYMENT_REQUIRED/.test(code))return 'O servidor ainda não confirmou um pagamento válido desta licença. Confira o pagamento e atualize a lista.';
 if(/PLAN_VERSION_CHANGED|LICENSE_ALREADY_LINKED/.test(code))return 'A licença ou a empresa mudou em outra ação. Atualize a lista antes de confirmar novamente.';
 if(/TEAM_CAPACITY_IN_USE/.test(code))return 'A licença escolhida não comporta todos os membros e convites pendentes. Contrate as vagas necessárias antes da troca.';
 if(/DEVICE_CAPACITY_IN_USE/.test(code))return 'A nova licença está com aparelhos acima do limite disponível. Revise as autorizações antes de confirmar o vínculo.';
 if(/COMPLIMENTARY_REPLACEMENT_ONLY/.test(code))return 'A troca está disponível para empresas com cortesia. Uma assinatura paga existente exige a conferência do contrato antes de outra contratação.';
 if(/OWNER_REQUIRED/.test(code))return 'Somente o titular da empresa e da nova licença pode confirmar o vínculo.';
 if(/23505|duplicate key|institutions_name/.test(code))return 'Esse nome já está cadastrado. Escolha outro nome para a nova fazenda. Para manter uma empresa existente, selecione a opção de troca de cortesia.';
 if(/COMPANY_KIND_MISMATCH/.test(code))return 'Uma licença de fazenda só pode ser vinculada a uma fazenda; a de consultoria, a uma consultoria.';
 return 'Não foi possível confirmar o vínculo. Atualize a lista antes de tentar novamente. Os lançamentos existentes permanecem preservados.';
}
export default function PaidCompanySetup({client,onChange}:{client:SupabaseClient;onChange:()=>Promise<void>}){
 const [data,setData]=useState<Choices>({licenses:[],companies:[]}),[licenseId,setLicenseId]=useState(''),[companyId,setCompanyId]=useState(''),[name,setName]=useState(''),[mode,setMode]=useState('existing'),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);
 const generation=useRef(0),lock=useRef(false);
 const license=data.licenses.find(l=>l.id===licenseId),company=data.companies.find(c=>c.id===companyId);
 const read=async()=>{const r=await client.schema('licensing').rpc('operational_company_choices');if(r.error)throw r.error;return r.data as Choices;};
 const refresh=async()=>{const current=++generation.current;setBusy(true);setNotice('');try{const next=await read();if(current===generation.current){setData(next);setLicenseId(id=>next.licenses.some(l=>l.id===id)?id:next.licenses[0]?.id??'');setFailed(false);}}catch(e){if(current===generation.current){setData({licenses:[],companies:[]});setFailed(true);setNotice(companySetupProblem(e));}}finally{if(current===generation.current)setBusy(false);}};
 useEffect(()=>{void refresh();return()=>{generation.current++;};},[client]);
 useEffect(()=>{if(!license)return;setName(license.name);const available=data.companies.filter(c=>c.kind===license.kind&&c.replaceable);setCompanyId(id=>available.some(c=>c.id===id)?id:available[0]?.id??'');setMode(available.length?'existing':'new');},[license?.id,data.companies]);
 const bind=async()=>{
  if(busy||lock.current||!license?.ready)return;
  const existing=mode==='existing';if(existing&&(!company||company.kind!==license.kind||!company.replaceable))return;
  if(!window.confirm(existing?'Vincular a licença paga “'+license.name+'” à empresa “'+company!.name+'”? A cortesia atual será encerrada. Equipe, acessos às fazendas e lançamentos serão mantidos. Os aparelhos precisarão de nova autorização do proprietário.':'Criar '+(license.kind==='farm'?'a fazenda':'a consultoria')+' “'+name.trim()+'” com esta licença paga? Nenhum registro será copiado de outras empresas.'))return;
  lock.current=true;setBusy(true);setNotice('');let applied=false;
  try{const args={p_license:license.id,p_license_version:license.version,p_organization:existing?company!.id:null,p_previous_license:existing?company!.license_id:null,p_previous_version:existing?company!.version:null,p_name:existing?company!.name:name.trim()};
   const key=await requestKey({paidCompanySetup:args}),r=await client.schema('licensing').rpc('operational_bind_license',{...args,p_request:key.id});if(r.error)throw r.error;applied=true;key.acknowledge();setData(await read());setLicenseId('');setFailed(false);setNotice(existing?'Licença vinculada. A empresa, a equipe e os lançamentos foram preservados. Abra Membros e licença para autorizar os aparelhos na nova licença.':'Empresa criada com a licença paga. Abra Escolher fazenda ou Equipe da consultoria para continuar.');await onChange();
  }catch(e){setFailed(true);setNotice(applied?'O vínculo foi confirmado, mas a lista não pôde ser atualizada. Atualize antes de fazer outra ação.':companySetupProblem(e));}finally{lock.current=false;setBusy(false);}
 };
 return <section className="rounded-xl border bg-white p-4 lg:p-6 space-y-4" data-paid-company-setup>
  <h2 className="text-xl font-semibold">Vincular licença paga à empresa</h2><p>Após a confirmação do pagamento, escolha uma empresa da qual você é titular ou crie uma nova. Os nomes cadastrados são preenchidos automaticamente.</p>
  <button className="rounded-lg border px-4 py-2" disabled={busy} onClick={()=>void refresh()}>Atualizar vínculos disponíveis</button>
  {notice&&<p role={failed?'alert':'status'} className={'rounded-lg border p-3 '+(failed?'text-red-700':'text-brand-800')}>{notice}</p>}
  {!busy&&!data.licenses.length&&!failed&&<p>Nenhuma licença paga sem empresa está disponível. As licenças já vinculadas continuam funcionando normalmente.</p>}
  {!!data.licenses.length&&<><Select label="Licença paga para vincular" value={licenseId} options={data.licenses.map(l=>({value:l.id,label:l.name+(l.ready?' — pagamento confirmado':' — pagamento não confirmado')}))} onChange={e=>setLicenseId(e.target.value)} disabled={busy}/>
   {license&&!license.ready&&<p>Confirme o pagamento na seção Asaas Sandbox e atualize esta lista. O vínculo permanece bloqueado até a confirmação pelo servidor.</p>}
   {license?.ready&&<><Select label="Destino da licença" value={mode} options={[{value:'existing',label:'Manter empresa existente e substituir sua cortesia'},{value:'new',label:'Criar uma empresa nova'}]} onChange={e=>setMode(e.target.value)} disabled={busy}/>
    {mode==='existing'?<><Select label="Empresa que manterá seus dados" value={companyId} options={data.companies.filter(c=>c.kind===license.kind&&c.replaceable).map(c=>({value:c.id,label:c.name}))} onChange={e=>setCompanyId(e.target.value)} disabled={busy}/>
     {company?<p>{company.users_used} usuário(s) ou vaga(s) reservada(s) nesta empresa. A nova licença permite {license.users_limit}. A cortesia e as autorizações de aparelhos antigas serão encerradas; os históricos serão mantidos.</p>:<p>Não há empresa sua com cortesia compatível com esta licença. Empresas de outros titulares não podem ser selecionadas.</p>}
    </>:<label className="block">Nome da nova {license.kind==='farm'?'fazenda':'consultoria'}<input className="mt-1 w-full rounded-lg border p-3" value={name} onChange={e=>setName(e.target.value)} minLength={2} maxLength={150} disabled={busy}/></label>}
    <button className="rounded-lg bg-brand-700 text-white px-4 py-2" disabled={busy||(mode==='existing'?!company||company.users_used>license.users_limit:name.trim().length<2)} onClick={()=>void bind()}>Confirmar vínculo da licença</button>
   </>}
  </>}
  <nav className="flex flex-wrap gap-4"><Link className="underline" to="/farms">Escolher fazenda</Link><Link className="underline" to="/consultancy-team">Equipe da consultoria</Link></nav>
 </section>;
}
