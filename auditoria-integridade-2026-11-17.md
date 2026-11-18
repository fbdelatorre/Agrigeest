# Auditoria de segurança e integridade do AgriGest

Levantamento de 17 de novembro de 2026 sobre o projeto Supabase em produção e o código do PWA, Android e Windows. Os registros existentes foram consultados em leitura.

## Controle de acesso

- O teste em produção simulou um membro autenticado e consultou 15 tabelas de negócio. A consulta retornou zero registros de outras instituições para a identidade testada.
- As tabelas de negócio expostas inspecionadas têm RLS. A tabela legada `operation_products` estava vazia e os papéis da API estavam sem acesso. Objetos do PostGIS também constam no esquema.
- Foram revogados os acessos diretos para inserir, alterar ou apagar operações, inserir ou alterar produtos e inserir ou apagar perfis. As rotinas autorizadas continuam responsáveis por essas gravações. A edição dos campos de contato do próprio perfil e o fluxo de exclusão de produtos foram preservados.
- Foram acrescentadas políticas RLS para exigir que a máquina e o tipo de manutenção pertençam à mesma instituição do lançamento.
- A auditoria npm das dependências de produção reportou zero vulnerabilidades conhecidas no registro consultado. O Windows passou a ter política de conteúdo. O Android declara o bloqueio de tráfego em texto claro.

## Estoque a conciliar

O saldo total é o valor em `products.quantity_in_stock`. Os lotes incluem os saldos dos lotes ativos. O livro soma os movimentos físicos quando o saldo inicial da instituição está marcado como concluído. A comparação do livro usa tolerância de 0,000001.

| Produto | Unidade | Saldo total | Lotes ativos | Livro de estoque |
| --- | --- | ---: | ---: | ---: |
| AGROMEN 8019 IPRO | BAG | 28 | 0 | 0 |
| ALVO | L | 429,33 | 481,61 | 500 |
| Bright | L | 260 | 0 | 0 |
| CITRUS PRIME | L | 899,500027 | 899,500027 | 966 |
| CLORIMUROM MAX | KG | 93,497420 | 0 | 164,449320 |
| CLORPIRIFOS | L | 1.300,10 | 1.800 | 1.800 |
| CLORPIRIFOS LUBA/GHARDA | L | 7.564,40 | 8.920,30 | 10.000 |
| FX START | L | 200 | 0 | 0 |
| GH 2578 IPRO | Bag | 55 | 12 | 12 |
| HO GUAPO I2X | Bag | 4,343500 | 46,352100 | 72 |
| IHAROL GOLD | L | 4.633,125 | 5.097,075 | 5.500 |
| Pirate | L | 360 | 0 | 0 |
| REDUCTION | L | 23,895 | 64,405 | 100 |
| SOY COMBATE IPRO | Bag | 1,006400 | 33 | 33 |
| STARFIX SOJA BO | L | 480 | 480 | 885,774 |
| TRASPECT | L | 57,35 | 580,15 | 1.120 |
| XEQUE MATE | KG | 35.442,60 | 35.442,60 | 42.438,90 |

Há 17 divergências entre saldo total e livro. Em oito desses produtos, a soma dos lotes ativos supera o saldo total. A inspeção das funções em produção confirmou que criação e edição de operações alteram o saldo sem escriturar o consumo no livro de estoque. A rotina de cancelamento já contém lógica de estorno. A correção do livro precisa tratar o consumo, as alterações e o cancelamento em conjunto. Os valores acima não determinam o estoque físico.

## Datas invertidas e possíveis duplicidades

| Talhão | Data inicial | Data final |
| --- | --- | --- |
| Terra vermelha | 01/12/2025 | 29/11/2025 |
| Perto sarpe | 11/03/2026 | 07/03/2026 |

O banco passou a rejeitar datas invertidas ao criar operações ou mudar suas datas. O formulário valida a ordem, e editar uma operação permite limpar as datas opcionais. As datas antigas continuam registradas.

Cada grupo abaixo contém dois registros ativos com o mesmo talhão, safra, tipo, datas, operador, descrição, área trabalhada e produtos. Os registros de cada par foram criados com diferença de até um segundo. A confirmação depende do histórico de campo.

| Talhão | Safra | Data | Operação |
| --- | --- | --- | --- |
| 400 | 2025-2026 | 17/10/2025 | Fertilizante |
| Frente imperial | 25-26 | 19/11/2025 | Herbicida |
| Pe de manga | 25-26 | 30/11/2025 | Fungicida |
| Frente poção | 25-26 | 10/12/2025 | Herbicida |
| Pe de manga | 25-26 | 12/12/2025 | Fungicida |
| ILSON LADO 600 | 2025-2026 | 16/12/2025 | Fungicida |
| Terra vermelha | 25-26 | 26/12/2025 | Fungicida |

As consultas não encontraram operações com talhão ou safra de outra instituição, manutenção com máquina ou tipo de outra instituição, chuva com vínculo de outra instituição, recomendação divergente do relatório associado ou nota com status de conclusão incompatível com a data.

## Limites desta rodada

- A proteção contra duplo envio no formulário cobre requisições simultâneas na mesma tela. O cadastro comum de operação ainda precisa de idempotência persistente para recuperação após perda da resposta ou nova tentativa em outra sessão.
- A fila local usa SQLite no Android e Windows e IndexedDB na PWA. Os registros já sincronizados ficam no Supabase. Os pendentes dependem do armazenamento local até a sincronização. A fila local não tem criptografia própria.
- Os testes de regressão rodam com dados simulados. A restauração de backup em um ambiente separado e o teste nos aparelhos físicos não foram verificados nesta rodada.
- As migrações de permissões, validação de datas e RLS de manutenção foram aplicadas pelo SQL Editor. Os registros históricos divergentes foram preservados.
