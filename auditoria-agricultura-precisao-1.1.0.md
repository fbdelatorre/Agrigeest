# AgriGest 1.1.0 — Auditoria de Agricultura de Precisão

Revisão de 18 de novembro de 2026 na branch `codex/agricultura-de-precisao`. Os testes de escrita usaram banco descartável e dados sintéticos.

| Gravidade | Evidência | Correção ou situação | Arquivos |
| --- | --- | --- | --- |
| Alta | Era possível guardar um laudo apenas pelo código gerado. | Código de laboratório único por instituição, com preservação do código AG e do UUID. Conflitos offline permitem corrigir o código e reenviar a mesma coleta. | `20261118110000_precision_lab_codes_and_xls.sql`, `SampleForm.tsx`, `FieldSyncStatus.tsx` |
| Alta | Uma zona precisava respeitar o perímetro completo e os pontos vinculados, inclusive após edições. | Validação PostGIS no servidor, integridade de instituição, talhão e safra, vínculo opcional e rejeição de edição concorrente por versão do registro. | `20261118110100_precision_sampling_zones.sql`, `ZoneEditor.tsx` |
| Média | A cobertura calculada antes usava apenas a parte observada, e a renderização podia suavizar o raster. | Grade do talhão de 10 m com buracos, amostragem visual por vizinho mais próximo, consulta paginada e processamento compartilhado para pedidos iguais. | `processing.ts`, `handler.ts`, `SatellitePanel.tsx`, `PrecisionMap.tsx` |
| Média | Laudos antigos exigiam conversão e arquivos com dimensões anormais podiam consumir memória. | Leitura XLS BIFF8 a partir da distribuição oficial, limite de arquivo, abas, linhas, colunas, células em XLS, volume expandido em XLSX e quantidade de resultados. | `precisionSpreadsheet.ts`, `LabImport.tsx` |
| Alta | Um serviço de IA não pode decidir o vínculo nem a medida do laboratório. | A solicitação exige sessão, instituição e ação explícita. A IA recebe cabeçalhos e devolve sugestões de uma lista fechada. O código da amostra, a unidade, o método, o valor e o original continuam controlados pela importação determinística. | `precision-lab-assist/`, `LabImport.tsx` |
| Moderada | O registro npm apontou 11 ocorrências moderadas em dependências de desenvolvimento, herdadas da cadeia de lint e build. | A auditoria das dependências de produção retornou zero ocorrências conhecidas. As alternativas automáticas propostas para a cadeia de PWA incluem mudanças incompatíveis de versão e ficaram fora do empacotamento. | `package-lock.json` |
| Média | A checagem global de tipos registrou 310 diagnósticos antes da mudança e 310 depois. | A checagem não apontou erro nos arquivos do módulo modificados. A compilação Vite foi validada. | `tsconfig.app.json` |

## Testes

- PostgreSQL/PostGIS isolado confirmou código duplicado, RLS entre instituições, tentativa de vínculo com safra de outra instituição, rejeição de zona fora do talhão, rejeição de edição que excluiria a amostra, projeção UTM de 10 m e acesso negado ao perímetro de outra instituição.
- Os testes de laudo verificaram XLS de duas abas, XLSX e CSV, vírgula decimal, unidades preservadas, arquivo arquivado, código não identificado, resultado repetido e cancelamento da transação quando uma linha é inválida.
- O teste Deno simulou OAuth, catálogo vazio com filtro de nuvens, perímetro enviado ao processamento, GNDVI, estatísticas e reutilização de cache. O gateway de IA foi verificado pelo compilador Deno e a interface foi testada com sugestões simuladas.
- O teste de navegador cobriu GPS simulado, modos individual e composto, ponto central offline, retomada após perda da confirmação, geração de etiqueta e leitura local de QR, consulta pelo talhão, desenho de zona e comparação de datas. Os fluxos de notas offline, monitoramento, pluviometria e recomendação também passaram em regressão.
- A compilação gerou o instalador NSIS para Windows x64 e o APK de teste para Android. O executável abriu a janela AgriGest com um perfil WebView2 isolado e rede bloqueada no teste. O APK passou no `apksigner` com o mesmo certificado de teste do APK anterior. O manifesto confirma `com.agrigest.app`, versão 1.1.0, `versionCode` 2, versão mínima Android 7.0 (API 24) e permissão de localização.

## Homologação externa

- A validação com imagens reais do Copernicus depende dos segredos `CDSE_CLIENT_ID` e `CDSE_CLIENT_SECRET`. A validação com um provedor de IA real depende dos três segredos descritos na documentação técnica.
- Os instaladores foram produzidos no host Windows x64. O ambiente não oferece Windows Sandbox nem um aparelho/emulador Android acessível. Ficam pendentes ciclo isolado completo de instalação, atualização e desinstalação no Windows e abertura, GPS e câmera em smartphone.
- A auditoria anterior do estoque continua em [auditoria de integridade](./auditoria-integridade-2026-11-17.md). Esta entrega não reconcilia saldos nem corrige lançamentos históricos.
