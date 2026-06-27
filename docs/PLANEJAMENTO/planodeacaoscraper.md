# Plano de Ação — Scraper / Motor de Leads HBX

> **Plano, não execução.** Nada aqui é pra publicar antes do teste limpo de
> [arquiteturascraper.md](arquiteturascraper.md) preencher os `{ }`. Cada fase tem um **GATILHO** = o veredito
> que a destrava. Se o teste disser que a teoria estava errada, a fase correspondente morre (ou muda).
>
> **Princípio que furou nos 8 deploys:** medir o net-new ANTES, fix DEPOIS. A Fase 0 existe pra nunca mais
> voar cego. **Regra do dono:** "construir algo que MOSTRA o real E OBEDECE" — não algo que precisa da IA pra
> operar. Todo fix aqui mira "se repetir, o sistema resolve sozinho OU o dono resolve no painel".

---

## Mapa de fases (ordem de execução)

| Fase | Nome | Gatilho (veredito de arquiteturascraper.md) | Custo | Ganho esperado |
|------|------|---------------------------------------------|-------|----------------|
| 0 | Instrumento de medição | **Sempre** (pré-requisito de tudo) | baixo | para de voar cego |
| 1 | Espremer o grátis | A1/A2/A3 + B1-B7 confirmados | médio | +centenas a ~1-2k, e acaba |
| 2 | Frota que escala de verdade | C1-C4 confirmados | médio | usa a capacidade certa (não +timeout) |
| 3 | Fonte nova (volume real) | A3+A4 = teto grátis CERTO | alto ($) | dezenas de milhares (o "à vontade") |
| 4 | Owner observável e obediente | E1-E7 confirmados | médio | painel não mente + freio auto-age |
| 5 | Monetização grátis→pago | A4 + decisão de fonte | médio | margem protegida (List/Lead/Pro/Company) |

---

## FASE 0 — Instrumento de medição (montar PRIMEIRO, sempre)

**Objetivo:** transformar "o número subiu?" numa leitura de 1 clique, não numa cirurgia SSH.

- **0.1 — Painel "Por que não está raspando?"** (já pedido pelo codex, PDF §P1.9). Causas reais lado a lado:
  sem fila · fábrica parada · governor off · sem backend VPS · SSH off · limite comercial · motor offline ·
  import rejeitando · duplicidade alta · filtro restritivo.
  Arquivos: `hbx-owner/local-agent/web/app.js` + endpoint novo no `server.js` que agrega factory-status +
  engines-status + contagem de fila.
- **0.2 — Medidor de net-new embutido.** Card no Owner que roda a query 0.2/0.3 do teste (`RadarLeadPool`
  últimos 10/60 min) e mostra "X cards novos na última hora" com sparkline. Fonte da verdade = banco, não log.
- **0.3 — Honestidade do batch.** No factory-status, separar `saved` real de `duplicate`/`rejected` (hoje
  `cardsSavedToday` vem de `RadarLeadPool.createdAt`, mas o batch "completed" pode ser 100% duplicado — ver
  teste 0.6). Mostrar os 3 números, nunca só "completed".

**Pronto quando:** dono abre o Owner e vê net-new real + motivo do não-raspar SEM me chamar.
**Reversão:** localhost, `git revert`. Risco: nenhum (só leitura/UI).

---

## FASE 1 — Espremer o resto do grátis

> **GATILHO:** A1/A2 (top-N raso, sem paginação) + B2 (dedup-por-cidade) confirmados. **Ganho honesto: diminuto**
> (+centenas a ~1-2k). Só vale porque é barato e o plumbing já existe. **Se A3 disser que o teto já foi 100%
> batido, pular direto pra Fase 3.**

- **1.1 — Cobertura cidade-grande × todos os segmentos.** Garantir que `MAJOR_BR_CITIES` (42 cidades) cruza
  com TODOS os `getMassDataSegments` antes de cair na cauda IBGE. Hoje o cursor é linear; medir se ele chega a
  esgotar a matriz grande. Arquivo: `radar-core-factory-admin.mixin.ts:320,337,405`.
- **1.2 — Re-mineração consciente (pegar o "resto" do combo).** Hoje combo minerado volta vazio por dedup. Se
  A2 confirmar que não há página 2, criar variação de query/raio pra buscar o que ficou de fora (os ~171 de SP
  que provei). NÃO é paginação real — é diversificar a query do mesmo combo. Arquivo:
  `google-search-query-builder.ts:66` (`buildLeadDiscoveryQueries`).
- **1.3 — Profundidade do grátis até onde der.** `batchSize: 20` → testar subir o `clampLimit`/`quantity` no
  caminho textual (máx 100) e medir net-new vs timeout. Arquivos: `...mixin.ts:762`,
  `google-search-query-builder.ts:43`.
- **1.4 — Higiene de fila automática.** O `purgeDeadMassDataQueue` já existe como botão; agendar o
  auto-exaurir de combo `foundCount=0` pra fila não reenvenenar sozinha. Arquivo: `...mixin.ts:889`.

**Pronto quando:** net-new de 1 noite de cidade-grande > trickle histórico, com fila limpa e cursor em SP.
**Reversão:** flags/env, `git revert`. Risco: subir limite demais → mais timeout/IP (medir C4 antes).

---

## FASE 2 — Frota que escala de verdade

> **GATILHO:** C1 (roda 6 não 20) + C2 (reserva/memory guard é a causa) confirmados. **Atenção à tese C4:**
> se 20 motores só geram timeout e 6 produz igual, **NÃO escalar** — corrigir é deixar a frota no número que
> a fonte aguenta, não no maior.

- **2.1 — Travar os 2 envs de frota.** `HBX_ENGINE_URLS` + `HBX_LIST_ENGINE_COUNT` no `.env` raiz (local E
  VPS) pra `docker compose recreate` não derrubar pro default 1. Documentar que não sobem no deploy.
- **2.2 — Tornar a capacidade visível e honesta.** Expor `automaticAllowedEngines = configurado −
  manualReservedEngines − memoryGuard` no painel, com o motivo do corte. Arquivo: `getRadarFactoryStatus:1058`,
  `protection{}`.
- **2.3 — Calibrar pela tese C4 (não pelo maior número).** Se o teste provar que N≈6 ≥ N≈20 em net-new e
  queima menos IP, fixar a frota no ponto de melhor net-new/timeout — e matar a crença "20 / elasticidade é o
  único freio" (já marcada como furada na memória). Arquivo: governor + scheduler.
- **2.4 — Disjuntor de motor preso.** Tarefa `running` com `lockedUntil` vencido → liberar/expirar sozinha
  (não esperar IA). Arquivo: `WebscrapingCampaignTask` lock + `maxAttemptsPerTask`.

**Pronto quando:** painel mostra a frota real, o motivo de cada motor parado, e o número de motores está no
ótimo de net-new (não no máximo cego).
**Reversão:** env + `git revert`. Risco: env errado na VPS derruba a frota (ver C3 antes).

---

## FASE 3 — Fonte nova (o único caminho do volume real)

> **GATILHO:** A3 (teto grátis ~5k é real) confirmado. Esta é a conversa de FONTE, não de fix. **Decisão do
> dono** entre os caminhos abaixo — preencher no veredito geral do teste.

- **3.1 — Google Places API com paginação** (recomendado pra volume controlado). O plumbing JÁ existe
  (`PLACES_NEW_TEXT_SEARCH_URL`, `usePlacesApi:false`). Ligar + implementar `nextPageToken` (60+/combo vs 20).
  Custo: pago por request. Arquivos: `google-search-provider.service.ts`, `google-search-query-builder.ts:45`.
  **Sub-passo obrigatório:** estimar custo/1000 cards ANTES de ligar em massa (cota + billing).
- **3.2 — Compra de base / outra fonte** (alternativa de volume bruto). Pipeline de import já existe
  (`lead-harvest/lead-harvest-import.service.ts`). Avaliar custo/qualidade/legalidade vs Places.
- **3.3 — Proxies/headless só se a fonte exigir** (teoria [G] F10). Não é causa do problema atual; entra só
  se a fonte nova bloquear por IP. Não construir por via das dúvidas.

**Pronto quando:** 1 combo de cidade grande rende 60+ (não 20) e o custo/1000 cards está medido e aprovado.
**Reversão:** feature-flag `usePlacesApi`; desligar volta ao grátis. Risco: **dinheiro** — gate de custo
obrigatório, revisão do diff do dono (frente financeira = Opus edita direto + revisão).

---

## FASE 4 — Owner observável e obediente (bugs do codex)

> **GATILHO:** E1-E7. Ataca "painel mente" e "controle não obedece" — as duas frentes que o dono mais odeia.

**P0 — corrigir a mentira visual (rápido, alto valor):**
- **4.1** Filtro e-mail/telefone usa `ckGetValue(row,"email"/"phone")` (lê `emails[]`), não só `row.email`.
  Arquivo: `hbx-owner/local-agent/web/app.js` (`ckApplyFilters`). [E4]
- **4.2** `/owner/ops/cnpj-backfill` respeita o `scope` (local→backend local, vps→ops-control→backend VPS,
  both→os dois). Arquivos: `server.js:77-113` + `ops-control/server.js`. [E3]
- **4.3** Tabela de motores com divergência explícita: `Backend | Docker | Health | Último erro | Produção`
  + veredito (ex.: "registro fantasma"). Acaba com "ligado ou não?". [E1/E2]
- **4.4** Pill de Ops granular: `ops api | ssh vps | backend vps | backend local` (cada um ok/falha), não
  "token existe". [E5]

**P1 — contrato único FleetSnapshot:**
- **4.5** `GET /owner/fleet-snapshot?env=local|vps|both` no formato do PDF §5 (desired/observed/pressure/
  queue/engines[]/verdict). Backend/Agent/Ops normalizam; **front só renderiza**. Campos ricos já existem em
  `hbx-engine-pool.service.ts:142-194`. [E7]
- **4.6** Botão de motor por estado explícito (`desiredState`/`observedState`/`transition`), não timeout fixo
  — mata o "botão que volta". [E2]
- **4.7** Feed de eventos honesto: `engine.started/stopped/health_failed/ghost_detected`, `job.queued/
  completed/import_rejected`, `provider.rate_limited`. Diagnóstico por evento, não inferência. [C]

**Pronto quando:** o que o painel diz bate com `docker ps` + banco no mesmo instante, e parar motor PARA e FICA.
**Reversão:** `git revert` (localhost). Risco: baixo (UI/observabilidade).

---

## FASE 5 — Monetização grátis→pago (margem protegida)

> **GATILHO:** A4 + decisão de fonte da Fase 3. A escada L0-L5 já está escrita nas regras
> (`docs/Rules/MOTOR.md:39-58`); aqui é amarrar a fonte paga como **plugin premium por plano**.

- **5.1 — Quotas por plano:** List (dados crus) · Lead (e-mail/site/social) · Pro (inteligência/priorização) ·
  Company (enriquecimento premium sob demanda). [C §P2.13]
- **5.2 — Worker pool por prioridade:** P0 cliente pagando alto · P1 busca manual · P2 fila noturna ·
  P3 laboratório/local. [C §P2.14]
- **5.3 — Pago só quando o grátis não resolve.** Enriquecer roda L0-L5 grátis primeiro, acumula, e só aciona
  P1-P3 (API paga) sob demanda do plano. Protege margem. Arquivo: `radar-enrichment-job-pipeline.service.ts`.
- **5.4 — Server-side pagination do cockpit** (pré-requisito de cliente grande): `GET /owner/radar/cards?
  source=vps&page=&limit=&email=&city=&hasEmail=&sort=` — filtro no banco, não no navegador. [E6]

**Pronto quando:** grátis continua de base, pago entra como plugin por plano, cockpit aguenta 100k+ cards.
**Reversão:** feature-flags por plano. Risco: **dinheiro/cobrança** → revisão de diff obrigatória do dono.

---

## O que NÃO fazer (anti-padrões registrados)

- **Não empilhar fix sem medir net-new antes** (o erro dos 8 deploys). Fase 0 é pré-requisito de tudo.
- **Não escalar motor cegamente** se C4 provar que mais motor = mais timeout. Calibrar, não maximizar.
- **Não refazer o motor** sem o teste apontar a raiz no motor (mesma lição do WhatsApp: trocar biblioteca só
  muda onde o erro aparece).
- **Não construir proxies/headless/k8s "por via das dúvidas"** (teorias [G] de stack fantasma) — só se a
  fonte nova exigir.
- **Não publicar fase de fonte paga sem gate de custo** + revisão do diff (frente financeira).
