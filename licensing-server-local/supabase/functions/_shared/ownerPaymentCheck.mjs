export function createOwnerPaymentCheck({environment='sandbox',enableProduction=false,authenticate,claim,provider,enqueue,kick}){
 if(!['sandbox','production'].includes(environment)||(environment==='production'&&!enableProduction))throw Error('INVALID_PAYMENT_CHECK_ENVIRONMENT');
 const origins=['http://127.0.0.1:4180','http://127.0.0.1:5173','https://agrigeest.netlify.app','tauri://localhost','http://tauri.localhost','https://tauri.localhost'];
 return async request=>{
  const origin=request.headers.get('origin');const headers={'Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
  if(origin&&origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info,x-agrigest-expected-environment';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
  const reply=(status,body)=>Response.json(body,{status,headers});if(origin&&!origins.includes(origin))return reply(403,{error:'ORIGIN_NOT_ALLOWED'});if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if(request.headers.get('x-agrigest-expected-environment')&&request.headers.get('x-agrigest-expected-environment')!==environment)return reply(409,{error:'ENVIRONMENT_MISMATCH'});
  try{
   const actor=await authenticate(request);if(!actor)return reply(401,{error:'AUTH_REQUIRED'});
   const reader=request.body?.getReader();let size=0,text='';const decoder=new TextDecoder();if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return reply(413,{error:'BODY_TOO_LARGE'});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();
   let body;try{body=JSON.parse(text);}catch{return reply(400,{error:'INVALID_BODY'});}if(!body||Object.keys(body).some(k=>k!=='license_id')||typeof body.license_id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.license_id))return reply(400,{error:'INVALID_BODY'});
   const context=await claim(actor,body.license_id,environment);let list=context.subscription_id?await provider.listSubscriptionPayments(context.subscription_id):await provider.listCheckoutPayments(context.provider_id);if(!Array.isArray(list?.data))throw Error('INVALID_PROVIDER_LIST');
   // O filtro checkoutSession pode retornar vazio no Sandbox. A recuperação usa
   // a data persistida pelo servidor e só aceita o UUID exato deste checkout.
   if(!context.subscription_id&&!list.data.length){
    const created=Date.parse(context.checkout_created_at);if(!Number.isFinite(created))throw Error('INVALID_CHECKOUT_DATE');
    const day=86400000,since=new Date(created-day).toISOString().slice(0,10),until=new Date(created+2*day).toISOString().slice(0,10);let complete=false;const matches=[];
    for(let page=0;page<5;page++){
     const result=await provider.listRecentPayments({since,until,offset:page*100});if(!Array.isArray(result?.data)||result.data.length>100||typeof result.hasMore!=='boolean')throw Error('INVALID_PROVIDER_LIST');
     matches.push(...result.data.filter(p=>p?.checkoutSession===context.provider_id));
     if(!result.hasMore){complete=true;break;}
    }
    if(!complete)throw Error('PAYMENT_SCAN_LIMIT');if(matches.length>10)throw Error('INVALID_PROVIDER_LIST');list={data:matches};
   }
   const events=[];for(const p of list.data.slice(0,10)){if(typeof p?.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(p.id)||(context.subscription_id?p.subscription!==context.subscription_id:p.checkoutSession!==context.provider_id))throw Error('INVALID_PROVIDER_PAYMENT');const event={id:'evt_owner_check_'+crypto.randomUUID().replaceAll('-',''),event:'PAYMENT_RECHECK',payment:{id:p.id}};await enqueue(environment,event);events.push(event.id);}
   // O payload listado não ativa nada: a fila fará novo GET autenticado do pagamento.
   if(events.length&&kick)try{await kick(events[0]);}catch{ /* fila durável continua para o processador */ }
   return reply(200,{state:events.length?'queued':'awaiting_payment',queued:events.length});
  }catch(e){const code=e?.message??'';if(code==='OWNER_REQUIRED')return reply(403,{error:code});if(code==='PAYMENT_CHECK_RATE_LIMIT')return reply(429,{error:code});if(['CHECKOUT_NOT_FOUND','BILLING_ENVIRONMENT_MISMATCH'].includes(code))return reply(409,{error:code});return reply(503,{error:'PAYMENT_CHECK_UNAVAILABLE'});}
 };
}
