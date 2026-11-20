# Protótipo isolado de vínculos, convites e permissões

Etapa 2 realizada na branch `codex/licenciamento-planejamento`, sem enviar mudanças
à main ou executar comandos no Supabase. O aplicativo usado diariamente, seus
fontes de produção, as migrações existentes e os bancos de negócio não foram alterados.

## O que está implementado no laboratório

- Três fazendas e sete pessoas fictícias, com proprietário, administrador,
  responsável por aplicação, monitor e consultor.
- Vínculos por usuário e fazenda, sem substituir a fazenda do perfil ou mover dados.
- Convite destinado a uma conta, aceitação única, expiração, revogação e reativação
  mediante novo convite. Somente o proprietário emite e revoga convites.
- Consultor que administra a própria fazenda continua com acesso limitado quando
  entra como consultor em uma fazenda cliente.
- Monitoramentos e pluviometria com edição/exclusão de próprios registros para
  monitores; consultores também registram recomendações e consultam estoque/aplicações.
- Operações fictícias de demonstração somente para proprietário, administrador e
  responsável, com débito atômico apenas do estoque de teste.
- Autoria e fazenda imutáveis nos registros, chaves compostas para vínculos entre
  talhão, relatório, recomendação e produto, e histórico de alterações.
- Revogar acesso preserva relatórios, recomendações e demais registros existentes.

O banco é PostgreSQL local via PGlite, persistido no IndexedDB exclusivo do teste.
As operações são executadas em transações com o papel restrito e passam por RLS
e funções com validações. O usuário das transações é **simulado**: o seletor de
contas altera uma configuração de sessão dentro desse banco local. Isso permite
exercitar as políticas, mas não substitui Supabase Auth nem protege um banco
remoto contra uma identidade enviada arbitrariamente pelo navegador.

Este esquema não pode ser promovido diretamente a produção. A autenticação real
precisará fornecer a identidade validada pelo servidor, e todas as funções/RLS
legadas devem ser adaptadas antes de ativar perfis restritos no AgriGest atual.

## Como testar agora

Neste computador, com o servidor local aberto, usar Edge ou Chrome em:

`http://127.0.0.1:4174`

O navegador integrado do Codex não conseguiu alcançar esse endereço local; abrir
o endereço no navegador do próprio computador. Para iniciar novamente a partir
do repositório:

```sh
npm run build:licenses
npm run licenses:preview
```

O pacote `checks.local/entregas/licenciamento-etapa2-0.1.0/AgriGest_Licencas_Teste_0.1.0_web.zip`
contém os arquivos compilados e um iniciador local. Extraí-lo em uma pasta nova,
executar `Iniciar-teste.cmd` com Node.js instalado e abrir o endereço indicado.
O servidor aceita apenas consultas locais e escuta exclusivamente em `127.0.0.1`.

Roteiro sugerido:

1. Ana: abrir a Aurora, consultar os dados e convidar Fábio como consultor.
2. Gabriel: verificar que não vê a Aurora nem o convite de Fábio.
3. Fábio: aceitar o convite, selecionar a Aurora e conferir estoque/aplicações
   somente para leitura. Criar uma recomendação não altera o saldo.
4. Fábio na Cedro: verificar que sua função é proprietário somente nessa fazenda.
5. Eva: registrar e corrigir monitoramento/chuva próprios, sem estoque ou recomendações.
6. Ana: revogar o vínculo de Fábio. Ele deixa de acessar a Aurora e conserva a Cedro.
7. Bruno: verificar que só acessa a Boa Vista. Reabrir a página para conferir a
   persistência dos registros fictícios.

## Separação do aplicativo real

O protótipo tem entrada Vite própria e não importa o cliente Supabase, a aplicação
principal ou seus comandos de armazenamento. Sua configuração Windows usa o nome
`AgriGest Licencas Teste` e o identificador `com.agrigest.licensing.sandbox`.
O identificador do AgriGest real permanece `com.agrigest.desktop`.

A política de conteúdo do teste não permite conexões HTTPS externas; aceita os
arquivos locais e os canais locais do Tauri. O banco IndexedDB do teste tem nome
próprio. Nenhum comando nativo de acesso ao SQLite real foi exposto nesse protótipo.
A compilação não inclui credenciais de produção e o empacotamento inclui apenas
os arquivos do laboratório, sem `.env`, cópias de segurança ou dados dos aparelhos.

## Verificação realizada

- TypeScript da aplicação principal e do laboratório: sem erros.
- ESLint: sem erros; os 12 avisos existentes no aplicativo principal permanecem.
- Três testes automatizados do laboratório aprovados, incluindo verificação de
  ambiente isolado, acessos diretos a tabelas/funções, associação com outra fazenda,
  autoria falsa, aumento indevido de papel, convite para outra conta, convite
  expirado/reutilizado/revogado, preservação dos dados e ausência de baixa por recomendação.
- Chamadas concorrentes de pessoas de fazendas diferentes mantiveram os contextos
  de autorização separados nas transações locais.
- Teste de interface com a mesma CSP do pacote nativo: aprovado. Cobriu cadastro,
  edição, convite, aceite, consulta do consultor, recomendação, revogação e persistência.
- Nenhuma conexão externa foi observada durante o teste de interface.
- Compilação normal da PWA principal continuou concluindo sem importar o laboratório.

Esses resultados validam o protótipo e não equivalem a uma auditoria do Supabase
real nem a testes da futura integração de identidade e cobrança.

## Situação do instalador Windows

A tentativa local repetiu o bloqueio do Controle de Aplicativos do Windows na
dependência Rust `serde` (erro 4551). Com autorização do usuário, a compilação
foi realizada no GitHub Actions, exclusivamente na branch de teste.

- Execução concluída com sucesso: https://github.com/fbdelatorre/Agrigeest/actions/runs/44756180451
- Código compilado: `000ee9a7042a848023ad0f3fa3cbe84934f8a4bb`.
- Instalador: `AgriGest_Licencas_Teste_0.1.0_x64-setup.exe`, 6.351.349 bytes.
- SHA-256: `353E7B5273AEB111B75269BC9E24E8CDDB3E8401B2CEA1D4F5BC1CC7F6BF3199`.
- Cópia local em `checks.local/entregas/licenciamento-etapa2-0.1.0`.
- Download, CRC do ZIP, SHA-256 do instalador, identidade e commit conferidos.

O pacote contém o aplicativo independente, instruções, metadados e checksum.
Instalar e abrir **AgriGest Licencas Teste**; usar o roteiro de contas fictícias
acima. A compilação e os testes foram aprovados; a instalação e a execução nativa
neste computador ainda precisam ser validadas pelo usuário. O pacote não tem
assinatura comercial. Nenhuma proteção do Windows foi desativada.

O aplicativo de uso diário, seus dados, a branch main e o Supabase permanecem
sem alterações. O artefato do Actions tem retenção de sete dias; a cópia local
foi preservada para os testes.

## O que ainda não está ativo

Não há pagamentos, limites efetivos de usuários/aparelhos, migração das contas
existentes, envio real de convites, política de autorização offline ou mapeamento
de titularidade das fazendas atuais. Os limites planejados permanecem 6 dispositivos
por fazenda e 5 por consultoria, mais 2 por usuário adicional nos dois planos.

A próxima etapa é a validação de compatibilidade e a definição do mapeamento dos
usuários existentes em ambiente separado. A produção continua condicionada ao
backup completo do Supabase restaurado e validado fora da produção.
