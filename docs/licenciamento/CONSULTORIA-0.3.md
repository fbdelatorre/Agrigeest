# Consultoria: equipe e acesso por fazenda — protótipo 0.3.0

Implementação na branch de teste `codex/licenciamento-planejamento`, sem alterar
a main, o Supabase ou os dados operacionais do aplicativo em uso.

## Regras confirmadas e comportamento

- Licença da consultoria: proprietário + 3 funcionários, 5 aparelhos compartilhados.
  Cada adicional libera uma vaga e dois aparelhos. A licença da propriedade
  permanece com 4 usuários e 6 aparelhos base.
- Equipe da consultoria é separada da equipe diretamente vinculada à fazenda.
  O titular convida apenas administrador, monitor ou responsável por aplicação.
  Não pode emitir convite de consultor para outro consultor, inclusive usando
  o caminho antigo de convite em sua propriedade; o banco também bloqueia a ação.
- Fazendas do convite começam desmarcadas. O titular escolhe uma, várias ou nenhuma.
  Pode editar depois a seleção por funcionário. Novos clientes não são incluídos
  automaticamente. Se nenhuma fazenda for marcada, existe vínculo com a empresa,
  mas não acesso às propriedades dela.
- Só podem ser selecionadas propriedades com vínculo direto ativo do titular
  como proprietário ou consultor e licença ativa no momento da concessão.
  Um funcionário não pode repassar os dados usando a própria empresa ou mudar
  seus acessos diretamente. Uma relação herdada nunca serve de origem para outra.
- Nos clientes, administrador/responsável da consultoria têm o teto operacional
  do consultor: consultar estoque/aplicações, registrar recomendações, monitorar
  e anotar chuva; sem executar aplicações ou movimentar estoque por este vínculo.
  Monitor tem apenas os lançamentos próprios de campo. Cargos da consultoria não
  concedem administração contratual nem equipe da fazenda cliente.
- Revogar o titular na fazenda bloqueia as delegações dependentes. Reinvidar o
  titular não restaura acessos antigos: uma versão do vínculo identifica a origem
  e exige nova seleção explícita. Desligar/recontratar o funcionário também não
  restaura fazendas antigas. Conta e lançamentos são preservados.
- Cancelar a assinatura da consultoria conserva apenas as consultas já autorizadas,
  com bloqueio de escrita para a equipe. Aparelhos consomem a mesma cota da empresa.
  Adicionais respeitam vagas ocupadas/reservadas e limites de aparelhos, inclusive
  no desligamento com cancelamento imediato do adicional.

## O que foi reproduzido

Em um banco fictício novo da versão 0.2.0, Ana convidou Fábio para Aurora, e Fábio
convidou Gabriel como consultor de Cedro. Gabriel recebeu somente Cedro nesse
cenário: não foi reproduzida herança automática de Aurora pela regra antiga.
Isso não determina o conteúdo dos vínculos já criados na instalação do usuário.

Foi encontrado um problema de identificação no simulador 0.2.0: reabrir a página
reiniciava a conta selecionada para Ana. A 0.3.0 conserva a identidade simulada
selecionada e mostra a origem do acesso na fazenda. A possibilidade anterior de
convidar outro consultor e a ausência de equipe/seleção por fazenda foram corrigidas.

Convites diretos já aceitos não foram apagados nem convertidos em cargos
inventados. Se Gabriel tinha convite direto de Cedro ou Aurora, esse vínculo
continua independente da equipe da consultoria. Para removê-lo, o proprietário
da respectiva fazenda usa Fazenda → Equipe e convites → Revogar acesso.
O novo controle altera somente as permissões derivadas da consultoria.

## Roteiro de teste

1. Ana → Fazenda → Equipe e convites: convidar Fábio como consultor de Aurora.
2. Fábio: aceitar o convite. Abrir **Equipe da consultoria**, convidar Gabriel
   como administrador e marcar **somente Cedro**. Aurora deve ficar desmarcada.
3. Gabriel: aceitar o convite da empresa. Ele vê somente Cedro, se não houver
   outros convites diretos anteriores. Reabrir conserva a conta Gabriel.
4. Fábio → Equipe da consultoria → Fazendas de Gabriel: desmarcar Cedro, marcar
   Aurora e salvar. Gabriel passa a ver somente Aurora nesse vínculo.
5. Desmarcar tudo: Gabriel permanece na empresa, sem fazendas derivadas.
6. Plano e licenças da consultoria mostra proprietário + 3 funcionários e
   5 aparelhos base. Testar limites e adicional de uma vaga + dois aparelhos.
7. Ana revoga Fábio: Gabriel deixa de ver Aurora por esse vínculo, mesmo que
   a seleção antiga continue no histórico. Reinvidar Fábio não a restaura.

## Validação e limites

Dez grupos de testes do banco aprovados, incluindo regressões da etapa anterior,
reprodução antes/depois da migração, seleção exclusiva, chamadas diretas, papéis
inválidos, tentativa de delegação sucessiva, revogação/recontratação, cancelamento,
vagas reservadas, aparelhos compartilhados, idempotência e tokens inválidos.
TypeScript e ESLint do laboratório sem erros. Interface no Edge sob CSP nativa
aprovada: Fábio/Gabriel, seleção e troca Cedro/Aurora, conta preservada ao reabrir,
limites exibidos e regressões anteriores; nenhuma chamada externa observada.

`consultancy.sql` é uma evolução local aplicada uma única vez em transação, com
guarda de ambiente e sem apagar registros anteriores. Não aplicar no Supabase.
Contas, emails, pagamentos e aparelhos seguem simulados; o diretório fictício
e o seletor de identidade não podem ser usados como autenticação de produção.
Não foi feita uma auditoria dos dados privados da instalação de teste do usuário.
Instalação e execução nativa do novo pacote permanecem para validação pelo usuário.
