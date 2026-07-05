# RESULTADO CHIP 6 — DECISÃO + INJEÇÃO NA VPS (05/07/2026)

**Status: CONCLUÍDO — IA em PRODUÇÃO no modelo único `qwen3:4b-instruct`.** Dono no loop nas 3
escolhas abertas; injeção via `scripts/vps-run.js` (autorizada); smoke com prompts VERBATIM rodado
DENTRO do `hbx-backend` (mesma rede/env dos serviços reais). WhatsApp não tocado (webwhats.service
`active` o tempo todo, nenhum chip mexido). Commit local; **NADA publicado** (2 regras do prompt do
assistente aguardam publish — ver Pendências).

## Escolhas do dono (registradas no chat deste chip)

| Escolha | Decisão | Consequência |
|---|---|---|
| (a) XRAY | **[1] nota no 4b-instruct degradado** | `HBX_XRAY_AI_NOTE_MODEL=qwen3:4b-instruct`; flag segue default TRUE; banda média do ranking mente (aceito; reversível por env → 7b noturno) |
| (b) ASSISTENTE | **[2] ajuste fino antes** | `HBX_ASSISTENTE_TIMEOUT_MS=20000` (env JÁ VALE — C1 publicada) + 2 regras no `compileSystemPrompt` (commit `8681dbea`, **pendente publish**) |
| (extra, item 8) Timeout do bot | **20000 ms** | `HBX_LLM_CLASSIFIER_TIMEOUT_MS=20000` (era default 9000) — calibrado com a latência REAL do smoke (re-eval frio 18,6s) |

## Achados do "antes" que mudam o registro

1. **A IA do bot JÁ ESTAVA LIGADA em prod** com `qwen2.5:7b` (`.env` linhas 96–98:
   `ENABLED=true`, URL ok, `MODEL=qwen2.5:7b`) — ou seja, prod rodava o modelo que **perde
   opt-out** (CHIP 2). A injeção deste chip foi CORREÇÃO de risco vivo, não estreia.
2. **`/api/tags` NÃO estava vazio** (CHIP 5 anotou vazio): `qwen2.5:7b` (4,7GB) e `qwen2.5:3b`
   (1,9GB) puxados desde 30/06 — em DISCO, nada residente (KEEP_ALIVE=5m + sem tráfego).

## O que foi injetado (antes → depois)

### Drop-in `/etc/systemd/system/ollama.service.d/hbx.conf` (backup: `/root/hbx.conf.bak-chip6`)

| Chave | Antes | Depois | Por quê |
|---|---|---|---|
| OLLAMA_HOST | 172.18.0.1:11434 | (igual) | bind interno mantido |
| OLLAMA_KEEP_ALIVE | 5m | **-1** | cold-load REAL 51,5s ≫ 9s — modelo nunca descarrega |
| OLLAMA_MAX_LOADED_MODELS | 1 | (igual) | single-model |
| OLLAMA_NUM_PARALLEL | 1 | **2** | bot não fica atrás do xray (validado no smoke: overlap 3,9s) |
| OLLAMA_CONTEXT_LENGTH | (ausente = 32K) | **4096** | bot/saneamento não fixam num_ctx no código; sem isso o 4b residente vira 7,2GB à toa |

`systemctl daemon-reload && restart` ok; envs confirmadas vivas no processo.

### Segurança (regra "NUNCA expor :11434")

`curl` de FORA (minha máquina → IP público:11434) = **timeout/HTTP 000** ✅ porta fechada.
O GET externo do CHIP 5 não é porta aberta; seguiu-se com o pull.

### Modelo

`ollama pull qwen3:4b-instruct` (2,5GB). **7b e thinking NÃO puxados** (7b já estava em disco de
30/06 — órfão, sem env apontando pra ele; ver Pendências).

### Envs `/root/HBX/backend/.env` (backup: `/root/backend.env.bak-chip6`)

| Env | Antes | Depois |
|---|---|---|
| HBX_LLM_CLASSIFIER_ENABLED | true (já estava) | true |
| HBX_LLM_CLASSIFIER_URL | http://172.18.0.1:11434 (já estava) | (igual) |
| HBX_LLM_CLASSIFIER_MODEL | **qwen2.5:7b** | **qwen3:4b-instruct** |
| HBX_AI_SANEAMENTO_MODEL | (ausente → default 7b) | qwen3:4b-instruct |
| HBX_XRAY_AI_NOTE_MODEL | (ausente → default 7b) | qwen3:4b-instruct |
| HBX_ASSISTENTE_TIMEOUT_MS | (ausente → 12000) | 20000 |
| HBX_LLM_CLASSIFIER_TIMEOUT_MS | (ausente → 9000) | 20000 |

Flags NÃO tocadas: `HBX_XRAY_AI_NOTE_ENABLED` (default TRUE, modelo certo setado ANTES do boot),
saneamento (`HBX_RADAR_AI_SANEAMENTO_ENABLED`/`HBX_AI_SANEAMENTO_ENABLED`) seguem OFF.

### Recreate do backend (2×: envs + depois timeout do bot)

Método INFRA anti-"recreate ingênuo": dump das **110 envs vivas** (`docker inspect .Config.Env` →
`/root/chip6-env.dump`, preserva os `-e` da frota: HBX_ENGINE_URLS, capacity etc.) + override das
envs de IA no dump → `docker stop && rm` → `docker run` com mesma rede (`hbx_net`), porta
(3000:3000), binds (docker.sock, /usr/bin/docker, uploads) e `--env-file /root/chip6-env.dump`.
`.env` REAL também editado → **próximo publish (release.js usa `--env-file backend/.env`) preserva
tudo**; o dump vale só pro container atual.

### Verificação (build verde ≠ boot ok)

- `docker ps`: frota inteira Up; backend "Nest application successfully started"; único ERROR =
  WebsiteService secrets (degradação graciosa conhecida, pré-existente).
- 7 envs de IA vivas no container (`docker exec env`) ✅.
- `webwhats.service` active, intocado; engines re-esquentados pelo manager do backend (normal).
- `ollama ps`: `qwen3:4b-instruct` residente **3.877 MB** (2 slots × 4096 do NUM_PARALLEL=2;
  local @4096/1 slot era 3.036 MB), expiração "2318" (= keep-alive infinito).
- RAM depois: `available` 10,4GB (era 13,9GB); PG cedeu só ~2,5GB de page-cache — sobra saudável.

## Smoke (prompts VERBATIM, rodado dentro do hbx-backend)

**BOT — 6/6 acertos**, incluindo `rem-07` ("PARA. nao quero receber isso" → REMOVER, o caso que o
7b que estava em prod PERDIA) e URA → bot/INDEFINIDO:

| Caso | Latência | Resultado |
|---|---|---|
| int-02 | **18.628 ms** ⚠️ | ✓ INTERESSE — 1ª chamada paga prompt-eval (cache frio; load 210ms = sem reload) |
| oqs-07 | 3.797 ms | ✓ O_QUE_SERIA (o 7b silenciava esse lead quente como "bot") |
| nao-03 | 4.832 ms | ✓ NAO_INCOMODE |
| rem-01 / rem-07 | 2.422 / 2.524 ms | ✓✓ REMOVER |
| bot-01 (URA) | 3.664 ms | ✓ bot/INDEFINIDO |

**XRAY** — notas IDÊNTICAS ao bench local (temp 0): xr-01 alta→**95** (10,8s), xr-03 baixa→**20**
(6,0s), resumos 109/93 chars ≤140. **ASSISTENTE** (pipeline sandbox): t2 15,3s (estouraria os 12s
antigos; passa nos 20s novos — escolha (b) validada no ato), t3 4,9s; t3 chamou "barbeiro" quando
pediram o DONO — categoria que as 2 regras novas atacam (pendente publish). **OVERLAP** (o medo do
CHIP 5): bot disparado 1s depois de um card respondeu em **3.891 ms < 9s** ✅ com card em 6,8s —
`NUM_PARALLEL=2` desacoplou card↔bot no cenário 1-card.

### Fator de correção VPS real × bench local (VPS-sim nt=4)

| Métrica | Bench local | VPS real | Fator |
|---|---|---|---|
| BOT quente p50 | 4.572 ms | ~2.400–4.800 ms | **~0,7–1,0×** (VPS ociosa ≈ rig com contenção) |
| XRAY/lead | p95 10,6s | 6,0–10,8s | ~1,0× |
| Assistente turno longo | p95 17,8s | 15,3s | ~0,9× |
| Cold-load | 26,6s | **51,5s** | **1,9×** (disco da VPS) |
| Prompt-eval frio (novo dado) | — | 18,6s | motivo do timeout 20s |

## Pendências

1. **Publish das 2 regras do assistente** — commit local `8681dbea`
   (`compileSystemPrompt`: nunca confirmar agenda; nunca afirmar/negar política de pagamento).
   Só com ordem do dono (`npm run publish`). Até lá o sandbox roda o prompt antigo.
2. **Bot ponta-a-ponta em número descartável** — a classificação foi smoked com prompt verbatim
   por dentro do container (mesmo caminho de rede), mas NÃO houve mensagem WhatsApp real (sem
   número descartável disponível neste chip; jamais no chip do dono).
3. **Disco: `qwen2.5:7b` + `qwen2.5:3b` órfãos** (6,6GB, puxados 30/06, nenhuma env aponta pra
   eles) — `ollama rm` se o dono quiser liberar; o 7b também é o plano-B do xray noturno, então
   manter não custa RAM (só disco).
4. **Xray degradado assumido** — banda média mente (MEI-zap 80/85 > EPP 70; SUSPENSA 10 <
   BAIXADA 20). Se incomodar no Radar, o caminho é `HBX_XRAY_AI_NOTE_MODEL=qwen2.5:7b` em janela
   noturna sem bot (decisão futura, zero código).
5. Artefatos na VPS: backups `/root/hbx.conf.bak-chip6`, `/root/backend.env.bak-chip6`,
   `/root/chip6-env.dump` (env-file do container ATUAL — não apagar enquanto este container
   viver), `/root/chip6/` (harness do smoke). Limpar após o próximo publish, se quiser.

## Matriz final (§5 do PLANO — fechada)

| Frente | Vencedor | Em prod |
|---|---|---|
| BOT | qwen3:4b-instruct (6/6 gates — único do bench) | ✅ ligado |
| Assistente | qwen3:4b-instruct (rubric 7,3; timeout 20s) | ✅ sandbox ligado; prompt novo pendente de publish |
| Cards saneamento | qwen3:4b-instruct | env pronta; flags de fila seguem OFF |
| Cards xray | 7b era o honesto → dono aceitou 4b-instruct degradado | ✅ ligado (nota+resumo IA no ar) |
| Mix 2 modelos | **MORTO** (CPU 4 vCPU + RAM — CHIP 5) | não aplicado |
