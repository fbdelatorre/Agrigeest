const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../checks.local/node_modules/playwright-core');
const mime = { '.html':'text/html','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json' };
const server = http.createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = path.join('dist-audit-test.local',pathname.includes('.') ? pathname : 'index.html');
  try { res.setHeader('Content-Type',mime[path.extname(file)] ?? 'application/octet-stream'); res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
async function run() {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-unsafe-swiftshader']});
  try {
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    const session={access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,
      user:{id:'user-a',email:'operator@example.test',aud:'authenticated',app_metadata:{},user_metadata:{}}};
    const time='2026-11-18T12:00:00Z';
    const scope={institution_id:'farm-a',season_id:'season-a',area_id:'area-a',created_at:time,created_by:'user-a'};
    let rain=[{...scope,id:'rain-a',observed_on:'2026-11-18',millimeters:12}];
    let reports=[{...scope,id:'report-a',observed_on:'2026-11-18',phenological_stage:'V2',report:'Monitoramento inicial'}];
    let recs=[{...scope,id:'rec-a',report_id:'report-a',operation_type:'fungicida',instructions:'Orientação inicial',products:[{productId:'product-a',name:'Produto A',unit:'L',dose:1}],operation_id:null,executed_at:null,executed_by:null}];
    let total=100;
    let movements=[{id:'movement-a',product_id:'product-a',lot_id:null,lot_number_snapshot:null,movement_type:'STOCK_IN',source_type:'manual',quantity:20,unit_snapshot:'L',created_at:time,reason:'Compra',operation_id:null}];
    let corrected=false, inspected=0;
    let maintenance, maintenanceInserts=0, failedAreaWrites=0, conflicts=0;
    const changes=[];
    const scene={date:'2026-11-06',time:'2026-11-06T13:25:34.061Z',sceneCloud:7.14,scene:'scene-a'};
    const oldIndex={scene,index:'NDVI',resolution:10,imagery:null,valid:100,covered:110,cloudPercent:2,statistics:{mean:.5,min:.1,max:.8,deviation:.1,histogram:[]}};
    await context.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin===origin) return route.continue();
      if(url.hostname!=='agrigest-test.invalid') return route.abort();
      const headers={'access-control-allow-origin':'*','access-control-allow-methods':'*','access-control-allow-headers':'*','content-range':'0-0/1'};
      if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
      const endpoint=url.pathname.split('/').at(-1);
      if(req.method()==='PATCH' && endpoint==='areas') {
        failedAreaWrites++;
        return route.fulfill({status:409,headers,json:{message:'RECORD_CONFLICT',code:'40001'}});
      }
      if(req.method()==='PATCH' && endpoint==='maintenances') {
        const body=req.postDataJSON();
        assert.equal(body.machine_hours,null);assert.equal(body.material_used,null);assert.equal(body.notes,null);
        assert.ok(url.search.includes('updated_at'));
        maintenance={...maintenance,...body};
        return route.fulfill({headers,json:maintenance});
      }
      if(req.method()==='POST') {
        const body=req.postDataJSON();
        if(endpoint==='maintenances') {
          maintenanceInserts++;
          maintenance={...body,created_at:time,updated_at:time};
          assert.equal(body.machine_hours,0);
          return route.fulfill({status:503,headers,json:{message:'Simulated lost acknowledgement'}});
        }
        if(endpoint==='mutate_business_record') {
          assert.match(body.p_request_id,/^[0-9a-f-]{36}$/);
          const rows=body.p_table==='field_rainfall'?rain:body.p_table==='field_monitoring_reports'?reports:recs;
          const index=rows.findIndex(row=>row.id===body.p_id); assert.ok(index>=0);
          if(Object.entries(body.p_expected).some(([key,value])=>JSON.stringify(rows[index][key])!==JSON.stringify(value))) {
            conflicts++;return route.fulfill({status:409,headers,json:{message:'RECORD_CONFLICT',code:'40001'}});
          }
          changes.push(body);
          if(body.p_action==='delete') { rows.splice(index,1); return route.fulfill({headers,json:{deleted:true,id:body.p_id}}); }
          Object.assign(rows[index],body.p_changes);
          if(body.p_table==='field_recommendations') rows[index].products=rows[index].products.map(item=>({...item,name:'Produto A',unit:'L'}));
          return route.fulfill({headers,json:rows[index]});
        }
        if(endpoint==='correct_stock_entry') {
          assert.equal(body.p_movement_id,'movement-a'); assert.equal(body.p_quantity,0); assert.ok(body.p_reason.length>2);
          corrected=true;total-=20;
          return route.fulfill({headers,json:{corrected:true,delta:-20}});
        }
        if(endpoint==='get_write_audit_report') return route.fulfill({headers,json:{stock_discrepancies:[],legacy_nested_operations:[]}});
        if(endpoint==='precision-sentinel') {
          assert.equal(body.action,'inspect');assert.equal(body.area,'area-a');assert.equal(body.time,scene.time);assert.equal(body.index,'NDVI');
          inspected++;return route.fulfill({headers,json:{...oldIndex,statistics:{...oldIndex.statistics,mean:.6}}});
        }
        return route.fulfill({headers,json:[]});
      }
      const fixtures={user:session.user,user_profiles:{id:'user-a',first_name:'Operador',last_name:'Teste',institution:'Fazenda de teste',institution_id:'farm-a',is_admin:true},
        seasons:[{id:'season-a',name:'Safra Atual',status:'active',start_date:'2026-11-01'}],
        areas:[{id:'area-a',name:'Talhão A',size:100,unit:'hectare',geometry:{type:'Polygon',coordinates:[[[-50,-20],[-49.99,-20],[-49.99,-19.99],[-50,-19.99],[-50,-20]]]},created_at:time,updated_at:time}],
        products:[{id:'product-a',name:'Produto A',category:'other',unit:'L',quantity_in_stock:total,min_stock_level:1,price:10,created_at:time,updated_at:time}],
        field_rainfall:rain,field_monitoring_reports:reports,field_recommendations:recs,
        inventory_movements:url.searchParams.has('reversal_of')?(corrected?[{reversal_of:'movement-a'}]:[]):movements,
        record_audit_events:[],precision_samples:[],precision_zones:[],precision_lab_results:[]};
      fixtures.machinery=[{id:'machine-a',institution_id:'farm-a',name:'Trator de teste',created_at:time,updated_at:time}];
      fixtures.maintenance_types=[{id:'type-a',institution_id:'farm-a',name:'Troca de óleo',created_at:time}];
      fixtures.maintenances=maintenance?(url.searchParams.has('id')?maintenance:[maintenance]):[];
      return route.fulfill({headers,json:fixtures[endpoint]??[]});
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.addInitScript(({session,oldIndex})=>{
      if(!localStorage.getItem('sb-agrigest-test-auth-token')) localStorage.setItem('sb-agrigest-test-auth-token',JSON.stringify(session));
      localStorage.setItem('agrigest:v2:user-a:farm-a:precision-sentinel:area-a',JSON.stringify([oldIndex]));
    },{session,oldIndex});
    await page.goto(origin+'/rainfall');
    // Seed sent receipts: later edits/deletions must refresh or hide these copies.
    await page.evaluate(async records=>{
      const db=await new Promise((resolve,reject)=>{
        const opening=indexedDB.open('agrigest-field-data',1);
        opening.onupgradeneeded=()=>opening.result.createObjectStore('field-records',{keyPath:['scope','id']}).createIndex('scope','scope');
        opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error);
      });
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('field-records','readwrite');
        records.forEach(({kind,record})=>tx.objectStore('field-records').put({scope:'user-a:farm-a',id:record.id,userId:'user-a',state:'sent',createdAt:record.created_at,kind,record}));
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      });db.close();
    },[{kind:'rainfall',record:rain[0]},{kind:'report',record:reports[0]},{kind:'recommendation',record:recs[0]}]);
    await page.goto(origin+'/rainfall');
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    const editor=page.getByRole('form',{name:'Editar registro'});
    assert.equal(await editor.getByLabel('Chuva acumulada no dia (mm)',{exact:true}).inputValue(),'12');
    await editor.getByLabel('Chuva acumulada no dia (mm)',{exact:true}).fill('25');
    await editor.getByRole('button',{name:'Salvar alterações'}).click();
    await page.getByText('25 mm',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Excluir',exact:true}).click();
    await page.waitForFunction(()=>!document.body.textContent.includes('25 mm'));
    assert.equal(rain.length,0);
    await context.setOffline(true);
    await page.getByRole('link',{name:'Monitoramento',exact:true}).click();
    await page.getByRole('navigation').getByRole('link',{name:'Pluviometria',exact:true}).click();
    assert.equal(await page.getByText('25 mm',{exact:true}).count(),0,'Deleted sent receipts must not resurrect offline');
    await context.setOffline(false);
    await page.goto(origin+'/monitoring');
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();
    await editor.getByLabel('Estádio fenológico').fill('V4');
    await editor.getByLabel('Relatório de monitoramento').fill('Monitoramento corrigido');
    reports[0]={...reports[0],phenological_stage:'V3'};
    await page.evaluate(()=>{const bus=new BroadcastChannel('agrigest-field:user-a:farm-a');bus.postMessage({synced:true});bus.close()});
    await page.locator('article').first().getByText(/V3/).waitFor();
    await editor.getByRole('button',{name:'Salvar alterações'}).click();
    await page.getByRole('alert').filter({hasText:'Outra pessoa alterou'}).waitFor();
    assert.equal(reports[0].phenological_stage,'V3','A dirty form must not silently overwrite the newer server record');
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();
    await page.getByRole('button',{name:'Editar',exact:true}).first().click();
    await editor.getByLabel('Estádio fenológico').fill('V4');
    await editor.getByLabel('Relatório de monitoramento').fill('Monitoramento corrigido');
    await editor.getByRole('button',{name:'Salvar alterações'}).click();
    await page.getByText('Monitoramento corrigido',{exact:true}).waitFor();
    const recommendation=page.locator('article section');
    await recommendation.getByRole('button',{name:'Editar',exact:true}).click();
    await editor.getByLabel('Dose',{exact:true}).fill('2.5');
    await editor.getByRole('button',{name:'Salvar alterações'}).click();
    await page.getByText(/Produto A · 2,5/).waitFor();
    assert.equal(total,100,'Saving a recommendation must not deduct stock');
    await recommendation.getByRole('button',{name:'Excluir',exact:true}).click();
    await page.waitForFunction(()=>!document.body.textContent.includes('Orientação inicial'));
    await page.getByRole('button',{name:'Excluir',exact:true}).click();
    await page.getByText('Nenhum monitoramento para este filtro.').waitFor();
    await page.goto(origin+'/inventory/history');
    await page.getByRole('button',{name:'Excluir / estornar',exact:true}).click();
    const stockEditor=page.getByRole('form',{name:'Corrigir lançamento de estoque'});
    assert.equal(await stockEditor.getByLabel('Quantidade corrigida (zero para estornar)').inputValue(),'0');
    await stockEditor.getByLabel('Motivo da correção').fill('Compra digitada em duplicidade');
    await stockEditor.getByRole('button',{name:'Confirmar correção'}).click();
    await page.getByText(/Corrigido\/estornado/).waitFor();
    assert.equal(total,80);
    await page.goto(origin+'/precision?area=area-a&tab=history');
    await page.getByRole('button',{name:'Abrir NDVI de 2026-11-06 no mapa'}).click();
    await page.getByRole('heading',{name:/NDVI · 2026-11-06 13:25:34 UTC/}).waitFor();
    assert.equal(inspected,1);
    await page.screenshot({path:'checks.local/audit-history-ui.png',fullPage:true});
    await page.goto(origin+'/audit');
    await page.getByText('Nenhuma divergência de saldo encontrada.').waitFor();
    await page.goto(origin+'/maintenances/new');
    const select=async(label,value)=>{await page.getByRole('combobox',{name:label,exact:true}).fill(value);await page.getByRole('option',{name:value,exact:true}).click()};
    await select('Máquina','Trator de teste');await select(/Tipo de manutenção/i,'Troca de óleo');
    await page.locator('[name="machineHours"]').fill('0');
    await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit()});
    await page.waitForURL('**/maintenances');
    assert.equal(maintenanceInserts,1,'Double submit and lost acknowledgement must create one maintenance');
    await page.getByRole('button',{name:'Editar manutenção'}).click();
    await page.locator('[name="machineHours"]').fill('');
    await page.getByRole('button',{name:'Atualizar Manutenção'}).click();
    await page.waitForURL('**/maintenances');
    assert.equal(maintenance.machine_hours,null);
    await page.goto(origin+'/areas/area-a/edit');
    await page.getByRole('button',{name:'Atualizar Área'}).click();
    await page.waitForFunction(()=>document.querySelector('button[type=submit]')?.disabled===false);
    assert.ok(page.url().endsWith('/areas/area-a/edit'),'A failed save must preserve the edit form');
    assert.equal(failedAreaWrites,1);
    assert.equal(changes.length,6);assert.equal(conflicts,1);assert.deepEqual(errors,[]);
    console.log('PASS: CRUD field records + offline tombstones, no recommendation debit, stock reversal, historical index, audit, idempotent maintenance, clearing optional fields and failed area-save draft preservation');
  } finally {await browser.close();server.close();}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1});
