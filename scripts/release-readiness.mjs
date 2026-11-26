// Este resultado descreve evidências; não concede privilégios nem publica alterações.
export function licensingReleaseReadiness(evidence={}){
 const checks=[
  ['restore',evidence.restoreVerified===true,'Restauração completa com dados e controles de acesso conferidos'],
  ['atomicity',evidence.failedMigrationRolledBack===true&&evidence.laterRecordPreserved===true,'Atualização que falha preserva registros posteriores ao backup'],
  ['source',evidence.sourceKind==='verified-production-snapshot','Ensaio iniciado a partir de uma cópia atual e verificada de produção'],
  ['files',evidence.productionFilesVerified===true,'Arquivos de Storage e suas referências preservados'],
  ['ownership',evidence.productionOwnershipConfirmed===true,'Titularidade e papéis de todas as empresas incluídas confirmados'],
  ['backend',evidence.productionBackendVerified===true,'RLS, funções e emissor offline homologados no servidor real'],
  ['billing',evidence.productionBillingVerified===true,'Provedor, preços e webhook comercial homologados'],
  ['clients',evidence.clientUpgradeVerified===true,'Atualização dos clientes e filas locais homologada'],
  ['rollback',evidence.productionRollbackVerified===true,'Retorno operacional preserva dados novos e permissões seguras']
 ].map(([id,passed,description])=>({id,passed,description}));
 return {ready:checks.every(c=>c.passed),checks,blocking:checks.filter(c=>!c.passed).map(c=>c.id)};
}
