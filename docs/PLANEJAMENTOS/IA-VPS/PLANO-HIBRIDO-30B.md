# IA HÍBRIDA — 30B LOCAL (madrugada) × 4b-instruct VPS (tempo real) — plano completo (05/07/2026)

**Ordem do dono:** 7b local é desnecessário (o 30B responde mais rápido e melhor). Arquitetura
final = **VPS roda `qwen3:4b-instruct`** (tempo real) e **LOCAL roda SÓ o 30B** (máquina aguenta
apenas ele, já no máximo). Estrutura pronta e FUNCIONAL: HBX Owner enxergando o 30B, aquecido de
manhã, leads chegando pro localhost e voltando pro cliente, com o aviso "enriquecendo" **bem
visível pro cliente** — IA trabalhando e fila na cara, não escondido por trás.

## 1. Arquitetura-alvo (o desenho total)

```
CLIENTE puxa lead ──► VPS (4 vCPU/16GB)                      LOCAL (Ryzen 5500/32GB)
                      qwen3:4b-instruct residente 24/7        qwen3:30b-a3b-instruct (SÓ ele)
                      · BOT (6/6 gates, p95 5,2s)             · extração de contato (11/12, 0 alucinação/50)
                      · Assistente (sandbox)                  · nota ICP honesta (VALIDAR — chip T1)
                      · saneamento da entrega                 · lote pesado de MADRUGADA
                      · xray interino (conforme CHIP 6)       · aquecido DE MANHÃ (warm-up)
                             │                                        ▲
                             │  fila de missões (RadarMission)        │ PULL (JWT+Master, HTTPS)
                             └──► enfileira ──────────────────────────┘ worker local da PONTE
                                       │                              │
                             card mostra "⏳ Na fila da IA"           │ 30B processa
                                       ◄──────────────────────────────┘ complete → card atualiza
                             card vira "✓ Enriquecido por IA"
```

- **7b: MORTO em todo lugar.** Perdeu o bot (opt-out 87,5% + timeout), perdeu o saneamento (lixo
  nota 7), só vencia o xray — e o xray migra pro 30B se o chip T1 aprovar. O 30B MoE é MAIS RÁPIDO
  que o 7b denso (5–8s/lead × 17s) e muito melhor em extração. Não puxar 7b em lugar nenhum.
- **PC desligado → NADA PARA:** VPS segue inteira com o 4b-instruct; missões acumulam na fila
  (lease devolve vazio, backoff já existe); o card do cliente mostra estado HONESTO (fila velha ≠
  spinner eterno — ver §6).
- **Pull-based:** a máquina local NUNCA é exposta — ela é quem liga pro VPS. `:11434` local segue
  127.0.0.1 (regra de sempre).

## 2. O que JÁ EXISTE (isto é solda, não construção)

| Peça | Onde | Estado |
|---|---|---|
| Fila de missões (lease/heartbeat/complete/fail/stats/redrive, lease TTL 2min, backoff, dead-letter) | `backend/src/webscraping/radar/missions/` (S4) | PRONTA, flag `HBX_MISSION_QUEUE_ENABLED` OFF; validação viva pendente |
| Fábrica de enriquecimento enfileirando | `radar-fabrica.service.ts:336` | pronta (budget, R$0 provado) |
| Xray já enfileira missão | `cnpj-xray.service.ts:351` | pronta |
| Extração 30B + gate anti-alucinação + escrita única | `ai-contact-extraction.service.ts` + `lead-contact-gate.ts` + `LeadContactWriteService` (`ai_extraction` conf. 60) | PROVADA (sprint 5: 50 ruins → 0 gravado), flag `HBX_AI_EXTRACTION_ENABLED` OFF |
| :3107 enxergando Ollama local (tags/ps/warm, has30b/warm30b) | `hbx-owner/local-agent/server.js:37-540, 2671+` | existe; msg "12min" DEFASADA e allowlist com tag velha (§3) |
| Estética "enriquecendo" (shimmer 3 estados + selo ✨) | `detalhes-negocio.tsx` (loading·enriquecendo·enriquecido), `kit.css:1313` | existe, mas amarrada a pipeline genérico — não à fila de IA |
| Badge de origem/enriquecimento honesto (`enrichedBy`) | sourceChain honesto (publicado 03/07) | pronto pra exibir "quem enriqueceu" |

**A ÚNICA peça inexistente: o worker local da PONTE** (quem puxa missão do VPS e executa no 30B).
Todo o resto é ligar flag, ajustar painel e dar visibilidade no front.

## 3. Gotchas duros (cada um já mordeu uma vez)

1. **`num_ctx` do 30B SEMPRE capado (8192):** default 262k aloca 45,7GB de KV → swap-morte na
   máquina de 32GB. Capado = ~19GB residente, liso.
2. **Cold-load real ~3min** (capado) > timeout de extração 90s → warm-up ANTES de lote; a msg do
   :3107 "leva ~12min" é DEFASADA (era o swap do ctx destravado) — corrigir.
3. **Tag do modelo divergente:** :3107 allowlist tem `qwen3:30b-a3b`; o serviço usa
   `qwen3:30b-a3b-instruct-2507-q4_K_M`. Alinhar (e remover o 7b da allowlist).
4. **Máquina no max:** 30B residente ≈19GB + Docker + Chrome nos 32GB. Keep-alive -1 segura ele o
   dia todo (é o que o dono quer: "aquecido de manhã") — mas precisa botão "descarregar" no :3107
   pro dia que a RAM fizer falta.
5. **Nota ICP do 30B é PERGUNTA ABERTA:** bench 01/07 viu o 30B "raciocina certo MAS satura 9-10
   (não ranqueia)" — mesmo defeito do 4b em outra roupa. O chip T1 decide com o prompt REAL do
   xray. Sem aprovar, a nota honesta NÃO tem dono e o xray fica no interino do CHIP 6.
6. **Worker da ponte precisa de DISJUNTOR** (teto de falhas → para e acende no :3107) — nunca loop
   livre; mesma lei do WhatsApp.
7. **Bench é EXCLUSIVO no rig** (lição CHIP3×4: paralelo contamina latência).
8. **VPS: fila ligada = `HBX_MISSION_QUEUE_ENABLED=true` + RECREATE** (env_file não pega em restart).

## 4. FASE T — revalidação com o 30B (repetir o que já aconteceu, agora com ele)

### CHIP T1 — Bench 30B nas tarefas batch (a decisão do xray mora aqui)
Prompts/params VERBATIM, ctx 8192, rig exclusivo, warm antes de medir:
1. **Xray-nota** nos 10 leads gabaritados (mesmos dos CHIPs 4/EXTRA). Pergunta única que importa:
   **a banda média ranqueia?** (7b fazia 35–70; 4b mente; 30B suspeito de saturar 9-10).
   - Ranqueia → **xray vira missão local do 30B** e a escolha "degradado × 7b noturno" MORRE.
   - Satura → 1 tentativa de ajuste de prompt (rubric ancorado: "distribua entre bandas") → re-rodar.
   - Falhou de novo → xray fica como o CHIP 6 deixou (4b degradado ou OFF). Registrar e parar.
2. **Saneamento** (12 bons + 8 lixo): esperado passar; medir s/lead (baseline instruct: p50 9,8s).
3. **Extração — regressão curta** (12 bons + 20 ruins do set do sprint 5): confirmar 0 inventado
   pós-gate e 5–8s/lead. Já provada, é cinto de segurança.
Entrega: `RESULTADO-T1.md` com tabela 30B × números já registrados (instruct/7b) por tarefa.

### CHIP T2 — Madrugada simulada (o turno de trabalho inteiro, medido)
Lote estilo produção: 100+ missões (extração+nota se T1 aprovou) corridas no 30B residente:
- **leads/hora** (dimensiona quantos leads/noite a promessa aguenta), RAM pico (zero swap),
  latência estável do 1º ao último, com Chrome/Docker abertos × fechados.
- Cold-load medido de verdade + script de warm-up (chamada 1-token) + descarga.
- Falha no meio do lote (matar Ollama) → worker marca fail, redrive recupera, nada duplica
  (idempotência da missão).
Entrega: `RESULTADO-T2.md` com a conta redonda: **"uma madrugada = N leads enriquecidos"**.

## 5. FASE E — estrutura da ponte + painel

### CHIP E1 — Worker local da PONTE (a única peça nova de verdade)
Consumidor de missões vivendo junto do local-agent (`hbx-owner/local-agent/`, Node puro, sem
framework — padrão da casa):
- Loop: `POST /modules/owner/missions/lease` no VPS (JWT+Master; workerId próprio) → executa no
  30B local (extração via prompt/gate reais; nota se T1 aprovou) → `complete` (resultado passa
  pelo `LeadContactWriteService` no VPS — caminho único de escrita, conf. `ai_extraction`) /
  `fail` com retryable.
- Heartbeat no lease TTL 2min; **disjuntor**: X falhas seguidas → PARA, acende vermelho no :3107,
  não reprocessa sozinho. Warm-check antes do 1º lease do dia (30B frio → aquece primeiro).
- Flag própria (`HBX_PONTE_WORKER_ENABLED`). **Janela = ELÁSTICA, não agenda (decisão do dono
  05/07: "horário de aquecimento: elástico… tudo isso já existe, reaproveite")**: o worker é
  dirigido pelo LAG da fila (reusar a elástica existente — `getQueueLagSnapshot` da engine-pool:
  fila com trabalho → aquece o 30B e processa, qualquer hora) e FREIA por atividade de usuário
  (gente logando/usando → elástico desliga o lote pesado; mapear o sinal existente em
  auth/users `lastActivity` e reaproveitar — NÃO construir scheduler novo, NÃO cron fixo).
- **Validação viva em 2 degraus:** (1º) tudo local — backend local + fila local ON + worker local,
  lead descartável de ponta a ponta; (2º) apontar pro VPS de verdade.
Entrega: worker + testes + `RESULTADO-E1.md` com o fluxo provado nos 2 degraus.

### CHIP E2 — :3107 vira o cockpit do Cérebro 30B
- Gauge real: residente/frio, fila (pendentes/rodando/mortas), throughput da última janela,
  últimos N jobs com resultado, erros/disjuntor.
- Corrigir msg "12min"→"~3min" e a tag da allowlist (§3.3); remover 7b; botão **descarregar**.
- **Aquecimento ELÁSTICO (decisão do dono 05/07 — sem hora fixa, sem cron):** fila com trabalho →
  aquece sozinho e processa; usuários logando → elástico desliga o lote e o painel mostra POR QUÊ
  ("cedendo a vez — N usuários ativos"). Reaproveitar elástica da engine-pool + turbo_noturno;
  o botão manual de aquecer continua.
- Interlock visível: "PC-off = fila espera no VPS" (estado, não erro).
Entrega: painel funcionando local + `RESULTADO-E2.md` com prints.

### CHIP E3 — Visibilidade do CLIENTE (a exigência central do dono)
O cliente TEM que ver a IA trabalhando e a fila — na vitrine E no estoque, não só no detalhe:
- Estados reais por card, ligados ao status REAL da missão (endpoint novo, leve, por lote de
  leads): **"⏳ Na fila da IA — posição N"** → **"✨ IA enriquecendo agora"** (shimmer que já
  existe) → **"✓ Enriquecido por IA"** (mostrando O QUE chegou: +2 telefones, +1 e-mail, nota).
- Honestidade PC-off: fila parada além de um TTL → texto muda ("na fila — processa hoje à noite"),
  NUNCA spinner eterno. A promessa vira feature: "IA trabalha de madrugada no seu estoque".
- Tudo em token/classe central (Leis do Design System; shimmer do `kit.css` reaproveitado);
  `detalhes-negocio.tsx` já tem os 3 estados — estender pra vitrine (`leads/page.client.tsx`) e
  estoque de Vendas.
Entrega: telas + `RESULTADO-E3.md` (prints antes/depois).

## 6. FASE D — implantação e prova fim-a-fim

### CHIP D1 — Ligar em produção + validação com lead real
1. VPS: `HBX_MISSION_QUEUE_ENABLED=true` no `/root/HBX/backend/.env` + RECREATE (método docker
   inspect → dump dos -e → rm -f → run; regra INFRA). `HBX_AI_EXTRACTION_ENABLED=true`.
2. Local: worker ON apontando pro VPS, agenda ativa, 30B aquecido.
3. **Prova com lead real:** cliente (conta de teste) puxa lead → card mostra "na fila da IA" →
   worker processa → card volta enriquecido com badge e contatos gateados → conferir no banco
   (`LeadContact` source `ai_extraction`) e na tela.
4. Medir o ciclo completo (puxou→enriquecido) de dia (conta-gotas) e simular o de madrugada.
5. Publish com o dono (código do E1/E2/E3 precisa de publish antes do D1).
Entrega: `RESULTADO-D1.md` = a promessa provada com horário e print.

## 7. Decisões do dono (embutidas nos chips, ninguém decide sozinho)

| # | Decisão | Quando |
|---|---|---|
| 1 | ~~Xray se o 30B não ranquear~~ **RESOLVIDA pelo T1 (05/07): o 30B RANQUEIA** (85/75/85 · 65/75/65/40 · 30/55/40, sem saturar) → nota honesta migra pro 30B via missão (E1); o 4b-degradado injetado no CHIP 6 fica como INTERINO até a ponte entrar | — |
| 2 | ~~Agenda de aquecimento/janela~~ **RESOLVIDA 05/07: ELÁSTICO** — sem hora fixa; fila com trabalho = roda, usuários logando = elástico desliga; reaproveitar elástica/turbo existentes | — |
| 3 | Copy do cliente ("Na fila da IA", "IA enriquecendo", "Enriquecido por IA") — texto final | E3 |
| 4 | ~~Meta de leads/noite~~ **RESOLVIDA 05/07: SEM META** — roda até o elástico desligar (gente logando); a conta do T2 vira dimensionamento informativo, não meta | — |

## 8. Relação com o CHIP 6 (rodando agora)

O CHIP 6 (injeção do 4b-instruct na VPS) é o LADO VPS desta arquitetura — segue valendo inteiro.
Única interação: quando ele perguntar do xray, a resposta ganha contexto novo — **"degradado
interino"** (ou OFF) **até a ponte 30B existir**, porque a nota honesta pode vir do 30B via missão
(decisão real no T1). O 7b não entra na VPS em nenhum cenário.

## 9. GOVERNOR-IA — regra ABSOLUTA do dono (05/07): "não chega paulada nos IAs; tem que ter fila"

**Por quê (dado, não opinião):** CHIP 5 provou que lote de cards atropela o bot (p95 31–38s vs
gate); o Ollama até enfileira sozinho (NUM_PARALLEL=2 + fila interna), mas fila ÚNICA/FIFO
consagraria o atropelo — o bot entraria atrás de 50 raios-X. Fila SIM, com FAIXAS e prioridade.

**Design — `AiGatewayService` (backend), ponto ÚNICO de passagem de TODA chamada de IA:**
- **2 faixas**: `realtime` (bot `ai-intent-classifier`, `intent-engine`, assistente sandbox) —
  passa NA FRENTE, sempre; `batch` (xray-note, saneamento, extração manual) — concorrência 1,
  PAUSA enquanto houver realtime esperando, espera o quanto for.
- **Recusa cedo, não trava fundo**: espera prevista > orçamento de timeout do caller → nem entra
  na fila; devolve "indisponível" NA HORA e o caller cai no fallback que JÁ tem (keyword/roteiro/
  nota-null). Fila com profundidade LIMITADA por faixa (estouro = recusa graciosa).
- **Espelhar o padrão da casa**: mesma filosofia do `SourceBudgetService` (governor por fonte).
- **Telemetria**: contadores por faixa (aceitas/recusadas/aguardando/p95 de espera) expostos no
  tree-status/:3107 — fila invisível é fila crescendo sem ninguém ver.
- **Fora do escopo**: ponte-worker do 30B local (a serialização dele É a fila de missões — já
  cumpre a regra por construção); Webwhats.
- **Aceite**: teste de rajada — 20 chamadas batch + 5 realtime simultâneas → realtime fecha dentro
  do orçamento, batch cede; com gateway OFF reproduzir o atropelo (grupo de controle); starvation
  reversa coberta (batch não morre de fome eterna: processa quando realtime esvazia).

## 10. V-FINAL — "garanta tudo funcionando" (ordem do dono 05/07)

Depois do governor, UM worker de validação integrada local (nada de prod): stack local de pé +
Ollama + ponte + governor → (a) rajada real provando a regra absoluta na prática; (b) ciclo
completo do lead descartável (fila → 30B → gate → card com badge visível); (c) regressão das
suítes de TODOS os módulos tocados na frente (bot, assistente, webscraping/missions, local-agent,
front typecheck+check-pele); (d) checklist da promessa: BOT ✓ Assistente ✓ Cards ✓ fila-visível ✓
governor ✓ ponte ✓. Entrega `RESULTADO-V.md`. O que passar daqui, o D1 só repete em produção.

## Ordem de disparo (1 worker por vez, bench exclusivo no rig)

**T1 ✅ → T2 ✅ → E1 ✅ → E2 ✅ → E3 (rodando) → GOVERNOR-IA (Opus) → V-FINAL → D1 (com o dono).**
