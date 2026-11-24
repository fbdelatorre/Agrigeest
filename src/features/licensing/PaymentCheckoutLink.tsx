import {useRef,useState,type MouseEvent} from 'react';
import {invoke,isTauri} from '@tauri-apps/api/core';
import {approvedCheckoutUrl} from './checkoutUrl';

export default function PaymentCheckoutLink({url}:{url:string}){
 const input=useRef<HTMLInputElement>(null),lock=useRef(false);const [message,setMessage]=useState(''),[failed,setFailed]=useState(false),[opening,setOpening]=useState(false);
 const approved=approvedCheckoutUrl(url);
 if(!approved)return <p role="alert">O link de pagamento não é válido neste ambiente. Atualize seus planos.</p>;
 const open=async(e:MouseEvent<HTMLAnchorElement>)=>{
  if(!isTauri())return;
  e.preventDefault();if(lock.current)return;lock.current=true;setOpening(true);setMessage('');setFailed(false);
  try{await invoke('open_payment_checkout',{url:approved});setMessage('Pagamento enviado ao navegador. Após concluir, volte aqui e clique em Conferir pagamento.');}
  catch{setFailed(true);setMessage('Não foi possível abrir o navegador. Use Copiar link e cole o endereço no navegador.');}
  finally{lock.current=false;setOpening(false);}
 };
 const copy=async()=>{setFailed(false);try{await navigator.clipboard.writeText(approved);setMessage('Link copiado. Cole no navegador para abrir o mesmo pagamento.');}catch{input.current?.focus();input.current?.select();setMessage('O link foi selecionado. Pressione Ctrl+C para copiar e cole no navegador.');}};
 return <div><a href={approved} target="_blank" rel="noopener noreferrer" aria-disabled={opening} onClick={e=>void open(e)}>Abrir pagamento no Asaas Sandbox</a><button type="button" onClick={()=>void copy()}>Copiar link do pagamento</button><label>Link do pagamento<input ref={input} readOnly value={approved} onFocus={e=>e.target.select()}/></label>{message&&<p role={failed?'alert':'status'}>{message}</p>}</div>;
}
