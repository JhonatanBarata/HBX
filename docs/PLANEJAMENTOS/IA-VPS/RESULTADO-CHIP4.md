# RESULTADO CHIP 4 — CARDS: regressão saneamento + head-to-head xray 4b×7b (05/07/2026)

**Status: CONCLUÍDO.** 2 modelos × 2 modos × 2 suites (saneamento 12 bons + 8 lixo; xray-note
10 leads), prompts/params VERBATIM dos serviços reais, harness do CHIP 1. Nada publicado, VPS
não tocada, WhatsApp não tocado.

**Veredito em 1 linha: Cards DIVIDE — saneamento é do 4b (7b reprova no gate de lixo, de novo),
xray-note é do 7b (4b reprova no ranking da banda média).** As envs já são separadas
(`HBX_AI_SANEAMENTO_MODEL` × `HBX_XRAY_AI_NOTE_MODEL`), então honrar os dois vencedores não
pede código novo — pede o mix do CHIP 5 (2 modelos residentes na RAM da VPS).

## Linha Cards da matriz (PLANO §5)

| Frente | Gate 4b | Gate 7b | p95 VPS-sim 4b | p95 7b | Vencedor |
|---|---|---|---|---|---|
| Cards | saneia ✅ TODOS (12/12, 8/8, JSON 100%) · xray ❌ spread (média polariza 85/0) + resumo >140 em 2-3/10 | saneia ❌ lixo 7/8 ("Servicos de Encanador" nota 7, reprodutível) · xray ✅ TODOS (ranqueia, ≤140, JSON 100%) | saneia ~15s* / xray 34,8s | saneia 22,7s / xray 19,5s | **DIVIDIDO: saneia=4b, xray=7b** |

\* janela sem contenção externa; sob pico de contenção da máquina local chegou a 164s (ver Latência).

## 1. Saneamento (regressão do campeão 02/07) — prompt real `saneiaComNota()`

| Métrica (gate) | qwen3:4b | qwen2.5:7b |
|---|---|---|
| Bons ≥7 (12/12) | **12/12 ✓** nos 2 modos | 12/12 ✓ nos 2 modos |
| Lixo ≤3 (8/8) | **8/8 ✓** nos 2 modos | **7/8 ✗ nos 2 modos** — lixo-01 "Servicos de Encanador" nota **7** ("nome comercial claro") |
| JSON válido (100%) | 40/40 ✓ | 40/40 ✓ |
| Token inventado (0) | 1 distorção: "MARMORARIA…" → "**Marmoria**" (typo do modelo, não dado novo) | 2 distorções: "doTonho" (espaço comido, só livre); lixo-05 vazou "Local: Recife/PE" pro nome_limpo; bom-12 devolveu o nome CRU com LTDA (não limpou) |
| Notas bons (distribuição) | 7×9, 8×8, 1×7 — separa 7–9 | 12×9/8 — ok |
| Notas lixo | 1,1,1,1,1,1,1,2–3 | 7,1,1,1,1,1,1,1 |

**Regressão CONFIRMADA: o 4b segue campeão do saneamento e o furo do 7b de 02/07 é
reprodutível com o prompt real** (mesmo furo apareceu no smoke do CHIP 1). O erro do 7b é o
pior tipo pro produto: lixo genérico virando card "bom" com nota 7 na frente do cliente.

## 2. Xray-note (head-to-head INÉDITO) — prompt real `cnpj-xray-ai-note` (temp 0, num_predict 150, num_ctx 4096)

Notas por banda esperada (idênticas em livre e VPS-sim — temp 0, determinístico):

| Banda esperada | qwen3:4b | qwen2.5:7b |
|---|---|---|
| alta (xr-01/05/08) | 95, 70, 95 | 85, 65, 85 |
| **média** (xr-02/04/09/10) | **85, 70, 85, 0** — não existe meio | **50, 70, 65, 35** — banda média real |
| baixa (xr-03/06/07) | 0, 0, 20 | 20, 25, 20 |
| valores distintos | 5/10 (polariza 0×70×85×95) | **7/10** |
| resumo >140 chars | 2-3/10 (estoura até 181 — o serviço corta no meio da frase) | **0/10** (52–102 chars, folga) |
| JSON | 10/10 ✓ | 10/10 ✓ |
| fidelidade do resumo | 10/10 fiel ao input (checado 1 a 1) | 10/10 fiel (xr-10 omite site/e-mail que existem — omissão, não invenção) |

**O 4b REPROVA no gate "spread que RANQUEIA": trata lead médio como ótimo-ou-péssimo**
(MEI com zap → 85 igual a EPP completa; SUSPENSA com site+e-mail → 0 igual a BAIXADA sem nada).
Num Radar ordenado por nota, a banda do meio — onde mora a maioria dos leads — vira mentira.
O 7b ordena com sobreposição leve só nas bordas (alta min 65 × média max 70, casos
defensáveis: transportadora sem zap × padaria com site+e-mail) e escreve resumo mais curto e
dentro do limite. **Xray é do 7b.**

## 3. Latência e cold-load (⚠️ medição sob contenção externa)

A máquina local estava com CPU 79–100% durante toda a bateria (Chrome + Docker + outras
sessões) — ambos os modelos degradaram pra ~2,5–5 tok/s (rig limpo faz 15–25). Os absolutos
abaixo são PESSIMISTAS; o relativo 4b×7b é justo (mesma contenção) e o fator real é confirmado
no smoke do CHIP 6 na VPS.

| Corte | 4b | 7b |
|---|---|---|
| xray VPS-sim p50/p95 | 24,9s / 34,8s | 17,0s / 19,5s |
| xray gate ≤60s/lead | **PASSA (0/10 over) mesmo sob contenção** | **PASSA (0/10 over)** |
| saneia VPS-sim p50 | 15,2s (janela limpa 10–15s — bate os 10,7s de 02/07) | 15,8s |
| saneia VPS-sim pico contenção | até 170s (9/20 over o timeout de 20s do serviço) | até 23,6s (4/20 over) |
| cold-load (VPS-sim, xray) | 29,9s (load 14,3s) | 64,9s (load 46,7s) |
| tokens de resumo (média xray) | 48 | 35 — por isso o 7b é mais rápido aqui |

Notas: (a) o timeout REAL do saneamento é 20s (`HBX_AI_SANEAMENTO_TIMEOUT_MS`) — sob
contenção os DOIS estouram; na VPS o saneamento roda em fila pós-entrega (flag OFF hoje),
então estourar = degrade gracioso, não quebra. (b) cold-load reforça o
`OLLAMA_KEEP_ALIVE=-1` da injeção do CHIP 6. (c) no xray o serviço corta resumo em 140 no
`slice` — o estouro do 4b não quebra nada, mas o texto aparece decepado no card.

## 4. Consequência pra decisão (CHIP 6 decide, aqui é só o dado)

- **Honrar os 2 vencedores = mix** (4b saneia + 7b xray): zero código novo (envs separadas já
  existem), mas depende do CHIP 5 provar que ~7,6GB de modelos residentes cabem na RAM da VPS.
- **Single-4b** (se o mix morrer na RAM): saneamento perfeito + xray com banda média polarizada
  — ranking mente no meio da tabela e 2-3/10 resumos saem cortados.
- **Single-7b**: descartado por Cards (lixo nota 7 no card) e já reprovado no BOT (CHIP 2).

## Onde está o dado bruto

- CSV/JSONL: `scratchpad\bench-ia\results\chip4.csv` (+ `.jsonl` com parsed/ollama metrics)
  em `C:\Users\Jhonatan\AppData\Local\Temp\claude\C--Users-Jhonatan-Desktop-App\02939300-6ad8-4c57-8048-604ba1da5ca9\scratchpad\`
  (sessão CHIP 4; harness copiado da sessão do CHIP 1, que segue existindo).
- Analisador: `bench-ia/analyze-chip4.mjs` (gates automatizados + dump dos resumos).
- Harness ganhou 2 blindagens de orquestração (não mudam medição): warmup com 1 retry e caso
  com erro vira linha de falha em vez de matar o run (o hard-timeout de 180s matou a 1ª
  tentativa de bateria sob pico de contenção).

## Desvios do pedido (com causa)

- Os 10 leads do xray são os SINTÉTICOS do CHIP 1 (formato RFB) — banco local vazio, e ler 10
  reais de prod exigiria tocar a VPS (proibido neste chip; o próprio CHIP 1 deixou essa
  decisão pro dono).
- Latência absoluta veio contaminada por contenção externa da máquina (documentado acima);
  qualidade/gates não são afetados e o head-to-head relativo permanece válido.
