const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export function createTeamInviteHandler({authenticate,create,markDelivery,send,secret,localOnly,portalUrl='http://127.0.0.1:4180/'}){
 if(!['http://127.0.0.1:4180/','http://127.0.0.1:48780/convite'].includes(portalUrl))throw Error('UNTRUSTED_INVITATION_PORTAL');
 const origins=['http://127.0.0.1:4180','http://127.0.0.1:5173','tauri://localhost','http://tauri.localhost','https://tauri.localhost'];
 origins.push(new URL(portalUrl).origin);
 return async request=>{
  const origin=request.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';headers['Access-Control-Allow-Methods']='POST,OPTIONS';}
  const reply=(status,body)=>Response.json(body,{status,headers});if(origin&&!origins.includes(origin))return reply(403,{error:'ORIGIN_NOT_ALLOWED'});if(request.method==='OPTIONS')return new Response(null,{status:204,headers});if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if(!localOnly||typeof secret!=='string'||secret.length<32)return reply(503,{error:'TEAM_INVITE_NOT_CONFIGURED'});
  try{
   const actor=await authenticate(request);if(!actor)return reply(401,{error:'AUTH_REQUIRED'});
   const reader=request.body?.getReader();let size=0;const parts=[];if(!reader)return reply(400,{error:'INVALID_BODY'});while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();return reply(413,{error:'BODY_TOO_LARGE'});}parts.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const p of parts){bytes.set(p,offset);offset+=p.length;}
   let b;try{b=JSON.parse(new TextDecoder().decode(bytes));}catch{return reply(400,{error:'INVALID_BODY'});}
   if(!b||Object.keys(b).some(k=>!['organization_id','email','role','farms','consultancy_id','request_id'].includes(k))||!uuid(b.organization_id)||!uuid(b.request_id)||typeof b.email!=='string'||b.email.length>254||!['administrator','application_manager','field_monitor','consultant'].includes(b.role)||!Array.isArray(b.farms)||b.farms.length>100||b.farms.some(v=>!uuid(v))||(b.consultancy_id!==null&&!uuid(b.consultancy_id)))return reply(400,{error:'INVALID_BODY'});
   const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('agrigest-team-invite-v1|'+actor+'|'+b.request_id));const token=Array.from(new Uint8Array(signature),n=>n.toString(16).padStart(2,'0')).join('');
   const invite=await create(request,{p_org:b.organization_id,p_email:b.email,p_role:b.role,p_farms:b.farms,p_consultancy:b.consultancy_id,p_token:token,p_request:b.request_id});
   if(invite.delivery==='sent')return reply(200,{state:'sent',invitation_id:invite.id,registered:invite.registered});
   const target=new URL(portalUrl);if(target.port==='4180')target.searchParams.set('area','cliente');if(!invite.registered)target.searchParams.set('cadastro','1');target.hash=new URLSearchParams({convite:invite.id,token}).toString();
   const roles={administrator:'Administrador',application_manager:'Responsável por aplicação',field_monitor:'Monitor de campo',consultant:'Consultor'};
   try{await send({email:invite.email,subject:'Convite para o AgriGest — teste local',text:'Você recebeu um convite para '+invite.organization+'.\nFunção: '+roles[invite.role]+'.\n\n'+(invite.registered?'Entre na sua conta para aceitar:':'Crie sua conta e confirme seu email para aceitar:')+'\n'+target.href+'\n\nEmpresa e função serão preenchidas automaticamente. Este convite não exige comprar uma licença de funcionário. Link válido por 7 dias, sujeito à revogação. Este email pertence ao teste local.'});await markDelivery(invite.id,true);return reply(200,{state:'sent',invitation_id:invite.id,registered:invite.registered});}
   catch{await markDelivery(invite.id,false).catch(()=>{});return reply(202,{state:'email_failed',invitation_id:invite.id,registered:invite.registered});}
  }catch(e){const code=typeof e?.message==='string'&&/^[A-Z_]{1,80}$/.test(e.message)?e.message:'TEAM_INVITE_UNAVAILABLE';return reply(409,{error:code});}
 };
}
