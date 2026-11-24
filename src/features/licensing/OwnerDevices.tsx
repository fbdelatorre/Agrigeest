import {useCallback,useEffect,useRef,useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

type Proof={installation:string;secret:string};
type Device={id:string;label:string;created_at:string;last_seen_at:string;revoked_at:string|null};
type Summary={limit:number;used:number;active:boolean;devices:Device[]};
const suggestedName=()=>{const ua=navigator.userAgent;const system=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iPhone ou iPad':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'Mac':'Meu aparelho';return system+('__TAURI_INTERNALS__'in window?' — aplicativo':' — navegador');};
function storedProof(key:string):Proof|null{const raw=localStorage.getItem(key);if(!raw)return null;const p=JSON.parse(raw);if(typeof p?.installation!=='string'||!/^[a-f0-9-]{36}$/i.test(p.installation)||typeof p.secret!=='string'||!/^[a-f0-9]{64}$/.test(p.secret))throw Error('Não foi possível ler a identificação desta instalação. Revogue a autorização antiga antes de cadastrar outra; não apague os dados do aplicativo.');return p;}
function message(error:unknown){const code=error&&typeof error==='object'&&'message'in error?String(error.message):String(error);
 if(code.includes('DEVICE_LIMIT_REACHED'))return 'Todas as vagas de aparelhos estão ocupadas. Revogue uma instalação antiga ou contrate um usuário adicional, que libera mais 2 vagas após a confirmação do pagamento.';
 if(code.includes('DEVICE_SESSION_ALREADY_REGISTERED'))return 'Esta sessão já possui uma instalação autorizada. Revogue a autorização antiga correspondente antes de cadastrar outra.';
 if(code.includes('DEVICE_PROOF_REQUIRED'))return 'A identificação desta instalação não corresponde à autorização salva. Revogue a autorização antiga antes de cadastrar outra.';
 if(code.includes('ACTIVE_LICENSE_REQUIRED'))return 'A licença precisa estar ativa para autorizar uma instalação. As autorizações e o histórico continuam salvos.';
 if(code.includes('LICENSE_MEMBERSHIP_REQUIRED'))return 'Seu vínculo com esta empresa não está mais ativo. A conta e os dados continuam preservados.';
 if(code.includes('DEVICE_SESSION_REQUIRED')||code.includes('TEAM_SESSION_REQUIRED'))return 'Entre novamente na sua conta para autorizar esta instalação. Preserve os lançamentos pendentes.';
 if(/PGRST|schema|function.*does not exist/.test(code))return 'O controle de aparelhos ainda não foi habilitado neste servidor de testes.';
 return 'Não foi possível consultar ou salvar a autorização. Verifique a conexão com o servidor e tente novamente. Seus dados continuam salvos.';
}
export default function OwnerDevices({client,connectionId,userId,licenseId,member=false}:{client:SupabaseClient;connectionId:string;userId:string;licenseId:string;member?:boolean}){
 const key='agrigest-license-installation:'+connectionId+':'+userId+':'+licenseId;
 const [data,setData]=useState<Summary>(),[authorized,setAuthorized]=useState(false),[name,setName]=useState(suggestedName),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);const lock=useRef(false),epoch=useRef(0);
 const call=useCallback(async<T,>(fn:string,args:Record<string,unknown>)=>{const r=await client.schema('licensing').rpc(fn,{p_license:licenseId,...args});if(r.error)throw r.error;return r.data as T;},[client,licenseId]);
 const refresh=useCallback(async()=>{const summary=await call<Summary>(member?'my_devices':'owner_devices',{}),proof=storedProof(key);const valid=proof?await call<boolean>('device_access',{p_installation:proof.installation,p_secret:proof.secret}):false;return {summary,valid};},[call,key,member]);
 useEffect(()=>{const current=++epoch.current;setData(undefined);setAuthorized(false);setNotice('');void refresh().then(r=>{if(epoch.current===current){setData(r.summary);setAuthorized(r.valid);}}).catch(e=>{if(epoch.current===current){setNotice(message(e));setFailed(true);}});return()=>{epoch.current++;};},[refresh]);
 const act=async(task:()=>Promise<unknown>,success:string)=>{if(lock.current)return;lock.current=true;setBusy(true);setNotice('');setFailed(false);const current=epoch.current;try{await task();const r=await refresh();if(epoch.current===current){setData(r.summary);setAuthorized(r.valid);setNotice(success);}}catch(e){if(epoch.current===current){setNotice(message(e));setFailed(true);}}finally{lock.current=false;setBusy(false);}};
 const register=()=>act(async()=>{let proof=storedProof(key);if(!proof){proof={installation:crypto.randomUUID(),secret:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')};localStorage.setItem(key,JSON.stringify(proof));}await call('register_device',{p_installation:proof.installation,p_secret:proof.secret,p_label:name.trim()});},'Instalação autorizada pelo servidor.');
 return <details className="owner-devices"><summary>Aparelhos autorizados{data?' · '+data.used+' de '+data.limit:''}</summary>
 <p>Cada instalação ou navegador ocupa uma vaga, mesmo no mesmo computador. O cadastro usa a cota compartilhada da empresa no Sandbox; ainda não bloqueia o AgriGest principal.</p>
 {notice&&<p role={failed?'alert':'status'}>{notice}</p>}
 {data&&<><p>{authorized?'Esta instalação está autorizada nesta sessão.':'Esta instalação ainda não está autorizada nesta sessão.'}</p>{data.used>data.limit&&<p role="alert">Há mais instalações autorizadas que o limite atual. Escolha quais revogar para restabelecer a cota; nenhum dado será apagado.</p>}
 {!data.active&&<p>Licença inativa: novas autorizações estão bloqueadas. Você pode consultar e revogar as anteriores.</p>}
 <label>Nome deste aparelho<input value={name} maxLength={80} onChange={e=>setName(e.target.value)}/></label><button disabled={busy||!data.active||name.trim().length<2} onClick={()=>void register()}>{authorized?'Atualizar nome desta instalação':'Autorizar esta instalação'}</button>
 {data.devices.length===0&&<p>Nenhuma instalação cadastrada.</p>}{data.devices.map(d=><article key={d.id}><strong>{d.label}</strong><p>{d.revoked_at?'Autorização revogada':'Autorizada'} · Última autorização: {new Date(d.last_seen_at).toLocaleString('pt-BR')}</p>{!d.revoked_at&&<button disabled={busy} onClick={()=>{if(window.confirm('Revogar a autorização de '+d.label+'? Isso libera uma vaga e preserva a conta, o histórico e os lançamentos pendentes.'))void act(()=>call(member?'revoke_my_device':'revoke_device',{p_device:d.id}),'Autorização revogada. A vaga foi liberada e os dados foram preservados.');}}>Revogar autorização</button>}</article>)}</>}
 <button disabled={busy} onClick={()=>void act(async()=>{},'Autorizações atualizadas do servidor.')}>Atualizar aparelhos</button>
 </details>;
}
