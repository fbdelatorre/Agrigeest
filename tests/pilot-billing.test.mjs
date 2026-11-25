import test from 'node:test';import assert from 'node:assert/strict';
import {createAsaasClient} from '../licensing-server-local/supabase/functions/_shared/asaas.mjs';
import {createCheckoutHandler} from '../licensing-server-local/supabase/functions/_shared/checkout.mjs';
import {createOwnerPaymentCheck} from '../licensing-server-local/supabase/functions/_shared/ownerPaymentCheck.mjs';
import {operationalPilotBilling} from '../scripts/operational-pilot-billing.mjs';
test('pilot billing refuses foreign database configuration before loading credentials',async()=>{
 await assert.rejects(operationalPilotBilling({database:'postgres',container:'supabase_db_agrigest-compat15-local'},{database:'postgres',apiUrl:'http://127.0.0.1:48721'}),/LOCAL_PILOT_REQUIRED/);
});
test('local callback is fixed, Sandbox-only and never changes the provider API target',async()=>{
 let payload;const provider=createAsaasClient({environment:'sandbox',enableProduction:false,apiKey:'fictitious-key',callbackBaseUrl:'http://127.0.0.1:48780/pilot-plans',fetchImpl:async(url,options)=>{assert.equal(url,'https://api-sandbox.asaas.com/v3/checkouts');payload=JSON.parse(options.body);return Response.json({id:'fictitious_checkout'});}});
 await provider.createRecurringCheckout({licenseId:'license',requestId:'request',label:'Test only',period:'monthly',amountMinor:1000,nextDueDate:'2026-11-25'});assert.equal(payload.callback.successUrl,'http://127.0.0.1:48780/pilot-plans?payment=processing');
 assert.throws(()=>createAsaasClient({environment:'production',enableProduction:true,apiKey:'fake',callbackBaseUrl:'http://127.0.0.1:48780/pilot-plans'}),/INVALID_CALLBACK_TARGET/);
 assert.throws(()=>createAsaasClient({environment:'sandbox',apiKey:'fake',callbackBaseUrl:'https://example.test'}),/INVALID_CALLBACK_TARGET/);
});
test('pilot CORS is explicit; unrelated clients keep default rejection and cannot request production',async()=>{
 const origin='http://127.0.0.1:48780',request=()=>new Request('http://127.0.0.1/functions',{method:'POST',headers:{Origin:origin,'x-agrigest-expected-environment':'sandbox'},body:'{}'});
 const deps={environment:'sandbox',enableProduction:false,authenticate:async()=>null,provider:{}};
 assert.equal((await createCheckoutHandler(deps)(request())).status,403);
 for(const handler of [createCheckoutHandler({...deps,allowedOrigins:[origin]}),createOwnerPaymentCheck({...deps,allowedOrigins:[origin]})]){
  assert.equal((await handler(request())).status,401);const wrong=new Request('http://127.0.0.1/functions',{method:'POST',headers:{Origin:origin,'x-agrigest-expected-environment':'production'},body:'{}'});assert.equal((await handler(wrong)).status,409);
 }
});
