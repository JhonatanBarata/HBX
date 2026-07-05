# RESULTADO CHIP 5 — MIX sob concorrência + headroom real da VPS (05/07/2026)

**Status: CONCLUÍDO.** Os 2 modelos do mix (matriz final: `qwen3:4b-instruct` = BOT+saneamento,
`qwen2.5:7b` = xray) rodados RESIDENTES juntos no Ollama local com carga intercalada (VPS-sim
`num_thread=4` + bracket pessimista `nt=2`), + leitura SOMENTE-LEITURA da VPS (`free`,
`docker stats`, `systemctl status ollama`, bind do ollama). Nada publicado, NENHUMA escrita na VPS,
WhatsApp não tocado, sem branch nova.

> ⚠️ Correção de rota: o `mix-runner` herdado da sessão anterior apontava `qwen3:4b` (thinking).
> A matriz final (RESULTADO-EXTRA-4B-INSTRUCT) tirou o thinking do mapa — corrigido pra
> `qwen3:4b-instruct` antes de rodar (é o modelo que a VPS vai puxar de fato).

## TL;DR — o veredito

**O MIX ESTÁ MORTO — mas o assassino é a CPU (4 vCPU), não (só) a RAM.** Dois freios independentes,
qualquer um dos dois já mata:

1. **CPU (mata incondicionalmente):** com os 2 modelos residentes, quando o BOT chega no meio de um
   lote de cards, o **p95 do BOT explode de 6,8s (parado) pra 31s (3,4× o gate de 9s), 14/16
   classificações estouram**. E não é artefato de reload: casos com `load≈300–550ms` deram 17–21s
   de contenção pura de CPU. O processamento de cards **estrangula** o classificador de gate apertado.
   Isso INDEPENDE de RAM — fixar contexto pra caber não corrige contenção de CPU.
2. **RAM (mata a menos que se pague um preço):** como está codado hoje (o bot NÃO fixa `num_ctx` →
   herda o default 32K do Ollama), os 2 residentes pesam **11,8GB**, não os "7,6GB" que o plano
   assumiu (aquilo era soma de DISCO; o footprint em RAM inclui o KV cache). A VPS tem `MemAvailable`
   13,9GB, mas 13GB disso é page-cache do Postgres/RFB — encher com modelo **evicta o cache do PG**.
   Só cabe com folga se fixar o contexto em 4096 (residentes caem pra 7,7GB) E aceitar o PG perder cache.

**Single-model que CABE: `qwen3:4b-instruct`** (3,0GB @4096 / 7,2GB @32K) — cabe na RAM com sobra,
segura BOT (6/6 gates) + saneamento + assistente em qualidade cheia, e xray degradado-mas-funcional
(banda média mente, mas resumos válidos — RESULTADO-EXTRA). É o caminho recomendado.

**Bônus achado na VPS:** o `ollama.service` já está ATIVO (não "parado" como o plano §6 dizia) e a
config atual é **hostil ao mix**: `OLLAMA_MAX_LOADED_MODELS=1` (troca de modelo recarregaria a CADA
switch) e `OLLAMA_KEEP_ALIVE=5m` (o plano quer `-1`). Zero modelo puxado ainda.

## Parte 1 — teste local do mix (Ryzen 5500, Ollama 0.31.1, CPU-only)

### (c) RAM dos 2 residentes — a curva footprint × contexto (o dado que decide)

O `size` do `/api/ps` é o footprint REAL em RAM (pesos + KV cache + buffers), NÃO o tamanho em disco.
Medido carregando cada modelo isolado em vários `num_ctx` (keep_alive -1):

| num_ctx | qwen3:4b-instruct | qwen2.5:7b |
|---|---|---|
| 2048 | 2.746 MB | 4.714 MB |
| 4096 | 3.036 MB | 4.828 MB |
| 8192 | 3.705 MB | 5.203 MB |
| **32768 (default do Ollama 0.31)** | **7.209 MB** | 6.595 MB |

O KV cache de 32K é o que infla — e infla MAIS o 4b (qwen3:4b tem mais camadas que o qwen2.5:7b, por
isso o 4b residente a 32K > 7b residente a 32K, apesar de menos parâmetros).

**Pares residentes (o número do veredito de RAM):**

| Cenário | 4b-instruct | 7b | Soma | Nota |
|---|---|---|---|---|
| **prod-como-codada** (bot herda 32K + xray fixa 4096) | 7.209 (32K) | 4.828 (4096) | **12.037 MB ≈ 11,8 GB** | confirmado AO VIVO no bench (`ps:end`) |
| otimizado 4096 (ambos fixam 4096) | 3.036 | 4.828 | **7.864 MB ≈ 7,7 GB** | só assim bate os "7,6GB" do plano |
| otimizado 2048 | 2.746 | 4.714 | 7.460 MB ≈ 7,3 GB | contexto mínimo viável |
| default (ambos 32K) | 7.209 | 6.595 | 13.804 MB ≈ 13,5 GB | pior caso |

→ **A alavanca é fixar o contexto.** O xray já fixa 4096 no código; o **bot e o saneamento NÃO
fixam `num_ctx`** → herdam 32K → sozinhos o 4b vira 7,2GB. Sem pinar contexto, o mix pesa 11,8GB.

### (a) A alternância recarrega o modelo?

| Fase | Reloads | Leitura |
|---|---|---|
| ALT (alternância estrita 4b↔7b, 6 pares, sem concorrência) | **0/12** | com os 2 residentes, trocar de modelo NÃO recarrega (`load` 191–267ms = só prompt-eval) |
| SOLO (10 bots, cards parados) | 0/10 | limpo |
| **MIX (bot chega no meio do lote de cards, lanes concorrentes)** | **10/29** | sob concorrência o escalonador do Ollama evicta/recarrega (spikes de `load` até 6s) |

- **Sem concorrência, a coexistência é estável** (o que o `OLLAMA_MAX_LOADED_MODELS=2` garante).
- **Sob concorrência real, começam os reloads** (~34% das chamadas da fase MIX). Na VPS isso é PIOR:
  hoje `MAX_LOADED_MODELS=1` recarrega a CADA troca por config; mesmo setando 2, a RAM apertada da VPS
  (free puro 1,3GB) torna a eviction mais provável que no meu rig com folga.

### (b) p95 do BOT sob carga de cards vs gate de 9s

| Recorte | n | p50 | p95 | max | >9s | reloads |
|---|---|---|---|---|---|---|
| bot_solo (cards parados) | 10 | 6.085 | **6.809** ✅ | 6.809 | 0/10 | 0 |
| bot_alt (alternância estrita) | 6 | 4.950 | **6.516** ✅ | 6.516 | 0/6 | 0 |
| **bot_mix (bot no meio dos cards)** | 16 | 13.883 | **31.045** ❌ | 31.045 | **14/16** | 5 |
| xray_alt | 6 | 15.573 | 20.543 | 20.543 | (gate 60s: ok) | 0 |
| xray_mix (sob carga) | 7 | 26.242 | 41.227 | 41.227 | (gate 60s: **ok**, max<60s) | 3 |
| saneia_mix | 7 | 18.108 | 28.743 | 28.743 | (gate 20s: estoura, mas é fila off) | 2 |

*(nt=4 = VPS-sim, regra 1 do plano. Bracket pessimista nt=2 abaixo.)*

**Leitura:**
- **O BOT parado passa folgado (6,8s < 9s). Sob carga de cards, morre: p95 31s, 14 de 16 estouram.**
  Descontando os reloads, os bots ainda dão 17–21s por contenção pura (`nao-02/04/06/08` com load ~0,4s).
- **O xray SOBREVIVE à contenção** (max 41s < gate de 60s): o orçamento largo absorve. O problema é
  exclusivamente o gate apertado de 9s do BOT. **O mix acopla Radar↔WhatsApp: todo lote de cards
  cega o classificador do bot.**
- ⚠️ **nt=4 no meu rig SUBESTIMA a VPS.** Minha máquina tem 12 threads → 2 chamadas × 4 threads (8) cabem;
  a VPS tem 4 cores → o mesmo overlap oversubscreve 2:1. O p95 real do bot-sob-carga na VPS é **≥ 31s**.

<!-- BRACKET-NT2 -->

## Parte 2 — VPS, SOMENTE LEITURA (headroom real com tudo vivo)

`node scripts/vps-run.js` (autorizado; nada instalado/subido/alterado). VPS = **4 vCPU / 16GB**,
`load average 0.28` (ociosa), up 22 dias.

**`free -m`:**
```
              total   used   free  shared  buff/cache  available
Mem:          15988   1590   1311     147       13086      13911
Swap:          4095     80   4015
```
- **`MemAvailable` = 13.911 MB ≈ 13,6 GB** — o que o kernel entrega sem swap, MAS reclamando os
  ~13GB de `buff/cache` (majoritariamente page-cache do Postgres da base RFB de 28M).
- **`free` puro (sem evictar nada) = 1.311 MB.** Encher com modelo → o PG perde cache → consultas
  RFB/Radar vão mais ao disco. Não é almoço grátis.
- swap 4GB, só 80MB usados, swappiness 60.

**`docker stats` (uso real dos containers):**

| Container | Mem | | Container | Mem |
|---|---|---|---|---|
| hbx-postgres | **2,31 GiB** | | 8× hbx-engine | ~45–87 MB cada (~640 MB) |
| hbx-backend | 270 MB | | hbx-scraping-engine | 50 MB |
| hbx-frontend | 102 MB | | webscraping | 50 MB |

Total containers ≈ **3,4 GB reais**. Tudo `Up`.

**`ollama.service` (achado que muda o CHIP 6):** ATIVO desde 30/06 (não "parado"), idle 17MB,
bind confirmado no `ss` em `172.18.0.1:11434` (interno — NÃO exposto). Drop-in
`/etc/systemd/system/ollama.service.d/hbx.conf`:
```
OLLAMA_HOST=172.18.0.1:11434
OLLAMA_KEEP_ALIVE=5m            ← plano quer -1 (cold-load 60–90s não pode comer a 1ª resposta)
OLLAMA_MAX_LOADED_MODELS=1      ← MATA o mix por config: recarrega a cada troca de modelo
OLLAMA_NUM_PARALLEL=1
```
`/api/tags` = **vazio** (nenhum modelo puxado — pull é CHIP 6, ok). ⚠️ Nos logs, 1 `GET /api/tags`
de IP externo (187.77.47.18) às 17:49 — o bind é interno, então provável DNAT/port-forward do dono;
vale o CHIP 6 conferir que a porta não responde de fora antes de puxar modelo (regra "NUNCA expor :11434").

## Veredito (régua do plano §5: mix viável se headroom ≥ residentes + folga ~2GB)

Headroom = `MemAvailable` 13,9GB (com o custo de evictar cache do PG):

| Cenário do mix | Residentes | + folga 2GB | Cabe em 13,9GB? | Preço |
|---|---|---|---|---|
| prod-como-codada (bot 32K) | 11,8 GB | 13,8 GB | por **0,1GB** (= sem margem) | evicta ~TODO o cache do PG → swap sob pico |
| pinado 4096 | 7,7 GB | 9,7 GB | **sim, +4,2GB** | PG cai de 13GB de cache p/ ~5–6GB (degrada, não quebra) |

- **Pela RAM SOZINHA:** o mix pinado a 4096 é *sobrevivível* (cabe com folga), pagando o cache do PG.
  A versão como-está (32K) NÃO passa a régua (margem de 0,1GB é ruído).
- **Mas a CPU mata os dois:** bot p95 sob carga = 31s (VPS ≥ isso) vs gate 9s. **4 vCPU não servem
  bot + cards ao mesmo tempo.** Pinar contexto resolve RAM, não resolve CPU.

→ **MIX = NÃO VIÁVEL.** Não por um número de RAM isolado, e sim porque (1) na melhor hipótese de RAM
ele ainda estrangula o BOT na CPU, e (2) a hipótese de RAM "fácil" (11,8GB) não existe sem sacrificar
o Postgres. Somado: dois modelos brigando por 4 cores é caro em RAM E letal em latência.

### O que cabe: single-model = `qwen3:4b-instruct`

| | RAM residente | Gates que segura | CPU |
|---|---|---|---|
| **qwen3:4b-instruct** | 3,0GB @4096 / 7,2GB @32K | BOT 6/6 + saneamento + assistente (melhor candidato) + xray degradado-funcional | 1 só modelo: sem thrash de reload, metade da RAM |

- Cabe na `MemAvailable` com MUITA sobra; @4096 quase não toca o cache do PG.
- **Ressalva honesta:** mesmo single, se xray e bot rodarem no MESMO modelo ao mesmo tempo, o bot
  ainda espera atrás do xray (NUM_PARALLEL=1) → pode estourar 9s sob lote. Mas sem os 2 pesos na RAM
  e sem reload cross-model, dá pra mitigar: (a) `OLLAMA_NUM_PARALLEL≥2` (batching contínuo no runner
  único) e medir, ou (b) throttlar/enfileirar o enriquecimento de cards pra ceder a vez ao bot. Isso
  é decisão de arquitetura do CHIP 6, não bloqueio de física.
- Xray no 4b-instruct: banda média mente (RESULTADO-EXTRA), mas resumos válidos e 8/10 notas distintas
  — reserva aceitável. Se o dono priorizar ranking do xray, a alternativa é **rodar xray fora do
  horário do bot** (fila noturna), não coabitar na RAM.

## Consequência pro CHIP 6

1. **Não fazer o mix 2-residentes.** Puxar SÓ `qwen3:4b-instruct` (não puxar 7b nem o thinking).
2. **Ajustar o drop-in do ollama** (recreate do service, não do container): `OLLAMA_KEEP_ALIVE=-1`,
   `OLLAMA_MAX_LOADED_MODELS=1` pode ficar (single-model), avaliar `OLLAMA_NUM_PARALLEL=2`.
3. **Pinar contexto do bot/saneamento** (`num_ctx` no serviço OU `OLLAMA_CONTEXT_LENGTH=4096` no
   drop-in) — senão o 4b sozinho já sobe pra 7,2GB à toa (KV cache de 32K pra classificar 80 tokens).
4. **Envs de modelo** (matriz EXTRA, agora com xray no 4b): `HBX_LLM_CLASSIFIER_MODEL=qwen3:4b-instruct`,
   `HBX_AI_SANEAMENTO_MODEL=qwen3:4b-instruct`, `HBX_XRAY_AI_NOTE_MODEL=qwen3:4b-instruct` (não 7b —
   o mix morreu). Se o dono NÃO abrir mão do ranking do xray: manter `qwen2.5:7b` só pro xray e rodar
   em janela sem bot (fila), aceitando o cold-load de troca.
5. **Conferir a exposição da :11434** (o GET externo) antes de puxar modelo.

## Onde está o dado bruto (scratchpad desta sessão)

```
scratchpad/bench-ia/mix-runner.mjs                 (runner do mix, corrigido p/ 4b-instruct)
scratchpad/bench-ia/results/mix-nt4.csv|.jsonl     (52 chamadas + ps snapshots — run VPS-sim)
scratchpad/bench-ia/results/mix-nt2.csv|.jsonl     (bracket pessimista)
scratchpad/bench-ia/run-chip5-nt4.log / -nt2.log   (stdout dos runs)
/tmp/ctx-probe.mjs                                 (curva footprint × num_ctx)
```
⚠️ Scratchpad é de sessão — este doc carrega os números que a decisão precisa.
Colunas CSV: `ts_start,phase,lane,model,caso,latency_ms,load_ms,reloaded,parse_ok,overlap_other_model_ms,raw`.

## Desvios do pedido (com causa)

- O plano/tarefa dizia "os 2 residentes ≈ 7,6GB" — medição AO VIVO corrige pra **11,8GB como-codado**
  (o 7,6GB era soma de disco; o footprint em RAM inclui KV cache). O 7,6GB só existe pinando contexto.
- Modelo do 4b: usei `qwen3:4b-instruct` (matriz final), não o `qwen3:4b` (thinking) que o runner
  herdado apontava — o thinking saiu do mapa no RESULTADO-EXTRA.
- VPS: só leitura. Achei config do ollama.service que muda a injeção do CHIP 6 (registrado acima),
  mas NÃO alterei nada — mexer nisso é CHIP 6.
