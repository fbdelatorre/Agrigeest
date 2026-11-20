import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const schema=await readFile('licensing-sandbox/schema.sql','utf8');
const seed=await readFile('licensing-sandbox/seed.sql','utf8');
const lifecycle=await readFile('licensing-sandbox/lifecycle.sql','utf8');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('licensing prototype refuses initialization without the local sandbox marker',async()=>{
  const db=new PGlite();
  try {await assert.rejects(db.exec(schema),/SANDBOX_MARKER_REQUIRED/);await assert.rejects(db.exec(lifecycle),/SANDBOX_MARKER_REQUIRED/);}
  finally {await db.close();}
});

test('local database enforces farm membership, role capabilities, invitation identity and preservation',async()=>{
  const db=new PGlite();
  const as=(user,sql,args=[])=>db.transaction(async tx=>{
    await tx.exec('SET LOCAL ROLE license_lab_client');
    await tx.query("SELECT set_config('license_lab.actor',$1,true)",[user?id(user):'']);
    return (await tx.query(sql,args)).rows;
  });
  const stock=async n=>Number((await db.query('SELECT quantity FROM license_lab.products WHERE id=$1',[id(n)])).rows[0].quantity);
  try {
    await db.exec("SELECT set_config('agrigest.licensing_sandbox','synthetic-only-v1',false)");
    await db.exec(schema);await db.exec(seed);await db.exec(lifecycle);
    assert.equal((await as(1,'SELECT * FROM license_lab.farms')).length,1);
    assert.equal((await as(1,'SELECT * FROM license_lab.products WHERE farm_id=$1',[id(102)])).length,0);
    assert.equal((await as(2,'SELECT * FROM license_lab.reports WHERE farm_id=$1',[id(101)])).length,0);
    assert.equal((await as(null,'SELECT * FROM license_lab.farms')).length,0);
    const parallel=await Promise.all(Array.from({length:12},(_,index)=>as(index%2?1:2,'SELECT farm_id FROM license_lab.products')));
    parallel.forEach((rows,index)=>assert.deepEqual(rows.map(row=>row.farm_id),[id(index%2?101:102)]));
    await assert.rejects(as(2,"INSERT INTO license_lab.reports(farm_id,area_id,author_id,observed_on,stage,description) VALUES($1,$2,$3,CURRENT_DATE,'V1','Invasão')",[id(101),id(201),id(2)]),/row-level security|READ_ONLY_LICENSE/);
    // Every full operational role can apply; monitor and consultant cannot.
    for(const user of [1,3,4]) await as(user,'SELECT license_lab.apply_operation($1,$2,$3,1)',[id(101),id(201),id(301)]);
    assert.equal(await stock(301),97);
    await assert.rejects(as(1,'SELECT license_lab.apply_operation($1,$2,$3,1)',[id(101),id(201),id(302)]),/PRODUCT_FORBIDDEN/);
    assert.equal(await stock(302),200);
    for(const table of ['products','applications','recommendations','audit']) assert.equal((await as(5,`SELECT * FROM license_lab.${table}`)).length,0);
    const report=(await as(5,"INSERT INTO license_lab.reports(farm_id,area_id,author_id,observed_on,stage,description) VALUES($1,$2,$3,CURRENT_DATE,'V4','Relatório da monitora') RETURNING id",[id(101),id(201),id(5)]))[0].id;
    assert.equal((await as(5,"UPDATE license_lab.reports SET stage='V5' WHERE id=$1 RETURNING id",[report])).length,1);
    assert.equal((await as(5,"UPDATE license_lab.reports SET stage='V9' WHERE id=$1 RETURNING id",[id(401)])).length,0);
    assert.equal((await as(5,'DELETE FROM license_lab.reports WHERE id=$1 RETURNING id',[id(401)])).length,0);
    await assert.rejects(as(5,"UPDATE license_lab.reports SET author_id=$1 WHERE id=$2",[id(1),report]),/IMMUTABLE_SCOPE/);
    await assert.rejects(as(5,"INSERT INTO license_lab.reports(farm_id,area_id,author_id,observed_on,stage,description) VALUES($1,$2,$3,CURRENT_DATE,'V4','Autor falso')",[id(101),id(201),id(1)]),/row-level security|READ_ONLY_LICENSE/);
    await assert.rejects(as(5,"INSERT INTO license_lab.rainfall(farm_id,area_id,author_id,observed_on,millimeters) VALUES($1,$2,$3,CURRENT_DATE,10)",[id(101),id(202),id(5)]),/foreign key/);
    await as(5,'INSERT INTO license_lab.rainfall(farm_id,area_id,author_id,observed_on,millimeters) VALUES($1,$2,$3,CURRENT_DATE,25)',[id(101),id(201),id(5)]);
    await assert.rejects(as(5,'SELECT license_lab.apply_operation($1,$2,$3,1)',[id(101),id(201),id(301)]),/APPLICATION_FORBIDDEN/);
    await assert.rejects(as(5,'UPDATE license_lab.products SET quantity=999'),/permission denied/);
    await assert.rejects(as(5,"INSERT INTO license_lab.recommendations(farm_id,area_id,report_id,author_id,product_id,dose,description) VALUES($1,$2,$3,$4,$5,1,'Sem permissão')",[id(101),id(201),report,id(5),id(301)]),/row-level security|READ_ONLY_LICENSE/);
    await assert.rejects(as(5,"INSERT INTO license_lab.audit(farm_id,action,record_id) VALUES($1,'FORGED','test')",[id(101)]),/permission denied/);
    await assert.rejects(as(5,"UPDATE license_lab.memberships SET role='owner'"),/permission denied/);
    await assert.rejects(as(3,"SELECT license_lab.invite($1,'fabio@example.test','consultant')",[id(101)]),/OWNER_REQUIRED/);
    await assert.rejects(as(1,"SELECT license_lab.invite($1,'fabio@example.test','owner')",[id(101)]),/INVALID_ROLE/);
    const invite=(await as(1,"SELECT license_lab.invite($1,'fabio@example.test','consultant') AS id",[id(101)]))[0].id;
    await assert.rejects(as(1,"SELECT license_lab.invite($1,'fabio@example.test','consultant')",[id(101)]),/INVITATION_PENDING/);
    await assert.rejects(as(7,'SELECT license_lab.accept_invitation($1)',[invite]),/INVITATION_FORBIDDEN/);
    assert.equal((await as(7,'SELECT * FROM license_lab.inbox()')).length,0);
    assert.equal((await as(6,'SELECT * FROM license_lab.inbox()'))[0].farm_name,'Fazenda Aurora · fictícia');
    await as(6,'SELECT license_lab.accept_invitation($1)',[invite]);
    await assert.rejects(as(6,'SELECT license_lab.accept_invitation($1)',[invite]),/INVITATION_UNAVAILABLE/);
    assert.equal((await as(6,'SELECT * FROM license_lab.farms')).length,2);
    assert.equal((await as(6,'SELECT * FROM license_lab.products WHERE farm_id=$1',[id(102)])).length,0);
    // Fábio owns Cedro, but that does not grant full access to Aurora.
    assert.equal((await as(6,'SELECT license_lab.role_at($1) AS role',[id(101)]))[0].role,'consultant');
    await assert.rejects(as(6,'SELECT license_lab.apply_operation($1,$2,$3,1)',[id(101),id(201),id(301)]),/APPLICATION_FORBIDDEN/);
    await as(6,'SELECT license_lab.apply_operation($1,$2,$3,1)',[id(103),id(203),id(303)]);
    await as(6,'INSERT INTO license_lab.recommendations(farm_id,area_id,report_id,author_id,product_id,dose,description) VALUES($1,$2,$3,$4,$5,1,\'Teste fictício\')',[id(101),id(201),report,id(6),id(301)]);
    assert.equal(await stock(301),97,'Recommendation must not debit inventory');
    await assert.rejects(as(5,'DELETE FROM license_lab.reports WHERE id=$1',[report]),/foreign key/);
    await assert.rejects(as(6,'INSERT INTO license_lab.recommendations(farm_id,area_id,report_id,author_id,product_id,dose,description) VALUES($1,$2,$3,$4,$5,1,\'Outra fazenda\')',[id(101),id(201),report,id(6),id(302)]),/foreign key/);
    await assert.rejects(as(6,"INSERT INTO license_lab.recommendations(farm_id,area_id,report_id,author_id,product_id,dose,description) VALUES($1,$2,$3,$4,$5,'NaN','Dose inválida')",[id(101),id(201),report,id(6),id(301)]),/check constraint/);
    assert.equal((await as(6,'DELETE FROM license_lab.reports WHERE id=$1 RETURNING id',[report])).length,0);
    await as(1,'SELECT license_lab.revoke_member($1,$2)',[id(101),id(6)]);
    assert.equal((await as(6,'SELECT * FROM license_lab.products WHERE farm_id=$1',[id(101)])).length,0);
    assert.equal((await db.query('SELECT * FROM license_lab.recommendations')).rows.length,1,'Revocation preserves business records');
    await assert.rejects(as(1,'SELECT license_lab.revoke_member($1,$2)',[id(101),id(1)]),/OWNER_IMMUTABLE/);
    const expired=(await as(1,"SELECT license_lab.invite($1,'gabriel@example.test','consultant') AS id",[id(101)]))[0].id;
    await db.query("UPDATE license_lab.invitations SET expires_at=now()-interval '1 second' WHERE id=$1",[expired]);
    await assert.rejects(as(7,'SELECT license_lab.accept_invitation($1)',[expired]),/INVITATION_UNAVAILABLE/);
    const revoked=(await as(2,"SELECT license_lab.invite($1,'gabriel@example.test','consultant') AS id",[id(102)]))[0].id;
    await as(2,'SELECT license_lab.revoke_invitation($1)',[revoked]);
    await assert.rejects(as(7,'SELECT license_lab.accept_invitation($1)',[revoked]),/INVITATION_UNAVAILABLE/);
    assert.ok((await as(1,'SELECT * FROM license_lab.audit')).length>0);
    assert.equal((await as(6,'SELECT * FROM license_lab.audit WHERE farm_id=$1',[id(101)])).length,0);
  } finally {await db.close();}
});

test('sandbox packaging is separate from production and has no production network capability',async()=>{
  const config=JSON.parse(await readFile('licensing-sandbox/src-tauri/tauri.conf.json','utf8'));
  const production=JSON.parse(await readFile('src-tauri/tauri.conf.json','utf8'));
  assert.notEqual(config.identifier,production.identifier);
  assert.notEqual(config.productName,production.productName);
  assert.match(config.app.security.csp,/connect-src 'self' ipc: http:\/\/ipc.localhost;/);
  assert.doesNotMatch(config.app.security.csp,/supabase|https:|\*/);
  const rust=await readFile('licensing-sandbox/src-tauri/src/main.rs','utf8');
  assert.doesNotMatch(rust,/field_store|invoke_handler|\.plugin\(/);
  const adapter=await readFile('licensing-sandbox/src/database.ts','utf8');
  assert.doesNotMatch(adapter,/VITE_SUPABASE|createClient|https?:\/\//);
  assert.match(adapter,/idb:\/\/agrigest-licensing-lab-v1/);
});
