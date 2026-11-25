import {useState} from 'react';import {invoke,isTauri} from '@tauri-apps/api/core';
export default function LocalPortalLink({page,label}:{page:'mailbox'|'invites';label:string}){
 const [notice,setNotice]=useState(''),url=page==='mailbox'?'http://127.0.0.1:48724':'http://127.0.0.1:48780/convite';
 return <span className="block space-y-2"><button className="underline" onClick={()=>void(async()=>{try{if(isTauri())await invoke('open_pilot_page',{page});else if(!window.open(url,'_blank','noopener,noreferrer'))setNotice('Abra este endereço no navegador: '+url);}catch{setNotice('Abra este endereço no navegador: '+url);}})()}>{label}</button><button className="text-sm underline" onClick={()=>void navigator.clipboard.writeText(url).then(()=>setNotice('Endereço copiado.')).catch(()=>setNotice(url))}>Copiar endereço</button>{notice&&<span className="block text-sm break-all" role="status">{notice}</span>}</span>;
}
