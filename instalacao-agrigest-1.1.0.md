# Instalação do AgriGest 1.1.0

## Windows 11 x64

1. Baixe `AgriGest_1.1.0_Windows_x64.exe` e confira o SHA-256 no arquivo `SHA256SUMS.txt`.
2. Feche o AgriGest. Execute o instalador e confirme a atualização. Ele usa o mesmo identificador `com.agrigest.desktop`. O instalador cria a entrada no menu Iniciar e o desinstalador.
3. O Windows 11 normalmente já inclui WebView2. Quando necessário, o instalador busca o runtime automaticamente, com acesso à internet.
4. Abra o AgriGest e confira os registros sincronizados e as coletas pendentes.

O executável foi gerado sem assinatura Authenticode de distribuição. Use o arquivo de entrega e confira o hash antes de executar.

## Android

1. Baixe `AgriGest_1.1.0_Android_teste.apk` e confira o SHA-256. A versão é 1.1.0, com `versionCode` 2 e identificador `com.agrigest.app`.
2. Abra o APK no aparelho e permita instalar aplicativos por essa origem se o Android solicitar. Em seguida, escolha atualizar a instalação existente.
3. Abra o AgriGest e permita o uso de localização ao iniciar uma coleta. A leitura de QR aceita uma foto da etiqueta.

O APK de teste usa o certificado da versão de teste anterior. Em caso de assinatura incompatível, mantenha a instalação anterior e sincronize as coletas antes de qualquer troca. A desinstalação pode apagar registros que ainda estejam somente no aparelho.

## Ativação do módulo

Os pacotes usam a configuração Supabase existente do AgriGest. O módulo Agricultura de Precisão precisa das migrações documentadas em `agricultura-de-precisao.md`. A consulta real do Sentinel‑2 e a assistência de IA precisam também das respectivas funções Edge e dos segredos no ambiente autorizado. A publicação permanece separada da instalação local.

## Recuperação

Use a etiqueta Git `agrigest-precisao-pre-conclusao-26ea1c2` para recuperar a versão anterior à conclusão. Use `agrigest-1.1.0` para reconstruir esta entrega. O arquivo ZIP da versão entregue contém o código. O backup do banco e os registros pendentes nos dispositivos são protegidos pelos procedimentos dos respectivos ambientes.
