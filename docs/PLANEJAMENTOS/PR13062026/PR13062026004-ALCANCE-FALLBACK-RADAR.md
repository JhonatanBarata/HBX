# PR13062026004 — Alcance como fallback do Radar (TODO p/ amanhã)

> Levantamento do dia 13/06/2026. **NADA foi alterado no motor** — este doc é só o
> mapa do que JÁ existe e a decisão que falta o dono tomar antes de ligar no front.
> Ordem do dono: "entenda o motor inteiro, não mude regra dele do nada".

## A ideia do dono (o comportamento desejado)

O **alcance é um FALLBACK**, não um filtro de largada:

1. Pesquisa entra com **cidade + segmento**.
2. Entregou a meta naquela cidade/segmento OU **secou** (não acha mais nada único)?
3. **Aí sim** começa a usar o alcance → **cidades vizinhas**.
4. Mesma lógica pro **segmento**: mais de um, ou aberto **por categoria**.
5. Objetivo: o motor **não fica parado à toa** — ele transborda e **entrega**.

## O que JÁ EXISTE no motor (confirmado lendo o código — não mexer)

### Alcance → cidades vizinhas
- `RadarSearchGeoService.resolveRegionalCities()` —
  `backend/src/webscraping/radar/01-search/radar-search-geo.service.ts:67`.
  Recebe `city/state/radiusKm/origin` → BRAZIL_CITY_COORDINATES + haversine →
  devolve **cidade principal + vizinhas dentro do raio**, mesmo estado, ordenadas por
  distância. Teto de cidades: ≤25 km → 10; ≤50 km → 18; senão → 30
  (`RADAR_REGION_MAX_CITIES`). Raio máximo `RADAR_REGION_MAX_RADIUS_KM = 250`
  (`radar-core-shared.ts:207`).
- `getSearchCityTargets()` —
  `backend/src/webscraping/radar/01-search/radar-core-search-runner.mixin.ts:449`.
  Retorna `[principal, ...regionais]` **só quando `radiusKm > 0 && regionalCities.length > 0`**.
  **Raio 0 ⇒ só a cidade principal** (sem vizinhas).
- `buildHbxBatchQueryTasks()` (mesmo arquivo, ~604): monta o plano percorrendo
  `cidades × segmentos × variantes de query`, **cidade principal primeiro** (cityIndex 1),
  vizinhas depois. Na prática varre a cidade principal e **transborda** pras vizinhas
  conforme as tentativas avançam — ou seja, o comportamento "cidade primeiro, depois
  alcance" **já é o que o motor faz**, DESDE QUE o raio seja informado.
- `getHbxMinimumCoverageAttempts` / `hasCompletedHbxMinimumCoverage` (~656): garante
  cobrir todas as combinações cidade×segmento antes de declarar "sem resultado".
- Loop de descanso/retomada: `getHbxSearchRunRestDelayMs`, `getHbxSearchRunMaxRestCycles`,
  `buildSearchRunRestMessage` (`radar-search-run-config.service.ts`): o motor **descansa e
  retoma a MESMA pesquisa** em vez de morrer. Mensagens já dizem "aumente o alcance ou
  ajuste segmentos".

### Segmento (+ de 1 / por categoria)
- `splitHbxBatchSegments()` (`radar-core-search-runner.mixin.ts:~435`): divide o campo
  segmento por vírgula → **até 5 segmentos**. "padaria, mercado, açougue" já vira 3 buscas.
- `HBX_CATEGORY_SEGMENTS` e `VERTICAL_TOKEN_GROUPS` (`radar-core-shared.ts:377` e `:602`):
  dicionários categoria → segmentos/tokens (ex.: `alimentacao → [restaurantes, ...]`,
  `academia → [academia, fitness, crossfit, pilates]`). Usados em provider/distribuição/
  apresentação.
- Lado **mass-data / banco autônomo** (`radar-core-campaign-planner.mixin.ts`):
  `getMassDataSegments` / `buildAutonomousMassDataSegments` **já expandem por categoria**
  quando o segmento é "aberto/todos". Esse é o motor de fábrica noturno — **não** a busca
  pontual da vendedora.

### Localização forçada (anti-mistura) — confirmado
- `radar-quality-gate.service.ts:213` rejeita candidato de **estado diferente** do pedido,
  liberando só os estados das `regionalCities` (`hardBlockers.push('state_conflict')`).
  É o "não mistura" que o dono citou: a vizinhança só vale dentro do alcance/estado.

## O GAP REAL — é SÓ no front (back já aceita tudo)

- `frontend/src/app/(app)/webscraping/page.client.tsx:249` (`executarColeta`) manda
  **só** `{ city, state, segment }`. **Não manda `radiusKm`, `quantity`, `originLat/Lng`.**
- Consequência: `radiusKm` cai pra **0** → `regionalCities = []` → `getSearchCityTargets`
  devolve **só a cidade principal** → **o fallback de alcance NUNCA dispara pela tela**.
  O motor tem tudo pronto, mas a UI não liga o gatilho.
- O endpoint `POST /webscraping/radar/search-runs` usa `RadarPullDto`
  (`webscraping.controller.ts:1042` / DTO em `:624` + `:165`) e **já aceita** `radiusKm`,
  `originLat`, `originLng`, `quantity`, `segment`. **Zero mudança de backend** pra ligar.
- Multi-segmento: já funciona se digitar "a, b, c" no campo (o split existe), mas **não há
  affordance nem explicação** na tela, e não há botão de "abrir por categoria".

## Nuance que NÃO pode ser confundida (registrar com força)

O motor hoje **planeja o alcance na largada** (monta cidades-no-raio × segmentos ANTES de
começar) e percorre a principal primeiro. Funcionalmente parece o fallback do dono
(principal → vizinha), **mas exige o raio informado no início**. Se raio = 0, não há
expansão nenhuma. Ele **não** sobe o raio sozinho "depois que secou".

A ideia do dono — "entregou/secou → SÓ ENTÃO aciona vizinhas/outra categoria, reativo,
sem a pessoa definir raio" — é uma **escalada reativa**. Ter isso 100% assim é **mudança
no motor**, que o dono mandou **não** fazer agora. Por isso o TODO separa em duas opções.

## Decisão que falta o dono tomar (amanhã, antes de codar)

- **Opção A — ligar o que já existe (NÃO mexe no motor). Recomendada p/ o deadline.**
  No front, `executarColeta` passa a mandar `radiusKm` (e `quantity`). UI ganha um controle
  de **alcance** (ex.: 0 / 25 / 50 / 100 km) e uma dica de multi-segmento ("separe por
  vírgula"). O motor já faz cidade-principal-primeiro → vizinhas. Risco ~zero, back intocado.
  - Default sugerido: **0 km** (só a cidade), pra admin/vendedora ligar o alcance quando
    quiser — respeita "centralizado primeiro" e não estoura custo de motor sem querer.
- **Opção B — escalada reativa de verdade (MUDA o motor).** Motor sobe o raio / abre
  categoria **sozinho** quando a cidade/segmento seca sem bater a meta. É o comportamento
  exato que o dono descreveu, mas é alteração de regra do motor → **só com "go" explícito**,
  fora do escopo "não mexer". Anotar como evolução, não fazer agora.

## Tarefas (amanhã)

1. Dono decide: **A ou B** (recomendação: A agora, B vira evolução).
2. Se A: no front, incluir `radiusKm` + `quantity` no corpo do POST de
   `executarColeta` e expor o controle de alcance na barra de filtros — respeitando as
   **5 Leis do Design System** (classe central/token, **sem visual inline/hex**).
   Texto de ajuda do multi-segmento ("padaria, mercado, açougue").
3. Verificar com 1 busca real: cidade só (raio 0) vs. cidade + 50 km, conferindo nos
   `searchScope` que as vizinhas entram só depois da principal.

## Não-objetivos (trava)

- **Não alterar o motor** (search-runner, geo, planner, quality-gate, config). Opção B
  fica congelada até "go" do dono.
- Não mexer em custo/quota/governor do motor neste PR.
- Não tocar mass-data/banco autônomo (já tem expansão própria; escopo é a busca pontual).
