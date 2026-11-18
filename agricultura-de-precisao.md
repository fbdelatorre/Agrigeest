# Agricultura de Precisão

## Ponto de restauração

A etiqueta local `agrigest-restauracao-2026-11-18` aponta para o estado do código antes do módulo, incluindo as alterações locais anteriores. A cópia ZIP verificada está em `checks.local/agrigest-restauracao-2026-11-18.zip`. O manifesto registra o SHA-256 dos 376 arquivos e as exclusões que já existiam. Os instaladores anteriores estão em `checks.local/instaladores-anteriores-2026-11-18`. O ZIP contém fontes e migrações. A configuração local `.env` e os dados do servidor ou do dispositivo ficam nos respectivos locais e não estão no arquivo.

Para abrir o código anterior em outra pasta, execute a partir do repositório:

```powershell
git worktree add --detach ../Agrigeest-restaurado agrigest-restauracao-2026-11-18
```

As tabelas do módulo são incrementais. Para retirar o módulo do aplicativo depois de eventual publicação, volte o código para a etiqueta e conserve as tabelas, incluindo as amostras e os laudos que já tenham sido coletados. Antes da implantação, confirme a existência de um backup do Supabase com procedimento de restauração testado em ambiente separado.

## Componentes

- Rotas protegidas, seletor de safra comum, instituição do perfil e perímetros PostGIS dos talhões existentes. O mesmo módulo React atende ao PWA e às versões nativas.
- A fila das coletas reaproveita IndexedDB na web e SQLite no Android e Windows. A identificação usa UUID criado no dispositivo e consultado pelo mesmo usuário quando a confirmação da gravação se perde.
- A coleta guarda um ponto representativo e, no modo composto de solo, a quantidade de subamostras. O identificador usado no Excel é o código AG da etiqueta. O nome curto é editável.
- No mapa da fazenda, o botão Coletas combina os pontos com as camadas atuais. Mapas de Análises oferece visão geral, foco por talhão, filtros, camadas por tipo e visualização temática com unidade, método e material. O detalhe do talhão tem atalho para o histórico.
- O importador lê XLSX de várias abas e CSV. Aceita Amostra, Parâmetro e Resultado, ou uma coluna Amostra seguida pelas colunas dos parâmetros. Unidades e métodos explícitos são preservados. Limites analíticos como `<0,05` exigem conferência e não são convertidos em números. A prévia permite vínculos manuais e gravar a seleção em uma transação. O servidor guarda o original e o usuário que confirmou a importação.

## Validação antes de implantar

```powershell
npm ci
npm run test:precision
npm run build
```

Provisione as três migrações do módulo em ambiente de testes com PostGIS. Os testes automatizados cobrem geometria local, leitura determinística, cálculo dos índices, RLS de coletas e laudos, atomicidade e duplicatas. O funcionamento em aparelhos físicos precisa ser verificado, especialmente a permissão de GPS e a impressão por PDF.

Para habilitar Sentinel‑2, coloque `CDSE_CLIENT_ID` e `CDSE_CLIENT_SECRET` nos segredos da função Edge `precision-sentinel`. A função verifica a sessão do Supabase e usa o perímetro autorizado do talhão. O código faz recorte em UTM com grade de 10 m, usa SCL e separa nuvens da cena das nuvens e sombras na parte observada do talhão. Antes de produção, valide as respostas reais do Copernicus em talhões conhecidos, inclusive datas vazias, a transição entre cenas e cobertura parcial. A função tem limites por consulta e cache em memória. O histórico de estatísticas consultadas fica no dispositivo.

A variável opcional `VITE_PUBLIC_APP_URL` deve apontar para o endereço HTTPS da PWA publicada para que as etiquetas das versões nativas abram a página correspondente. Sem o endereço, a etiqueta QR contém um identificador que pode ser colado na busca de amostras.

## Escopo pendente

Leitura assistida por IA, arquivos XLS antigos, polígonos de zonas de amostragem e interpolação. Hoje, uma zona pode ser anotada como nome da coleta. O importador processa planilhas em formatos reconhecidos sem enviar seus conteúdos a serviços externos de IA.
