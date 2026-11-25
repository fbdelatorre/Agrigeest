# Identificação e aprovação de aparelhos — piloto web 0.1.3

Disponível somente no site local do piloto. As migrações 16 e 17 foram aplicadas
exclusivamente ao banco piloto, sem publicar em produção ou modificar a main.
O bloqueio de instalação do Windows não foi alterado e não foi gerado outro
instalador nesta etapa, conforme preferência pelo teste no navegador.

Cada aparelho e solicitação mostra nome disponível e email da conta Auth vinculada.
Essa informação identifica a conta da autorização; não é indicador de presença online.
O proprietário vê os aparelhos da licença, e os funcionários veem apenas os próprios.
Segredos, hashes, identificadores de instalação e sessões não são devolvidos nas listas.

## Fluxo

1. Funcionário informa o nome do aparelho e solicita autorização em Membros e licença.
2. O proprietário vê o pedido pendente com aparelho, usuário e data, e pode aprovar
   ou recusar. Somente ele autoriza e revoga, inclusive por chamada direta à API.
3. Pedido pendente não ocupa vaga nem libera gravação. A aprovação verifica cota,
   licença ativa, vínculo do funcionário e validade da sessão antes de ocupar a vaga.
4. Depois da aprovação, o funcionário atualiza os aparelhos e as permissões. Uma
   instalação previamente aprovada pode retomar a sessão provando seu segredo,
   sem criar autorização ou vaga nova. Aparelho revogado exige aprovação nova.

As leituras permitidas pelo vínculo continuam disponíveis em modo de consulta,
como nas fases anteriores; a aprovação do aparelho é exigida para gravar.

## Segurança e preservação

Solicitações ficam em tabela privada com RLS e sem acesso direto para clientes.
Pedidos são vinculados à versão de análise e ao vínculo específico do funcionário.
Recontratação não reativa uma aprovação nem um pedido antigo automaticamente.
Repetir uma aprovação já concluída não consome outra vaga e não desfaz revogação
posterior. Instalações antigas de não proprietários sem evidência de aprovação são
marcadas para revisão; registros e histórico não são apagados.

O proprietário continua autorizando os próprios aparelhos. Autorizações dele já
existentes foram preservadas. Nenhum registro de operação, estoque, monitoramento,
chuva ou membro foi modificado para aplicar as regras. As funções anteriores foram
guardadas em arquivos privados antes da aplicação transacional.

Passaram os testes de backend para recusa de autoautorização, pedidos repetidos,
identidade exibida, privacidade entre contas, aprovação exclusiva do proprietário,
cota, retomada de sessão, recusa, revogação, recontratação e sessão expirada. O teste
real do navegador confirmou a solicitação, aprovação e liberação, com escrita negada
antes de aprovar. Usou apenas fazenda e contas fictícias, removidas ao final, e
confirmou hashes inalterados dos dados operacionais anteriores.

Os testes transacionais de operações, estoque e permissões também passaram após
a nova regra, com ROLLBACK de todas as gravações e aprovações usadas nos testes.
