# Benchmark IA — `qwen2.5:7b` × `qwen3:30b-a3b` (01/07/2026)

> Rodado 100% LOCAL (Ollama `:11434`, CPU, Ryzen 5 5500 / 32GB). Harness em
> `scratchpad/bench-ia/` (`bench.mjs` + `fixture.mjs` + `prompts.mjs`). Reusa o padrão do
> `ai-saneamento.service.ts` (`think:false`, `format:json`, timeout, JSON tolerante).
> **Rubric ICP = PROVISÓRIO** (o definitivo é decisão de negócio do dono, ainda pendente).

## Como foi feito
- **Fixture focado:** 4 leads diversos — `padaria`, `autopecas`, `odonto`, `arcond` (ar-condicionado, o ICP-exemplo do dono). Cada um com nome sujo, blob de site com email/tel/dono no meio de ruído, e verdade esperada.
- **4 tarefas × 2 modelos:** extração `{email,phone,owner}` · saneamento `{nome_limpo,segmento}` · nota ICP 0–10 `{score,motivo}` · mensagem inicial de WhatsApp. + consistência ICP (mesmo lead 3×).
- Timeout por chamada: 180s. `keep_alive: 30m` (mantém o modelo quente entre leads).
- **Nota de escopo:** 4 leads (não 12) — decisão do orquestrador. O sweep cheio de 12 leads em CPU dava ~2h (30B lentíssimo); 4 leads já mostram o delta pra decidir roteamento. Rodar 12 é 1 comando (`--limit 12`), pra fazer overnight ou na GPU futura.

## Placar

| Tarefa | 7B (`qwen2.5:7b`) | 30B (`qwen3:30b-a3b`) | Quem ganha |
|---|---|---|---|
| **Extração** (email+tel+dono) | 67% — 8/12 hits (falha tel e dono) | **100% — 9/9** nos leads quentes | **30B, claro** |
| **Saneamento** (nome+segmento) | **100%** (4/4) | **100%** (3/3 quentes) | Empate → **7B** (mais barato/rápido) |
| **Nota ICP** | discrimina (7/3/3/2) mas com **motivo alucinado** | motivo **factualmente correto**, mas comprime em 9–10 | Inconclusivo (ver abaixo) |
| **Mensagem inicial** | **100%** — 4/4 boas e curtas | **0% — timeout em TODAS** (runaway) | **7B** |
| **Cold-load** (1º uso) | ~1-2s | **~12 min** (perdeu o lead `padaria` inteiro nos 4 timeouts) | **7B** |
| **Velocidade (quente)** | ~3.3 tok/s, tarefas 9-22s | ~4-6 tok/s, tarefas 6-18s | Parelho quando quente |
| **JSON válido** | 100% | 100% (quando não estoura timeout) | Empate |

## Os 3 achados que importam (e contrariam o óbvio)

**1. 30B só ganha DE VERDADE em extração.** Nos mesmos 3 leads quentes, 7B fez 2/3, 1/3, 2/3 e o 30B fez **3/3, 3/3, 3/3**. O 7B erra telefone e dono no meio do ruído; o 30B pega. Esse é o único lugar onde o custo do 30B se paga com folga.

**2. A nota ICP é mais sutil do que o placar sugere — cuidado.** O 7B "espalha" as notas (parece bom pra ranquear), MAS o *motivo* dele é **alucinado**:
- `arcond` 7B=2 "Segmento corporativo **sem dono claro**" — ERRADO: a extração achou o dono (Marcos), é microempresa (Polar Clima).
- `autopecas` 7B=3 "não é local com recorrência" — questionável; autopeça é negócio local.
- O 30B deu 10/10/9 com motivo **correto** ("microempresa local, dono acessível, segmento recorrente"). Como TODOS os leads do fixture são "bons" (local + dono + WhatsApp), 9-10 pode estar **certo** e o 7B é que erra pra baixo inventando fato.
- **Conclusão honesta:** não dá pra cravar vencedor de ICP sem (a) leads comprovadamente RUINS no fixture (empresa baixada, sem dono) pra ver se o 30B sabe descer, e (b) o rubric definitivo do dono. O que dá pra dizer: **o 30B raciocina mais grounded; o 7B alucina negativos.** A "discriminação" do 7B é em parte espúria.

**3. O 30B tem 2 modos de falha operacional sérios:**
- **Cold-load de ~12 min** (18GB subindo na RAM em CPU) → o 1º lead `padaria` perdeu as 4 tarefas por timeout. Inaceitável pra realtime; só serve com modelo já quente (batch).
- **Runaway em texto livre:** a mensagem usa `json:false` (texto solto). O 30B (modelo *thinking*, mesmo com `think:false`) **gera sem parar** e estoura os 180s em TODAS as 4 mensagens (0 char). O 7B (não-reasoning) escreve curto e para. → 30B pra mensagem **exige `max_tokens` cap** antes de ser cogitado; sem cap, é inútil.

## Exemplos lado a lado

**Mensagem inicial (7B — o 30B não produziu nenhuma):**
- `arcond`: *"Olá Marcos, da Polar Clima! Como vai o ar condicionado na sua casa de verão? Precisou de alguma coisa? 😊"* (105ch) — hook do segmento, natural.
- `autopecas`: *"Olá Roberto, da Auto Peças e Acessórios Silva! Como está o carro hoje? 😊 Temos soluções bacanas para manter seu veículo em ótimas condições."* (141ch)
- Ressalvas do 7B: em `padaria` inventou um remetente ("Wellington do HBX"); em `odonto` escorregou no PT ("Como estãs"). Utilizável, mas revisar prompt pra não inventar remetente.

**Nota ICP (motivo) — `arcond`:**
- 7B=**2**: "Segmento corporativo sem dono claro." ← factualmente errado (tem dono).
- 30B=**9**: "Microempresa local com dono acessível e segmento recorrente." ← correto.

**Consistência ICP (`padaria`, 3×):** 7B = 7,7,7 · 30B = 10,10,10 → ambos determinísticos (temp 0).

## Recomendação de roteamento (data-backed)
| Tarefa | Rodar em | Porquê |
|---|---|---|
| **Extração** | **30B batch-local** (PC on, modelo quente); fallback 7B | Único ganho grande e claro (67%→100%). Nunca cold/realtime. |
| **Saneamento** | **7B** (VPS, realtime) | Empata com 30B; 30B não paga o custo. |
| **Nota ICP** | **7B por ora**, mas **re-testar 30B** com rubric definitivo + leads ruins de controle | 30B raciocina melhor; falta prova de que sabe DESCER. Decisão trava no rubric do dono. |
| **Mensagem** | **7B** (VPS) | 7B entrega curto e bom; 30B só com `max_tokens` cap (hoje faz runaway). |

**Leitura de negócio:** o 30B **não é upgrade geral** — é bisturi pra **extração**. Saneamento/ICP/mensagem rodam bem no 7B barato e realtime no VPS. Isso **simplifica a ponte**: o túnel 30B-local se justifica sobretudo pra extração pesada de contato; as outras 3 tarefas talvez nem precisem do 30B. Menos complexidade, menos dependência do PC estar ligado.

## Erros / limitações desta rodada
- `padaria` no 30B foi perdido no cold-load (comparação de extração é sobre 3 leads).
- 30B mensagem = timeout de config (`json:false` sem cap), não incapacidade — não testado com cap.
- 30B ICP comprimido em 9-10: falta lead ruim de controle + rubric real pra concluir.
- Fixture 4 leads (amostra pequena, todos "bons"). Sinal de direção, não estatística.

## Reproduzir / expandir
```
node scratchpad/bench-ia/bench.mjs --limit 4 --models 7b,30b --tasks extracao,saneamento,icp,msg --out results-focused.json
# 12 leads (overnight/GPU):  --limit 12
# só extração 30B:           --models 30b --tasks extracao
```
Bruto em `scratchpad/bench-ia/results-focused.json`. Harness pronto pra rodar de novo quando (a) o dono definir o rubric ICP e (b) o fixture ganhar leads ruins de controle.
