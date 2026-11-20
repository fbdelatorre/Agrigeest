import { PGlite, type Transaction } from '@electric-sql/pglite';
import schema from '../schema.sql?raw';
import seed from '../seed.sql?raw';
import wasmUrl from '@electric-sql/pglite/pglite.wasm?url';
import initdbUrl from '@electric-sql/pglite/initdb.wasm?url';
import bundleUrl from '@electric-sql/pglite/pglite.data?url';

export const demoId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const accounts = [
  {id:demoId(1),name:'Ana',label:'Proprietária da Aurora',email:'ana@example.test'},
  {id:demoId(2),name:'Bruno',label:'Proprietário da Boa Vista',email:'bruno@example.test'},
  {id:demoId(3),name:'Carla',label:'Administradora da Aurora',email:'carla@example.test'},
  {id:demoId(4),name:'Diego',label:'Responsável por aplicação',email:'diego@example.test'},
  {id:demoId(5),name:'Eva',label:'Monitora da Aurora',email:'eva@example.test'},
  {id:demoId(6),name:'Fábio',label:'Consultor e dono da Cedro',email:'fabio@example.test'},
  {id:demoId(7),name:'Gabriel',label:'Consultor sem convite',email:'gabriel@example.test'},
];
export const roles: Record<string,string> = {owner:'Proprietário',admin:'Administrador',operator:'Responsável por aplicação',monitor:'Monitor de campo',consultant:'Consultor'};

let opening: Promise<PGlite> | undefined;
function database() {
  opening ??= (async () => {
    const get = async (file: string) => {
      const response = await fetch(file);
      if (!response.ok) throw new Error('Arquivo local indisponível: ' + file);
      return response;
    };
    const [wasm,initdb,bundle] = await Promise.all([get(wasmUrl),get(initdbUrl),get(bundleUrl)]);
    const db = await PGlite.create('idb://agrigest-licensing-lab-v1', {
      pgliteWasmModule:await WebAssembly.compile(await wasm.arrayBuffer()),
      initdbWasmModule:await WebAssembly.compile(await initdb.arrayBuffer()),fsBundle:await bundle.blob(),
    });
    if (!(await db.query<{name:string|null}>("SELECT to_regnamespace('license_lab') AS name")).rows[0]?.name) {
      await db.exec("SELECT set_config('agrigest.licensing_sandbox','synthetic-only-v1',false)");
      await db.transaction(async tx => { await tx.exec(schema.replace('BEGIN;','').replace('COMMIT;',''));await tx.exec(seed); });
    }
    return db;
  })();
  return opening;
}

export async function asUser<T>(user: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
  if (!accounts.some(account => account.id === user)) throw new Error('Conta fictícia inválida.');
  const db=await database();
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE license_lab_client');
    await tx.query("SELECT set_config('license_lab.actor',$1,true)",[user]);
    return run(tx);
  });
}

export type Farm = {id:string;name:string;role:string};
export type Area = {id:string;name:string;hectares:number};
export type Product = {id:string;name:string;quantity:number};
export type Report = {id:string;area_id:string;author_id:string;observed_on:string;stage:string;description:string};
export type Rainfall = {id:string;area_id:string;author_id:string;observed_on:string;millimeters:number};
export type Recommendation = {id:string;area_id:string;report_id:string;author_id:string;product_id:string;dose:number;description:string};
export type Invitation = {id:string;farm_name:string;role:string;status:string;expires_at:string;recipient_id?:string};
export type Member = {user_id:string;role:string;active:boolean};
export type Application = {id:string;area_id:string;author_id:string;product_id:string;quantity:number};
export type Audit = {id:string;action:string;record_id:string;actor_id:string;occurred_at:string};
export type Snapshot = {farms:Farm[];farm?:Farm;areas:Area[];products:Product[];reports:Report[];rainfall:Rainfall[];
  recommendations:Recommendation[];applications:Application[];inbox:Invitation[];members:Member[];outgoing:Invitation[];audit:Audit[]};

export async function load(user: string, selected?: string): Promise<Snapshot> {
  return asUser(user,async tx => {
    const farms=(await tx.query<Farm>(`SELECT f.id,f.name,m.role FROM license_lab.farms f JOIN license_lab.memberships m
      ON m.farm_id=f.id WHERE m.user_id=license_lab.actor() AND m.active ORDER BY f.name`)).rows;
    const farm=farms.find(f=>f.id===selected) ?? farms[0];
    const inbox=(await tx.query<Invitation>('SELECT * FROM license_lab.inbox() ORDER BY expires_at DESC')).rows;
    const empty={farms,farm,inbox,areas:[],products:[],reports:[],rainfall:[],recommendations:[],applications:[],members:[],outgoing:[],audit:[]};
    if (!farm) return empty;
    const query=async <T>(sql:string)=>(await tx.query<T>(sql,[farm.id])).rows;
    return {...empty,
      areas:await query<Area>('SELECT id,name,hectares::float8 FROM license_lab.areas WHERE farm_id=$1 ORDER BY name'),
      products:await query<Product>('SELECT id,name,quantity::float8 FROM license_lab.products WHERE farm_id=$1 ORDER BY name'),
      reports:await query<Report>('SELECT id,area_id,author_id,observed_on::text,stage,description FROM license_lab.reports WHERE farm_id=$1 ORDER BY observed_on DESC,id'),
      rainfall:await query<Rainfall>('SELECT id,area_id,author_id,observed_on::text,millimeters::float8 FROM license_lab.rainfall WHERE farm_id=$1 ORDER BY observed_on DESC,id'),
      recommendations:await query<Recommendation>('SELECT id,area_id,report_id,author_id,product_id,dose::float8,description FROM license_lab.recommendations WHERE farm_id=$1 ORDER BY id'),
      applications:await query<Application>('SELECT id,area_id,author_id,product_id,quantity::float8 FROM license_lab.applications WHERE farm_id=$1 ORDER BY created_at DESC'),
      members:await query<Member>('SELECT user_id,role,active FROM license_lab.memberships WHERE farm_id=$1 ORDER BY role,user_id'),
      outgoing:farm.role==='owner' ? await query<Invitation>('SELECT id,recipient_id,role,status,expires_at::text FROM license_lab.invitations WHERE farm_id=$1 ORDER BY expires_at DESC') : [],
      audit:farm.role==='owner' ? await query<Audit>("SELECT id,actor_id,action,record_id,to_char(occurred_at,'DD/MM/YYYY HH24:MI') AS occurred_at FROM license_lab.audit WHERE farm_id=$1 ORDER BY occurred_at DESC LIMIT 30") : [],
    };
  });
}

const editable = ['reports','rainfall','recommendations'] as const;
export type RecordKind = typeof editable[number];
export async function save(user:string,farm:string,kind:RecordKind,data:Record<string,string>,id?:string) {
  if (!editable.includes(kind)) throw new Error('Registro inválido.');
  const columns = kind==='reports' ? ['observed_on','stage','description'] : kind==='rainfall' ? ['observed_on','millimeters'] : ['dose','description'];
  const extra = kind==='recommendations' ? ['report_id','product_id'] : [];
  await asUser(user,async tx => {
    const values = columns.map(key=>data[key]);
    if (id) {
      const updated=await tx.query(`UPDATE license_lab.${kind} SET ${columns.map((key,index)=>key+'=$'+(index+1)).join(',')} WHERE id=$${values.length+1} AND farm_id=$${values.length+2} RETURNING id`,[...values,id,farm]);
      if (!updated.rows.length) throw new Error('Registro indisponível ou sem permissão para editar.');
    } else {
      const fields=['farm_id','area_id','author_id',...columns,...extra];
      await tx.query(`INSERT INTO license_lab.${kind}(${fields.join(',')}) VALUES(${fields.map((_,index)=>'$'+(index+1)).join(',')})`,[farm,data.area_id,user,...values,...extra.map(key=>data[key])]);
    }
  });
}
export async function remove(user:string,farm:string,kind:RecordKind,id:string) {
  if (!editable.includes(kind)) throw new Error('Registro inválido.');
  await asUser(user,async tx => {
    if (!(await tx.query(`DELETE FROM license_lab.${kind} WHERE id=$1 AND farm_id=$2 RETURNING id`,[id,farm])).rows.length)
      throw new Error('Registro indisponível ou sem permissão para excluir.');
  });
}
export async function command(user:string,name:'invite'|'accept_invitation'|'revoke_invitation'|'revoke_member'|'apply_operation',args:unknown[]) {
  const sizes={invite:3,accept_invitation:1,revoke_invitation:1,revoke_member:2,apply_operation:4};
  if (!(name in sizes) || sizes[name]!==args.length) throw new Error('Ação inválida.');
  return asUser(user,tx=>tx.query(`SELECT license_lab.${name}(${args.map((_,index)=>'$'+(index+1)).join(',')})`,args));
}
export function explain(error:unknown):string {
  const message=error instanceof Error ? error.message : String(error);
  const translations:Record<string,string>={OWNER_REQUIRED:'Somente o proprietário dessa fazenda pode fazer isso.',INVITATION_FORBIDDEN:'O convite pertence a outra conta.',
    INVITATION_UNAVAILABLE:'O convite já foi usado, revogado ou venceu.',DEMO_ACCOUNT_NOT_FOUND:'Use o email de uma das contas fictícias listadas.',
    ALREADY_MEMBER:'Essa pessoa já tem vínculo ativo com a fazenda.',INVITATION_PENDING:'Já existe um convite pendente para essa pessoa.',
    OWNER_IMMUTABLE:'O proprietário não pode remover o próprio vínculo neste protótipo.',APPLICATION_FORBIDDEN:'Seu perfil não pode realizar aplicações nesta fazenda.',
    INSUFFICIENT_STOCK:'Estoque fictício insuficiente.',MEMBER_NOT_FOUND:'Não há vínculo ativo para remover.'};
  for(const [key,value] of Object.entries(translations)) if(message.includes(key)) return value;
  if(message.includes('foreign key')) return 'Há um vínculo com outro registro. A alteração foi bloqueada para preservar os dados.';
  if(message.includes('row-level security')||message.includes('permission denied')) return 'O banco local bloqueou uma ação não permitida para esse perfil.';
  if(message.includes('check constraint')) return 'Confira as datas, os valores e os campos obrigatórios.';
  return message;
}
