# MOTOR-RFB-FILA · Sprint 3 — RESULTADO (02/07/2026)

> Executado com Claude Fable 5 no worktree `claude/keen-bardeen-f17f8a`.
> Plano-fonte: `MOTOR-RFB-FILA-sprint3.md` (branch `claude/intelligent-proskuriakova-424a4c`).

## Veredito: ✅ ENTREGUE — freio único por fonte no ar (working tree), aceite local verde

O disjuntor mensal do Brave (que funcionou) virou um governor FÍSICO, persistente e **por fonte**:
`SourceBudgetService` ([backend/src/webscraping/source-budget/source-budget.service.ts](../../../backend/src/webscraping/source-budget/source-budget.service.ts)).
Os 3 mecanismos com furos diferentes foram unificados:

| Mecanismo antigo | Furo | Agora |
|---|---|---|
| Disjuntor Brave (radar-web-enrichment) | só Brave; fail-open no erro de contador | governor `brave` mensal, **FAIL-CLOSED** |
| Throttle solto 700ms BrasilAPI (L4) | não respeitava 429/Retry-After; invisível | fila por fonte + backoff de 429 + contagem p/ gauge |
| Heurística de pressão da frota | redescobre o 6–8 QUEIMANDO timeout a cada ciclo | teto ESTÁTICO por fonte grátis (default 8) clampa o headroom **dentro da elasticidade** |

## O que mudou (aditivo/reversível)

1. **Tabela `SourceApiUsage { source, yearMonth, count, updatedAt }`** — PK composta; `yearMonth`
   guarda a CHAVE DO PERÍODO (`YYYY-MM` mensal p/ brave; `YYYY-MM-DD` diário p/ google_places).
   Migration À MÃO ([20260702120000_add_source_api_usage](../../../backend/prisma/migrations/20260702120000_add_source_api_usage/migration.sql)),
   aplicada com `prisma migrate deploy` (migrate dev segue quebrado por shadow-DB).
   **Copia o histórico de `BraveApiUsage`** → o contador do mês corrente NÃO zera no cutover
   (local: 17/900 preservado). `BraveApiUsage` fica de pé como compat até cutover; ninguém mais escreve nela.

2. **`SourceBudgetService`** — MESMO padrão que provou funcionar no disjuntor: tudo estático +
   PrismaClient lazy (sobrevive a restart/recreate e aos call-sites `new` na mão; zero DI).
   - `brave` = mensal (`HBX_BRAVE_MONTHLY_CAP`, default 900) + fila 1-em-voo/1100ms.
   - `brasilapi` = req/s (`HBX_BRASILAPI_MIN_INTERVAL_MS`, default 700) + **respeito a 429/Retry-After**
     (backoff por fonte, teto 120s) — substitui o throttle solto.
   - `serper` = OFF default (`HBX_ENRICH_ALLOW_PAID`) — **fica no motor Python**; o governor só
     REPASSA o orçamento por env (o `resolveEnrichmentPaidFlags` já flui em cada request ao motor)
     e reflete no gauge. Nenhuma interceptação de request do motor.
   - `google_places` = teto FÍSICO diário (`HBX_GOOGLE_PLACES_DAILY_CAP`, default 200), **fail-closed**.
     NÃO fundiu com `enrichment-cost` (aquele segue sendo o orçamento COMERCIAL por plano do cliente;
     este é o freio da fonte). Gate nos 2 pontos cobrados: `searchPlaces` e `getPlaceDetails`.
   - fontes grátis (`ddg`/`bing`/`searxng`) = **teto de CONCORRÊNCIA por fonte**
     (`HBX_SOURCE_FREE_MAX_CONCURRENCY`, default 8; override `HBX_SOURCE_<FONTE>_MAX_CONCURRENCY`),
     semáforo in-memory FIFO.

3. **Política de falha (regra do sprint, aplicada literal):**
   - **PAGO = FAIL-CLOSED**: erro ao ler contador (tabela fora, banco fora) → NÃO chama.
     ⚠️ MUDANÇA consciente vs o disjuntor antigo (que era fail-open no erro).
   - **GRÁTIS = FAIL-OPEN**: contagem best-effort; semáforo sem banco no caminho; blip nunca derruba fluxo.

4. **Pontos únicos de passagem soldados:**
   - `searchBrave` ([radar-web-enrichment.service.ts](../../../backend/src/webscraping/radar/03-enrichment/radar-web-enrichment.service.ts)) → `schedule('brave')` + `tryConsumePaid('brave')`; 429 reporta backoff. Cache por query preservado (não gasta cota).
   - BrasilAPI no L4 ([radar-cnpj-l4-enrichment.service.ts](../../../backend/src/webscraping/radar/03-enrichment/radar-cnpj-l4-enrichment.service.ts)) → `schedule('brasilapi')` + 429→backoff + contagem.
   - Google Places ([radar-core-provider.mixin.ts](../../../backend/src/webscraping/radar/providers/hbx-engine/radar-core-provider.mixin.ts)) → `tryConsumePaid('google_places')` fail-closed nas 2 chamadas cobradas.
   - `searchBing`/`searchDuckDuckGo` → `withFreeSlot('bing'|'ddg')`.
   - **Frota**: clamp do teto estático em `resolveSourceHeadroomEngineCount`
     ([hbx-engine-pool.service.ts](../../../backend/src/webscraping/hbx-engine-pool.service.ts)) — entra DENTRO da elasticidade
     (mesmo termo min(RAM, CPU, FONTE)), aplicado na SAÍDA do termo (a histerese só encolhe com
     pressão ≥ hard e deixaria o teto estático letra morta — pegado em teste). **Só o caminho
     AUTOMÁTICO/mass_data**; manual/vendas/cliente não passam por esse termo (verificado nos testes
     de pool: pânico de memória zera automatic e radar_digital segue com 20).

5. **Cockpit :3107** — gauge por fonte (usado/teto/período) no nó "Fonte de busca" da Árvore HBX:
   backend `GET /modules/owner/radar/source-budget` (MasterGuard) → proxy local-agent
   `GET /owner/source-budget` → [tree.js](../../../hbx-owner/local-agent/web/tree.js) renderiza barra+estado.
   CSS 100% em token do tema ([tree.css](../../../hbx-owner/local-agent/web/tree.css), classes `.tgauge*`) — sem hex solto.
   Coluna VPS degrada honesto (leitura da VPS via Ops Control ainda não tem rota — pendência abaixo).

## Aceite (local, 02/07)

| Critério | Resultado |
|---|---|
| Derrubar a tabela → pagas PARAM, grátis seguem | ✅ ao vivo no Postgres local (rename da tabela): brave/google_places bloqueiam; brasilapi/ddg fluem; snapshot degrada `ok:false`; restaurada a tabela, pago volta SEM restart |
| cap=2 no Brave → `[]` gracioso, zero chamada real, log 1x/min | ✅ unit: 3ª chamada devolve `[]`, fetcher NÃO é chamado, log com throttle de 60s por fonte |
| Semáforo: máx N simultâneas por fonte grátis | ✅ unit: pico == 2 com N=2 (nem passa, nem vira fila única — throughput mantido) |
| 429/Retry-After segura a fila da fonte | ✅ unit: próximo disparo espera o backoff |
| Gauge bate com o banco | ✅ snapshot 17 == SELECT 17 (brave, mês corrente, semeado da BraveApiUsage) |
| Clamp da frota: 20 motores, pressão 0 → headroom 8 (env manda; 0 desliga; nunca fura o warm) | ✅ unit + verificação direta no serviço compilado |
| Typecheck estrito | ✅ `tsc -p tsconfig.json` verde (node_modules isolado do worktree, client regenerado) |
| Testes das áreas tocadas | ✅ **87/87** (source-budget 7 · pool 66 c/ 3 novos do clamp · governor · L4 cache 5 · master-routes 2) · radar-search/social 58/61+7/7 — as ÚNICAS 3 falhas são pré-existentes no head (ver Incidentes) |

**"20 motores → throughput MAIOR que sem teto"**: comprovação plena só ao vivo na VPS (A/B da
fábrica). O que o aceite local prova: concorrência por fonte ≤ teto com N em voo (não serializa),
e a frota automática assenta em 8 SEM queimar timeout pra chegar lá. Validação live = pendência.

## Mudança de comportamento pra PRODUÇÃO (ler antes do publish)

- **Frota automática (mass_data) agora assenta em 8 por default** mesmo com pressão zero
  (antes: 20 até a fonte gritar). É o dado medido virando freio. Escape: `HBX_SOURCE_FREE_MAX_CONCURRENCY=0`.
- **Google Places fail-closed**: se a migration NÃO rodar na VPS antes do código novo, Places para
  (por design: pago sem contador não chama). `npm run publish` roda `migrate deploy` → ordem ok.
- **Brave fail-closed** no erro de contador (antes fail-open). Banco fora = enriquecimento já estava
  degradado de qualquer jeito; agora a fonte paga não vaza cota no escuro.
- 8 testes de `hbx-engine-pool.service.test.ts` atualizados pra semântica nova (pinam
  `HBX_SOURCE_FREE_MAX_CONCURRENCY=0` quando testam OUTRA mecânica) + 3 testes novos do clamp.

## GATE G2 — ✅ DECIDIDO pelo dono (02/07): **8**

Teto de concorrência por fonte grátis = **8** (`HBX_SOURCE_FREE_MAX_CONCURRENCY`, já é o default do
código — nada a mudar). Vale pro semáforo do backend E pro clamp da frota. `0` desliga o teto;
override por fonte via `HBX_SOURCE_<FONTE>_MAX_CONCURRENCY`.

## Pendências / não feito (por regra ou escopo)

- **Janela-noite/parada extra: NÃO feito** (regra literal: elasticidade é o ÚNICO freio; o teto entrou dentro dela).
- **`enrichment-cost` intocado** (orçamento comercial por plano segue separado do governor físico).
- Gauge da coluna VPS: precisa de rota no Ops Control (leitura do `SourceApiUsage` da VPS). Hoje só o LOCAL mostra.
- Serper: contagem de uso real fica no motor Python (o governor mostra ON/OFF do repasse). Contador de uso do Serper = frente futura, se o pago ligar.
- Validação live do throughput 8-vs-20 na VPS (A/B da fábrica).
- Cutover final do `BraveApiUsage` (dropar tabela velha) — só depois de 1 ciclo mensal estável no novo contador.

## Incidentes da sessão (não são do sprint, registrados)

1. **3 testes de `radar-search-engine.test.ts` já chegavam quebrados** no head do branch (c7f62231),
   confirmado com stash: "radar strategy deep stubs", e 2 de `cnpj_public` (provável regressão da
   frente de filtros de 01/07). Task separada sinalizada no chip (`task_efd2ea09`).
2. **`backend/node_modules` do working copy PRINCIPAL foi destripado em paralelo** durante a sessão
   (de ~800 pacotes pra 83; `.bin` sumiu; sem npm rodando — deleção interrompida por algo do lado de lá,
   possivelmente colisão com os scripts `import-cnpj-dataset`/`g3-run` em execução). **Eu não toquei**:
   o worktree ganhou `node_modules` próprio via `npm ci`. ⚠️ O principal vai precisar de `npm ci`
   antes do próximo build/publish no host.

## Rollback

Tudo aditivo: reverter os arquivos tocados + `HBX_SOURCE_FREE_MAX_CONCURRENCY=0` (desliga clamp)
+ caps `<=0` (desligam tetos). A tabela `SourceApiUsage` pode ficar (inerte sem os call-sites).
