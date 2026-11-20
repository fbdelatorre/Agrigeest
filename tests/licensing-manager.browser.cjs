const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('../checks.local/node_modules/playwright-core');
(async()=>{
 const csp=JSON.parse(await fs.readFile('licensing-manager/src-tauri/tauri.conf.json','utf8')).app.security.csp;
 const server=http.createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Security-Policy',csp);try{res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(path.join('licensing-manager/dist.local',p.includes('.')?p:'/index.html')));}catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(15000);page.on('dialog',dialog=>dialog.accept());
  const errors=[],external=[],commands=[];let signedEmail='',free=false;
  page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  page.on('request',req=>{if(/^https?:/.test(req.url())&&!req.url().startsWith(origin+'/')&&!req.url().startsWith('http://127.0.0.1:55321/'))external.push(req.url());});
  const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const jwt=payload=>b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload)+'.fictitious-test-signature';
  const owner='20000000-0000-4000-8000-000000000001',license='20000000-0000-4000-8000-000000000101';
  await page.route('http://127.0.0.1:55321/**',async route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   const fulfill=body=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify(body)});
   if(url.pathname==='/auth/v1/token'){
    signedEmail=JSON.parse(req.postData()).email;
    return fulfill({access_token:jwt({sub:owner,role:'authenticated',aal:'aal2',exp:Math.floor(Date.now()/1000)+3600}),refresh_token:'fictitious-refresh-token',token_type:'bearer',expires_in:3600,user:{id:owner,email:signedEmail,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});
   }
   if(url.pathname==='/auth/v1/logout')return fulfill({});
   if(url.pathname.endsWith('/manager_access'))return fulfill({authorized:signedEmail==='manager@example.test',can_manage:signedEmail==='manager@example.test'});
   if(url.pathname.endsWith('/admin_accounts'))return fulfill([{id:owner,email:'owner@example.test'}]);
   if(url.pathname.endsWith('/admin_set_license')){commands.push(JSON.parse(req.postData()));free=true;if(commands.length===1)return route.abort('failed');return fulfill(null);}
   if(url.pathname.endsWith('/licenses'))return fulfill([{id:license,label:'Empresa para validação',owner_id:owner,kind:'farm',period:'monthly',status:'pending',extras:0,amount_minor:0,complimentary:free,valid_until:null}]);
   if(url.pathname.endsWith('/payments')||url.pathname.endsWith('/events'))return fulfill([]);
   throw Error('Unexpected mock API request: '+url.pathname);
  });
  await page.goto(origin);
  const setup=page.getByRole('form',{name:'Configurar conexão'});
  await setup.getByLabel('Chave pública',{exact:true}).fill('sb_secret_NEVER_USE_PRIVATE_KEYS_HERE');await setup.getByRole('button',{name:'Salvar conexão pública'}).click();
  await page.getByRole('alert').filter({hasText:'Chave administrativa recusada'}).waitFor();
  await setup.getByLabel('Chave pública',{exact:true}).fill(jwt({role:'anon',exp:Math.floor(Date.now()/1000)+3600}));
  await setup.getByRole('button',{name:'Salvar conexão pública'}).click();
  const login=page.getByRole('form',{name:'Acesso administrativo'});
  await login.getByLabel('Email',{exact:true}).fill('manager@example.test');await login.getByLabel('Senha',{exact:true}).fill('Fictitious-password-only');await login.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('button',{name:'Licenças e cortesias',exact:true}).waitFor();
  await page.getByRole('button').filter({hasText:'Empresa para validação'}).click();
  const grant=page.locator('form').filter({has:page.getByRole('heading',{name:'Conceder ou renovar licença gratuita',exact:true})});
  await grant.getByLabel('Motivo',{exact:true}).fill('Cortesia validada na interface');await grant.getByRole('button',{name:'Conceder cortesia',exact:true}).click();
  await page.getByRole('alert').waitFor();
  await grant.getByRole('button',{name:'Conceder cortesia',exact:true}).click();
  await page.getByText('Licença atualizada no servidor.',{exact:true}).waitFor();
  assert.equal(commands.length,2);assert.equal(commands[0].p_action,'grant_free');assert.equal(commands[0].p_id,license);assert.equal(commands[1].p_request,commands[0].p_request,'Retry after a lost response must reuse the request identity');
  await page.screenshot({path:'checks.local/license-manager-preview.png',fullPage:true});
  await page.getByRole('button',{name:'Sair',exact:true}).click();await login.waitFor();
  await login.getByLabel('Email',{exact:true}).fill('employee@example.test');await login.getByLabel('Senha',{exact:true}).fill('Fictitious-password-only');await login.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('heading',{name:'Acesso não autorizado',exact:true}).waitFor();
  assert.equal(await page.getByText('Empresa para validação',{exact:true}).count(),0);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('PASS: manager native CSP, private-key rejection, server-verified access flow, courtesy RPC, signout isolation and zero external requests (mock HTTP only)');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
