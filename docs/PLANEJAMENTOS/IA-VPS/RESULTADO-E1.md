# RESULTADO CHIP E1 — Worker local da PONTE (05-06/07/2026)

**Status: CONCLUÍDO. Degrau 1 PROVADO ao vivo no 30B real.** A única peça nova da arquitetura híbrida
existe: o worker que puxa missão da fila e executa no `qwen3:30b-a3b-instruct-2507-q4_K_M` local. Fluxo
de ponta a ponta provado com IDs e latências reais (§4). Backend typecheck ESTRITO verde, 27 testes de
missão + 17 testes do worker + suítes tocadas todas verdes. Nada publicado, VPS não tocada, WhatsApp não
tocado, sem branch nova. Flag própria `HBX_PONTE_WORKER_ENABLED` **default OFF**.

## TL;DR

O worker (`hbx-owner/local-agent/lib/ponte-worker.js`, Node puro) faz o loop PULL: lease no backend →
warm-check exclusivo do 30B frio → executa extração/nota no 30B → complete. O resultado NUNCA é escrito
pelo worker: ele devolve o JSON bruto + a fonte, e o **backend** grava pelo caminho único
(`MissionResultApplyService` → `LeadContactWriteService` + gate anti-alucinação; nota → `metadataJson`).
Elástico sem cron (freia por usuário ativo, roda por lag da fila), disjuntor por teto de falhas, backoff
exponencial. Prova viva: 30B FRIO → warm-check 78s → 2 missões descartáveis processadas, **contatos
`ai_extraction` gravados + nota 85 gravada, 0 alucinação**, tudo local.

## 1. Contrato mapeado (o que já existia × o que estendi)

| Peça | Onde | Estado antes | O que E1 fez |
|---|---|---|---|
| Fila lease/heartbeat/complete/fail/stats/redrive | `radar-mission-queue.service.ts` | pronta, TTL 2min, backoff | +stage `xray_note`, +`getActivitySnapshot`, +`getLeasedContext`, +`activity`/`lag` no lease |
| Controller HTTP `/modules/owner/missions/*` (JWT+Master) | `radar-missions.controller.ts` | lease/complete diretos | `complete` agora aplica o resultado ANTES de marcar completa |
| Extração 30B + gate + escrita única | `ai-contact-extraction.service.ts` + `lead-contact-gate.ts` + `LeadContactWriteService` | provada (sprint 5) | reusada VERBATIM (prompt/params) pelo worker + pelo apply |
| Nota ICP | `cnpj-xray-ai-note.service.ts` (inline 7b, só XLSX) | não persistia no lead | vira missão `xray_note` pro 30B; grava em `metadataJson.aiNote` |
| `enrich_lead` enfileirado | `cnpj-xray.service.ts:351` | consumido in-process | +`website`/`name` no payload (aditivo) p/ o worker crawlear |
| local-agent (Node http puro, :3107) | `hbx-owner/local-agent/server.js` | sem worker de lease | worker instanciado + rotas de status/controle + start no boot |

**A peça inexistente que o E1 criou:** o worker de lease. Tudo o mais foi solda mínima.

### Contrato do `complete` (a mudança de fluxo mais importante)
Antes: `complete(id, leaseId, result)` só marcava a missão completa (o `result` ficava no `resultJson`,
sem ninguém aplicar). Agora o controller:
1. `getLeasedContext(id, leaseId)` → stage + payload sob o lease (idempotente: se já completou com o
   mesmo lease, devolve `alreadyCompleted` e pula a aplicação).
2. `MissionResultApplyService.apply({ stage, payload, result })` → roteia pro caminho único de escrita.
3. Só então `complete()`. Se o apply falhar de verdade (write/update falhou, lead sumiu), **NÃO
   completa** — devolve `{ ok:false, retryable }`, o worker marca fail retryable e a missão volta pra
   fila (idempotente ao reprocessar). Payload ruim (`lead_id_ausente`) → não-retryable.

## 2. Arquitetura do worker (`lib/ponte-worker.js`)

Factory `createPonteWorker({ ollamaRequest, backendRequest, fetchSiteText, log, env })` — injetável
(por isso testável sem rede). Loop `tick()` a cada ciclo:

1. **1 lease** traz o sinal elástico JUNTO (`activity.activeUsers` + `lag.queuedDue`) — sem endpoint
   de status novo, reaproveitando o que a fila já sabe.
2. **`decideNextAction()` (função PURA, unit-testada)** decide: `circuit_open` | `freia` | `warm` |
   `idle` | `work`. É o coração do elástico + freios, sem I/O.
3. Age conforme a decisão; devolve o delay do próximo ciclo (backoff).

### As 3 leis de Ollama (T1/T2) implementadas, não opcionais
- **(a) num_ctx SEMPRE capado E UNIFICADO em 8192** — constante `PONTE_NUM_CTX=8192` em TODA chamada
  (warm-check, extração, nota). Nunca troca de ctx entre chamadas (a causa do run CTXMISTO abortado do
  T2 §3). Testado: `tick work` confere `options.num_ctx === 8192`.
- **(b) NUNCA cold-load com missão em voo** — `ensureWarm()` checa `/api/ps`; se o 30B não está
  residente, o worker **solta o lote leaseado (fail retryable)** e faz o warm-check EXCLUSIVO (chamada
  1-token, `keep_alive:-1`, ctx 8192) ANTES de aceitar qualquer missão. Só volta a leasear quando
  residente. Isto é exatamente o padrão que o T2 §4.3 provou obrigatório (swap-morte 0,58GB/2,94 tok/s
  quando cold-load competiu com chamada em voo). Testado: `tick warm`.
- **(c) descarga** — `unloadModel()` (`keep_alive:0`) quando o elástico fica ocioso/freando por
  `HBX_PONTE_UNLOAD_AFTER_IDLE_MS` (default 10min). Botão manual `/owner/ponte/unload` pro E2.

### Elástico (decisão do dono — sem cron, reaproveitando sinais existentes)
- **Freia por usuário ativo:** o backend conta `AuthSession` com `lastSeenAt` na janela (default 5min =
  o mesmo `onlineCutoff` do `ActiveSessionsService`; é o campo que o JWT já toca a cada request). Esse
  número viaja no lease. `activeUsers ≥ threshold` → o worker termina o que está em voo, **para de
  leasear** e solta o lote (retryable). Não é scheduler novo — é uma leitura leve reaproveitada.
- **Roda por lag:** `lag.queuedDue > 0` e ninguém ativo → aquece e processa full, qualquer hora.
- **Ocioso:** fila vazia → `idle`; após N min ocioso → descarrega o 30B.

### Freios (lei da casa — família do disjuntor do WhatsApp)
- **Disjuntor:** `HBX_PONTE_MAX_CONSECUTIVE_FAILURES` (default 5) falhas CONSECUTIVAS de **missão**
  (execução/complete, NÃO de rede) → circuito abre, worker PARA, acende estado vermelho consultável
  (`/owner/ponte/status`), não reprocessa sozinho. Rearme manual só via `/owner/ponte/reset` (botão E2).
- **Falha de rede no lease** (backend/VPS fora) → só backoff, **não conta pro disjuntor** (não é falha
  de missão) — o PC-off/rede-instável não abre o circuito à toa. Testado.
- **Backoff exponencial com teto** (`computeBackoffMs`: base·2^(n-1), cap). NUNCA loop livre.
- **Flag `HBX_PONTE_WORKER_ENABLED` default OFF** — `start()` é no-op se OFF.

### Distinção de falhas (recomendação do T2 §9 atendida)
Timeout e conexão-recusada são ambos retryable, mas o worker separa **falha de rede no lease** (backoff,
não abre disjuntor) de **falha de missão** (conta pro disjuntor) — o padrão que o T2 pediu.

## 3. Escrita — caminho único no backend (o worker nunca toca o banco)

`MissionResultApplyService`:
- **`enrich_lead`:** o worker devolve `{ telefones, emails, nome_dono, sourceText }` BRUTO do 30B. O
  backend reconstrói os candidatos (`source ai_extraction`, `confidence 60`) e passa TUDO pelo
  `LeadContactWriteService` → o gate reprova o que não existe LITERALMENTE na `sourceText`. **A
  alucinação morre no backend, não no worker** (o worker é conveniência; a fonte da verdade é o gate do
  backend). Provado por teste: telefone `(11) 99999-0000` que não está na fonte → 0 gravado, `rejected`.
- **`xray_note`:** grava `{ notaIcp, resumo, model, source:'ponte_30b' }` em `metadataJson.aiNote` do
  `RadarLeadPool` (aditivo, sem migration — o presenter já lê o metadataJson como evidência). Nota
  `null` (worker degradou) → **noop, NÃO zera a nota existente** (bug pego por teste: `Number(null)===0`
  zeraria — corrigido pra tratar null explícito).
- **Idempotência confirmada:** `LeadContactWriteService` pula contato já existente (radarLeadId, kind,
  valueNormalized); a nota sobrescreve o mesmo bloco. Reaplicar a mesma missão não duplica. Testado nos
  dois caminhos + provado ao vivo (a missão `enrich_lead` foi releaseada 1× durante o warm e reprocessou
  sem duplicar — att=2, 2 contatos únicos).

## 4. Prova viva do Degrau 1 (tudo local, 30B REAL, IDs e latências reais)

Harness fiel (`scratchpad/e1-degrau1/harness.ts`): worker REAL + `RadarMissionQueueService` REAL +
`MissionResultApplyService`/`LeadContactWriteService`/gate REAIS sobre fake-prisma em memória, com um
HTTP server expondo o MESMO contrato do controller (sem os guards JWT/Master — é prova local). Um site
descartável servido em `127.0.0.1:3399` com contatos literais. O 30B estava **FRIO** (nada residente no
`/api/ps` antes) — cenário perfeito pra provar o warm-check.

```
[ponte] 30B frio — warm-check exclusivo (1-token, ctx 8192), pode levar ~2min…
[ponte] 30B residente em 78s — pronto pra leasear.
[degrau1] apply xray_note:  {"applied":true,"kind":"note","written":1}
[degrau1] apply enrich_lead: {"applied":true,"kind":"contacts","written":2,"skipped":0,"rejected":0}
════════════════ DEGRAU 1 — VEREDITO ════════════════
tempo total (inclui cold-load): 103 s
missões: enrich_lead=completed(att 2)  xray_note=completed(att 1)
LeadContact: phone 1132224455 (ai_extraction, conf 60) · email vendas@marmorariateste-e1.com.br (ai_extraction, conf 60)
metadataJson.aiNote: {"notaIcp":85,"resumo":"Empresa ativa com site, WhatsApp e e-mail validados…","model":"qwen3:30b-a3b-instruct-2507-q4_K_M","source":"ponte_30b"}
totals: leased 2 · completed 2 · failed 0 · coldLoads 1
lastJobs: enrich_lead ok 9.738ms · xray_note ok 8.919ms
✓ DEGRAU 1 PASSOU
```

**O que a prova cobre, ponto a ponto do pedido:**
- **Warm-check antes do 1º lease:** 30B frio → warm-check 78s (dentro do bairro dos ~114s do T1) →
  SÓ ENTÃO leaseou. Nenhuma missão processada durante o cold-load. Lei (b) provada ao vivo.
- **Processa no 30B real:** extração 9,7s, nota 8,9s (steady-state do T2: p50 ~6-7s). num_ctx 8192.
- **`LeadContact` com `source ai_extraction`:** 2 contatos gravados, gateados contra a fonte.
- **Missão `completed`:** as 2, sem duplicar (idempotência viva — enrich releaseado no warm reprocessou).
- **Nota gravada:** `notaIcp 85` no metadataJson, banda alta (coerente com o ranqueamento do T1).

## 5. Como ligar o Degrau 2 (apontar pro VPS — NÃO executado, é o D1)

O worker já é agnóstico de destino (fala HTTP com quem `backendRequest` apontar). Pra apontar pro VPS:

1. **VPS:** `HBX_MISSION_QUEUE_ENABLED=true` + `HBX_AI_EXTRACTION_ENABLED=true` no
   `/root/HBX/backend/.env` + **RECREATE** do container (regra INFRA — env_file não pega em restart).
   O controller `/modules/owner/missions/*` já roda lá (JWT+Master).
2. **Local:** no `hbx-owner/local-agent`, setar no ambiente do serviço:
   - `HBX_PONTE_WORKER_ENABLED=on`
   - `HBX_OWNER_BACKEND_URL=` a URL do backend da VPS (o `backendRequest` já faz login master +
     refresh de token via `SYSTEM_MASTER_USERNAME/PASSWORD` — mesma cadeia do cnpj-backfill).
   - opcional: `HBX_PONTE_MODEL`, `HBX_PONTE_ACTIVITY_FREIA_THRESHOLD`, `HBX_PONTE_UNLOAD_AFTER_IDLE_MS`.
3. O worker liga sozinho no boot do local-agent (ou `POST /owner/ponte/start`). `GET /owner/ponte/status`
   dá o estado verde/vermelho pro cockpit :3107 (CHIP E2).
4. **Pull-based, `:11434` segue 127.0.0.1** — a máquina local NUNCA é exposta; ela liga pro VPS.

Como o worker fala com o backend por HTTP igual VPS × local, o Degrau 1 (local) já exercita exatamente o
mesmo código que o Degrau 2 vai rodar — só muda a URL. O D1 do PLANO faz a prova com lead real + publish.

## 6. Endpoints novos no :3107 (insumo pronto pro E2)
`GET /owner/ponte/status` (estado + disjuntor + últimos jobs + activity/lag) · `POST /owner/ponte/reset`
(rearma disjuntor) · `POST /owner/ponte/start|stop` · `POST /owner/ponte/warm` · `POST /owner/ponte/unload`.

## 7. Decisões tomadas sozinho (declaradas, não escondidas)

1. **Nota xray persiste em `metadataJson.aiNote`, sem migration.** O PLANO diz "nota → onde o xray grava
   hoje", mas hoje a nota inline SÓ vai pro XLSX do job, não é persistida por lead. Escolhi o
   `metadataJson` (que o presenter já lê como evidência) por ser aditivo e sem schema change — respeita
   "estender o mínimo". Um campo dedicado no schema fica pro E3/dono se quiser filtrar por nota.
2. **Mantive o note inline (7b VPS-sim) no job do xray** e só ADICIONEI a missão `xray_note` pro 30B
   (gated pela flag da fila). Não arranquei o inline pra não mudar o XLSX que o dono usa hoje — a nota
   honesta do 30B grava no lead em paralelo. Quando o D1 ligar, o dono decide se o inline sai.
3. **Sinal de usuário ativo = `AuthSession.lastSeenAt` na janela**, reaproveitando o `ActiveSessionsService`
   (5min). Exposto no lease (não num endpoint novo) porque "a decisão do freio viaja com o lease" era o
   pedido. Degrada gracioso (sem tabela → activeUsers 0, nunca trava o lease).
4. **`enrich_lead` ganhou `website`/`name` no payload** (aditivo) pro worker crawlear+extrair. O consumo
   in-process ignora extras — sem regressão. Sem website no payload, o worker completa vazio (não trava).
5. **O gate roda no BACKEND, não no worker.** O worker devolve o bruto + `sourceText`; quem manda é o
   gate do backend (fonte única). Mais tráfego (sourceText capado 6000 chars), mas a alucinação nunca
   depende do worker. Trade-off consciente a favor da segurança.
6. **Falha de rede no lease NÃO abre disjuntor** (só falha de missão) — o disjuntor é pra bug de
   processamento, não pra PC-off/VPS-fora (esses são estado honesto, não erro).
7. **Prova via harness fiel em vez de subir o NestJS inteiro** — o backend local não estava no ar e subir
   NestJS+DB com Chrome aberto arriscava a pressão de RAM que o T2 §4.3 alertou durante o cold-load do
   30B. O harness exercita os serviços REAIS (queue/apply/write/gate) + worker REAL + 30B REAL; a única
   peça faked é o Prisma (em memória, mesmo estilo do teste unitário do serviço). O caminho de código
   provado é idêntico ao de produção; a auth (guards) é a única coisa que o harness pula, e ela não é
   lógica de E1.

## 8. Checks

- **Backend typecheck ESTRITO** (`tsc --noEmit -p backend/tsconfig.json`): **verde**.
- **Testes de missão** (`radar-mission-queue.service.test.ts` + `mission-result-apply.service.test.ts`):
  **27/27 verde** (inclui 4 novos de E1 na fila + 8 do apply, com o gate reprovando alucinação ao vivo).
- **Testes do worker** (`hbx-owner/local-agent/test/ponte-worker.test.js`): **17/17 verde** (idle,
  freio por atividade, warm-check bloqueando lease, disjuntor, backoff, rede≠disjuntor, complete
  recusado→fail retryable, flag OFF).
- **Suítes tocadas** (`cnpj-xray.service.test.ts`, `lead-contact-gate.test.ts`): **13/13 verde**.
- **Todas as suítes do local-agent** (`test/*.test.js`): **47/47 verde**.
- **Degrau 1 ao vivo:** ✓ (§4).

## 9. Arquivos

Novos:
- `hbx-owner/local-agent/lib/ponte-worker.js` — o worker.
- `hbx-owner/local-agent/test/ponte-worker.test.js` — 17 testes.
- `backend/src/webscraping/radar/missions/mission-result-apply.service.ts` — caminho único de escrita.
- `backend/src/webscraping/radar/missions/mission-result-apply.service.test.ts` — 8 testes.

Tocados:
- `backend/src/webscraping/radar/missions/radar-mission-queue.service.ts` — stage `xray_note`,
  activity snapshot, `getLeasedContext`, activity/lag no lease.
- `backend/src/webscraping/radar/missions/radar-missions.controller.ts` — complete aplica o resultado.
- `backend/src/webscraping/radar/missions/radar-mission-queue.service.test.ts` — 4 testes de E1.
- `backend/src/webscraping/radar/cnpj-xray/cnpj-xray.service.ts` — enfileira `xray_note` + payload de
  extração enriquecido.
- `backend/src/webscraping/webscraping.module.ts` — registra `MissionResultApplyService`.
- `hbx-owner/local-agent/server.js` — instancia o worker, rotas de status/controle, start no boot.

Dado bruto da prova: `scratchpad/e1-degrau1/harness.ts` + `run.log` (⚠️ scratchpad é de sessão — este
doc carrega os números que a decisão precisa).
