export function billingProblem(code:string|null|undefined,fixture=false){
 if(fixture)return 'Teste interno: esta referência é fictícia e não corresponde a uma cobrança no Asaas. Nenhum pagamento será liberado por ela.';
 if(code==='ASAAS_REQUEST_FAILED_HTTP_404')return 'Cobrança ou assinatura não encontrada no Asaas deste ambiente. Confira a referência e a conta conectada antes de tentar novamente.';
 if(code==='ASAAS_REQUEST_FAILED_HTTP_401'||code==='ASAAS_REQUEST_FAILED_HTTP_403')return 'O Asaas recusou o acesso. Confira as credenciais e permissões configuradas no servidor.';
 if(code==='PROVIDER_CONTRACT_MISMATCH'||code==='PROVIDER_CUSTOMER_MISMATCH')return 'O valor ou o titular retornado pelo Asaas difere do contrato. A liberação ficou bloqueada para sua conferência.';
 if(code==='BILLING_ENVIRONMENT_MISMATCH')return 'O ambiente da cobrança difere do ambiente da licença. Pagamentos Sandbox não ativam licenças comerciais.';
 if(code==='SUBSCRIPTION_NOT_ACTIVE')return 'A assinatura não está ativa no Asaas. Confira seu estado antes de alterar os adicionais.';
 if(code==='PROVIDER_EFFECTIVE_DATE_REVIEW'||code==='PRICE_BOUNDARY_HAS_INVOICE')return 'Não foi possível definir com segurança a próxima cobrança. As faturas existentes foram preservadas; confira a data e o valor no Asaas.';
 return 'A conferência não foi concluída. Nenhuma cobrança nova foi criada; consulte os detalhes ou tente novamente mais tarde.';
}
