// Proxy efêmero por named pipe; não abre API Docker TCP nem altera Docker Desktop.
// Somente o processo de inicialização recebe o token em memória.
import http from 'node:http';
import net from 'node:net';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';

export function restrictPublishedPorts(body,name,project='agrigest-licensing-local'){
 const networks={'agrigest-licensing-local':'agrigest-licensing-loopback','agrigest-compat15-local':'agrigest-compat15-loopback'};
 if(!Object.hasOwn(networks,project))throw Error('Contêiner fora do projeto local recusado.');
 const bootstrapImages=['public.ecr.aws/supabase/postgres:15.8.1.121','public.ecr.aws/supabase/postgres:17.12.0.000','public.ecr.aws/supabase/gotrue:v2.198.0'];
 const bootstrap=!name&&bootstrapImages.includes(body.Image)&&Object.keys(body.HostConfig?.PortBindings??{}).length===0;
 if(!bootstrap&&(!/^supabase_[a-z_]+_/.test(name??'')||!name.endsWith('_'+project)))throw Error('Contêiner fora do projeto local recusado.');
 if(body.HostConfig?.NetworkMode!==networks[project])throw Error('Rede inesperada recusada.');
 for(const bindings of Object.values(body.HostConfig?.PortBindings??{}))for(const binding of bindings??[])binding.HostIp='127.0.0.1';
 if(body.HostConfig?.PublishAllPorts)throw Error('Publicação automática de portas recusada.');
 return body;
}

export async function localDockerPipe(host,project='agrigest-licensing-local',onRefusal=()=>{}){
 if(!['agrigest-licensing-local','agrigest-compat15-local'].includes(project))throw Error('Projeto local inesperado.');
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
    const parsed=JSON.parse(Buffer.concat(chunks));
    try{body=Buffer.from(JSON.stringify(restrictPublishedPorts(parsed,path.searchParams.get('name'),project)));}
    catch(error){onRefusal({name:path.searchParams.get('name'),image:parsed.Image,network:parsed.HostConfig?.NetworkMode,ports:Object.keys(parsed.HostConfig?.PortBindings??{}),reason:error.message});throw error;}
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
 const sockets=new Set();
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 server.on('upgrade',(req,socket,head)=>{
  if(!authenticated(req)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  // Docker pode usar HTTP 101 ou hijack HTTP 200 para attach. Encaminha bytes
  // diretamente para preservar ambos os protocolos e a entrada do migrador.
  const backend=net.createConnection(socketPath,()=>{
   let headers=`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
   for(let i=0;i<req.rawHeaders.length;i+=2)if(req.rawHeaders[i].toLowerCase()!=='x-agrigest-local-token')headers+=req.rawHeaders[i]+': '+req.rawHeaders[i+1]+'\r\n';
   backend.write(headers+'\r\n');if(head.length)backend.write(head);
   socket.pipe(backend);backend.pipe(socket);
  });
  socket.on('error',()=>backend.destroy());socket.once('close',()=>backend.destroy());
  backend.on('error',()=>socket.destroy());backend.once('close',()=>socket.destroy());
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});
 return {env:{DOCKER_HOST:'npipe:////./pipe/'+pipe.split('\\').at(-1),DOCKER_CUSTOM_HEADERS:'X-Agrigest-Local-Token='+token},close:()=>new Promise(resolve=>{server.close(resolve);for(const socket of sockets)socket.destroy();})};
}
