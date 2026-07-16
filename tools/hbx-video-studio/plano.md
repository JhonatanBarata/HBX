# Plano de conclusão local — Codex

Este arquivo começa exatamente onde o trabalho remoto precisa parar. A arquitetura, os dados demo, o roteiro, a captura Playwright, a montagem FFmpeg e os tutoriais já estão implementados.

## Objetivo

Produzir e revisar os arquivos finais do HBX Entregas sem tocar em produção e sem expor clientes reais.

## Execução realizada em 16/07/2026

O plano foi executado localmente na branch `agent/hbx-video-studio`, atualizada por fast-forward a partir de `origin/master` (`a79e4603`) antes das alterações. O checkout original do usuário estava sujo e foi preservado; todo o trabalho ocorreu no worktree isolado `.worktrees/hbx-video-studio`.

### Fontes das cenas

- `commercial`: Playwright no sistema web completo, viewport 1600 × 900, tema escuro;
- `tutorial-admin`: Playwright no sistema web completo, viewport 1600 × 900, tema escuro;
- `tutorial-entregador`: abertura/encerramento do estúdio e quatro cenas operacionais gravadas no Moto G15 via ADB, 1080 × 2400, tema escuro;
- cenas Android nativas: `driver-start`, `driver-stop`, `driver-arrival` e `driver-confirm`.

O aplicativo Android usado na captura é a variante isolada `br.com.hbxsystem.logistica.videostudio`. Ela aponta apenas para `http://127.0.0.1:3210`, não inicializa Firebase/bridge de produção e usa o pareamento fictício `123456`. O pacote oficial `br.com.hbxsystem.logistica` e a abertura Android oficial não foram alterados para acomodar o vídeo.

### Correções feitas durante a execução

- a ativação de rota no WebView Android passou a tratar o toque dos chips de dia diretamente, corrigindo a falha real em que o dia não era selecionado;
- a variante `videoStudio` ignora localização e serviço reais durante a ativação;
- a API Android local passou a devolver `deliveryIds`, cápsula offline e sincronização fictícias válidas;
- o diagnóstico reconhece corretamente as duas superfícies válidas da abertura Android;
- o service worker é bloqueado no contexto Playwright para impedir chamadas que escapem dos mocks;
- seletores e estados do fluxo atual de clientes, produtos, rota, chegada e confirmação foram alinhados ao frontend do `master`;
- comercial e tutorial administrativo foram recapturados em 16:9 para eliminar barras laterais sem cortar a interface;
- o tutorial do entregador deixou de simular celular no navegador: as quatro cenas operacionais exigem arquivos Android reais.

### Arquivos gerados localmente

Todos estão em `tools/hbx-video-studio/output/`, ignorados pelo Git:

```text
commercial-horizontal.mp4           1920 × 1080  54,66 s
commercial-vertical.mp4             1080 × 1920  54,66 s
commercial-poster.jpg
commercial.srt
commercial-narracao.md
tutorial-admin-horizontal.mp4       1920 × 1080  37,57 s
tutorial-admin-vertical.mp4         1080 × 1920  37,57 s
tutorial-admin-poster.jpg
tutorial-admin.srt
tutorial-admin-narracao.md
tutorial-entregador-horizontal.mp4  1920 × 1080  44,87 s
tutorial-entregador-vertical.mp4    1080 × 1920  44,87 s
tutorial-entregador-poster.jpg
tutorial-entregador.srt
tutorial-entregador-narracao.md
```

Os seis MP4 foram verificados com `ffprobe`: H.264, `yuv420p`, 30 fps, áudio AAC estéreo a 48 kHz e `faststart`. Posters e quadros do início, meio e fim foram revisados. Não foram encontrados cortes, overflow ou mídia com dado real.

### Validações executadas

```text
npm run video:test                                      PASSOU
npm run video:doctor -- --require-adb                   PASSOU
gradlew.bat :app:assembleLogisticaVideoStudio           PASSOU
captura headed do commercial                            PASSOU (8/8)
captura tutorial-admin                                  PASSOU (6/6)
captura tutorial-entregador                             PASSOU (2 Playwright + 4 Android)
npm run video:render                                    PASSOU
npm run gate                                            FALHOU na etapa 10/13
```

O gate concluiu nove etapas verdes. A integração de tenant com Postgres foi pulada automaticamente porque não havia Postgres local. A etapa 10 parou em dois erros de lint preexistentes no `master`, em `frontend/src/app/entrega/admin-page.client.tsx:186` e `:200` (`react-hooks/set-state-in-effect`). Essa tela não foi alterada apenas para fazer o gate passar, conforme a restrição de escopo.

### Pendências humanas

- gravar ou aprovar as três locuções; os MP4 atuais têm uma faixa AAC silenciosa válida;
- assistir aos seis MP4 e aprovar visualmente;
- o PR #25 já estava mesclado quando esta continuação começou, portanto não pode ser mantido em rascunho nem receber estes commits como parte do PR. O corpo pode registrar esta execução, mas qualquer nova revisão por PR depende de decisão humana.

### Reprodução resumida

```powershell
npm ci
Push-Location frontend; npm ci; Pop-Location
npx playwright install chromium

# terminal 1
Push-Location frontend
npm run dev -- --hostname 127.0.0.1 --port 3101

# terminal 2
$env:HBX_VIDEO_BASE_URL = 'http://127.0.0.1:3101'
npm run video:test
npm run video:doctor
npm run video:capture -- --target commercial --headed
npm run video:capture -- --target tutorial-admin
npm run video:capture -- --target tutorial-entregador
npm run video:render
```

Para refazer as tomadas Android, seguir a seção “Tutorial do entregador no Android” do `README.md` antes da captura e manter somente os quatro MP4 nativos em `native/tutorial-entregador/`.

## Branch

Trabalhar na branch:

```text
agent/hbx-video-studio
```

Não fazer deploy e não mesclar antes da aprovação visual do dono.

## Restrições absolutas

1. Não usar banco, token, tenant ou cliente de produção.
2. Não modificar `EntregaShell/app/src/logistica/assets/app/opening.html` para o vídeo; o estúdio já injeta uma variante local.
3. Não alterar preços, créditos, billing, módulos ou regras comerciais.
4. Não versionar `.work/`, `output/`, áudio, MP4, screenshots ou tomadas ADB.
5. Não publicar em rede social, Google Play ou site sem ordem explícita.
6. Se uma tela real falhar, corrigir a ferramenta de captura ou o mock; não mascarar defeito do produto com imagem falsa.

## Etapa 1 — preparar o ambiente

Na raiz do repositório, confirme que não há alterações locais e atualize a branch sobre o `master` mais recente antes de capturar:

```powershell
git status -sb
git branch --show-current
git fetch origin
git merge --ff-only origin/master
npm ci
Push-Location frontend
npm ci
Pop-Location
npx playwright install chromium
npm run video:test
```

Se houver conflito no rebase, preserve as mudanças atuais de `master` e reaplique somente os arquivos do estúdio e da documentação deste PR. Não continue para a captura enquanto `npm run video:test` não passar.

Esperado: `HBX Video Studio: contratos, dados demo e servidor validados.`

## Etapa 2 — iniciar o frontend

Abrir um terminal dedicado:

```powershell
npm run front:dev
```

Confirmar que o frontend responde em `http://127.0.0.1:3001`. Em outra porta, definir:

```powershell
$env:HBX_VIDEO_BASE_URL = 'http://127.0.0.1:PORTA'
```

## Etapa 3 — diagnóstico

Em outro terminal:

```powershell
npm run video:doctor
```

Corrigir apenas requisitos locais apontados pelo diagnóstico. FFmpeg e Chromium são obrigatórios; ADB é opcional neste momento.

## Etapa 4 — captura de controle

Primeiro, gerar somente o comercial com navegador visível:

```powershell
npm run video:capture -- --target commercial --headed
```

Verificar durante a execução:

- abertura original seguida do encerramento “HBX Entregas”;
- nenhuma tela de login;
- nenhuma chamada a produção;
- empresa “Distribuidora Água Clara”;
- clientes, produtos, prévia de geração, rota e confirmação visíveis;
- anéis de toque posicionados sobre os controles;
- ausência de overflow, pop-up cortado ou texto sobre botão importante.

Se uma cena falhar, consultar:

```text
tools/hbx-video-studio/.work/commercial/errors/
```

Corrigir seletor, mock ou duração e repetir. Não editar o produto apenas para esconder o erro da captura.

## Etapa 5 — capturar os três materiais

Quando o comercial estiver estável:

```powershell
npm run video:capture
```

Esperado:

```text
tools/hbx-video-studio/.work/commercial/manifest.json
tools/hbx-video-studio/.work/tutorial-admin/manifest.json
tools/hbx-video-studio/.work/tutorial-entregador/manifest.json
```

## Etapa 6 — primeira montagem

```powershell
npm run video:render
```

Abrir e assistir integralmente:

```text
tools/hbx-video-studio/output/commercial-vertical.mp4
tools/hbx-video-studio/output/tutorial-admin-vertical.mp4
tools/hbx-video-studio/output/tutorial-entregador-vertical.mp4
```

Depois conferir as versões horizontais e os posters.

## Etapa 7 — tomadas Android realmente necessárias

Só substituir uma cena quando a função dependa do sistema Android. Prioridade possível:

1. abrir o Google Maps por Intent;
2. voltar do Maps para o HBX;
3. permissão de localização;
4. notificação ou GPS em segundo plano.

Preparar um tenant demo local, ativar Não Perturbe e conectar um único aparelho autorizado. Rodar:

```powershell
powershell -ExecutionPolicy Bypass -File tools/hbx-video-studio/native-capture.ps1 `
  -Target tutorial-entregador `
  -Scene driver-stop `
  -Seconds 20 `
  -OpenFolder
```

O nome `driver-stop` substitui exatamente essa cena no próximo render. Para outra cena, usar o ID que aparece no respectivo `manifest.json`.

Revisar o bruto antes de renderizar. Excluir e repetir se aparecer notificação, dado verdadeiro, barra pessoal, endereço real ou toque errado.

## Etapa 8 — locução

Os textos estão em:

```text
tools/hbx-video-studio/output/commercial-narracao.md
tools/hbx-video-studio/output/tutorial-admin-narracao.md
tools/hbx-video-studio/output/tutorial-entregador-narracao.md
```

As marcações de tempo estão nos `.srt` correspondentes.

Produzir três faixas de voz aprovadas, começando no tempo zero:

```text
tools/hbx-video-studio/audio/commercial.wav
tools/hbx-video-studio/audio/tutorial-admin.wav
tools/hbx-video-studio/audio/tutorial-entregador.wav
```

Critérios da voz:

- português brasileiro natural;
- tom seguro e direto, sem voz caricata de propaganda;
- velocidade confortável;
- pronúncia “agá bê xis” apenas se necessário; preferir dizer “HBX Entregas” naturalmente;
- silêncio curto entre cenas;
- sem música protegida ou voz sem licença comercial.

Depois:

```powershell
npm run video:render
```

O render normaliza a voz e a corta no tempo total. Se uma frase entrar em outra cena, ajustar o arquivo de voz ou a duração em `content.mjs`, recapturar somente quando a duração visual mudar e renderizar novamente.

## Etapa 9 — revisão de qualidade

Assistir com som e também mudo. Validar:

- promessa compreensível nos primeiros cinco segundos;
- textos legíveis numa tela pequena;
- nenhuma espera longa ou carregamento visível;
- nenhum dado real;
- voz sincronizada com o que aparece;
- “HBX Entregas” usado de forma consistente;
- CTA final visível por tempo suficiente;
- volume sem distorção;
- legenda sem erro ortográfico;
- versão horizontal sem cortar o celular;
- poster sem transição pela metade.

Rodar também:

```powershell
npm run video:test
npm run gate
```

Se `npm run gate` falhar por problema anterior e alheio à branch, registrar o erro completo; não alterar outra área do sistema para deixar o vídeo verde.

## Etapa 10 — entrega para aprovação

Apresentar ao dono, sem publicar:

- `commercial-vertical.mp4`;
- `commercial-horizontal.mp4`;
- os dois tutoriais verticais;
- os posters;
- o roteiro e as legendas.

Informar claramente quais cenas vieram do código e quais foram substituídas por Android nativo.

Somente depois da aprovação:

1. remover brutos ruins e arquivos temporários;
2. confirmar `git status -sb` sem mídia gerada;
3. manter no commit apenas código, roteiro e documentação;
4. atualizar o PR com os checks executados;
5. aguardar ordem explícita para merge ou publicação.

## Critério de conclusão

O trabalho está concluído quando os três vídeos abrem sem erro, têm voz e legendas sincronizadas, não expõem dados reais, passam pela revisão visual do dono e a branch continua sem mídia gerada versionada.
