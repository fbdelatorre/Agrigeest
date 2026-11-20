# Contas, convites e ciclo da assinatura

Requisitos fornecidos pelo usuário em 20/11/2026, complementares ao
[planejamento](PLANEJAMENTO.md). Este documento define a próxima evolução;
não ativa cobrança, envio de emails ou alterações no Supabase. O instalador
0.1.0 foi o laboratório inicial de vínculos. O protótipo 0.2.0 exercita estes
fluxos com contas, verificação de email e pagamentos simulados, conforme
[ETAPA-3.md](ETAPA-3.md), sem ativar essas funções no aplicativo real.

## Conta independente da empresa

A pessoa pode cadastrar e verificar sua conta sem empresa, fazenda ou função.
Sem vínculo ativo, não recebe acesso a dados de propriedades. A tela inicial
permite consultar convites recebidos ou solicitar a criação de uma empresa.
Solicitar/criar uma empresa inicia a contratação da licença; não concede por si
só os direitos de uma licença paga. Pagamento e ativação serão confirmados no
servidor, pela integração de cobrança, e não por uma página de sucesso no cliente.

O cadastro deve aproveitar nome e email já disponíveis, sem pedir novamente
informações conhecidas. Um convite de funcionário não obriga o convidado a
contratar uma licença própria nem a criar uma empresa.

## Convite para funcionário

1. O proprietário informa email e função na fazenda selecionada.
2. O servidor verifica a existência da conta e a capacidade disponível da licença.
3. Se já existe conta, cria um convite para aquela identidade: ao autenticar e
   aceitar, a pessoa ganha o vínculo e a função, sem refazer seu cadastro.
4. Se não existe conta, guarda um convite pendente por email e envia um link que
   abre diretamente a **página de cadastro**, contextualizada com a fazenda e a
   função já preenchidas. A pessoa completa os dados pessoais faltantes.
5. Antes de ativar o vínculo, verifica o email destinatário, a identidade, a
   validade do convite e a disponibilidade da licença novamente. O fluxo deve
   deixar claro que concluir o cadastro implica aceitar o convite, ou oferecer
   uma confirmação explícita no mesmo fluxo, sem redigitar fazenda/função.

Fazenda e função do convite são dados de autorização, exibidos sem edição pelo
destinatário. Corrigi-los exige ação do proprietário e novo convite válido.
Parâmetros da URL e metadados editáveis da conta não concedem permissões.
O link contém um token aleatório, de uso único e com expiração; o banco guarda
seu hash. Tokens, senhas e credenciais não aparecem em logs ou analytics.

Se a conta for criada por outro caminho antes de o convite ser aceito, vincular
o convite à identidade com o mesmo email verificado, sem duplicar a conta.
Email recebido não autentica por si só um usuário já cadastrado. Revogação,
expiração, reenvio e corrida entre aceitações não podem criar vínculos extras.
A consulta de existência fica restrita ao serviço autorizado de convites,
sem disponibilizar uma busca pública de usuários por email.

## Convite para consultor

O destinatário precisa ter **conta e empresa de consultoria cadastradas antes
de receber o convite**. Caso contrário, orientar o proprietário a pedir esse
cadastro, sem criar vínculo nem enviar convite para cadastro como funcionário.
A empresa não concede acesso às fazendas dos clientes: cada vínculo exige o
convite do proprietário, aceite e validação das condições da licença aplicável.
A situação paga/ativa da licença de consultoria também será validada no acesso;
o cadastro da empresa sozinho não comprova pagamento.
O proprietário da consultoria convida apenas funcionários (administrador, monitor
ou responsável), sem convidar outro consultor. Cada funcionário recebe somente
as fazendas marcadas pelo titular; nenhuma fazenda atual ou futura é herdada
automaticamente. A licença inclui proprietário + 3 funcionários e 5 aparelhos,
com mais uma vaga e dois aparelhos por adicional. Regras/testes da versão 0.3.0
em [CONSULTORIA-0.3.md](CONSULTORIA-0.3.md).

## Desligamento e adicionais

Desligar um funcionário revoga o vínculo, as permissões e as autorizações de
acesso àquela fazenda, preservando a conta e todos os lançamentos históricos.
Sem outros vínculos, a conta fica sem fazenda e sem função. Se houver vínculos
legítimos com outras fazendas, preservá-los: o desligamento não é global.
Um novo convite pode conceder outra função e propriedade à mesma conta.
O histórico mantém a autoria original, sem mostrar o funcionário como ativo.

Quando a saída liberar uma vaga adicional paga, oferecer ao proprietário:

- **Manter adicional:** conservar o preço contratado, a vaga e seus 2 dispositivos
  adicionais, permitindo convidar outra pessoa depois.
- **Cancelar adicional:** reduzir uma vaga e 2 dispositivos, atualizar
  automaticamente a assinatura no provedor e mostrar o novo valor e a data de
  efeito. A remoção do funcionário deve funcionar mesmo que o provedor falhe;
  nesse caso, mostrar o cancelamento financeiro pendente e repetir com segurança.

As vagas adicionais são capacidade contratada, não propriedade de um funcionário
específico. O sistema deve calcular se a saída permite reduzir o adicional e
não vender/cancelar a mesma vaga duas vezes em ações concorrentes.
Se a nova cota de aparelhos ficar abaixo dos autorizados, permitir escolher quais
autorizações manter/revogar, sem apagar dados locais ou lançamentos pendentes.

**Confirmado pelo usuário em 20/11/2026:** cancelar o adicional reduz
imediatamente o valor contratado, uma vaga e dois dispositivos, sem aguardar
o fim do período mensal ou anual. A atualização da assinatura no provedor
deve usar essa data de efeito e não manter o adicional nas cobranças futuras.
Eventual crédito ou devolução de valores já pagos ainda precisa de definição;
redução imediata não deve ser interpretada como autorização para um estorno
automático. A interface deve distinguir novo valor contratado, ajuste financeiro
pendente e eventuais valores já pagos.

## Página Plano e licenças

Página do proprietário para mostrar licença da propriedade, período mensal/anual,
situação, usuários e aparelhos incluídos, adicionais contratados, uso atual,
valor, próxima cobrança e mudanças/cancelamentos agendados. Disponibilizar a
compra e o cancelamento de adicionais, o cancelamento da licença principal e
a reativação. A gestão da consultoria segue o mesmo princípio para seu titular.
Outros cargos não podem alterar a assinatura da fazenda.

Cancelar a licença **não exclui conta, empresa, fazenda ou registros**. Na data de
efeito do cancelamento, a fazenda entra em modo de consulta: os usuários ainda
autorizados consultam o histórico dentro das suas permissões, sem criar, editar,
excluir, aplicar recomendações, movimentar estoque, importar ou sincronizar novas
mutações. Cancelar não amplia a leitura de monitores/consultores nem restaura
acesso de funcionários desligados. Preservar dados de todas as safras.

O bloqueio precisa valer nas RLS, funções, APIs e sincronização, além dos botões.
Pendências offline permanecem intactas e identificadas para tratamento
autorizado; não são descartadas nem aceitas automaticamente após o cancelamento.
Mudanças de perfil que ampliem acesso e convites novos ficam bloqueados no modo
de consulta. Login, segurança da conta, revogação de acessos, auditoria técnica
e gestão da assinatura continuam disponíveis em seus caminhos autorizados.

Reativar reutiliza a mesma empresa/fazenda e os mesmos registros. Liberação de
escrita depende da confirmação da licença no servidor e das cotas contratadas,
sem reativar funcionários desligados ou convites revogados. Notificações
duplicadas, atrasadas ou fora de ordem do provedor não podem ativar uma licença
indevidamente, cobrar duas vezes ou restaurar adicionais cancelados.

## Critérios para a próxima implementação isolada

- Cadastro independente não concede fazenda/função; criar empresa exige fluxo
  de contratação, sem privilégio obtido por alterar o pedido.
- Convite de funcionário sem conta abre cadastro contextualizado e só ativa o
  vínculo para o email verificado; outra conta não pode consumir o link.
- Conta já existente não se duplica; convite expirado/revogado/reutilizado e
  adulteração de fazenda/função não concedem acesso.
- Consultor sem conta ou sem empresa não recebe convite de consultor.
- Desligamento conserva conta e autoria histórica; novo convite funciona;
  outros vínculos válidos permanecem e acesso revogado não retorna na reativação.
- Escolher manter/cancelar adicional produz preço e cotas consistentes, inclusive
  em concorrência, falha do provedor e repetição da solicitação.
- Cancelamento bloqueia todas as mutações operacionais, inclusive RPC direta,
  importação e sincronização, mantendo apenas as leituras já autorizadas.
- Reativação confirmada preserva identificadores, saldos e histórico de safras;
  não duplica registros e não descarta filas offline.

O protótipo 0.2.0 testa estes cenários no banco local e na interface, com a
identidade e a cobrança simuladas. Não comprova autenticação, entrega real de
email, cobrança, identificação física de aparelhos nem concorrência do Supabase.
Qualquer ativação real continua condicionada aos critérios de backup, restauração
e compatibilidade de [SEGURANCA-E-ACEITE.md](SEGURANCA-E-ACEITE.md).

## Licenças gratuitas concedidas pelo proprietário do aplicativo

O gestor da plataforma pode conceder, renovar e revogar cortesia, com validade
opcional e motivo obrigatório no histórico. Esse poder é separado do papel de
proprietário de fazenda. Ter uma empresa ou editar seu perfil não concede acesso
à gestão da plataforma. A identidade do gestor real será definida no servidor,
fora de metadados editáveis pelo usuário; o protótipo usa a conta fictícia Helena.

Cortesia válida permite usar os direitos contratados com valor simulado zero.
Vencimento ou revogação preserva os registros e deixa o plano somente para
consulta; não inicia cobranças automaticamente. Gerenciar licenças não concede
leitura nem escrita nos dados operacionais das fazendas. O acesso operacional
continua exigindo vínculo explícito. Concessões têm controle de repetição e
histórico protegido contra alteração pelos clientes.

Na futura integração financeira, a concessão também precisará suspender as
cobranças no provedor. Este laboratório não executa esse efeito financeiro real.
