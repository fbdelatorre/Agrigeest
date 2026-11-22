export function createSubscriptionProcessor({environment='sandbox',enableProduction=false,claim,prepare,finish,provider}){
 if(!['sandbox','production'].includes(environment)||(environment==='production'&&!enableProduction))throw Error('INVALID_SUBSCRIPTION_ENVIRONMENT');
 const cents=value=>{const n=Math.round(value*100);if(!Number.isSafeInteger(n)||Math.abs(n-value*100)>0.000001)throw Error('INVALID_PROVIDER_AMOUNT');return n;};
 return async()=>{
  const job=await claim(environment);if(!job)return {state:'idle'};
  try{
   if(job.action==='checkout_cancel'){
    const result=await provider.cancelCheckout(job.subscription_id);
    if(result?.id&&result.id!==job.subscription_id)throw Error('CHECKOUT_BINDING_MISMATCH');
    if(result?.status&&!['CANCELED','CANCELLED'].includes(result.status))throw Error('CHECKOUT_CONFIRMATION_REQUIRED');
    await finish(job.id,job.lease,'done',null);return {state:'processed',change_id:job.id};
   }
   const read=async()=>{const s=await provider.getSubscription(job.subscription_id);if(!s||s.id!==job.subscription_id||s.customer!==job.customer_id||s.deleted===true||s.cycle!==(job.period==='monthly'?'MONTHLY':'YEARLY'))throw Error('PROVIDER_CONTRACT_MISMATCH');return s;};
   let subscription=await read();
   if(job.action==='suspend'){
    if(subscription.status!=='INACTIVE'){await provider.suspendSubscription(job.subscription_id);subscription=await read();}
    if(subscription.status!=='INACTIVE')throw Error('SUBSCRIPTION_CONFIRMATION_REQUIRED');
   }else if(job.action==='extras'){
    if(subscription.status!=='ACTIVE')throw Error('SUBSCRIPTION_NOT_ACTIVE');
    const current=cents(subscription.value),target=Number(job.target_minor);
    if(current!==Number(job.current_minor)&&!(job.effective_on&&current===target))throw Error('PROVIDER_CONTRACT_MISMATCH');
    if(typeof subscription.nextDueDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(subscription.nextDueDate))throw Error('PROVIDER_EFFECTIVE_DATE_REVIEW');
    await prepare(job.id,job.lease,subscription.nextDueDate);
    if(current!==target)await provider.updateSubscriptionValue(job.subscription_id,target);
    subscription=await read();
    if(cents(subscription.value)!==target||subscription.status!=='ACTIVE')throw Error('SUBSCRIPTION_CONFIRMATION_REQUIRED');
   }else throw Error('INVALID_SUBSCRIPTION_ACTION');
   await finish(job.id,job.lease,'done',null);
   return {state:'processed',change_id:job.id};
  }catch(error){
   const message=error?.message??'';const code=/^[A-Z_0-9]{1,100}$/.test(message)?message:'SUBSCRIPTION_UNAVAILABLE';
   const retryable=/ASAAS_REQUEST_FAILED_HTTP_(429|5\d\d)|UNAVAILABLE|CONFIRMATION_REQUIRED|fetch|timeout|abort/i.test(message)||code==='SUBSCRIPTION_UNAVAILABLE';
   try{await finish(job.id,job.lease,retryable?'failed':'review',code);}catch{ /* Uma solicitação supersedida ou lease vencida não aplica acesso. */ }
   return {state:retryable?'failed':'review',change_id:job.id,code};
  }
 };
}
