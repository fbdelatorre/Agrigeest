import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { groupOperationUsage } from '../src/utils/operationStock.ts';
import { calculateAreaCost, areaInHectares, calculateUsageCost } from '../src/utils/costCalculation.ts';

test('field costs weight partial applications and hectare summaries convert units', () => {
  const area = { size:100,unit:'hectare' };
  const operation = { operationSize:10,productsUsed:[{productId:'P',quantity:10,unitPriceSnapshot:10}] };
  const costs = calculateAreaCost([operation,operation],area,()=>undefined);
  assert.equal(costs.totalSpent,200);
  assert.equal(costs.costPerHectare,2);
  assert.equal(areaInHectares(10000,'squareMeter'),1);
  assert.equal(areaInHectares(1,'acre'),0.40468564224);
  assert.equal(calculateUsageCost({productId:'P',quantity:1,unitPriceSnapshot:Infinity},()=>undefined).source,'unknown');
});

test('reopening split lots preserves one dose and keeps differently priced snapshots separate', () => {
  const grouped = groupOperationUsage([
    { productId:'P',quantity:6,dose:1,lotId:'L1',unitPriceSnapshot:10 },
    { productId:'P',quantity:4,dose:1,lotId:'L2',unitPriceSnapshot:10 },
  ],10);
  assert.equal(grouped.length,1);
  assert.equal(grouped[0].quantity,10);
  assert.equal(grouped[0].dose,1);
  assert.deepEqual(grouped[0].lotAllocations,[{lotId:'L1',quantity:6},{lotId:'L2',quantity:4}]);
  assert.equal(groupOperationUsage([{productId:'P',quantity:6,dose:1,unitPriceSnapshot:10},{productId:'P',quantity:4,dose:1,unitPriceSnapshot:20}],10).length,2);
  assert.equal(groupOperationUsage([{productId:'P',quantity:15,dose:1}],10)[0].dose,1.5);
});

test('atomic writes preserve stock, isolate institutions, detect conflicts and retain audit evidence', async () => {
  const db = new PGlite();
  const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const tenant=id(1), user=id(2), area=id(3), season=id(4), product=id(5), lot1=id(6), lot2=id(7);
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT current_setting('test.user',true)::uuid$$;
      CREATE TABLE user_profiles(id uuid PRIMARY KEY,institution_id uuid,is_admin boolean);
      CREATE TABLE areas(id uuid PRIMARY KEY,institution_id uuid,name text,size numeric,unit text,location text,description text,updated_at timestamptz DEFAULT now());
      CREATE TABLE seasons(id uuid PRIMARY KEY,institution_id uuid,name text,start_date date,end_date date,description text,updated_at timestamptz DEFAULT now());
      CREATE TABLE products(id uuid PRIMARY KEY,institution_id uuid,name text,unit text,price numeric,quantity_in_stock numeric,updated_at timestamptz DEFAULT now());
      CREATE TABLE product_lots(id uuid PRIMARY KEY,product_id uuid REFERENCES products(id) ON DELETE RESTRICT,lot_number text,quantity numeric,archived_at timestamptz,updated_at timestamptz DEFAULT now());
      CREATE TABLE operations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,user_id uuid,area_id uuid REFERENCES areas(id),season_id uuid REFERENCES seasons(id),
        type text,start_date timestamptz,end_date timestamptz,next_operation_date timestamptz,description text,operated_by text,notes text,products_used jsonb,
        operation_size numeric,yield_per_hectare numeric,seeds_per_hectare numeric,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),
        status text DEFAULT 'active',cancelled_at timestamptz,cancelled_by uuid);
      CREATE TABLE machinery(id uuid PRIMARY KEY,institution_id uuid,name text,description text,model text,year int);
      CREATE TABLE maintenance_types(id uuid PRIMARY KEY,institution_id uuid,name text,description text);
      CREATE TABLE maintenances(id uuid PRIMARY KEY,institution_id uuid,machinery_id uuid,maintenance_type_id uuid,description text,material_used text,date date,machine_hours numeric,cost numeric,notes text);
      CREATE TABLE notes(id uuid PRIMARY KEY,institution_id uuid,title text,content text,note_date date,is_completed boolean,completed_date date);
      CREATE TABLE precision_zones(id uuid PRIMARY KEY,institution_id uuid,name text,campaign text,geometry jsonb);
      CREATE TABLE precision_samples(id uuid PRIMARY KEY,institution_id uuid,zone_id uuid REFERENCES precision_zones(id),label text,lab_code text,status text,responsible text,laboratory text,notes text,collected_at timestamptz,sample_type text,sample_mode text,subsample_count int,depth_from_cm numeric,depth_to_cm numeric);
      CREATE TABLE precision_lab_imports(id uuid PRIMARY KEY,institution_id uuid);
      CREATE TABLE precision_lab_results(id uuid PRIMARY KEY,sample_id uuid REFERENCES precision_samples(id),parameter text,value numeric,original_value text,unit text,method text,material text);
      CREATE TABLE institution_ledger_config(institution_id uuid PRIMARY KEY,opening_balance_complete boolean);
      CREATE TABLE inventory_movements(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),institution_id uuid,product_id uuid,lot_id uuid,lot_number_snapshot text,operation_id uuid,
        movement_group_id uuid,movement_kind text,movement_type text,quantity numeric CHECK(quantity<>0),unit_snapshot text,unit_cost numeric,total_cost numeric,reason text,
        source_type text,reversal_of uuid,idempotency_key text,created_by uuid,notes text,created_at timestamptz DEFAULT now(),effective_at timestamptz DEFAULT now(),UNIQUE(institution_id,idempotency_key));
      GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT ON user_profiles,areas,seasons,products TO authenticated;
      INSERT INTO user_profiles VALUES('${user}','${tenant}',true),('${id(20)}','${id(21)}',false);
      INSERT INTO areas VALUES('${area}','${tenant}','A',100,'hectare','','',now());
      INSERT INTO seasons VALUES('${season}','${tenant}','S','2026-01-01','2026-12-31','',now());
      INSERT INTO products VALUES('${product}','${tenant}','Produto','L',10,100,now());
      INSERT INTO product_lots VALUES('${lot1}','${product}','L1',40,NULL,now()),('${lot2}','${product}','L2',30,NULL,now());
      INSERT INTO institution_ledger_config VALUES('${tenant}',true);
      ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE products ADD COLUMN category text, ADD COLUMN min_stock_level numeric DEFAULT 0, ADD COLUMN supplier text, ADD COLUMN description text, ADD COLUMN user_id uuid, ADD COLUMN created_at timestamptz DEFAULT now();
      ALTER TABLE product_lots ALTER COLUMN id SET DEFAULT gen_random_uuid();
      ALTER TABLE product_lots ADD COLUMN expiration_date date, ADD COLUMN created_at timestamptz DEFAULT now(), ADD COLUMN archived_by uuid;
    `);
    for (const filename of ['20261008172900_adapt_rpcs_for_ledger_dualwrite.sql','20261008174015_create_stock_operations_rpcs.sql',
      '20261009113314_create_receive_and_classify_rpcs.sql','20261008122452_create_update_product_details_rpc.sql.sql',
      '20261117150000_create_field_monitoring_and_rainfall.sql','20261117160000_allow_field_outbox_ids.sql',
      '20261118210000_audited_record_mutations.sql','20261118210100_restore_atomic_stock_accounting.sql',
      '20261118210200_stock_requests_and_audit_report.sql']) {
      await db.exec(await readFile(new URL('../supabase/migrations/' + filename, import.meta.url), 'utf8'));
    }
    await db.query("SELECT set_config('test.user',$1,false)",[user]);
    await db.exec('SET ROLE authenticated');
    const rpc = async (action,payload,key=id(100+Math.floor(Math.random()*100000))) =>
      (await db.query('SELECT write_operation_request($1,$2,$3) result',[key,action,JSON.stringify(payload)])).rows[0].result;
    const payload={area_id:area,season_id:season,type:'pulverizacao',start_date:'2026-11-18T12:00:00Z',description:'Teste',operated_by:'Operador',operation_size:10,
      products_used:[{productId:product,quantity:15,dose:1.5,lotAllocations:[{lotId:lot1,quantity:10},{lotId:null,quantity:5}]}]};
    const balances=async()=>{
      await db.exec('RESET ROLE');
      const values=(await db.query('SELECT quantity_in_stock total,(SELECT quantity FROM product_lots WHERE id=$1) l1,(SELECT quantity FROM product_lots WHERE id=$2) l2 FROM products WHERE id=$3',[lot1,lot2,product])).rows[0];
      await db.exec('SET ROLE authenticated'); return Object.values(values).map(Number);
    };
    const operation=await rpc('create',payload,id(101));
    assert.deepEqual(await balances(),[85,30,30]);
    assert.equal((await rpc('create',payload,id(101))).id,operation.id);
    assert.deepEqual(await balances(),[85,30,30]);
    await assert.rejects(rpc('create',{...payload,description:'Changed'},id(101)),/REQUEST_KEY_REUSED/);
    await assert.rejects(rpc('create',{...payload,products_used:[{productId:product,quantity:30}]}),/INSUFFICIENT_UNTRACKED_STOCK/);
    assert.deepEqual(await balances(),[85,30,30]);
    await assert.rejects(rpc('create',{...payload,products_used:[{productId:product,quantity:10,lotAllocations:[{lotId:lot1,quantity:9}]}]}),/LOT_ALLOCATION_TOTAL_MISMATCH/);
    await db.exec('RESET ROLE');
    await db.query('UPDATE operations SET products_used=$2 WHERE id=$1',[operation.id,JSON.stringify([{productId:product,quantity:15,lotId:lot2}])]);
    await db.exec('SET ROLE authenticated');
    await assert.rejects(rpc('cancel',{id:operation.id}),/LEGACY_STOCK_REVIEW_REQUIRED/);
    assert.deepEqual(await balances(),[85,30,30]);
    await db.exec('RESET ROLE');
    await db.query('UPDATE operations SET products_used=$2 WHERE id=$1',[operation.id,JSON.stringify(operation.products_used)]);
    await db.exec('SET ROLE authenticated');
    const edited=await rpc('update',{...payload,id:operation.id,expected_updated_at:operation.updated_at,
      products_used:[{productId:product,quantity:12,lotId:lot2}]});
    assert.deepEqual(await balances(),[88,40,18]);
    assert.equal(edited.products_used[0].unitPriceSnapshot,10);
    await assert.rejects(rpc('update',{...payload,id:operation.id,expected_updated_at:'2000-01-01'}),/RECORD_CONFLICT/);
    await rpc('cancel',{id:operation.id,expected_updated_at:edited.updated_at});
    assert.deepEqual(await balances(),[100,40,30]);
    await rpc('cancel',{id:operation.id});
    assert.deepEqual(await balances(),[100,40,30]);
    await assert.rejects(rpc('update',{...payload,id:operation.id}),/OPERATION_ALREADY_CANCELLED/);
    const stock = async (method,args,key=id(200000+Math.floor(Math.random()*100000))) =>
      (await db.query('SELECT stock_write_request($1,$2,$3) result',[key,method,JSON.stringify(args)])).rows[0].result;
    const receiptArgs = { p_product_id:product,p_quantity:10,p_lot_id:lot1,p_reason:'Compra teste' };
    await stock('add_inventory_stock',receiptArgs,id(401));
    await stock('add_inventory_stock',receiptArgs,id(401));
    assert.deepEqual(await balances(),[110,50,30]);
    await assert.rejects(stock('add_inventory_stock',{...receiptArgs,p_quantity:20},id(401)),/REQUEST_KEY_REUSED/);
    await assert.rejects(stock('adjust_inventory_stock',{p_product_id:product,p_target_quantity:30,p_reason:'Contagem',p_expected_quantity:29}),/RECORD_CONFLICT/);
    await db.exec('RESET ROLE');
    const entry=(await db.query("SELECT id FROM inventory_movements WHERE movement_type='STOCK_IN' AND product_id=$1 ORDER BY effective_at DESC LIMIT 1",[product])).rows[0].id;
    await db.exec('SET ROLE authenticated');
    const correct = (quantity,key=id(200000+Math.floor(Math.random()*100000))) => db.query('SELECT correct_stock_entry($1,$2,$3,$4)',[key,entry,quantity,'Conferência da nota']);
    await correct(0,id(402)); await correct(0,id(402));
    assert.deepEqual(await balances(),[100,40,30]);
    await assert.rejects(correct(20),/RECORD_CONFLICT/);
    await stock('receive_product_lot',{p_product_id:product,p_quantity:10,p_lot_number:'Novo lote'},id(403));
    const received=await stock('receive_product_lot',{p_product_id:product,p_quantity:10,p_lot_number:'Novo lote'},id(403));
    assert.equal(received.status,'OK');
    await db.exec('RESET ROLE');
    const newLot=(await db.query("SELECT id FROM product_lots WHERE lot_number='Novo lote'")).rows[0].id;
    await db.exec('SET ROLE authenticated');
    await stock('update_product_lot',{p_lot_id:newLot,p_lot_number:'Novo lote corrigido',p_quantity:10,p_expected_quantity:10},id(404));
    await assert.rejects(stock('archive_product_lot',{p_lot_id:newLot}),/LOT_NOT_EMPTY/);
    await assert.rejects(stock('delete_product_lot',{p_lot_id:newLot}),/LOT_HAS_LEDGER_HISTORY/);
    const classified=await stock('create_product_lot',{p_product_id:product,p_lot_number:'Classificado',p_quantity:5},id(405));
    assert.equal(Number(classified.quantity),5);
    await stock('update_product_lot',{p_lot_id:classified.id,p_quantity:0,p_expected_quantity:5},id(406));
    const archived=await stock('archive_product_lot',{p_lot_id:classified.id},id(407));
    assert.ok(archived.archived_at);
    const created=await stock('create_product_with_lots',{p_name:'Outro produto',p_category:'other',p_unit:'kg',p_min_stock_level:1,p_price:8,p_untracked_quantity:12,p_lots:[{lot_number:'Novo',quantity:8}]},id(408));
    assert.equal(Number(created.product.quantity_in_stock),20);
    const renamed=await stock('update_product_details',{p_product_id:created.product.id,p_name:'Outro produto corrigido',p_category:'other',p_unit:'kg',p_min_stock_level:1,p_price:9,p_supplier:null,p_description:null,p_expected_updated_at:created.product.updated_at},id(409));
    assert.equal(renamed.name,'Outro produto corrigido');
    await db.query('SELECT get_write_audit_report()');
    await db.exec('RESET ROLE');
    // Return the isolated fixture to the starting balance for the remaining checks.
    await db.query('DELETE FROM product_lots WHERE id=$1',[newLot]);
    await db.query('UPDATE products SET quantity_in_stock=100 WHERE id=$1',[product]);
    await db.exec('SET ROLE authenticated');
    await db.exec('RESET ROLE');
    assert.equal(Number((await db.query("SELECT COALESCE(sum(quantity),0) net FROM inventory_movements WHERE operation_id=$1",[operation.id])).rows[0].net),0);
    await db.exec('SET ROLE authenticated');
    const rain=id(201), report=id(202), rec=id(203);
    await db.query('INSERT INTO field_rainfall(id,institution_id,season_id,area_id,observed_on,millimeters) VALUES($1,$2,$3,$4,$5,10)',[rain,tenant,season,area,'2026-11-18']);
    const oldRain=(await db.query('SELECT * FROM field_rainfall WHERE id=$1',[rain])).rows[0];
    const mutate=(table,record,action,expected,changes={},key=id(1000+Math.floor(Math.random()*100000)))=>db.query('SELECT mutate_business_record($1,$2,$3,$4,$5,$6) result',[table,record,action,JSON.stringify(expected),JSON.stringify(changes),key]);
    const expected={millimeters:10,observed_on:'2026-11-18',area_id:area};
    await mutate('field_rainfall',rain,'update',expected,{millimeters:20},id(204));
    await mutate('field_rainfall',rain,'update',expected,{millimeters:20},id(204));
    await assert.rejects(mutate('field_rainfall',rain,'update',expected,{millimeters:30}),/RECORD_CONFLICT/);
    await assert.rejects(mutate('field_rainfall',rain,'update',{millimeters:20},{institution_id:id(21)}),/IMMUTABLE_RECORD_SCOPE/);
    await assert.rejects(mutate('field_rainfall',rain,'update',{millimeters:20},{millimeters:-1}),/check constraint/);
    await db.query('INSERT INTO field_monitoring_reports(id,institution_id,season_id,area_id,observed_on,phenological_stage,report) VALUES($1,$2,$3,$4,$5,$6,$7)',[report,tenant,season,area,'2026-11-18','V3','Monitoramento']);
    await db.query('INSERT INTO field_recommendations(id,institution_id,season_id,area_id,report_id,operation_type,products) VALUES($1,$2,$3,$4,$5,$6,$7)',[rec,tenant,season,area,report,'fungicida',JSON.stringify([{productId:product,dose:1}])]);
    assert.deepEqual(await balances(),[100,40,30]);
    await assert.rejects(mutate('field_monitoring_reports',report,'delete',{report:'Monitoramento'}),/RECORD_HAS_DEPENDENCIES/);
    await mutate('field_recommendations',rec,'delete',{operation_type:'fungicida'});
    await mutate('field_monitoring_reports',report,'delete',{report:'Monitoramento'});
    await mutate('field_rainfall',rain,'delete',{millimeters:20}, {},id(205));
    await mutate('field_rainfall',rain,'delete',{millimeters:20}, {},id(205));
    assert.equal((await db.query("SELECT before_data->>'millimeters' value FROM record_audit_events WHERE record_id=$1 AND action='DELETE'",[rain])).rows[0].value,'20.00');
    await assert.rejects(db.query("DELETE FROM record_audit_events"),/permission denied/);
    await assert.rejects(db.query('SELECT * FROM record_write_receipts'),/permission denied/);
    await db.query("SELECT set_config('test.user',$1,false)",[id(20)]);
    await assert.rejects(rpc('create',payload),/AREA_NOT_FOUND_OR_FORBIDDEN/);
    assert.equal((await db.query('SELECT * FROM record_audit_events')).rows.length,0);
    await db.exec('RESET ROLE; SET ROLE anon');
    await assert.rejects(db.query('SELECT write_operation_request($1,$2,$3)',[id(900),'create','{}']),/permission denied/);
  } finally { await db.close(); }
});
