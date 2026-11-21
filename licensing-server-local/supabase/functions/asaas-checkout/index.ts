import {createAsaasClient} from '../_shared/asaas.mjs';
import {createCheckoutHandler} from '../_shared/checkout.mjs';
const url=Deno.env.get('SUPABASE_URL')??'';
const service=Deno.env.get('SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const publicKey=Deno.env.get('SUPABASE_ANON_KEY')??'';
const environment=Deno.env.get('ASAAS_ENV')??'sandbox';
const enableProduction=Deno.env.get('ASAAS_ENABLE_PRODUCTION')==='true';
const endpoint=new URL(url);
if(!['kong','127.0.0.1','localhost','qnhykflwwihdpahvktmb.supabase.co'].includes(endpoint.hostname))throw Error('Invalid database target');
if(endpoint.hostname==='qnhykflwwihdpahvktmb.supabase.co'&&endpoint.protocol!=='https:')throw Error('HTTPS required');
async function call(name:string,args:Record<string,unknown>,bearer?:string){
 const key=bearer?publicKey:service;if(!key)throw Error('Missing server configuration');
 const headers:Record<string,string>={apikey:key,'Content-Type':'application/json','Content-Profile':'licensing'};
 if(bearer)headers.Authorization=bearer;else if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('RPC_UNAVAILABLE_'+name+'_'+response.status);return response.json();
}
let provider;
try{provider=createAsaasClient({environment,enableProduction,apiKey:Deno.env.get('ASAAS_API_KEY')??'',onDiagnostic:(info:unknown)=>console.warn('Asaas checkout diagnostic',JSON.stringify(info))});}catch{Deno.serve(()=>Response.json({error:'CHECKOUT_NOT_CONFIGURED'},{status:503}));}
if(provider)Deno.serve(createCheckoutHandler({environment,enableProduction,provider,
 onFailure:(info:unknown)=>console.warn('Checkout failure',JSON.stringify(info)),
 authenticate:async(request:Request)=>{
  const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return null;
  const response=await fetch(url+'/auth/v1/user',{headers:{apikey:publicKey,Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!response.ok)return null;const user=await response.json();return user.id&&user.email_confirmed_at?user.id:null;
 },
 reserve:(_actor:string,license:string,requestId:string,env:string,request:Request)=>call('reserve_checkout',{p_license:license,p_request:requestId,p_environment:env},request.headers.get('authorization')!),
 claim:(actor:string,requestId:string)=>call('claim_checkout',{p_actor:actor,p_request:requestId}),
 finish:(actor:string,requestId:string,id:string)=>call('finish_checkout',{p_actor:actor,p_request:requestId,p_provider_id:id}),
 markUncertain:(actor:string,requestId:string)=>call('mark_checkout_uncertain',{p_actor:actor,p_request:requestId}),
}));
