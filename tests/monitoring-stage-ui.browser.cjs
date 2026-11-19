const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('../checks.local/node_modules/playwright-core');
const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'};
const server = http.createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  try { res.setHeader('Content-Type',mime[path.extname(pathname)] ?? 'text/html');res.end(await fs.readFile(path.join('dist-audit-test.local',pathname.includes('.') ? pathname : '/index.html'))); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const browser = await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext({viewport:{width:1400,height:1000},serviceWorkers:'block'});
    const time='2026-11-19T12:00:00Z';
    const session={access_token:'test-token',refresh_token:'test-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,
      user:{id:'stage-user',email:'stage@example.test',aud:'authenticated',app_metadata:{},user_metadata:{}}};
    const geometry={type:'Polygon',coordinates:[[[-50,-20],[-49.99,-20],[-49.99,-19.99],[-50,-19.99],[-50,-20]]]};
    const areas=[['Z','Zebra'],['A10','Área 10'],['A2','Área 2']].map(([id,name]) => ({id,name,size:10,unit:'hectare',geometry,created_at:time,updated_at:time}));
    const base={institution_id:'stage-farm',season_id:'current',created_by:'stage-user',created_at:time};
    let reports=[
      {...base,id:'recent',area_id:'A2',observed_on:'2026-11-15',created_at:'2026-11-15T12:00:00Z',phenological_stage:'R1',report:'Monitoramento recente'},
      {...base,id:'backdated',area_id:'A2',observed_on:'2026-11-01',phenological_stage:'V2',report:'Monitoramento antigo lançado depois'},
      {...base,id:'oldest',area_id:'A10',observed_on:'2026-10-01',phenological_stage:'V1',report:'Monitoramento mais antigo'},
      {...base,id:'past',area_id:'Z',season_id:'past',observed_on:'2026-12-31',phenological_stage:'R9',report:'Safra anterior'},
      ...Array.from({length:501},(_,index) => ({...base,id:'filler-'+String(index).padStart(4,'0'),area_id:'A2',observed_on:'2026-11-14',phenological_stage:'V7',report:'Intermediário '+index})),
    ];
    let metadataPages=0;
    await context.addInitScript(session => localStorage.setItem('sb-agrigest-test-auth-token',JSON.stringify(session)),session);
    await context.route('**/*',async route => {
      const req=route.request(),url=new URL(req.url());
      if(url.hostname==='127.0.0.1') return route.continue();
      if(url.hostname!=='agrigest-test.invalid') return route.abort();
      const endpoint=url.pathname.split('/').at(-1),headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
      if(req.method()==='OPTIONS') return route.fulfill({status:204,headers});
      if(endpoint==='mutate_business_record') {
        const body=req.postDataJSON();assert.equal(body.p_table,'field_monitoring_reports');
        const row=reports.find(row => row.id===body.p_id);assert.ok(row);
        if(body.p_action==='delete') {reports=reports.filter(row => row.id!==body.p_id);return route.fulfill({headers,json:{deleted:true}});}
        Object.assign(row,body.p_changes);return route.fulfill({headers,json:row});
      }
      if(endpoint==='field_monitoring_reports') {
        const season=(url.searchParams.get('season_id') ?? 'eq.current').slice(3);
        let rows=reports.filter(row => row.season_id===season);
        const area=url.searchParams.get('area_id');if(area) rows=rows.filter(row => row.area_id===area.slice(3));
        const ascending=url.searchParams.get('order')?.startsWith('observed_on.asc');
        rows.sort((a,b) => (ascending ? 1 : -1)*(a.observed_on.localeCompare(b.observed_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)));
        const offset=Number(url.searchParams.get('offset') ?? 0),limit=Number(url.searchParams.get('limit') ?? 30),total=rows.length;
        rows=rows.slice(offset,offset+limit);
        if(url.searchParams.get('select')!=='*') metadataPages++;
        return route.fulfill({headers:{...headers,'content-range':`${offset}-${offset+rows.length-1}/${total}`},json:rows});
      }
      const fixtures={user:session.user,user_profiles:{id:'stage-user',first_name:'Operador',last_name:'Teste',institution:'Fazenda',institution_id:'stage-farm',is_admin:true},areas,
        seasons:[{id:'current',name:'Safra atual',status:'active',start_date:'2026-01-01'},{id:'new',name:'Nova safra',status:'planned',start_date:'2027-01-01'}],
        get_area_map_summary:areas.map(area => ({area_id:area.id,area_name:area.name,area_size:10,area_unit:'hectare',geojson:JSON.stringify(geometry)})),
      };
      return route.fulfill({headers,json:fixtures[endpoint] ?? []});
    });
    const page=await context.newPage();page.setDefaultTimeout(12000);page.on('dialog',dialog => dialog.accept());
    const errors=[];page.on('pageerror',error => errors.push(error.message));
    const origin='http://127.0.0.1:'+server.address().port;
    await page.goto(origin+'/areas');
    const titles=page.locator('h3');
    await page.getByText('R1',{exact:true}).waitFor();
    await page.getByText('V1',{exact:true}).waitFor();
    assert.deepEqual(await titles.allTextContents(),['Área 2','Área 10','Zebra']);
    assert.ok(metadataPages>=2,'The field on a later metadata page must not be omitted');
    assert.equal(await page.getByText('R9',{exact:true}).count(),0);
    const choose=async(label,option) => {await page.getByRole('combobox',{name:label,exact:true}).fill(option);await page.getByRole('option',{name:option,exact:true}).click();};
    await choose('Ordenar áreas','Nome: Z–A');
    assert.deepEqual(await titles.allTextContents(),['Zebra','Área 10','Área 2']);
    await choose('Safra selecionada','Nova safra');
    await page.waitForFunction(() => [...document.querySelectorAll('p')].filter(p=>p.textContent==='Não informado nesta safra').length===3);
    assert.equal(await page.getByText('R1',{exact:true}).count(),0);
    await choose('Safra selecionada','Safra atual');
    await page.getByText('R1',{exact:true}).waitFor();
    await page.goto(origin+'/monitoring');
    await page.getByText('Monitoramento recente',{exact:true}).waitFor();
    assert.equal((await page.getByRole('article').allTextContents())[0].includes('Monitoramento recente'),true);
    await choose('Ordenar monitoramentos','Data: mais antigos primeiro');
    await page.getByText('Monitoramento mais antigo',{exact:true}).waitFor();
    assert.equal((await page.getByRole('article').allTextContents())[0].includes('Monitoramento mais antigo'),true);
    await choose('Ordenar monitoramentos','Data: mais recentes primeiro');
    const card=page.getByRole('article').filter({has:page.getByText('Monitoramento recente',{exact:true})});
    await card.getByRole('button',{name:'Editar',exact:true}).click();
    const editor=page.getByRole('form',{name:'Editar registro'});
    await editor.getByLabel('Estádio fenológico',{exact:true}).fill('R2');
    await editor.getByRole('button',{name:'Salvar alterações'}).click();
    await page.getByRole('form',{name:'Editar registro'}).waitFor({state:'hidden'});
    await page.goto(origin+'/areas');await page.getByText('R2',{exact:true}).waitFor();
    await page.goto(origin+'/farm-map?area=A2');
    await page.getByText('R2',{exact:true}).first().waitFor();
    await page.getByText('Último monitoramento: 15/11/2026',{exact:false}).first().waitFor();
    await page.goto(origin+'/monitoring');
    await page.getByRole('article').filter({has:page.getByText('Monitoramento recente',{exact:true})}).getByRole('button',{name:'Excluir',exact:true}).click();
    await page.getByText('Monitoramento recente',{exact:true}).waitFor({state:'hidden'});
    await page.goto(origin+'/areas');await page.getByText('V7',{exact:true}).waitFor();
    assert.equal(await page.getByText('R2',{exact:true}).count(),0);
    // Read the edited/deleted stage cache without network; no deleted stage returns.
    await context.setOffline(true);
    await page.getByRole('navigation').getByRole('link',{name:'Monitoramento',exact:true}).click();
    await page.getByRole('navigation').getByRole('link',{name:'Áreas de Cultivo',exact:true}).click();
    await page.getByText('V7',{exact:true}).waitFor();
    assert.equal(await page.getByText('R2',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: latest observed stage across pagination, A–Z/Z–A fields, season isolation, both report date orders, edited map details, deletion fallback and offline cache');
  } finally {await browser.close();server.close();}
})().catch(error => {console.error(error);process.exitCode=1;server.close();});
