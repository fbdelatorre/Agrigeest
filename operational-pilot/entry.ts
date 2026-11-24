// O pacote recebe apenas configuração pública e não inclui dados do usuário.
async function start(){
 const response=await fetch('http://127.0.0.1:48721/pilot/config',{signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Servidor local indisponível.');
 const config=await response.json();
 if(config.apiUrl!=='http://127.0.0.1:48721'||!/^[a-f0-9-]{36}$/i.test(config.institutionId??'')||typeof config.anonKey!=='string')throw Error('Configuração local inválida.');
 const payload=JSON.parse(atob(config.anonKey.split('.')[1].replaceAll('-','+').replaceAll('_','/')));
 if(payload.role!=='anon')throw Error('A chave do piloto deve ser pública.');
 (window as Window&{__AGRIGEST_PILOT__?:unknown}).__AGRIGEST_PILOT__=config;
 await import('../src/main');
}
start().catch(()=>{const root=document.getElementById('root');if(!root)return;root.replaceChildren();const p=document.createElement('p');p.textContent='AgriGest — TESTE LOCAL. Não foi possível conectar. Abra o Docker e execute Testar-AgriGest-Piloto-Local.cmd neste computador. Os dados continuam preservados.';const button=document.createElement('button');button.textContent='Tentar novamente';button.onclick=()=>location.reload();root.append(p,button);});
