# S3 — Filtro do Vendas = base 28M + fusão lista/web (backend) — RESULTADO

> Worker local, NÃO publicado, NÃO commitado. Build + testes verificados por mim.
> Não revertei nada do S1/S2 (já aplicados no working tree antes deste sprint).

## Arquivos tocados

- `backend/src/webscraping/radar/providers/cnpj-public/cnpj-base-query.service.ts` (+ `countBase`)
- `backend/src/webscraping/radar/providers/cnpj-public/cnpj-base-query.service.test.ts` (+ 4 testes)
- `backend/src/webscraping/radar/providers/cnpj-public/radar-base-availability.util.ts` (novo)
- `backend/src/webscraping/radar/providers/cnpj-public/radar-base-availability.util.test.ts` (novo)
- `backend/src/webscraping/radar/06-presentation/radar-core-presentation.mixin.ts` (`listRadarLeadsForUser`)
- `backend/src/webscraping/radar/radar-webscraping-core.service.ts` (injeta `CnpjBaseQueryService`)
- `backend/src/webscraping/webscraping.service.test.ts` (+ 4 testes)
- `backend/src/night-factory/night-factory.service.ts` (`getLeadsBank`)
- `backend/src/night-factory/night-factory.service.test.ts` (+ 3 testes)

## Onde estava o lixo (confirmado lendo o código, não só o relato)

1. **"Total no Brasil"** (painel Buscar empresas) e **"Leads na base (Radar)"** (Dashboard) liam
   os DOIS o **pool local** (`RadarLeadPool`), nunca a base 28M (`CnpjPublicCompany`):
   - `GET /webscraping/radar/leads?scope=vitrine` → `listRadarLeadsForUser` em
     `radar-core-presentation.mixin.ts` calculava `meta.totalAvailable` com
     `(this.prisma).radarLeadPool.count(...)` (linha ~2911 antes do fix).
   - `GET /night-factory/leads-bank` (`NightFactoryService.getLeadsBank`) contava
     `radarLeadPool.count({ where: { status: { notIn: BLOCKED_RADAR_STATUSES } } })` — é esse
     endpoint, não o `/webscraping/radar/leads`, que alimenta o "Total no Brasil" do front
     (`LeadsClient` usa `bank.total` de `/night-factory/leads-bank`, ver
     `frontend/src/app/(app)/leads/page.client.tsx:1082`). Confirmei essa cadeia antes de mexer.
2. **Item 3 do plano (cutover LISTA-primeiro + WEB-enriquece + fusão) JÁ ESTAVA FEITO** pela
   árvore-mestra (P1, 02/07 — `docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md`): o
   `RadarSourcePlannerService` já ordena `cnpj_public` (a base 28M, via
   `RadarCnpjPublicSourceService` → `CnpjPublicDatasetService.fetchRecords`) ANTES do
   `hbx_engine` (web) nos 3 modos (`fast`/`quality`/`deep`), atrás da flag
   `HBX_RADAR_CNPJ_PUBLIC_ENABLED` (default OFF — decisão do dono, não bug). A fusão sourceChain
   `rfb+web` já vive em `radar/shared/radar-source-lanes.ts`. **Não toquei nesse caminho** — só
   confirmei que está correto e documentado em `docs/Rules/MOTOR.md`. Nenhuma ação necessária
   aqui além de constatar.

## O que mudou

### 1. `CnpjBaseQueryService.countBase(input)` — count puro sobre a base 28M

Novo método (reusa o `buildWhere` privado já existente e testado em 13 casos): devolve
`{ available: boolean, count: number | null }`. Nunca lança — sem a tabela carregada no
ambiente (ex.: local, só ~893 no pool) devolve `available:false, count:null`; falha do `count()`
em runtime devolve `available:true, count:null` (degrade gracioso, nunca derruba a tela). Não
roda a amostra de 20 nem os selos de qualidade do `query()` original — é só `count()`.

### 2. `radar-base-availability.util.ts` — ponte NormalizedRadarFilters → CnpjBaseQueryInput

Função pura `buildCnpjBaseQueryInputFromRadarFilters` que mapeia os filtros que o Vendas/Radar
JÁ expõe hoje (`city`, `state`, `segment`, `validPhone`, `likelyWhatsapp`) para o formato que
`CnpjBaseQueryService` entende (`cities`, `states`, `cnaes`/`keyword`, `contato.comTelefone`/
`comCelular`). Decisões:
- `segment` vira `cnaes` quando é um código CNAE puro (4-7 dígitos, mesma regra que
  `CnpjPublicDatasetService` já usa); senão vira `keyword` (nome/razão social).
- `withWebsite`/`noWebsite` **NUNCA** entram no WHERE da base fria — o dump RFB não popula
  `website` (é output de enriquecimento, já documentado no `buildWhere` original). Filtrar por
  isso na base 28M devolveria contagem fictícia (vazia ou plena, sem lastro). Mapeados como
  no-op de propósito, com teste que trava isso.
- `porte` **não existe ainda** em `NormalizedRadarFilters`/`RadarFiltersInput` — não inventei
  campo novo de UI (isso é decisão do S4/front); quando o dono quiser expor porte no filtro do
  Vendas, é só estender o tipo + este mapper.

### 3. `listRadarLeadsForUser` (vitrine) ganha `meta.baseTotal`/`meta.baseAvailable`

Quando `scope=vitrine` (é o que "Buscar empresas" chama), a resposta agora inclui:
- `baseAvailable: boolean` — `true` quando a base 28M está carregada neste ambiente.
- `baseTotal: number | null` — contagem REAL da `CnpjPublicCompany` já filtrada por
  cidade/UF/segmento-ou-CNAE/tem-telefone/tem-celular (o mesmo filtro ativo da busca).

`totalAvailable` (contagem do pool `RadarLeadPool`) **continua existindo, inalterado** — ainda é
útil pra "quantos já enriquecidos estão prontos pra puxar agora". A mudança é aditiva: quem
consome decide qual número mostrar (contrato pro S4 abaixo). Fora do `scope=vitrine`
(tela "Leads"/carteira do vendedor) o cálculo nem roda — `baseAvailable:false, baseTotal:null`
sem custo extra de query.

Sem `CnpjBaseQueryService` injetado (boot sem o provider) ou com erro no `count()`, cai pro
mesmo fallback gracioso — nunca quebra a busca do Vendas.

### 4. `NightFactoryService.getLeadsBank()` ganha os mesmos 2 campos

Mesmo padrão: `baseAvailable`/`baseTotal` somados ao payload existente (`total`, `deltaToday`,
`available`, `label`). `total` (pool) não foi removido — só deixou de ser a ÚNICA verdade.
`NightFactoryService` não importava `WebscrapingModule` (evitei acoplar módulos): segui o
padrão já usado ali para `WebsiteCrawlProviderService` — parâmetro de construtor com default
`new CnpjBaseQueryService(prisma)` (só depende do Prisma, sem round-trip de DI cruzada).

### 5. Item "Canais Exigidos" morto no backend

Investiguei: `requiredChannels`/`preferredChannels` ainda são consumidos de verdade pelo
`RadarSearchInputService`/`normalizeRadarFilters` (afetam o motor de busca live, não são lixo
morto) — a remoção pedida no plano é só a UI ("Canais Exigidos" / "Ativar modo foco" no filtro
do front), que é escopo do S4. Não há lógica órfã no backend ligada a isso; não mexi.

## Contrato do endpoint pro S4 (front)

`GET /webscraping/radar/leads?scope=vitrine&...filtros` — `meta` agora tem:

```jsonc
{
  "meta": {
    "available": true,
    "vitrine": true,
    "totalAvailable": 12,       // pool RadarLeadPool filtrado (já enriquecido, pronto pra puxar)
    "baseAvailable": true,      // false = base 28M nao carregada neste ambiente (ex.: local)
    "baseTotal": 6068,          // REAL: count(CnpjPublicCompany) filtrado (cidade/UF/segmento/contato)
    "page": 1,
    "limit": 20,
    // ...demais campos inalterados (filterKey, preferenceBoostApplied, availableFilters, enrichmentSummary...)
  }
}
```

`GET /night-factory/leads-bank` — resposta ganhou os mesmos 2 campos:

```jsonc
{
  "generatedAt": "...",
  "total": 893,            // pool (inalterado, mesma semantica de sempre)
  "deltaToday": 12,
  "available": true,
  "label": "Banco de Leads",
  "baseAvailable": true,   // false = base 28M nao carregada
  "baseTotal": 28000000    // REAL, sem filtro (visao global do banco de leads)
}
```

**Recomendação pro S4:** trocar `"Total no Brasil"` (painel Buscar empresas) e
`"Leads na base (Radar)"` (Dashboard) pra ler `baseTotal` quando `baseAvailable===true`, caindo
pra `totalAvailable`/`total` (pool) quando `baseAvailable===false` — nunca mostrar `null`/"—" se
o pool tiver número. Local (ambiente do dono agora) vai mostrar `baseAvailable:false` até a
carga dos 28M rodar na VPS — **isso é esperado, não é bug meu**: CLAUDE.md proíbe inventar
número fixo, então não fiz fallback fake pra 28M.

## Por que não dá pra provar "28M" localmente

O banco LOCAL não tem a carga da RFB (só ~893 linhas no pool antigo, `CnpjPublicCompany`
provavelmente vazia ou pequena aqui). Não inventei nenhum número — toda a prova é via MOCK do
Prisma (`cnpjPublicCompany.count` retornando N arbitrário, ex. 6068), provando que a
**lógica** conta a tabela certa e aplica o filtro certo. A validação do número real (28M) na
VPS é do dono, após publish.

## Build / Testes

- `cd backend && npm run prisma:validate` — verde (sem migration; nenhuma mudança de schema).
- `cd backend && npm run build` — verde (typecheck estrito).
- `cnpj-base-query.service.test.ts`: 17/17 (13 pré-existentes + 4 novos de `countBase`).
- `radar-base-availability.util.test.ts` (novo): 6/6.
- `webscraping.service.test.ts`: 120 testes / 119 pass / 1 skip pré-existente (+4 testes novos
  de `listRadarLeadsForUser` provando `baseTotal`/`baseAvailable`, incluindo o caso "sem vitrine
  não consulta a base" e "sem CnpjBaseQueryService injetado degrada gracioso").
- `night-factory.service.test.ts`: 15/15 (12 pré-existentes + 3 novos de `getLeadsBank`).
- Suítes adjacentes rodadas e verdes: `radar-core-distribution.test.ts` (S2, 4/4),
  `radar-core-search-loop.cnpj-public.test.ts`, `radar-cnpj-public-source.discovery.test.ts`,
  `cnpj-public-dataset.service.test.ts`, `cnpj-public-provider.test.ts`,
  `radar-source-lanes.test.ts`, `commercial-usage-limits.service.test.ts` (S1, 14/14),
  `radar-delivery-orchestrator.test.ts`, `radar-post-delivery-vendas-update.test.ts`.
- `vendas.service.test.ts`: 72 testes / 64 pass / 8 fail — **idêntico ao baseline documentado no
  S1/S2-RESULTADO.md** (não toquei em `vendas.service.ts` neste sprint; confirmei que a contagem
  de falhas não mudou).

## Pendente pro dono

1. Migrations: nenhuma. Schema Prisma intocado.
2. Ativar a carga dos 28M na VPS (fora do escopo deste sprint) pra `baseAvailable` virar `true`
   em produção e `baseTotal` mostrar o número real.
3. S4 (front): consumir `meta.baseTotal`/`meta.baseAvailable` no painel Buscar empresas e
   `leads-bank.baseTotal`/`baseAvailable` no Dashboard — contrato documentado acima.
4. Se o dono quiser filtro por `porte` no Vendas (hoje só existe no `CnpjBaseQueryService` do
   Owner), é preciso estender `RadarFiltersInput`/`NormalizedRadarFilters` primeiro — não fiz
   isso aqui (fora do que o plano pediu, teria inventado campo de UI sem pedido).
