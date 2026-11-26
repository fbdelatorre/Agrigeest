# Ensaio de restauração e conferência antes da publicação

Etapa de 26/11/2026, após `8ae0d6a`. O aplicativo e os dados de produção não foram
substituídos. Não houve merge na main, publicação de funções ou geração de instalador.

## Restauração local executada

`node scripts/rehearse-licensing-release-local.mjs --local-only`

O script mantém uma transação **REPEATABLE READ, READ ONLY** no piloto e exporta
seu snapshot. O dump usa esse mesmo snapshot, de modo que o inventário e o arquivo
de backup representam o mesmo estado, mesmo que alguém continue usando o piloto.

O backup é restaurado em uma base criada com nome aleatório no PostgreSQL local.
O script não usa `--clean`, não apaga bancos e não altera o contexto, as portas ou
o endereço do piloto. Os usuários continuam acessando a base anterior.

Resultado deste ensaio:

- **91 tabelas conferidas**, incluindo Auth, dados operacionais e licenciamento.
- Contagens e hashes dos registros coincidem com o snapshot de origem.
- Funções, proprietários dos objetos, privilégios, RLS, políticas, triggers,
  constraints, índices e definições de sequências foram comparados.
- Sequências restauradas não ficaram abaixo dos valores existentes antes do dump.
- Reaplicar as etapas de vínculo de empresa e autorização offline preservou dados
  e controles de acesso.
- Um lançamento fictício de chuva foi salvo **depois** do backup, na base do ensaio.
- Uma versão alterada da migração offline recebeu uma falha deliberada antes do
  COMMIT. A transação foi revertida; as funções originais e o lançamento posterior
  permaneceram intactos.
- Após remover somente o cenário fictício, o conteúdo restaurado voltou a coincidir
  com o backup. O piloto de uso do usuário não recebeu esse cenário.

Esse teste valida a atomicidade de uma atualização que falha. **Não homologa um
retorno de versão depois de uma publicação já confirmada.** Esse retorno ainda
precisa preservar lançamentos novos e manter as restrições de acesso.

O ensaio ocorreu no mesmo PostgreSQL local, com roles e extensões já disponíveis.
Não equivale à recuperação em um servidor vazio ou à restauração do Supabase real.

O backup, manifesto, hashes e relatórios ficam em diretório privado ignorado pelo
Git. O índice `checks.local/licensing-local/latest-release-rehearsal.local.json`
indica a base e a pasta do último ensaio concluído. A base restaurada não é exposta
por uma API. Tentativas incompletas ficam separadas para diagnóstico, sem substituir
o ensaio concluído ou a origem.

## Supabase real: somente leitura

`node scripts/inventory-production-readonly.mjs --read-only`

O comando usa o projeto registrado no backup de origem e a autenticação normal
da CLI. Todas as consultas remotas usam **--read-only**; o servidor também confirmou
que a transação estava em modo somente leitura. Nenhuma senha ou chave é exibida.

Na conferência atual:

- PostgreSQL 15.8, **69 tabelas inventariadas**, sendo 27 públicas.
- **70 políticas públicas**, sem diferença em relação à cópia anterior após igualar
  o contexto de exibição dos nomes no PostgreSQL local.
- 24 definições de funções tinham diferenças de comentários ou espaçamento.
  A comparação conservadora de tokens não encontrou mudança de código executável
  nas funções públicas comparadas. Literais, identificadores entre aspas, operadores,
  atributos de segurança e alterações de assinatura continuam sendo diferenciados.
- A conta do proprietário já confirmado existe, tem email confirmado e continua
  vinculada à instituição esperada. Essa instituição tem quatro membros.
- As outras instituições não receberam um proprietário inferido pelo criador
  histórico ou pela condição de administrador.
- O schema de licenciamento ainda não está publicado no projeto real.

A contagem de 69 inclui tabelas administrativas que não entravam na exportação
antiga, como controles de migrações e serviços do Supabase. Ela não comprova que
novas tabelas do aplicativo tenham sido criadas desde aquela exportação.

As expressões de RLS podem exibir `uid()` ou `auth.uid()` conforme o search_path.
A conferência usa a mesma configuração de nomes **somente na sessão da cópia local**;
não remove qualificadores das políticas nem altera a configuração do banco real.

Este inventário contém hashes e metadados privados. **Não é um backup dos registros
de produção** e não substitui a exportação consistente nem os arquivos de Storage.
O índice `checks.local/licensing-local/latest-production-inventory.local.json`
aponta para o resultado atual. Os conteúdos brutos não são enviados ao GitHub.

## O que ainda impede a publicação comercial

`scripts/release-readiness.mjs` registra separadamente as evidências de restauração,
atomicidade, origem dos dados, arquivos, titularidade, backend, cobrança, atualização
dos clientes e retorno operacional. Uma restauração local bem-sucedida não transforma
automaticamente essas outras etapas em aprovadas.

Ainda faltam um backup atual completo do projeto real e dos arquivos, o ensaio da
migração a partir dele, o emissor offline e webhook no servidor real, a configuração
comercial, a atualização dos clientes e a validação do retorno após uma publicação
confirmada. O escopo inicial de titularidade usa a confirmação já dada pelo usuário;
não concede empresas de terceiros a administradores ou consultores.

O usuário autorizou integrar à main quando houver segurança para publicar. Essa
autorização permanece válida. Nenhum dado ou conta de teste do piloto deve ser
importado para produção como parte da migração.
