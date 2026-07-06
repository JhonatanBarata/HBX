# RESULTADO GOVERNOR-IA — §9 do PLANO-HIBRIDO-30B (05/07/2026)

**Status: CONCLUÍDO (código + testes verdes, commit local, SEM push/publish).** Implementa a REGRA
ABSOLUTA do dono: "não chega paulada de perguntas pros IAs; tem que ter fila pra eles não
explodirem" — mas fila com **FAIXAS e prioridade**, não FIFO única (FIFO consagraria o atropelo que
o CHIP 5 mediu).

## TL;DR

- **`AiGatewayService`** (`backend/src/ai-gateway/`) — ponto ÚNICO de passagem de TODA chamada de IA
  do backend ao Ollama. 2 faixas: `realtime` (prioridade absoluta, concorrência 2) e `batch`
  (concorrência 1, cede a vez ao realtime, sem starvation eterna).
- **6 callers soldados** sem mudar prompt/params/semântica de nenhum — o gateway envolve o `fetch`,
  não o conteúdo.
- **Recusa cedo, nunca lança novo** — fila cheia ou espera condenada → o caller recebe o fallback
  que JÁ TEM (keyword/roteiro/nota-null/EMPTY_RESULT).
- **Flag `HBX_AI_GATEWAY_ENABLED` — default ON** (justificativa abaixo).
- **Telemetria** por faixa no `:3107`/tree-status (`GET .../radar/ai-gateway` + bloco `aiGateway` no
  `tree-status`).
- **Aceite provado por teste automatizado** (Ollama mockado, sem rede): rajada 20 batch + 5 realtime,
  grupo de controle (OFF reproduz o atropelo), recusa-cedo, starvation reversa. **7/7 verdes.**

## O dado que motiva (RESULTADO-CHIP5)

O CHIP 5 mediu: com o Ollama enfileirando sozinho (`NUM_PARALLEL=2` + fila interna dele), um **lote
de cards atropela o bot** — p95 do BOT explode de 6,8s (parado) para **31–38s** sob carga, 14/16
classificações estourando o gate de 9s. A causa é contenção (CPU na VPS; concorrência no Ollama). Uma
fila ÚNICA/FIFO no backend **consagraria** o atropelo: o bot (realtime, gate apertado) entraria atrás
de 50 raios-X (batch, orçamento largo). A solução do §9: **fila SIM, com FAIXAS** — realtime na
frente, batch cede.

## Arquitetura

### `AiGatewayService.run(lane, budgetMs, fn)` — a API única

```
caller  ──►  AiGatewayService.run('realtime'|'batch', timeoutMs, () => fetch(ollama /api/chat))
                       │
                       ├─ flag OFF ──► executa fn() DIRETO (bypass byte-idêntico ao de hoje)
                       │
                       └─ flag ON ──► admit(lane, budget)
                                        ├─ slot livre (+ batch: sem realtime em jogo) ──► roda já
                                        ├─ fila cheia .............................────► RECUSA (queue_full)
                                        ├─ espera prevista + 1 job > budget ........────► RECUSA (budget_exceeded)
                                        └─ senão ──► entra na fila, espera slot, roda, libera
```

- **Estático, espelhando `SourceBudgetService`**: os callers batch (saneamento/extração/xray) são
  instanciados na mão com `new` em vários call-sites — injetar via DI quebraria. Estado estático
  serve toda instância do processo; nenhum wiring de módulo é preciso (idêntico ao SourceBudget, que
  também nunca é `provider`).
- **`run()` NUNCA lança por causa do gateway.** Devolve discriminated union
  `{ ok:true, value } | { ok:false, refused:true, reason }`. Recusa = o caller cai no fallback dele.
  Erro DENTRO do `fn` (Ollama fora/timeout) **propaga como sempre** — o gateway só governa a
  ADMISSÃO, não muda o contrato de erro (o try/catch existente de cada caller segue valendo).

### As 2 faixas

| Faixa | Callers | Concorrência (default) | Comportamento |
|---|---|---|---|
| `realtime` | ai-intent-classifier, intent-engine (NLU atendimento), assistente-sandbox | **2** (casa com `OLLAMA_NUM_PARALLEL=2` da VPS) | Prioridade ABSOLUTA. Passa na frente sempre; `pump()` drena realtime antes de liberar batch. |
| `batch` | cnpj-xray-ai-note, ai-saneamento, ai-contact-extraction | **1** | Cede a vez: só começa se NÃO houver realtime em jogo (em voo OU esperando). Job batch em voo NÃO é preemptado (termina), mas todo batch não-iniciado espera o realtime esvaziar. |

**Anti-atropelo + anti-starvation, ao mesmo tempo:** a concorrência 1 do batch garante que um
realtime que chega no meio nunca espera atrás de mais de **1** batch em voo; e como o batch é
re-liberado assim que o realtime esvazia (`pump()` a cada release), o batch **não morre de fome** —
processa quando a fila realtime seca. A starvation reversa é a que o §9 exige cobrir.

### Recusa cedo (não trava fundo)

Cada `run()` informa o orçamento (o `timeoutMs` do próprio caller: bot/assistente 20s via env, xray
60s, saneamento 20s, extração 90s). Antes de entrar na fila, o gateway estima a **espera prevista**
(fila à frente ÷ concorrência × latência típica da faixa; para batch soma o backlog realtime). Se
`espera_prevista + 1 job típico > orçamento`, **recusa AGORA** (`budget_exceeded`) em vez de enfileirar
só pra dar timeout lá na frente. Fila com profundidade máxima por faixa; estouro = `queue_full`. Em
ambos os casos o caller recebe recusa graciosa e cai no fallback — **zero exceção nova**.

### Parâmetros (env é a fonte de verdade — todos com default seguro)

| Env | Default | Papel |
|---|---|---|
| `HBX_AI_GATEWAY_ENABLED` | **ON** (ausente = ligado) | liga/desliga o governor |
| `HBX_AI_GATEWAY_REALTIME_CONCURRENCY` | 2 | slots simultâneos realtime |
| `HBX_AI_GATEWAY_BATCH_CONCURRENCY` | 1 | slots simultâneos batch |
| `HBX_AI_GATEWAY_REALTIME_MAX_QUEUE` | 8 | profundidade da fila de espera realtime |
| `HBX_AI_GATEWAY_BATCH_MAX_QUEUE` | 64 | profundidade da fila de espera batch |
| `HBX_AI_GATEWAY_REALTIME_TYPICAL_MS` | 7000 | latência típica p/ conta de recusa-cedo (bot p95 ~6,8s parado, CHIP 5) |
| `HBX_AI_GATEWAY_BATCH_TYPICAL_MS` | 20000 | idem batch (xray/saneamento p50 ~10–23s) |

## Default da flag: **ON** — justificativa

**Ligado por default.** Três razões, em ordem de peso:

1. **Sob carga baixa é NO-OP.** Com a fila vazia e slots livres, `admit()` retorna imediatamente
   (`waitedMs=0`) e roda o `fn` na hora — o comportamento é **idêntico** ao de hoje. O governor só
   **morde em rajada**, que é exatamente o cenário que o dono mandou resolver ("não chega paulada").
   Deixar OFF por default seria entregar o freio desligado justamente quando a máquina de merda
   (o atropelo do CHIP 5) acontece.
2. **O grupo de controle prova o custo de OFF.** No teste, com o gateway OFF, 20 batch + 5 realtime
   disparadas juntas colocam **25 chamadas em voo ao mesmo tempo** — o atropelo cru. Com ON, o pico
   fica em **3** (realtime 2 + batch 1) e as 5 realtime fecham em **<400ms**, na frente do lote.
3. **Degradação é graciosa e reversível.** Se algo der errado, `HBX_AI_GATEWAY_ENABLED=false` volta
   ao comportamento de hoje sem deploy de código (só env; no VPS = RECREATE, regra INFRA). E como
   recusa nunca lança — só cai no fallback que já existe — o pior caso do ON é "a IA foi pulada e o
   keyword/roteiro assumiu", que é o mesmo pior caso de Ollama offline hoje.

Contraponto honesto considerado: ON adiciona uma indireção (o `run()`) no caminho quente do bot. Mas
é uma promise que resolve **sincronamente** quando há slot — custo desprezível (medido: bypass OFF
2,0ms; snapshot 61ms é dominado pelo `setTimeout` do mock, não pelo gateway). Não há motivo de
performance para deixar OFF.

## Callers soldados (6/6) — o gateway envolve o fetch, não o conteúdo

| # | Caller | Faixa | Fallback na recusa (JÁ EXISTIA) |
|---|---|---|---|
| 1 | `bot/intent/ai-intent-classifier.service.ts` `classify()` | realtime | `return null` → keyword |
| 2 | `bot/intent/intent-engine.service.ts` `classifyAtendimentoAction()` | realtime | classification `null` → menu |
| 3 | `assistente/assistente-sandbox.service.ts` `defaultOllamaChat()` | realtime | throw → `reply()` cai no roteiro |
| 4 | `webscraping/radar/cnpj-xray/cnpj-xray-ai-note.service.ts` `note()` | batch | `EMPTY_RESULT` (nota null) |
| 5 | `webscraping/radar/03-enrichment/ai-saneamento.service.ts` `callOllama()` | batch | `null` (sem retry na recusa) |
| 6 | `webscraping/radar/03-enrichment/ai-contact-extraction.service.ts` `extract()` | batch | `EMPTY_RESULT` (sem retry na recusa) |

**Não mudou:** prompt (`SYSTEM_PROMPT` de cada um), `model`, `options` (temperature/num_predict/
num_ctx), `format:'json'`, `think:false`, `signal`/timeout, os retries dos callers batch, o gate
anti-alucinação da extração, o registro de `IntentDecision`. O `fetch` é o MESMO — só passou a rodar
dentro do slot de admissão. Prova: os testes existentes desses callers (que mockam `global.fetch` e
conferem `capturedBody`/`capturedSignal`) passam **sem alteração**.

Nos callers batch com retry (saneamento/extração), a recusa do governor **retorna direto** (não
entra no `for` de retry): o governor já decidiu não admitir; retentar só re-recusaria. O retry
continua valendo para erro de REDE (o comportamento de cold-load coberto originalmente).

## Telemetria (`:3107` / tree-status)

`AiGatewayService.snapshot()` — mesmo espírito do `SourceBudgetService.usageSnapshot()`. Por faixa:
`concurrency`, `queueDepthCap`, `active` (em voo), `waiting` (aguardando), `accepted`,
`refusedQueueFull`, `refusedBudget`, `refusedTotal`, `completed`, `waitP95Ms` (p95 de espera, janela
deslizante de 200 amostras). Exposto em:

- **`GET /modules/owner/radar/ai-gateway`** — gauge dedicado (espelha `/source-budget`).
- **Bloco `aiGateway`** dentro de `GET /modules/owner/radar/tree-status` (o :3107 já consome o
  tree-status; o bloco entra tolerante a falha, igual aos outros).

## Números do teste de rajada (Ollama MOCKADO, latência simulada, determinístico)

Arquivo: `backend/src/ai-gateway/ai-gateway.service.test.ts` — **7/7 verdes**.

| Teste | Prova | Resultado |
|---|---|---|
| **RAJADA** | 20 batch (chegam antes) + 5 realtime (bot entra no meio) | 5 realtime completam TODAS, cada uma < gate de 9s, e o conjunto fecha em **<400ms** (2 slots × ~30ms × 3 rodadas) — NÃO atrás dos 20 batch (que a 1 slot levariam ~1200ms). As 20 batch **cedem** e completam **depois** (starvation reversa coberta). Pico de concorrência real **≤3** (rt 2 + batch 1). |
| **GRUPO DE CONTROLE (OFF)** | mesma rajada, `HBX_AI_GATEWAY_ENABLED=false` | **25 chamadas em voo simultâneas** — o atropelo cru reproduzido (nada segura o lote pra ceder ao bot). Prova o valor do ON. |
| **RECUSA-CEDO fila cheia** | 1 slot + fila 2, 4 pedidos | o 4º recebe `refused: queue_full`, os 3 completam, **sem exceção**. |
| **RECUSA-CEDO orçamento** | slot ocupado por job longo, pedido com budget 3s < espera prevista | `refused: budget_exceeded` **sem entrar na fila**. |
| **flag OFF bypass** | `run()` com flag off | chama `fn`, devolve `ok`, **não toca contadores** (byte-idêntico). |
| **erro no fn** | `fn` lança | a exceção **propaga** (não vira refused) e o **slot é liberado** (próximo roda). |
| **snapshot** | 2 rt + 1 batch | gauge bate: `accepted` rt=2/batch=1, `active`=0 no fim, `waitP95Ms` numérico. |

## Checks

- **Typecheck estrito (backend `tsc -p tsconfig.json`): VERDE** (exit 0).
- **Regressão dos callers + gateway: VERDE.**
  - `ai-gateway.service.test.js` — 7/7
  - `assistente-sandbox.service.test.js` — 9/9 (inclui a prova estática anti-Webwhats)
  - `intent-engine.service.test.js` — 9/9
  - `ai-saneamento.service.test.js` — 7/7
  - `cnpj-xray.service.test.js` + `cnpj-xray-validate.test.js` — sem regressão
  - `source-budget.service.test.js` — 8/8 (padrão da casa intacto)
  - `radar-tree-status.service.test.js` — sem regressão (bloco `aiGateway` opcional)
  - `messaging.service.test.js` + `radar-mission-queue.service.test.js` — 52/52 (integração adjacente)
  - Extração (`ai-contact-extraction`) não tem teste unitário dedicado (gate provado no bench manual
    do sprint 5, plano §2); soldagem coberta pelo typecheck + o padrão idêntico aos outros batch.

## Fora do escopo (por construção, conforme §9)

- **Ponte-worker do 30B local** (`hbx-owner/`) — a serialização dele É a fila de missões
  (`RadarMission`), que já cumpre a regra. NÃO tocado.
- **Webwhats / WhatsApp** — NÃO tocado.
- **Frontend** — NÃO tocado.

## Arquivos tocados

**Novos:**
- `backend/src/ai-gateway/ai-gateway.service.ts` — o governor.
- `backend/src/ai-gateway/ai-gateway.service.test.ts` — aceite (rajada/controle/recusa/starvation).

**Editados (soldagem dos 6 callers + telemetria):**
- `backend/src/bot/intent/ai-intent-classifier.service.ts`
- `backend/src/bot/intent/intent-engine.service.ts`
- `backend/src/assistente/assistente-sandbox.service.ts`
- `backend/src/webscraping/radar/cnpj-xray/cnpj-xray-ai-note.service.ts`
- `backend/src/webscraping/radar/03-enrichment/ai-saneamento.service.ts`
- `backend/src/webscraping/radar/03-enrichment/ai-contact-extraction.service.ts`
- `backend/src/webscraping/radar-tree-status/radar-tree-status.service.ts` (bloco `aiGateway`)
- `backend/src/webscraping/webscraping.controller.ts` (`GET .../ai-gateway` + wiring no tree-status)
