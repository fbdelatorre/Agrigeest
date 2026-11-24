import {spawn} from 'node:child_process';import {open,readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';
if(process.argv[2]!=='--local-only')throw Error('Use --local-only.');
const c=JSON.parse(await readFile('checks.local/licensing-local/operational-bridge-2026-11-24/pilot-context.local.json','utf8'));
if(!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(c.database))throw Error('Destino inválido.');
if(await fetch('http://127.0.0.1:48780').then(r=>r.ok).catch(()=>false)){console.log('Interface piloto já está aberta na porta local.');process.exit(0);}
const log=await open(join(c.folder,'app-ui.log'),'a'),child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','operational-pilot/vite.config.ts'],{cwd:resolve('.'),detached:true,windowsHide:true,stdio:['ignore',log.fd,log.fd]});child.unref();await log.close();
let ready=false;for(let n=0;n<40;n++){if(await fetch('http://127.0.0.1:48780').then(r=>r.ok).catch(()=>false)){ready=true;break;}await new Promise(done=>setTimeout(done,250));}
if(!ready)throw Error('A interface não respondeu. Consulte app-ui.log no diretório privado do piloto.');console.log('Interface piloto pronta: http://127.0.0.1:48780');
