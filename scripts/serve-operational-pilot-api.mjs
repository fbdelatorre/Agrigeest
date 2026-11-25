import http from 'node:http';
import {readFile} from 'node:fs/promises';import {join} from 'node:path';
import {operationalPilotInvites} from './operational-pilot-invites.mjs';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const c=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(c.database))throw Error('Destino inválido.');
const config=JSON.parse(await readFile(join(c.folder,'api.private.json'),'utf8'));
if(config.database!==c.database||config.apiUrl!=='http://127.0.0.1:48721')throw Error('Configuração inválida.');
const origins=new Set(['http://127.0.0.1:48780','http://localhost:48780','http://127.0.0.1:4181','http://localhost:4181','http://tauri.localhost','https://tauri.localhost','tauri://localhost']);
const invite=await operationalPilotInvites(c,config);
http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&!origins.has(origin)){res.writeHead(403);res.end();return;}
 const cors={'Access-Control-Allow-Origin':origin??'http://127.0.0.1:48780','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,accept-profile,content-profile,x-client-info,x-supabase-api-version,x-application-name,x-agrigest-institution-id,prefer,range,range-unit','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,PUT,HEAD,OPTIONS','Access-Control-Expose-Headers':'content-range,range-unit,preference-applied'};
 if(req.method==='OPTIONS'){res.writeHead(204,cors);res.end();return;}
 if(req.url==='/functions/v1/team-invite'){
  try{const request=new Request('http://127.0.0.1:48721/functions/v1/team-invite',{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const result=await invite(request);const output=new Headers(result.headers);for(const [key,value] of Object.entries(cors))output.set(key,value);res.writeHead(result.status,Object.fromEntries(output));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(503,{...cors,'Content-Type':'application/json'});res.end('{"error":"TEAM_INVITE_UNAVAILABLE"}');}return;
 }
 if(req.url==='/pilot/health'){res.writeHead(200,{...cors,'Content-Type':'application/json'});res.end('{"pilot":true,"production":false}');return;}
 if(req.url==='/pilot/config'){res.writeHead(200,{...cors,'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({apiUrl:config.apiUrl,anonKey:config.anonKey,institutionId:config.institutionId}));return;}
 const rest=req.url?.startsWith('/rest/v1/'),auth=req.url?.startsWith('/auth/v1/');
 if(!rest&&!auth){res.writeHead(501,{...cors,'Content-Type':'application/json'});res.end('{"message":"Recurso externo indisponível nesta cópia local de teste."}');return;}
 const headers={...req.headers};delete headers.host;delete headers.connection;
 const proxy=http.request({hostname:'127.0.0.1',port:rest?48723:48722,method:req.method,path:req.url.slice(rest?8:8),headers},response=>{
 const output={...response.headers,...cors};delete output['access-control-allow-origin'];output['Access-Control-Allow-Origin']=cors['Access-Control-Allow-Origin'];res.writeHead(response.statusCode??502,output);response.pipe(res);
 });proxy.setTimeout(30000,()=>proxy.destroy());proxy.on('error',()=>{if(!res.headersSent)res.writeHead(503,{...cors,'Content-Type':'application/json'});res.end('{"message":"O servidor local de teste está indisponível. Abra o Docker e tente novamente."}');});req.on('aborted',()=>proxy.destroy());req.pipe(proxy);
}).listen(48721,'127.0.0.1',()=>console.log('Proxy exclusivo do piloto local iniciado.'));
