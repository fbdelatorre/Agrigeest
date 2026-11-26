# Uso offline e lançamentos não enviados — piloto

Etapa de 25/11/2026, posterior a `d9bdcda`, na branch de testes.
Prazo confirmado pelo usuário: **até sete dias**, limitado também ao vencimento
das licenças da fazenda e da consultoria usada no acesso.

## Teste pelo navegador

1. Execute `Testar-AgriGest-Offline-Local.cmd` ou abra
   `http://127.0.0.1:48781/monitoring`, neste computador.
2. Entre com a conta do piloto. Em Membros e licença, solicite a autorização
   deste navegador; somente o proprietário aprova. O endereço 48781 possui
   armazenamento separado do piloto de desenvolvimento 48780 e ocupa sua própria
   vaga de instalação. Não copia a sessão, a prova nem as pendências do outro endereço.
3. Escolha a fazenda e a safra. Carregue os talhões, produtos, monitoramento e chuva
   com conexão. Confira o aviso de validade da autorização offline.
4. Desligue a conexão do navegador, reabra a página e registre monitoramento,
   recomendação ou chuva conforme sua função. A versão de desenvolvimento na
   porta 48780 continua disponível, mas o teste de reabertura sem rede é na 48781.
5. Reconecte. Os registros são enviados após nova conferência de acesso pelo
   servidor. Recomendações não movimentam estoque; apenas executar a operação
   recomendada pode descontá-lo, conforme o fluxo operacional existente.

O PWA guarda os arquivos estáticos necessários para abrir sem rede. A configuração
pública validada também fica disponível localmente. APIs, tokens e respostas de
dados do Supabase não são colocados no cache do service worker. Os caches de dados
e a fila existentes continuam separados por conta, fazenda e safra.

## Destaque para o autor

O aviso global mostra quantos lançamentos da conta conectada ainda não foram
enviados, inclusive pendências de outras fazendas de origem. O detalhamento em
`/pending-records` mostra somente os registros daquela conta, com fazenda/talhão
preenchidos a partir do cache quando disponível, conteúdo de identificação, data
local e motivo da espera ou recusa. Não busca dados de fazendas sem permissão.

- **NÃO ENVIADO:** registro salvo no aparelho, sem confirmação de envio.
- **Acesso bloqueado:** licença, vínculo, função ou aparelho precisam ser regularizados.
- **Monitoramento pendente:** a recomendação aguarda o envio de seu monitoramento.
- **Recusado pelo servidor:** o autor precisa conferir os dados e usar o fluxo de
  correção/reenvio na fazenda de origem. Duplicidades não são sobrescritas.

Essa página pode ser aberta sem acesso operacional à fazenda. A troca de conta
não exibe os registros do autor anterior, nem durante a leitura assíncrona.
Um bloqueio não apaga o registro, não troca a fazenda nem muda seu autor. Nenhum
rascunho é descartado automaticamente; o descarte manual existente exige confirmação.

## Autorização e sincronização

O servidor local emite uma autorização ECDSA P-256 vinculada ao usuário, sessão,
instalação, prova da instalação, licença de origem e fazenda. Apenas dados
calculados pelo servidor são assinados. Duração e funções enviadas pelo cliente
não ampliam a autorização. O aplicativo contém apenas a chave pública de verificação.
A chave privada fica em arquivo ignorado no diretório privado do piloto.

O servidor exige conta e sessão válidas, licença vigente, vínculo/delegação atual,
capacidade disponível e aparelho aprovado pelo proprietário. Para consultorias,
a validade também respeita a licença da fazenda cliente. O monitor de campo
continua restrito a monitoramento e chuva, com o contexto de áreas necessário;
a autorização não libera recomendação, estoque ou operações para esse cargo.

Na reabertura offline, a assinatura, identidade, fazenda, sessão, prova, instalação,
prazo máximo e relógio são conferidos. Autorização vencida mantém os dados locais
para consulta, mas bloqueia novos registros. Retrocesso detectado no relógio
também bloqueia novas gravações até conferir a conexão.

Uma falha de transporte durante renovação não descarta uma autorização assinada
ainda válida. Uma resposta que confirma perda de acesso invalida a autorização
local. Respostas atrasadas de outra atualização não restauram permissões antigas.

Cada registro pendente tem a permissão conferida novamente antes de envio, e as
RLS/triggers conferem outra vez na gravação. IDs estáveis e consulta de recibo
evitam duplicação se a resposta se perder. O monitoramento é enviado antes da
recomendação. Falha ou recusa preserva o payload local e destaca que não foi enviado.

Offline não permite conhecimento instantâneo de uma revogação feita em outro
aparelho. A autorização pode valer até seu vencimento de sete dias, mas o servidor
recusa a sincronização após revogação. A assinatura não cifra os caches nem protege
contra alguém que controle o sistema operacional e altere o próprio aplicativo.
O servidor não confia no relógio, no cache ou na assinatura local para aceitar uma
gravação: aplica as permissões atuais do banco.

## Preservação e validação

O script `scripts/apply-pilot-offline.mjs --local-only` faz backup antes da aplicação
e verifica sua listagem e SHA-256. Não modifica dados operacionais nem permissões
do Supabase de produção. O arquivo privado é `before-pilot-offline.dump`, na pasta
do contexto piloto. Não foi feita restauração desse novo dump sobre a base em uso.

Validações executadas nesta etapa:

- Assinatura alterada, outra conta/fazenda/sessão/instalação/prova, vencimento,
  limite de sete dias e retrocesso de relógio.
- Navegador com toda a rede desligada: reabertura do PWA e registro de três tipos
  de lançamento, com os arquivos estáticos já disponíveis no aparelho.
- Licença cancelada antes de reconectar: nenhuma inserção, pendências destacadas.
- Outra conta no mesmo armazenamento: nenhuma pendência do autor anterior exibida.
- Regularização: envio em ordem, sem duplicação e sem desconto de estoque pela recomendação.
- Monitor de campo aprovado: concessão de monitoramento e chuva, sem recomendação.
- Interface em 1366 e 390 pixels, controles de estoque/permissões em transação
  revertida e fluxo completo de equipes, convites, funções e aparelhos.
- Comparação dos registros públicos anteriores e remoção de todas as fixtures.

## Publicação e main

O usuário autorizou integrar à main quando a validação permitir. Esta etapa
continua local: não publica chaves, banco, cobrança ou funções em produção, nem
gera instalador. A autorização assinada e o teste de reabertura descritos aqui
foram homologados no navegador local; não se afirma homologação dos binários
Windows/Android existentes.

Antes da integração comercial ainda é necessário ensaiar a migração com cópia
atualizada e restauração, preparar o emissor de autorizações e webhook no servidor
real, configurar o ambiente comercial e validar a atualização dos clientes e
suas filas locais. O piloto usa endereços e chaves próprios que não podem ser
simplesmente apontados para a base de produção.
