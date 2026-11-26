import {spawn,spawnSync} from 'node:child_process';import {open,readFile,access} from 'node:fs/promises';import {join,resolve} from 'node:path';
import {preparePilotOffline} from './operational-pilot-offline.mjs';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const c=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8')),cfg=JSON.parse(await readFile(join(c.folder,'api.private.json'),'utf8'));
await preparePilotOffline(c,cfg);
if(!process.argv.includes('--reuse-build')){const r=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','operational-pilot/vite.config.ts'],{windowsHide:true,stdio:'inherit'});if(r.status!==0)throw Error('Não foi possível preparar o pacote offline.');}
await access('operational-pilot/dist.local/pilot-service-worker.js');
if(await fetch('http://127.0.0.1:48781').then(r=>r.ok).catch(()=>false)){console.log('Piloto offline disponível: http://127.0.0.1:48781/monitoring');process.exit(0);}
const log=await open(join(c.folder,'offline-ui.log'),'a'),child=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','operational-pilot/vite.config.ts'],{cwd:resolve('.'),detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();
for(let i=0;i<40;i++){if(await fetch('http://127.0.0.1:48781').then(r=>r.ok).catch(()=>false)){console.log('Piloto offline pronto: http://127.0.0.1:48781/monitoring');process.exit(0);}await new Promise(r=>setTimeout(r,250));}throw Error('O piloto offline não respondeu.');
