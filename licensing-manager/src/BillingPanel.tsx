import {client,rpc,type snapshot} from './api';
type Props={data:Awaited<ReturnType<typeof snapshot>>;busy:boolean;act:(task:()=>Promise<unknown>,message:string)=>Promise<void>};
const money=(minor:number)=>Number(minor/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=(value:string)=>new Date(value.includes('T')?value:value+'T12:00:00').toLocaleString('pt-BR');
const status=(value:string)=>({RECEIVED:'Recebido',CONFIRMED:'Confirmado pelo Asaas',PENDING:'Aguardando pagamento',OVERDUE:'Vencido',REFUNDED:'Estornado',REFUND_REQUESTED:'Estorno solicitado',DUNNING_RECEIVED:'Recebido após cobrança',processed:'Conferido',pending:'Aguardando conferência',failed:'Nova tentativa agendada',review:'Conferência necessária',processing:'Em conferência'}[value]??value);
export function BillingPanel({data,busy,act}:Props){
 const name=(id:string)=>data.licenses.find(l=>l.id===id)?.label??'Licença';
 const production=data.providerPayments.filter(p=>p.environment==='production'&&p.eligible);
 const total=production.reduce((sum,p)=>sum+Number(p.amount_minor),0);
 return <section className="panel"><h2>Conciliação automática Asaas</h2>
  {!data.billingAvailable?<p>Atualize o serviço para consultar a conciliação automática.</p>:<>
   <p>Recebimentos brutos de produção conferidos: <strong>{money(total)}</strong>. Sandbox e lançamentos administrativos ficam separados. O valor não representa saldo líquido nem inclui taxas.</p>
   <p>As informações abaixo são consultadas no Asaas pelo servidor. Os registros e seu histórico são preservados.</p>
   {!data.providerPayments.length&&<p>Nenhum pagamento conferido pelo Asaas.</p>}
   {data.providerPayments.map(p=><article key={p.environment+':'+p.payment_id}><h3>{name(p.license_id)} · {money(Number(p.amount_minor))}</h3><p>{p.environment==='sandbox'?'TESTE SANDBOX · sem valor real':'Produção'} · {status(p.status)}</p><p>Vencimento: {date(p.due_on)} · {p.eligible?'Pagamento elegível para cobertura':'Sem cobertura por este pagamento'}{p.has_refund?' · Com estorno':''}</p><p>Conferido em {date(p.verified_at)} · Referência: {p.payment_id}</p></article>)}
   <h3>Conferências recentes</h3><p>Até 100 eventos. Uma nova tentativa consulta o Asaas novamente e não gera outra cobrança.</p>
   {!data.queue.length&&<p>Nenhum evento recebido.</p>}
   {data.queue.map(j=><article key={j.environment+':'+j.event_id}><strong>{j.environment==='sandbox'?'Sandbox':'Produção'} · {status(j.state)}</strong><p>{date(j.received_at)} · {j.attempts} tentativa(s){j.error_code?' · '+j.error_code:''}</p><small>{j.event_id}</small>{['failed','review'].includes(j.state)&&<button disabled={busy} onClick={()=>void act(async()=>{await rpc('admin_retry_billing_event',{p_environment:j.environment,p_event_id:j.event_id});const result=await client!.functions.invoke('asaas-reconcile',{body:{event_id:j.event_id},headers:{'x-agrigest-expected-environment':j.environment}});if(result.error)throw Error('A conferência foi reenfileirada, mas o serviço não respondeu. Atualize para conferir o resultado.');if(result.data?.state==='review'||result.data?.state==='failed')throw Error('O Asaas ainda exige conferência. Atualize para ver o diagnóstico.');},'Nova conferência solicitada. Atualize para acompanhar o resultado.')}>Conferir novamente</button>}</article>)}
  </>}
 </section>;
}
