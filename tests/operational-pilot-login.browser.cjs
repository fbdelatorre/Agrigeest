// Teste de comunicação real do login. Não conhece senhas ou cria contas.
const assert=require('node:assert/strict');
const {chromium}=require('../checks.local/node_modules/playwright-core');
if(process.argv[2]!=='--local-only')throw Error('Use --local-only com o piloto local iniciado.');
(async()=>{
 for(const origin of ['http://127.0.0.1:48780','http://tauri.localhost','https://tauri.localhost']){
  const r=await fetch('http://127.0.0.1:48721/auth/v1/token?grant_type=password',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,apikey,content-type,x-client-info,x-supabase-api-version'}});
  assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.match(r.headers.get('access-control-allow-headers'),/x-supabase-api-version/);
 }
 const denied=await fetch('http://127.0.0.1:48721/auth/v1/token',{method:'OPTIONS',headers:{Origin:'https://outside.example.test'}});assert.equal(denied.status,403);
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{
  const page=await browser.newPage(),corsErrors=[];
  page.on('console',m=>{if(/blocked by CORS|TypeError: Failed to fetch/.test(m.text()))corsErrors.push(m.text());});
  await page.goto('http://127.0.0.1:48780/login');
  await page.locator('input[type=email]').fill('teste-cors-'+require('node:crypto').randomUUID()+'@example.test');
  await page.locator('input[type=password]').fill('SenhaFicticiaNaoUtilizada123!');
  const response=page.waitForResponse(r=>r.url().startsWith('http://127.0.0.1:48721/auth/v1/token?grant_type=password'));
  await page.getByRole('button',{name:'Entrar',exact:true}).click();assert.equal((await response).status(),400);
  await page.getByText('Email ou senha inválidos',{exact:true}).waitFor();assert.deepEqual(corsErrors,[]);
  console.log('PASS: navegador e origens Windows autorizados; origem externa recusada; login chega ao Auth e rejeita credenciais fictícias sem falha de rede.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
