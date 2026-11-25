async function start(){
 const r=await fetch('http://127.0.0.1:48721/pilot/config',{signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('LOCAL_UNAVAILABLE');const c=await r.json();
 if(c.apiUrl!=='http://127.0.0.1:48721'||typeof c.anonKey!=='string')throw Error('LOCAL_REQUIRED');const payload=JSON.parse(atob(c.anonKey.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(payload.role!=='anon')throw Error('PUBLIC_KEY_REQUIRED');
 (window as Window&{__AGRIGEST_MANAGER_PILOT__?:unknown}).__AGRIGEST_MANAGER_PILOT__={apiUrl:c.apiUrl,anonKey:c.anonKey};await import('./src/main');
}
start().catch(()=>{document.getElementById('root')!.textContent='Não foi possível conectar ao gestor do piloto. Abra o Docker e execute Testar-Gestor-Piloto-Local.cmd.';});
