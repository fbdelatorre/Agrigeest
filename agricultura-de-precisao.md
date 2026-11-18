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
- A coleta individual ou composta guarda um único ponto central. O modo composto guarda também a quantidade de subamostras. O código de laboratório é informado no cadastro, por exemplo `SJ-001`. Códigos AG anteriores continuam aceitos e o QR identifica o registro interno.
- No mapa da fazenda, o botão Coletas combina os pontos com as camadas atuais. Mapas de Análises oferece visão geral, foco por talhão, filtros, camadas por tipo e visualização temática com unidade, método e material. O detalhe do talhão tem atalho para o histórico.
- O importador lê XLS BIFF8 em contêiner OLE, XLSX com várias abas e CSV. Aceita Amostra, Parâmetro e Resultado, ou uma coluna Amostra seguida pelas colunas dos parâmetros. Unidades e métodos explícitos são preservados. Limites analíticos como `<0,05` exigem conferência. A prévia permite corrigir nomes, vincular amostras e confirmar a gravação em uma transação. O servidor guarda o arquivo original, o cabeçalho, o valor e o responsável pela importação.
- As zonas de amostragem são desenhadas no mapa e vinculadas ao talhão e à safra. Podem receber um nome de campanha e associar várias coletas. O PostGIS valida o polígono inteiro e impede que uma edição exclua amostras vinculadas. Desenhar e editar zonas exige conexão.

## Validação antes de implantar

```powershell
npm ci
npm run test:precision
npm run build
```

Provisione as cinco migrações do módulo em ambiente de testes com PostGIS, em ordem. As versões `20261118100000`, `20261118100100` e `20261118100200` criam coletas, laudos e a consulta de perímetros para satélite. As versões `20261118110000` e `20261118110100` adicionam códigos de laboratório, suporte a XLS, rastreabilidade do parâmetro e zonas. Os testes automatizados exercitam PostGIS em banco isolado, RLS entre instituições, arquivo original, atomicidade, duplicatas e validação do ponto central.

Para habilitar Sentinel‑2, coloque `CDSE_CLIENT_ID` e `CDSE_CLIENT_SECRET` nos segredos da função Edge `precision-sentinel`. A função verifica a sessão do Supabase e usa o perímetro autorizado do talhão. O código faz recorte em UTM com grade de 10 m, usa SCL e separa nuvens da cena das nuvens e sombras na parte observada do talhão. Antes de produção, valide as respostas reais do Copernicus em talhões conhecidos, inclusive datas vazias, a transição entre cenas e cobertura parcial. A função tem limites por consulta e cache em memória. O histórico de estatísticas consultadas fica no dispositivo.

Para habilitar a assistência opcional, configure `PRECISION_AI_URL`, `PRECISION_AI_KEY` e `PRECISION_AI_MODEL` nos segredos da função Edge `precision-lab-assist`. A URL deve ser HTTPS e apontar para um endpoint compatível com Chat Completions que aceite saída JSON. Use o provedor já aprovado pela instituição. Apenas cabeçalhos selecionados pela ação do usuário são enviados. A função só aceita sugestões do catálogo e o usuário precisa confirmar cada alteração. A leitura local continua disponível independentemente da integração.

A variável opcional `VITE_PUBLIC_APP_URL` deve apontar para o endereço HTTPS da PWA publicada para que as etiquetas das versões nativas abram a página correspondente. Sem o endereço, a etiqueta QR contém um identificador que pode ser colado na busca de amostras.

## Recuperar uma versão

A etiqueta `agrigest-precisao-pre-conclusao-26ea1c2` marca o estado anterior à conclusão. A etiqueta `agrigest-1.1.0` identifica a entrega. Cada etiqueta pode ser aberta em um worktree separado. Preserve as tabelas e os registros se for preciso voltar o executável. O backup do banco e os dados ainda pendentes no dispositivo têm procedimentos próprios.
