import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {createReconciler} from '../licensing-server-local/supabase/functions/_shared/reconcile.mjs';
const id=n=>`40000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('canonical ledger activates and renews once, reverses coverage and preserves explicit manual decisions',async()=>{
 const db=new PGlite();
 const as=(actor,role,sql,args=[])=>db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor?id(actor):'',JSON.stringify({aal:'aal2'})]);return (await tx.query(sql,args)).rows;});
 const call=async(actor,fn,args=[])=> (await as(actor,'authenticated',`SELECT licensing.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args))[0]?.result;
 const service=async(fn,args=[])=> (await as(null,'service_role',`SELECT licensing.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args))[0]?.result;
 const row=async license=>(await db.query('SELECT * FROM licensing.licenses WHERE id=$1',[license])).rows[0];
 try{
  await db.exec("CREATE SCHEMA auth;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb $$;GRANT USAGE ON SCHEMA auth TO authenticated;");
  for(const n of [1,2,3])await db.query('INSERT INTO auth.users VALUES($1,$2,now())',[id(n),`reconcile${n}@example.test`]);
  for(const file of ['20261120000100_license_control.sql','20261120000200_asaas_inbox.sql','20261121000300_checkout_reservations.sql','20261121000400_checkout_admin_view.sql','20261121000500_canonical_payments.sql'])await db.exec(await readFile('licensing-server-local/supabase/migrations/'+file,'utf8'));
  await db.query('INSERT INTO licensing_private.platform_admins(user_id) VALUES($1)',[id(1)]);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS date")).rows[0].date;
  const nextMonth=(await db.query("SELECT ($1::date+interval '1 month')::date::text AS date",[today])).rows[0].date;
  async function setup(period='monthly',testMode=true){const license=await call(1,'admin_create_license',[id(2),'Conciliação fictícia','farm',period,1000,0,randomUUID()]);if(testMode)await call(1,'admin_set_test_mode',[license,true,randomUUID()]);const request=randomUUID(),checkout='checkout_'+randomUUID();await call(2,'reserve_checkout',[license,request,'sandbox']);await service('claim_checkout',[id(2),request]);await service('finish_checkout',[id(2),request,checkout]);return {license,request,checkout,subscription:'sub_'+randomUUID()};}
  const f=await setup();
  const payment=(paymentId,status='RECEIVED',due=today)=>({id:paymentId,subscription:f.subscription,customer:'cus_fixture',amount_minor:1000,status,due_on:due,paid_on:status==='PENDING'?null:today,checkout_id:f.checkout,deleted:false,has_refund:false});
  const sub={id:f.subscription,customer:'cus_fixture',amount_minor:1000,cycle:'MONTHLY',checkout_id:f.checkout,reference:f.license+':'+f.request};
  async function claim(paymentId){const event='evt_'+randomUUID();await service('ingest_asaas_event',['sandbox',{id:event,event:'PAYMENT_RECEIVED',payment:{id:paymentId}}]);return await service('claim_billing_event',['sandbox',event]);}
  async function apply(p,s=sub){const job=await claim(p.id);assert.ok(job);return service('apply_canonical_payment',['sandbox',job.event_id,job.lease,f.request,p,s]);}
  const first=await apply(payment('pay_first'));assert.equal(first.license_status,'active');const initial=await row(f.license);
  const auditCount=(await db.query('SELECT count(*) AS n FROM licensing.provider_audit')).rows[0].n;
  const replay=await apply(payment('pay_first'));assert.equal(replay.changed,false);assert.equal((await row(f.license)).billing_revision,initial.billing_revision);assert.equal((await db.query('SELECT count(*) AS n FROM licensing.provider_audit')).rows[0].n,auditCount);
  const renewed=await apply(payment('pay_second','CONFIRMED',nextMonth));assert.ok(new Date(renewed.valid_until)>new Date(first.valid_until));
  assert.equal((await apply(payment('pay_second','CONFIRMED',nextMonth))).valid_until,renewed.valid_until,'Replay does not append an extra month');
  await apply(payment('pay_third','PENDING',nextMonth));assert.equal((await row(f.license)).valid_until.toISOString(),new Date(renewed.valid_until).toISOString(),'Upcoming unpaid invoice does not remove paid coverage');
  await apply(payment('pay_second','REFUNDED',nextMonth),null);assert.equal((await row(f.license)).valid_until.toISOString(),new Date(first.valid_until).toISOString());
  await apply(payment('pay_first','REFUNDED'),null);assert.equal(await call(2,'is_active',[f.license]),false);
  await apply(payment('pay_first'));await call(2,'owner_license_action',[f.license,'cancel',randomUUID()]);
  await apply(payment('pay_first'));assert.equal((await row(f.license)).status,'cancelled','A late event does not undo owner cancellation');
  await call(2,'owner_license_action',[f.license,'request_reactivation',randomUUID()]);await apply(payment('pay_first'));assert.equal((await row(f.license)).status,'active');
  const manualUntil=new Date(Date.now()+86400000*90).toISOString();await call(1,'admin_set_license',[f.license,'activate_manual',manualUntil,'Exceção administrativa de teste',randomUUID()]);
  await apply(payment('pay_first','REFUNDED'),null);assert.equal((await row(f.license)).valid_until.toISOString(),manualUntil,'Manual override is protected by revision, even in fast transactions');
  assert.equal((await as(2,'authenticated','SELECT * FROM licensing.provider_payments')).length,3);assert.equal((await as(3,'authenticated','SELECT * FROM licensing.provider_payments')).length,0);
  await assert.rejects(as(2,'authenticated',"UPDATE licensing.provider_payments SET eligible=true"),/permission denied/);
  await assert.rejects(as(null,'service_role',"DELETE FROM licensing.provider_audit"),/permission denied/);
  await assert.rejects(db.exec('DELETE FROM licensing.provider_audit'),/PROVIDER_AUDIT_IMMUTABLE/);
  await assert.rejects(call(2,'claim_billing_event',['sandbox',null]),/permission denied/);
  const a=await claim('pay_first');const bId='evt_'+randomUUID();await service('ingest_asaas_event',['sandbox',{id:bId,event:'PAYMENT_UPDATED',payment:{id:'pay_first'}}]);assert.equal(await service('claim_billing_event',['sandbox',bId]),null);
  await db.exec("UPDATE licensing_private.billing_processors SET lease_until=now()-interval '1 second'");const b=await service('claim_billing_event',['sandbox',bId]);assert.ok(b);
  await assert.rejects(service('apply_canonical_payment',['sandbox',a.event_id,a.lease,f.request,payment('pay_first'),sub]),/STALE_BILLING_LEASE/);
  await service('apply_canonical_payment',['sandbox',b.event_id,b.lease,f.request,payment('pay_first','REFUNDED'),null]);
  const stale=await service('claim_billing_event',['sandbox',a.event_id]);await service('finish_billing_event',['sandbox',stale.event_id,stale.lease,'processed',null]);
  const real=await setup('monthly',false);const job=await claim('pay_commercial');
  await assert.rejects(service('apply_canonical_payment',['sandbox',job.event_id,job.lease,real.request,{...payment('pay_commercial'),subscription:real.subscription,checkout_id:real.checkout},{...sub,id:real.subscription,checkout_id:real.checkout}]),/BILLING_ENVIRONMENT_MISMATCH/);
  await service('finish_billing_event',['sandbox',job.event_id,job.lease,'review','BILLING_ENVIRONMENT_MISMATCH']);
  await assert.rejects(db.query('UPDATE licensing.licenses SET institution_id=$1 WHERE id=$2',[randomUUID(),f.license]),/test_license_has_no_farm/);
  const annual=await setup('annual');const annualJob=await claim('pay_annual');
  const annualPayment={...payment('pay_annual'),subscription:annual.subscription,checkout_id:annual.checkout};
  const annualSub={...sub,id:annual.subscription,cycle:'YEARLY',checkout_id:annual.checkout,reference:annual.license+':'+annual.request};
  await assert.rejects(service('apply_canonical_payment',['sandbox',annualJob.event_id,annualJob.lease,annual.request,{...annualPayment,amount_minor:1},annualSub]),/INVALID_CANONICAL_PAYMENT/);
  await assert.rejects(service('apply_canonical_payment',['sandbox',annualJob.event_id,annualJob.lease,annual.request,annualPayment,{...annualSub,customer:'cus_another'}]),/INVALID_CANONICAL_SUBSCRIPTION/);
  const annualResult=await service('apply_canonical_payment',['sandbox',annualJob.event_id,annualJob.lease,annual.request,annualPayment,annualSub]);
  const expectedYear=(await db.query("SELECT (($1::date+interval '1 year')::timestamp AT TIME ZONE 'America/Sao_Paulo') AS until",[today])).rows[0].until;
  assert.equal(new Date(annualResult.valid_until).toISOString(),expectedYear.toISOString(),'Annual licence uses a calendar year');
  const refundJob=await claim('pay_annual');await service('apply_canonical_payment',['sandbox',refundJob.event_id,refundJob.lease,annual.request,{...annualPayment,has_refund:true},annualSub]);assert.equal(await call(2,'is_active',[annual.license]),false,'Refund marker removes eligibility even before provider status changes');
 }finally{await db.close();}
});
test('reconciler uses authenticated provider facts instead of webhook values and isolates failures',async()=>{
 const jobs=[{event_id:'evt_1',event_type:'PAYMENT_RECEIVED',lease:randomUUID(),payload:{payment:{id:'pay_1',status:'RECEIVED',value:999999}}}];
 let applied,finished;const raw={id:'pay_1',subscription:'sub_1',customer:'cus_1',value:10,status:'PENDING',dueDate:'2026-11-21',paymentDate:null};
 const worker=createReconciler({claim:async()=>jobs.shift()??null,context:async()=>({request_id:id(10),amount_minor:1000,period:'monthly',test_mode:true,customer_id:'cus_1'}),apply:async(...args)=>{applied=args;return {changed:true};},finish:async(...args)=>{finished=args;},provider:{getPayment:async()=>raw,getSubscription:async()=>{throw Error('Unexpected lookup');}}});
 assert.equal((await worker()).state,'processed');assert.equal(applied[4].status,'PENDING');assert.equal(applied[4].amount_minor,1000);assert.equal(await worker().then(x=>x.state),'idle');assert.equal(finished,undefined);
 const failing=createReconciler({claim:async()=>({event_id:'evt_bad',event_type:'PAYMENT_UPDATED',lease:randomUUID(),payload:{payment:{id:'pay_bad'}}}),context:async()=>null,apply:async()=>{throw Error('Must not activate');},finish:async(...args)=>{finished=args;},provider:{getPayment:async()=>{throw Error('ASAAS_REQUEST_FAILED_HTTP_500');}}});
 assert.equal((await failing()).state,'failed');assert.equal(finished[3],'failed');
 assert.throws(()=>createReconciler({environment:'production'}),/INVALID_RECONCILIATION_ENVIRONMENT/);
});
