import {createAsaasClient,validateWebhookToken} from '../_shared/asaas.mjs';
import {createReconciler} from '../_shared/reconcile.mjs';
import {createSubscriptionProcessor} from '../_shared/subscriptionChanges.mjs';
const url=Deno.env.get('SUPABASE_URL')??'';const endpoint=new URL(url);
if(!['kong','127.0.0.1','localhost','qnhykflwwihdpahvktmb.supabase.co'].includes(endpoint.hostname)||(endpoint.hostname.endsWith('.supabase.co')&&endpoint.protocol!=='https:'))throw Error('Invalid database target');
const key=Deno.env.get('SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')??'';
const environment=Deno.env.get('ASAAS_ENV')??'sandbox';const enableProduction=Deno.env.get('ASAAS_ENABLE_PRODUCTION')==='true';
const workerToken=Deno.env.get('ASAAS_RECONCILE_TOKEN')??'';
async function rpc(name:string,args:Record<string,unknown>,bearer?:string){
 const headers:Record<string,string>={apikey:bearer?publicKey:key,'Content-Type':'application/json','Content-Profile':'licensing'};
 if(bearer)headers.Authorization=bearer;else if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok){const data=await response.json().catch(()=>null);const message=data?.message;throw Error(typeof message==='string'&&/^[A-Z_]{1,100}$/.test(message)?message:'DATABASE_UNAVAILABLE');}if(response.status===204)return null;return response.json();
}
const provider=createAsaasClient({environment,enableProduction,apiKey:Deno.env.get('ASAAS_API_KEY')??''});
const reconcile=createReconciler({environment,enableProduction,provider,
 claim:(env:string,event:string|null)=>rpc('claim_billing_event',{p_environment:env,p_event_id:event}),
 context:(env:string,sub:string,checkout:string|null,reference:string|null,due:string)=>rpc('billing_payment_context',{p_environment:env,p_subscription_id:sub,p_checkout_id:checkout,p_reference:reference,p_due:due}),
 apply:(env:string,event:string,lease:string,request:string,payment:unknown,subscription:unknown)=>rpc('apply_canonical_payment',{p_environment:env,p_event_id:event,p_lease:lease,p_request:request,p_payment:payment,p_subscription:subscription}),
 finish:(env:string,event:string,lease:string,result:string,code:string|null)=>rpc('finish_billing_event',{p_environment:env,p_event_id:event,p_lease:lease,p_result:result,p_code:code}),
});
const subscriptionChanges=createSubscriptionProcessor({environment,enableProduction,provider,
 claim:(env:string)=>rpc('claim_subscription_change',{p_environment:env}),
 prepare:(id:string,lease:string,date:string)=>rpc('prepare_subscription_change',{p_id:id,p_lease:lease,p_date:date}),
 finish:(id:string,lease:string,result:string,code:string|null)=>rpc('finish_subscription_change',{p_id:id,p_lease:lease,p_result:result,p_code:code}),
});
Deno.serve(async(request:Request)=>{
 const origin=request.headers.get('origin');const origins=['http://127.0.0.1:4180','https://agrigeest.netlify.app','tauri://localhost','http://tauri.localhost','https://tauri.localhost'];
 const headers:Record<string,string>={'Cache-Control':'no-store','Vary':'Origin','Content-Type':'application/json'};
 if(origin&&origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info,x-agrigest-expected-environment';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
 const reply=(status:number,data:unknown)=>Response.json(data,{status,headers});
 if(origin&&!origins.includes(origin))return reply(403,{error:'ORIGIN_NOT_ALLOWED'});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
 if(request.headers.get('x-agrigest-expected-environment')&&request.headers.get('x-agrigest-expected-environment')!==environment)return reply(409,{error:'ENVIRONMENT_MISMATCH'});
 try{
  const worker=await validateWebhookToken(request.headers.get('x-agrigest-worker-token'),workerToken);
  if(!worker){
   const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return reply(401,{error:'AUTH_REQUIRED'});
   const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!auth.ok)return reply(401,{error:'AUTH_REQUIRED'});
   if(!await rpc('is_platform_admin',{},bearer))return reply(403,{error:'PLATFORM_ADMIN_REQUIRED'});
  }
  const chunks:Uint8Array[]=[];let size=0;const reader=request.body?.getReader();
  if(reader)while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1024){await reader.cancel();return reply(413,{error:'BODY_TOO_LARGE'});}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  const text=new TextDecoder().decode(bytes);
  let body;try{body=text?JSON.parse(text):{};}catch{return reply(400,{error:'INVALID_BODY'});}
  if(!body||Array.isArray(body)||Object.keys(body).some(k=>k!=='event_id')||(body.event_id!==undefined&&(typeof body.event_id!=='string'||!/^evt_[^\s\x00-\x1f]{1,240}$/.test(body.event_id))))return reply(400,{error:'INVALID_BODY'});
  if(!body.event_id){const result=await subscriptionChanges();if(result.state!=='idle')return reply(200,result);}
  return reply(200,await reconcile(body.event_id??null));
 }catch{return reply(503,{error:'RECONCILIATION_UNAVAILABLE'});}
});
