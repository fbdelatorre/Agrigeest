# Ponto de restauração anterior ao licenciamento

Criado em 20/11/2026 para preservar o estado local anterior ao planejamento.

| Referência | Valor verificado |
| --- | --- |
| Commit de origem | `45209247928cb689ac7a78926cac5db8ef002244` |
| Etiqueta de restauração | `agrigest-antes-licenciamento-2026-11-20` |
| Branch de trabalho separada | `codex/licenciamento-planejamento` |
| `main` local preservada | `45209247928cb689ac7a78926cac5db8ef002244` |
| `origin/main` observado no início | `9e33b01610e4ac04a517f279b3224f1af0f6dc9f` |
| Versão dos fontes/pacotes recentes | 1.2.2 |
| Executável Windows instalado | 1.2.0; versões novas tiveram instalação bloqueada pelo Windows |

As duas correções locais posteriores ao `origin/main` já existiam antes deste
trabalho. Não foram descartadas nem enviadas ao GitHub nesta etapa.

## Cópias locais criadas

Diretório, fora do controle de versão:

`checks.local/restauracao-licenciamento-2026-11-20`

- `agrigest-fontes-1.2.2.zip`: fontes do commit preservado. Os 424 arquivos foram
  comparados com a árvore Git, considerando a conversão CRLF do Windows.
- `agrigest-historico.bundle`: histórico e referências Git, validado com
  `git bundle verify` e restaurado por clone local numa pasta de verificação.
  O clone passou por `git fsck --full` e retornou ao commit esperado.
- `windows/agrigest-field-data.sqlite`: cópia consistente do SQLite, criada pela
  API de backup com a origem aberta somente para leitura. A cópia passou por
  `PRAGMA integrity_check` e conferência da quantidade de registros. O hash da
  origem permaneceu igual antes e depois da operação.
- `windows/EBWebView`: cópia com o AgriGest fechado, com os 375 arquivos encontrados
  verificados por hash antes/depois da cópia. Inclui armazenamento local desse
  aplicativo no Windows, não o navegador comum do usuário.
- `windows/installed-1.2.0/agrigest.exe`: executável que está instalado.
- `packages`: pacotes disponíveis de restauração/atualização, incluindo o instalador
  Windows 1.2.0 e os pacotes Windows/Android 1.2.2.
- `local-config/.env`: configuração local, mantida exclusivamente no backup privado.
- `manifesto-restauracao.json`: tamanhos e SHA-256 dos 383 arquivos originais do
  conjunto de backup. A pasta adicional de verificação Git contém o clone usado
  para provar a recuperação e não integra essa contagem.

SHA-256 do manifesto criado:

`75DCD724F9F328B84FCD1B1F091967007681FB8283A8B457873A9C02966B60B9`

O diretório está ignorado pelo Git. Ele contém dados locais e material de sessão;
deve permanecer privado e não deve ser publicado no repositório, Netlify ou anexos
públicos. O histórico Git pode conter configurações antigas, mesmo quando o `.env`
atual não faz parte do ZIP dos fontes.

## O que este ponto não cobre

Este conjunto **não é um backup do Supabase de produção**. Não foram exportados
nem restaurados o banco remoto, o Supabase Auth ou arquivos de Storage nesta etapa.
Isso continua sendo uma condição obrigatória antes de qualquer migração futura.

Também não foram copiados os registros locais de celulares, de outras instalações
Windows ou da PWA aberta em navegadores comuns. Cada instalação pode conter
pendências ainda não sincronizadas e precisa de preservação própria. A sessão
copiada no WebView não garante um login válido após uma revogação no servidor.

Não existe garantia absoluta de risco zero. Nesta etapa a proteção consiste em
não alterar os registros existentes, não ativar migrações e manter as cópias locais
verificadas. A presença de um ZIP dos fontes não prova recuperação do banco remoto.

## Recuperação segura dos fontes

Preferir uma pasta nova de recuperação, sem redefinir a `main` atual ou sobrescrever
o diretório em uso. O procedimento de clone do bundle já foi testado dessa forma.
É possível trabalhar a partir da etiqueta preservada ou clonar o bundle local.

Para conferir um conjunto recebido, validar primeiro o SHA-256 do manifesto e os
arquivos listados nele. Depois conferir a integridade do bundle e o commit do clone.
Não executar arquivos de configuração ou pacotes desconhecidos como parte dessa
conferência.

O retorno de dados locais requer o aplicativo fechado e uma nova cópia do estado
mais recente antes de qualquer substituição. Restaurar a cópia antiga por cima de
novos lançamentos poderia perdê-los; esse procedimento não foi executado.

Em produção, uma recuperação futura deve ocorrer primeiro em um ambiente separado.
Se existirem lançamentos posteriores ao backup, deve-se reconciliá-los com o
histórico e restaurar seletivamente o necessário, sem substituir automaticamente
o banco atual por uma cópia antiga.
