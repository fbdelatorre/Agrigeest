import {randomBytes} from 'node:crypto';import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
import {createTeamInviteHandler} from '../licensing-server-local/supabase/functions/_shared/teamInvites.mjs';
export async function operationalPilotInvites(context,config){
 if(!/^agrigest_licensing_pilot_[a-f0-9]{12}$/.test(context.database)||config.database!==context.database||config.apiUrl!=='http://127.0.0.1:48721')throw Error('LOCAL_PILOT_REQUIRED');
 if(!config.teamInviteSecret){config.teamInviteSecret=randomBytes(32).toString('hex');await writeFile(join(context.folder,'api.private.json'),JSON.stringify(config,null,2));}
 async function rpc(name,args,bearer){const r=await fetch('http://127.0.0.1:48723/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json','Content-Profile':'licensing',Authorization:bearer??'Bearer '+config.serviceKey},body:JSON.stringify(args),redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok){const b=await r.json().catch(()=>null);throw Error(typeof b?.message==='string'&&/^[A-Z_]{1,80}$/.test(b.message)?b.message:'TEAM_DATABASE_UNAVAILABLE');}return r.status===204?null:r.json();}
 return createTeamInviteHandler({localOnly:true,secret:config.teamInviteSecret,portalUrl:'http://127.0.0.1:48780/convite',
  authenticate:async request=>{const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return null;const r=await fetch('http://127.0.0.1:48722/user',{headers:{Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)return null;return(await r.json()).id??null;},
  create:(request,args)=>rpc('workspace_invite',args,request.headers.get('authorization')),
  markDelivery:(id,sent)=>rpc('workspace_mark_delivery',{p_invite:id,p_sent:sent}),
  send:async message=>{const r=await fetch('http://127.0.0.1:48724/api/v1/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({From:{Email:'convites@agrigest.test',Name:'AgriGest — piloto local'},To:[{Email:message.email}],Subject:message.subject,Text:message.text}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('LOCAL_MAIL_UNAVAILABLE');await r.body?.cancel();}
 });
}
