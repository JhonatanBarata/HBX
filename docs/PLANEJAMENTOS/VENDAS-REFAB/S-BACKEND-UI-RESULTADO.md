# S-BACKEND-UI — resultado (Worker A, backend), 04/07

> LOCAL — não publicado, não commitado.

## FRENTE 1 — item 5: automação que alimenta o Vendas sozinho, REMOVIDA

- **`shouldAutoImportRadarRunToVendas`** (`radar-core-delivery.mixin.ts`) simplificado: agora
  retorna `!isCompanySellerUser(user)` sempre — vendedor NUNCA mais auto-importa (self-serve puro).
  Antes checava o standing order (`getRadarSellerStandingOrder`); essa checagem saiu do caminho
  quente. Admin/master/Night Factory continuam com o comportamento de sempre (fora de escopo).
- **`triggerSellerStandingOrderPump`** removido — salvar o standing order com `active:true` não
  dispara mais busca automática (`startSearchRunForUser`) sozinho.
- **Pump de auto-distribuição ~2min** desligado: `radarAutoDistributionTimer` (setInterval 60s) e
  o disparo aos 7s do boot saíram do `onModuleInit` (`radar-webscraping-core.service.ts`).
  `processActiveRadarAutoDistributions` (o cron em si) foi removido do
  `radar-core-distribution.mixin.ts`.
- **O que ficou de pé, de propósito:**
  - `GET/PUT /webscraping/radar/standing-order` continuam respondendo — o front atual
    (`vendas/page.client.tsx`, `leads/page.client.tsx`) ainda tem o botão "Automático" plugado
    nessas rotas. Removê-las agora quebraria a tela hoje; o toggle ficou **inerte** (salva a
    preferência, não alimenta nada). O Worker B remove o botão da UI (item 5 do PLANO-UI) e aí sim
    dá pra tirar as rotas.
  - `POST radar/auto-distribution/run` e `POST radar-auto-distribution/run` (dois escopos:
    `company` e `tenant_distribution`) continuam existindo como **ação manual explícita**
    (admin/master aperta um botão) — isso não é "automação que alimenta sozinho", é distribuição
    sob demanda. Nenhum front hoje chama esses dois (confirmado por grep) — candidatos a remoção
    futura se o dono decidir que não quer nem o botão manual.
- **Caminho manual intacto**: `importRadarLeadToVendasForUser` (endpoints `radar/leads/:id/send-to-vendas`,
  `radar/:id/import-to-vendas`, `radar/pull-to-vendas`) não foi tocado.

## FRENTE 2 — item 4: contrato de filtro com TODAS as colunas reais do RFB

- **Endpoint novo:** `POST /webscraping/radar/cnpj-base/query` — abre o filtro avançado sobre a
  base 28M (`CnpjPublicCompany`) pra qualquer usuário da empresa (admin OU vendedor), reaproveitando
  o mesmo `CnpjBaseQueryService`/`CnpjBaseQueryInput` do painel do Master
  (`POST /modules/owner/cnpj-base/query`, que segue existindo e MasterGuard-only).
- **Campos novos no `CnpjBaseQueryInput`** (faltavam vs. PLANO-UI item 4):
  - `matrizFilial` agora aceita array (seleção múltipla), mantendo compat com string única.
  - `ownerName`/`ownerQualification` entraram no `select` e na amostra de saída (já existiam na
    tabela, QSA denormalizado do dump RFB — só não eram devolvidos).
  - `donoConhecido` (bool), `ownerNameKeyword` (busca por nome do sócio), `ownerQualifications`
    (filtra pelo cargo) — filtro de "Sócio/dono" pedido no plano.
  - `idadeMinAnos`/`idadeMaxAnos` — açúcar sobre `openedAt` pro front não calcular data.
- **NÃO reintroduzi** filtro de "tem site" como corte de contagem: achei um comentário explícito
  no código (`buildWhere`, correção de escopo 02/07) dizendo que `website` NUNCA é populado na
  base fria (é output do enriquecimento web, não do dump RFB) — oferecer esse filtro devolveria
  vitrine vazia fingindo precisão que não existe. Respeitei a decisão já tomada.
- **`regimeTributario` segue fora** (fase 2 da RFB, coluna sempre `NULL`) — como já estava.
- Contrato completo (todos os campos, com exemplos) documentado em
  `docs/PLANEJAMENTOS/VENDAS-REFAB/CONTRATO-FILTRO.md`.

## Cuidado DI (lição `deploy-build-verde-nao-e-boot-ok`)

Não criei nenhum provider novo nem toquei em `@Module`. O método novo (`queryCnpjBaseForUser`)
entrou no mixin `RadarCorePresentationMixin` (que já é copiado pro prototype de
`RadarWebscrapingCoreService` via `applyRadarCoreMixins`) e só reaproveita `this.cnpjBaseQuery`,
que já era `@Optional()` injetado no core service. O endpoint HTTP entrou no
`WebscrapingController`, que já vive no mesmo `webscraping.module.ts` que declara
`CnpjBaseQueryService`/`CnpjBaseController` — zero wiring cross-module novo.

**Boot local confirmado**: `node -r ./scripts/fix-direct-url dist/main.js` chegou até
`Nest application successfully started` (só falhou depois por `EADDRINUSE :3000`, porta já em uso
por outro processo — não é erro de DI). Zero ocorrência de `Nest can't resolve dependencies` no log.

## Build / testes

- `cd backend && npm run build` — verde.
- `cnpj-base-query.service.test.ts`: 25/25 (17 pré-existentes + 8 novos cobrindo `matrizFilial`
  array, `donoConhecido`, `ownerNameKeyword`, `ownerQualifications`, amostra com
  ownerName/ownerQualification, `idadeMinAnos`/`idadeMaxAnos`).
- `radar-base-availability.util.test.ts`: 4/4 (mapper do count "Total no Brasil" não mudou —
  ele serve só o `countBase`, não o filtro avançado; não precisava dos campos novos).
- `radar-core-distribution.test.ts` (VENDAS-REFAB S2): 4/4 — comportamento de
  `executeRadarAutoDistributionRule` (chamada manual) preservado; só o CRON automático saiu.
- `webscraping.service.test.ts`: 124 pass / 1 skip (120 pré-existentes − nenhuma quebrada + 4
  novos testes de `queryCnpjBaseForUser`, incluindo vendedor conseguindo chamar e caso sem
  `CnpjBaseQueryService` injetado → `ServiceUnavailableException`, nunca inventa resultado).
- `vendas.service.test.ts`: 64 pass / 8 fail — **as mesmas 8 falhas pré-existentes** (confirmado
  via `git stash`: falham igual no baseline, antes de qualquer mudança minha; arquivo não tocado
  nesta frente).
- 2 outras falhas pré-existentes fora do meu escopo, também confirmadas via `git stash` contra o
  baseline: `hbx-engine-pool.service.test.js` ("elastic sync...") e `radar-search-engine.test.js`
  ("cnpj_public provider filtra..." — esta última por causa de uma mudança PARALELA do dono em
  `cnpj-public-dataset.service.ts`, que não toquei).

## Riscos / pendências pro Worker B

1. O botão "Automático" (`vendas/page.client.tsx`, `leads/page.client.tsx`) ainda existe na UI e
   chama `standing-order` — agora é decorativo (não alimenta mais nada). Remover o botão é escopo
   do item 5 front; só então as rotas `GET/PUT radar/standing-order` viram órfãs de verdade.
2. `POST radar/auto-distribution/run` / `POST radar-auto-distribution/run` (2 paineis de
   distribuição, escopos `company` e `tenant_distribution`) ficaram como ação manual — não achei
   nenhum consumidor no front hoje. Se o dono confirmar que não quer nem o botão manual, dá pra
   remover os ~800 linhas desse aparato (`radar-core-distribution.mixin.ts`) num sprint futuro.
3. Autocomplete de cidade/CNAE (`GET cnpj-base/cities`, `GET cnpj-base/cnaes`) segue só
   `MasterGuard` — se a tela `/vendas` precisar de picker de cidade/CNAE, falta abrir uma rota
   espelho em `webscraping.controller.ts` (mesmo padrão do `query` novo). Não fiz isso porque o
   PLANO-UI não pediu explicitamente e não quis inflar escopo sem necessidade confirmada.
