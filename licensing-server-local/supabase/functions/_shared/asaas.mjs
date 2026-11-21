const bases={sandbox:'https://api-sandbox.asaas.com/v3',production:'https://api.asaas.com/v3'};
const id=value=>{if(typeof value!=='string'||!value||value.length>200||!/^[a-zA-Z0-9_-]+$/.test(value))throw Error('INVALID_PROVIDER_ID');return value;};
export function createAsaasClient({environment='sandbox',apiKey,enableProduction=false,fetchImpl=fetch,onDiagnostic=()=>{}}){
 if(!Object.hasOwn(bases,environment))throw Error('INVALID_ASAAS_ENVIRONMENT');
 if(environment==='production'&&!enableProduction)throw Error('ASAAS_PRODUCTION_NOT_ENABLED');
 if(typeof apiKey!=='string'||!apiKey.trim())throw Error('ASAAS_KEY_NOT_CONFIGURED');
 const request=async(method,path,body)=>{
  const response=await fetchImpl(bases[environment]+path,{method,redirect:'error',headers:{access_token:apiKey,'User-Agent':'AgriGest-Licensing/1.0','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok){
   const data=await response.clone().json().catch(()=>null);
   const codes=(Array.isArray(data?.errors)?data.errors:[]).map(e=>e.code).filter(code=>typeof code==='string'&&/^(invalid_[a-z_]{1,50}|unauthorized|forbidden|resource_not_found)$/.test(code));
   const fields=['name','nextDueDate','subscription','billingTypes','chargeTypes','callback','items','externalReference','value','customer'].filter(field=>(data?.errors??[]).some(e=>typeof e.description==='string'&&e.description.includes(field)));
   onDiagnostic({operation:method+' '+path.split('?')[0],status:response.status,codes,fields});
   throw Error('ASAAS_REQUEST_FAILED_HTTP_'+response.status);
  }
  const text=await response.text();return text?JSON.parse(text):null;
 };
 return {
  async createRecurringCheckout({licenseId,requestId,label,period,amountMinor,nextDueDate}){
   if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>1000000000)throw Error('INVALID_AMOUNT');
   if(!['monthly','annual'].includes(period))throw Error('INVALID_PERIOD');
   if(typeof label!=='string'||!label.trim()||label.length>150)throw Error('INVALID_LABEL');
   let checkoutName='';for(const character of label.trim()){if(checkoutName.length+character.length>30)break;checkoutName+=character;}
   if(!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate??''))throw Error('INVALID_DUE_DATE');
   const response=await request('POST','/checkouts',{
    billingTypes:['CREDIT_CARD'],chargeTypes:['RECURRENT'],minutesToExpire:60,
    externalReference:id(licenseId)+':'+id(requestId),
    callback:{successUrl:'https://agrigeest.netlify.app/login?payment=processing',cancelUrl:'https://agrigeest.netlify.app/login?payment=cancelled',expiredUrl:'https://agrigeest.netlify.app/login?payment=expired'},
    items:[{name:checkoutName,description:'Licença '+(period==='annual'?'anual':'mensal')+' do AgriGest',quantity:1,value:amountMinor/100}],
    subscription:{cycle:period==='annual'?'YEARLY':'MONTHLY',nextDueDate},
   });
   const checkoutId=id(response.id),origin=environment==='sandbox'?'https://sandbox.asaas.com':'https://asaas.com';
   return {id:checkoutId,url:origin+'/checkoutSession/show?id='+encodeURIComponent(checkoutId),confirmed:false};
  },
  getPayment:paymentId=>request('GET','/payments/'+id(paymentId)),
  getSubscription:subscriptionId=>request('GET','/subscriptions/'+id(subscriptionId)),
  cancelCheckout:checkoutId=>request('POST','/checkouts/'+id(checkoutId)+'/cancel'),
 };
}
export async function validateWebhookToken(provided,expected){
 if(typeof provided!=='string'||typeof expected!=='string'||!/^\S{32,255}$/.test(expected))return false;
 if(provided.length>255)return false;
 const encode=new TextEncoder();const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(provided)),crypto.subtle.digest('SHA-256',encode.encode(expected))]);
 const left=new Uint8Array(a),right=new Uint8Array(b);let diff=0;for(let n=0;n<left.length;n++)diff|=left[n]^right[n];return diff===0;
}
export function normalizeAsaasEvent(raw){
 if(!raw||typeof raw!=='object'||typeof raw.id!=='string'||!/^evt_[^\s\x00-\x1f]{1,240}$/.test(raw.id)||typeof raw.event!=='string'||!/^(PAYMENT|SUBSCRIPTION|CHECKOUT)_[A-Z_]{1,80}$/.test(raw.event))throw Error('INVALID_WEBHOOK');
 const clean={id:raw.id,event:raw.event};
 if(typeof raw.dateCreated==='string')clean.dateCreated=raw.dateCreated.slice(0,40);
 for(const name of ['payment','subscription','checkout']){
  const resource=raw[name];if(!resource||typeof resource!=='object')continue;
  clean[name]={};for(const key of ['id','status','customer','subscription','checkoutSession','externalReference','billingType','dueDate','paymentDate','confirmedDate','deleted']){
   const value=resource[key];if(typeof value==='string')clean[name][key]=value.slice(0,250);else if(typeof value==='boolean')clean[name][key]=value;
  }
  if(typeof resource.value==='number'&&Number.isFinite(resource.value))clean[name].value=resource.value;
 }
 return clean;
}
export function createAsaasWebhookHandler({secret,enqueue}){
 return async request=>{
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'METHOD_NOT_ALLOWED'});
  if(!secret||!/^\S{32,255}$/.test(secret))return reply(503,{error:'WEBHOOK_NOT_CONFIGURED'});
  if(!await validateWebhookToken(request.headers.get('asaas-access-token'),secret))return reply(401,{error:'INVALID_TOKEN'});
  try{
   const reader=request.body?.getReader();if(!reader)return reply(400,{error:'INVALID_BODY'});
   const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();return reply(413,{error:'BODY_TOO_LARGE'});}chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
   let event;try{event=normalizeAsaasEvent(JSON.parse(new TextDecoder().decode(bytes)));}catch{return reply(400,{error:'INVALID_EVENT'});}
   await enqueue(event);return reply(200,{received:true});
  }catch{return reply(503,{error:'PERSISTENCE_UNAVAILABLE'});}
 };
}
