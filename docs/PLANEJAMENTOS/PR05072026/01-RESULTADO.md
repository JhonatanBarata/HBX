# 01 — Bot: timing humano (ver → ler → digitar) — RESULTADO

## Mapa do fluxo REAL encontrado (antes de editar)

Hoje, quando um lead responde na prospecção (`Webwhats`/Baileys), o caminho é:

`webhook Webwhats → processPersistedInbound → handleVendasAutomationInbound (messaging.service.ts)
→ intentEngine.classifyIntentWithFallback (IA → fallback keyword) → markVendasAutomationInterested /
sendVendasPitchAfterPreMessage → conversations.queueOutboundForCompany → OutboundMessage (fila) →
worker de dispatch (messaging.service.ts, ~linha 8560) → webwhatsBridge.sendText → motor
Webwhats (/message/sendText) → Baileys sendMessageWithTyping`.

Achados-chave (confirmados lendo o código, não suposição):

1. **O bridge (`webwhats-bridge.service.ts`) nunca chamava `sendPresence` e nunca passava `delay`
   no `sendText`.** `data.delay` sempre ia `undefined` para o motor, então o bloco
   `if (options?.delay)` do Baileys (`whatsapp.baileys.service.ts:2513`, que liga `composing` antes
   de enviar) **nunca era executado neste caminho**. Ou seja: o motor não gerava nenhum "digitando"
   real na tela do lead a partir do bot de prospecção.
2. **O único delay/typing que existia de fato era o `setTimeout` em
   `vendas-automation.service.ts:4128-4131`** (dentro de `processDueJob`), que é o **primeiro
   contato/abertura de campanha fria** — não tem IA na frente, dispara antes de qualquer resposta
   do lead. Esse é o "typing de campanha fria" que a espec pediu para não quebrar.
3. **O caminho de resposta pós-IA (`handleVendasAutomationInbound` em `messaging.service.ts`) não
   tinha NENHUM timing.** A IA classificava (podendo levar até `HBX_LLM_CLASSIFIER_TIMEOUT_MS`) e,
   assim que decidia, `markVendasAutomationInterested`/`sendVendasPitchAfterPreMessage` enfileiravam
   a resposta imediatamente via `queueOutboundForCompany` — sem silêncio, sem read, sem digitando.
4. **`markMessagesAsRead` já existia no bridge** (`webwhats-bridge.service.ts:1313`, rota
   `/chat/markMessageAsRead/{tenantKey}` do motor) e já era usado em `inbox.service.ts` — só não era
   chamado no fluxo do bot de prospecção. Reaproveitado (nenhum endpoint novo criado no motor).
5. **O motor já suporta `delay`+`presence` dentro do próprio `/message/sendText`** (padrão Evolution
   API: `textMessage` → `sendMessageWithTyping` → liga `composing`, aguarda o `delay`, manda
   `paused`, só então envia — `whatsapp.baileys.service.ts:2496-2546`). Reaproveitado esse mesmo
   endpoint em vez de criar uma chamada de presence separada.

## Correção do dono (05/07) incorporada

A fase "antes de ver" **não tem teto fixo de 9s**. 9s era só o valor observado do timeout atual do
classificador — não é uma constraint de design. A duração real dessa fase é o tempo que a IA levar,
limitado SÓ pela env `HBX_LLM_CLASSIFIER_TIMEOUT_MS` (calibrada à parte, fora deste PR). O piso
aleatório humano (2-6s) só entra para o caminho keyword (~0ms, que senão responderia instantâneo).
O único clamp de timing do PR inteiro é na fase 3 (digitando), usando os knobs já existentes
`typingSeconds`/`typingVarianceSeconds`.

## O que mudou

### `backend/src/vendas/prospecting-bot-timing.ts` (novo)
Módulo puro (sem I/O), com as funções de cálculo:
- `randomSilenceFloorMs(min=2000, max=6000, rng)` — piso aleatório humano da fase 1.
- `computeSilenceRemainderMs(aiElapsedMs, floorMs)` — `max(0, floor - elapsed)`, sem teto superior.
- `computeTypingDelayMs(bodyLength, typingSecondsKnob, typingVarianceSecondsKnob, opts)` — ms de
  digitando proporcional ao texto (jitter 50-80ms/char), clampado em
  `(typingSeconds + typingVarianceSeconds) * 1000`.
- `computeHumanTimingPhases(...)` — orquestra as duas fases de uma vez.
- `clampInteger` — idêntico ao já existente em `vendas-automation.service.ts` (mesmo comportamento,
  inclusive `Number(null) = 0` não cair no fallback — replicado de propósito, não é bug).

### `backend/src/messaging/messaging.service.ts`
- `handleVendasAutomationInbound`: mede `aiElapsedMs` ao redor de
  `classifyIntentWithFallback`; logo após a classificação, aplica **fase 1** (aguarda
  `computeSilenceRemainderMs`) e depois **fase 2** (`markVendasAutomationInboundAsReadBestEffort`,
  best-effort — falha nunca bloqueia a resposta já decidida).
- `resolveVendasSilenceFloorMs()`: lê `HBX_PROSPECTING_SILENCE_FLOOR_MIN_MS`/`_MAX_MS` (opcional,
  para calibração/teste); sem env válida cai no default do módulo (2-6s).
- `markVendasAutomationInterested` e `sendVendasPitchAfterPreMessage` (os dois únicos pontos que
  enviam texto de resposta pós-IA): calculam `typingDelayMs` via
  `computeVendasFollowUpTypingDelayMs(job.campaign, body)` e passam em `variables.typingDelayMs` no
  `queueOutboundForCompany` — **fase 3**.
- Worker de dispatch do outbox (~linha 8569): lê `dispatchVariables.typingDelayMs` e repassa para
  `webwhatsBridge.sendText({ ..., typingDelayMs })` — **fase 4** (o "enviar" acontece dentro dessa
  mesma chamada, já com o composing embutido).
- `markVendasAutomationNeutral`/`markVendasAutomationAutoReply` (não enviam mensagem, só marcam
  estado) **não foram tocados** — não há resposta pra "digitar".
- `processDueJob`/campanha fria (`vendas-automation.service.ts`) **não foi tocado** — continua com
  o próprio `setTimeout` antigo, intacto.

### `backend/src/messaging/webwhats-bridge.service.ts`
- `sendText` ganhou parâmetro opcional `typingDelayMs`. Quando > 0, adiciona `delay`+`presence:
  'composing'` ao payload de `/message/sendText` (mesma rota, sem endpoint novo) e estende o
  timeout HTTP daquela chamada (`timeoutOverrideMs = delay + 15000`) — sem isso o axios (timeout
  default 12s, teto 30s) estouraria antes do motor terminar de digitar+enviar em delays grandes.
  Omitido/0 = payload e timeout idênticos a antes (nenhuma campanha existente é afetada).
- `WebwhatsRequestOptions` ganhou `timeoutOverrideMs?: number` (nunca reduz o timeout, só amplia).

## Decisões tomadas sozinho (justificativa)

1. **Onde aplicar o "digitando" real**: em vez de criar uma chamada HTTP separada para
   `/chat/sendPresence` (que também existe no motor), reaproveitei o `delay`+`presence` já
   suportado dentro do próprio `/message/sendText` — é o padrão nativo da Evolution API (mesmo
   mecanismo do `typingSeconds` de campanha fria) e evita uma segunda chamada de rede bloqueante
   fora do timeout já orçado para o envio.
2. **Override de timeout por chamada**: precisei adicionar isso porque o timeout default do bridge
   (12s, clamp 2-30s) é menor que o teto do knob de digitando (até 45+30=75s). Só se aplica quando
   `typingDelayMs > 0` — nenhuma chamada existente muda de comportamento.
3. **Env de calibração do piso de silêncio** (`HBX_PROSPECTING_SILENCE_FLOOR_MIN_MS/MAX_MS`):
   adicionada para permitir recalibrar o piso humano sem deploy de código, e para os testes
   automatizados pinarem em `0` (sem isso a suíte esperaria 2-6s reais por teste).
4. **Fallback do knob de digitando quando a campanha não tem `typingSeconds` configurado**: usei o
   mesmo default do primeiro contato (8s + variância 12s) em vez de silenciar o typing por omissão
   — mantém paridade com o comportamento já visível em campanhas antigas.
5. **`markMessagesAsRead` best-effort**: qualquer falha (sessão não-Webwhats, jid ausente, motor
   fora) só loga warn — a especificação pede timing humano, não um novo ponto de falha que travaria
   a resposta já decidida pela IA.

## Checks rodados

- `cd backend && npx tsc -p tsconfig.json` (typecheck completo) — **limpo**.
- `cd backend && npm run build` — **limpo** (gera `dist/`).
- `Webwhats/` **não foi tocado** — `cd Webwhats && npm run typecheck` não se aplica a este PR.
- Testes executados (todos verdes):
  - `dist/vendas/prospecting-bot-timing.test.js` — 17/17 (unitários puros: ordem das fases, clamp
    do digitando, ausência de teto no silêncio, piso determinístico via `rng` injetado).
  - `dist/messaging/webwhats-bridge.service.test.js` — 46/46 (inclui os 2 testes novos de
    `sendText` com/sem `typingDelayMs`).
  - `dist/messaging/messaging.service.test.js` — 33/33 (env de silêncio pinada em `0` no topo do
    arquivo de teste — sem isso a suíte ficava ~35s mais lenta esperando o piso de verdade).
  - `dist/vendas/vendas-automation.service.test.js` — 37/37 (confirma que o typing de campanha fria
    continua intacto, sem nenhuma alteração de comportamento).
- Falhas pré-existentes NÃO relacionadas a este PR (confirmado isolando meus arquivos com
  `git stash` e reproduzindo a mesma falha sem minhas mudanças):
  - `hbx-recovery.service.test.js`: "concurrent deliveries notify once" — já documentado como
    pré-existente na memória do time (`ledger-test-vermelho-prod`).
  - `inbox.service.test.js`: "ADMIN company mode inclui conversa só-Meta quando metaActive".
  - `vendas.service.test.js`: 8 falhas em `getBoardForUser`/`importWebscrapingLeadsForUser` (RBAC/
    quota) — nada relacionado a mensageria/timing.

## Como testar ao vivo (decisão do dono, número descartável)

1. Ligar uma campanha de prospecção de teste com `typingSeconds`/`typingVarianceSeconds` definidos
   (ou deixar no default 8+12) usando um número **descartável**, nunca o chip real.
2. Mandar uma resposta curta (ex.: keyword "quero saber mais") de outro número de teste e observar:
   - Sem "digitando" nem "visto" aparecendo imediatamente — silêncio total por alguns segundos
     (piso humano, ou o tempo real da IA se ela demorar mais).
   - A marca de "lido" (✓✓ azul) aparece só ao FIM do silêncio.
   - Só depois disso o "digitando..." aparece, e por um tempo proporcional ao tamanho da resposta
     (mais curto pra respostas curtas, mais longo pras longas, sempre dentro do teto do knob).
   - A mensagem chega ao final do "digitando", não durante.
3. Repetir com uma resposta que force o caminho da IA (frase ambígua) e confirmar que o silêncio
   dura o tempo real da classificação (pode passar de 9s se o timeout configurado permitir) sem
   nenhum teto artificial.
4. Conferir que uma campanha SEM resposta de lead (primeiro contato/campanha fria) continua exibindo
   o "digitando" do jeito que já funcionava (comportamento antigo, não tocado).
5. **Não testar em chip real** — seguir a regra do repo: reconexão/timing de chip só em número
   descartável do dono/da própria pessoa testando, nunca no WhatsApp de produção do dono.
