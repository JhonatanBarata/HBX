# ROADMAP — IA-VPS (frente PARADA de propósito)

> Consolidação dos sprints de `IA-VPS/` (11/07/2026). Docs originais deletados — **git preserva**.
> Frente parada por decisão do dono; **não auto-construir** (toca WhatsApp/dinheiro/dep. externa).

## Visão
Frente que ligou a IA de tempo-real na VPS (qwen3:4b-instruct, EM PROD desde o CHIP6) e construiu toda a arquitetura HÍBRIDA: 30B local processa lote pesado de madrugada via ponte PULL (worker→fila de missões→gate anti-alucinação), com governor de fila por faixas, cockpit :3107 e badges de "IA trabalhando" pro cliente — tudo code-complete, testado e em grande parte já varrido pra prod pelos publishes de 10/07. PAROU no D1 (go-live real da ponte 30B): depende do dono ligar flags na VPS, apontar o worker local pro VPS com o 30B aquecido e DESPAUSAR a fila (hoje com "freio do dono"), além de exigir o PC do dono ligado à noite.

## Sprints

| Sprint | Estado | O que falta |
|---|---|---|
| CHIP1 — Harness + gabaritos (bench 4b×7b) | ✅ feito | nada, feito (harness vive em scratchpad efêmero; gabaritos e números capturados nos RESULTADO) |
| CHIP2 — BOT 4b×7b | ✅ feito | nada; 4b venceu 6/6 gates (opt-out 100%), 7b morto |
| CHIP3 — Assistente 4b×7b | ✅ feito | nada; 4b rubric 7,3, timeout subiu p/20s |
| CHIP4 — Cards (saneamento regressão + xray) | ✅ feito | nada; 4b campeão no saneamento |
| CHIP5 — Mix sob concorrência | ✅ feito | nada; veredito: mix MORTO (CPU 4vCPU+RAM), lote atropela o bot (p95 31-38s) → motivou o GOVERNOR |
| CHIP6 — Decisão + Injeção VPS | ✅ feito | em PROD (single qwen3:4b-instruct); falta bot ponta-a-ponta em número descartável; xray = 4b-degradado interino (banda média mente, reversível p/ 7b noturno) |
| C1 — Contingência HBX_ASSISTENTE_MODEL/timeout | ✅ feito | nada; env de timeout aplicada e 2 regras do prompt (agenda/pagamento) já publicadas (assistente-flow.ts) |
| T1 — Bench 30B nas tarefas batch | ✅ feito | nada; veredito: 30B RANQUEIA o xray → nota honesta migra pro 30B via ponte |
| T2 — Madrugada simulada | ✅ feito | nada; ~530-580 leads/h, achado-lei: NUNCA cold-load com missão em voo (swap-morte 0,58GB) |
| E1 — Worker local da PONTE (30B) | ✅ feito | código no repo (0c295397), Degrau 1 provado ao vivo; falta Degrau 2 (apontar pro VPS) = é o D1 |
| E2 — :3107 vira cockpit do Cérebro 30B | ✅ feito | código no repo (ebe1ead4); falta reiniciar o processo :3107 do dono (roda versão pré-E1/E2) |
| E3 — Visibilidade do cliente (badges fila/IA) | ✅ feito | código+testes no repo; falta validação visual no Chrome (Docker estava parado) e copy definitiva dos 3 estados (decisão do dono) |
| GOVERNOR-IA — AiGatewayService (fila por faixas) | ✅ feito | nada; código no repo (3a49eaa0) e soldado nos 6 callers, flag default ON, aparenta publicado; re-medir rajada na VPS é só calibração |
| V-FINAL — validação integrada local | 🟡 parcial | 3/4 fases com prova real; fase do ciclo rodou por harness fiel pq Docker não subiu — falta a vitrine real no Chrome com Nest completo |
| D1-FIX-TLS — fix do client HTTP do local-agent | ✅ feito | nada; ponte agora fala HTTPS com o VPS, validado ao vivo (lastError:null) |
| D1 — Ligar a ponte 30B em produção + lead real | ⬜ não feito | O PASSO QUE PAROU A FRENTE: flags na VPS (RECREATE) + worker local apontando pro VPS + 30B aquecido + DESPAUSAR a fila (freio do dono ligado); dono-no-loop + depende do PC do dono ligado à noite |

## Flags / passos VPS pendentes
- D1 VPS (PENDENTE): HBX_MISSION_QUEUE_ENABLED=true + HBX_AI_EXTRACTION_ENABLED=true no /root/HBX/backend/.env, com RECREATE do container (env_file não pega em restart — método docker inspect→dump dos -e→rm -f→run)
- D1 LOCAL (PENDENTE): no hbx-owner/local-agent setar HBX_PONTE_WORKER_ENABLED=on + HBX_OWNER_BACKEND_URL=https://api.hbxsystem.com.br (opc.: HBX_PONTE_MODEL, HBX_PONTE_ACTIVITY_FREIA_THRESHOLD, HBX_PONTE_UNLOAD_AFTER_IDLE_MS)
- D1 (PENDENTE): DESPAUSAR a fila — hoje status 'fila pausada (freio do dono)'; reiniciar o processo :3107 do dono (roda versão pré-E1/E2) pra ver o cockpit; 30B aquecido de manhã ANTES do 1º lease (obrigatório, lei anti-swap do T2)
- CHIP6 (JÁ EM PROD, registrar pra não perder): ollama systemd drop-in /etc/systemd/system/ollama.service.d/hbx.conf → OLLAMA_KEEP_ALIVE=-1, OLLAMA_NUM_PARALLEL=2, OLLAMA_CONTEXT_LENGTH=4096, OLLAMA_MAX_LOADED_MODELS=1, bind 172.18.0.1:11434 (NUNCA expor :11434)
- CHIP6 (JÁ EM PROD): VPS .env → HBX_LLM_CLASSIFIER_MODEL/HBX_AI_SANEAMENTO_MODEL/HBX_XRAY_AI_NOTE_MODEL=qwen3:4b-instruct, HBX_ASSISTENTE_TIMEOUT_MS=20000, HBX_LLM_CLASSIFIER_TIMEOUT_MS=20000, HBX_LLM_CLASSIFIER_ENABLED=true
- GOVERNOR: HBX_AI_GATEWAY_ENABLED default ON (bypass byte-idêntico quando OFF); tunáveis HBX_AI_GATEWAY_REALTIME_CONCURRENCY=2 / BATCH_CONCURRENCY=1 / REALTIME_MAX_QUEUE=8 / BATCH_MAX_QUEUE=64
- Saneamento segue OFF por decisão: HBX_RADAR_AI_SANEAMENTO_ENABLED / HBX_AI_SANEAMENTO_ENABLED
- Limpeza opcional VPS: modelos órfãos qwen2.5:7b + qwen2.5:3b (6,6GB, ollama rm) e backups do CHIP6 (/root/hbx.conf.bak-chip6, /root/backend.env.bak-chip6, /root/chip6-env.dump, /root/chip6/)
