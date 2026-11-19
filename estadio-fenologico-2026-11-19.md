# Estádio fenológico e ordenação — versão 1.2.2

- Os cards das áreas e o detalhe do mapa mostram o estádio e a data do último
  monitoramento do talhão na safra selecionada. Os rótulos dos polígonos podem
  exibir o estádio pela camada “Estádio fenológico”, ligada por padrão.
- A escolha usa primeiro a data do monitoramento. No mesmo dia, o cadastro mais
  recente desempata; o ID mantém uma ordem estável. Lançar um monitoramento antigo
  hoje não substitui o estádio de uma observação posterior.
- Sem monitoramento disponível na safra, a informação fica explicitamente ausente.
  O estádio não é copiado da safra anterior nem gravado no cadastro permanente da área.
- Registros offline pendentes participam do cálculo e são identificados. O cache
  é separado por usuário, instituição e safra. Edições e exclusões atualizam os
  metadados locais; excluir o último relatório permite usar o anterior.
- Os metadados são buscados em páginas de 500 registros, sem carregar o texto dos
  relatórios. Assim o cálculo não depende somente da primeira página do histórico.
- Áreas: A–Z por padrão, com alternativas Z–A e cadastro mais recente. A comparação
  respeita o idioma e números no nome, como Área 2 e Área 10.
- Monitoramentos: mais recentes primeiro ou mais antigos primeiro, sempre pela
  data da observação. A ordenação é aplicada na consulta paginada e na lista local.

Nenhuma alteração de tabela, função SQL, RLS ou registro de negócio foi feita.

Validação: TypeScript sem erros; ESLint sem erros e com os 12 avisos anteriores.
O teste de regra cobre data retroativa, safra, edição e exclusão. O teste de
interface cobre paginação além de 500 relatórios, cards A–Z/Z–A, troca de safra,
as duas ordens do histórico, estádio editado no mapa e cache offline após exclusão.
Os testes anteriores dos formulários e da abertura offline também passaram.

PWA e pacotes Windows/Android 1.2.2 gerados. Android usa versionCode 6 e mantém a
assinatura de teste anterior. Os arquivos e hashes ficam em
`checks.local/entregas/agrigest-1.2.2`. A instalação do Windows continua pendente
devido ao bloqueio de Controle de Aplicativos encontrado na entrega anterior;
as proteções não foram alteradas. A PWA depende do envio da main e da publicação.
