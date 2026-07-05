# IA-VPS — Plano de testes 4b × 7b e ativação da IA na VPS (05/07/2026)

**Objetivo:** decidir com DADO qual modelo (qwen3:4b, qwen2.5:7b ou mix) sustenta as 3 promessas
do sistema — **BOT (com IA)**, **Assistente IA**, **Cards com IA** — rodando na VPS (15GB/4vCPU).
Teste é 100% LOCAL (localhost, Ollama :11434); a INJEÇÃO (envs+flags+ollama systemd) é na VPS, só
no chip final, depois da matriz preenchida.

## 1. Inventário — onde cada promessa vive (código real, master 05/07)

| Promessa | Serviço | Env do modelo (default) | Flag liga/desliga | Timeout | Params |
|---|---|---|---|---|---|
| BOT (com IA) | `bot/intent/ai-intent-classifier.service.ts` (+ `intent-engine.service.ts` envelopa e grava `IntentDecision`) | `HBX_LLM_CLASSIFIER_MODEL` (qwen2.5:7b) | `HBX_LLM_CLASSIFIER_ENABLED` (OFF) | `HBX_LLM_CLASSIFIER_TIMEOUT_MS` **9s** | temp 0.1, num_predict 80, format json, think:false |
| Assistente IA | `assistente/assistente-sandbox.service.ts` (WORM-14 — sandbox NUNCA toca chip; publish = `HBX_ASSISTENTE_PUBLISH_ENABLED` OFF, fora do escopo) | **MESMA** `HBX_LLM_CLASSIFIER_MODEL` | mesma `HBX_LLM_CLASSIFIER_ENABLED` | **12s** | temp 0.4, num_predict 220, think:false, texto livre |
| Cards com IA (nota+resumo) | `radar/cnpj-xray/cnpj-xray-ai-note.service.ts` | `HBX_XRAY_AI_NOTE_MODEL` (qwen2.5:7b) | `HBX_XRAY_AI_NOTE_ENABLED` (**default TRUE**) | 60s (teto do dono 1min/lead) | temp?, num_predict 150, num_ctx 4096 |
| Cards com IA (saneamento nome+segmento+nota) | `radar/03-enrichment/ai-saneamento.service.ts` | `HBX_AI_SANEAMENTO_MODEL` (qwen2.5:7b) | `HBX_RADAR_AI_SANEAMENTO_ENABLED` (fila pós-entrega, OFF) / `HBX_AI_SANEAMENTO_ENABLED` (worker) | — | — |
| (FORA da VPS) extração de contato | `ai-contact-extraction.service.ts` | `HBX_AI_EXTRACTION_MODEL` (qwen3:30b MoE) | `HBX_AI_EXTRACTION_ENABLED` (OFF) | 90s | 18,6GB **não cabe** nos 15GB → segue LOCAL (ponte híbrida) |

- URL única pra tudo: `HBX_LLM_CLASSIFIER_URL` (default `http://host.docker.internal:11434`).
  Na VPS vira `http://172.18.0.1:11434` (mesmo padrão do webwhats). **NUNCA expor :11434 pra fora.**
- ⚠️ **Bot e Assistente compartilham a env de modelo.** Se a matriz der vencedor DIFERENTE entre
  eles, precisa de env nova `HBX_ASSISTENTE_MODEL` (fallback pra classifier env) — mudança de ~5
  linhas no sandbox, prevista como contingência C1.

## 2. O que JÁ foi medido (não repetir às cegas)

- **Saneamento+nota (cards), 02/07, 12 bons + 8 lixo, sob contenção:** qwen3:4b CAMPEÃO
  (12/12 bons ≥7, 8/8 lixo ≤3, 0 inventado, 10,7s/lead, 2,5GB) × 7b baseline 17,4s/lead.
- **Classificador/ICP 7 modelos, 02/07, 20 leads gabaritados:** qwen2.5:7b campeã (nota 9,
  19/20, 23s/lead); qwen3:4b vice (16/20, 16s, **cold-load 158s**).
- **Extração de contato, 01–02/07:** 30B ganha, fica local. Fechado.

**Buracos que ESTE plano cobre:** (a) bot-intent com o prompt REAL do classificador nunca teve
4b×7b; (b) Assistente (chat livre PT-BR seguindo fluxo) nunca foi benchmarkado; (c) NADA foi
medido em rig que simule a VPS (4 vCPU) contra os timeouts reais de 9s/12s; (d) os 2 modelos
CONVIVENDO (mix) nunca foi testado.

## 3. Regras do jogo (valem pra todos os chips)

1. **Rig:** local (Ryzen 5500), Ollama :11434. Cada bateria roda em 2 modos:
   **livre** (baseline) e **VPS-sim** (`options.num_thread: 4` em toda chamada — simula 4 vCPU).
   O número que DECIDE é o VPS-sim; o smoke final na própria VPS confirma o fator.
2. **Prompt/params do serviço REAL** — o harness importa/replica VERBATIM o SYSTEM_PROMPT,
   temperature, num_predict, num_ctx, think:false e format de cada serviço. Bench com prompt
   "parecido" = lixo.
3. Mesmos inputs pros 2 modelos, mesma ordem, warm-up 1 chamada descartada antes de medir
   (cold-load à parte — vira métrica própria).
4. Resultado de cada chip = `docs/PLANEJAMENTOS/IA-VPS/RESULTADO-CHIP{N}.md` (tabela + CSV bruto
   no scratchpad). Chip NUNCA publica, NUNCA toca VPS (só o CHIP 6), NUNCA toca chip WhatsApp real.
5. Exemplos que estão DENTRO do system prompt ficam FORA do gabarito.

## 4. Gates eliminatórios (a "promessa" virada em número)

**BOT (com IA)** — errar aqui = risco de ban/loop:
- Recall de `REMOVER`/opt-out = **100%** (perder opt-out é o pior erro possível).
- Detecção de bot/URA ≥ **90%** (responder a URA = loop → máquina de ban).
- Falso-bot em humano ≤ 10% (silenciar lead quente custa venda).
- Acurácia geral dos 7 rótulos ≥ 85%; JSON válido ≥ 99%.
- Latência p95 ≤ **9s em VPS-sim** (timeout real). Se só o 7b estourar: registrar quanto
  custaria subir `HBX_LLM_CLASSIFIER_TIMEOUT_MS` (decisão do dono — resposta de bot em 15–20s
  ainda é humana).

**ASSISTENTE IA:**
- **0 alucinação dura** em ~30 turnos (inventar preço/serviço/promessa que não está no config).
- Rubric média ≥ 7/10 (aderência ao fluxo/persona, PT-BR natural, encerramento/handoff correto).
- p95 ≤ **12s em VPS-sim** (timeout real do sandbox).

**CARDS COM IA:**
- Lixo 8/8 com nota ≤3; 0 token inventado; JSON 100%; spread que RANQUEIA (não saturar 7–8).
- ≤ 60s/lead em VPS-sim (teto do dono).

## 5. Matriz de decisão (preencher no CHIP 6)

| Frente | Gate 4b | Gate 7b | p95 VPS-sim 4b | p95 7b | Vencedor |
|---|---|---|---|---|---|
| BOT | | | | | |
| Assistente | | | | | |
| Cards | | | | | |

**Regra de decisão:**
- 1 modelo passa TODOS os gates das 3 frentes → **single-model** (simplicidade operacional > mix).
- Vencedores divergem → **mix SÓ SE** o CHIP 5 provar: (a) RAM da VPS comporta os 2 residentes
  (~7,6GB; medir `free -m` real com PG+backend+webwhats vivos — se headroom < ~8GB, mix está
  MORTO por física, independente de qualidade); (b) alternância NÃO recarrega modelo a cada troca
  (`OLLAMA_MAX_LOADED_MODELS=2`, keep_alive) e o p95 do bot não estoura sob carga de cards.
- Nenhum modelo passa os gates do BOT → bot fica **keyword-fallback** (comportamento atual, flag
  OFF pra ele) e liga só o que passou (cards/assistente) — "não atende por enquanto" é resultado
  válido, o sistema degrada gracioso por construção.

## 6. Chips (dono dispara 1 por vez, testa entre eles)

- **CHIP 1 — Harness + gabaritos (fundação).** `scratchpad/bench-ia/`: runner Node que chama
  `/api/chat` com prompt/params VERBATIM dos 3 serviços, modo livre/VPS-sim, CSV por chamada
  (modelo, latência, raw, parse ok). Gabaritos: BOT ~60 msgs rotuladas (7 rótulos + URA/menu +
  gírias BR + armadilhas: "para", "para de mandar" ≠ "para quem?", protocolo, msg vazia de
  emoji) — puxar respostas reais anonimizadas do banco local se houver; ASSISTENTE 3 configs de
  fluxo (barbearia, distribuidora de água, contabilidade) × roteiro de ~10 turnos com armadilhas
  ("quanto custa?" sem preço no config, fora de escopo, cliente irritado, pede humano); CARDS
  reusa os 12 bons + 8 lixo do bench 02/07 (`bench-saneia-nota.js` é recriável) + 10 leads reais
  da base local pro prompt do xray-note.
- **CHIP 2 — BOT 4b×7b.** Gabarito do classificador nos 2 modelos × 2 modos. Métricas por rótulo
  + recall REMOVER + bot-detection + p50/p95 + JSON-rate + cold-load. Preenche linha BOT da matriz.
- **CHIP 3 — ASSISTENTE 4b×7b.** Conversas roteirizadas via pipeline do sandbox (mesmos params).
  Rubric 0–10 por transcript (aderência/alucinação/PT-BR/handoff) + transcripts anexados pro dono
  bater o olho. Preenche linha Assistente.
- **CHIP 4 — CARDS regressão + xray 4b×7b.** Confirma o campeão 4b no saneamento (regressão, prompt
  real) e roda o head-to-head que falta no prompt do `cnpj-xray-ai-note` (nota+resumo ≤140 chars).
  Preenche linha Cards.
- **CHIP 5 — MIX sob concorrência.** Os 2 modelos residentes juntos + chamadas intercaladas
  (bot chega no meio de lote de cards): RAM total, troca de modelo recarrega?, p95 do bot sob
  carga. + `ssh` na VPS SÓ PRA LER `free -m`/`docker stats` (headroom real). Veredito: mix é
  fisicamente viável ou não.
- **CHIP 6 — DECISÃO + INJEÇÃO VPS** (com o dono no loop — mexe em produção):
  1. Preencher matriz com os RESULTADO-CHIP*.md → decisão (single/mix/parcial).
  2. VPS: subir `ollama` como systemd (server já instalado 0.30.11, PARADO), bind interno
     (container→`172.18.0.1:11434`; conferir de fora que a porta NÃO responde),
     `OLLAMA_KEEP_ALIVE=-1` (cold-load de 158s NÃO pode comer a 1ª resposta do bot),
     `OLLAMA_MAX_LOADED_MODELS` conforme decisão; `ollama pull` do(s) modelo(s).
  3. Envs no `/root/HBX/backend/.env` (env-file REAL do backend): `HBX_LLM_CLASSIFIER_URL`,
     modelos por frente, `HBX_LLM_CLASSIFIER_ENABLED=true` + flags de cards conforme decisão.
     **RECREATE** do backend (env_file não pega em restart) pelo método `docker inspect` → dump
     dos `-e` vivos → `docker rm -f` + `docker run` (regra INFRA: recreate ingênuo perde os `-e`
     e quebra a frota).
  4. Smoke em prod: 1 mensagem no sandbox do Assistente, 1 card pelo xray, bot SÓ em número
     descartável (nunca chip do dono). Conferir `docker ps` Up + logs (build verde ≠ boot ok).
- **Contingência C1** (só se matriz exigir bot≠assistente): env `HBX_ASSISTENTE_MODEL` com
  fallback pra `HBX_LLM_CLASSIFIER_MODEL` no sandbox. ~5 linhas + teste.

## 7. Riscos nomeados

- **7b estourar 9s na VPS** é o cenário mais provável (23s/lead em rig FORTE) → o plano já mede
  e deixa o trade-off (subir timeout × ficar no 4b × keyword) pronto pra decisão, não pra surpresa.
- **RAM da VPS** decide o mix antes da qualidade: PG dos 28M + backend + webwhats já moram nos
  15GB. Headroom medido no CHIP 5, não chutado.
- **Cold-load 158s do 4b**: sem `OLLAMA_KEEP_ALIVE=-1`, a 1ª classificação do dia morre em timeout
  e o painel "IA ligada" vira mentira intermitente.
- **`HBX_XRAY_AI_NOTE_ENABLED` default TRUE**: ao ligar o Ollama na VPS, o xray passa a chamar IA
  imediatamente — a injeção do CHIP 6 deve setar o modelo CERTO antes, não depois.
