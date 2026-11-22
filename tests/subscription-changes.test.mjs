import test from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {PGlite} from '@electric-sql/pglite';
import {createSubscriptionProcessor} from '../licensing-server-local/supabase/functions/_shared/subscriptionChanges.mjs';
test('subscription requests bind prices and ownership, reserve one processor, preserve old invoices and grant extras after payment',async()=>{
 const db=new PGlite();const admin=randomUUID(),owner=randomUUID(),other=randomUUID();
 const call=(who,role,fn,args=[])=>db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE '+role);await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[who??'',JSON.stringify({aal:'aal2'})]);return (await tx.query(`SELECT licensing.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0]?.result;});
 const user=(who,fn,args=[])=>call(who,'authenticated',fn,args);const server=(fn,args=[])=>call(null,'service_role',fn,args);
 try{
  await db.exec("CREATE SCHEMA auth;CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claims',true),'')::jsonb $$;GRANT USAGE ON SCHEMA auth TO authenticated;");
  for(const id of [admin,owner,other])await db.query('INSERT INTO auth.users VALUES($1,$2,now())',[id,id+'@example.test']);
  for(const file of (await readdir('licensing-server-local/supabase/migrations')).filter(n=>n.endsWith('.sql')).sort())await db.exec(await readFile('licensing-server-local/supabase/migrations/'+file,'utf8'));
  await db.query('INSERT INTO licensing_private.platform_admins(user_id) VALUES($1)',[admin]);
  const lic=await user(admin,'admin_create_license',[owner,'Teste assinatura','farm','monthly',1000,0,randomUUID()]);await user(admin,'admin_set_test_mode',[lic,true,randomUUID()]);const request=randomUUID();
  await user(owner,'reserve_checkout',[lic,request,'sandbox']);await server('claim_checkout',[owner,request]);await server('finish_checkout',[owner,request,'checkout_sub_test']);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS d")).rows[0].d;
  const past=(await db.query("SELECT ($1::date-1)::text AS d",[today])).rows[0].d;const future=(await db.query("SELECT ($1::date+interval '1 month')::date::text AS d",[today])).rows[0].d;
  let sub={id:'sub_fixture',customer:'cus_fixture',amount_minor:1000,cycle:'MONTHLY',checkout_id:'checkout_sub_test',reference:lic+':'+request};
  const pay=(id,amount,due)=>({id,subscription:sub.id,customer:sub.customer,amount_minor:amount,status:'RECEIVED',due_on:due,paid_on:today,checkout_id:sub.checkout_id,deleted:false,has_refund:false});
  const reconcile=async p=>{const event='evt_'+randomUUID();await server('ingest_asaas_event',['sandbox',{id:event,event:'PAYMENT_RECEIVED',payment:{id:p.id}}]);const j=await server('claim_billing_event',['sandbox',event]);return server('apply_canonical_payment',['sandbox',event,j.lease,request,p,sub]);};
  await reconcile(pay('pay_original',1000,past));
  await assert.rejects(user(owner,'quote_extras',[lic,1]),/EXTRA_PRICE_NOT_CONFIGURED/);
  await assert.rejects(user(owner,'admin_set_extra_price',['farm','monthly',500,randomUUID()]),/PLATFORM_ADMIN_REQUIRED/);
  await user(admin,'admin_set_extra_price',['farm','monthly',500,randomUUID()]);
  const withExtra=await user(admin,'admin_create_license',[owner,'Plano com adicional inicial','farm','monthly',1500,1,randomUUID()]);assert.equal((await db.query('SELECT extra_unit_minor FROM licensing.licenses WHERE id=$1',[withExtra])).rows[0].extra_unit_minor,500);
  const quote=await user(owner,'quote_extras',[lic,1]);assert.equal(quote.amount_minor,1500);assert.equal(quote.devices,8);assert.equal(quote.users,5);
  await assert.rejects(user(owner,'request_extra_change',[lic,1,1,randomUUID()]),/EXTRA_QUOTE_CHANGED/);
  await assert.rejects(user(other,'request_extra_change',[lic,1,1500,randomUUID()]),/OWNER_REQUIRED/);
  const key=randomUUID(),change=await user(owner,'request_extra_change',[lic,1,1500,key]);assert.equal(await user(owner,'request_extra_change',[lic,1,1500,key]),change);
  await assert.rejects(user(owner,'request_extra_change',[lic,2,2000,randomUUID()]),/duplicate key/);
  const job=await server('claim_subscription_change',['sandbox']);assert.equal(job.id,change);assert.equal(await server('claim_billing_event',['sandbox',null]),null);
  await assert.rejects(server('prepare_subscription_change',[change,randomUUID(),future]),/STALE_SUBSCRIPTION_LEASE/);
  await server('prepare_subscription_change',[change,job.lease,future]);await server('finish_subscription_change',[change,job.lease,'done',null]);sub={...sub,amount_minor:1500};
  assert.equal((await db.query('SELECT extras FROM licensing.licenses WHERE id=$1',[lic])).rows[0].extras,0,'Request alone cannot release paid seats');
  await reconcile(pay('pay_original',1000,past));
  const ctx=await server('billing_payment_context',['sandbox',sub.id,null,null,past]);assert.equal(ctx.amount_minor,1000);assert.equal(ctx.subscription_amount_minor,1500,'Old invoice retains old price while subscription has new value');
  await reconcile(pay('pay_future',1500,future));assert.equal((await db.query('SELECT extras FROM licensing.licenses WHERE id=$1',[lic])).rows[0].extras,0,'Paid future extra waits for effective date');
  // Avança somente a versão de preço do fixture para simular o início do período.
  await db.query('UPDATE licensing_private.billing_price_versions SET effective_on=$1 WHERE change_id=$2',[today,change]);
  await reconcile(pay('pay_effective',1500,today));assert.equal((await db.query('SELECT extras FROM licensing.licenses WHERE id=$1',[lic])).rows[0].extras,1);
  await reconcile({...pay('pay_effective',1500,today),has_refund:true});assert.equal((await db.query('SELECT extras FROM licensing.licenses WHERE id=$1',[lic])).rows[0].extras,0,'Refund removes paid extra capacity without losing records');
  await reconcile(pay('pay_effective',1500,today));assert.equal((await db.query('SELECT extras FROM licensing.licenses WHERE id=$1',[lic])).rows[0].extras,1);
  const reduction=await user(owner,'request_extra_change',[lic,0,1000,randomUUID()]);const reduceJob=await server('claim_subscription_change',['sandbox']);assert.equal(reduceJob.id,reduction);await server('prepare_subscription_change',[reduction,reduceJob.lease,'2099-01-01']);await server('finish_subscription_change',[reduction,reduceJob.lease,'done',null]);
  assert.equal((await db.query('SELECT extras FROM licensing.licenses WHERE id=$1',[lic])).rows[0].extras,0,'Cancelled quota removes capacity and schedules lower recurring price');
  await user(owner,'owner_license_action',[lic,'cancel',randomUUID()]);const stop=await server('claim_subscription_change',['sandbox']);assert.equal(stop.action,'suspend');await server('finish_subscription_change',[stop.id,stop.lease,'done',null]);
  assert.equal((await db.query('SELECT status FROM licensing.licenses WHERE id=$1',[lic])).rows[0].status,'cancelled');
  await assert.rejects(user(owner,'claim_subscription_change',['sandbox']),/permission denied/);
 }finally{await db.close();}
});
test('processor verifies suspension and handles lost responses through read-before-write without creating subscriptions',async()=>{
 const job={id:randomUUID(),lease:randomUUID(),action:'suspend',subscription_id:'sub_test',customer_id:'cus_test',period:'monthly'};let status='ACTIVE',writes=0,finished;
 const provider={getSubscription:async()=>({id:'sub_test',customer:'cus_test',cycle:'MONTHLY',status}),suspendSubscription:async()=>{writes++;status='INACTIVE';throw Error('fetch failed');}};
 const worker=createSubscriptionProcessor({claim:async()=>job,prepare:async()=>{},finish:async(...args)=>{finished=args;},provider});assert.equal((await worker()).state,'failed');assert.equal(finished[2],'failed');assert.equal((await worker()).state,'processed');assert.equal(writes,1);assert.equal(finished[2],'done');
 const extras={...job,action:'extras',target_minor:1500,current_minor:1000,effective_on:'2026-12-22'};let prepared=false;
 const extraWorker=createSubscriptionProcessor({claim:async()=>extras,prepare:async()=>{prepared=true;},finish:async()=>{},provider:{getSubscription:async()=>({id:'sub_test',customer:'cus_test',cycle:'MONTHLY',status:'ACTIVE',value:15,nextDueDate:'2026-12-22'}),updateSubscriptionValue:async()=>{throw Error('Must not write twice');}}});assert.equal((await extraWorker()).state,'processed');assert.equal(prepared,true);
 assert.throws(()=>createSubscriptionProcessor({environment:'production'}),/INVALID_SUBSCRIPTION_ENVIRONMENT/);
});
