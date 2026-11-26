// Comparação conservadora: preserva literais e identificadores entre aspas.
// Não executa SQL e não afirma equivalência de código que tenha tokens diferentes.
function tokens(sql){
 const result=[];let i=0;
 while(i<sql.length){
  const c=sql[i];if(/\s/.test(c)){i++;continue;}
  if(sql.slice(i,i+2)==='--'){const end=sql.indexOf('\n',i+2);i=end<0?sql.length:end+1;continue;}
  if(sql.slice(i,i+2)==='/*'){let depth=1;i+=2;while(i<sql.length&&depth){if(sql.slice(i,i+2)==='/*'){depth++;i+=2;}else if(sql.slice(i,i+2)==='*/'){depth--;i+=2;}else i++;}if(depth)throw Error('UNTERMINATED_SQL_COMMENT');continue;}
  if(c==="'"||c==='"'){const start=i++;let closed=false;while(i<sql.length){if(sql[i]==='\\'&&c==="'"){i+=2;continue;}if(sql[i]===c){if(sql[i+1]===c){i+=2;continue;}i++;closed=true;break;}i++;}if(!closed)throw Error('UNTERMINATED_SQL_LITERAL');result.push(sql.slice(start,i));continue;}
  const dollar=sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0];
  if(dollar){const end=sql.indexOf(dollar,i+dollar.length);if(end<0)throw Error('UNTERMINATED_SQL_DOLLAR_LITERAL');result.push(sql.slice(i,end+dollar.length));i=end+dollar.length;continue;}
  const word=sql.slice(i).match(/^[a-zA-Z_0-9$]+/)?.[0];if(word){result.push(word);i+=word.length;continue;}
  if(/[+\-*\/<>=~!@#%^&|`?:]/.test(c)){let end=i+1;while(end<sql.length&&/[+\-*\/<>=~!@#%^&|`?:]/.test(sql[end])&&!['--','/*'].includes(sql.slice(end,end+2)))end++;result.push(sql.slice(i,end));i=end;continue;}
  result.push(c);i++;
 }
 return result;
}
export function comparableFunction(definition){
 if(!/\bLANGUAGE\s+(?:plpgsql|sql)\b/i.test(definition))return JSON.stringify(['exact',definition]);
 const body=/\bAS\s+(\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$)/i.exec(definition);if(!body)throw Error('EXPECTED_SQL_FUNCTION_BODY');
 const start=body.index+body[0].length,end=definition.indexOf(body[1],start);if(end<0)throw Error('UNTERMINATED_SQL_FUNCTION');
 return JSON.stringify([tokens(definition.slice(0,body.index)),tokens(definition.slice(start,end)),tokens(definition.slice(end+body[1].length))]);
}
export function comparePublicFunctions(previous,current){
 const differences=[];
 for(const f of current.filter(f=>f.name.startsWith('public.'))){
  const old=previous.find(p=>p.name===f.name.slice(7)&&p.signature===f.arguments);
  if(!old){differences.push({name:f.name,arguments:f.arguments,kind:'new-or-signature-changed'});continue;}
  if(old.definition.replace(/\r/g,'')===f.definition.replace(/\r/g,''))continue;
  let cosmetic=false;try{cosmetic=comparableFunction(old.definition)===comparableFunction(f.definition);}catch{/* Unknown syntax remains a required review. */}
  differences.push({name:f.name,arguments:f.arguments,kind:cosmetic?'comments-or-whitespace':'code-review-required'});
 }
 for(const old of previous)if(!current.some(f=>f.name==='public.'+old.name&&f.arguments===old.signature))differences.push({name:'public.'+old.name,arguments:old.signature,kind:'missing-or-signature-changed'});
 return differences;
}
export function comparePublicPolicies(previous,current){
 const canonical=p=>JSON.stringify([p.permissive,[...(p.roles??[])].sort(),p.cmd,p.qual,p.with_check]);
 const key=p=>p.schemaname+'.'+p.tablename+'.'+p.policyname,old=new Map(previous.filter(p=>p.schemaname==='public').map(p=>[key(p),p])),live=new Map(current.filter(p=>p.schemaname==='public').map(p=>[key(p),p]));
 return [...new Set([...old.keys(),...live.keys()])].sort().filter(k=>!old.has(k)||!live.has(k)||canonical(old.get(k))!==canonical(live.get(k))).map(k=>({policy:k,kind:!old.has(k)?'new':!live.has(k)?'missing':'changed'}));
}
