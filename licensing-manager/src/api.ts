import {createClient} from '@supabase/supabase-js';
export function validateConfiguration(url:string,key:string) {
 if(!url||!key)return 'O serviço ainda precisa ser configurado. Inicie o Supabase local e configure a chave pública deste programa.';
 try{const endpoint=new URL(url);if(!['http://127.0.0.1:46321','https://qnhykflwwihdpahvktmb.supabase.co'].includes(endpoint.origin)||endpoint.pathname!=='/')return 'Endereço do serviço não autorizado neste programa.';}catch{return 'Endereço do serviço inválido.';}
 if(key.startsWith('sb_secret_'))return 'Chave administrativa recusada. Este programa aceita apenas chave pública.';
 if(key.startsWith('eyJ')){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')return 'JWT administrativo recusado. Use a chave pública do projeto.';}catch{return 'Chave pública inválida.';}}
 else if(!key.startsWith('sb_publishable_'))return 'Formato de chave pública inválido.';
 return null;
}
let saved:{url?:string;key?:string}={};try{saved=JSON.parse(localStorage.getItem('agrigest-license-manager-connection')??'{}');}catch{ /* invalid local settings do not grant access */ }
const url=saved.url??import.meta.env.VITE_LICENSING_URL??'',key=saved.key??import.meta.env.VITE_LICENSING_PUBLIC_KEY??'';
export const connectionId=url;
export function saveConfiguration(url:string,key:string){const error=validateConfiguration(url.trim(),key.trim());if(error)throw Error(error);localStorage.setItem('agrigest-license-manager-connection',JSON.stringify({url:url.trim(),key:key.trim()}));}
export const configurationError=validateConfiguration(url,key);
export const client=configurationError?null:createClient(url,key,{auth:{storageKey:'agrigest-license-manager:'+new URL(url).host,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
export const db=client?.schema('licensing');
export type License={id:string;label:string;owner_id:string;kind:'farm'|'consultancy';period:'monthly'|'annual';status:string;extras:number;amount_minor:number;complimentary:boolean;valid_until:string|null;test_mode?:boolean;institution_id?:string|null};
export type Payment={id:string;license_id:string;amount_minor:number;status:string;due_on:string;paid_on:string|null;method:string;reference:string};
export type Event={id:string;license_id:string;action:string;created_at:string;details:Record<string,unknown>};
export type Account={id:string;email:string};
export type Checkout={id:string;license_id:string;label:string;environment:string;state:string;amount_minor:number;period:string;created_at:string;provider_id:string|null};
export type ProviderPayment={environment:string;payment_id:string;license_id:string;amount_minor:number;status:string;due_on:string;paid_on:string|null;coverage_until:string;eligible:boolean;has_refund:boolean;verified_at:string};
export type ProviderAudit={id:string;license_id:string;environment:string;action:string;created_at:string;details:Record<string,unknown>};
export type BillingJob={environment:string;event_id:string;state:string;attempts:number;error_code:string|null;received_at:string;is_fixture?:boolean};
export type ExtraPrice={kind:'farm'|'consultancy';period:'monthly'|'annual';unit_minor:number};
export type PlanPrice={kind:'farm'|'consultancy';period:'monthly'|'annual';amount_minor:number};
export type SubscriptionChange={id:string;license_id:string;environment:string;action:string;state:string;target_extras:number|null;target_minor:number|null;effective_on:string|null;error_code:string|null;created_at:string};
export type ExtraQuote={extras:number;current_extras:number;unit_minor:number;amount_minor:number;users:number;devices:number};
export async function rpc<T=unknown>(name:string,args:Record<string,unknown>={}):Promise<T>{
 if(!db||!client)throw Error('Serviço não configurado.');
 let pendingKey:string|undefined;const payload={...args};
 if(typeof args.p_request==='string'){
  const {data:{session}}=await client.auth.getSession();if(!session)throw Error('Entre novamente para realizar esta ação.');
  const canonical=JSON.stringify(Object.fromEntries(Object.entries(args).filter(([key])=>key!=='p_request').sort(([a],[b])=>a.localeCompare(b))));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  pendingKey='agrigest-license-manager-pending:'+new URL(url).host+':'+session.user.id+':'+name+':'+hash;
  const saved=localStorage.getItem(pendingKey);payload.p_request=saved??args.p_request;
  if(!saved)localStorage.setItem(pendingKey,String(payload.p_request));
 }
 const {data,error}=await db.rpc(name,payload);if(error)throw error;
 if(pendingKey)localStorage.removeItem(pendingKey);return data as T;
}
export async function snapshot(){
 if(!db)throw Error('Serviço não configurado.');
 const [licenses,payments,events,checkouts,providerPayments,providerAudit,queue]=await Promise.all([db.from('licenses').select('*').order('created_at',{ascending:false}).limit(500),db.from('payments').select('*').order('created_at',{ascending:false}).limit(500),db.from('events').select('*').order('created_at',{ascending:false}).limit(100),db.rpc('admin_checkout_requests'),db.from('provider_payments').select('*').order('verified_at',{ascending:false}).limit(500),db.from('provider_audit').select('*').order('created_at',{ascending:false}).limit(100),db.rpc('admin_billing_queue')]);
 for(const result of [licenses,payments,events])if(result.error)throw result.error;
 const checkoutAvailable=!checkouts.error;
 if(checkouts.error&&!['PGRST202','42883'].includes(checkouts.error.code))throw checkouts.error;
 for(const result of [providerPayments,providerAudit,queue])if(result.error&&!['PGRST202','PGRST205','42883','42P01'].includes(result.error.code))throw result.error;
 const [prices,changes,plans]=await Promise.all([db.from('extra_prices').select('*').order('kind'),db.rpc('admin_subscription_changes'),db.from('plan_prices').select('*').order('kind')]);
 for(const result of [prices,changes,plans])if(result.error&&!['PGRST202','PGRST205','42883','42P01'].includes(result.error.code))throw result.error;
 return {licenses:licenses.data as License[],payments:payments.data as Payment[],events:events.data as Event[],checkouts:(checkouts.data??[]) as Checkout[],checkoutAvailable,providerPayments:(providerPayments.data??[]) as ProviderPayment[],providerAudit:(providerAudit.data??[]) as ProviderAudit[],queue:(queue.data??[]) as BillingJob[],billingAvailable:![providerPayments,providerAudit,queue].some(r=>r.error),prices:(prices.data??[]) as ExtraPrice[],changes:(changes.data??[]) as SubscriptionChange[],plans:(plans.data??[]) as PlanPrice[],plansAvailable:!plans.error,subscriptionAvailable:!prices.error&&!changes.error};
}
export function moneyInput(text:string){const normalized=text.trim().replace(',','.');if(!/^\d{1,7}(\.\d{1,2})?$/.test(normalized))throw Error('Informe o valor com até duas casas decimais.');const [whole,fraction='']=normalized.split('.');return Number(whole)*100+Number(fraction.padEnd(2,'0'));}
export function friendly(error:unknown){const message=error&&typeof error==='object'&&'message'in error?String(error.message):String(error);const known:Record<string,string>={EXTRA_PRICE_NOT_CONFIGURED:'Configure primeiro o preço deste adicional no gestor, na aba Pagamentos.',LEGACY_EXTRA_PRICE_REQUIRED:'Esta licença já possui adicionais antigos sem preço unitário definido. É necessário conferir o contrato antes de alterar.',EXTRA_QUOTE_CHANGED:'O preço mudou desde o orçamento. Calcule novamente e confirme o novo valor.',EXTRAS_UNCHANGED:'A quantidade escolhida já corresponde à quantidade contratada.',SINGLE_CONTRACT_REQUIRED:'A alteração automática exige uma única assinatura vinculada. Confira o vínculo desta licença antes de continuar.',EXTRAS_NOT_ALLOWED:'Adicionais podem ser alterados em licenças pagas ativas.',INVALID_EXTRA_TOTAL:'O valor calculado não é válido. Confira o preço e o contrato.',CANCEL_LICENSE_FIRST:'Cancele a licença antes de solicitar a interrupção da recorrência.'};for(const [code,text] of Object.entries(known))if(message.includes(code))return text;if(message.includes('one_subscription_change'))return 'Já existe uma alteração em conferência para esta assinatura. Aguarde a conclusão.';if(/PLATFORM_ADMIN_REQUIRED|permission denied|row-level security/.test(message))return 'Esta conta não possui autorização administrativa confirmada.';if(/schema|function.*does not exist|PGRST/.test(message))return 'O serviço de licenças ainda não foi publicado ou configurado neste servidor.';if(message.includes('Invalid login credentials'))return 'Email ou senha incorretos.';return message;}
