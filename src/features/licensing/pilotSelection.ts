const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function pilotInstitutionKey(userId:string){if(!uuid.test(userId))throw Error('Usuário inválido.');return 'agrigest:pilot:institution:'+userId;}
export function readPilotInstitution(userId:string|undefined,fallback:string,storage:Pick<Storage,'getItem'>){
 if(!uuid.test(fallback))throw Error('Fazenda padrão inválida.');
 try{const saved=userId?storage.getItem(pilotInstitutionKey(userId)):null;return saved&&uuid.test(saved)?saved:fallback;}catch{return fallback;}
}
export function savePilotInstitution(userId:string,institutionId:string,storage:Pick<Storage,'setItem'>){if(!uuid.test(institutionId))throw Error('Fazenda inválida.');storage.setItem(pilotInstitutionKey(userId),institutionId);}
