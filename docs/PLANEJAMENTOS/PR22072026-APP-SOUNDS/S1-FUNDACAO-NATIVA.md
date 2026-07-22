# S1 — Fundação nativa (nenhum som toca ainda)

**Objetivo:** deixar o motor de áudio pronto, medido e com o gate único de decisão — sem acionar
nenhum evento. Se S1 terminar e o app soar exatamente igual a hoje, S1 deu certo.

## 1. Copiar os arquivos

`docs/APP SOUNDS/mobile-ready-ogg/*.ogg` → `EntregaShell/app/src/main/res/raw/`

**16 arquivos** (a lista do 00-PLANO). **NÃO copiar** `hbx_opening_signature.ogg`,
`hbx_sonic_logo.ogg`, `hbx_tap_soft.ogg`, `hbx_toggle.ogg`.

Os nomes já são resource-name válidos (minúsculo + underscore) — copiar sem renomear.
`.ogg` já é comprimido; Android não recomprime — não mexer em `aaptOptions/noCompress`.

## 2. `HbxSoundEngine.kt` (novo)

Em `app/src/main/java/br/com/hbxsystem/entrega/`.

**Dois caminhos de reprodução, de propósito:**

| Caminho | Para quê | Por quê |
|---|---|---|
| `SoundPool` (maxStreams=3) | os 15 efeitos curtos | latência ~0, sem decode na hora, sem política de autoplay |
| `MediaPlayer` | só `arrival_alert_loop` | é loop + precisa de `USAGE_ALARM`; SoundPool decodifica pra PCM na memória e loop longo não cabe nesse modelo |

**Tabela key → (resId, volume)** dentro do Engine, copiada de `docs/sound-map.json` (`volume` por key,
já calibrado por quem produziu). É a fonte única — o JS nunca passa volume.

**Carga LAZY, igual ao TTS:** SoundPool criado na 1ª chamada de `play()`, cada som carregado sob
demanda e cacheado (`key → soundId`). `SoundPool.load()` é assíncrono: som pedido antes do
`onLoadComplete` é **descartado silenciosamente** (não enfileirar — o momento já passou).
Quem nunca ouve um som nunca paga por ele.

**`AudioAttributes` dos efeitos:** `USAGE_ASSISTANCE_SONIFICATION` +
`CONTENT_TYPE_SONIFICATION`, e **sem pedir audio focus** — efeito curto não deve pausar o rádio do
motorista nem derrubar a instrução de voz. Quem pede foco é a voz; efeito só passa por cima da mixagem.

**`release()`** no mesmo lugar/thread que já derruba o TTS (`close()` da ponte / `onDestroy` da
MainActivity). Vazar SoundPool com o app em foreground o dia inteiro é buraco de memória.

## 3. Gate único — `fun play(key: String)`

Ordem das perguntas (a primeira que negar, sai; **nada de exceção vazando**, tudo em `runCatching`):

1. `BuildConfig.APP_MODE != "logistica"` → sai. (mesma trava do `speak()`)
2. Chave-mestra desligada **ou** o item daquela key desligado → sai.
   **(S5 implementa a UI e a folha; S1 já lê o JSON de `SharedPreferences`, default = tudo ligado.)**
   Exceção: `preview = true` (prévia da folha do S5) fura este item e o nº 1, nunca os demais.
3. **Voz falando agora** (`ttsFalando()` — ver §5) → sai. Lei nº2.
4. Chamada telefônica em curso (`AudioManager.mode` em `MODE_IN_CALL`/`MODE_IN_COMMUNICATION`) → sai.
5. **Anti-repique:** mesma key tocada há < 400 ms → sai. Protege de render duplo/duplo-clique
   (o `render()` do app.js reconstrói tela inteira; um efeito colado 3× vira glitch).
6. Toca.

## 4. Ponte + JS

Na `NativeAppBridge` (junto de `speak`, mesmo padrão de `runOnUiThread` + guard de `APP_MODE`):

```kotlin
@JavascriptInterface fun playSound(key: String)      // key sanitizada: [a-z_] , teto 40 chars
@JavascriptInterface fun stopSound(key: String)      // só faz sentido no loop de chegada
```

Em `EntregaShell/app/src/main/assets/app/native.js`, ao lado de `speak`/`vibrate` (linha ~65-72),
com o **mesmo guard de bridge ausente** (preview fora do APK não pode quebrar):

```javascript
sound(key) { try { bridge && bridge.playSound && bridge.playSound(String(key || "")); } catch (_) {} },
soundStop(key) { try { bridge && bridge.stopSound && bridge.stopSound(String(key || "")); } catch (_) {} },
```

Key desconhecida = no-op silencioso (nunca crash, nunca toast).

## 5. Saber se a voz está falando

`NativeAppBridge` já é dona do `TextToSpeech` (campo `tts`, `ttsPronta`). Expor um
`fun ttsFalando(): Boolean = runCatching { tts?.isSpeaking == true }.getOrDefault(false)` e injetar
no Engine como lambda — **sem** o Engine conhecer o TTS (o `RotaService` tem instância própria de TTS;
essa fica de fora do escopo, é o "Chegou: X" tratado no S2 por dedupe de evento, não por focus).

## Aceite do S1

- [ ] `./gradlew assembleLogisticaRelease` verde
- [ ] APK **medido antes e depois** e anotado aqui: `1,58 MB → ____ MB` (esperado ~1,79 MB)
- [ ] Instalado no moto g15 via ADB: app abre, roda uma entrega inteira, **nenhum som novo toca**
- [ ] Nenhum `throw` sai do Engine (todos os pontos em `runCatching`)
