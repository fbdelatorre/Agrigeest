import {generateKeyPairSync,createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';import {join} from 'node:path';
export async function preparePilotOffline(context,config){
 if(context.container!=='supabase_db_agrigest-compat15-local'||!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(context.database)||config.database!==context.database||config.apiUrl!=='http://127.0.0.1:48721')throw Error('LOCAL_PILOT_REQUIRED');
 const filename=join(context.folder,'offline-signing.private.json');let key;
 try{key=JSON.parse(await readFile(filename,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});key={privateJwk:pair.privateKey.export({format:'jwk'})};await writeFile(filename,JSON.stringify(key),{flag:'wx',mode:0o600});}
 const privateKey=createPrivateKey({key:key.privateJwk,format:'jwk'}),jwk=createPublicKey(privateKey).export({format:'jwk'});
 if(jwk.kty!=='EC'||jwk.crv!=='P-256'||jwk.d)throw Error('INVALID_OFFLINE_KEY');
 const kid=createHash('sha256').update(JSON.stringify(jwk)).digest('hex'),publicConfig={kid,jwk};
 await writeFile('checks.local/licensing-local/pilot-offline-signing.public.json',JSON.stringify(publicConfig));
 return {publicConfig,async handler(request){
  if(request.method!=='POST')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405});
  const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return Response.json({error:'SESSION_REQUIRED'},{status:401});
  const institution=request.headers.get('x-agrigest-institution-id');if(!/^[a-f0-9-]{36}$/i.test(institution??''))return Response.json({error:'FARM_ACCESS_REQUIRED'},{status:403});
  if(Number(request.headers.get('content-length')??0)>1024)return Response.json({error:'INVALID_OFFLINE_REQUEST'},{status:413});
  const reader=request.body?.getReader();let raw='',size=0;const decoder=new TextDecoder();
  if(reader){while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1024){await reader.cancel();return Response.json({error:'INVALID_OFFLINE_REQUEST'},{status:413});}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}let args;
  try{args=JSON.parse(raw);}catch{return Response.json({error:'INVALID_OFFLINE_REQUEST'},{status:400});}
  if(!/^[a-f0-9-]{36}$/i.test(args?.p_license??'')||!/^[a-f0-9-]{36}$/i.test(args?.p_installation??'')||!/^[a-f0-9]{64}$/.test(args?.p_secret??''))return Response.json({error:'INVALID_OFFLINE_REQUEST'},{status:400});
  const r=await fetch('http://127.0.0.1:48723/rpc/operational_offline_authorization',{method:'POST',headers:{'Content-Type':'application/json','Content-Profile':'licensing',Authorization:bearer,'x-agrigest-institution-id':institution},body:JSON.stringify({p_license:args.p_license,p_installation:args.p_installation,p_secret:args.p_secret}),redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!r.ok){await r.body?.cancel();return Response.json({error:r.status===401||r.status===403?'OFFLINE_ACCESS_DENIED':'OFFLINE_UNAVAILABLE'},{status:r.status===401||r.status===403?r.status:503});}
  const payload=Buffer.from(JSON.stringify(await r.json())).toString('base64url');
  return Response.json({kid,payload,signature:sign('sha256',Buffer.from(payload),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')},{headers:{'Cache-Control':'no-store'}});
 }};
}
