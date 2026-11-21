const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
const paidStatuses=['RECEIVED','CONFIRMED','DUNNING_RECEIVED'];
function cents(value){const number=typeof value==='number'?value:NaN;const minor=Math.round(number*100);if(!Number.isSafeInteger(minor)||minor<=0||minor>1000000000||Math.abs(number*100-minor)>0.000001)throw Error('INVALID_PROVIDER_AMOUNT');return minor;}
function date(value,required=true){if(value==null&&!required)return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('INVALID_PROVIDER_DATE');const parsed=new Date(value+'T12:00:00Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)throw Error('INVALID_PROVIDER_DATE');return value;}
function paymentData(raw,expectedId){
 if(!raw||raw.id!==expectedId||!safeId(raw.id)||!safeId(raw.subscription)||!safeId(raw.customer)||typeof raw.status!=='string'||!/^[A-Z_]{1,80}$/.test(raw.status)||(raw.currency&&raw.currency!=='BRL'))throw Error('INVALID_PROVIDER_PAYMENT');
 const hasRefund=Array.isArray(raw.refunds)&&raw.refunds.some(r=>r&&r.status!=='CANCELLED');
 return {id:raw.id,subscription:raw.subscription,customer:raw.customer,amount_minor:cents(raw.value),status:raw.status,
 due_on:date(raw.dueDate),paid_on:date(raw.paymentDate??raw.clientPaymentDate??raw.confirmedDate,false),
 checkout_id:typeof raw.checkoutSession==='string'?raw.checkoutSession:null,deleted:raw.deleted===true,has_refund:hasRefund};
}
function subscriptionData(raw,expectedId){
 if(!raw||raw.id!==expectedId||!safeId(raw.id)||!safeId(raw.customer)||!['MONTHLY','YEARLY'].includes(raw.cycle))throw Error('INVALID_PROVIDER_SUBSCRIPTION');
 return {id:raw.id,customer:raw.customer,amount_minor:cents(raw.value),cycle:raw.cycle,
 checkout_id:typeof raw.checkoutSession==='string'?raw.checkoutSession:null,reference:typeof raw.externalReference==='string'?raw.externalReference:null,
 deleted:raw.deleted===true,status:typeof raw.status==='string'?raw.status:null};
}
export function createReconciler({environment='sandbox',enableProduction=false,claim,context,apply,finish,provider}){
 if(!['sandbox','production'].includes(environment)||(environment==='production'&&!enableProduction))throw Error('INVALID_RECONCILIATION_ENVIRONMENT');
 return async(eventId=null)=>{
  const job=await claim(environment,eventId);if(!job)return {state:'idle'};
  try{
   if(!job.event_type.startsWith('PAYMENT_')){await finish(environment,job.event_id,job.lease,'processed','INFORMATIONAL_EVENT');return {state:'processed',event_id:job.event_id};}
   const paymentId=job.payload?.payment?.id;if(!safeId(paymentId))throw Error('INVALID_PAYMENT_REFERENCE');
   // O payload recebido é apenas uma pista. Todos os fatos financeiros vêm do GET autenticado.
   const payment=paymentData(await provider.getPayment(paymentId),paymentId);
   let ctx=await context(environment,payment.subscription,null,null);
   let subscription=null;
   if(!ctx||paidStatuses.includes(payment.status)){
    subscription=subscriptionData(await provider.getSubscription(payment.subscription),payment.subscription);
    if(subscription.customer!==payment.customer)throw Error('PROVIDER_CUSTOMER_MISMATCH');
    if(payment.checkout_id&&subscription.checkout_id&&payment.checkout_id!==subscription.checkout_id)throw Error('CHECKOUT_BINDING_MISMATCH');
    if(!ctx)ctx=await context(environment,payment.subscription,payment.checkout_id??subscription.checkout_id,subscription.reference);
   }
   if(!ctx)throw Error('UNKNOWN_BILLING_CONTRACT');
   if((environment==='sandbox')!==ctx.test_mode)throw Error('BILLING_ENVIRONMENT_MISMATCH');
   if(payment.amount_minor!==Number(ctx.amount_minor)||(ctx.customer_id&&ctx.customer_id!==payment.customer))throw Error('PROVIDER_CONTRACT_MISMATCH');
   if(subscription&&(subscription.amount_minor!==Number(ctx.amount_minor)||subscription.cycle!==(ctx.period==='monthly'?'MONTHLY':'YEARLY')))throw Error('PROVIDER_CONTRACT_MISMATCH');
   const result=await apply(environment,job.event_id,job.lease,ctx.request_id,payment,subscription);
   return {state:'processed',event_id:job.event_id,changed:result.changed};
  }catch(error){
   const message=error?.message??'';
   const code=/^[A-Z_0-9]{1,100}$/.test(message)?message:'RECONCILIATION_UNAVAILABLE';
   const retryable=/ASAAS_REQUEST_FAILED_HTTP_(429|5\d\d)|UNAVAILABLE|fetch|timeout|abort/i.test(message)||code==='RECONCILIATION_UNAVAILABLE';
   try{await finish(environment,job.event_id,job.lease,retryable?'failed':'review',code);}catch{ /* lease expirada ou banco indisponível: fila durável permanece */ }
   return {state:retryable?'failed':'review',event_id:job.event_id,code};
  }
 };
}
