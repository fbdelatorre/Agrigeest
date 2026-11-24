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
  const errors=[],external=[],commands=[];let signedEmail='',free=false,retried=false,purchaseState='',purchaseRequests=0,checkoutRequests=0;
  page.on('pageerror',e=>errors.push(e.message));
  const origin='http://127.0.0.1:'+server.address().port;
  page.on('request',req=>{if(/^https?:/.test(req.url())&&!req.url().startsWith(origin+'/')&&!req.url().startsWith('http://127.0.0.1:46321/'))external.push(req.url());});
  const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
  const jwt=payload=>b64({alg:'HS256',typ:'JWT'})+'.'+b64(payload)+'.fictitious-test-signature';
  const owner='20000000-0000-4000-8000-000000000001',license='20000000-0000-4000-8000-000000000101';
  await page.route('http://127.0.0.1:46321/**',async route=>{
   const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   const fulfill=body=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':origin},body:JSON.stringify(body)});
   if(url.pathname==='/auth/v1/token'){
    signedEmail=JSON.parse(req.postData()).email;
    return fulfill({access_token:jwt({sub:owner,role:'authenticated',aal:'aal2',exp:Math.floor(Date.now()/1000)+3600}),refresh_token:'fictitious-refresh-token',token_type:'bearer',expires_in:3600,user:{id:owner,email:signedEmail,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}});
   }
   if(url.pathname==='/auth/v1/logout'){assert.equal(url.searchParams.get('scope'),'local','Manager signout must not revoke sessions in the principal app');return fulfill({});}
   if(url.pathname==='/auth/v1/user')return fulfill({id:owner,email:signedEmail,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}});
   if(url.pathname.endsWith('/owner_checkout_requests'))return fulfill(purchaseState?[{id:'purchase-checkout',license_id:'20000000-0000-4000-8000-000000000102',state:'ready',url:purchaseState==='pending'?'https://sandbox.asaas.com/checkoutSession/show?id=checkout_owner_ui':null}]:[]);
   if(url.pathname.endsWith('/quote_plan')){assert.deepEqual(JSON.parse(req.postData()),{p_kind:'farm',p_period:'monthly',p_extras:0});return fulfill({amount_minor:1000,users:4,devices:6});}
   if(url.pathname.endsWith('/start_purchase')){purchaseRequests++;const body=JSON.parse(req.postData());assert.equal(body.p_expected_minor,1000);assert.equal(body.p_environment,'sandbox');assert.equal(body.p_owner,undefined);purchaseState='pending';return fulfill('20000000-0000-4000-8000-000000000102');}
   if(url.pathname==='/functions/v1/asaas-checkout'){checkoutRequests++;assert.equal(req.headers()['x-agrigest-expected-environment'],'sandbox');return fulfill({state:'ready',url:'https://sandbox.asaas.com/checkoutSession/show?id=checkout_owner_ui'});}
   if(url.pathname==='/functions/v1/asaas-check-payment'){assert.deepEqual(JSON.parse(req.postData()),{license_id:'20000000-0000-4000-8000-000000000102'});return fulfill({state:'awaiting_payment',queued:0});}
   if(url.pathname.endsWith('/manager_access'))return fulfill({authorized:signedEmail==='manager@example.test',can_manage:signedEmail==='manager@example.test'});
   if(url.pathname.endsWith('/admin_accounts'))return fulfill([{id:owner,email:'owner@example.test'}]);
   if(url.pathname.endsWith('/admin_checkout_requests'))return fulfill([{id:'checkout-display-test',license_id:license,label:'Empresa para validação',environment:'sandbox',state:'cancelled',amount_minor:1000,period:'monthly',created_at:new Date().toISOString(),provider_id:'fictitious-checkout'}]);
   if(url.pathname.endsWith('/admin_set_license')){commands.push(JSON.parse(req.postData()));free=true;if(commands.length===1)return route.abort('failed');return fulfill(null);}
   if(url.pathname.endsWith('/licenses')){if(url.searchParams.has('owner_id'))assert.equal(url.searchParams.get('owner_id'),'eq.'+owner);return fulfill([{id:license,label:'Empresa para validação',owner_id:owner,kind:'farm',period:'monthly',status:free?'active':'pending',extras:0,amount_minor:0,complimentary:free,valid_until:null},...(purchaseState?[{id:'20000000-0000-4000-8000-000000000102',label:'Minha nova fazenda',owner_id:owner,kind:'farm',period:'monthly',status:purchaseState,extras:0,amount_minor:1000,test_mode:true,valid_until:null}]:[])]);}
   if(url.pathname.endsWith('/payments')||url.pathname.endsWith('/events'))return fulfill([]);
   if(url.pathname.endsWith('/provider_payments'))return fulfill([{environment:'sandbox',payment_id:'pay_test_only',license_id:license,amount_minor:99999,status:'RECEIVED',due_on:'2026-11-21',eligible:true,has_refund:false,verified_at:new Date().toISOString()}]);
   if(url.pathname.endsWith('/provider_audit'))return fulfill([]);
   if(url.pathname.endsWith('/extra_prices'))return fulfill([]);
   if(url.pathname.endsWith('/owner_subscription_changes'))return fulfill([]);
   if(url.pathname.endsWith('/plan_prices'))return fulfill([]);
   if(url.pathname.endsWith('/admin_subscription_changes'))return fulfill([]);
   if(url.pathname.endsWith('/admin_billing_queue'))return fulfill([{environment:'sandbox',event_id:'evt_review_fixture',state:retried?'processed':'review',attempts:1,error_code:retried?null:'PROVIDER_CONTRACT_MISMATCH',received_at:new Date().toISOString()},{environment:'sandbox',event_id:'evt_internal_fake',state:'review',attempts:1,error_code:'ASAAS_REQUEST_FAILED_HTTP_404',is_fixture:true,received_at:new Date().toISOString()}]);
   if(url.pathname.endsWith('/admin_retry_billing_event')){assert.deepEqual(JSON.parse(req.postData()),{p_environment:'sandbox',p_event_id:'evt_review_fixture'});return fulfill(null);}
   if(url.pathname==='/functions/v1/asaas-reconcile'){assert.equal(req.headers()['x-agrigest-expected-environment'],'sandbox');assert.deepEqual(JSON.parse(req.postData()),{event_id:'evt_review_fixture'});retried=true;return fulfill({state:'processed',event_id:'evt_review_fixture'});}
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
  await page.getByRole('button',{name:'Pagamentos',exact:true}).click();
  await page.getByRole('heading',{name:'Solicitações Asaas',exact:true}).waitFor();
  await page.getByText('Ambiente de testes · sem valor real',{exact:false}).waitFor();
  await page.getByText('Referência: checkout-display-test',{exact:true}).waitFor();
  await page.getByRole('heading',{name:'Conciliação automática Asaas',exact:true}).waitFor();
  await page.getByText('Teste interno: esta referência é fictícia e não corresponde a uma cobrança no Asaas. Nenhum pagamento será liberado por ela.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Conferir novamente',exact:true}).count(),1,'Fictitious internal reference must not suggest repeated provider lookup');
  await page.getByRole('heading',{name:'Assinaturas e usuários adicionais',exact:true}).waitFor();
  await page.getByText('TESTE SANDBOX · sem valor real',{exact:false}).waitFor();
  assert.match(await page.getByText('Recebimentos brutos de produção conferidos:',{exact:false}).innerText(),/0,00/,'Sandbox amounts must not appear as production receipts');
  await page.getByRole('button',{name:'Conferir novamente',exact:true}).click();await page.getByText('Nova conferência solicitada. Atualize para acompanhar o resultado.',{exact:true}).waitFor();assert.equal(retried,true);
  await page.screenshot({path:'checks.local/license-manager-preview.png',fullPage:true});
  await page.getByRole('button',{name:'Sair',exact:true}).click();await login.waitFor();
  await login.getByLabel('Email',{exact:true}).fill('employee@example.test');await login.getByLabel('Senha',{exact:true}).fill('Fictitious-password-only');await login.getByRole('button',{name:'Entrar',exact:true}).click();
  await page.getByRole('heading',{name:'Acesso não autorizado',exact:true}).waitFor();
  assert.equal(await page.getByText('Empresa para validação',{exact:true}).count(),0);
  await page.goto(origin+'?area=cliente');await page.getByRole('heading',{name:'Plano e licenças',exact:true}).waitFor();await page.getByText('Contratar uma licença',{exact:true}).click();await page.getByLabel('Nome da fazenda ou consultoria',{exact:true}).fill('Minha nova fazenda');await page.getByRole('button',{name:'Consultar valor',exact:true}).click();await page.getByText('Primeiro pagamento agora:',{exact:false}).waitFor();await page.getByRole('button',{name:'Contratar e pagar agora',exact:true}).click();await page.getByRole('link',{name:'Abrir pagamento no Asaas Sandbox',exact:true}).waitFor();await page.getByText('Aguardando pagamento',{exact:false}).waitFor();assert.equal(purchaseState,'pending','Opening checkout must not activate licence');await page.getByRole('button',{name:'Conferir pagamento',exact:true}).click();await page.getByText('Conferência solicitada ao Asaas. Atualize para acompanhar a confirmação.',{exact:true}).waitFor();assert.equal(purchaseState,'pending','Check button cannot declare a pending payment as received');assert.equal(await page.getByRole('button',{name:'Conceder cortesia',exact:true}).count(),0);
  const financialCalls={purchaseRequests,checkoutRequests};
  await page.evaluate(()=>{globalThis.isTauri=true;window.paymentOpenCalls=[];window.paymentOpenFail=false;window.__TAURI_INTERNALS__={invoke:async(command,args)=>{window.paymentOpenCalls.push({command,args});if(window.paymentOpenFail)throw Error('Native open failed');}};Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedPaymentLink=text;}}});});
  await page.getByRole('link',{name:'Abrir pagamento no Asaas Sandbox',exact:true}).click();await page.getByText('Pagamento enviado ao navegador. Após concluir, volte aqui e clique em Conferir pagamento.',{exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.paymentOpenCalls),[{command:'open_payment_checkout',args:{url:'https://sandbox.asaas.com/checkoutSession/show?id=checkout_owner_ui'}}]);
  await page.getByRole('button',{name:'Copiar link do pagamento',exact:true}).click();await page.getByText('Link copiado. Cole no navegador para abrir o mesmo pagamento.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.copiedPaymentLink),'https://sandbox.asaas.com/checkoutSession/show?id=checkout_owner_ui');
  await page.evaluate(()=>{window.paymentOpenFail=true;});await page.getByRole('link',{name:'Abrir pagamento no Asaas Sandbox',exact:true}).click();await page.getByRole('alert').filter({hasText:'Não foi possível abrir o navegador.'}).waitFor();
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('Clipboard unavailable');};});await page.getByRole('button',{name:'Copiar link do pagamento',exact:true}).click();await page.getByText('O link foi selecionado. Pressione Ctrl+C para copiar e cole no navegador.',{exact:true}).waitFor();assert.equal(await page.getByLabel('Link do pagamento',{exact:true}).evaluate(el=>el.selectionStart===0&&el.selectionEnd===el.value.length),true);
  assert.deepEqual({purchaseRequests,checkoutRequests},financialCalls,'Opening/copying/retrying link must not create another purchase or checkout');assert.equal(purchaseState,'pending');
  await page.screenshot({path:'checks.local/payment-checkout-link-preview.png',fullPage:false});
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  console.log('PASS: manager native CSP, private-key rejection, server-verified access flow, courtesy RPC, signout isolation and zero external requests (mock HTTP only)');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
