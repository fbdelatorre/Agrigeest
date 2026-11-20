# Segurança e critérios de aceite do licenciamento

Este roteiro define o que precisará ser comprovado em ambiente isolado antes de
qualquer ativação. A etapa atual não executou estes novos testes de autorização e
não implementou o modelo proposto.

## Regras de autorização

Cada pedido deve relacionar a identidade autenticada, a fazenda do registro, o
vínculo ativo, a ação permitida e, quando implantados, a licença e a instalação.
O seletor de fazenda e os dados enviados pelo cliente não concedem permissão.

| Ação na fazenda autorizada | Proprietário | Administrador | Responsável | Monitor | Consultor convidado |
| --- | --- | --- | --- | --- | --- |
| Consultar dados operacionais completos | Sim | Sim | Sim | Não | Só estoques, aplicações e mapas, além dos registros de campo autorizados |
| Criar/editar/excluir cadastro operacional | Sim, respeitando vínculos | Sim, respeitando vínculos | Sim, respeitando vínculos | Não | Não |
| Executar aplicação e movimentar estoque | Sim | Sim | Sim | Não | Não |
| Registrar monitoramento e pluviometria | Sim | Sim | Sim | Sim | Sim |
| Editar/excluir monitoramento e chuva | Conforme regras do histórico | Conforme regras do histórico | Conforme regras do histórico | Próprios, proposta | Próprios, proposta |
| Registrar recomendação | Sim | Sim | Sim | Não | Sim |
| Editar/excluir recomendação pendente | Conforme regras do histórico | Conforme regras do histórico | Conforme regras do histórico | Não | Próprias, proposta |
| Convidar/remover consultor externo | Sim | Não, proposta | Não, proposta | Não | Não |
| Comprar adicionais ou transferir propriedade | Sim | Não, proposta | Não, proposta | Não | Só a gestão da própria licença de consultoria |

O monitor recebe apenas os dados de referência necessários ao formulário, como
talhão, safra e cultivo. Uma consulta reduzida para esse perfil não deve expor
automaticamente estoques, custos, listas de aplicações ou todos os registros dos
outros usuários. Esta restrição deve ser aplicada no servidor, além da interface.

## Revisão de RLS e funções

As políticas permissivas do PostgreSQL podem se combinar por OR. Portanto, uma
política nova restritiva não corrige o acesso se uma política antiga continuar
autorizando a mesma ação de maneira ampla. É necessário inventariar as políticas
efetivas e revisar a combinação completa.

Funções `SECURITY DEFINER`, rotinas de estoque, administração, convites, operações,
relatórios e APIs de satélite/laudos também precisam verificar o vínculo e a ação.
Não se deve depender somente da RLS de uma tabela quando a função executa com
permissões elevadas. Nenhuma chave administrativa será incorporada ao aplicativo.

O papel de uma pessoa em uma fazenda não pode aumentar seu acesso em outra.
Um consultor que administra a própria fazenda continua sendo apenas consultor
na fazenda cliente que o convidou. Metadados editáveis pelo usuário não podem
atribuir proprietário, administrador ou quantidade de vagas/dispositivos.

## Testes obrigatórios na próxima etapa isolada

| Caso | Resultado necessário |
| --- | --- |
| Usuário da fazenda A consulta ou altera IDs da B | Bloqueio em tabelas, funções, arquivos e exportações |
| Usuário tenta criar registro usando a fazenda B no payload | Bloqueio sem qualquer alteração de saldo ou histórico |
| Consultor autorizado em A seleciona ou adivinha IDs de B | Bloqueio; B não aparece no seletor nem em pesquisas |
| Consultor é administrador em sua própria fazenda | Não recebe privilégios administrativos na fazenda cliente |
| Consultor tenta executar recomendação/aplicação ou ajustar estoque | Bloqueio, incluindo chamadas diretas às RPCs |
| Monitor tenta consultar estoque, custos ou aplicações | Bloqueio no servidor, sem depender de botões ocultos |
| Monitor/consultor tenta editar registro de outro usuário | Bloqueio na política de autoria proposta |
| Membro tenta editar `institution_id`, papel ou titularidade | Bloqueio; dados não são transferidos |
| Usuário sem login acessa tabelas, RPCs ou arquivos | Bloqueio |
| Convite expirado, revogado, reutilizado ou de outro destinatário | Nenhum vínculo criado |
| Conta aceita convite de consultor para uma segunda fazenda | Novo vínculo explícito; nenhuma alteração na propriedade dos dados existentes |
| Duas aceitações disputam a última vaga | Contagem atômica, sem ultrapassar o limite |
| Dois aparelhos disputam a última autorização | Contagem atômica, sem ultrapassar o limite |
| Cliente altera identificador ou cota no pedido | Não obtém autorização nem amplia o limite |
| Fazenda compra um adicional de usuário | Passa de 4/6 para 5/8 em usuários/dispositivos, sem criar conta automaticamente |
| Consultoria compra um adicional de usuário | Ganha uma vaga de usuário e passa de 5 para 7 dispositivos; dois adicionais permitem 9 dispositivos, sem conceder acesso automático às fazendas |
| Funcionário ou consultor é removido | Autorização online revogada sem apagar seus lançamentos |
| Licença vence ou plano é reduzido abaixo do uso atual | Preservação dos dados; nenhuma exclusão automática de usuários ou aparelhos |
| Offline A, troca para B e reconecta | Fila, cache e submissões continuam associados às fazendas e autores corretos |
| Licença/vínculo foi revogado durante o trabalho offline | Revalidação antes da sincronização; pendências preservadas para tratamento autorizado |
| Mesma tentativa é repetida após perda da resposta | Sem duplicação de vínculo, cobrança, convite, registro ou consumo |

Também devem ser conferidos os vínculos indiretos: lote através do produto,
resultado laboratorial através da amostra, recomendação através do monitoramento,
e quaisquer IDs contidos em JSON. O acesso a um pai de uma fazenda não pode
autorizar um filho vinculado a outra.

## Preservação e mapeamento dos usuários atuais

Nenhum criador histórico ou administrador será promovido automaticamente a
proprietário. O responsável legítimo deve ser confirmado. Não se deve converter o
campo de profissão/cargo do perfil em uma autorização administrativa.

Na futura transição, novos vínculos poderão referenciar os IDs atuais. A aceitação
exige a conferência, por fazenda, das contagens e identificadores dos registros,
dos saldos por produto/lote e das evidências de operações. Nenhuma divergência
histórica será corrigida como efeito colateral da implantação de licenças.

## Condições para avançar à produção

1. Projeto de testes realmente separado, identificado e protegido contra uso
   acidental da URL/chave administrativa da produção.
2. Backup completo e atual do Supabase, com restauração testada em outro ambiente;
   incluir schema, dados, funções, permissões e o inventário/backup dos arquivos.
3. Identificação dos dados pendentes nos aparelhos envolvidos e procedimento
   testado para sua preservação, incluindo as chaves necessárias para recuperação.
4. Mapeamento de titularidade e permissões aprovado para os usuários existentes.
5. Todos os cenários de isolamento e concorrência aprovados.
6. Alterações de permissões e RPCs compatíveis aplicadas conjuntamente, evitando
   um intervalo em que a interface nova utilize permissões antigas mais amplas.
7. Procedimento de retorno testado que preserve os registros posteriores à
   atualização e não restaure permissões antigas que ampliem acesso indevidamente.

Reverter apenas o aplicativo pode reintroduzir acessos amplos se papéis restritos
já estiverem ativos. O retorno precisa conservar a autorização segura ou suspender
os acessos novos de modo controlado, mantendo os dados.
