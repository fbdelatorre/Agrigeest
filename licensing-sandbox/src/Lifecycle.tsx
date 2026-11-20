import { useEffect, useState, type FormEvent } from 'react';
import { command, explain, previewInvite, registerDemo, roles, type Account, type Snapshot, type Plan } from './database';

type Action=(task:()=>Promise<unknown>,success:string)=>Promise<void>;
const values=(e:FormEvent<HTMLFormElement>)=>Object.fromEntries(new FormData(e.currentTarget)) as Record<string,string>;
const request=()=>crypto.randomUUID();
const when=(date:string|null)=>date?new Date(date).toLocaleString('pt-BR'):'Sem prazo';
const simulatedPrice=(plan:Plan)=>!plan.entitled||plan.complimentary?0:(plan.farm_id?100:200)*(plan.period==='annual'?12:1)+plan.extras*25*(plan.period==='annual'?12:1);
const price=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function Signup({token,accounts,onDone,onBack}:{token?:string;accounts:Account[];onDone:(id:string)=>void;onBack:()=>void}) {
 const [context,setContext]=useState<{email:string;farm_name:string;role:string}>();
 const [loading,setLoading]=useState(!!token),[error,setError]=useState(''),[busy,setBusy]=useState(false),[existing,setExisting]=useState('');
 useEffect(()=>{let active=true;if(token)void previewInvite(token).then(result=>{if(active){setContext(result);setLoading(false);if(!result)setError('O convite venceu, foi revogado ou já foi utilizado.');}}).catch(e=>{if(active){setLoading(false);setError(explain(e));}});return()=>{active=false;};},[token]);
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();if(busy)return;const v=values(e);setBusy(true);setError('');try{onDone(await registerDemo(v.name,v.email,v.verified==='on',token));}catch(e){setError(explain(e));}finally{setBusy(false);}};
 return <section className="panel signup"><h1>Cadastro de usuário</h1><p className="notice">Simulação local: use dados fictícios e emails @example.test. A verificação abaixo não envia email nem substitui autenticação real.</p>
  {loading?<p role="status">Conferindo convite…</p>:<>
   {context&&<div className="two"><label>Fazenda<input value={context.farm_name} readOnly/></label><label>Função<input value={roles[context.role]} readOnly/></label></div>}
   {error&&<p role="alert" className="notice error">{error}</p>}
   {(!token||context)&&<form aria-label="Cadastro fictício" onSubmit={submit} key={context?.email??'independent'}>
    <label>Nome<input name="name" required minLength={2} maxLength={120}/></label><label>Email<input name="email" type="email" defaultValue={context?.email??''} readOnly={!!context} required/></label>
    <label className="check"><input type="checkbox" name="verified" required/>Simular email verificado{context?' e aceitar o convite para esta fazenda':''}</label>
    {!context&&<p>Você pode criar sua conta sem empresa e sem função.</p>}
    <button className="primary" disabled={busy}>{context?'Cadastrar e aceitar convite':'Criar conta sem empresa'}</button>
   </form>}
   {token&&context&&<form className="panel" aria-label="Aceitar com conta existente" onSubmit={e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');void command(existing,'claim_demo',[token]).then(()=>onDone(existing)).catch(e=>setError(explain(e))).finally(()=>setBusy(false));}}>
    <h2>Já tenho conta</h2><label>Conta existente<select required value={existing} onChange={e=>setExisting(e.target.value)}><option value="">Selecione sua conta fictícia</option>{accounts.map(a=><option value={a.id} key={a.id}>{a.name} · {a.email}</option>)}</select></label><button disabled={busy}>Simular login e aceitar</button>
   </form>}
  </>}<p><button onClick={onBack} disabled={busy}>Voltar ao laboratório</button></p>
 </section>;
}

export function AccountPage({user,action,busy}:{user:string;action:Action;busy:boolean}) {
 return <section className="panel"><h2>Minha conta e empresa</h2><p>Uma conta sem vínculo não acessa fazendas. Aceite um convite ou contrate uma licença para criar sua própria empresa.</p>
  <form aria-label="Contratar empresa fictícia" onSubmit={e=>{e.preventDefault();const v=values(e);void action(()=>command(user,'create_company',[v.name,v.kind,v.period,v.paid==='on',request()]),'Empresa criada com pagamento simulado. Nenhuma cobrança real foi feita.');}}>
   <label>Nome da empresa ou fazenda<input name="name" required minLength={2} maxLength={150}/></label><div className="two"><label>Tipo<select name="kind"><option value="farm">Propriedade rural</option><option value="consultancy">Consultoria</option></select></label><label>Período<select name="period"><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label></div>
   <p className="muted">Valores somente para teste: propriedade R$ 100/mês ou R$ 1.200/ano; consultoria R$ 200/mês ou R$ 2.400/ano. Nenhum preço comercial foi definido.</p>
   <label className="check"><input name="paid" type="checkbox" required/>Simular pagamento aprovado e contratar a licença</label><button disabled={busy} className="primary">Criar empresa com licença simulada</button>
  </form>
 </section>;
}

export function PlansPage({data,user,action,busy}:{data:Snapshot;user:string;action:Action;busy:boolean}) {
 const [revoke,setRevoke]=useState<Record<string,boolean>>({});
 const selectedDevices=(id:string)=>data.devices.filter(d=>d.subscription_id===id&&revoke[d.id]).map(d=>d.id);
 const change=(id:string,operation:string)=>void action(()=>command(user,'plan_change',[id,operation,selectedDevices(id),request()]),'Plano atualizado imediatamente no simulador. Nenhuma cobrança real.');
 return <><div className="notice">Cobrança e aparelhos simulados. O limite de dispositivos é exercitado no banco local; este protótipo ainda não identifica ou bloqueia instalações reais. Valores ilustrativos, sem pagamentos reais.</div>
  {!data.plans.length&&<section className="panel"><h2>Plano e licenças</h2><p>Esta conta não possui licença própria. Funcionários utilizam as vagas da fazenda que os convidou.</p></section>}
  {data.plans.map(plan=>{const devices=data.devices.filter(d=>d.subscription_id===plan.id);return <section className="panel" key={plan.id} aria-label={'Plano: '+plan.name}>
   <h2>{plan.name}</h2><p className="badge">{plan.entitled?'Ativa':'Somente consulta'}{plan.complimentary?' · Cortesia':''} · {plan.period==='annual'?'Anual':'Mensal'}</p>
   <div className="metrics"><div><span>Valor simulado contratado</span><strong>{price(simulatedPrice(plan))}/{plan.period==='annual'?'ano':'mês'}</strong></div><div><span>Usuários</span><strong>{plan.used} / {plan.seats} vagas</strong>{plan.reserved>0&&<p className="muted">+ {plan.reserved} reservadas em convites</p>}</div><div><span>Aparelhos autorizados</span><strong>{devices.length} / {plan.devices}</strong></div><div><span>Adicionais</span><strong>{plan.extras}</strong></div></div>
   {plan.complimentary&&<p>Validade da cortesia: {when(plan.free_until)}. Vencimento não inicia cobrança automaticamente.</p>}
   {!plan.farm_id&&<p className="muted">Consultoria: 1 usuário base usado provisoriamente no teste, ainda sujeito a confirmação. A gestão de funcionários da consultoria será uma etapa posterior.</p>}
   <div className="actions"><button disabled={busy||!plan.entitled} onClick={()=>change(plan.id,'buy_extra')}>Adicionar vaga + 2 aparelhos</button><button disabled={busy||!plan.entitled||!plan.extras} onClick={()=>{if(window.confirm('Cancelar um adicional imediatamente? O novo limite perde uma vaga e dois aparelhos. Valores já pagos não são estornados neste teste.'))change(plan.id,'cancel_extra');}}>Cancelar adicional agora</button>
    {plan.status==='active'?<button className="danger" disabled={busy} onClick={()=>{if(window.confirm('Cancelar a licença agora e deixar os dados somente para consulta?'))change(plan.id,'cancel');}}>Cancelar licença</button>:<button className="primary" disabled={busy} onClick={()=>{if(window.confirm('Simular reativação da licença e confirmação do pagamento, se aplicável?'))change(plan.id,'reactivate');}}>Reativar licença</button>}
   </div><p className="muted">Adicional ilustrativo: {price(25*(plan.period==='annual'?12:1))}/{plan.period==='annual'?'ano':'mês'}. Cancelar reduz imediatamente o valor e as cotas. Créditos/estornos de períodos já pagos não são simulados.</p>
   <h3>Aparelhos fictícios</h3><p className="muted">Marque os aparelhos a revogar ao reduzir o adicional, se o novo limite for insuficiente.</p>
   {devices.map(device=><div key={device.id} className="device-row"><label className="check"><input type="checkbox" checked={!!revoke[device.id]} onChange={e=>setRevoke({...revoke,[device.id]:e.target.checked})}/>{device.name} · {data.directory.find(a=>a.id===device.user_id)?.name}</label><button disabled={busy} onClick={()=>void action(()=>command(user,'device_change',[plan.id,user,'',device.id,request()]),'Aparelho fictício revogado.')}>Revogar aparelho</button></div>)}
   <form className="two" aria-label={'Novo aparelho: '+plan.name} onSubmit={e=>{e.preventDefault();const v=values(e);void action(()=>command(user,'device_change',[plan.id,v.user_id,v.name,null,request()]),'Aparelho fictício autorizado.');}}>
    <label>Nome do aparelho<input name="name" required maxLength={100} placeholder="Ex.: Celular de campo"/></label><label>Usuário<select name="user_id">{data.directory.filter(a=>!plan.farm_id?a.id===user:plan.farm_id===data.farm?.id?data.members.some(m=>m.user_id===a.id&&m.active&&m.role!=='consultant'):a.id===user).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button disabled={busy||!plan.entitled}>Autorizar aparelho fictício</button>
   </form>
  </section>;})}
  <section className="panel"><h2>Histórico das licenças</h2>{data.events.map(e=><p key={e.id}>{new Date(e.created_at).toLocaleString('pt-BR')} · {eventLabel(e.action)}</p>)}</section>
 </>;
}
const eventLabel=(action:string)=>({buy_extra:'Adicional contratado',cancel_extra:'Adicional cancelado imediatamente',cancel:'Licença cancelada',reactivate:'Licença reativada',device_added:'Aparelho autorizado',device_revoked:'Aparelho revogado',simulated_payment:'Pagamento simulado aprovado',free_granted:'Cortesia concedida',free_revoked:'Cortesia revogada'}[action]??action);

export function PlatformPage({data,user,action,busy}:{data:Snapshot;user:string;action:Action;busy:boolean}) {
 return <><section className="panel"><h2>Gestão do aplicativo</h2><p>Acesso exclusivo do gestor do AgriGest. Conceder licença não concede acesso aos dados operacionais da fazenda. Emails abaixo são fictícios.</p></section>
  {data.platformPlans.map(plan=><section className="panel" key={plan.id} aria-label={'Gestão: '+plan.name}><h2>{plan.name}</h2><p>{plan.owner_email} · {plan.status==='active'?'Ativa':'Cancelada'} · {plan.complimentary?'Cortesia até '+when(plan.free_until):'Plano sem cortesia'}</p>
   <form onSubmit={e=>{e.preventDefault();const v=values(e);void action(()=>command(user,'grant_free',[plan.id,true,v.until?new Date(v.until+'T23:59:59').toISOString():null,v.reason,request()]),'Licença gratuita concedida no simulador. Nenhum acesso operacional foi concedido ao gestor.');}}><div className="two"><label>Validade opcional<input type="date" name="until" min={new Date().toLocaleDateString('en-CA')}/></label><label>Motivo<input name="reason" required minLength={3} maxLength={500} placeholder="Ex.: Cortesia para demonstração"/></label></div><button disabled={busy} className="primary">Conceder ou renovar licença gratuita</button></form>
   {plan.complimentary&&<button className="danger" disabled={busy} onClick={()=>{if(window.confirm('Revogar cortesia? O plano fica somente para consulta, sem iniciar cobrança automática.'))void action(()=>command(user,'grant_free',[plan.id,false,null,'Revogação pelo gestor do aplicativo',request()]),'Cortesia revogada. Histórico preservado, sem cobrança automática.');}}>Revogar cortesia</button>}
  </section>)}
  <section className="panel"><h2>Histórico administrativo</h2>{data.events.map(e=><p key={e.id}>{new Date(e.created_at).toLocaleString('pt-BR')} · {eventLabel(e.action)}{typeof e.details.reason==='string'?' · '+e.details.reason:''}</p>)}</section>
 </>;
}
