import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../licensing-sandbox/dist.local/',import.meta.url));
const config=JSON.parse(await readFile(new URL('../licensing-sandbox/src-tauri/tauri.conf.json',import.meta.url),'utf8'));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.data':'application/octet-stream','.svg':'image/svg+xml'};
await stat(resolve(root,'index.html'));
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Security-Policy',config.app.security.csp);
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  if(req.headers.host!=='127.0.0.1:4174'||!['GET','HEAD'].includes(req.method??'')){res.writeHead(403).end();return;}
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1:4174').pathname);
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(resolve(root)+sep)){res.writeHead(403).end();return;}
    const body=await readFile(file);
    res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
    res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404).end();}
});
server.on('error',error=>{console.error('Não foi possível iniciar o teste local:',error.message);process.exitCode=1;});
server.listen(4174,'127.0.0.1',()=>console.log('AgriGest TESTE DE LICENÇAS: http://127.0.0.1:4174 — somente dados fictícios. Ctrl+C encerra o servidor.'));
