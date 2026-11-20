import { useState } from 'react';
import { command, roles } from './database';
type Action=(task:()=>Promise<unknown>,success:string)=>Promise<void>;

export function RoleEditor({user,scope,target,member,name,current,busy,writable,action}:{user:string;scope:'farm'|'company';target:string;member:string;name:string;current:string;busy:boolean;writable:boolean;action:Action}) {
 const [role,setRole]=useState(current);
 return <form aria-label={'Alterar função de '+name} className="role-editor" onSubmit={event=>{
  event.preventDefault();
  if(role===current||busy||!writable)return;
  if(!window.confirm(`Alterar a função de ${name} de ${roles[current]} para ${roles[role]}? As permissões serão atualizadas e os lançamentos anteriores serão preservados.`))return;
  void action(()=>command(user,'change_staff_role',[scope,target,member,role,crypto.randomUUID(),current]),'Função atualizada. Conta, lançamentos e fazendas autorizadas preservados.');
 }}>
  <label>Função do funcionário<select aria-label={'Nova função de '+name} value={role} disabled={busy||!writable} onChange={event=>setRole(event.target.value)}><option value="admin">Administrador</option><option value="monitor">Monitor de campo</option><option value="operator">Responsável por aplicação</option></select></label>
  <button disabled={busy||!writable||role===current}>Salvar função</button>
 </form>;
}
