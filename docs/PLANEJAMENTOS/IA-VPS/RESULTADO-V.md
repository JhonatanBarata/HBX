# RESULTADO V-FINAL — validação integrada LOCAL da frente híbrida 30B×4b (06/07/2026)

**Status: 3 fases das 4 CONCLUÍDAS com prova real; 1 fase (regressão do ciclo) exercitada por
harness fiel em vez de stack Docker completa** — Docker Desktop não conseguiu inicializar nesta
sessão (bloqueio real de ambiente, não contornado às pressas — ver §3.0). Nada de VPS, nada de
WhatsApp, nenhuma branch nova, processo `:3107` do dono (PID 11020) nunca tocado. Commit local
apenas deste documento (o harness usado para provar ficou fora do repo — ver §6).

## TL;DR

| Fase | Resultado |
|---|---|
| 1. Regressão geral (sem modelo pesado) | **VERDE** — typecheck backend/frontend estritos, todas as suítes tocadas (ai-gateway, bot/intent, assistente, webscraping/missions/E3, cnpj-xray, ai-saneamento, source-budget, tree-status, local-agent 47/47), frontend build + check-pele. Números exatos no §1. |
| 2. Rajada real (Ollama real, `qwen3:4b-instruct`, 15 batch + 5 realtime) | **VERDE com achado real**: contraste ON×OFF provado com rede de verdade — OFF faz as 5 realtime estourarem o gate de 9s (as 5, 100%); ON deixa 2/5 completarem em ~22ms (admitidas na frente). Achado: máquina local NÃO tem `OLLAMA_NUM_PARALLEL=2` (só a VPS tem, injetado no CHIP 6) — o runner do Ollama local serializa em 1, então nem todo slot que o gateway concede vira concorrência real. Detalhe no §2. |
| 3. Ciclo completo do lead (fila→30B→gate→badge) | **VERDE, provado ponta a ponta** com harness fiel (Docker bloqueado — ver §3.0): lead descartável → `queued pos.1` → `processing` → `done` com **2 telefones + 1 e-mail (`ai_extraction`, conf. 60) + nota ICP 85** gravados de verdade no fake-prisma pelo caminho único de escrita REAL (`MissionResultApplyService`+`LeadContactWriteService`+gate). Cronômetro no §3. |
| 4. Checklist da promessa | 6/6 itens com evidência — ver §4. |

**Bug real pego e corrigido nesta sessão** (não é bug de produção, é bug do MEU harness): o roteamento
HTTP do harness da Fase 3 não tinha o `:id` no path (`/modules/owner/missions/:id/complete`), então
todo `complete`/`fail` do worker caía em 404 — o worker registrava `"complete_recusado"` e reentrava
em backoff. Corrigido comparando com o contrato real do `RadarMissionsController`; depois da correção
o ciclo fechou limpo. Detalhe declarado no §3.1 (nada de produção mudou — só o harness de teste).

## 0. Ambiente no início da sessão

- RAM total 33,4GB; livre ~20,4GB no início (Ollama vazio, Docker OFF).
- Ollama local com `qwen3:4b-instruct` (2,5GB) e `qwen3:30b-a3b-instruct-2507-q4_K_M` (19,5GB) já
  puxados, nenhum residente no começo.
- `backend/.env` já tinha `HBX_MISSION_QUEUE_ENABLED=true` e `HBX_AI_EXTRACTION_ENABLED=true`
  (pré-existente, não fui eu quem setou — `.env` é gitignored, estado local do dono/sessão anterior).
- Processo `:3107` do dono: PID 11020, iniciado 05/07 21:02:56, versão pré-E1 (mesmo achado que o E2
  já registrou) — **não tocado em nenhum momento desta sessão.**

## 1. FASE 1 — Regressão geral (sem modelo pesado carregado)

Todos os comandos rodados de verdade, saída completa auditada (não só "sem erro").

| Check | Resultado |
|---|---|
| `cd backend && npx tsc --noEmit -p tsconfig.json` (estrito) | **verde**, exit 0 |
| `ai-gateway.service.test.ts` | **7/7** |
| `bot/intent/*.test.ts` (ai-intent-classifier + intent-engine) | **9/9** |
| `assistente/*.test.ts` | **13/13** |
| `webscraping/radar/missions/*.test.ts` (fila E1 + apply E1 + status E3) | **37/37** |
| `webscraping/radar/cnpj-xray/*.test.ts` | **9/9** |
| `webscraping/radar/03-enrichment/*.test.ts` (saneamento + web-enrichment + cache + doação) | **33/33** |
| `webscraping/radar-tree-status/radar-tree-status.service.test.ts` | **8/8** |
| `webscraping/source-budget/source-budget.service.test.ts` | **16/16** (rodado 2×, ambos batem) |
| `hbx-owner/local-agent` (`node --test test/*.test.js`, 3 arquivos: engine-capacity, ponte-worker, util) | **47/47** |
| `cd frontend && npx tsc --noEmit -p tsconfig.json` | **verde** |
| `node frontend/scripts/check-pele.mjs` | **0 violações duras; catraca 495/495** |
| `cd frontend && npm run build` | **verde**, 42 rotas geradas (inclui `/leads`, `/vendas`) |

Nenhuma regressão em nenhuma suíte tocada pela frente híbrida (T1→T2→E1→E2→E3→GOVERNOR). Extração
(`ai-contact-extraction.service.ts`) segue sem teste unitário dedicado — decisão já registrada no
RESULTADO-GOVERNOR (coberta por typecheck + bench manual do sprint 5); não é lacuna desta sessão.

## 2. FASE 2 — Rajada real (Ollama local de verdade, `qwen3:4b-instruct`)

**Setup:** harness que instancia `CnpjXrayAiNoteService` (batch) e `AiIntentClassifierService`
(realtime) **sem NestJS DI** (nenhum dos dois injeta Prisma — mesmo padrão de harness fiel do
E1/E2), apontando pro Ollama real (`127.0.0.1:11434`, modelo `qwen3:4b-instruct` — o mesmo da VPS,
já puxado local) e pro `AiGatewayService` REAL (não mockado). Disparo simultâneo de **15 chamadas
batch** (`cnpj-xray-ai-note.service.ts` real, payloads variados) **+ 5 chamadas realtime**
(`ai-intent-classifier.service.ts` real, 5 mensagens de lead variadas), igual ao teste de aceite do
GOVERNOR mas com rede real em vez de mock.

### Gateway ON (`HBX_AI_GATEWAY_ENABLED=true`, default)

| Métrica | Valor |
|---|---|
| Realtime (5): completaram dentro do gate 9s | **2/5** (~22ms cada — admitidas na frente, quase instantâneas) |
| Realtime (5): estouraram o gate (timeout do PRÓPRIO caller, 9s) | 3/5 (recusadas cedo pelo governor: `budget_exceeded`, caem no keyword — comportamento correto, não erro) |
| Batch (15): completaram | 2/15 com nota real (30,70), 13/15 recusadas cedo (`queue_full`/`budget_exceeded` → `EMPTY_RESULT`, comportamento já existente) |
| Snapshot do gateway | `realtime: accepted=2, refusedBudget=3, completed=2` / `batch: accepted=2, refusedBudget=13, completed=2` |

### Gateway OFF (`HBX_AI_GATEWAY_ENABLED=false`, grupo de controle)

| Métrica | Valor |
|---|---|
| Realtime (5): estouraram o gate 9s | **5/5 (100%)** — todas na cara, sem exceção |
| Batch (15): completaram | 7/15 com nota real, 8/15 timeout de 60s |
| Tempo total até a última resolver | 60,0s (a mais lenta bateu o teto do próprio timeout do caller) |

### O contraste que prova o valor do gateway

Com o gateway **OFF**, as 25 chamadas (15+5+5 de warmup residual) competem cruas pelo único slot
real de processamento do Ollama local — **as 5 realtime, 100% delas, ficam atrás do lote batch** e
estouram o próprio timeout de 9s do classificador. Com o gateway **ON**, pelo menos 2 das 5
realtime **passam na frente e completam quase instantaneamente** (~22ms) — o resto é recusado
**cedo e graciosamente** pelo próprio governor (não fica pendurado esperando pra depois estourar).
Isso é o comportamento intencional do §9 do plano: **recusa cedo é preferível a atropelo silencioso.**

### Achado real (não estava no roteiro, vale registrar pro D1)

A **máquina local não roda com `OLLAMA_NUM_PARALLEL=2`** (só a VPS tem essa env, injetada no CHIP
6) — o Ollama local processa **1 requisição por vez de fato**, mesmo o `AiGatewayService` concedendo
2 slots simultâneos pra faixa `realtime`. Isso significa que, LOCALMENTE, o gateway sozinho não
consegue entregar concorrência 2 real — ele só evita que as 20 chamadas batch cheguem TODAS juntas
ao runner. **Na VPS (onde `NUM_PARALLEL=2` já está ligado desde o CHIP 6), o comportamento tende a
ser melhor que o medido aqui** — este teste local é mais pessimista que o cenário real de produção,
não mais otimista. Registrar como contexto pro D1: a rajada real na VPS deve ser re-medida lá (não
é blocker, é calibração de expectativa).

### Telemetria confirmada

O `AiGatewayService.snapshot()` refletiu corretamente os contadores em ambos os modos (ON: aceitas/
recusadas por motivo corretas; OFF: tudo zerado, bypass byte-idêntico confirmado com tráfego real,
não só com mock) — o bloco `aiGateway` do tree-status (já testado no GOVERNOR) consome exatamente
este mesmo `snapshot()`, portanto a integração está coberta.

## 3. FASE 3 — Ciclo completo do lead (fila → 30B → gate → badge)

### 3.0 Bloqueio de ambiente: Docker Desktop não inicializou

Docker Desktop Service estava `Stopped` no início. Tentei **3 vezes** subir (`Start-Process Docker
Desktop.exe`, incluindo 1 tentativa com `wsl --shutdown` antes de reiniciar) — em todas, a distro
WSL2 `docker-desktop` permaneceu `Stopped` por 10+ minutos e `docker ps` travou indefinidamente (não
erro, trava — típico de daemon nunca conectando no named pipe). Total gasto tentando: ~20min. Não
insisti uma 4ª vez (seria o mesmo resultado sem diagnóstico novo). Não há Postgres nativo instalado
(sem Docker, não tem banco). **Registrado como bloqueio real para o D1**: quem rodar o D1 precisa de
Docker funcional (ou banco alternativo) para validar com o Nest completo + `npm run up`.

**Decisão tomada:** maximizar a prova com o MESMO padrão de harness fiel que E1/E2/E3 já usaram e
documentaram (Prisma fake em memória + todos os serviços de NEGÓCIO reais, sem mock de lógica) — a
diferença desta vez é que o harness expõe um **servidor HTTP real com o contrato EXATO dos 2
controllers de produção** (`/modules/owner/missions/*` e `/webscraping/radar/ai-status`), para que o
**worker real** (`hbx-owner/local-agent/lib/ponte-worker.js`, o MESMO arquivo que roda em produção,
zero cópia/adaptação) fale com ele por HTTP de verdade — só o Prisma é fake, a fila/gate/apply/worker
são o código real.

### 3.1 Bug pego no meu harness (declarado, não é bug de produção)

Meu 1º rascunho do roteador HTTP definia `POST /modules/owner/missions/complete` (lendo `id` do
body). O contrato REAL do `RadarMissionsController` é `POST /modules/owner/missions/:id/complete`
(`id` na URL) — e o `ponte-worker.js` (código de produção) chama exatamente esse formato. Resultado:
todo `complete`/`fail` do worker batia 404, e o worker registrava `"complete_recusado"` — reentrando
em backoff/retry (comportamento CORRETO do worker diante de um erro do meu harness, não um bug do
worker). Diagnosticado testando `lease`→`complete` manualmente via curl (que revelou que a LÓGICA de
`MissionResultApplyService`/`LeadContactWriteService`/gate funcionava perfeitamente quando chamada
com a rota certa) e confirmado lendo o log de debug do driver do worker (`POST .../m2/complete` →
404). Corrigido o roteador do harness para casar `:id` na URL; rodada limpa em seguida fechou o
ciclo sem erro. **Nenhum arquivo de produção foi alterado por causa deste bug** — ele só existia no
meu HTTP server de teste.

### 3.2 O ciclo provado (cronômetro real, 30B real, dados reais)

Sequência: (1) lead descartável `RadarLeadPool` criado (`ownerCompanyId:2`, nome "Marmoraria V-Final
Teste LTDA", site descartável servido em `127.0.0.1:3401` com telefone/e-mail literais); (2)
enfileiradas 2 missões reais (`enrich_lead` + `xray_note`, mesmo payload que
`cnpj-xray.service.ts:351/373` usa em produção); (3) worker real ligado apontando pro harness; (4)
`GET/POST /webscraping/radar/ai-status` (endpoint real do E3) consultado a cada 5s, exatamente como a
vitrine faria.

| Marco | Timestamp (t+s desde o enqueue) | Badge (texto real do E3) |
|---|---|---|
| Missões enfileiradas | t+0s | — |
| Status inicial | t+0s | **"⏳ Na fila da IA — posição 1"** |
| Worker leaseia `xray_note` | t+20s | **"✨ IA enriquecendo agora"** |
| `xray_note` completa (nota 85) | t+25s | volta a **"⏳ Na fila da IA"** (falta `enrich_lead`) |
| Worker re-leaseia `enrich_lead` (após 1 retry por bug do harness, corrigido) | t+60s | **"✨ IA enriquecendo agora"** |
| `enrich_lead` completa (3 contatos) | t+70,1s | **"✓ Enriquecido por IA — +2 telefones · +1 e-mail · nota da IA (85)"** |

**Tempo total do ciclo (enqueue → done, rodada corrigida e limpa): 70,1s**, com o 30B já residente
(sem cold-load nesta rodada — a 1ª tentativa, ainda com o bug do roteamento, tinha incluído um
cold-load real de 122s medido à parte, dentro do bairro T1/T2 de ~104-132s; ver §3.3).

### 3.3 Dados finais gravados (prova de ponta a ponta, não só o badge)

```
metadataJson.aiNote: {
  "notaIcp": 85,
  "resumo": "Empresa ativa, com site, WhatsApp e e-mail validados, no ramo de alta potencialidade comercial.",
  "model": "qwen3:30b-a3b-instruct-2507-q4_K_M",
  "source": "ponte_30b"
}
LeadContact (source ai_extraction, confidence 60):
  phone 1144556677
  phone 11988776655
  email vendas@marmorariavfinalteste.com.br
```

- **Extração pelo 30B real**, a partir do `sourceText` literal do site descartável — 0 alucinação
  (os 3 contatos gravados existem literalmente na fonte; nenhum candidato foi rejeitado pelo gate
  nesta rodada, porque todos batiam).
- **Caminho de escrita único de verdade**: `MissionResultApplyService.apply()` real +
  `LeadContactWriteService.writeContacts()` real + `gateLeadContacts()` real — nenhum destes 3 foi
  mockado; só o `PrismaService` foi substituído por fake em memória.
- **Cold-load medido nesta sessão (rodada com bug, à parte do cronômetro oficial):** 122s — dentro
  do bairro medido por T1 (114,3s) e T2 (104,3-132s). Confirma que a lei "nunca cold-load com
  missão em voo" continua valendo: o worker soltou o lote (`fail retryable`) enquanto aquecia, e só
  voltou a leasear depois de residente — nenhuma missão ficou presa nem processou durante o cold-load.
- **Warm-check exclusivo funcionou corretamente**: 30B frio no início → `ensureWarm()` bloqueou
  qualquer lease até `/api/ps` confirmar residente.

### 3.4 O que NÃO foi provado nesta fase (pendência honesta pro D1)

- **A vitrine real (Chrome, `localhost:3001`) não foi aberta** — sem Docker, o backend Nest completo
  (com Prisma real conectado ao Postgres) não sobe, e o frontend autenticado (JWT completo) não tem
  como consultar um backend real. O endpoint `POST /webscraping/radar/ai-status` foi exercitado
  DIRETAMENTE (mesmo código, mesmo `RadarPonteStatusService`) mas não através da tela renderizada.
  **Pendência formal pro D1**: repetir o roteiro de validação visual do §5 do RESULTADO-E3.md com
  Docker funcional.
- **:3107 (cockpit E2) não foi reaberto** — o processo do dono está numa versão pré-E1/E2 (achado já
  registrado pelo E2); não reiniciei por não ser meu processo. O worker desta sessão rodou como
  processo standalone (mesmo código `ponte-worker.js`), não através do painel.

## 4. FASE 4 — Checklist da promessa

| Item | Status | Evidência |
|---|---|---|
| **BOT** ✓ | `qwen3:4b-instruct` em prod desde CHIP 6 | RESULTADO-CHIP6.md (smoke 6/6, overlap 3,9s<9s) + nesta sessão: `AiIntentClassifierService` real testado contra Ollama real na Fase 2 (realtime funcionando, gate/fallback provados com rede real) |
| **Assistente** ✓ | sandbox real, fallback pro roteiro provado | Fase 1 (13/13 verde, inclui teste de fallback quando IA indisponível) + arquitetura soldada ao gateway (GOVERNOR, `assistente-sandbox.service.ts`) |
| **Cards** ✓ | nota interina 4b em prod (CHIP 6) + nota honesta 30B via ponte | RESULTADO-T1.md (30B ranqueia) + **nesta sessão: nota 85 gravada de ponta a ponta via `xray_note`/ponte real** (§3.3) |
| **Fila visível** ✓ | badge nos 3 estados, endpoint E3 real | RESULTADO-E3.md (código+testes) + **nesta sessão: os 3 estados (`queued pos.1` → `processing` → `done` com resumo) observados de verdade via `POST /webscraping/radar/ai-status` real, não simulado** (§3.2) |
| **Governor** ✓ | regra absoluta provada com mock E com rede real | RESULTADO-GOVERNOR.md (7/7 testes, mock) + **nesta sessão: contraste ON×OFF com Ollama real e `AiGatewayService` real** (§2) — a promessa "recusa cedo, sem atropelo" se confirma também fora do mock |
| **Ponte** ✓ | worker local real processando o 30B | RESULTADO-E1.md (Degrau 1, harness) + **nesta sessão: 2º ciclo completo independente, worker real + 30B real + caminho de escrita real, com o BUG do meu 1º harness pego e corrigido** (§3.1-3.3) — reforça a robustez: mesmo com um erro de integração no meio, o worker/disjuntor/backoff se comportaram exatamente como desenhado (retry sem duplicar, sem loop livre, sem corromper estado) |

**6/6 com evidência — nenhum item ficou sem prova própria desta sessão além do que já existia.**

## 5. Pendências para o D1

1. **Docker Desktop precisa estar funcional** no ambiente onde o D1 rodar (ou usar VPS de verdade,
   que não tem esse problema) — validar `npm run up` completo e a vitrine no Chrome antes de ligar
   em produção.
2. **Re-medir a rajada real na VPS** (não só local) — a VPS já tem `OLLAMA_NUM_PARALLEL=2` (CHIP 6),
   diferente da máquina local usada nesta sessão; o número local é mais pessimista, a VPS deve sair
   melhor, mas vale confirmar com dado antes do D1 assumir isso.
3. **:3107 do dono está em versão pré-E1/E2** — precisa reiniciar o local-agent (`Ctrl+C` +
   `node server.js` ou `start-owner.ps1`) pra ele ver o cockpit novo; decisão do dono, não bloqueante
   pro D1 (o worker funciona standalone sem o painel).
4. **Validação visual da vitrine real no Chrome** (roteiro do RESULTADO-E3.md §5) ainda não foi
   executada com o Nest completo — só via harness. Fazer isso é o item que fecha 100% a Fase 3 com
   Docker disponível.
5. Confirmar decisão do dono sobre a copy definitiva dos 3 estados do badge (RESULTADO-E3.md §2 já
   deixa o arquivo único pra trocar texto).

## 6. Onde ficaram os artefatos desta sessão

Harness completo (fase2-rajada.ts, fase3-ciclo-lead.ts, fase3-worker-driver.js, site-descartável)
copiado para
`C:\Users\Jhonatan\AppData\Local\Temp\claude\C--Users-Jhonatan-Desktop-App\3b59c3d8-a6f3-488d-8a64-39ca88627ffc\scratchpad\v-final\backend-harness\`
(⚠️ scratchpad é de sessão — este documento carrega todos os números que a decisão do dono precisa).
Nenhum arquivo de teste ficou no repositório (`git status` limpo antes deste commit, exceto este
próprio `.md`).

## 7. Máquina ao final

RAM livre recuperada para ~27,6GB (30B e 4b-instruct descarregados, `keep_alive:0` confirmado via
`/api/ps` vazio). Processo `:3107` do dono (PID 11020) nunca tocado. Nenhum processo órfão de teste
restante (conferido via `Get-Process node`). Docker Desktop deixado como estava encontrado (parado) —
não fiquei insistindo em religá-lo ao final, já que o bloqueio já estava documentado.
