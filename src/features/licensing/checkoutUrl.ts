const prefix='https://sandbox.asaas.com/checkoutSession/show?id=';
export function approvedCheckoutUrl(value:unknown):string|null {
 if(typeof value!=='string'||!value.startsWith(prefix))return null;
 const id=value.slice(prefix.length);
 return id.length>=1&&id.length<=200&&!/[^A-Za-z0-9_-]/.test(id)?value:null;
}
