# IA Classificador de Intenção do Bot — continuação (VPS)

> Plano auto-contido pra retomar em chat novo. Objetivo: trocar a classificação por
> **palavra-chave** do bot de prospecção por **detecção via LLM local (Ollama)**, e
> deixar rodando bem no VPS. Editar código = subagente Sonnet (1 por .md); Opus planeja.

## Objetivo
Quando um lead responde no WhatsApp, classificar a **intenção** (interesse / o que é /
retorne depois / não incomode / remover / humano) e **detectar bot** (anti-loop "se for
robô, para"), com IA local em vez de keyword que "falha pakaraio". IA entende, o script
escrito do dono fala. Fallback keyword sempre presente.

## ESTADO ATUAL (feito)
**Código (commitado — Etapa 1+2a no commit `0ec8d3ac`; Etapa 2b/messaging publicando agora):**
- `backend/src/vendas/ai-intent-classifier.service.ts` — `AiIntentClassifierService`:
  - `classify()` chama Ollama (`/api/chat`, `think:false`, `format:json`, saída mínima
    `{remetente, intencao}`, timeout 9s). **Dormente** sem `HBX_LLM_CLASSIFIER_ENABLED=true`.
  - `classifyIntentWithFallback()` — orquestrador: IA → se off/timeout/erro/INDEFINIDO cai
    no keyword (`classifyProspectingIntent`). Bot detectado → `autoReply='bot_menu_detected'`.
  - **`SYSTEM_PROMPT` mora aqui** (é o que precisa melhorar — ver TODO a).
- `ai-intent-classifier.module.ts` — módulo leaf (sem ciclo).
- Plugado em **3 call-sites** (todos async, mesmo formato `{intent, autoReply}`):
  - `vendas-automation.service.ts` ~1874 (sandbox `/bot` `simulateProspectingForUser`)
  - `vendas-automation.service.ts` ~4407 (handler real `handleProspectingInboundReply`)
  - `messaging.service.ts` ~3016 (outro caminho de inbound)
- `prospecting-safety.ts` — `classifyProspectingIntent` ganhou tipo de retorno anotado.
- Testes ajustados (constructor +1 arg `AiIntentClassifierService`):
  `vendas-automation.service.test.ts` (36 verdes), `messaging.service.test.ts` (20 verdes).
- Typecheck backend: **0 erros**. Comando: `backend/node_modules/.bin/tsc.cmd -p backend/tsconfig.json --noEmit`.

**VPS (Hostinger, srv1642580):**
- Ollama instalado (systemd `ollama.service`, host, CPU-only). Override em
  `/etc/systemd/system/ollama.service.d/hbx.conf`: bind **`OLLAMA_HOST=172.18.0.1:11434`**
  (ponte interna `br-8aebe2ee14c6` — invisível pra internet, seguro), `OLLAMA_KEEP_ALIVE=5m`,
  `OLLAMA_MAX_LOADED_MODELS=1`, `OLLAMA_NUM_PARALLEL=1`.
- Modelo **`qwen2.5:3b`** baixado. Validado: intenção perfeita, ~3-5s quente (EPYC rápido).
- `/root/HBX/backend/.env` recebeu: `HBX_LLM_CLASSIFIER_ENABLED=true`,
  `HBX_LLM_CLASSIFIER_URL=http://172.18.0.1:11434`, `HBX_LLM_CLASSIFIER_MODEL=qwen2.5:3b`.
- **Ativa no recreate do `hbx-backend`** (o publish que o dono está rodando agora faz isso).

## DECISÃO (análise — não repetir o erro)
**NÃO subir o `qwen3:30b-a3b` (modelo pesado do localhost) no VPS.** Motivo = RAM, não CPU:
- VPS tem **15GB total / ~11GB livre**. O 30B-A3B precisa de **~18GB residentes** → **não cabe**
  → swap → OOM-killer mata backend/motor → **derruba a operação ao vivo**.
- `think=false` corta **compute** (tokens), NÃO corta **RAM** (peso do modelo fica todo na
  memória). Por isso "ficou mais leve/rápido" no PC do dono (32GB, cabe) mas **não cabe no VPS**.
- EPYC mais rápido por núcleo melhora VELOCIDADE, não muda o teto de RAM.

**Escolha certa pro VPS = `qwen2.5:7b`** (~5GB, cabe com folga, **detecta bot** — validado,
o 3b não detecta —, rápido no EPYC ~5-9s quente). 14b (~9GB) = no limite, arriscado nos picos
do motor. 30b = fora. (Num VPS de 32GB+ aí sim caberia o 30b com reasoning-off.)

## TODO (próximos passos, em ordem)
- **a) Melhorar `SYSTEM_PROMPT` (bot detection)** em `ai-intent-classifier.service.ts`:
  instrução explícita → `remetente=bot` se menu numerado / "digite 1 / tecle / selecione
  opção" / lista de opções / saudação robótica de empresa. (O prompt atual é genérico; por
  isso o 3b erra bot.) Manter saída mínima `{remetente, intencao}`. **Nota:** o modelo às vezes
  devolve `remetente` em MAIÚSCULA ("HUMANO"/"INDEFINIDO"); o código já faz `.toLowerCase()` e
  só `=== 'bot'` dispara o freio — garantir que bot real volte `"bot"`.
- **b) Pull do 7b no VPS:** `systemd-run --unit=ollama-pull7 --setenv=HOME=/root
  --setenv=OLLAMA_HOST=172.18.0.1:11434 /usr/local/bin/ollama pull qwen2.5:7b` (pull longo =
  systemd-run, sobrevive ao SSH; pollar com `systemctl is-active ollama-pull7`).
- **c) Trocar env:** `HBX_LLM_CLASSIFIER_MODEL=qwen2.5:7b` em `/root/HBX/backend/.env`
  (`sed -i '/^HBX_LLM_CLASSIFIER_MODEL/d' ... ; echo '...' >> ...`).
- **d) Deploy:** o dono roda `npm run publish` (recria `hbx-backend` carregando env + novo
  prompt). **NÃO** recriar `hbx-backend` na mão (é órfão, sem labels compose — ver gotcha).
- **e) Validar ao vivo + vigiar carga:** 7b pega o bot menu; medir tok/s e **RAM/load do VPS**
  no 1º classificador ao vivo. Se a carga estourar → `HBX_LLM_CLASSIFIER_ENABLED=false` na hora
  (env desliga instantâneo, fallback keyword assume).
- **f) (opcional) Etapa 3 frontend:** no `/bot`, peça "Palavras-chave" vira "Detecção por IA"
  (toggle); palavras viram reforço/fallback opcional. Arquivos: `frontend/src/lib/use-prospecting-config.ts`,
  `frontend/src/components/hbx/bot-prospeccao-*.tsx`.

## GOTCHAS (custaram tempo — não repetir)
- **VPS access:** `node scripts/vps-run.js "<cmd>"` (creds `.env.ops-control`). Comando longo/
  multilinha: PowerShell here-string LITERAL + strip CR + stdin →
  `@'...bash...'@ -replace "` + "`r" + `","" | node scripts/vps-run.js --stdin`.
  (PowerShell mastiga `$(...)`/aspas; o here-string `@'...'@` é literal.)
- **`jq` NÃO existe no VPS.** Pra ler `.message.content`, imprimir raw e ler na mão, ou instalar.
- **Compose = docker-compose v1** (`docker-compose`, hífen). `docker compose` (v2) NÃO existe.
- **Container backend = `hbx-backend`**, criado por `docker run` direto, **SEM labels de compose**.
  `docker-compose up --force-recreate backend` criaria um "backend" NOVO conflitando no :3000 →
  caos. **Só o `npm run publish` recria ele certo.** Env_file só é lido no recreate.
- **Ollama CLI no VPS** precisa de `HOME=/root` e `OLLAMA_HOST=172.18.0.1:11434` no ambiente
  (a unit transiente não tem HOME → panic "$HOME is not defined").
- **qwen2.5 NÃO é reasoning** (o reasoning era qwen3). Mesmo assim mandamos `think:false` sempre.
  Se um dia usar qwen3: `think:false` é PARÂMETRO da API (o `/no_think` no prompt não basta).
- VPS: 4 vCPU **EPYC 9354P** (AVX-512, rápido por núcleo), **15GB RAM**, sem GPU.

## Sanidade pra fechar cada etapa
1. Typecheck backend (0 erros). 2. Testes: `npm --prefix backend run build` + `node --test
backend/dist/vendas/vendas-automation.service.test.js` e `.../messaging/messaging.service.test.js`.
3. No VPS: `docker exec hbx-backend node -e "fetch('http://172.18.0.1:11434/api/tags')..."`
para provar que o container alcança o Ollama. 4. Flag desliga tudo na hora se preciso.
