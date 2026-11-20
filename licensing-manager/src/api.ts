import {createClient} from '@supabase/supabase-js';
export function validateConfiguration(url:string,key:string) {
 if(!url||!key)return 'O serviço ainda precisa ser configurado. Inicie o Supabase local e configure a chave pública deste programa.';
 try{const endpoint=new URL(url);if(!['http://127.0.0.1:55321','https://qnhykflwwihdpahvktmb.supabase.co'].includes(endpoint.origin)||endpoint.pathname!=='/')return 'Endereço do serviço não autorizado neste programa.';}catch{return 'Endereço do serviço inválido.';}
 if(key.startsWith('sb_secret_'))return 'Chave administrativa recusada. Este programa aceita apenas chave pública.';
 if(key.startsWith('eyJ')){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')return 'JWT administrativo recusado. Use a chave pública do projeto.';}catch{return 'Chave pública inválida.';}}
 else if(!key.startsWith('sb_publishable_'))return 'Formato de chave pública inválido.';
 return null;
}
let saved:{url?:string;key?:string}={};try{saved=JSON.parse(localStorage.getItem('agrigest-license-manager-connection')??'{}');}catch{ /* invalid local settings do not grant access */ }
const url=saved.url??import.meta.env.VITE_LICENSING_URL??'',key=saved.key??import.meta.env.VITE_LICENSING_PUBLIC_KEY??'';
export function saveConfiguration(url:string,key:string){const error=validateConfiguration(url.trim(),key.trim());if(error)throw Error(error);localStorage.setItem('agrigest-license-manager-connection',JSON.stringify({url:url.trim(),key:key.trim()}));}
export const configurationError=validateConfiguration(url,key);
export const client=configurationError?null:createClient(url,key,{auth:{storageKey:'agrigest-license-manager:'+new URL(url).host,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
export const db=client?.schema('licensing');
export type License={id:string;label:string;owner_id:string;kind:'farm'|'consultancy';period:'monthly'|'annual';status:string;extras:number;amount_minor:number;complimentary:boolean;valid_until:string|null};
export type Payment={id:string;license_id:string;amount_minor:number;status:string;due_on:string;paid_on:string|null;method:string;reference:string};
export type Event={id:string;license_id:string;action:string;created_at:string;details:Record<string,unknown>};
export type Account={id:string;email:string};
export async function rpc<T=unknown>(name:string,args:Record<string,unknown>={}):Promise<T>{
 if(!db)throw Error('Serviço não configurado.');const {data,error}=await db.rpc(name,args);if(error)throw error;return data as T;
}
export async function snapshot(){
 if(!db)throw Error('Serviço não configurado.');
 const [licenses,payments,events]=await Promise.all([db.from('licenses').select('*').order('created_at',{ascending:false}).limit(500),db.from('payments').select('*').order('created_at',{ascending:false}).limit(500),db.from('events').select('*').order('created_at',{ascending:false}).limit(100)]);
 for(const result of [licenses,payments,events])if(result.error)throw result.error;
 return {licenses:licenses.data as License[],payments:payments.data as Payment[],events:events.data as Event[]};
}
export function moneyInput(text:string){const normalized=text.trim().replace(',','.');if(!/^\d{1,7}(\.\d{1,2})?$/.test(normalized))throw Error('Informe o valor com até duas casas decimais.');const [whole,fraction='']=normalized.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
export function friendly(error:unknown){const message=error&&typeof error==='object'&&'message'in error?String(error.message):String(error);if(/PLATFORM_ADMIN_REQUIRED|permission denied|row-level security/.test(message))return 'Esta conta não possui autorização administrativa confirmada.';if(/schema|function.*does not exist|PGRST/.test(message))return 'O serviço de licenças ainda não foi publicado ou configurado neste servidor.';if(message.includes('Invalid login credentials'))return 'Email ou senha incorretos.';return message;}
