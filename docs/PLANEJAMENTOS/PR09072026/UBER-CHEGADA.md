# UBER-CHEGADA — aviso de chegada estilo Uber (takeover full na tela) no EntregaShell

> Worker: executar tudo, buildar APK release, commit LOCAL, deletar este .md ao final. NUNCA criar
> branch/worktree. NÃO publicar. Mexer SÓ em `EntregaShell/**`. Ambiente já instalado (JDK 17,
> Android SDK em %LOCALAPPDATA%\Android\Sdk, Gradle wrapper no projeto). Build:
> `cd EntregaShell && .\gradlew assembleRelease`.

## Contexto e objetivo

A casca `EntregaShell/` já detecta chegada por GPS em foreground service (`RotaService.kt`) e hoje
reage com: TTS "Chegou: {nome}" + notificação heads-up (fullScreenIntent → MainActivity) + traz o
WebView pra frente (se overlay concedido). O dono quer a reação **estilo app do motorista Uber**:
quando ele está no Google Maps e chega no cliente, a tela deve ser **TOMADA por um aviso full-screen
nativo** — acorda a tela, aparece por cima de tudo, com som tocando e vibração até ele reagir, e um
botão grande pra abrir a entrega. Hoje o "trazer o WebView pra frente" funciona mas não tem o peso
de um takeover; falta a tela dedicada que slama por cima do Maps.

## Regra de ouro do dono (LITERAL)
Zero texto de UI inventado. Use SOMENTE os textos abaixo, nada além.

## O que construir

### 1. NOVO `ChegadaActivity.kt` — a tela de takeover (o "slam" do Uber)
Activity full-screen, dedicada, lançada pelo serviço quando o motorista NÃO está com o HBX na
frente (ver regra de disparo no item 3).

Atributos (via código no onCreate, compatível com minSdk 26 → usar as APIs novas sob
`Build.VERSION.SDK_INT >= O_MR1`/`O`, com fallback nos window flags legados):
- `setShowWhenLocked(true)` + `setTurnScreenOn(true)` (API 27+) e, como fallback,
  `FLAG_SHOW_WHEN_LOCKED or FLAG_TURN_SCREEN_ON or FLAG_KEEP_SCREEN_ON`.
- Tema full-screen sem ActionBar (declarar um theme no styles ou usar
  `requestWindowFeature(FEATURE_NO_TITLE)` + fullscreen flags). `launchMode="singleInstance"`,
  `excludeFromRecents="true"`, `taskAffinity=""` (não polui a task do WebView).
- Manter a tela ligada enquanto a Activity vive.

Layout (programático ou XML — sem lib externa; visual que leia como "chegou", fundo sólido de
destaque, texto grande, alto contraste). Conteúdo, na ordem:
- Nome do cliente (recebido via Intent extra `nome`), FONTE BEM GRANDE.
- Linha menor: `Você chegou no endereço`
- Botão primário GIGANTE (ocupa a largura, fácil de acertar dirigindo): `Abrir entrega`
- Link/botão pequeno discreto embaixo: `Ignorar`

Comportamento:
- Ao abrir: começa som em loop + vibração em loop (ver item 4). TTS já é falado pelo serviço —
  não duplicar TTS aqui.
- `Abrir entrega` (ou tocar em qualquer área que não seja "Ignorar"): para som/vibração, lança a
  MainActivity trazendo o WebView pra frente
  (`Intent(this, MainActivity::class.java).addFlags(FLAG_ACTIVITY_NEW_TASK or FLAG_ACTIVITY_REORDER_TO_FRONT or FLAG_ACTIVITY_SINGLE_TOP)`),
  e `finish()`. A folha de entrega abre sozinha pelo mecanismo que já existe (pendência drenada no
  onResume da MainActivity → evento `hbxshell:chegada` → folha). NÃO reimplementar a folha aqui.
- `Ignorar`: para som/vibração e `finish()` (o motorista abre depois pelo próprio HBX; a pendência
  segue guardada, então quando ele voltar pro app a folha ainda abre).
- Auto-parada de segurança do som/vibração após 45s (a tela continua até ele tocar) — não ficar
  berrando pra sempre se o celular ficou no carro.
- `onDestroy`/`onPause`: garantir que som e vibração param (nunca vazar MediaPlayer/vibração).

### 2. `AndroidManifest.xml`
- Declarar `ChegadaActivity` com `android:showWhenLocked="true"`, `android:turnScreenOn="true"`,
  `android:launchMode="singleInstance"`, `android:excludeFromRecents="true"`, `android:exported="false"`,
  theme full-screen.
- Permissão `VIBRATE` (se ainda não estiver).

### 3. `RotaService.kt` — rotear a chegada pro takeover
No `onChegada(alvo)` atual, trocar a lógica de reação por esta regra (estilo Uber: só slama quando
o motorista está FORA do app):
- **Sempre**: `falar(alvo.nome)` (TTS) + `RotaState.notificarChegada(alvo.id)` (mantém a pendência/
  entrega ao web como hoje).
- **Se o HBX está em foreground** (a MainActivity registrou listener → `RotaState.temListenerAtivo()`
  = true): NÃO abrir o takeover. O web já vai abrir a folha na hora (o motorista está olhando o app).
  Pode manter um bip curto pelo próprio web/TTS; sem Activity nova.
- **Se o HBX NÃO está em foreground** (listener null — motorista no Maps/tela bloqueada/outro app):
  disparar o takeover:
  - Notificação canal HIGH com `setFullScreenIntent(pendingIntent → ChegadaActivity, true)` (no
    Android <14, ou com a permissão concedida, isso já sobe a ChegadaActivity sozinho).
  - E, se `Settings.canDrawOverlays(this)`: `startActivity(ChegadaActivity, NEW_TASK)` diretamente
    (garante o slam mesmo no Android 14 sem a permissão de full-screen-intent — é o caminho
    principal, o mesmo overlay que já usamos hoje). Passar `nome` e `paradaId` como extras.
- Adicionar `RotaState.temListenerAtivo(): Boolean` (retorna `listener != null`) — o RotaState já
  guarda o listener registrado no onResume/onPause da MainActivity.

Importante: manter o debounce e o set `disparados` como estão (não regredir). O takeover é 1x por
chegada (o `disparados` já garante 1 disparo por parada.id).

### 4. Som + vibração em loop (dentro da ChegadaActivity)
- Som: `MediaPlayer` com `RingtoneManager.getDefaultUri(TYPE_ALARM)` (fallback TYPE_NOTIFICATION se
  null), `isLooping = true`, `AudioAttributes` `USAGE_ALARM`/`CONTENT_TYPE_SONIFICATION` (toca mesmo
  no vibrar, igual Uber). try/catch no-op — som nunca derruba a Activity.
- Vibração: `Vibrator`/`VibratorManager` (API 31+ usa VibratorManager) com waveform repetindo
  (ex.: `[0,400,300]`, repeat index 0) até parar. Parar em qualquer ação/onPause/45s.

### 5. Full-screen-intent no Android 14+ (best-effort, sem travar UX)
Na MainActivity (onde já pedimos overlay 1x/processo), pedir também, **1x por processo e best-effort**,
`Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT` no Android 14+ SE
`!NotificationManager.canUseFullScreenIntent()`. Como o overlay já é o caminho principal do slam,
NÃO tornar isto obrigatório e NÃO adicionar passo no INSTALAR.md por causa disso (mantém o guia
simples: 3 permissões). Só reaproveita o mesmo padrão "pede no máximo 1x/processo".

## Build + artefato
- `gradlew assembleRelease` verde.
- Copiar pra `EntregaShell/dist/hbx-entrega.apk` (mesmo caminho; `git add -f` porque `**/dist/` está
  no .gitignore raiz). Verificar assinatura com `apksigner verify`.
- Informar o novo SHA-256 do APK.

## Checks
- Build release verde. Sem device aqui → sem smoke nativo; critério local é compilar + revisão do
  orquestrador. Não inventar teste impossível.

## Commit (local, sem publish)
Só `EntregaShell/**`. Mensagem:
`feat(entrega-shell): chegada estilo Uber — tela de takeover full-screen (acorda + som/vibra até reagir + abre a entrega) quando o motorista está fora do app`
terminando com `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## Relatório
O que implementou, decisões (ex.: como resolveu showWhenLocked no range de API), resultado do build,
caminho + SHA-256 do APK, hash do commit. Depois deletar este .md.
