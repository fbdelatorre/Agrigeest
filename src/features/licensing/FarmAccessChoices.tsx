import {useState} from 'react';
export type TeamFarm={id:string;name:string;active:boolean};
export default function FarmAccessChoices({farms,selected,onChange,disabled=false}:{farms:TeamFarm[];selected:string[];onChange:(ids:string[])=>void;disabled?:boolean}){
 const [query,setQuery]=useState('');const normalize=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
 const visible=farms.filter(f=>normalize(f.name).includes(normalize(query)));
 return <fieldset className="rounded-lg border p-3 space-y-3" disabled={disabled}>
  <legend className="px-1 font-medium">Fazendas permitidas para este funcionário</legend>
  <p className="text-sm text-gray-600">Somente as fazendas marcadas serão compartilhadas. Novas fazendas não entram automaticamente. Sem seleção, a pessoa fica na empresa sem acesso às fazendas por este vínculo.</p>
  <label className="block">Buscar fazenda<input className="mt-1 block w-full rounded-lg border px-3 py-2" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  {visible.map(f=><label key={f.id} className="flex items-start gap-2"><input className="mt-1" type="checkbox" checked={selected.includes(f.id)} disabled={!f.active&&!selected.includes(f.id)} onChange={e=>onChange(e.target.checked?[...selected,f.id]:selected.filter(id=>id!==f.id))}/><span className="break-words">{f.name}{!f.active?' — licença inativa':''}</span></label>)}
  {!visible.length&&<p>{farms.length?'Nenhuma fazenda corresponde à busca.':'Nenhuma fazenda disponível para compartilhar.'}</p>}
  <p className="text-sm">{selected.length} {selected.length===1?'fazenda selecionada':'fazendas selecionadas'}.</p>
 </fieldset>;
}
