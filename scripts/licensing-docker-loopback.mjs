// Proxy efêmero por named pipe; não abre API Docker TCP nem altera Docker Desktop.
// Somente o processo de inicialização recebe o token em memória.
import http from 'node:http';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

export function restrictPublishedPorts(body,name){
 if(!/^supabase_[a-z_]+_agrigest-licensing-local$/.test(name??''))throw Error('Contêiner fora do projeto local recusado.');
 if(body.HostConfig?.NetworkMode!=='agrigest-licensing-loopback')throw Error('Rede inesperada recusada.');
 for(const bindings of Object.values(body.HostConfig?.PortBindings??{}))for(const binding of bindings??[])binding.HostIp='127.0.0.1';
 if(body.HostConfig?.PublishAllPorts)throw Error('Publicação automática de portas recusada.');
 return body;
}

export async function localDockerPipe(host){
 if(!host.startsWith('npipe:////./pipe/'))throw Error('Este ajuste requer o Docker local do Windows.');
 const socketPath='\\\\.\\pipe\\'+host.slice('npipe:////./pipe/'.length);
 const pipe='\\\\.\\pipe\\agrigest-licensing-'+randomUUID();
 const token=randomBytes(32).toString('hex');
 const authenticated=req=>{
  const received=Buffer.from(String(req.headers['x-agrigest-local-token']??''));const expected=Buffer.from(token);
  return received.length===expected.length&&timingSafeEqual(received,expected);
 };
 const server=http.createServer(async(req,res)=>{
  if(!authenticated(req)){res.writeHead(403).end();return;}
  try{
   const path=new URL(req.url,'http://docker.local');let body;
   const headers={...req.headers};delete headers['x-agrigest-local-token'];
   if(req.method==='POST'&&/^\/v[\d.]+\/containers\/create$/.test(path.pathname)){
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)throw Error('Corpo excessivo.');chunks.push(chunk);}
    body=Buffer.from(JSON.stringify(restrictPublishedPorts(JSON.parse(Buffer.concat(chunks)),path.searchParams.get('name'))));
    delete headers['transfer-encoding'];headers['content-length']=String(body.length);
   }
   const upstream=http.request({socketPath,path:req.url,method:req.method,headers},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
   });
   upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
   req.on('aborted',()=>upstream.destroy());
   if(body)upstream.end(body);else req.pipe(upstream);
  }catch{if(!res.headersSent)res.writeHead(400);res.end('Configuração local recusada.');}
 });
 server.on('upgrade',(req,socket,head)=>{
  if(!authenticated(req)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  const headers={...req.headers};delete headers['x-agrigest-local-token'];
  const upstream=http.request({socketPath,path:req.url,method:req.method,headers});
  upstream.on('upgrade',(response,backend,backendHead)=>{
   socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n`+Object.entries(response.headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n');
   if(backendHead.length)socket.write(backendHead);if(head.length)backend.write(head);
   socket.pipe(backend);backend.pipe(socket);socket.on('error',()=>backend.destroy());backend.on('error',()=>socket.destroy());
  });
  upstream.on('response',response=>{socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`);response.resume();});
  upstream.on('error',()=>socket.destroy());upstream.end();
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
 return {env:{DOCKER_HOST:'npipe:////./pipe/'+pipe.split('\\').at(-1),DOCKER_CUSTOM_HEADERS:'X-Agrigest-Local-Token='+token},close:()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})};
}
