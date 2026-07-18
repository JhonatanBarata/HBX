# 02 — App do APK: fix da pausa + popup único + wire do encerrar

**Arquivo-alvo:** `EntregaShell/app/src/logistica/assets/app/app.js` (o app que a casca Android carrega e
fala direto com a API do VPS — NÃO é o `frontend/` Next.js). CSS em
`EntregaShell/app/src/main/assets/app/app.css`. Este app.js é webview própria: usar hex direto em
SVG/CSS aqui é OK (o `check-pele.mjs` só gateia o `frontend/` Next.js — não se aplica aqui).

Três entregas, todas neste arquivo. É pura UI — sem dinheiro. Trabalhe com cuidado no `render()` (é
string-templating manual) e no handler de clique único (`app.addEventListener("click", ...)`, ~`:1104`).

## A) Popup único (contador duplicado) — o mais simples, faça primeiro
`nextStopOverlay(item)` (`app.js:252`) mostra o número DUAS vezes: dentro do círculo
(`<i>${count || "✓"}</i>`) **e** embaixo (`<p class="subtitle" data-countdown-message>em ${count}…</p>`).
- Remover a linha do `em ${count}…` (o `<p data-countdown-message>`). Fica só o número no círculo +
  "Abrindo navegação para {Cliente}".
- Em `showNextStop` (`app.js:1101`) remover a atualização do `[data-countdown-message]` (o `message`/
  `textContent = "em X…"`) já que o elemento sumiu; manter a atualização do número no círculo
  (`.next-stop-count i`).
- **Trava de toque duplo / chamada dupla**: garanta que abrir a navegação da próxima parada acontece
  **uma única vez**. Hoje o timer chama `abrirNavegacao(next)` ao chegar a 0 E o usuário pode tocar
  "Abrir agora" (`data-action="next-stop"`) — se tocar junto do zero, abre 2×. Adicione um guard
  idempotente (ex.: flag `state.nextStopOpening` / limpar `state.nextStop` + `clearInterval` ANTES de
  abrir, e o handler de "next-stop" checar se ainda há `state.nextStop`). Sem abrir Maps duas vezes.
- O MESMO contador duplicado existe na prévia "gerar rota" (countdown de 10s): `route-plan-count`
  (`app.js:706`) tem `<i>${count}</i>` no círculo E `<p>Gerar em ${count}</p>` embaixo. O dono chamou de
  "número no círculo + repete abaixo". Alinhe: deixe só o número no círculo + um rótulo curto fixo
  ("Gerando rota…") que NÃO repete o número. Ajuste `startDayReview` (`app.js:915`) pra não escrever o
  número no `<p>`. Guard de toque duplo em "confirm-managed-route" também (não gerar 2×).

## B) Fix da pausa + seta
Contexto: `routeTransmuxControl(planned, paused)` (`app.js:595`) decide a seta:
`active` → vermelho "Parar rota" (`stop-route`); `planned && !paused` → azul "Iniciar rota"; senão →
verde "Planejar rota". `stop-route` chama `pauseRouteOnDevice()` (`app.js:886`) que seta
`state.routePaused=true` (cache local `logistica-route-paused`). MAS `routeActive()` (`app.js:127`) =
`serverRouteActive() && open>0 && !routePaused` → com pausa vira false → a seta **cai pro VERDE
"Planejar rota"** mesmo com rota viva no servidor. E `resume-route` (`app.js:1202`) existe no handler mas
**nenhuma tela renderiza um botão que o dispare** → código morto, motorista não tem como voltar.

Corrigir:
1. **Faixa/estado de pausa explícito**: quando `serverRouteActive() && open>0 && state.routePaused`,
   renderizar no `route-controls` (dentro de `routeScreen`, `app.js:583`) uma faixa clara
   **"Rota pausada — Continuar rota"** com um botão `data-action="resume-route"` (religa o handler morto).
   A seta, nesse estado, **não** pode mostrar verde "Planejar": mostre o controle de pausa (ou a seta
   azul/vermelha coerente com "há rota viva"). Escolha o caminho de menor mudança que garanta: **rota viva
   pausada nunca vira verde "Planejar rota"**.
2. Ao `resume-route` (`resumeRouteOnDevice`), a seta volta pro estado ativo (vermelho "Parar"). Confira
   que `state.routePaused` volta a false e o cache `logistica-route-paused` é limpo (já é em
   `startRoute`).
3. Não invente estados novos aqui (a máquina completa no servidor é Onda 2). Só: **ativa**, **pausada
   (faixa + continuar)**, **planejada (azul iniciar)**, **sem rota (verde planejar)**. Sem verde
   fantasma com rota viva.

## C) Wire "Encerrar rota" no endpoint novo (substitui o loop)
Contrato congelado (o backend está sendo escrito contra isto):
`POST /logistica/rota/encerrar` body `{ date?, motivo? }` →
`{ ok:true, resumo:{ total, entregues, naoEntregues, pendentes } }`.
- Trocar `performCancelRoute()` (`app.js:1021`, o loop que cancela uma-a-uma) por **uma** chamada
  `H.api("/logistica/rota/encerrar", { method:"POST", body:{ date: operationalDate(), motivo:"..." } })`.
  No sucesso: `clearInterval(nextStopTimer)`, limpar `state.nextStop`, `state.routePaused=false`,
  `H.cache.remove("logistica-route-paused")`, `clearRouteSelection()`, `H.stopRoute()`, `refresh(true)`,
  toast com o resumo (ex.: `Rota encerrada. ${resumo.entregues} entregues preservadas, ${resumo.pendentes}
  pendentes.`). Em erro: toast de erro e **NÃO** deixa estado meio-limpo (o backend é atômico; o app só
  reflete).
- **Confirmação antes** (plano #8): a confirmação (`state.confirmation`) deve mostrar os números, que o
  app JÁ tem localmente (`deliveredItems().length`, `openItems().length`) — sem round-trip:
  - Depois de iniciar (rota ativa): título "Encerrar rota?", mensagem
    "{entregues} entregas concluídas serão preservadas. {abertas} continuarão pendentes. Nenhuma cobrança
    concluída é removida.", confirmLabel "Encerrar e manter pendências", `danger:true`.
  - Antes de iniciar (planejada, o `cancel-route` atual, `app.js:1197`): título "Cancelar planejamento?",
    mensagem "Remove só a ordem e a previsão. As entregas e o financeiro continuam.", confirmLabel
    "Cancelar planejamento".
  Ambos os caminhos chamam o MESMO endpoint no `accept-confirmation`. Ligue os dois `type`s de
  confirmação ao encerrar (procure onde `state.confirmation.type` é consumido no `accept-confirmation`).
- Remova o toast de cancelamento parcial ("Canceladas X de Y") — não existe mais parcial.

## Auto-verificação (sem dev server — é APK webview)
Não há preview pra este app. Faça:
- `node --check EntregaShell/app/src/logistica/assets/app/app.js` (sintaxe).
- Releitura crítica: cada `render()` que você tocou continua com template válido (aspas/crases
  balanceadas); nenhum `data-action` novo sem handler; nenhum handler sem UI que o dispare (o oposto do
  bug do `resume-route`).
- Descreva no relatório o passo-a-passo de teste manual que o dono fará no celular (ele instala o APK):
  ex. "iniciar rota → seta vermelha; tocar Parar → faixa 'Rota pausada — Continuar rota'; tocar Continuar
  → seta vermelha de novo; confirmar entrega → 1 popup só, 1 abertura de Maps; Encerrar → confirmação com
  contagem → some do ativo".

## Regras
Master direto, sem branch, **sem publish** (o dono rebuilda o APK e instala). PT-BR, só o texto pedido.
Reporte ao Opus: linhas/funções tocadas, resultado do `node --check`, e o roteiro de teste no celular.
