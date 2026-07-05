# RESULTADO EXTRA — qwen3:4b-instruct nas 3 tarefas que faltavam (05/07/2026)

**Status: CONCLUÍDO.** O candidato EXTRA do CHIP 3 (`qwen3:4b-instruct`, 2507, SEM thinking,
2,5GB) rodou o gabarito completo do BOT (62 casos), o saneamento (12 bons + 8 lixo) e o
xray-note (10 leads), prompts/params VERBATIM dos serviços (re-conferidos contra o master
05/07 antes de rodar), harness do CHIP 1, modos livre + VPS-sim. Rig EXCLUSIVO verificado
via `server.log` do Ollama (último tráfego alheio 18:11, fim do CHIP 3) + CPU 7% / 15,6GB
livres no disparo — **primeira bateria de cards em rig limpo** (a do CHIP 4 pegou contenção).
Nada publicado, VPS não tocada, WhatsApp não tocado, sem branch nova.

## TL;DR (o que decide)

**O 4b-instruct passa BOT + SANEAMENTO e reprova o XRAY → o qwen3:4b (thinking) MORRE DO
MAPA, mas modelo único não rola. VPS = 4b-instruct + qwen2.5:7b (xray) ≈ 7,2GB residentes —
exatamente o mix que o CHIP 5 já ia medir (mesmo tamanho: thinking e instruct têm 2,5GB).**

1. **BOT: PASSA TODOS OS 6 GATES — o primeiro modelo do bench inteiro a fechar a linha.**
   REMOVER 100%, bot-detection 100%, falso-bot 0%, JSON 100%, acurácia **90% estrita / 92%
   leniente** (gate 85% — onde o 4b-thinking caía com 82/84) e p95 **5,2s** em VPS-sim
   (gate 9s; o thinking fazia 7,1s, o 7b estourava com 10,9s). Cold-load 26,6s (thinking: 69,7s).
2. **SANEAMENTO: PASSA os gates** (12/12 bons ≥7, 8/8 lixo ≤3, JSON 100%, 0 dado inventado)
   e é ~40% mais rápido que os dois do plano (p50 9,8s vs ~15s). Ressalva honesta: **2 typos
   no nome** ("Electricas", "Drogeria") + 1 no segmento ("Marmaria") — mesma categoria da
   "Marmoria" do thinking no CHIP 4 (distorção de palavra existente, não dado novo), só que
   2×1. É o único furo em que o thinking era marginalmente melhor.
3. **XRAY: REPROVA no mesmo gate do thinking — a banda média mente.** Versão suavizada da
   mesma doença: MEI-com-zap inflado pra 80/85 (ACIMA da alta xr-05=70) e SUSPENSA esmagada
   pra 10 (ABAIXO de toda a banda baixa 20–30). Melhora sobre o thinking (8/10 notas
   distintas vs 5/10; resumo 0/10 estourando 140 chars vs 2-3/10), mas o meio da tabela
   continua desordenado. **Xray segue do 7b** (única banda média real: 35–70).

→ **Matriz pro CHIP 6:** BOT = **4b-instruct** (substitui o thinking), saneamento =
**4b-instruct** (substitui o thinking), xray = **7b**, assistente = OFF ou 4b-instruct com
timeout maior (decisão do dono, CHIP 3). **O thinking não venceu em NADA — não puxar na VPS.**

## Tabela-mestre — instruct × números registrados (VPS-sim decide, regra 1 do PLANO)

| Tarefa | Gate | 4b-instruct | qwen3:4b (thinking) | qwen2.5:7b | Vencedor |
|---|---|---|---|---|---|
| BOT recall REMOVER | =100% | **100%** ✅ | 100% ✅ | 87,5% ❌ | |
| BOT bot-detection | ≥90% | **100%** ✅ | 100% ✅ | 100% ✅ | |
| BOT falso-bot | ≤10% | **0%** ✅ | 2% ✅ | 10% ⚠️ | |
| BOT acurácia (estrita/leniente) | ≥85% | **90% / 92%** ✅ | 82% / 84% ❌ | 86% / 86% ✅ | |
| BOT JSON | ≥99% | 100% ✅ | 100% ✅ | 100% ✅ | |
| BOT p95 VPS-sim | ≤9.000ms | **5.163ms** ✅ | 7.148ms ✅ | 10.921ms ❌ | **4b-instruct (6/6)** |
| Saneia bons ≥7 | 12/12 | **12/12** ✅ | 12/12 ✅ | 12/12 ✅ | |
| Saneia lixo ≤3 | 8/8 | **8/8** ✅ (lixo-01=3, no limite) | 8/8 ✅ | 7/8 ❌ (lixo-01=7) | |
| Saneia inventado/distorção | 0 | 0 inventado; **2 typos** ⚠️ | 0; 1 typo | 0; 2 distorções + LTDA não limpo | |
| Saneia JSON / p50 VPS-sim | 100% | 100% ✅ / **9,8s** | 100% ✅ / ~15s* | 100% ✅ / 15,8s* | **4b-instruct** (typo 2×1 anotado) |
| Xray banda média ranqueia | sim | ❌ 80/85 > alta-70; SUSPENSA=10 < baixas | ❌ polariza 85-ou-0 | ✅ 35–70 real | |
| Xray resumo ≤140 | 10/10 | **10/10** ✅ | 7-8/10 ❌ | 10/10 ✅ | |
| Xray JSON / ≤60s | 100% | 100% ✅ / p95 10,6s | 100% ✅ / 34,8s* | 100% ✅ / 19,5s* | **7b** (instruct melhora mas não passa) |
| Cold-load (bot, VPS-sim) | — | **26,6s** | 69,7s | 84,5s | keep-alive segue obrigatório |

\* números do CHIP 4 medidos sob contenção externa (documentado lá); os do instruct são de rig
limpo — comparação de latência entre baterias é indicativa, o relativo dentro de cada bateria é justo.

## 1. BOT — detalhe (62 casos, prompt real do `ai-intent-classifier`)

Métricas por modo:

| Modo | JSON | Acur. estrita | Leniente | REMOVER | Bot-det | Falso-bot | p50 | p95 | max | >9s |
|---|---|---|---|---|---|---|---|---|---|---|
| livre | 100% | 90% (45/50) | 92% (46/50) | 100% | 100% | 2% (1/50) | 4.397 | 5.033 | 6.109 | 0/62 |
| **vps-sim** | 100% | **90%** (45/50) | **92%** (46/50) | **100%** | **100%** | **0%** | 4.572 | **5.163** | 5.752 | **0/62** |

Matriz de confusão VPS-sim (50 humanos): diagonal 45; erros = 4 (leniente), todos leves:
- `int-01` "opa, gostei. como funciona?" → O_QUE_SERIA (responder "o que é" a quem perguntou
  como funciona ainda avança a conversa — benigno);
- `ret-03` "agora nao consigo, to dirigindo" → NAO_INCOMODE (conservador: silencia em vez de
  reagendar, custa 1 follow-up);
- `nao-08` "to fora, mas obrigado ai" → RETORNE_DEPOIS (o ÚNICO na direção insistente — e
  RETORNE_DEPOIS só reagenda, não dispara loop);
- `ind-04` "?" → devolveu `remetente:"indefinido"` (fora do enum de 2 valores). No serviço real
  isso cai no fallback keyword (sender≠bot + INDEFINIDO → `buildIntent` null) — comportamento
  final CORRETO pro caso; conta como erro só no scoring estrito.

Zero falso-REMOVER (o thinking tinha 4 NAO_INCOMODE→REMOVER + 1 RET→REMOVER), zero URA perdida,
zero lead quente silenciado. Perfil de erro mais limpo que o dos DOIS modelos do plano.

## 2. SANEAMENTO — detalhe (prompt real `saneiaComNota`, temp 0.2)

Saída IDÊNTICA em livre e VPS-sim (reproduzível; reforça que o rig estava limpo). Notas:
bons = 10×9, 1×10, 1×8 (satura em 9 — menos granular que o 7–9 do thinking, mas o gate de
saneia é separar bom de lixo: margem 8→3 cumprida); lixo = 7×1, 1×3.

- `lixo-01` "Servicos de Encanador" → **nota 3** (passa NO LIMITE; thinking dava 1; o 7b dava
  7 e reprovava — o furo reprodutível do 7b segue sendo o motivo de ele estar fora daqui).
- `bom-12` (GRAFICA ... LTDA - CNPJ) → limpou LTDA e CNPJ direito (o 7b devolvia cru).
- Zero vazamento de "Local:" pro nome (o 7b vazou no CHIP 4).
- **Typos (a ressalva):** `bom-02` ELETRICAS→"El**e**ctricas", `bom-04` DROGARIA→"Drog**e**ria"
  (nome, visível no card), `bom-10` segmento "Marmaria" (nome ficou certo — o thinking errava
  justamente o nome aqui, "Marmoria"). Mesma categoria distorção-não-invenção que o CHIP 4
  tolerou no thinking; se o dono considerar typo visível inaceitável, é o único argumento
  restante pro thinking no saneamento — 1 typo contra 2.

Latência VPS-sim: p50 9,8s / p95 13,8s / max 15,4s — 0 over no timeout real de 20s.

## 3. XRAY-NOTE — detalhe (prompt real, temp 0, mesmos 10 leads do CHIP 4)

Notas idênticas em livre e VPS-sim (temp 0):

| Banda esperada | 4b-instruct | 4b-thinking | 7b |
|---|---|---|---|
| alta (xr-01/05/08) | 95, **70**, 90 | 95, 70, 95 | 85, 65, 85 |
| **média** (xr-02/04/09/10) | **80**, 70, **85**, **10** | 85, 70, 85, 0 | 50, 70, 65, 35 |
| baixa (xr-03/06/07) | 20, 30, 30 | 0, 0, 20 | 20, 25, 20 |
| distintas / resumo>140 | 8/10 / 0 | 5/10 / 2-3 | 7/10 / 0 |

**Por que reprova:** o formato da falha é o MESMO do thinking, só menos extremo — (a) MEI com
só zap validado vira 80/85, ACIMA da transportadora grande com site+e-mail (70): no Radar
ordenado, um MEI de fundo de quintal aparece na frente de EPP/DEMAIS completas; (b) SUSPENSA
com site+e-mail → **10**, abaixo até da BAIXADA sem canal nenhum (20) — situação recuperável
ranqueada pior que empresa morta. (c) `xr-04` e `xr-05` receberam nota E resumo idênticos —
o modelo ignora porte (ME × DEMAIS) quando os canais empatam.
**Melhoras reais sobre o thinking** (registradas porque mudam o plano B): baixa deixou de
colar no 0, 8 notas distintas, resumos 73–123 chars todos dentro do limite (nada decepado no
card) e p95 10,6s. É um single-model de RESERVA muito melhor do que o thinking era — mas com
banda média mentindo, reserva, não titular.

## Consequência pra decisão (CHIP 6)

1. **`qwen3:4b` (thinking) sai do mapa.** O instruct ganha dele no BOT (6/6 gates vs 5/6),
   empata-ganha no saneamento (mesmos gates, 40% mais rápido; contra: 2 typos vs 1), ganha no
   xray (sem passar) e é o único utilizável no Assistente (CHIP 3). Não fazer `ollama pull qwen3:4b`
   na VPS.
2. **Injeção passa a ser:** `HBX_LLM_CLASSIFIER_MODEL=qwen3:4b-instruct` +
   `HBX_AI_SANEAMENTO_MODEL=qwen3:4b-instruct` + `HBX_XRAY_AI_NOTE_MODEL=qwen2.5:7b`.
   RAM de modelos residentes: 2,5 + 4,7 ≈ **7,2GB** — o cenário do CHIP 5 fica valendo
   byte-a-byte (thinking e instruct têm o mesmo tamanho).
3. **A C1 perde o caráter de emergência.** O alerta do CHIP 3 era "bot no thinking + sandbox
   herdando a env = raciocínio em inglês na cara do cliente". Com o bot no INSTRUCT, o sandbox
   herda justamente o melhor candidato do Assistente. A env `HBX_ASSISTENTE_MODEL` (já no
   working tree) vira ajuste fino opcional; a decisão que resta pro dono é a do CHIP 3:
   Assistente OFF (regra §5) ou ON com `HBX_ASSISTENTE_TIMEOUT_MS=20000` + 2 regras no prompt.
4. **Se o CHIP 5 matar o mix na RAM:** o plano B agora é **single 4b-instruct (~2,5GB)** —
   BOT+saneamento+assistente íntegros e um xray degradado-mas-funcional (resumos válidos,
   8 notas distintas; a banda média continua mentindo, igual documentado acima). Bem melhor
   que o plano B anterior (single-thinking: assistente inutilizável + resumos decepados).
5. Cold-load 26,6s ≫ 9s → `OLLAMA_KEEP_ALIVE=-1` segue obrigatório (nada muda no CHIP 6).

## Arquivos (bruto no scratchpad desta sessão)

```
scratchpad/bench-ia/results/extra-bot.csv|.jsonl        (124 linhas: 62 × livre/vps-sim)
scratchpad/bench-ia/results/extra-bot-cold.csv|.jsonl   (cold-load)
scratchpad/bench-ia/results/extra-saneia.csv|.jsonl     (40: 20 × 2 modos)
scratchpad/bench-ia/results/extra-xray.csv|.jsonl       (20: 10 × 2 modos)
scratchpad/bench-ia/run-extra.log                       (stdout dos 7 runs)
scratchpad/bench-ia/ref/chip2-bot.jsonl|chip4.jsonl     (cópias dos brutos CHIP 2/4 usadas na comparação)
```
Analisadores reusados dos CHIPs 2/4 (`analyze-bot.mjs`, `analyze-chip4.mjs`); o pipeline foi
validado ANTES de rodar reproduzindo 1:1 a tabela do RESULTADO-CHIP2 a partir do bruto de lá.
⚠️ Scratchpad é de sessão — este doc carrega tudo que a decisão precisa.

## Desvios do pedido (com causa)

- Nenhum desvio de escopo: 3 suites, 2 modos cada + cold, prompts VERBATIM re-conferidos.
- Latências do CHIP 4 (saneia/xray dos 2 modelos do plano) vieram de bateria sob contenção —
  a comparação de latência entre baterias está marcada com * na tabela-mestre; os GATES de
  qualidade não dependem disso (temp 0/0.2 reproduzíveis, confirmado pelos 2 modos idênticos).
