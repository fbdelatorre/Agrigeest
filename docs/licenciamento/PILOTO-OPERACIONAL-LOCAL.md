# Piloto operacional local — 24/11/2026

Esta etapa conecta a interface habitual do AgriGest a uma cópia isolada dos dados,
na branch `codex/licenciamento-planejamento`. Não publica migrações no Supabase
real, não altera a main e não substitui o aplicativo de uso diário.

O proprietário confirmado e os outros três administradores estão vinculados em
tabelas privadas de licenciamento. As identidades e a confirmação de titularidade
ficam somente em `checks.local`, fora do Git. Os perfis antigos não são movidos,
excluídos ou convertidos para outros usuários.

## Restauração e integridade

- Backup completo customizado antes das guardas, com SHA-256 registrado no manifesto
  privado e restauração validada em um banco novo com prefixo exclusivo de piloto.
- A preparação recusa sobrescrever um piloto existente. Nenhum comando de reset é
  usado. O banco restaurado de origem continua separado.
- Comparação inicial de 62 tabelas: registros idênticos ao backup. Depois dos logins,
  os 27 conjuntos de dados operacionais continuam idênticos; sessões e metadados de
  login Auth naturalmente mudam na cópia usada para entrar no aplicativo.
- Os testes SQL usam `BEGIN` e `ROLLBACK`, inclusive para alterações temporárias de
  licença, função, dispositivos, produtos, operações e monitoramentos.

## Proteções verificadas

Guardas em 25 tabelas e adaptação das rotinas auditadas ao contexto da fazenda.
As regras antigas são preservadas e as novas superfícies não permitem editar
monitoramentos, chuvas e recomendações diretamente sem a RPC auditada.

Testes executados: entrada de estoque, desconto por operação, ajuste por edição,
devolução por cancelamento, recomendação sem desconto antecipado, execução única,
edição e exclusão de chuva e monitoramento próprio, recusa de edição de outro autor,
limitação do monitor de campo, desligamento, instalação revogada, licença cancelada
com histórico legível e recuperação de recibo já confirmado sem duplicação.

O resumo do mapa usa autorização explícita e conjuntos limitados à fazenda e à
safra selecionadas para evitar repetir verificações por cada linha. O monitor de
campo não ganha acesso ao mapa por chamar a RPC diretamente.

## Serviços e aplicativo

`Testar-AgriGest-Piloto-Local.cmd` inicia os serviços já preparados e a interface,
com Docker aberto. Não inicializa nem limpa bancos.

| Serviço | Endereço local |
|---|---|
| API piloto | `http://127.0.0.1:48721` |
| Interface de navegador | `http://127.0.0.1:48780` |
| Caixa de emails separada | `http://127.0.0.1:48724` |

Auth e REST usam exclusivamente o banco piloto, segredo JWT próprio e portas
vinculadas a `127.0.0.1`. O Auth usa um papel próprio sem superusuário, criação de
bancos ou bypass de RLS. O dump da CLI omite o histórico de migrações Auth: a
recuperação desses metadados foi condicionada à comparação das colunas,
restrições e enums com o Auth local compatível. Não foram alteradas senhas de contas.

O instalador `AgriGest Piloto Local`, identificador
`com.agrigest.operational.pilot`, embute a interface completa e usa armazenamento
próprio, incluindo SQLite separado para as filas de campo. Não contém dados,
emails, contas, chave administrativa nem segredo JWT. Obtém só a configuração
pública do servidor piloto em tempo de execução e recusa outro endereço.

No aplicativo, abrir “Licença e acesso de teste”, autorizar a instalação e atualizar
as permissões. A interface mostra o papel confirmado pelo servidor, filtra a
navegação e bloqueia formulários sem autorização; o servidor continua sendo a
barreira efetiva para todas as gravações.

## Limites desta entrega

O piloto está fixado à primeira fazenda confirmada. Seleção de várias fazendas,
convites integrados, contratação/cobrança no aplicativo operacional, integração
com satélite, política definitiva de validade offline e implantação em produção
exigem etapas próprias. O gestor de licenças existente permanece independente.

Este instalador requer os serviços locais preparados neste computador. Não é
distribuição comercial. Testes automatizados de UI passaram para login local do
proprietário, autorização de instalação e leitura de áreas, sem erros JS ou REST.
O executável Windows deve receber validação manual após compilação; o teste no
navegador não comprova por si só o comportamento do WebView instalado.
