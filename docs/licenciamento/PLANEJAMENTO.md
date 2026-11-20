# Planejamento do licenciamento por fazenda e consultoria

Etapa 1, iniciada em 20/11/2026, na branch local `codex/licenciamento-planejamento`.
O objetivo desta etapa é definir regras, preservar o estado atual e preparar uma
validação isolada. Esta entrega contém documentação; não ativa licenças, cobrança,
novos perfis, migrações ou alterações de permissões no aplicativo em uso.

## Regras comerciais confirmadas

| Regra | Licença da fazenda | Licença do consultor |
| --- | --- | --- |
| Responsável pela contratação | Proprietário | Titular da consultoria |
| Usuários base | 4: proprietário e 3 funcionários | 1 titular, proposta a confirmar antes da implementação |
| Dispositivos base | 6 compartilhados entre os usuários da licença | 5 compartilhados entre os usuários da licença |
| Usuário adicional | Cobrança adicional e mais 2 dispositivos | Cobrança adicional e mais 2 dispositivos |
| Periodicidade | Mensal ou anual | Mensal ou anual |
| Acesso a outra fazenda | Não é concedido pela compra da licença | Exige convite e vínculo ativo naquela fazenda |

Para a fazenda, considerando `a` usuários adicionais contratados:

- Limite de usuários = `4 + a`.
- Limite de dispositivos = `6 + 2 × a`.
- Sem adicional: 4 usuários e 6 dispositivos.
- Um adicional: 5 usuários e 8 dispositivos.
- Dois adicionais: 6 usuários e 10 dispositivos.

Para a consultoria, o limite de dispositivos é `5 + 2 × a`: 5 sem adicionais,
7 com um usuário adicional e 9 com dois usuários adicionais. O acréscimo de dois
dispositivos por usuário adicional foi confirmado pelo usuário em 20/11/2026.
A quantidade de usuários incluídos na licença base de consultor continua sendo
uma decisão separada, ainda indicada como proposta na tabela.

Os adicionais contratados, e não o número de funcionários cadastrados no momento,
determinam os limites. Desativar um funcionário não cancela automaticamente um
adicional pago. A vaga pode ser reutilizada mediante as regras da assinatura.

## Permissões solicitadas

| Perfil na fazenda | Consulta e operação de dados | Gestão contratual proposta |
| --- | --- | --- |
| Proprietário | Acesso operacional completo à própria fazenda | Pagamento, adicionais, convites de consultores e transferência de propriedade |
| Administrador | Acesso operacional completo à fazenda autorizada | Sem transferência de propriedade ou contratação em nome do titular |
| Responsável por aplicação | Acesso operacional completo, conforme solicitado | Sem gestão contratual do proprietário |
| Monitor de campo | Cadastrar monitoramentos e pluviometria; consultar dados mínimos para esses lançamentos | Nenhuma |
| Consultor convidado | Consultar estoques, aplicações e mapas; registrar recomendações, monitoramentos e pluviometria | Administração da própria licença; nenhum controle contratual da fazenda cliente |

Propõe-se permitir ao monitor e ao consultor corrigir ou excluir seus próprios
lançamentos quando não houver vínculos que impeçam a exclusão. Recomendações já
executadas e lançamentos dependentes conservam as proteções do histórico. A matriz
detalhada e os casos de abuso estão em [SEGURANCA-E-ACEITE.md](SEGURANCA-E-ACEITE.md).

O consultor não executa aplicações nem movimenta o estoque da fazenda cliente.
Consultar o estoque não inclui alterar quantidades, ajustar inventário ou editar
produtos e lotes. O vínculo de consultor tampouco concede acesso à assinatura,
aos funcionários ou à administração da fazenda.

## Consultores e convites

Uma conta poderá ter vínculos em mais de uma fazenda, com função definida em cada
vínculo. Selecionar uma fazenda muda o contexto de trabalho, sem mover registros
ou substituir a propriedade dos dados.

O convite de consultor deve ser emitido pelo proprietário e vinculado à fazenda,
à função e ao destinatário. A aceitação exige a conta destinatária autenticada e
o convite válido. O vínculo não se estende a outros usuários da mesma consultoria.
Cada consultor adicional precisará da autorização das fazendas que poderá atender.

Proposta: o consultor externo usa uma vaga da licença de consultoria e não ocupa
uma das vagas de funcionários da fazenda. Seus aparelhos consomem o limite dessa
licença de consultoria, sem consumir também o limite da fazenda cliente. O acesso
exige vínculo ativo e as condições de licenciamento aplicáveis ao contexto.

Cinco dispositivos não significa cinco fazendas. Não foi definido um limite
comercial para o número de fazendas atendidas; nenhum limite desse tipo está sendo
introduzido neste planejamento.

## Modelo de dados proposto

Os nomes abaixo são conceituais. Não existem novos arquivos SQL executáveis nesta
etapa e nenhuma destas tabelas foi criada no Supabase.

| Estrutura proposta | Finalidade |
| --- | --- |
| Vínculos entre usuários e fazendas | Usuário, fazenda, papel, situação, quem autorizou e datas de ingresso/revogação |
| Titularidade da fazenda | Proprietário explicitamente confirmado, separado de administradores e do autor histórico do cadastro |
| Convites por fazenda | Destinatário, função permitida, expiração, emissor, consumo e revogação |
| Licenças e direitos contratados | Tipo da licença, titular, fazenda quando aplicável, período, situação e adicionais contratados |
| Usuários vinculados à licença | Titular e vagas adicionais, sem conceder acesso automático às fazendas |
| Instalações e sessões autorizadas | Dispositivo registrado, licença, sessões associadas, situação e revogação |
| Auditoria de autorização | Alterações de papéis, convites, titularidade, instalações e direitos de uso |

Os `institution_id` atuais continuam identificando a fazenda proprietária de cada
registro. Não se propõe duplicar ou redistribuir áreas, produtos, saldos, operações,
laudos, monitoramentos ou chuvas para implementar o seletor de fazendas.

O campo atual `user_profiles.institution_id` e a indicação global `is_admin`
precisam de uma transição compatível; não podem continuar sendo a única fonte de
autorização para consultores com vários vínculos. A implementação futura deve
preservar os IDs existentes e tratar o papel por fazenda.

## Pontos técnicos encontrados no projeto atual

- `src/context/AppContext.tsx` organiza dados por uma instituição do perfil.
- `src/lib/database.types.ts` contém `institution_id` e `is_admin` no perfil, sem
  um modelo de múltiplos vínculos por conta.
- `join_institution` possui proteção contra a troca da instituição de um membro
  existente. Essa proteção não deve ser removida para simular acesso de consultor.
- `create_invitation` e outras funções administrativas atuais usam `is_admin` e
  a instituição do perfil. Seus caminhos precisarão de revisão antes de haver
  perfis restritos e convites exclusivos do proprietário.
- As operações atômicas, o estoque e as mutações auditadas também consultam a
  instituição do perfil. Adaptar só a interface ou só uma RLS não será suficiente.
- A fila offline é separada por usuário e instituição. A identificação da fazenda
  precisa continuar imutável do cadastro local à sincronização.
- Parte do histórico de migrações foi aplicada manualmente pelo SQL Editor.
  Reconciliar o estado real do schema e esse histórico é pré-requisito para
  qualquer implantação futura; não executar `supabase db push` às cegas.

## Dispositivos e funcionamento offline

O limite de aparelhos exige cadastro e validação no servidor, com identificação
da instalação e associação às sessões. O aplicativo não poderá aprovar sozinho
a inclusão de outro aparelho ou o aumento de uma cota.

Ainda é necessário definir como contar Android, PWA e Windows usados no mesmo
aparelho: por instalação autorizada ou por um pareamento explícito de instalações.
Um identificador físico infalível não está disponível de forma uniforme na PWA.
Essa decisão deve aparecer de forma clara na interface e no contrato.

Uma autorização offline futura deverá ter validade limitada e estar vinculada ao
usuário, à fazenda, ao papel, à instalação e à licença. O prazo ainda será definido.
A revogação não alcança instantaneamente um aparelho desconectado. Na reconexão,
o servidor revalida o acesso antes de aceitar dados.

Registros pendentes não serão apagados se a licença vencer ou o vínculo for
revogado. Eles deverão permanecer identificados, com a autoria e a fazenda
originais, para tratamento autorizado. Não serão enviados automaticamente como
se tivessem sido criados por outro usuário ou em outra fazenda.

## Sequência proposta

1. **Esta etapa:** cópias verificadas, regras, mapa de impacto e critérios de aceite.
2. **Ambiente isolado:** protótipo de vínculos, convites e permissões com fazendas
   e usuários fictícios; sem acesso de escrita ao projeto real.
3. **Validação da compatibilidade:** testar a convivência com a versão atual e
   definir mapeamento dos usuários existentes, sem presumir quem é proprietário.
4. **Licenças e dispositivos em teste:** direitos simulados e concorrência de cotas;
   nenhum pagamento real ou bloqueio de clientes atuais.
5. **Cobrança:** escolher a integração, testar notificações autenticadas e tratar
   renovação, vencimento e adicionais de forma idempotente.
6. **Implantação controlada futura:** somente após backup completo do Supabase
   restaurado e validado fora da produção, aprovação dos critérios de segurança e
   escolha explícita da primeira fazenda de implantação.

## Decisões ainda abertas

- Confirmação de um usuário base na licença de consultor.
- Quem será o proprietário legítimo de cada fazenda já existente.
- Validade da autorização offline e tratamento de leituras quando a licença vence.
- Contagem por instalação ou pareamento de instalações do mesmo aparelho.
- Preços, política de atraso, redução de plano e forma de cobrança/distribuição.
- Política para funcionário ligado a mais de uma fazenda; a estrutura deve comportar
  vínculos sem concedê-los automaticamente.

Estas decisões não impedem concluir o planejamento. Impedem ativar em produção
regras comerciais ou transferências de titularidade ainda não confirmadas.
