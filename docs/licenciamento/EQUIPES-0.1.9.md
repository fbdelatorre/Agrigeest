# Empresas, equipes e convites — preparação 0.1.9

Etapa executada na branch codex/licenciamento-planejamento, em Supabase local e
na cópia restaurada PostgreSQL 15. Nenhuma migração foi publicada em produção;
nenhum vínculo operacional, lançamento, estoque ou política pública foi alterado.

## Fluxo disponível

O portal do cliente aproveita nome/tipo de uma licença ativa para preparar uma
empresa de teste. A empresa referencia a licença e o titular autenticado, com
ID próprio. O campo operational_institution_id permanece nulo. Nome igual, perfil
administrativo antigo ou compra de uma licença não comprovam titularidade de
uma fazenda existente. Não há endpoint para o cliente preencher esse campo.

O titular convida administrador, responsável por aplicação ou monitor de campo.
São três vagas de funcionários além do proprietário; convites pendentes reservam
vagas, com vencimento de sete dias. Adicional concedido libera uma vaga e dois
aparelhos. Solicitação de aumento ainda não paga não amplia a cota. A redução
pendente impede reservar novamente a vaga que está sendo cancelada.

O convite verifica a conta no servidor, sem expor uma busca pública por email.
O endpoint team-invite gera um token HMAC de 256 bits, guarda somente seu hash
e envia um link. Neste teste, o envio ocorre exclusivamente para o Mailpit local,
sem SMTP externo e com recusa explícita em ambientes remotos/produção. Novos
usuários recebem a página de cadastro com email, empresa e função preenchidos;
empresa/função não são editáveis pelo destinatário. O token fica no fragmento do
link e é removido da URL após leitura. A prévia anônima exige o token válido.
O schema licensing ganhou USAGE para anon apenas para essa função; as tabelas
e demais funções continuam com seus controles explícitos, sem acesso anônimo.

A pessoa pode criar conta sem empresa. Confirmar o email não concede o vínculo:
o aceite exige sessão real, email confirmado igual ao destinatário, convite
válido, capacidade e licença revalidados. Convite aceito não pode ser reutilizado.
Se o link for aberto com outra conta conectada, o portal identifica o destinatário
e oferece encerrar somente aquela sessão, preservando o convite para o cadastro
ou login correto. Não troca de conta nem atribui permissões automaticamente.
Contas existentes encontram o convite no próprio portal, sem refazer cadastro
nem pagar uma licença de funcionário. Metadados editáveis do Auth não definem
cargo, empresa ou acesso. O gestor administrativo continua separado e exclusivo
de contas habilitadas no servidor; nenhuma conta criada por convite vira gestora.

O titular muda o cargo com controle de versão e auditoria anterior/posterior.
Desligar revoga o vínculo e as autorizações de aparelho daquela licença, mantendo
conta, autoria, histórico e vínculos legítimos com outras empresas. Recontratar
cria outro vínculo e não restaura seleções antigas de fazendas automaticamente.
Quando aplicável, oferece manter ou solicitar cancelamento de um adicional.
O cancelamento usa a fila financeira já existente; falha do provedor não desfaz
o desligamento. Se a solicitação financeira não puder ser criada, a resposta e a
auditoria informam a falha e o portal orienta conferir Plano e licenças. Não se
afirma que o preço foi reduzido antes da confirmação do processamento.

## Consultorias e aparelhos

Convite de consultor parte do titular de uma fazenda e exige conta verificada e
empresa de consultoria ativa. Um convite relaciona somente aquela fazenda àquela
consultoria. A equipe da consultoria só recebe cargos de funcionário, nunca de
consultor. As fazendas começam desmarcadas. O titular pode selecionar suas
fazendas próprias e as fazendas de clientes que o convidaram diretamente.
Funcionários não repassam acessos por meio de outra empresa.

Cada seleção guarda a versão do convite de origem. Revogar a consultoria bloqueia
o titular e suas delegações; reinvitar gera outra versão e exige seleção explícita
para os funcionários. Alterar somente o cargo não reativa uma seleção antiga.
Os cargos de administrador/responsável da consultoria respeitam o teto do
consultor: consultas de áreas/mapas/estoque/operações e lançamentos de
monitoramento/recomendação/chuva. Não executam operações nem movimentam estoque
por esse vínculo. Monitor permanece restrito aos módulos de campo.

O cadastro de instalação passou a aceitar membros ativos. Todos consomem a mesma
cota da licença: 6 na fazenda, 5 na consultoria, mais 2 por adicional concedido.
O titular lista/revoga as autorizações da empresa. O membro vê somente seus
aparelhos, com o total compartilhado, e revoga somente os seus. Remover um membro
não revoga aparelhos de outros usuários ou de outra licença.

## Permissões e fronteira operacional

workspace_can valida conta/sessão, vínculo direto ou delegação atual, papel,
licenças, cotas e instalação da sessão no servidor. Monitor só edita seus próprios
registros; a política precisa fornecer a autoria armazenada na linha. Uma licença
cancelada/vencida mantém consultas permitidas pelo vínculo e recusa escrita.
Revogação do vínculo recusa inclusive a consulta. Administração contratual exige
titularidade e não é concedida por um cargo de funcionário.

**Essa função ainda não foi ligada às tabelas/RPCs operacionais existentes.**
Os cartões de permissões do portal descrevem a nova base de teste; não comprovam
que o aplicativo principal já aplica essas regras. O passo operacional exige
mapear titularidades reais, integrar as rotinas atômicas e RLS em cópia isolada
e depois validar sincronização offline. Não substituir institution_id de perfis
existentes, usar is_admin global como prova de propriedade ou liberar farm IDs
enviados pelo cliente sem validar o vínculo.

## Evidências

- 21 testes Node, incluindo a reprodução Ana/Aurora, Fábio/Cedro e Gabriel,
  seleção explícita, teto de consultoria, revogação/reconvite, cargo com versão,
  vagas reservadas, isolamento de contas e privacidade de tokens/aparelhos.
- Cinco convites concorrentes disputaram três vagas no Supabase local real:
  três foram reservados e dois recusados. Aceites e aparelhos compartilharam a
  licença corretamente; cancelamento bloqueou escrita e manteve consulta.
- Teste de interface com Auth real: email capturado, cadastro preenchido,
  confirmação real do email, aceite, autorização de aparelho, troca de cargo e
  desligamento com a conta preservada. O fluxo foi executado no portal local;
  não é apresentado como teste do binário Windows instalado.
- PostgreSQL 15: políticas em tabela temporária comprovaram isolamento entre
  fazendas, edição própria pelo monitor e bloqueio de inserir/editar/excluir após
  cancelamento, mantendo consulta. Tudo desfeito por ROLLBACK.
- Comparação da cópia: 62 tabelas operacionais, 70 políticas e RLS públicos
  preservados. Backups privados dos schemas antes das migrações e bundle do
  ponto agrigest-antes-equipes-2026-11-24 verificado em checks.local.

Referências: https://supabase.com/docs/guides/auth/sessions e
https://mailpit.axllent.org/docs/api-v1/.
