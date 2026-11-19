# Auditoria de lançamentos — AgriGest 1.2.0

Data: 19/11/2026. Estado: implementação e testes locais concluídos; publicação SQL aguardando execução/retorno do SQL Editor. Instaladores gerados; atualização do Windows ainda não aplicada. PWA hospedada não publicada nesta rodada.

## Problema principal de estoque

A consulta de leitura ao servidor identificou funções incompatíveis: criar/editar operações não tratavam a distribuição `lotAllocations` nem registravam o consumo físico da mesma forma que a função de cancelamento. Essa diferença podia produzir estornos incorretos.

As novas funções tratam criação, edição e cancelamento em transações atômicas, conferem produto e lote, bloqueiam saldo negativo e saldo sem lote insuficiente, devolvem ao lote de origem e registram consumo/estorno no histórico. O cancelamento repetido não devolve estoque duas vezes. As requisições recebem identificação para recuperar uma resposta perdida sem repetir o lançamento.

O histórico antigo é conferido por produto **e lote**. Quando a distribuição registrada diverge do consumo, ou uma operação antiga com múltiplos lotes não tem evidência suficiente, a edição/cancelamento é bloqueada com explicação. Nenhum saldo antigo é recalculado automaticamente.

Na leitura anterior à implantação, considerando todo o projeto, foram encontrados oito produtos cujo saldo total era menor que a soma dos lotes e seis operações ativas com distribuição aninhada. Esses números não constituem autorização para corrigir registros, nem indicam que as seis operações estão necessariamente erradas. A tela de auditoria restringe os resultados à instituição do administrador. Permanecem relevantes os casos documentados em `auditoria-integridade-2026-11-17.md`, incluindo datas invertidas e possíveis duplicidades históricas.

## Edição, exclusão e confirmação de gravação

- Pluviometria, monitoramentos, recomendações pendentes, coletas e resultados laboratoriais receberam edição e exclusão. Safras, tipos de manutenção e zonas também dispõem de ações de manutenção.
- Os formulários abrem preenchidos com o registro atual. A versão é congelada ao abrir a edição: se outra pessoa modificar o registro, o salvamento antigo é recusado para evitar sobrescrita silenciosa.
- Cadastros e edições aguardam a confirmação do servidor antes de sair da tela. Uma falha mantém o formulário disponível. Há proteção contra cliques simultâneos e recuperação de cadastros cuja resposta se perdeu.
- Limpar campos opcionais de manutenção realmente limpa os valores. Zero no horímetro permanece zero.
- Exclusões verificam dependências. Um cadastro com histórico vinculado não pode apagar esse histórico por acidente. Recomendações já executadas são preservadas; a correção do consumo ocorre na operação vinculada.
- Entradas de estoque podem ser corrigidas/estornadas em **Estoque → Histórico**. A quantidade original permanece no histórico e uma movimentação de estorno/correção atualiza o saldo. Estoque já consumido não pode ser removido sem a conferência correspondente. Ajustes de inventário continuam exclusivos de administradores.
- Exclusões sincronizadas deixam marca local para impedir que um registro enviado anteriormente reapareça no cache offline.

## Cálculos e recomendações

O cadastro de uma recomendação não altera estoque. A baixa ocorre quando a operação recomendada é realizada. Operação, baixa e marcação da recomendação devem confirmar juntas.

A reabertura de uma operação com consumo em vários lotes agrupa a quantidade corretamente, sem multiplicar a dose pelo número de lotes. Preços históricos diferentes permanecem separados. A dose é derivada da quantidade real e da área trabalhada quando necessário.

O custo acumulado por hectare do talhão passa a dividir o custo total pelo tamanho do talhão. O cartão de uma operação mostra o custo por unidade efetivamente trabalhada. Somatórios de área convertem acres e metros quadrados para hectares. Preços históricos válidos são preservados; valores antigos sem preço salvo continuam identificados como estimativas quando dependem do cadastro atual.

Sugestões para uma próxima mudança de regra, sem aplicação automática nesta auditoria:

1. Definir uma política de custo contábil (por lote, custo médio etc.). A versão atual conserva o preço informado/salvo na operação; não substitui preços históricos por outra metodologia.
2. Vincular materiais de manutenção a produtos/lotes caso se deseje baixa automática. Atualmente o campo de material é descritivo e não consome estoque.
3. Classificar o saldo sem lote se for necessário rastrear integralmente validade e origem. A distribuição automática mantém a regra existente de usar o saldo sem lote antes dos lotes.

## Segurança e rastreabilidade

As funções novas obtêm usuário/instituição da sessão autenticada, conferem os vínculos e limitam os campos aceitos. Funções internas não recebem execução pública. As tabelas novas têm RLS e permissões restritas. Os testes cobrem acesso anônimo, cruzamento de instituições e tentativa de acesso direto aos recibos internos.

O histórico de auditoria guarda criação/edição/exclusão, usuário, horário e valores anteriores/posteriores em 16 tabelas de negócio. Apenas administradores da instituição consultam os eventos; clientes não podem modificá-los. Fotos e arquivos laboratoriais em base64 não são duplicados nesse log. Editar um resultado não altera o arquivo original do laudo.

Foram removidas mensagens de depuração que exibiam o código de convite no console. A proteção existente do mapa no Windows permaneceu ativa e foi testada.

## Histórico de índices

Os itens do histórico podem ser selecionados para reabrir a aquisição e o índice no mapa do talhão selecionado. O painel também aparece na aba de histórico da agricultura de precisão. Estatísticas salvas continuam disponíveis; uma imagem ainda não carregada exige internet para ser solicitada novamente.

## Offline e limites

A criação offline de chuva, monitoramento e recomendação foi mantida. Edição/exclusão de registros sincronizados requer conexão; registros pendentes continuam sujeitos aos controles da fila. A execução de uma operação com baixa de estoque exige conexão para validar o saldo central.

Os testes usam dados fictícios e PostgreSQL local compatível; não fizeram operações de negócio no Supabase de produção. Não houve teste de todos os fluxos em um smartphone físico. A fila local conserva as limitações de proteção do dispositivo já descritas na auditoria anterior. Não há garantia de ausência absoluta de defeitos ou perda de dados; backups e validação dos lançamentos históricos continuam necessários.

## Verificações

- TypeScript da aplicação e da configuração de build: sem erros.
- ESLint: zero erros; 12 avisos, principalmente de Fast Refresh e dependências de hooks. Os avisos não foram desativados.
- `npm run test:writes`: três testes aprovados, incluindo cenários de transações, permissões, concorrência, cancelamento repetido, estoque insuficiente, reversões e divergência de lote.
- `npm run test:precision`: cinco testes aprovados.
- `node tests/audit-ui.browser.cjs`: aprovado; CRUD de campo, exclusão/cache offline, recomendação sem baixa, correção de estoque, histórico de índice, auditoria, envio duplicado de manutenção, limpeza de opcionais e preservação de formulário após falha.
- `node tests/precision-map.browser.mjs`: aprovado; imagem visível, substituição/ocultação e erro de imagem sob a CSP nativa.
- Build de Windows e Android: concluídos. APK mantém o certificado da 1.1.1. APK de teste; publicação em loja exige assinatura de produção.

## Publicação e restauração

O arquivo `checks.local/auditoria-1.2.0-publicar.sql` reúne as três migrações em uma única transação. Não contém recálculo/backfill dos registros existentes. Antes de substituir as funções, salva suas definições exatas e a definição do gatilho de recomendação em `write_schema_restore_points`.

A cópia de fontes anterior está em `checks.local/agrigest-antes-auditoria-2026-11-18.zip`, SHA-256 `0C5346C78CAB38975CF9862816D2699F7844C5ACC478B013B3DD0492CE74BA2F`. A etiqueta Git `agrigest-1.1.1` preserva a versão anterior, e seus instaladores permanecem em `checks.local/entregas/agrigest-1.1.1`.

Os instaladores novos e seus hashes estão em `checks.local/entregas/agrigest-1.2.0`. A volta do aplicativo à versão anterior deve conservar os bancos locais e as tabelas de auditoria. Restaurar funções do servidor exige revisar as definições salvas e as operações feitas depois da atualização; não se deve restaurar saldos antigos por cima de lançamentos posteriores. A cópia de fontes não substitui backup dos dados do Supabase.
