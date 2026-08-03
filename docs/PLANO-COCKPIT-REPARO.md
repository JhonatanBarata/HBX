# COCKPIT — REPARO DO FRONT + RECADO QUE NÃO CHEGA

> Handoff 03/08 (noite), pra executar em outra tela. As DUAS causas já estão
> **diagnosticadas e provadas por grep** — aqui não tem hipótese, tem alvo.
> Veredito do dono sobre o estado atual: *"nossa ficou horrível"* — procede,
> e a causa nº1 é uma classe CSS que eu referenciei e NUNCA escrevi.

## As causas confirmadas

### 🔴 C1 — O cockpit não tem altura (o "ficou horrível")
`page.client.tsx` envolve o cockpit em `<div className="work log-work log-cockpit-host">`.
**`log-cockpit-host` não existe em CSS nenhum** (grep vazio em `hbx-theme/`).
O `.cok` tem `height: 100%` de um pai sem altura → o grid colapsa pro conteúdo:
mapa vira tira de ~90px, faixas de ~60px, a página acaba em 300px. Tudo o mais
do print (mapa esmagado, tabuleiro cortado) é consequência desta linha.

A referência de como a casca antiga dava altura está em
`logistica-mesa.css:270`:
```css
.log-work.hbx-panel-shell-host {
  grid-template-rows: minmax(0, 1fr);
  align-content: stretch;
  overflow: hidden;
}
```

### 🔴 C2 — A allowlist do APK não conhece os recados (o "não chega")
`NativeApiClient.kt` valida TODO endpoint por `isMobileEndpointAllowed` e
**não há UMA linha com "recados"** (grep vazio). O app 141 chama
`POST /logistica/recados/puxar` e o cliente nativo barra ANTES de sair do
aparelho ("Esta operação não pertence ao logistica"). O recado nunca chega
porque o pedido nunca é feito. É a regra do `memory/hbxapk.md` §6 que eu
mesmo tinha na frente e não conferi: **endpoint novo no app.js → allowlist no
Kotlin + rebuild. Deploy de backend NÃO conserta.**

### 🔴 C2b — Os pinos LARGAM o mapa e empilham em coluna (print do dono, 19h)
Em `cockpit-mapa.tsx`, no update de um pino existente eu faço
`el.className = "cok-pino is-…"`. Isso **APAGA a classe `maplibregl-marker`**
que o maplibre põe no elemento — e é ela que carrega o `position: absolute`
do posicionamento. Sem ela o pino cai no fluxo normal do documento: a coluna
de ✓ empilhados no canto do print, com espaçamento igual em qualquer zoom.
Mesmo defeito no marker do motorista (`is-foco`).

**Cura (2 linhas por lugar):** NUNCA sobrescrever `className` de elemento de
marker — trocar só as classes minhas:
```ts
el.classList.remove("is-feita", "is-agora", "is-fila", "is-cobranca");
el.classList.add(`is-${pino.estado}`);
```
(idem no `.cok-pino-motorista` com `is-foco`). Regra pra memória: elemento
entregue a uma lib que o posiciona por classe/estilo próprio não é meu — eu
só ADICIONO/REMOVO as minhas classes nele.

### ⚠️ C3 — o mapa aberto no continente NÃO é bug (mas merece um freio)
Os clientes "TESTE ROTA PERTO" têm coordenadas em LINHA de Curitiba a Mar del
Plata (dado de seed, ~1° de latitude por parada). O `fitBounds` está fazendo o
que os dados mandam. Com endereço real o enquadro fica de bairro. Ainda assim,
o reparo abaixo inclui um teto de zoom-out e o `map.resize()` que falta.

---

## R1 — Devolver a altura e polir o palco (front, ~1h)

1. **Escrever a classe fantasma** em `logistica-cockpit.css`:
   ```css
   .log-cockpit-host {
     display: grid;
     grid-template-rows: minmax(0, 1fr);
     align-content: stretch;
     overflow: hidden;
   }
   ```
   (mesmo mecanismo da casca antiga — o `.work` já vive esticado no shell).
2. **`map.resize()` obrigatório**: o mapa nasceu num host esmagado; quando o
   host ganhar altura o canvas continua medindo errado. Em `cockpit-mapa.tsx`,
   pendurar um `ResizeObserver` no `hostRef` chamando `mapRef.current?.resize()`
   (e um `resize()` após o primeiro `load`). Sem isso os pinos desenham
   deslocados mesmo com CSS certo.
3. **Freio da câmera**: `fitBounds` ganha também `maxZoom` já tem — adicionar
   piso de zoom-OUT (ex.: se `bounds` passar de ~3° de span, clampar padding e
   aceitar; é dado de teste, não vale desenhar UX pra ele).
4. **Prova pelo método `css-morre-calado`**: medir com `getComputedStyle` a
   altura de `.cok__mapa` (> 300px em 1080p) ANTES de dar por consertado,
   e `npm run clip` — zero-scroll continua lei.

## R2 — Allowlist dos recados + APK novo (Kotlin, ~30min + publish)

1. Em `NativeApiClient.kt`, no bloco logística do `isMobileEndpointAllowed`
   (perto da linha 313, onde estão os `rota-indicadas`):
   ```kotlin
   method == "GET" && segments == listOf("logistica", "recados", "portao") -> true
   method == "POST" && segments == listOf("logistica", "recados", "puxar") -> true
   method == "POST" && segments == listOf("logistica", "recados", "visto") -> true
   method == "POST" && segments == listOf("logistica", "recados", "responder") -> true
   method == "POST" && segments.size == 4 && segments.take(2) == listOf("logistica", "recados") && segments[3] == "entendi" -> true
   ```
2. **Piso do versionCode**: subir `hbxLogisticaVersionCodeFloor` de 140 → 142
   se qualquer build local for parar no g15 no meio do teste (a armadilha das
   9 recaídas documentadas no build.gradle.kts).
3. Publicar. 🔴 **REGRA ATÉ O g15 CONFIRMAR A VERSÃO NOVA:** todo publish sai
   com `HBX_APK_UPDATE_OBRIGATORIA=1` — o publish REGRAVA o manifesto, e sem a
   env ele volta `obrigatoria:false`; o aparelho preso no 139 (que só avisa
   obrigatória) nunca mais veria atualização. Depois que o aparelho estiver em
   >=141, a env pode ser dispensada (o aviso corrigido do 141 cobre).

## R3 — O teste ponta a ponta (aparelho no CABO, dono só olha)

O dono conecta o aparelho; **EU dirijo tudo**. O envio de recado é SEMPRE pelo
navegador (inspetor do cockpit ou "Recado a todos") — o dono não digita nada.

1. `adb shell dumpsys package br.com.hbxsystem.logistica | grep versionCode`
   — se ainda 139: primeiro conferir se a tela "Atualizar app" aparece ao
   abrir (obrigatória no manifesto). Se não aparecer, debugar `checkAppUpdate`
   ANTES de qualquer outra coisa.
2. Com o APK com allowlist instalado: eu mando um recado `normal` pelo
   navegador → em ≤60s o sino do app deve mostrar.
3. Prova de que o app PEDIU: `/var/log/nginx/access.log` com User-Agent
   `HBX-logistica` procurando `recados/puxar` (lição do hbxapk §4: o log do
   Nest só mostra requisição com ERRO — "não achei no log do backend" não
   prova nada).
4. Banco: `entregueEm` preenchido na linha → balão ✓✓ no cockpit.
5. Recado `urgente` → vibra + fala (TTS). `logcat | grep GoogleTTS` prova sem
   ouvir. Depois tocar em Confirmar numa entrega → o PORTÃO abre e o "Entendi"
   destrava; `ackEm` preenche e o balão fica "✓✓ entendido" verde.
6. Recado `alarme` → despertador de tela cheia (MissaoAlarme).
7. Limpar os recados de teste da empresa 5 no fim (o dono odeia resíduo).

## Fora de escopo (registrado pra não perder)
- Decisão do dono pendente: sentinela só enxerga rota RASTREADA; a operação
  roda Essencial → ligar Rastreada por padrão é decisão de COBRANÇA.
- Coordenadas dos clientes de teste em linha reta (seed) — se incomodar no
  demo, corrigir o seed, não o mapa.
