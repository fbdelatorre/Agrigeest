import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { accounts, command, demoId, explain, load, remove, roles, save, type RecordKind, type Snapshot } from './database';
import './styles.css';
import { AccountPage, PlansPage, PlatformPage, Signup } from './Lifecycle';
import { ConsultancyPage } from './Consultancy';

type Editing={kind:RecordKind;id:string;values:Record<string,string>};
const today=()=>new Date().toLocaleDateString('en-CA');
const date=(value:string)=>value.slice(0,10).split('-').reverse().join('/');
const fields=(event:FormEvent<HTMLFormElement>)=>Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string,string>;

export default function App() {
  const [user,setUser]=useState(()=>{const saved=localStorage.getItem('agrigest-lab-simulated-user');return saved&&/^[0-9a-f-]{36}$/.test(saved)?saved:demoId(1);});
  const [farm,setFarm]=useState('');
  const [data,setData]=useState<Snapshot>();
  const [tab,setTab]=useState('field');
  const [revision,setRevision]=useState(0);
  const [busy,setBusy]=useState(false);
  const working=useRef(false);
  const [message,setMessage]=useState('');
  const [failed,setFailed]=useState(false);
  const [editing,setEditing]=useState<Editing>();
  const [section,setSection]=useState('workspace');
  const [route,setRoute]=useState(window.location.hash);
  const [dismissal,setDismissal]=useState<string>();
  useEffect(()=>{const changed=()=>setRoute(window.location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
  useEffect(()=>{
    let current=true;
    void load(user,farm).then(snapshot=>{if(current){setData(snapshot);setFarm(snapshot.farm?.id ?? '');}})
      .catch(error=>{if(current){setMessage(explain(error));setFailed(true);}});
    return()=>{current=false;};
  },[user,farm,revision]);
  const action=useCallback(async(task:()=>Promise<unknown>,success:string)=>{
    if(working.current) return;
    working.current=true;setBusy(true);setMessage('');setFailed(false);
    try {await task();setEditing(undefined);setRevision(value=>value+1);setMessage(success);}
    catch(error){setMessage(explain(error));setFailed(true);}
    finally{working.current=false;setBusy(false);}
  },[]);
  const selectUser=(id:string)=>{localStorage.setItem('agrigest-lab-simulated-user',id);setUser(id);setFarm('');setData(undefined);setTab('field');setSection('workspace');setEditing(undefined);setDismissal(undefined);setMessage('');};
  const selected=data?.farm;
  const full=!!selected && ['owner','admin','operator'].includes(selected.role);
  const consultant=selected?.role==='consultant';
  const owner=selected?.role==='owner';
  const writable=!!selected?.writable;
  const directory=data?.directory??accounts;
  const person=(id:string)=>directory.find(a=>a.id===id)?.name??'Conta fictícia';
  const canRecommend=full||consultant;
  const areaName=(id:string)=>data?.areas.find(area=>area.id===id)?.name ?? 'Talhão';
  const productName=(id:string)=>data?.products.find(product=>product.id===id)?.name ?? 'Produto';
  const editActions=(kind:RecordKind,row:{id:string;author_id:string},values:Record<string,string>)=>writable&&(full||row.author_id===user) && <div className="actions">
    <button disabled={busy} onClick={()=>setEditing({kind,id:row.id,values})}>Editar</button>
    <button className="danger" disabled={busy} onClick={()=>{
      if(window.confirm('Excluir este registro fictício? Registros com vínculos serão preservados.'))
        void action(()=>remove(user,selected!.id,kind,row.id),'Registro fictício excluído.');
    }}>Excluir</button>
  </div>;
  const areaSelect=<label>Talhão<select name="area_id" aria-label="Talhão" required>{data?.areas.map(area=><option key={area.id} value={area.id}>{area.name}</option>)}</select></label>;
  const saveForm=(kind:RecordKind)=>(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!selected)return;
    const values=fields(event),form=event.currentTarget;
    void action(async()=>{await save(user,selected.id,kind,values);form.reset();},'Registro salvo no banco fictício.');
  };
  const editForm=editing && selected && <form className="editor panel" aria-label="Editar registro fictício" onSubmit={event=>{
    event.preventDefault();const values=fields(event);void action(()=>save(user,selected.id,editing.kind,values,editing.id),'Alteração fictícia salva.');
  }} key={editing.id}>
    <h3>Editar {editing.kind==='reports'?'monitoramento':editing.kind==='rainfall'?'pluviometria':'recomendação'}</h3>
    {editing.kind!=='recommendations' && <label>Data<input name="observed_on" type="date" max={today()} defaultValue={editing.values.observed_on} required/></label>}
    {editing.kind==='reports' && <label>Estádio fenológico<input name="stage" defaultValue={editing.values.stage} required/></label>}
    {editing.kind==='rainfall' ? <label>Chuva (mm)<input name="millimeters" type="number" step="any" min="0" max="3000" defaultValue={editing.values.millimeters} required/></label>
      : <label>Descrição<textarea name="description" defaultValue={editing.values.description} required/></label>}
    {editing.kind==='recommendations' && <label>Dose (unidade/ha)<input name="dose" type="number" step="any" min="0.0001" defaultValue={editing.values.dose} required/></label>}
    <div className="actions"><button className="primary" disabled={busy}>Salvar alteração</button><button type="button" onClick={()=>setEditing(undefined)} disabled={busy}>Cancelar</button></div>
  </form>;

  if(route.startsWith('#/cadastro'))return <div className="app"><div className="test-banner"><strong>CADASTRO FICTÍCIO</strong><span>Sem envio de emails ou cobrança real</span></div><Signup token={new URLSearchParams(route.split('?')[1]??'').get('convite')??undefined} accounts={directory.map(a=>({...a,label:'Conta fictícia'}))} onBack={()=>{window.location.hash='';}} onDone={id=>{selectUser(id);window.location.hash='';setSection('account');setMessage('Conta fictícia cadastrada ou convite aceito.');}}/></div>;
  return <div className="app">
    <div className="test-banner"><strong>AMBIENTE DE TESTE</strong><span>Dados fictícios · sem conexão com o Supabase real · nenhum pagamento</span></div>
    <header><div><p className="eyebrow">AGRIGEST · ETAPA 3</p><h1>Contas, licenças e permissões</h1><p>Teste convites, planos e cortesias sem usar seus dados ou dinheiro.</p></div><span className="version">Protótipo 0.3.0</span></header>
    <section className="selectors panel" aria-label="Simulação de acesso">
      <label>Simular usuário<select aria-label="Simular usuário" value={user} disabled={busy} onChange={event=>selectUser(event.target.value)}>{directory.map(account=><option value={account.id} key={account.id}>{account.name}</option>)}</select></label>
      <label>Fazenda autorizada<select aria-label="Fazenda autorizada" value={selected?.id ?? ''} disabled={busy||!data?.farms.length} onChange={event=>{setFarm(event.target.value);setTab('field');setEditing(undefined);setMessage('');}}>
        {!data?.farms.length && <option value="">Nenhuma fazenda autorizada</option>}{data?.farms.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
      </select></label>
      <div className="role"><span>Função nesta fazenda</span><strong>{selected ? roles[selected.role] : 'Sem vínculo'}</strong></div>
    </section>
    <p className="privacy-note">As contas acima são simuladas para testar as regras do banco local. Este seletor não é uma autenticação real. O programa instalado de uso diário continua separado.</p>
    {message && <div className={failed?'notice error':'notice success'} role={failed?'alert':'status'}>{message}</div>}
    {!data && !failed && <p role="status" className="panel">Iniciando o banco de demonstração…</p>}
    {!data && failed && <button onClick={()=>window.location.reload()}>Tentar abrir novamente</button>}
    {data && <>
      <nav aria-label="Conta e licenças">{data.companies.length>0&&<button aria-current={section==='company'?'page':undefined} onClick={()=>setSection('company')}>Equipe da consultoria</button>}<button aria-current={section==='workspace'?'page':undefined} onClick={()=>setSection('workspace')}>Fazenda</button><button aria-current={section==='account'?'page':undefined} onClick={()=>setSection('account')}>Minha conta e empresa</button><button aria-current={section==='plans'?'page':undefined} onClick={()=>setSection('plans')}>Plano e licenças</button>{data.platform&&<button aria-current={section==='platform'?'page':undefined} onClick={()=>setSection('platform')}>Gestão do aplicativo</button>}<a className="button-link" href="#/cadastro">Cadastrar outra conta fictícia</a></nav>
      {section==='account'&&<AccountPage user={user} action={action} busy={busy}/>}
      {section==='company'&&<ConsultancyPage data={data} user={user} action={action} busy={busy}/>}
      {section==='plans'&&<PlansPage data={data} user={user} action={action} busy={busy}/>}
      {section==='platform'&&data.platform&&<PlatformPage data={data} user={user} action={action} busy={busy}/>}
      {section==='workspace'&&<>
      {!!data.inbox.length && <section className="panel"><h2>Convites recebidos</h2>{data.inbox.map(invitation=><article className="invitation" key={invitation.id}>
        <div><strong>{invitation.farm_name}</strong><p>{roles[invitation.role]} · {invitation.status==='pending'?'Pendente':invitation.status==='accepted'?'Aceito':'Revogado'}</p>{invitation.kind==='company'&&<p>Equipe da consultoria · Fazendas selecionadas: {invitation.farm_names?.join(', ')||'Nenhuma'}</p>}</div>
        {invitation.status==='pending' && <button className="primary" disabled={busy} onClick={()=>void action(()=>command(user,invitation.kind==='company'?'accept_company':'accept_invitation',[invitation.id]),'Convite aceito. Selecione a fazenda autorizada.')}>Aceitar convite</button>}
      </article>)}</section>}
      {!selected ? <section className="panel empty"><h2>Nenhuma fazenda autorizada</h2><p>Esta conta só verá dados de uma fazenda depois de receber e aceitar o convite do proprietário.</p></section> : <>
        <div className="farm-title"><div><p className="eyebrow">CONTEXTO ATUAL</p><h2>{selected.name}</h2></div><span className="badge">{roles[selected.role]}</span></div>
        <p className="privacy-note">{selected.access_source}. Usuário simulado: {person(user)}. Convites e acessos de cada fazenda são independentes.</p>
        {!writable&&<p className="notice">Somente consulta: licença cancelada ou cortesia vencida. O histórico permanece salvo; novos lançamentos e alterações estão bloqueados.</p>}
        <nav aria-label="Seções do laboratório">
          <button aria-current={tab==='field'?'page':undefined} onClick={()=>setTab('field')}>Monitoramento e chuvas</button>
          {(full||consultant) && <button aria-current={tab==='stock'?'page':undefined} onClick={()=>setTab('stock')}>Estoque e aplicações</button>}
          {owner && <button aria-current={tab==='team'?'page':undefined} onClick={()=>setTab('team')}>Equipe e convites</button>}
          {owner && <button aria-current={tab==='audit'?'page':undefined} onClick={()=>setTab('audit')}>Histórico de teste</button>}
        </nav>
        {tab==='field' && <>
          {writable&&<div className="columns">
            <form className="panel" aria-label="Novo monitoramento fictício" onSubmit={saveForm('reports')}><h2>Novo monitoramento</h2><p className="muted">Fica vinculado ao talhão da fazenda selecionada.</p>{areaSelect}
              <div className="two"><label>Data<input name="observed_on" type="date" max={today()} defaultValue={today()} required/></label><label>Estádio fenológico<input name="stage" placeholder="Ex.: V4" required maxLength={120}/></label></div>
              <label>Relatório<textarea name="description" placeholder="Descreva o que foi observado na área fictícia." required maxLength={12000}/></label><button className="primary" disabled={busy}>Salvar monitoramento</button>
            </form>
            <form className="panel" aria-label="Nova chuva fictícia" onSubmit={saveForm('rainfall')}><h2>Registrar pluviometria</h2><p className="muted">Somente dados de demonstração.</p>{areaSelect}
              <div className="two"><label>Data<input name="observed_on" type="date" max={today()} defaultValue={today()} required/></label><label>Chuva (mm)<input name="millimeters" type="number" step="any" min="0" max="3000" placeholder="Ex.: 25" required/></label></div>
              <button className="primary" disabled={busy}>Salvar chuva</button>
            </form>
          </div>}
          {writable&&editing && editForm}
          <section className="panel"><h2>Monitoramentos visíveis para este perfil</h2>{!data.reports.length && <p className="muted">Nenhum monitoramento disponível para esta conta.</p>}
            <div className="records">{data.reports.map(row=><article key={row.id} aria-label={'Monitoramento: '+row.description}><div className="record-heading"><strong>{areaName(row.area_id)} · {row.stage}</strong><span>{date(row.observed_on)} · {person(row.author_id)}</span></div><p>{row.description}</p>
              {editActions('reports',row,{observed_on:row.observed_on,stage:row.stage,description:row.description})}
            </article>)}</div>
          </section>
          {writable&&canRecommend && <form className="panel" aria-label="Nova recomendação fictícia" onSubmit={event=>{
            event.preventDefault();const values=fields(event),report=data.reports.find(row=>row.id===values.report_id);if(!report)return;
            void action(()=>save(user,selected.id,'recommendations',{...values,area_id:report.area_id}),'Recomendação fictícia salva. O estoque não foi alterado.');
          }}><h2>Recomendar aplicação</h2><p className="muted">A recomendação não movimenta estoque.</p><div className="two"><label>Monitoramento<select name="report_id" aria-label="Monitoramento" required>{data.reports.map(row=><option value={row.id} key={row.id}>{areaName(row.area_id)} · {date(row.observed_on)} · {row.stage}</option>)}</select></label>
            <label>Produto<select name="product_id" aria-label="Produto" required>{data.products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
            <div className="two"><label>Dose (unidade/ha)<input name="dose" type="number" min="0.0001" step="any" required defaultValue="1"/></label><label>Orientações<input name="description" required placeholder="Orientação fictícia"/></label></div>
            <button className="primary" disabled={busy||!data.reports.length}>Salvar recomendação</button>
          </form>}
          {!!data.recommendations.length && <section className="panel"><h2>Recomendações</h2><div className="records">{data.recommendations.map(row=><article key={row.id}><strong>{areaName(row.area_id)} · {productName(row.product_id)} · {row.dose} unidade/ha</strong><p>{row.description}</p><p className="muted">Autor: {person(row.author_id)}</p>{editActions('recommendations',row,{dose:String(row.dose),description:row.description})}</article>)}</div></section>}
          <section className="panel"><h2>Chuvas visíveis para este perfil</h2>{!data.rainfall.length && <p className="muted">Nenhuma chuva disponível para esta conta.</p>}<div className="records">{data.rainfall.map(row=><article key={row.id}><strong>{areaName(row.area_id)} · {row.millimeters} mm</strong><p className="muted">{date(row.observed_on)} · {person(row.author_id)}</p>{editActions('rainfall',row,{observed_on:row.observed_on,millimeters:String(row.millimeters)})}</article>)}</div></section>
        </>}
        {tab==='stock' && (full||consultant) && <div className="columns"><section className="panel"><h2>Estoque fictício</h2>{consultant && <p className="notice">Seu perfil permite consultar o estoque. Aplicações e movimentações ficam com a equipe autorizada da fazenda.</p>}
          {data.products.map(row=><div className="stock" key={row.id}><span>{row.name}</span><strong>{row.quantity} unidades</strong></div>)}</section>
          <section className="panel"><h2>Aplicações fictícias</h2>{full&&writable && <form aria-label="Aplicação fictícia" onSubmit={event=>{event.preventDefault();const values=fields(event);void action(()=>command(user,'apply_operation',[selected.id,values.area_id,values.product_id,Number(values.quantity)]),'Aplicação fictícia registrada. Somente o estoque de demonstração mudou.');}}>
            {areaSelect}<label>Produto<select name="product_id" required>{data.products.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Quantidade total<input name="quantity" type="number" step="any" min="0.0001" defaultValue="1" required/></label><button className="primary" disabled={busy}>Registrar aplicação fictícia</button>
          </form>}<div className="records">{data.applications.map(row=><article key={row.id}><strong>{areaName(row.area_id)} · {row.quantity} unidades</strong><p>{productName(row.product_id)} · {person(row.author_id)}</p></article>)}</div></section></div>}
        {tab==='team' && owner && <div className="columns"><section className="panel"><h2>Convidar para a fazenda</h2><p className="muted">Email simulado. Funcionários podem ainda não ter conta; consultores precisam de conta e empresa.</p>{writable&&<form onSubmit={event=>{event.preventDefault();const values=fields(event);void action(()=>command(user,'invite',[selected.id,values.email,values.role]),'Convite fictício criado. Abra o email simulado abaixo ou selecione a conta destinatária.');}}>
          <label>Email do convidado<input name="email" aria-label="Email do convidado" type="email" list="demo-emails" placeholder="nome@example.test" required/><datalist id="demo-emails">{directory.filter(account=>!data.members.some(member=>member.user_id===account.id&&member.active)).map(account=><option key={account.id} value={account.email}>{account.name}</option>)}</datalist></label>
          <label>Função do convite<select name="role" aria-label="Função do convite" defaultValue={data.companies.some(c=>c.user_id===user)?'monitor':'consultant'}>{!data.companies.some(c=>c.user_id===user)&&<option value="consultant">Consultor</option>}<option value="monitor">Monitor de campo</option><option value="admin">Administrador</option><option value="operator">Responsável por aplicação</option></select></label><button className="primary" disabled={busy}>Criar convite</button></form>}
          <div className="records">{data.outgoing.map(invitation=><article key={invitation.id}><strong>{invitation.email} · {roles[invitation.role]}</strong><p>{invitation.status==='pending'?'Pendente':invitation.status==='accepted'?'Aceito':'Revogado'}</p>{invitation.status==='pending' && <><button disabled={busy} onClick={()=>void action(()=>command(user,'revoke_invitation',[invitation.id]),'Convite revogado.')}>Revogar convite</button>{data.mail.filter(m=>m.id===invitation.id).map(mail=><p key={mail.id}><a href={'#/cadastro?convite='+encodeURIComponent(mail.token)}>Abrir email simulado para {mail.recipient_email}</a></p>)}</>}</article>)}</div>
        </section><section className="panel"><h2>Vínculos desta fazenda</h2><div className="records">{data.members.map(member=><article key={member.user_id}><strong>{person(member.user_id)}</strong><p>{roles[member.role]} · {member.active?'Ativo':'Revogado'}</p>{member.active&&member.role!=='owner'&&<button className="danger" disabled={busy} onClick={()=>setDismissal(member.user_id)}>Revogar acesso</button>}</article>)}</div>
          {dismissal&&<form className="editor panel" aria-label="Desligar funcionário" onSubmit={event=>{event.preventDefault();const v=fields(event);const ids=new FormData(event.currentTarget).getAll('devices');void action(async()=>{await command(user,'dismiss',[selected.id,dismissal,v.extra==='cancel',ids,crypto.randomUUID()]);setDismissal(undefined);},'Vínculo revogado. Conta e lançamentos preservados; adicional atualizado conforme sua escolha.');}}>
            <h3>Desligar {person(dismissal)}</h3><p>A conta será preservada. Somente o vínculo com esta fazenda será revogado.</p>
            {!!data.plans.find(p=>p.id===selected.id)?.extras&&data.members.find(m=>m.user_id===dismissal)?.role!=='consultant'&&writable&&<label>Adicional contratado<select name="extra" aria-label="Adicional contratado"><option value="keep">Manter adicional e seus 2 aparelhos</option><option value="cancel">Cancelar adicional e reduzir cobrança imediatamente</option></select></label>}
            {data.devices.filter(d=>d.subscription_id===selected.id&&d.user_id!==dismissal).map(d=><label className="check" key={d.id}><input type="checkbox" name="devices" value={d.id}/>Revogar também {d.name}, se necessário para reduzir a cota</label>)}
            <div className="actions"><button className="danger" disabled={busy}>Confirmar desligamento</button><button type="button" disabled={busy} onClick={()=>setDismissal(undefined)}>Voltar</button></div>
          </form>}
        </section></div>}
        {tab==='audit' && owner && <section className="panel"><h2>Histórico do banco fictício</h2><p className="muted">Registra ações e preserva autoria. Não contém eventos do AgriGest real.</p><div className="records">{data.audit.map(row=><article key={row.id}><strong>{row.action}</strong><p>{row.occurred_at} · {person(row.actor_id)}</p></article>)}</div></section>}
      </>}
      </>}
      <footer className="panel"><h2>Laboratório de licenciamento</h2><p>Contas, convites, licenças, cotas, cancelamento, reativação e cortesias são simulados. Nenhum email é enviado e nenhum valor é cobrado. Usuários reais e Supabase não foram alterados.</p><p>Fazenda: 4 usuários e 6 aparelhos; consultoria: 5 aparelhos. Cada adicional libera mais uma vaga e 2 aparelhos. Helena simula a gestora do aplicativo e pode conceder cortesias, sem acesso automático às fazendas.</p><p className="muted">Os dados deste teste ficam somente nesta instalação. A identidade é simulada, não uma autenticação real.</p></footer>
    </>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
