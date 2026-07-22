# S5 — Voz da Navegação HBX (steps do OSRM + TTS nativo pt-BR)

Arquivos: `EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeAppBridge.kt`,
`EntregaShell/app/src/main/assets/app/native.js` (expor ponte),
`EntregaShell/app/src/logistica/assets/app/app.js` (+`app.css` do painel).

## 1. Ponte TTS nativa (Kotlin)
Em `NativeAppBridge.kt`, seguindo o padrão dos métodos existentes (openMaps/vibrate):
- `@JavascriptInterface fun speak(text: String)` — android.speech.tts.TextToSpeech,
  init LAZY na primeira chamada (Locale "pt","BR"), `QUEUE_FLUSH`, texto sanitizado
  (`filterNot(Char::isISOControl).take(300)`). Falha de init/idioma = no-op
  silencioso (voz é acessório, nunca pode quebrar entrega).
- `@JavascriptInterface fun speakStop()` — tts.stop().
- shutdown no destroy da activity (mesmo lugar onde a bridge é limpa).
- CUIDADO: comentário de bloco aninhado em Kotlin quebra o arquivo inteiro.
Em `native.js`: `H.speak(text)` / `H.speakStop()` com guard `bridge &&
bridge.speak…` (padrão do `maps()`, native.js:67).

## 2. Steps do OSRM na perna atual
Quando `navModeActive()` (S2), a chamada de rota (S3/S4) pede `steps=true`.
Guardar `state.navSteps` = maneuvers da perna atual: `{ lat, lng, instrucao }`.
Instrução em pt-BR montada de `maneuver.type/modifier` + `name` da rua — tabela
mínima: turn left/right → "vire à esquerda/direita", slight → "mantenha-se à
esquerda/direita", roundabout + exit → "na rotatória, pegue a {n}ª saída",
continue/new name → "continue na {rua}", arrive → "você chegou". Sem rua → sem
complemento. NADA além disso de copy (Lei 8).

## 3. Banner + disparo por distância
- Painel da S1 ganha, SÓ em navegação ativa e quando houver step à frente, uma
  linha de instrução no lugar da linha do endereço:
  `Em {distância}, {instrução}` (ex.: "Em 300 m, vire à direita na Rua X").
  Endereço volta quando não há step (reta longa). Patch por querySelector, sem
  re-render.
- Voz: falar cada step 2x — a ~400 m ("Em 400 metros, …") e a ~60 m ("{instrução}").
  Marcar step falado (não repetir); passou do step → avança pro próximo.
  Recálculo (S3) → refaz steps e zera marcações.
- Chegada na parada: `hbx:arrival` já abre a folha — falar "Você chegou" 1x.
- **Mudo**: botão pequeno no painel (ícone alto-falante via `icon()`, adicionar ao
  catálogo se faltar) alterna `state.navMudo`, persistido em
  `H.cache("nav-mudo")`. Mudo = não chama H.speak (banner continua).

## Validação
`node --check` exit 0. Kotlin: revisar à mão imports/null-safety (typecheck completo
só no build do publish — relatar isso). Relatar tabela de instruções e limiares.

## NÃO fazer
Não adicionar dependência nova (TTS é do Android). Não falar em modo Leitura nem com
rota pausada. Não commitar/criar branch.
