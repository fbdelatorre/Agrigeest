# Etapa 3 — contas e ciclo de licenças simulados

Protótipo 0.2.0 na branch `codex/licenciamento-planejamento`. Nenhuma mudança
nos fontes da aplicação real, Supabase, Android ou Windows de uso diário.
O painel e os dados novos pertencem somente ao aplicativo de teste independente.

## Implementado

- Cadastro independente, sem empresa ou função, usando apenas emails fictícios
  `@example.test` e uma confirmação de email explicitamente simulada.
- Convite de funcionário por email com ou sem conta, reserva de vaga, validade,
  revogação, token aleatório armazenado como hash no convite e consumo único.
- Caixa de saída simulada: o link abre a página de cadastro com email, fazenda e
  função preenchidos. Fazenda e função não são editáveis pelo convidado. Contas
  já existentes podem aceitar no mesmo contexto ou pela caixa de entrada.
- Cadastro separado antes do aceite não duplica a conta e conserva o convite.
- Convite de consultor exige conta e empresa de consultoria; aceite/escrita exigem
  licença ativa de consultoria. Ser dono de outra fazenda não amplia permissões.
- Criação de empresa/fazenda mediante confirmação de pagamento simulado, com
  período mensal ou anual. Preços são apenas números ilustrativos de laboratório.
- Página Plano e licenças, com situação, valor simulado, cotas, vagas reservadas
  em convites, adicionais, aparelhos fictícios e histórico.
- Fazenda: 4 usuários e 6 aparelhos; cada adicional soma 1 usuário e 2 aparelhos.
  Consultoria: 5 aparelhos + 2 por adicional. Usa-se provisoriamente 1 usuário
  base de consultoria; isso ainda precisa de confirmação comercial. Gestão de
  funcionários de consultoria não foi adicionada nesta etapa.
- Desligamento preserva conta e lançamentos. O proprietário pode manter a vaga
  adicional ou cancelar uma, reduzindo imediatamente valor/cotas. Se houver
  aparelhos acima do novo limite, deve selecionar quais revogar; falha preserva
  atomicamente o estado anterior. Aparelhos do desligado são revogados.
- Cancelamento principal imediato deixa os dados somente para consulta, respeita
  os perfis e bloqueia mutações por RLS e gatilhos, inclusive na RPC de aplicação.
  Reativação simulada conserva registros e não restaura funcionários desligados.
- Helena representa o gestor do aplicativo: concede/renova/revoga cortesia,
  com prazo opcional e motivo. Não recebe acesso automático às fazendas.
  Cortesia expirada/revogada não inicia cobrança automática.
- Operações de licença/cortesia/aparelhos usam chaves de repetição, bloqueios
  de linha e histórico protegido. A redução nunca apaga registros de negócio.

## Como testar

1. Simule Ana. Em Plano e licenças, adicione uma vaga; a Aurora começa com suas
   quatro vagas base ocupadas. O teste passa a cinco usuários e oito aparelhos.
2. Em Fazenda → Equipe e convites, convide `joana@example.test` como monitora.
   Abra o email simulado, complete o nome, simule a verificação e aceite.
3. Joana consegue registrar monitoramentos/chuvas, sem acesso ao estoque. Volte
   para Ana e desligue Joana, escolhendo manter ou cancelar o adicional.
4. Em Plano e licenças, cancele a licença: o histórico continua visível e os
   formulários de alteração desaparecem. Reative e confira a preservação.
5. Simule Helena → Gestão do aplicativo. Conceda cortesia à Aurora com motivo e
   validade opcional. Volte para Ana: o valor simulado fica zero. Helena continua
   sem fazendas autorizadas. Revogar a cortesia conserva os dados em consulta.
6. Cadastrar outra conta fictícia permite cadastro sem fazenda. Minha conta e
   empresa permite contratar uma propriedade ou consultoria com pagamento fake.
7. Fábio e Gabriel já possuem empresas fictícias de consultoria. Iara ou outro
   usuário recém-cadastrado só recebe convite de consultor depois de criar a sua.
8. Aparelhos são registros fictícios para testar limites, não uma identificação
   deste computador/celular. Teste exceder o limite e selecionar revogações.

## Preservação e atualização local

O identificador Windows continua `com.agrigest.licensing.sandbox`, distinto do
AgriGest real. O banco fictício continua `agrigest-licensing-lab-v1`.
`lifecycle.sql` é aplicado uma única vez em transação, após detectar a estrutura
antiga; os registros fictícios existentes não são apagados. Falha de migração
reverte a transação. Não executar esse SQL no Supabase nem copiá-lo para migrations.
O ponto de restauração anterior ao licenciamento e o instalador 0.1.0 continuam
preservados. Voltar o executável não desfaz a evolução do esquema fictício; a
restauração de dados reais segue as condições de RESTAURACAO.md.

## Verificação

Seis grupos automatizados cobrem as regras anteriores e os novos fluxos: cadastro,
convites com/sem conta, consultoria, reservas e concorrência local de vagas,
idempotência, limite de aparelhos, redução atômica, desligamento, consulta após
cancelamento, reativação, preservação, concessão e revogação de cortesia e tentativa
de obter privilégios do gestor. TypeScript e ESLint do laboratório sem erros.
Teste de interface no Edge, sob a CSP nativa, cobre cadastro pelo convite e
independente, contratação fake, cancelamento de adicional, consulta/reativação,
cortesia, CRUD de campo, isolamento e persistência, sem chamadas externas.

Estes testes não validam concorrência de um Supabase remoto, autenticação real,
envio de emails, provedor financeiro ou autorização offline de aparelhos reais.
Ainda não há calendário de faturamento, reembolso/crédito proporcional nem
identificação real de dispositivos. Nenhuma fila offline da aplicação real foi
alterada. O seletor de contas e a confirmação de pagamento são simulações abertas,
inadequadas para uso em produção; todos os dados devem continuar fictícios.

## Instalador

A compilação Windows ocorre no GitHub Actions da branch de teste e inclui o
novo conjunto de testes. O instalador independente mantém o nome AgriGest
Licencas Teste e passa à versão 0.2.0. A entrega deve registrar execução, commit e
SHA-256 conferido. A instalação/execução nativa será validada pelo usuário;
os testes de interface aqui descritos foram executados no navegador local.
