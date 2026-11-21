import {createAsaasWebhookHandler} from '../_shared/asaas.mjs';
const environment=Deno.env.get('ASAAS_ENV')??'sandbox';
const secret=Deno.env.get('ASAAS_WEBHOOK_TOKEN')??'';
const url=Deno.env.get('SUPABASE_URL')??'';
const key=Deno.env.get('SUPABASE_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'';
const productionEnabled=Deno.env.get('ASAAS_ENABLE_PRODUCTION')==='true';
const handler=createAsaasWebhookHandler({secret,enqueue:async(event:Record<string,unknown>)=>{
 if(!['sandbox','production'].includes(environment)||(environment==='production'&&!productionEnabled))throw Error('Invalid environment');
 const endpoint=new URL(url);if(!['kong','127.0.0.1','localhost','qnhykflwwihdpahvktmb.supabase.co'].includes(endpoint.hostname))throw Error('Invalid database target');
 if(!key)throw Error('Missing server key');
 const headers:Record<string,string>={apikey:key,'Content-Type':'application/json','Content-Profile':'licensing'};
 if(!key.startsWith('sb_secret_'))headers.Authorization='Bearer '+key;
 const response=await fetch(url+'/rest/v1/rpc/ingest_asaas_event',{method:'POST',headers,body:JSON.stringify({p_environment:environment,p_event:event}),redirect:'error'});
 if(!response.ok)throw Error('Inbox persistence failed');
 const workerToken=Deno.env.get('ASAAS_RECONCILE_TOKEN');
 if(workerToken){
  const task=fetch(url+'/functions/v1/asaas-reconcile',{method:'POST',headers:{'x-agrigest-worker-token':workerToken,'Content-Type':'application/json'},body:JSON.stringify({event_id:event.id}),redirect:'error',signal:AbortSignal.timeout(60000)}).then(r=>r.body?.cancel()).catch(()=>{});
  const runtime=(globalThis as unknown as {EdgeRuntime?:{waitUntil:(p:Promise<unknown>)=>void}}).EdgeRuntime;
  if(runtime)runtime.waitUntil(task);else await task;
 }
}});
Deno.serve((request:Request)=>{
 if(request.headers.get('x-agrigest-expected-environment')&&request.headers.get('x-agrigest-expected-environment')!==environment)return Response.json({error:'ENVIRONMENT_MISMATCH'},{status:409});
 return handler(request);
});
