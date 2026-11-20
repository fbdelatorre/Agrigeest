import { PGlite, type Transaction } from '@electric-sql/pglite';
import schema from '../schema.sql?raw';
import seed from '../seed.sql?raw';
import lifecycle from '../lifecycle.sql?raw';
import consultancy from '../consultancy.sql?raw';
import roleChanges from '../role-changes.sql?raw';
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
    if (!(await db.query<{name:string|null}>("SELECT to_regclass('license_lab.subscriptions') AS name")).rows[0]?.name) {
      await db.exec("SELECT set_config('agrigest.licensing_sandbox','synthetic-only-v1',false)");
      await db.transaction(tx=>tx.exec(lifecycle));
    }
    if (!(await db.query<{name:string|null}>("SELECT to_regclass('license_lab.company_members') AS name")).rows[0]?.name) {
      await db.exec("SELECT set_config('agrigest.licensing_sandbox','synthetic-only-v1',false)");
      await db.transaction(tx=>tx.exec(consultancy));
    }
    if (!(await db.query<{name:string|null}>("SELECT to_regprocedure('license_lab.change_staff_role(text,uuid,uuid,text,uuid,text)') AS name")).rows[0]?.name) {
      await db.exec("SELECT set_config('agrigest.licensing_sandbox','synthetic-only-v1',false)");
      await db.transaction(tx=>tx.exec(roleChanges));
    }
    return db;
  })();
  return opening;
}

export async function asUser<T>(user: string, run: (tx: Transaction) => Promise<T>): Promise<T> {
  const db=await database();
  if (!(await db.query('SELECT id FROM license_lab.people WHERE id=$1',[user])).rows.length) throw new Error('Conta fictícia inválida.');
  return db.transaction(async tx => {
    await tx.exec('SET LOCAL ROLE license_lab_client');
    await tx.query("SELECT set_config('license_lab.actor',$1,true)",[user]);
    return run(tx);
  });
}

export type Farm = {id:string;name:string;role:string;writable:boolean;access_source:string};
export type Company = {user_id:string;name:string;role:string};
export type CompanyMember = {company_owner:string;user_id:string;role:string;active:boolean};
export type CompanyAccess = {company_owner:string;user_id:string;farm_id:string;active:boolean;valid:boolean};
export type CompanyInvite = {id:string;company_owner:string;email:string;role:string;status:string;token?:string};
export type DelegatableFarm = {id:string;name:string;company_owner:string};
export type Account = {id:string;name:string;email:string;label:string};
export type Plan = {id:string;name:string;farm_id:string|null;status:string;period:string;extras:number;complimentary:boolean;free_until:string|null;entitled:boolean;seats:number;devices:number;used:number;reserved:number};
export type Device = {id:string;subscription_id:string;user_id:string;name:string;active:boolean};
export type Mail = {id:string;recipient_email:string;token:string};
export type LicenseEvent = {id:string;subscription_id:string;action:string;details:Record<string,unknown>;created_at:string};
export type PlatformPlan = {id:string;name:string;owner_email:string;status:string;complimentary:boolean;free_until:string|null;extras:number};
export type Area = {id:string;name:string;hectares:number};
export type Product = {id:string;name:string;quantity:number};
export type Report = {id:string;area_id:string;author_id:string;observed_on:string;stage:string;description:string};
export type Rainfall = {id:string;area_id:string;author_id:string;observed_on:string;millimeters:number};
export type Recommendation = {id:string;area_id:string;report_id:string;author_id:string;product_id:string;dose:number;description:string};
export type Invitation = {id:string;farm_name:string;role:string;status:string;expires_at:string;recipient_id?:string;email?:string;kind?:string;farm_names?:string[]};
export type Member = {user_id:string;role:string;active:boolean};
export type Application = {id:string;area_id:string;author_id:string;product_id:string;quantity:number};
export type Audit = {id:string;action:string;record_id:string;actor_id:string;occurred_at:string};
export type Snapshot = {farms:Farm[];farm?:Farm;areas:Area[];products:Product[];reports:Report[];rainfall:Rainfall[];
  recommendations:Recommendation[];applications:Application[];inbox:Invitation[];members:Member[];outgoing:Invitation[];audit:Audit[];
  plans:Plan[];devices:Device[];mail:Mail[];events:LicenseEvent[];platform:boolean;platformPlans:PlatformPlan[];directory:Account[];
  companies:Company[];companyMembers:CompanyMember[];companyAccess:CompanyAccess[];companyInvites:CompanyInvite[];delegatable:DelegatableFarm[]};

// Deliberate local simulation directory, not a production user-search API.
export async function demoAccounts():Promise<Account[]> {
  return (await (await database()).query<Account>("SELECT id,split_part(name,' · ',1) AS name,email,'Conta fictícia' AS label FROM license_lab.people ORDER BY name")).rows;
}
export async function previewInvite(token:string) {
  return (await (await database()).query<{email:string;farm_name:string;role:string;kind:string;farm_names:string[]}>('SELECT * FROM license_lab.preview_invite_v3($1)',[token])).rows[0];
}
export async function registerDemo(name:string,email:string,verified:boolean,token?:string) {
  return (await (await database()).transaction(async tx=>{
    await tx.exec('SET LOCAL ROLE license_lab_client');
    return tx.query<{id:string}>('SELECT license_lab.register_demo($1,$2,$3,$4) AS id',[name,email,verified,token??null]);
  })).rows[0].id;
}

export async function load(user: string, selected?: string): Promise<Snapshot> {
  const directory=await demoAccounts();
  return asUser(user,async tx => {
    const farms=(await tx.query<Farm>(`SELECT f.id,f.name,license_lab.role_at(f.id) AS role,license_lab.writable(f.id) AS writable,
      CASE WHEN EXISTS(SELECT 1 FROM license_lab.memberships m WHERE m.farm_id=f.id AND m.user_id=license_lab.actor() AND m.active) THEN 'Vínculo direto com a fazenda' ELSE 'Acesso selecionado pela consultoria' END AS access_source
      FROM license_lab.farms f ORDER BY f.name`)).rows;
    const farm=farms.find(f=>f.id===selected) ?? farms[0];
    const inbox=(await tx.query<Invitation>("SELECT *, 'farm' AS kind,ARRAY[farm_name] AS farm_names FROM license_lab.inbox_v2() UNION ALL SELECT id,farm_name,role,status,expires_at,'company' AS kind,farm_names FROM license_lab.company_inbox()")).rows;
    const plans=(await tx.query<Plan>(`SELECT s.*,COALESCE(f.name,c.name) AS name,license_lab.entitled(s.id) AS entitled,
      4+s.extras AS seats,CASE WHEN s.farm_id IS NULL THEN 5 ELSE 6 END+2*s.extras AS devices,
      CASE WHEN s.farm_id IS NULL THEN (SELECT count(*)::integer FROM license_lab.company_members WHERE company_owner=s.consultant_id AND active) ELSE (SELECT count(*)::integer FROM license_lab.memberships WHERE farm_id=s.farm_id AND active AND role<>'consultant') END AS used,
      CASE WHEN s.farm_id IS NULL THEN (SELECT count(*)::integer FROM license_lab.company_invites WHERE company_owner=s.consultant_id AND status='pending' AND expires_at>now()) ELSE (SELECT count(*)::integer FROM license_lab.invitations WHERE farm_id=s.farm_id AND role<>'consultant' AND status='pending' AND expires_at>now()) END AS reserved
      FROM license_lab.subscriptions s LEFT JOIN license_lab.farms f ON f.id=s.farm_id LEFT JOIN license_lab.companies c ON c.user_id=s.consultant_id ORDER BY name`)).rows;
    const platform=(await tx.query<{allowed:boolean}>('SELECT license_lab.platform_admin() AS allowed')).rows[0].allowed;
    const empty={farms,farm,inbox,plans,platform,directory,platformPlans:platform?(await tx.query<PlatformPlan>('SELECT * FROM license_lab.platform_plans()')).rows:[],
      companies:(await tx.query<Company>('SELECT user_id,name,license_lab.company_role(user_id) AS role FROM license_lab.companies ORDER BY name')).rows,
      companyMembers:(await tx.query<CompanyMember>('SELECT * FROM license_lab.company_members')).rows,
      companyAccess:(await tx.query<CompanyAccess>('SELECT a.*,a.source_version=license_lab.visible_sponsor_version(a.company_owner,a.farm_id) AS valid FROM license_lab.company_access a')).rows,
      companyInvites:(await tx.query<CompanyInvite>("SELECT i.id,i.company_owner,i.email,i.role,i.status,m.token FROM license_lab.company_invites i LEFT JOIN license_lab.company_mail m ON m.id=i.id WHERE i.company_owner=license_lab.actor() ORDER BY expires_at DESC")).rows,
      delegatable:(await tx.query<DelegatableFarm>("SELECT f.id,f.name,c.user_id AS company_owner FROM license_lab.farms f JOIN license_lab.companies c ON c.user_id=license_lab.actor() WHERE license_lab.visible_sponsor_version(c.user_id,f.id) IS NOT NULL ORDER BY f.name")).rows,
      devices:(await tx.query<Device>('SELECT * FROM license_lab.devices WHERE active ORDER BY name')).rows,
      mail:(await tx.query<Mail>("SELECT m.id,m.recipient_email,m.token FROM license_lab.mailbox m JOIN license_lab.invitations i ON i.id=m.id WHERE i.status='pending' AND i.expires_at>now() ORDER BY m.created_at DESC")).rows,
      events:(await tx.query<LicenseEvent>('SELECT id,subscription_id,action,details,created_at::text FROM license_lab.license_events ORDER BY created_at DESC LIMIT 40')).rows,
      areas:[],products:[],reports:[],rainfall:[],recommendations:[],applications:[],members:[],outgoing:[],audit:[]};
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
      outgoing:farm.role==='owner' ? await query<Invitation>('SELECT id,recipient_id,email,role,status,expires_at::text FROM license_lab.invitations WHERE farm_id=$1 ORDER BY expires_at DESC') : [],
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
const sizes={invite:3,accept_invitation:1,revoke_invitation:1,revoke_member:2,apply_operation:4,claim_demo:1,plan_change:4,dismiss:5,device_change:5,create_company:5,grant_free:5,invite_company:4,accept_company:1,company_farms:4,dismiss_company:5,revoke_company_invite:1,change_staff_role:6};
export async function command(user:string,name:keyof typeof sizes,args:unknown[]) {
  if (!(name in sizes) || sizes[name]!==args.length) throw new Error('Ação inválida.');
  return asUser(user,tx=>tx.query(`SELECT license_lab.${name}(${args.map((_,index)=>'$'+(index+1)).join(',')})`,args));
}
export function explain(error:unknown):string {
  const message=error instanceof Error ? error.message : String(error);
  const translations:Record<string,string>={OWNER_REQUIRED:'Somente o proprietário dessa fazenda pode fazer isso.',INVITATION_FORBIDDEN:'O convite pertence a outra conta.',
    INVITATION_UNAVAILABLE:'O convite já foi usado, revogado ou venceu.',DEMO_ACCOUNT_NOT_FOUND:'Use o email de uma das contas fictícias listadas.',
    ALREADY_MEMBER:'Essa pessoa já tem vínculo ativo com a fazenda.',INVITATION_PENDING:'Já existe um convite pendente para essa pessoa.',
    OWNER_IMMUTABLE:'O proprietário não pode remover o próprio vínculo neste protótipo.',APPLICATION_FORBIDDEN:'Seu perfil não pode realizar aplicações nesta fazenda.',
    INSUFFICIENT_STOCK:'Estoque fictício insuficiente.',MEMBER_NOT_FOUND:'Não há vínculo ativo para remover.',
    READ_ONLY_LICENSE:'Licença em modo de consulta. Reative para realizar lançamentos.',SEAT_LIMIT:'Não há vaga disponível. Contrate um adicional ou libere uma vaga/convite.',
    DEVICE_LIMIT:'Limite de aparelhos atingido.',DEVICE_SELECTION_REQUIRED:'Escolha os aparelhos a revogar para caber no novo limite.',DEVICE_FORBIDDEN:'Aparelho ou usuário não pertence a esta licença.',
    CONSULTANT_COMPANY_REQUIRED:'Consultores precisam ter conta e empresa cadastradas antes do convite.',CONSULTANT_LICENSE_REQUIRED:'O consultor precisa de uma licença ativa.',
    EMAIL_VERIFICATION_REQUIRED:'Confirme a verificação simulada do email.',ACCOUNT_EXISTS_USE_LOGIN:'Essa conta já existe. Selecione-a em Simular usuário e aceite o convite.',
    TEST_EMAIL_REQUIRED:'Use somente um email fictício terminado em @example.test.',SIMULATED_PAYMENT_REQUIRED:'Confirme o pagamento simulado para contratar.',
    PLATFORM_ADMIN_REQUIRED:'Somente o gestor do aplicativo pode conceder cortesias.',FREE_EXPIRED:'A cortesia venceu. Solicite renovação ao gestor do aplicativo.',
    EXTRA_LIMIT:'Não há adicional para cancelar ou o limite de teste foi atingido.',INVALID_GRANT:'Informe um motivo e uma validade futura, ou deixe a validade em branco.',
    COMPANY_OWNER_REQUIRED:'Somente o proprietário da consultoria pode gerenciar sua equipe.',COMPANY_STAFF_ROLES_ONLY:'Consultores só podem convidar administradores, monitores de campo e responsáveis por aplicação.',
    FARM_DELEGATION_FORBIDDEN:'Uma fazenda selecionada não está mais autorizada para esta consultoria. Confira os acessos e emita um novo convite.',
    STAFF_ROLE_REQUIRED:'Esta alteração é apenas para funcionários. O vínculo de consultor permanece separado.',ROLE_CHANGED_RELOAD:'A função já foi alterada em outra ação. Atualize a tela e confira antes de salvar novamente.'};
  for(const [key,value] of Object.entries(translations)) if(message.includes(key)) return value;
  if(message.includes('foreign key')) return 'Há um vínculo com outro registro. A alteração foi bloqueada para preservar os dados.';
  if(message.includes('row-level security')||message.includes('permission denied')) return 'O banco local bloqueou uma ação não permitida para esse perfil.';
  if(message.includes('check constraint')) return 'Confira as datas, os valores e os campos obrigatórios.';
  if(message.includes('unique constraint')) return 'Já existe um registro com esses dados. Confira antes de repetir.';
  return message;
}
