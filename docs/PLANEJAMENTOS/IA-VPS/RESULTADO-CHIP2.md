# RESULTADO CHIP 2 — BOT (classificador de intenção) 4b × 7b (05/07/2026)

**Status: CONCLUÍDO.** Gabarito do BOT (62 casos) rodado nos 2 modelos × 2 modos, prompt/params
VERBATIM de `backend/src/bot/intent/ai-intent-classifier.service.ts`. Nada publicado, VPS não
tocada, WhatsApp não tocado, sem branch nova.

## TL;DR (o que decide)

**O default atual da env (`HBX_LLM_CLASSIFIER_MODEL=qwen2.5:7b`) é a escolha ERRADA pro bot** —
ele reprova nos DOIS gates que mais importam pra não tomar ban/perder cliente:

1. **Perde opt-out** (recall REMOVER 87,5%, gate é 100%): classificou `"PARA. nao quero receber
   isso"` como `NAO_INCOMODE` em vez de `REMOVER`, nos dois modos. Continuar mandando pra quem
   pediu pra parar é "o pior erro possível" (PLANO §4) e alimenta a máquina de ban.
2. **Estoura o timeout real** (p95 10,9s em VPS-sim, gate é 9s = `HBX_LLM_CLASSIFIER_TIMEOUT_MS`):
   53% das classificações passam de 9s → cairiam no fallback keyword de qualquer jeito.

**O qwen3:4b passa TODOS os gates de segurança** (REMOVER 100%, bot-detection 100%, falso-bot 2%,
JSON 100%) **e cabe no timeout** (p95 7,1s < 9s em VPS-sim). Reprova por 1 ponto só no gate de
**acurácia geral** (82% estrita / 84% leniente vs 85%) — e todos os erros dele são na direção
**conservadora/segura** (super-classifica recusa como "remover" → só silencia, nunca insiste).

→ **Candidato do BOT = qwen3:4b.** O 7b está descartado pelos gates críticos. Decisão final
(single/mix/keyword) fica pro CHIP 6, mas a linha BOT da matriz já aponta um vencedor claro.

## Matriz de decisão — linha BOT (formato §5 do PLANO)

| Frente | Gate 4b | Gate 7b | p95 VPS-sim 4b | p95 7b | Vencedor |
|---|---|---|---|---|---|
| **BOT** | **PARCIAL** — passa os 5 gates de segurança/latência; falha só acurácia geral por ~1pp (erros conservadores) | **FALHA** — reprova nos 2 gates críticos: recall REMOVER 87,5% + p95 10,9s > 9s | **7148 ms** ✅ | **10921 ms** ❌ | **qwen3:4b** |

## Tabela de gates preenchida (§4 do PLANO — modo VPS-sim é o que decide, regra 1)

| Gate BOT | Alvo | qwen3:4b (VPS-sim) | qwen2.5:7b (VPS-sim) |
|---|---|---|---|
| Recall REMOVER / opt-out | **= 100%** | **100% (8/8)** ✅ | **87,5% (7/8)** ❌ perdeu `rem-07` |
| Detecção bot/URA | ≥ 90% | 100% (12/12) ✅ | 100% (12/12) ✅ |
| Falso-bot em humano | ≤ 10% | 2% (1/50) ✅ | 10% (5/50) ✅ (no limite) |
| Acurácia geral 7 rótulos | ≥ 85% | 82% estrita / 84% leniente ❌ | 86% / 86% ✅ |
| JSON válido | ≥ 99% | 100% (62/62) ✅ | 100% (62/62) ✅ |
| Latência p95 | ≤ 9000 ms | **7148 ms** ✅ | **10921 ms** ❌ |

Leitura honesta: **nenhum dos dois passa 100% dos gates**, mas a NATUREZA da falha decide.
O 4b falha 1 gate (acurácia) por 1 caso, com erros benignos. O 7b falha 2 gates, e um deles é
o proibitivo (perder opt-out). Em risco de negócio, 4b ≫ 7b.

## Métricas por modo (livre × VPS-sim)

| Modelo | Modo | JSON | Acur. estrita | Acur. leniente | REMOVER | Bot-det | Falso-bot | p50 | p95 | max | >9s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| qwen3:4b | livre | 100% | 84% (42/50) | 86% (43/50) | **100%** | 100% | 2% | 5333 | 6169 | 6778 | 0/62 |
| qwen3:4b | **vps-sim** | 100% | 82% (41/50) | 84% (42/50) | **100%** | 100% | 2% | 5531 | **7148** | 7716 | 0/62 |
| qwen2.5:7b | livre | 100% | 90% (45/50) | 90% (45/50) | 87,5% | 100% | 6% | 8368 | 11222 | 12467 | 20/62 |
| qwen2.5:7b | **vps-sim** | 100% | 86% (43/50) | 86% (43/50) | 87,5% | 100% | 10% | 9018 | **10921** | 13146 | 33/62 |

- Acurácia calculada sobre os **50 casos humanos** (os 12 URA entram só em bot-detection).
  "Leniente" aceita os rótulos alternativos marcados como `aceitavel` no gabarito (casos
  genuinamente ambíguos: `?`, `👍`, "isso é pra empresa ou pessoa física?").
- `num_thread:4` (VPS-sim) custou pouco no Ryzen 5500 (p95 do 4b subiu ~1s, do 7b caiu porque
  warm-up mais longo esquentou o cache) — o número que vale é o VPS-sim; o fator real só o smoke
  na VPS confirma (PLANO regra 1).

## Matriz de confusão — qwen3:4b VPS-sim (50 humanos)

```
          INT  OQS  RET  NAO  REM  HUM  IND  BOT
INT         8    .    .    .    .    .    .    .
OQS         .    8    .    .    .    .    .    .
RET         .    .    6    .    1    .    .    .
NAO         .    .    1    3    4    .    .    .
REM         .    .    .    .    8    .    .    .   ← 8/8 opt-out capturados
HUM         1    .    .    .    .    5    .    .
IND         1    .    .    .    .    .    3    1
```
**Onde o 4b erra (todos benignos ou conservadores):**
- `NAO_INCOMODE → REMOVER` ×4 (`nao-03/04/07/08`): super-classifica recusa como remoção. **Direção
  segura** — silencia quem não quer, nunca insiste. Puxa a acurácia pra baixo mas NÃO é dano.
- `ret-02` "dps a gente se fala blz" → REMOVER: falso-remover num lead morno (custa 1 follow-up,
  não é ban). `nao-05` "vou passar dessa vez" → RETORNE_DEPOIS: único erro na direção "insistente",
  e ainda assim RETORNE_DEPOIS só reagenda, não dispara loop/reconexão.
- `hum-04` "me passa o telefone de um vendedor" → INTERESSE: deixa de encaminhar pra humano.
- `ind-04` "?" → falso-bot (1 caso, o único do 4b).

## Matriz de confusão — qwen2.5:7b VPS-sim (50 humanos)

```
          INT  OQS  RET  NAO  REM  HUM  IND  BOT
INT         8    .    .    .    .    .    .    .
OQS         .    7    .    .    .    .    .    1   ← silenciou lead genuíno como "bot"
RET         .    .    7    .    .    .    .    .
NAO         .    .    1    6    .    .    .    1
REM         .    .    .    1    7    .    .    .   ← PERDEU 1 opt-out (rem-07)
HUM         .    .    .    .    .    6    .    .
IND         .    .    .    .    .    .    2    3
```
**Por que o 7b é pior no que importa:** viés de super-detectar bot (5 falso-bots) que inclui
**silenciar um lead quente** — `oqs-07` "é algum tipo de sistema? explica melhor que eu nao
conheco" virou `bot/INDEFINIDO` (PLANO §4: "silenciar lead quente custa venda"). E o fatal:
`rem-07` "PARA. nao quero receber isso" → `NAO_INCOMODE` (perdeu o opt-out). A acurácia geral
melhor (86%) não compensa reprovar nos 2 gates de risco.

## Se o 7b tivesse que ser acomodado — quanto custaria de timeout

Pergunta do dono: qual timeout acomodaria o 7b em VPS-sim (p99)?
- 7b VPS-sim: p95 **10921 ms**, p99 **13146 ms**, max **13146 ms** (com n=62, p99≈max).
- Acomodar exigiria `HBX_LLM_CLASSIFIER_TIMEOUT_MS ≥ ~13200 ms` (subir de 9s → ~14s). O PLANO §4
  admite "resposta de bot em 15–20s ainda é humana", então **numericamente é viável**.
- **PORÉM: subir o timeout NÃO salva o 7b.** Mesmo com 14s de teto, ele continua perdendo o
  opt-out (recall REMOVER 87,5% independe de latência) — o gate proibitivo permanece reprovado.
  Subir a env só resolveria a latência, não o erro fatal. Registrar isso pro dono não gastar
  uma mudança de env num modelo que reprova por outro motivo.

## Cold-load (modelo descarregado da RAM antes da 1ª chamada)

| Modelo | Total 1ª chamada | `load_duration` |
|---|---|---|
| qwen3:4b | 69,7 s | 47,8 s |
| qwen2.5:7b | 84,5 s | 44,5 s |

Ambos ≫ 9s → **sem `OLLAMA_KEEP_ALIVE=-1` a 1ª classificação do dia morre em timeout** e o painel
"IA ligada" vira mentira intermitente (risco nomeado no PLANO §7). Já previsto pra injeção do
CHIP 6 (`OLLAMA_KEEP_ALIVE=-1`). O 4b custou 69,7s aqui (vs 158s medidos em 02/07 — varia com
estado de disco/RAM); o ponto não muda: keep-alive é obrigatório.

## Arquivos (CSV bruto no scratchpad)

```
scratchpad/bench-ia/results/bot.csv        (248 linhas: 62 casos × 4 model/mode)
scratchpad/bench-ia/results/bot.jsonl      (mesmos + parsed + métricas Ollama)
scratchpad/bench-ia/results/bot-cold.csv   (2 cold-loads)
scratchpad/bench-ia/analyze-bot.mjs        (script de análise: matriz + gates + percentis)
```
Colunas CSV: `ts,suite,model,mode,caso,source,latency_ms,over_timeout,parse_ok,expected,got,raw`.
⚠️ Scratchpad é de sessão — se sumir, `runner.mjs` + `analyze-bot.mjs` + gabarito recriam tudo.

## Impacto na decisão do CHIP 6

- **Linha BOT da matriz: vencedor = qwen3:4b.** É o único que passa os gates de segurança
  (REMOVER/bot/falso-bot) e cabe no timeout de 9s.
- **Antes de ligar o classificador na VPS, TROCAR a env** `HBX_LLM_CLASSIFIER_MODEL` de `qwen2.5:7b`
  (default do código) para `qwen3:4b`. Deixar no default = ligar o modelo que perde opt-out.
- Regra §5 ao pé da letra ("nenhum modelo passa os gates do BOT → keyword-fallback") é o piso de
  segurança se o dono quiser rigor absoluto: o 4b falha o gate de acurácia geral por 1pp. Mas os
  erros do 4b são conservadores e o serviço já tem o keyword como rede embaixo (cai no keyword em
  INDEFINIDO/erro/timeout). Recomendação: **ligar o 4b** — degradação graciosa por construção.
- CHIP 3 (Assistente) vai decidir se bot e assistente compartilham modelo. Como bot e assistente
  usam a MESMA env, se o Assistente preferir 7b, cai a contingência C1 (`HBX_ASSISTENTE_MODEL`).
