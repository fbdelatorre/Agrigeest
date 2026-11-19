const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../checks.local/node_modules/playwright-core');
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = http.createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  try {
    const file = path.join('dist-audit-test.local',pathname.includes('.') ? pathname : 'index.html');
    res.setHeader('Content-Type',mime[path.extname(file)] ?? 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const origin = 'http://127.0.0.1:'+server.address().port;
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext({viewport:{width:1280,height:900}});
    let backendAvailable = false;
    const held = [], writes = [], rows = {};
    const session = {access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,
      expires_at:Math.floor(Date.now()/1000)-3600,user:{id:'offline-user',email:'offline@example.test',aud:'authenticated',app_metadata:{},user_metadata:{}}};
    const profile = {id:'offline-user',firstName:'Operador',lastName:'Offline',email:'offline@example.test',institution:'Fazenda offline',institutionId:'offline-farm',isAdmin:false};
    const time = '2026-11-19T12:00:00Z';
    const area = {id:'offline-area',name:'Talhão offline',size:10,unit:'hectare',createdAt:{agriGestDate:time},updatedAt:{agriGestDate:time}};
    const product = {id:'offline-product',name:'Produto offline',unit:'L',category:'pesticide',quantityInStock:100,price:10,createdAt:{agriGestDate:time},updatedAt:{agriGestDate:time}};
    const season = {id:'offline-season',name:'Safra offline',status:'active',start_date:'2026-01-01'};
    await context.route('https://agrigest-test.invalid/**',async route => {
      if (!backendAvailable) { held.push(route); return; }
      await respond(route);
    });
    async function respond(route) {
      const req = route.request(), url = new URL(req.url()), endpoint = url.pathname.split('/').at(-1);
      const headers = {'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*','content-range':'0-0/0'};
      if (req.method()==='OPTIONS') return route.fulfill({status:204,headers});
      if (endpoint==='token') return route.fulfill({headers,json:{...session,expires_at:Math.floor(Date.now()/1000)+3600}});
      if (req.method()==='POST') {
        assert.ok(['field_rainfall','field_monitoring_reports','field_recommendations'].includes(endpoint), 'Unexpected write '+endpoint);
        const body = req.postDataJSON();
        assert.equal(body.institution_id,'offline-farm');
        assert.equal(body.season_id,'offline-season');
        if (endpoint==='field_recommendations') assert.ok(rows[body.report_id], 'Parent report must synchronize first');
        assert.ok(!rows[body.id], 'A local record must not be inserted twice');
        rows[body.id] = {...body,created_by:'offline-user',created_at:time};
        writes.push(endpoint);
        return route.fulfill({status:201,headers,json:[]});
      }
      const fixtures = {
        user:session.user,user_profiles:{...profile,first_name:profile.firstName,last_name:profile.lastName,institution_id:profile.institutionId,is_admin:false},
        areas:[{...area,created_at:time,updated_at:time}],seasons:[season],
        products:[{...product,quantity_in_stock:100,min_stock_level:0,created_at:time,updated_at:time}],
      };
      const fieldRows = Object.values(rows).filter(row => endpoint==='field_rainfall' ? 'millimeters' in row
        : endpoint==='field_monitoring_reports' ? 'report' in row : endpoint==='field_recommendations' ? 'report_id' in row : false);
      return route.fulfill({headers,json:fixtures[endpoint] ?? fieldRows});
    }
    await context.addInitScript(({session,profile,area,product,season}) => {
      if (localStorage.getItem('offline-fixture-ready')) return;
      localStorage.setItem('offline-fixture-ready','1');
      localStorage.setItem('sb-agrigest-test-auth-token',JSON.stringify(session));
      localStorage.setItem('agrigest:v2:profile:offline-user',JSON.stringify(profile));
      const prefix = 'agrigest:v2:offline-user:offline-farm:';
      for (const [key,value] of Object.entries({areas:[area],products:[product],seasons:[season],operations:[],productLots:[],selectedSeasonId:season.id}))
        localStorage.setItem(prefix+key,JSON.stringify(value));
    },{session,profile,area,product,season});
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    // Expired token + hanging refresh + navigator.onLine=true: never block local data.
    await page.goto(origin+'/rainfall');
    assert.equal(await page.evaluate(() => navigator.onLine),true);
    await page.getByRole('heading',{name:'Registrar chuva'}).waitFor({timeout:3000});
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    });
    // Cold offline reopen must use the real PWA cache, not route-served assets.
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading',{name:'Registrar chuva'}).waitFor();
    await page.getByText('Sem conexão. Você pode registrar chuvas, monitoramentos e recomendações neste dispositivo.').waitFor();
    const choose = async (label,option) => {
      await page.getByRole('combobox',{name:label,exact:true}).fill(option);
      await page.getByRole('option',{name:option,exact:true}).click();
    };
    await choose('Talhão','Talhão offline');
    await page.getByLabel('Chuva acumulada no dia (mm)',{exact:true}).fill('17');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    await page.getByText('17 mm',{exact:true}).waitFor();
    await page.getByRole('navigation').getByRole('link',{name:'Monitoramento',exact:true}).click();
    await page.getByRole('button',{name:'Novo monitoramento'}).click();
    await choose('Talhão','Talhão offline');
    await page.getByLabel('Estádio fenológico',{exact:true}).fill('V4');
    await page.getByLabel('Relatório de monitoramento',{exact:true}).fill('Monitoramento criado sem conexão');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    await page.getByText('Monitoramento criado sem conexão',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Recomendar aplicação'}).click();
    await choose('Produto 1','Produto offline');
    await page.getByLabel('Dose (L/ha)',{exact:true}).fill('1.5');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    await page.getByText('Produto offline · 1,5 L/ha',{exact:true}).waitFor();
    await page.reload();
    await page.getByText('Monitoramento criado sem conexão',{exact:true}).waitFor();
    await page.getByText('Produto offline · 1,5 L/ha',{exact:true}).waitFor();
    assert.equal(writes.length,0);
    assert.equal(await page.getByRole('link',{name:'Realizar operação',exact:true}).count(),0);
    // Restore the backend, finish token renewal and synchronize the existing IDs.
    backendAvailable = true;
    await context.setOffline(false);
    for (const route of held.splice(0)) { try { await respond(route); } catch { /* browser canceled an earlier page's request */ } }
    await page.waitForFunction(() => !document.body.textContent.includes('3 aguardando sincronização'));
    await page.getByRole('link',{name:'Realizar operação',exact:true}).waitFor({timeout:20000});
    assert.deepEqual(writes.sort(),['field_monitoring_reports','field_rainfall','field_recommendations']);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('agrigest:v2:offline-user:offline-farm:products'))[0].quantityInStock),100);
    // Removing the auth identity must not reopen another user's cached farm offline.
    await page.evaluate(() => localStorage.removeItem('sb-agrigest-test-auth-token'));
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('heading',{name:'Bem-vindo'}).waitFor();
    assert.equal(await page.getByText('Monitoramento criado sem conexão',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    await context.close();
    // No previous verified profile + stalled backend must offer recovery, never spin forever.
    const fresh = await browser.newContext({serviceWorkers:'block'});
    await fresh.route('https://agrigest-test.invalid/**',route => { held.push(route); });
    await fresh.addInitScript(session => localStorage.setItem('sb-agrigest-test-auth-token',JSON.stringify(session)),session);
    const first = await fresh.newPage();
    await first.goto(origin+'/rainfall');
    await first.getByRole('button',{name:'Tentar novamente',exact:true}).waitFor({timeout:9000});
    assert.equal(await first.getByRole('heading',{name:'Registrar chuva'}).count(),0);
    await first.getByRole('button',{name:'Tentar novamente',exact:true}).click();
    await fresh.setOffline(true);
    await first.getByRole('alert').waitFor();
    assert.equal(await first.getByText('Abrindo o AgriGest…',{exact:true}).count(),0);
    await fresh.close();
    console.log('PASS: expired-session offline cold start, false-online startup, local rainfall/report/recommendation, reload, ordered sync, no stock debit, signed-out isolation and bounded loading');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode=1; server.close(); });
