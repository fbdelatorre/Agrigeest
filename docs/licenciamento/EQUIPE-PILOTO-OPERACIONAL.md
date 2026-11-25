# Equipe no piloto operacional — 0.1.2

Esta etapa conecta convites de funcionários, edição de função e desligamento à
página Membros e licença. Utiliza exclusivamente o banco piloto local existente e
as RPCs de equipe já auditadas. Não publica migrações nem altera produção ou main.

## Comportamento

- Somente o proprietário gerencia funcionários. Funções disponíveis: administrador,
  responsável por aplicação e monitor de campo. A seleção aceita busca por nome.
- Convites reservam vaga e respeitam proprietário + 3 funcionários + adicionais já
  contratados. Um convite aceito não consome uma segunda vaga. Convites pendentes
  podem ser revogados. Sem vaga livre, o botão explica a limitação.
- A consulta de conta cadastrada ocorre no servidor ao criar o convite. Conta nova
  recebe a rota de cadastro, com fazenda, função e email preenchidos. Conta existente
  recebe acesso à sua conta. Somente o email confirmado do destinatário pode aceitar.
- Cadastro não atribui fazenda ou função por metadados enviados pelo usuário. A
  atribuição ocorre na aceitação autenticada da RPC. O perfil público não é movido.
- Troca de função usa versão do membro e pedido idempotente. Desligamento revoga o
  vínculo e seus aparelhos, preservando conta, autoria e registros. A cota contratada
  é mantida nesta etapa; redução financeira de adicionais pertence à integração de
  planos e cobrança, ainda não conectada ao piloto operacional.
- A rota de conta e convites funciona antes de existir vínculo com uma fazenda.
  Funcionário desligado continua cadastrado e pode receber novo convite sem signup.

## Emails e Windows

Todos os convites e confirmações ficam no Mailpit separado do piloto, porta 48724.
Nenhum email é enviado a destinatários reais. Convites usam HMAC determinístico por
pedido, token em fragmento e apenas hash no banco. O segredo fica no arquivo
privado local, fora do Git e do pacote. Link de convite é construído pelo servidor,
com destino fixo `http://127.0.0.1:48780/convite`; não aceita redirecionamento externo.

O proxy atende somente esta função local e normaliza os cabeçalhos CORS para evitar
origem duplicada. A autenticação é verificada no Auth próprio do piloto e a RPC
revalida propriedade e sessão. O papel de serviço só registra a entrega no backend.

Cadastro exige confirmação de email e senha mínima de 12 caracteres. Os caminhos
de confirmação, convite, recuperação e troca de email foram explicitamente fixados
no Auth do piloto para não herdarem o endereço da outra cópia local da CLI.

No Windows, a ponte de abertura do navegador aceita somente nomes predefinidos
para a caixa local e a página de convites; não aceita URLs, comandos ou arquivos.
Há opção de copiar endereço. O identificador Windows continua o mesmo, preservando
sessão, aparelhos e armazenamento na atualização.

## Validação e preservação

Backup completo anterior em `checks.local/licensing-local/operational-team-2026-11-24`,
com 1.447.451 bytes e SHA-256
`d2a4df3b760eedc8ead62a24e095305f3e6aebaf983e49b2acc522a176bfc328`.
Identidades, credenciais e dados de teste ficam fora do Git.

O teste `tests/operational-pilot-team.browser.cjs --local-only` cria uma fazenda e
contas fictícias independentes, exercita UI e servidor reais, e remove exclusivamente
essas fixtures ao terminar. Compara hashes de todas as tabelas operacionais antes e
depois. Os quatro usuários existentes não são alterados para abrir vagas de teste.

Passaram: envio do convite, cadastro preenchido, confirmação, aceitação, aparelho,
monitoramento autorizado, nova função efetiva na sessão existente, desligamento com
acesso negado e conta/histórico preservados, e novo convite à mesma conta com login
por senha sem novo cadastro. Contratos de equipe, aparelhos e emails também passaram.

Consultores, seleção de múltiplas fazendas, contratação/redução de adicionais e
cancelamento/reativação financeira continuam em etapas próprias desta integração.

## Entrega Windows

Execução Actions `45516631862`, commit compilado
`4ab168832c7e569128a5213e6813cda828b317dd`, artefato `14979036050`:
todos os passos aprovados, incluindo contratos Node, build Windows, teste Rust de
destinos locais e inspeção de isolamento do pacote. Instalador de 3.799.214 bytes,
SHA-256 `97F39BE287D258CC707AABDEEBCB697A1E397C055DE8A913677BB82AEE1EBD8F`,
identidade e versão conferidas depois do download. Sem assinatura comercial.
Entrega em `checks.local/entregas/agrigest-piloto-local-0.1.2/package`.

A persistência inicial do segredo de convites no backend foi posteriormente
reforçada com gravação em arquivo temporário e substituição atômica, sem rotação do
segredo existente ou das chaves Auth. Teste local de preservação das chaves passou.
Essa alteração e a documentação não modificam os assets do executável compilado.
