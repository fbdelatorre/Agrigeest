export type OfflinePermission={read:boolean;write:boolean};
export type OfflineGrantPayload={version:number;aud:string;sub:string;session_id:string;installation:string;proof_hash:string;source_license:string;institution_id:string;name:string;license_id:string;role:string;permissions:Record<string,OfflinePermission>;issued_at:number;expires_at:number};
export type SignedOfflineGrant={kid:string;payload:string;signature:string};
export type OfflinePublicKey={kid:string;jwk:JsonWebKey};
export const offlineGrantKey=(user:string,institution:string)=>'agrigest:pilot:offline:'+user+':'+institution;
export const installationKey=(user:string,license:string)=>'agrigest-license-installation:http://127.0.0.1:48721:'+user+':'+license;
function bytes(value:string){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}
export async function verifyOfflineGrant(token:SignedOfflineGrant,key:OfflinePublicKey,expected:{user:string;institution:string;sessionId:string;installation:string;secret:string},now=Date.now(),highWater=0){
 if(!token||token.kid!==key?.kid||typeof token.payload!=='string'||token.payload.length>12000||typeof token.signature!=='string')throw Error('OFFLINE_SIGNATURE_REQUIRED');
 const imported=await crypto.subtle.importKey('jwk',key.jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},imported,bytes(token.signature),new TextEncoder().encode(token.payload)))throw Error('OFFLINE_SIGNATURE_REQUIRED');
 const p=JSON.parse(new TextDecoder().decode(bytes(token.payload))) as OfflineGrantPayload;
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(expected.secret))),b=>b.toString(16).padStart(2,'0')).join('');
 if(p.version!==1||p.aud!=='agrigest-local-pilot-offline'||p.sub!==expected.user||p.institution_id!==expected.institution||p.session_id!==expected.sessionId||p.installation!==expected.installation||p.proof_hash!==hash||!p.permissions||!Number.isSafeInteger(p.issued_at)||!Number.isSafeInteger(p.expires_at)||p.expires_at<=p.issued_at||p.expires_at-p.issued_at>7*86400)throw Error('OFFLINE_SCOPE_MISMATCH');
 const clockOK=now>=p.issued_at*1000-300000&&now>=highWater-300000;
 return {payload:p,active:clockOK&&now<p.expires_at*1000,reason:!clockOK?'clock':now>=p.expires_at*1000?'expired':'valid'};
}
