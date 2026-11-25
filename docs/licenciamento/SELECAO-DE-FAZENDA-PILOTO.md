# Senhas e seleção de fazenda no piloto

Etapa de 24/11/2026, na branch de testes; marco anterior `dc4e274`.
Main, produção e os dados operacionais existentes não foram modificados. Não foi
gerado instalador. A demonstração manual da Consultoria Teste permanece preservada.

## Senha

O cadastro aceita no mínimo oito caracteres, incluindo uma letra e um número.
Não exige símbolo nem combinação de maiúsculas e minúsculas. A mesma validação
é usada no cadastro por convite e no formulário de cadastro do aplicativo.
Entrar numa conta existente não aplica a validação de cadastro à senha digitada.
Nenhuma senha existente foi redefinida ou migrada.

No Auth do piloto, foram aplicados `GOTRUE_PASSWORD_MIN_LENGTH=8` e
`GOTRUE_PASSWORD_REQUIRED_CHARACTERS=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789`.
A preparação recriou apenas o serviço Auth, conservando banco, chaves e contas.
O config.toml do servidor local ficou preparado com `minimum_password_length=8`
e `password_requirements="letters_digits"`. Não foi alterada a configuração do
Supabase de produção nem reiniciado o outro projeto local de cobrança.
Referência da configuração: [Supabase Auth](https://supabase.com/docs/reference/api/v1-get-auth-service-config).

## Seleção de fazenda

Abra `http://127.0.0.1:48780/farms` ou Trocar fazenda nos avisos do piloto.
O seletor aceita busca pelo nome e lista somente fazendas operacionais com
vínculo permitido para a conta autenticada. Empresas sem vínculo operacional
não são associadas automaticamente a dados existentes. Licença inativa conserva
consulta conforme as regras anteriores; selecionar uma fazenda não concede escrita.

O servidor revalida o vínculo ao consultar as opções e em cada requisição
operacional. A única função adicionada, `licensing.operational_farms()`, é de leitura,
com guarda exclusiva de banco piloto e execução apenas por usuários autenticados.
Ela funciona mesmo quando a seleção anterior foi revogada. Aplicação local:
`node scripts/apply-pilot-farm-selection.mjs --local-only`.

A preferência é salva por usuário e instalação/navegador. Ao confirmar a abertura,
ocorre uma reabertura completa da aplicação. O cabeçalho de fazenda do cliente
fica fixo durante a vida daquela página, evitando que requisições já iniciadas
mudem de origem quando o usuário escolhe outra fazenda. Alterar uma preferência
em outra aba não troca os cabeçalhos de uma tela que continua aberta.

Cada fazenda carrega seu próprio cache, safras e fila offline. O cache do perfil
do piloto também passou a incluir usuário e fazenda na chave. O cache antigo não
é apagado nem reaproveitado como perfil de outra fazenda. Perfis públicos e a
instituição dos lançamentos não são reatribuídos. Filas pendentes não são movidas
nem apagadas; somente a fila da fazenda aberta pode ser sincronizada.
Formulários ainda não salvos devem ser salvos antes de sair da página para trocar.

## Verificações

O teste real de navegador usou duas fazendas operacionais e contas fictícias,
removidas ao terminar. Passaram:

- Cadastro real com exatamente oito caracteres e confirmação na caixa local.
- Recusa no Auth de senha curta, somente letras ou somente números, sem criar conta.
- Troca entre fazendas, exibindo apenas os talhões da seleção atual.
- Perfis de cache separados, safra da origem preservada e fila pendente intacta
  na origem, sem enviar o registro para a outra fazenda.
- Recusa pelo servidor de uma fazenda não autorizada gravada manualmente na preferência.
- Recuperação por outra fazenda permitida depois da revogação de acesso.
- Convites, cotas, aparelhos, função, desligamento e delegações das etapas anteriores.
- Layout em 1366 e 390 px e compilação web do piloto.

TypeScript, contratos de senha/equipe/aparelhos/preferência e testes transacionais
de estoque e operações também passaram. Os hashes das tabelas operacionais
anteriores permaneceram iguais. Relatórios privados continuam em checks.local.

Os avisos de bundle grande e importação compartilhada de jsPDF já existentes
continuam como oportunidade de otimização; não impediram a compilação.

Autorização offline de licenças, integração da cobrança no aplicativo operacional
e publicação em produção continuam em etapas próprias. Não foi ampliada a
permissão de uso offline do controle de licenças nesta etapa.
