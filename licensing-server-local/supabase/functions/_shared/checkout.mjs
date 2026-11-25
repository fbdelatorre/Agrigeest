const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export function createCheckoutHandler({environment='sandbox',enableProduction=false,authenticate,reserve,claim,finish,markUncertain,provider,onFailure=()=>{},allowedOrigins}){
 const origins=allowedOrigins??['https://agrigeest.netlify.app','http://127.0.0.1:4180','http://127.0.0.1:5173','tauri://localhost','http://tauri.localhost','https://tauri.localhost','http://localhost','https://localhost','capacitor://localhost'];
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info,x-agrigest-expected-environment';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&!origins.includes(origin))return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if(request.headers.get('x-agrigest-expected-environment')&&request.headers.get('x-agrigest-expected-environment')!==environment)return reply(409,{error:'ENVIRONMENT_MISMATCH'});
  if(!['sandbox','production'].includes(environment)||(environment==='production'&&!enableProduction))return reply(503,{error:'CHECKOUT_NOT_CONFIGURED'});
  let actor;try{actor=await authenticate(request);}catch{return reply(503,{error:'AUTH_UNAVAILABLE'});}
  if(!actor)return reply(401,{error:'AUTH_REQUIRED'});
  let body;try{
   const chunks=[];let size=0;const reader=request.body?.getReader();if(!reader)throw Error();
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply(413,{error:'BODY_TOO_LARGE'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
   body=JSON.parse(new TextDecoder().decode(bytes));
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['license_id','request_id'].includes(k))||!uuid(body.license_id)||!uuid(body.request_id))throw Error();
  }catch{return reply(400,{error:'INVALID_REQUEST'});}
  let reservation;try{reservation=await reserve(actor,body.license_id,body.request_id,environment,request);}catch{return reply(409,{error:'CHECKOUT_NOT_AVAILABLE'});}
  if(reservation.state==='ready'&&reservation.url)return reply(200,{...reservation,confirmed:false});
  if(['creating','uncertain'].includes(reservation.state))return reply(202,{request_id:body.request_id,state:reservation.state,confirmed:false});
  if(reservation.state!=='reserved')return reply(409,{error:'CHECKOUT_NOT_AVAILABLE',state:reservation.state});
  let claimed;try{claimed=await claim(actor,body.request_id);}catch{return reply(503,{error:'CHECKOUT_TEMPORARILY_UNAVAILABLE'});}
  if(!claimed)return reply(202,{request_id:body.request_id,state:'processing',confirmed:false});
  if(claimed.environment!==environment)return reply(503,{error:'CHECKOUT_NOT_CONFIGURED'});
  try{
   const nextDueDate=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   const created=await provider.createRecurringCheckout({licenseId:claimed.license_id,requestId:claimed.request_id,label:claimed.label,period:claimed.period,amountMinor:Number(claimed.amount_minor),nextDueDate});
   const saved=await finish(actor,body.request_id,created.id);
   if(saved.state!=='ready'||!saved.url){if(provider.cancelCheckout)try{await provider.cancelCheckout(created.id);}catch{ /* revisão manual; nunca repetir criação */ }return reply(409,{error:'CHECKOUT_REQUIRES_REVIEW'});}
   return reply(200,{...saved,confirmed:false});
  }catch(error){
   onFailure({code:/^(ASAAS_REQUEST_FAILED_HTTP_\d{3}|RPC_UNAVAILABLE_[a-z_]+_\d{3}|INVALID_PROVIDER_ID)$/.test(error?.message??'')?error.message:'CHECKOUT_PROVIDER_OR_PERSISTENCE_ERROR'});
   try{await markUncertain(actor,body.request_id);}catch{ /* state creating também bloqueia duplicação */ }
   return reply(503,{error:'CHECKOUT_REQUIRES_REVIEW',request_id:body.request_id});
  }
 };
}
