# HBX Video Studio

Estúdio local e reproduzível para gerar o vídeo comercial e os tutoriais do **HBX Entregas** a partir do próprio produto.

Ele não consulta produção. O fluxo separa cada material pela interface que ele realmente representa:

1. reutilizar a abertura oficial em `EntregaShell/app/src/logistica/assets/app/opening.html`;
2. renderizar as telas reais de `/entrega`, `/entrega/clientes` e `/entrega/produtos`;
3. interceptar as APIs com dados inteiramente fictícios;
4. dirigir o comercial e o tutorial administrativo no sistema web completo (1600 × 900) com Playwright;
5. gravar as ações do entregador no aplicativo Android real, usando o APK isolado `videoStudio` e uma API local;
6. montar MP4 vertical e horizontal, poster, legenda e roteiro com FFmpeg.

A abertura original não é alterada. A variante comercial é injetada apenas no servidor local do estúdio.

## Entregáveis automáticos

O comando completo gera três famílias de materiais:

- `commercial`: anúncio principal do HBX Entregas;
- `tutorial-admin`: tutorial para o dono/administrador;
- `tutorial-entregador`: tutorial operacional do entregador.

Para cada alvo, saem:

- `<alvo>-vertical.mp4` — 1080 × 1920;
- `<alvo>-horizontal.mp4` — 1920 × 1080, com composição lateral;
- `<alvo>-poster.jpg` — imagem de capa;
- `<alvo>.srt` — legendas sincronizadas;
- `<alvo>-narracao.md` — texto limpo da locução.

Os arquivos ficam em `tools/hbx-video-studio/output/` e não entram no Git.

## Requisitos

- Node.js 20 ou superior;
- dependências da raiz e de `frontend/` instaladas;
- Chromium do Playwright;
- FFmpeg disponível no `PATH`;
- frontend do HBX rodando, normalmente em `http://127.0.0.1:3001`.

ADB é obrigatório para produzir do zero o tutorial do entregador. O comercial e o tutorial administrativo não dependem dele.

## Primeiro uso

Na raiz do repositório:

```bash
npm install
cd frontend
npm install
cd ..
npx playwright install chromium
```

Em um terminal, inicie o frontend:

```bash
npm run front:dev
```

Em outro terminal:

```bash
npm run video:test
npm run video:doctor
npm run video:capture
npm run video:render
```

Ou, depois de o frontend estar no ar:

```bash
npm run video:all
```

Para gerar apenas um material:

```bash
npm run video:capture -- --target commercial
npm run video:render -- --target commercial
```

Alvos aceitos: `commercial`, `tutorial-admin`, `tutorial-entregador` e `all`.

Para acompanhar o navegador durante a captura:

```bash
npm run video:capture -- --target commercial --headed
```

Se o frontend estiver em outra porta:

```powershell
$env:HBX_VIDEO_BASE_URL = 'http://127.0.0.1:3001'
npm run video:capture -- --target commercial
```

## Dados de demonstração

Todo o material usa apenas a empresa fictícia **Distribuidora Água Clara**, com clientes e produtos inventados. Os mocks vivem em:

- `lib/demo-data.mjs`;
- `lib/mock-api.mjs`.

O estúdio não deve ser adaptado para ler produção. Para mudar a narrativa, altere os dados fictícios ou o roteiro, nunca o banco real.

## Narração

A montagem funciona sem voz e adiciona uma faixa silenciosa válida. Para incluir locução, coloque um arquivo com o nome do alvo em `audio/`:

```text
audio/commercial.wav
audio/tutorial-admin.wav
audio/tutorial-entregador.wav
```

Também são aceitos `.mp3` e `.m4a`. O FFmpeg normaliza a voz para aproximadamente -16 LUFS, completa com silêncio quando necessário e corta no final do vídeo.

O texto da locução é exportado em `output/<alvo>-narracao.md`. As legendas com os tempos finais ficam em `output/<alvo>.srt`.

## Tutorial do entregador no Android

As cenas `driver-start`, `driver-stop`, `driver-arrival` e `driver-confirm` devem vir do aparelho Android. O APK usado para vídeo tem o pacote isolado `br.com.hbxsystem.logistica.videostudio`, aceita somente a API local em `127.0.0.1:3210` e não inicializa Firebase, bridge de produção ou tarefas em segundo plano.

Inicie a API fictícia local, compile e instale o APK:

```powershell
npm run video:native:server
npm run video:native:build
adb reverse tcp:3210 tcp:3210
adb install -r EntregaShell/app/build/outputs/apk/logistica/videoStudio/app-logistica-videoStudio.apk
adb shell cmd uimode night yes
adb shell am start -n br.com.hbxsystem.logistica.videostudio/br.com.hbxsystem.entrega.MainActivity
```

Use somente o pareamento fictício `123456`. Depois grave cada cena com `native-capture.ps1`, usando exatamente os IDs acima. Exemplo:

```powershell
powershell -ExecutionPolicy Bypass -File tools/hbx-video-studio/native-capture.ps1 `
  -Target tutorial-entregador `
  -Scene driver-stop `
  -Seconds 20 `
  -OpenFolder
```

O arquivo será salvo em:

```text
tools/hbx-video-studio/native/tutorial-entregador/driver-stop.mp4
```

Durante `video:render`, os quatro arquivos em `native/tutorial-entregador/` são usados na montagem. A captura Playwright desse alvo produz apenas a abertura, o encerramento e o manifesto; ela não simula a tela operacional do celular.

Ao terminar, remova o redirecionamento e restaure o modo visual do aparelho se ele tiver sido alterado:

```powershell
adb reverse --remove tcp:3210
adb shell cmd uimode night no
```

## Onde alterar o vídeo

- roteiro, duração, textos e sequência: `content.mjs`;
- dados fictícios: `lib/demo-data.mjs`;
- respostas das APIs: `lib/mock-api.mjs`;
- abertura comercial e cards: `lib/studio-server.mjs`;
- ações do navegador: `capture.mjs`;
- montagem, dimensões e transições: `render.mjs`.

## Diagnóstico

```bash
npm run video:doctor
```

Sem o frontend aberto:

```bash
npm run video:doctor -- --skip-frontend
```

Exigindo também o ADB:

```bash
npm run video:doctor -- --require-adb
```

Erros de uma cena geram screenshot e log em:

```text
tools/hbx-video-studio/.work/<alvo>/errors/
```

## Regras de segurança

- não usar nomes, endereços, telefones, saldos ou coordenadas de clientes reais;
- não apontar `HBX_VIDEO_BASE_URL` para produção;
- não executar deploy durante a produção do vídeo;
- não versionar MP4, WAV, screenshots, manifests ou exports;
- não alterar a abertura oficial só para acomodar o anúncio;
- revisar o material inteiro antes de publicar.

O trabalho local restante está descrito, em ordem executável, em [`plano.md`](./plano.md).
