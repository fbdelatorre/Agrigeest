import type {Session,SupabaseClient} from '@supabase/supabase-js';
import {installationKey,offlineGrantKey,verifyOfflineGrant,type OfflinePublicKey,type SignedOfflineGrant} from './offlineGrant';
const publicKey=JSON.parse(import.meta.env.VITE_PILOT_OFFLINE_PUBLIC_KEY??'null') as OfflinePublicKey|null;
const api='http://127.0.0.1:48721';
function sessionId(session:Session){return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id as string;}
export function clearPilotOffline(user:string,institution:string){localStorage.removeItem(offlineGrantKey(user,institution));}
export async function readPilotOffline(session:Session,institution:string){
 if(!publicKey)throw Error('OFFLINE_NOT_PREPARED');const key=offlineGrantKey(session.user.id,institution),token=JSON.parse(localStorage.getItem(key)??'null') as SignedOfflineGrant;
 // Decode only to find the local proof. No permission is trusted before verification.
 const hint=JSON.parse(atob(token.payload.replace(/-/g,'+').replace(/_/g,'/'))),proof=JSON.parse(localStorage.getItem(installationKey(session.user.id,hint.source_license))??'null');
 if(!proof?.installation||!/^[a-f0-9]{64}$/.test(proof.secret??''))throw Error('OFFLINE_DEVICE_REQUIRED');
 const clockKey=key+':clock',highWater=Number(localStorage.getItem(clockKey)??0),checked=await verifyOfflineGrant(token,publicKey,{user:session.user.id,institution,sessionId:sessionId(session),installation:proof.installation,secret:proof.secret},Date.now(),Number.isFinite(highWater)?highWater:0);
 if(checked.active)localStorage.setItem(clockKey,String(Math.max(Date.now(),highWater||0)));
 const p=checked.payload;
 return {institution_id:p.institution_id,name:p.name,license_id:p.license_id,role:p.role,permissions:Object.fromEntries(Object.entries(p.permissions).map(([m,v])=>[m,{read:v.read,write:checked.active&&v.write}])),offline:true,offlineUntil:p.expires_at*1000,offlineReason:checked.reason};
}
export async function preparePilotOffline(client:SupabaseClient,session:Session,institution:string,signal:AbortSignal){
 if(!publicKey)return false;
 const result=await client.schema('licensing').rpc('operational_device_licenses').abortSignal(signal);if(result.error)throw result.error;
 for(const source of result.data as {license_id:string}[]){
  const proof=JSON.parse(localStorage.getItem(installationKey(session.user.id,source.license_id))??'null');if(!proof?.installation||!proof?.secret)continue;
  const response=await fetch(api+'/functions/v1/offline-authorization',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json','x-agrigest-institution-id':institution},body:JSON.stringify({p_license:source.license_id,p_installation:proof.installation,p_secret:proof.secret}),signal});
  if(!response.ok){if(response.status===401||response.status===403)continue;throw Error('OFFLINE_UNAVAILABLE');}
  const token=await response.json() as SignedOfflineGrant;
  const verified=await verifyOfflineGrant(token,publicKey,{user:session.user.id,institution,sessionId:sessionId(session),installation:proof.installation,secret:proof.secret});
  if(!verified.active||signal.aborted)continue;
  const key=offlineGrantKey(session.user.id,institution);localStorage.setItem(key,JSON.stringify(token));localStorage.setItem(key+':clock',String(Date.now()));return true;
 }
 return false;
}
