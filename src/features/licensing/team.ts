export const teamRoles={owner:'Proprietário',administrator:'Administrador',application_manager:'Responsável por aplicação',field_monitor:'Monitor de campo',consultant:'Consultor'};
export const employeeRoles=['administrator','application_manager','field_monitor'] as const;
export const roleName=(role:string)=>teamRoles[role as keyof typeof teamRoles]??role;
export function teamProblem(error:unknown){const text=error&&typeof error==='object'&&'message'in error?String(error.message):String(error);const messages:Record<string,string>={
 TEAM_LIMIT_REACHED:'As vagas de funcionários estão ocupadas ou reservadas por convites. Revogue um convite antigo ou contrate um adicional.',
 TEAM_CAPACITY_IN_USE:'A cota ainda está ocupada por funcionários ou convites. Libere a vaga antes de cancelar o adicional.',
 TEAM_OWNER_REQUIRED:'Somente o proprietário desta empresa pode administrar a equipe.',OWNER_REQUIRED:'Esta licença pertence a outro titular.',
 TEAM_SESSION_REQUIRED:'Sua sessão foi encerrada ou venceu. Entre novamente na conta.',ACTIVE_LICENSE_REQUIRED:'A licença precisa estar ativa para esta alteração. O histórico continua disponível.',
 INVITATION_ALREADY_PENDING:'Já existe um convite pendente para este email. Revogue-o antes de emitir outro.',MEMBER_ALREADY_ACTIVE:'Esta conta já faz parte da equipe.',
 REGISTERED_CONSULTANCY_REQUIRED:'O consultor precisa ter uma conta verificada e uma empresa de consultoria com licença ativa.',
 CONSULTANT_INVITE_NOT_ALLOWED:'A equipe da consultoria pode receber funcionários; não pode convidar outro consultor.',
 INVITATION_RECIPIENT_REQUIRED:'Entre com a conta do email que recebeu este convite.',INVITATION_UNAVAILABLE:'Este convite venceu, foi revogado ou já foi utilizado.',
 MEMBER_VERSION_CONFLICT:'A função foi alterada por outra ação. Atualize a equipe antes de salvar novamente.',FARM_ACCESS_REQUIRED:'Uma fazenda selecionada não está mais disponível. Atualize a seleção.',
 TEAM_INVITE_NOT_CONFIGURED:'O envio de convites ainda não está configurado neste servidor local.',EXISTING_INSTITUTION_REQUIRES_REVIEW:'Esta licença já possui um vínculo que exige revisão de titularidade.',
 };
 for(const [code,message] of Object.entries(messages))if(text.includes(code))return message;
 if(/PGRST|schema|function.*does not exist/.test(text))return 'O serviço de empresas e equipes ainda não foi habilitado neste ambiente.';
 return 'Não foi possível concluir esta ação. Verifique a conexão e atualize antes de tentar novamente.';
}
