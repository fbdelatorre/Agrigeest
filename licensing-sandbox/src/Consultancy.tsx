import { useState, type FormEvent } from 'react';
import { command, roles, type Snapshot } from './database';
type Action=(task:()=>Promise<unknown>,success:string)=>Promise<void>;
const fields=(e:FormEvent<HTMLFormElement>)=>new FormData(e.currentTarget);

export function ConsultancyPage({data,user,action,busy}:{data:Snapshot;user:string;action:Action;busy:boolean}) {
 const [dismiss,setDismiss]=useState<string>();
 const company=data.companies.find(c=>c.user_id===user&&c.role==='owner');
 const name=(id:string)=>data.directory.find(a=>a.id===id)?.name??'Conta fictícia';
 if(!company)return <section className="panel"><h2>Equipe da consultoria</h2><p>Somente o proprietário da consultoria pode convidar funcionários e definir suas fazendas.</p>{data.companies.map(c=><p key={c.user_id}>{c.name} · {roles[c.role]} nesta empresa</p>)}</section>;
 const plan=data.plans.find(p=>!p.farm_id);
 const available=data.delegatable.filter(f=>f.company_owner===company.user_id);
 const members=data.companyMembers.filter(m=>m.company_owner===company.user_id);
 const selected=(member:string,farm:string)=>data.companyAccess.some(a=>a.company_owner===company.user_id&&a.user_id===member&&a.farm_id===farm&&a.active&&a.valid);
 const farmFields=(member?:string)=>available.length?available.map(f=><label className="check" key={f.id}><input type="checkbox" name="farms" value={f.id} defaultChecked={member?selected(member,f.id):false}/>{f.name}</label>):<p>Nenhuma fazenda disponível. Receba e aceite o convite do proprietário da fazenda primeiro.</p>;
 return <>
  <section className="panel"><h2>Equipe de {company.name}</h2><p>Licença base: proprietário + 3 funcionários e 5 aparelhos compartilhados. Cada adicional libera uma vaga e mais 2 aparelhos.</p>
   <p className="notice">Nenhuma fazenda é compartilhada automaticamente. Marque somente as fazendas que cada pessoa poderá acessar. Administrador e responsável da consultoria recebem acesso de consultoria: consultam estoque/aplicações e registram recomendações e dados de campo. Monitor registra seus monitoramentos e chuvas. Nenhum deles recebe permissão para aplicar ou alterar estoque de clientes por este vínculo.</p>
   <p>As permissões abaixo pertencem à consultoria. Convites diretos de uma fazenda e vínculos com outras empresas são independentes e aparecem no seletor de fazendas.</p>
   {plan?.entitled&&<form aria-label="Convidar funcionário da consultoria" onSubmit={e=>{e.preventDefault();const v=fields(e);void action(()=>command(user,'invite_company',[company.user_id,v.get('email'),v.get('role'),v.getAll('farms')]),'Convite de funcionário criado somente para as fazendas selecionadas.');}}>
    <label>Email do funcionário<input type="email" name="email" aria-label="Email do funcionário da consultoria" list="company-emails" required placeholder="nome@example.test"/><datalist id="company-emails">{data.directory.map(a=><option key={a.id} value={a.email}>{a.name}</option>)}</datalist></label>
    <label>Cargo na consultoria<select name="role" aria-label="Cargo na consultoria" defaultValue="monitor"><option value="admin">Administrador</option><option value="monitor">Monitor de campo</option><option value="operator">Responsável por aplicação</option></select></label>
    <h3>Fazendas liberadas neste convite</h3>{farmFields()}<p className="muted">Sem marcações, a pessoa entra na empresa sem acesso a fazendas. Novas fazendas atendidas também não serão liberadas automaticamente.</p>
    <button className="primary" disabled={busy}>Convidar funcionário</button>
   </form>}
  </section>
  <div className="columns"><section className="panel"><h2>Funcionários e fazendas autorizadas</h2>{members.map(m=><article className="panel" key={m.user_id} aria-label={'Funcionário: '+name(m.user_id)}>
   <h3>{name(m.user_id)}</h3><p>{roles[m.role]} · {m.active?'Ativo':'Desligado'}</p>
   {m.active&&m.role!=='owner'&&<>
    <form key={data.companyAccess.filter(a=>a.user_id===m.user_id&&a.active&&a.valid).map(a=>a.farm_id).sort().join(',')} aria-label={'Fazendas de '+name(m.user_id)} onSubmit={e=>{e.preventDefault();const v=fields(e);void action(()=>command(user,'company_farms',[company.user_id,m.user_id,v.getAll('farms'),crypto.randomUUID()]),'Fazendas autorizadas atualizadas. Nenhuma outra fazenda foi liberada.');}}>
     {farmFields(m.user_id)}<button disabled={busy||!plan?.entitled}>Salvar fazendas autorizadas</button>
    </form>
    <button className="danger" disabled={busy} onClick={()=>setDismiss(m.user_id)}>Desligar da consultoria</button>
   </>}
  </article>)}
   {dismiss&&<form className="editor panel" aria-label="Desligar da consultoria" onSubmit={e=>{e.preventDefault();const v=fields(e);void action(async()=>{await command(user,'dismiss_company',[company.user_id,dismiss,v.get('extra')==='cancel',v.getAll('devices'),crypto.randomUUID()]);setDismiss(undefined);},'Funcionário desligado desta consultoria. Conta e lançamentos preservados.');}}>
    <h3>Desligar {name(dismiss)}</h3>{!!plan?.extras&&plan.entitled&&<label>Adicional<select name="extra" aria-label="Adicional da consultoria"><option value="keep">Manter</option><option value="cancel">Cancelar e reduzir valor imediatamente</option></select></label>}
    {data.devices.filter(d=>d.subscription_id===plan?.id&&d.user_id!==dismiss).map(d=><label className="check" key={d.id}><input type="checkbox" name="devices" value={d.id}/>Revogar também {d.name}, se necessário</label>)}
    <div className="actions"><button className="danger" disabled={busy}>Confirmar desligamento da consultoria</button><button type="button" onClick={()=>setDismiss(undefined)} disabled={busy}>Voltar</button></div>
   </form>}
  </section><section className="panel"><h2>Convites da consultoria</h2>{data.companyInvites.filter(i=>i.company_owner===company.user_id).map(i=><article className="panel" key={i.id}><strong>{i.email}</strong><p>{roles[i.role]} · {i.status==='pending'?'Pendente':i.status==='accepted'?'Aceito':'Revogado'}</p>{i.status==='pending'&&<><button disabled={busy} onClick={()=>void action(()=>command(user,'revoke_company_invite',[i.id]),'Convite da consultoria revogado.')}>Revogar convite da consultoria</button>{i.token&&<p><a href={'#/cadastro?convite='+encodeURIComponent(i.token)}>Abrir email simulado da consultoria para {i.email}</a></p>}</>}</article>)}</section></div>
 </>;
}
