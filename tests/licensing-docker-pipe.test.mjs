import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import net from 'node:net';import {randomUUID} from 'node:crypto';
import {localDockerPipe} from '../scripts/licensing-docker-loopback.mjs';
test('named pipe authenticates requests, hides its token and forwards Docker attach bytes', {skip:process.platform!=='win32'},async()=>{
 const name='agrigest-mock-'+randomUUID();const socket='\\\\.\\pipe\\'+name;let tokenLeaked=false;
 const backend=http.createServer((req,res)=>{tokenLeaked||=Boolean(req.headers['x-agrigest-local-token']);res.end('{}');});
 backend.on('upgrade',(req,stream)=>{tokenLeaked||=Boolean(req.headers['x-agrigest-local-token']);stream.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n');stream.on('data',data=>{if(data.toString()==='ping')stream.end('pong');});});
 await new Promise(resolve=>backend.listen(socket,resolve));const proxy=await localDockerPipe('npipe:////./pipe/'+name);
 const proxySocket='\\\\.\\pipe\\'+proxy.env.DOCKER_HOST.split('/').at(-1);const token=proxy.env.DOCKER_CUSTOM_HEADERS.split('=')[1];
 try{
  const status=await new Promise((resolve,reject)=>{const r=http.request({socketPath:proxySocket,path:'/_ping'},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);r.end();});assert.equal(status,403);
  const response=await new Promise((resolve,reject)=>{
   const stream=net.createConnection(proxySocket,()=>stream.write('POST /v1.48/containers/test/attach HTTP/1.1\r\nHost: docker\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nX-Agrigest-Local-Token: '+token+'\r\nContent-Length: 0\r\n\r\n'));
   let text='',sent=false;stream.on('data',chunk=>{text+=chunk;if(!sent&&text.includes('\r\n\r\n')){sent=true;stream.write('ping');}});stream.on('end',()=>resolve(text));stream.on('error',reject);
  });assert.ok(response.endsWith('pong'));assert.equal(tokenLeaked,false);
 }finally{await proxy.close();await new Promise(resolve=>backend.close(resolve));}
});
