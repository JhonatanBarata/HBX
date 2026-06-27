# Arquitetura Scraper / Motor de Leads HBX — MATRIZ DE TESTE (preencher no teste limpo)

> **Antes de qualquer fix.** Este arquivo NÃO é conclusão — é o roteiro pra você (dono) rodar o teste limpo
> e marcar, teoria por teoria, o que é **CERTO / ERRADO / PARCIAL**. Cada `{ }` é um slot pra preencher com
> evidência (número, log, query). Quando o teste fechar, o que sobreviver vira plano em
> [planodeacaoscraper.md](planodeacaoscraper.md); o que cair, sai daqui com o porquê.
>
> **Três fontes de teoria foram consolidadas:**
> - **[M]** = minha análise ao vivo (Claude, sessão 27/06 — combo raso, governor não escala, teto grátis).
> - **[C]** = codex/PDF (`HBX_Owner_Motores_Scraping_Analise_Arquitetura.pdf` — leu o repo de verdade).
> - **[G]** = GPT/docx (`Resumo Executivo.docx` — **assume stack Celery/RabbitMQ/Mongo que NÃO existe aqui**;
>   o stack real é **NestJS + Prisma + Postgres + motor Python `webscraping/app.py`**. As teorias [G] entram
>   mapeadas pro stack real ou marcadas **N/A** quando citam peça inexistente).

---

## REGRA DE OURO DO TESTE (o erro que me custou 8 deploys)

**MEÇA O NET-NEW ANTES DE MEXER EM QUALQUER COISA.** Eu publiquei fix em cima de fix sem medir a saída — e
o número (5.111) não mexeu. Nada neste arquivo vale sem a medição base abaixo rodando do lado.

### Bloco 0 — Instrumento de medição (montar/rodar PRIMEIRO)

Tudo é Postgres local no Docker (`docker compose exec db psql` ou Prisma) — backend em `:3000`, login
`POST /auth/login {username,password}`. Tabelas reais: `RadarLeadPool` (o estoque de cards), `WebscrapingCampaign`,
`WebscrapingCampaignTask`, `WebscrapingCampaignBatch`, `RadarFactoryCursor`, `RadarFactoryWorkLog`,
`WebscrapingSearchRun`.

| # | Medida | Como medir | Baseline (preencher) |
|---|--------|-----------|----------------------|
| 0.1 | Total de cards AGORA | `SELECT count(*) FROM "RadarLeadPool";` | `{ }` |
| 0.2 | Net-new na última hora | `SELECT count(*) FROM "RadarLeadPool" WHERE "createdAt" >= now() - interval '60 min';` | `{ }` |
| 0.3 | Net-new por janela de 10 min (rodar 3×) | mesma query com `'10 min'` | `{ }` / `{ }` / `{ }` |
| 0.4 | Batches no período + quantos VAZIOS | `SELECT status, count(*), sum("approvedCount") FROM "WebscrapingCampaignBatch" WHERE "createdAt" >= now() - interval '60 min' GROUP BY status;` | `{ }` |
| 0.5 | Dup ratio do período | `approved` vs `duplicate` vs `rejected` somados nos batches da janela | `{ }` |
| 0.6 | "completed" são reais ou duplicados? | conferir se os batches `completed` somam `approvedCount>0` ou só `duplicateCount` | `{ }` |

> **Veredito do meu número:** a tese é que os "completed" eram **duplicados** (saved=0) e por isso o total não
> subiu. Confirmar em 0.6 antes de tudo. **{ CERTO / ERRADO — evidência: ___ }**

---

## Bloco A — Fonte & profundidade (o teto do grátis)

| ID | Fonte | Afirmação a testar | Onde no código | Como testar | Veredito |
|----|-------|--------------------|----------------|-------------|----------|
| A1 | [M] | Motor pega **top-N raso por combo** e o N é ~20 (não pagina fundo). | `radar-core-factory-admin.mixin.ts:762` (`batchSize: 20`); `google-search-query-builder.ts:43` (`clampLimit` máx 100, fallback 5) | Rodar 1 combo NOVO de cidade grande (SP×um segmento virgem) e contar quantos cards distintos ele traz num run só. Se travar perto de 20, é raso. | `{ }` |
| A2 | [M] | Sem paginação: re-rodar o MESMO combo NÃO traz a "página 2" — devolve o mesmo top-N. | `google-search-query-builder.ts:49-63` (`buildLeadDiscoveryRequests`, 10 variações de query, sem cursor de página) | Rodar o mesmo combo 2× seguidas; comparar os place/lead IDs. Sobreposição ~100% = sem profundidade. | `{ }` |
| A3 | [M] | **Teto natural do grátis ≈ 5k** — o fácil já foi colhido. | `getFactoryStockCount` (`...mixin.ts:379`) + dedup-por-cidade | Somar net-new de TODOS os combos de cidade grande num teste longo (ver Bloco B). Se satura em centenas/poucos milhares e estabiliza, teto confirmado. | `{ }` |
| A4 | [M]/[C] | **Google Places API pagina 60+/combo** e o plumbing JÁ existe no código (só está desligado). | imports `PLACES_NEW_TEXT_SEARCH_URL`, `PLACES_NEW_DETAILS_URL` (`...mixin.ts:23-26`); `google-search-query-builder.ts:45` (`usePlacesApi: false`) | Confirmar: (a) Places está `usePlacesApi:false` por default? (b) Existe `nextPageToken`/paginação no caminho Places? Medir profundidade de 1 combo com Places ligado vs textual. | `{ }` |
| A5 | [G→real] | Rate-limit / 429 / cota estrangulando a fonte grátis (Google daily limit). | `GOOGLE_DAILY_LIMIT_REACHED_MESSAGE` (`...mixin.ts:17`) | Grepar log do backend por `daily limit`/`429`/`GooglePlacesApiError` na janela do teste. | `{ }` |

---

## Bloco B — Combo / cursor / fila (o "entupimento")

| ID | Fonte | Afirmação a testar | Onde no código | Como testar | Veredito |
|----|-------|--------------------|----------------|-------------|----------|
| B1 | [M] | "Combo tocado fica **done** pra sempre e nunca volta." **(suspeito de IMPRECISO)** | `pickRadarFactoryMission` (`...mixin.ts:405-480`) NÃO tem flag done permanente: ordena por `stockCount<80`, evita `recentBad`, prefere `recentlyWorkedAt` mais velho | Ler a lógica de seleção + ver o `RadarFactoryWorkLog`: combo `empty` é reescolhido depois ou some? | `{ }` |
| B2 | [M] | O mecanismo REAL é **dedup-por-cidade**: cidade já minerada → busca volta vazia → marcada `empty` → cursor avança (não "done"). | `syncRadarFactoryFinishedWork:567` (`empty` quando `savedCount<=0`); `getFactoryStockCount` dedup contra `RadarLeadPool` | Pegar um combo de cidade JÁ minerada e um de cidade virgem; comparar `savedCount` no `RadarFactoryWorkLog`. Virgem rende, minerada=0 → confirma. | `{ }` |
| B3 | [M] | **Fila envenenada**: ~29k combos mortos enfileirados (queued, nunca rendem). | `purgeDeadMassDataQueue:889` (apaga `queued attemptCount=0`, exaure `foundCount=0`) | `SELECT status, count(*) FROM "WebscrapingCampaignTask" GROUP BY status;` antes do teste. Quantos `queued`? | `{ }` |
| B4 | [M] | **Campanhas auto-perpetuadas** travavam o cursor em cidadezinha (Acarape/Acaraú). | `ensureNightFactoryWork:688` (retorna `active_campaign_exists` e MANTÉM a campanha enquanto tiver backlog) | `SELECT city, segment, status, count(*) FROM "WebscrapingCampaign" WHERE mode='mass_data' GROUP BY 1,2,3;` — há micro-cidades vivas se reabastecendo? | `{ }` |
| B5 | [M] | **O fix de priorizar cidade grande funciona** (cursor começa em SP, não no "A"). | `MAJOR_BR_CITIES` (`...mixin.ts:320`) + `getFactoryLocationPool:337` (grandes ANTES de produtivas) | Após `purgeDeadMassDataQueue`, ler `RadarFactoryCursor.currentCity` — é São Paulo/cidade grande? E o `nextMission` no factory-status? | `{ }` |
| B6 | [M] | **Combo morto morre na 1ª** (não mói horas). | `syncRadarFactoryFinishedWork:590` (`shouldAdvance` se `nextEmptyCount>=1` ou `duplicateRatio>=0.65`) | Forçar um combo sabidamente esgotado e ver se avança em 1 ciclo (não fica preso). | `{ }` |
| B7 | [C]/[M] | **Botão "Limpar fila morta" reseta de verdade** (apaga lixo + cancela campanhas + reseta cursor pra SP). | `purgeDeadMassDataQueue:889-938` | Clicar o botão; conferir 0.4 da fila + cursor em B5 + campanhas canceladas. | `{ }` |

---

## Bloco C — Frota / capacidade (mais motor = mais lead?)

| ID | Fonte | Afirmação a testar | Onde no código | Como testar | Veredito |
|----|-------|--------------------|----------------|-------------|----------|
| C1 | [M] | "**Governor roda ~6 motores, não 20** — não escala." | `getConfiguredHbxEngineCount()` (env `HBX_LIST_ENGINE_COUNT`/`HBX_ENGINE_URLS`); `automaticAllowedEngines` do scheduler | `GET /webscraping/engines/status` — quantos `online`/`running` AGORA vs o configurado? | `{ }` |
| C2 | [M] | A causa do "6 não 20" é **reserva de cliente + memory guard** cortando, NÃO o governor. | `getRadarFactoryStatus:1058` (`automaticAllowedEngines = configurado − manualReservedEngines − memoryGuard`); env `HBX_CLIENT_RESERVED_ENGINES` (`:1088`) | Ler `protection{}` do factory-status: `manualReservedEngines`, `memoryGuardEngines`, `automaticAllowedEngines`. Qual está comendo os motores? | `{ }` |
| C3 | [M] | Os 2 envs de frota (`HBX_ENGINE_URLS` + `HBX_LIST_ENGINE_COUNT`) **caem pro default 1** quando faltam (recreate do compose apaga). | `getConfiguredHbxEngineCount` / `buildLocalHbxEngineUrls` | `printenv | grep HBX_ENGINE` no container backend (local E VPS). Estão setados? | `{ }` |
| C4 | [M] | **Mais motores ≠ mais leads** — 20 estrangulam a fonte (30-68% timeout); 6 produz igual/mais e não queima IP. **(tese mais importante de mercado)** | telemetria `hbx-engine-telemetry.service.ts`; timeouts em `radar-hbx-engine-errors.service.ts` | Rodar 2 janelas iguais: uma com N≈6, outra com N≈20. Medir net-new (0.2) E taxa de timeout em cada. Comparar. | `{ }` |
| C5 | [G→real] | Worker travado sem timeout segura a fila (equivalente real do "Celery sem timeout"). | `lockedUntil`/`lockedByEngineId` em `WebscrapingCampaignTask`; `maxAttemptsPerTask` (default 3) | `SELECT count(*) FROM "WebscrapingCampaignTask" WHERE status='running' AND "lockedUntil" < now();` — tarefas presas? | `{ }` |

---

## Bloco D — Pipeline / persistência (onde o lead morre)

> O pipeline real é `01-search → 02-filter → 03-enrichment → 04-socials → 05-delivery → 06-presentation`
> (`backend/src/webscraping/radar/`). A pergunta: o net-new que EXISTE morre em qual estágio?

| ID | Fonte | Afirmação a testar | Onde no código | Como testar | Veredito |
|----|-------|--------------------|----------------|-------------|----------|
| D1 | [M] | **Net-new existe e a fábrica não captura** (provei 171 em SP / SP×padarias=10). | `radar-duplicate-filter.service.ts` (dedup in-memory `seenKeys`) + `getFactoryStockCount` | Rodar SP × 1 segmento virgem e ver `savedCount>0` no `RadarFactoryWorkLog`. Se a busca acha mas o saved=0, morre no filtro. | `{ }` |
| D2 | [M]/[G] | O lead morre no **02-filter** (dedup/quality-gate derruba tudo como duplicate/rejected). | `radar-duplicate-filter.service.ts:54-64`; `radar-quality-gate.service.ts` | Comparar `approvedCount` vs `duplicateCount` vs `rejectedCount` de 1 batch novo (0.4/0.5). Onde some o volume? | `{ }` |
| D3 | [G→real] | **Armazenamento falha** (transação não comitada / schema mismatch / duplicate key) — busca acha mas não grava. | `radar-run-repository.service.ts`; `radarLeadPool.create` | Grepar log por erro de `prisma`/`unique constraint`/`P2002` na janela. Batch com `approvedCount>0` mas `RadarLeadPool` não cresceu = grava falhando. | `{ }` |
| D4 | [G→real] | **Parsing quebrado** — motor Python retorna vazio sem erro (seletor mudou). | `webscraping/app.py` (motor); `radar-website-crawl-source.service.ts` | Chamar o motor direto num combo conhecido-bom e ver o payload cru. Vazio com HTTP 200 = parsing morto. | `{ }` |
| D5 | [G→real] | **Erro silencioso** — `.catch(() => null)`/`.catch(() => 0)` engolindo falha (MUITO comum neste arquivo). | dezenas de `.catch(() => ...)` em `...mixin.ts` (ex.: `:402`, `:447`, `:584`) | Subir log level / instrumentar os catch quentes do caminho fábrica→pool→save e rodar 1 ciclo. | `{ }` |
| D6 | [M] | "**Antes funcionava** (~17/dia) era trickle de combo novo; não quebrou, entupiu." | histórico `RadarFactoryWorkLog` | `SELECT date_trunc('day',"createdAt"), sum("savedCount") FROM "RadarFactoryWorkLog" GROUP BY 1 ORDER BY 1 DESC LIMIT 30;` — a curva caiu ou sempre foi trickle? | `{ }` |

---

## Bloco E — Owner UI / contrato de estado (codex)

| ID | Fonte | Afirmação a testar | Onde no código | Como testar | Veredito |
|----|-------|--------------------|----------------|-------------|----------|
| E1 | [C] | **Três fontes de verdade dos motores** (backend `HbxEngineLock` / Docker / Ops Control) divergem → UI parece errada. | `hbx-owner/local-agent/server.js:760-788`; `ops-control/server.js:2140-2196`; `web/app.js:144-183` | Comparar, no mesmo instante: `/webscraping/engines/status` (backend) × `docker ps` × Ops `scope=vps`. Batem? | `{ }` |
| E2 | [C] | **Botão de motor volta** (toggleIntent ambar não cobre transição > janela). | `web/app.js:60-69` | Ligar/desligar motor com VPS pesada/SSH lento; o botão volta sozinho antes da verdade chegar? | `{ }` |
| E3 | [C] | **`/owner/ops/cnpj-backfill` aceita `scope` mas executa LOCAL** (botão "CNPJ→VPS" mostra resultado local). | `hbx-owner/local-agent/server.js:77-113` (`backendRequest` direto, bypass Ops) | Chamar com `scope:"vps"` e conferir se o backfill rodou no banco VPS ou no local. | `{ }` |
| E4 | [C] | **Filtro de e-mail ignora `emails[]`** (usa só `row.email`) → "tem dado mas não aparece no filtro". | `web/app.js:121-145` e `:166-180` | Card com e-mail só em `emails[]`; filtrar por ele no cockpit. Some? | `{ }` |
| E5 | [C] | **Pill de Ops mente** — `HBX_OWNER_OPS_TOKEN` existir ≠ backend VPS/SSH funcional. | `start-owner.ps1:29-71`; `ops-control/server.js:214-247` | Com token setado mas `OPS_CONTROL_VPS_BACKEND_URL/TOKEN` faltando, a pill diz "ok"? Comando VPS real falha? | `{ }` |
| E6 | [C] | **Cockpit carrega tudo no cliente** (500/pág, cap 5k, filtra no navegador) → não escala. | `web/app.js:47-55` | Medir tempo/memória do cockpit com a base atual; projetar com 100k+. Confirmar filtro/sort client-side. | `{ }` |
| E7 | [C] | Falta **contrato único FleetSnapshot** (backend já tem os campos ricos, Owner resume demais). | proposta no PDF §5; campos em `hbx-engine-pool.service.ts:142-194` | Conferir que `actualState/containerName/heartbeatAgeSeconds/cardsFabricated/batches/duplicates/rejected` existem no backend e NÃO chegam à UI. | `{ }` |
| E8 | [G→real] | **CORS / Auth** bloqueando o painel (teoria [G]). | painel Owner é servido pelo próprio local-agent (mesma origem) | Abrir DevTools no cockpit e procurar erro CORS/401. **Hipótese: N/A** (mesma origem, sem cross-domain). Confirmar. | `{ }` |

---

## Bloco F — Teorias [G] do GPT: aplicável × N/A (stack fantasma)

> O docx assume **Celery / RabbitMQ / Redis / MongoDB / Kubernetes**. Nada disso existe no HBX. Registrado
> aqui pra não reabrir: cada item é mapeado pro equivalente real OU marcado **N/A**.

| ID | Teoria [G] | Stack real equivalente | Status | Veredito |
|----|-----------|------------------------|--------|----------|
| F1 | Celery workers não iniciados | Não há Celery. Workers = motores Python via `HbxEnginePool` (NestJS) | Mapear → C1/C5 | `{ N/A? }` |
| F2 | RabbitMQ/SQS fila saturada | Não há broker. "Fila" = tabela `WebscrapingCampaignTask` no Postgres | Mapear → B3 | `{ N/A? }` |
| F3 | MongoDB write concern fraco | Não há Mongo. É Postgres/Prisma (transação ACID) | Mapear → D3 | `{ N/A? }` |
| F4 | Kubernetes / HPA pra escalar | Não há k8s. Escala = `getConfiguredHbxEngineCount` + Docker adapter | Mapear → C1/C2 | `{ N/A? }` |
| F5 | Timeout de rede faltando | Real: motor Python + `timeoutMs` nas requests | Testável → C5/D4 | `{ }` |
| F6 | Parsing HTML quebrado | Real: `app.py` + website-crawl | Testável → D4 | `{ }` |
| F7 | Erro silencioso / sem log | Real e PROVÁVEL: `.catch(()=>null)` em massa | Testável → D5 | `{ }` |
| F8 | Race condition / isolamento DB | Improvável dominar o sintoma; Postgres default | Baixa prioridade | `{ }` |
| F9 | Falta de testes | Há suíte (`*.test.ts` no webscraping). Cobertura do caminho fábrica? | Verificar | `{ }` |
| F10 | Proxies rotativos / headless | Estratégia de FONTE (não bug atual). Entra no plano grátis→pago | Roadmap | `{ }` |

---

## VEREDITO GERAL — PREENCHIDO AO VIVO (27/06/2026, banco local `jhonatan_dev`)

> Teste limpo rodado pelo orquestrador no ambiente vivo (local foi zerado pelo "Mandar tudo pro VPS", então
> começou em ~117 cards — testbed limpo). Backend :3000 Docker, 3→20 motores, Postgres direto.

- **O número subiu?** baseline **117** → **1.694 em ~45 min**, TUDO São Paulo. Net-new real: **+1.577** (só 3 motores no início). **SUBIU MUITO.**
- **Onde o lead morre** (estágio dominante): NÃO morria em estágio — a fábrica estava **presa em microcidade** (não chegava a buscar cidade grande). Quebrada a trava, São Paulo grava direto.
- **Teto do grátis é real?** **ERRADO.** Eu disse ao dono que o grátis "já deu o que tinha perto dos 5k" — MENTIRA minha. Os 5.111 eram colheita de microcidade + trava. São Paulo sozinha despejou ~1.5k em 45min e continua. O grátis está LONGE do teto.
- **Causa-raiz nº1 do "0 net-new" (CERTO, provado):** **90 campanhas mass_data auto-perpetuadas** em Abaiara/Abaetetuba (cidades do "A") → fila de **9.564 tasks envenenada** → 3 motores presos nela → cursor `active_campaign_exists` NUNCA avançava pra cidade grande (mixin.ts:688). `purge-dead-queue` cancelou as 90, resetou cursor→SP, e o net-new jorrou. **B4 = CERTO ao vivo.**
- **Frota travada (CERTO, provado):** env raiz diz 20, mas `start-hbx-engines.ps1` tem **default fixo 3** → backend recriado com `HBX_ENGINE_MAX_COUNT=3` → elástico capava em 3. Host tem **16GB livres**, motor usa **130MB** → cabem 20 folgados. **C1/C3 = CERTO.** Subi a frota declarada pra 20 ao vivo (`HBX_LOCAL_ENGINE_COUNT=20 npm run engines:up`).
- **Elástico (em construção):** reescrito pra ler **RAM+CPU reais** (RAM /proc/meminfo, CPU /proc/stat), teto absoluto = frota declarada (20), folga por histerese. Live: `elasticHeadroomEngines:20` com RAM 17%/CPU 0%. Resíduo: config forçada `turbo_noturno` ainda capava `automaticAllowedEngines` em 3 (em correção).
- **Combo sem paginação (A2 = CERTO):** re-rodar o MESMO combo (SP/mercados, SP/restaurantes) devolve dedup→0. Cidade grande tem MUITOS segmentos virgens, mas cada combo é raso. Pra volume contínuo o cursor tem que VARRER segmentos novos, não re-moer 2.
- **Mais motor = mais lead?** `{ pendente — re-teste com 20 motores após fix do elástico }`.
- **Decisão de fonte:** **espremer grátis primeiro** (provado que tem MUITO lead grátis ainda — cidades grandes × 130 segmentos). Places API paga = fase 2, não urgente.

> CORREÇÃO REGISTRADA: minha tese anterior "scraper no teto, só fonte paga resolve" estava ERRADA. O problema
> era trava de microcidade + frota capada em 3, não teto de fonte. Ver [planodeacaoscraper.md](planodeacaoscraper.md).
