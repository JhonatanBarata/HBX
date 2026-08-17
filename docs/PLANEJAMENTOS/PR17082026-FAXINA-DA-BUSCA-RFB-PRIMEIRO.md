# PR17082026 — FAXINA DA BUSCA: RFB PRIMEIRO, WEB DEPOIS

> Encomenda do dono (17/08/2026): *"vou limpar essa pesquisa. Está suja, bagunçada e eu já entendi
> q o RFB é onde está o ouro, a pesquisa tem q vir depois q a RFB entregou tudo. Tente não perder
> dados, mas manter coisas q não dão resultado pode descartar. Não vou pagar pesquisadores, meu
> foco agora está em distribuição — arroz com feijão bem feito e deixar pausado o 'brave' até
> começar retorno."*

**A CENA:** disparo "distribuidoras de água" nas minhas cidades → a Receita entrega TUDO que já
tem (86 empresas ativas, 81 com telefone, nas 6 cidades do teste) ANTES de qualquer web; a web
entra depois, enxuta, sem queimar 10 minutos em lixo; o relatório diz por cidade quanto veio da
Receita e quanto veio da web; cidade zerada aparece, não some na média.

---

## 1. O DIAGNÓSTICO (medido ao vivo na VPS, 17/08, sessão `cmsx5zf0s...`)

A busca entregou **4 cards** (3 empresas únicas) de um universo de **86 na base RFB**. Não foi
acento nem plural (Bing devolve byte-idêntico com/sem acento; `segmentTokenGroups` já casa
agua↔aguas). Foram **oito travas empilhadas**, em duas famílias:

### Família A — a Receita está trancada (o ouro)

| # | Trava | Onde | Efeito medido |
|---|-------|------|---------------|
| A1 | **WHERE exige "distribuidora" E "agua" no texto** — mas o CNAE real de distribuidora de água é 4723-7/00 *"Comércio varejista de bebidas"* (a descrição não tem nem "distribuidora" nem "agua"); só casa quem fala as duas palavras no NOME | `cnpj-public-dataset.service.ts:53-57` | Valinhos: 54 empresas com "agua" → **found=15** |
| A2 | **Exclusão `varejo_puro` mata o CNAE onde as distribuidoras moram** (4723700, 4784900) — dupla pena: A1 exige "distribuidora" no nome, A2 rejeita o CNAE de quem tem | `radar-segment-exclusion.util.ts:46-53` | 26 rejeições hoje vs 5 aceitos: FERREIRAGUA, VALINAGUA, ACQUARELLA, RICCI, PALANDI. Mata na lane web também ("ÁGUA MINERAL DISTRIBUIDORA RICCI" veio da web e morreu igual) |
| A3 | **Teto de 20 aceitos por run** | `radar-core-search-loop.mixin.ts:283` (`min(remaining, 20)`) | Busca de 100 → RFB entrega no máx. 20 |
| A4 | **RFB roda 1× por run** (`ranThisRun`/`zeroAccepted`, Map em memória, TTL 2h) | `loop.mixin:275-277, 312-314` | O resto do run é só web. Cidade que zerou na 1ª nunca reconsulta |
| A5 | **Sem drenagem** — um `findMany` de ~500 linhas, sem cursor/paginação | `cnpj-public-dataset.service.ts:81-93` | "Entregar tudo" é impossível por construção |
| A6 | **Sem mapa segmento→CNAE** — só entende CNAE se o pedido digitar o código | `dataset:47`, `provider:82-83`; grep no repo: NÃO EXISTE mapa curado | O jeito natural do dono pedir ("distribuidoras de água") nunca alcança o CNAE certo |

Bônus A7: motivo mentiroso — dataset volta 0 linhas → `cnpj_public_provider_sem_base_configurada`
(`cnpj-public-provider.service.ts:114-125`) com a base de 23 GB de pé. O motivo honesto
(`sem_registros_compativeis`, linha 183) é inalcançável pelo early-return. Deu isso em Pinhal e
Estiva Gerbi hoje.

### Família B — a web alimenta os filtros com lixo

| # | Trava | Onde | Efeito medido |
|---|-------|------|---------------|
| B1 | **`DISCOVERY_QUERY_BACKEND = "bing"` não é backend válido do ddgs** (nunca foi — na 9.14 o engine bing já tinha `disabled=True`). O ddgs cai em rodízio "auto" que promove **WIKIPEDIA e GROKIPEDIA** pra frente da fila | `discovery.py:24, 381`; `ddgs/ddgs.py:309-345` | Linhas de enciclopédia voltam NÃO-vazias → `search_discovery_rows` retorna o lixo e **o Bing scraper nunca roda** (só rodaria com retorno vazio + flag). A assinatura do lote morto: `urls=10 parsed=8 approved=0 low_score=8` — **26 de ~50 lotes hoje** |
| B2 | **DDG e Mojeek estão TCP-mortos da VPS** (IPv4 timeout 80/443, IPv6 sem rota; medido no host) | rede da VPS `187.77.47.18` | 27 falhas de ddgs hoje, ~1,2s desperdiçado por query |
| B3 | **Bing (quando alcançado) ancora na 1ª palavra em query local BR** — mesmo do IP residencial do dono | provado com 6 formas de query | `agua mineral galao 20L Valinhos SP` → Wikipedia "Água", Sabesp. MAS: **cidade entre aspas vira 10/10 local** (`"Valinhos" distribuidora de agua mineral telefone`) |
| B4 | **5 lotes vazios matam a cidade** — e com a web quebrada isso virou o modo padrão de morte | `HBX_SEARCH_RUN_MAX_EMPTY_BATCHES` default 5, `radar-search-run-config.service.ts:26-28` | Holambra, Pinhal, Estiva Gerbi = 0, ~90s cada queimados em wikipedia |

Os gates do funil estão CERTOS (`no_local_signal` matou Base Pizza/Device Test/Teams;
DDD-local, cidade-no-texto, floor 52) — estão comendo comida estragada, não filtrando errado.

### Fatos que protegem o plano (verificados)

- **Rejeição da porta RFB não persiste em lugar nenhum** (só log) → consertada a regra, os 26
  CNPJs voltam livres na próxima busca. Sem blocklist pra limpar.
- **Zero linhas `rejected` presas no pool** nas 6 cidades (SELECT em prod 17/08: 103 clean,
  22 sent_to_vendas). O único negativo-de-filtro que gruda (`status='rejected'`, só
  `ddd_mismatch` se cura) não mordeu aqui.
- **O pool já guarda o começo do ouro**: Valinhos tem 23 empresas de água acumuladas
  (Valinágua, Acquarella, RICCI, CONTRERAGUA...) — de buscas passadas. Nada se perdeu.
- **Duplicata visível no pool**: "Água em Valinhos" 3×, "Kero Água" 2×, "Água Volga" 2× —
  RadarLeadPool não tem coluna CNPJ (unique só phoneDigits/placeId) e a fusão não casou
  "RINAGUA LTDA." ↔ "Rinágua" (`fused=0` no log). Lote 5 cuida disso.
- **RFB com telefone da base vira card sozinho** (`isRealisticBrPhone` → true na primeira
  checagem, `quality-enrichment.mixin:988-989`) — não precisa de site/social pra sobreviver.
- **Busca é lane grátis** (cobrança é no claim) — drenar a RFB não custa crédito do cliente.
- **A ordem do planner (fast/quality/deep) é DECORATIVA** para o painel: o run de produção usa
  ordem hardcoded RFB→web→fusão (`loop.mixin:1274-1343`) e nunca chama o executor de lanes.
  google_textual/local_directory/vertical_source só existem no caminho síncrono, atrás de flags
  OFF desde o cutover de 02/07.

---

## 2. DECISÕES DO DONO (fechadas em 17/08, no chat)

1. **RFB entrega TUDO primeiro.** A web vem depois, como complemento.
2. **Brave PAUSADO** até começar retorno financeiro — não implementar agora; fica na geladeira
   com gatilho de religamento.
3. **Nada de pesquisador/provedor pago.**
4. **Foco = distribuição.** O mapa segmento→CNAE nasce curado pro ramo de distribuição
   (água/gás/bebidas), não pra taxonomia inteira.
5. **Não perder dados; o que não rende pode sair.** Nada de faxina de dados (lei do
   desaparecer) — descarte aqui é tirar lane morta da ORDEM, nunca apagar código/rótulo/linha.

---

## 3. OS LOTES (1 por vez; o dono testa a cena antes do próximo)

### LOTE 1 — A porta da Receita para de matar o alvo 🔑 (maior retorno, menor mudança)

**Cena de aceite:** disparo "distribuidoras de água" em Valinhos → FERREIRAGUA, VALINAGUA,
ACQUARELLA, RICCI & RICCI, RINAGUA, VEGAS aparecem na tela (hoje: 2). Em Hortolândia (onde 0
casavam o nome) → as 26 com CNAE de água/bebida entram.

**Mexe onde:**
1. **Nasce o mapa curado segmento→CNAE** — arquivo novo em `radar/shared/` (lei única, nunca
   espalhado), começando pelo ramo do dono:
   - `distribuidora de água` → `4635401` (atacado água mineral), `3600602` (distribuição por
     caminhões), `4723700` (varejista bebidas) **+ exigência de sinal "agua/aguas" no
     nome/texto**, `4784900` (GLP) **+ sinal "agua"**;
   - `distribuidora de gás` → `4784900`, `4682600`;
   - `distribuidora de bebidas` → `4635402/4635499`, `4723700`.
   O mapa entra em DOIS pontos: (a) no WHERE do dataset como OR adicional
   (`cnpj-public-dataset.service.ts:50-57`) — destranca A1 sem afrouxar o match textual; (b) na
   porta do provider: CNAE da allowlist do pedido = **evidência positiva que vence a exclusão
   genérica** (`radar-segment-exclusion.util.ts` ganha o conceito; hoje exclusão vence tudo) —
   destranca A2 sem derrubar a regra (loja de roupa, mercadinho, SANASA/saneamento,
   "Distribuidora de Energia" continuam fora).
2. **Motivo honesto** (A7): `records=[]` pós-consulta vira `cnpj_public_sem_match_na_base`;
   `sem_base_configurada` só quando a base realmente não respondeu.

**Portão de prova (vacina red-first, ANTES do fix):** fixture com os 9 nomes reais de Valinhos
(6 hoje rejeitados) + regressão das exclusões (varejo puro de roupa, saneamento, energia,
transporte) + teste do motivo honesto. Roda em `radar-web-source-gate.test.ts` vizinhança /
teste novo do mapa.

**Não perde dado:** zero — só regra de aceite. Rejeição de porta não persiste (verificado).

### LOTE 2 — A RFB drena a base inteira antes da web

**Cena de aceite:** busca de 100 em Indaiatuba → ~40 cards de uma vez (água/bebida com fone na
base), entregues ANTES do primeiro lote web; a tela não fica 10 min "buscando" pra isso.

**Mexe onde (o menor ponto é o call-site, não o planner):**
1. Teto A3: `limit = min(remaining, 20)` → `remaining` (`loop.mixin:283`).
2. Gate A4: `ranThisRun` → só `zeroAccepted`/esgotamento — a RFB repete a cada lote até secar
   (o marcador de seca já existe em `:312-314`).
3. Drenagem A5: cursor (por `cnpj`/`id`) no `fetchRecords` sobre o MESMO WHERE, páginas de 500,
   até secar ou bater a meta.
4. **Web só entra se a RFB secou e ainda falta pra meta** — condicionar o `searchHbxEngine`
   (`loop.mixin:1289`) ao esgotamento da RFB. É a encomenda literal do dono.
5. Mensagem honesta: "Entreguei 4 de 100; revise alcance" → cita o disponível real: *"A Receita
   tem N nessa cidade; entreguei M; a web completou +K"* (o count já existe —
   `radar-base-availability.util` / `cnpj-base-query`).

**Portão de prova:** teste de loop com base fake de 86 → run entrega 86 sem web; teste
"web só após seca"; e a cena ao vivo na bancada (company 39, localhost) antes de publicar.

**Cuidado:** `deferPersistence`/fusão continuam — RFB segue canônica na fusão
(`radar-result-merger:396-402`). O que muda é o VOLUME e o MOMENTO, não o contrato.

### LOTE 3 — Web enxuta: complemento que não queima tempo em lixo

**Cena de aceite:** cidade sem nada na base (Estiva Gerbi) morre em ~2 lotes com mensagem limpa,
não em 5 lotes de wikipedia; cidade com web viva ainda soma leads reais (a web de Indaiatuba
somou 9 hoje — ela rende quando a descoberta entrega página local).

**Mexe onde (tudo grátis, decisão B do dono respeitada):**
1. **Matar o rodízio-auto** (B1): em `search_discovery_rows` (`discovery.py:398-405`), pular o
   ddgs — ir direto ao Bing scraper (searxng continua na frente SE a env existir um dia). O ddgs
   com DDG/Mojeek mortos + rodízio wikipedia é pior que inútil: ele SUPRIME o Bing.
2. **Cidade entre aspas** (B3): nas 5 formas de query (`discovery.py:106-112`),
   `f'"{city}" {state}'` — provado 10/10 vs 0/10. Só no ramo pj (a linha 80 alimenta pf também).
3. **Freio curto** (B4): `HBX_SEARCH_RUN_MAX_EMPTY_BATCHES=3` na VPS (é env, sem código;
   restart do backend aplica). Com a RFB drenando primeiro, lote web vazio ficou mais barato de
   abandonar.
4. Seeds de diretório (solutudo/apontador/guiamais/listaamarela) já entram quando a descoberta
   fica abaixo do alvo (`discovery.py:586-592`) — ficam como estão.

**Portão de prova:** rodada real na VPS numa cidade-teste comparando antes/depois
(`[search:funnel]` no log do engine): % de lotes `approved=0` cai; nenhum lote com URL de
wikipedia/grokipedia. Vacina: teste unitário do shape de query com aspas.

### LOTE 4 — O relatório para de mentir (a "pesquisa suja" que o dono vê)

**Cena de aceite:** fim da sessão → por cidade: *"Valinhos: 11 (Receita 8 · Web 3)"*, e as
zeradas visíveis: *"Estiva Gerbi: 0 — sem base na Receita, web sem sinal local"*. Sessão com 5
mortas e 1 viva NÃO fecha como "Busca concluída" seca.

**Mexe onde:**
1. `laneBreakdown: {rfb, web}` no `metricsJson` do run — SEM migration (o update preserva chave
   extra, `radar-run-repository:511-516`); ponto de emissão já existe (`loop.mixin:316` e na
   fusão `:1375`).
2. O tick da sessão copia o breakdown pro `citiesJson` (`radar-search-session.service.ts:237-244`).
3. A tela renderiza o array `cities` que **já viaja até o navegador e nunca foi renderizado**
   (`SessionResponse.cities` tipado em `page.client.tsx:213`, uso: zero). Mensagem final da
   sessão diferencia "concluída" de "concluída com N cidades zeradas"
   (`radar-search-session.service.ts:304-313`).

**Portão de prova:** teste do presenter da sessão + cena no navegador da bancada (dono vê a
lista por cidade). Copy mínima, só o pedido.

### LOTE 5 — Uma empresa = um card (dedup e fusão com acento)

**Cena de aceite:** re-busca em Valinhos → "Água em Valinhos"/“Kero Água”/“Água Volga” não
duplicam; RINAGUA (Receita) + Rinágua (web) = **1 card fundido** (`rfb+web`).

**Mexe onde:**
1. Fusão: match de nome normalizado (sem acento/caixa — "Rinágua"≠"RINAGUA" foi o `fused=0` de
   hoje) no `radar-result-merger` — respeitando a lei "CNPJ chave absoluta" que já existe em
   memória.
2. Dedup contra o BANCO por CNPJ: antes do create no pool, procurar também
   `placeId = cnpj_public:<cnpj>` e CNPJ no `metadataJson` do candidato (a coluna não existe —
   avaliar coluna nova `cnpj` UNIQUE parcial como migration aditiva, reversível).
3. As duplicatas já existentes no pool: **NÃO apagar** (lei do desaparecer). Merge manual só
   se o dono pedir; o lote impede duplicata NOVA.

**Portão de prova:** teste red-first com o par real RINAGUA/Rinágua + os trios do pool; re-busca
na bancada sem card novo duplicado.

### LOTE 6 — Faxina das lanes mortas (descarte autorizado, sem perder dado)

**Cena de aceite:** nada muda na tela — é limpeza de mapa. `npm run gate` verde.

**Mexe onde:** tirar da ORDEM (nunca do vocabulário): `google_textual` (motor quebrado com
query diferente, morta desde 02/07), `local_directory`/`vertical_source` (stubs — provider exige
`records` que nenhum caller fornece; 4 portões, nada atrás), `reprocess_old_cards` (enabled mas
ausente de toda estratégia). Atualizar o 1 teste que exige presença
(`radar-search-engine.test.ts:296-318`). **Manter**: rótulos em `radar-lead-source.types` e
`radar-source-lanes` (cards históricos), `reprocess_missing_social` (Prisma puro, casa com "não
perder dados" — fica OFF como está), `website_crawl_light` como enriquecedor pós-save (não
depende da descoberta quebrada). Remover também o código morto `shouldRestSearchRun`/
`stopWhenEnough` se o gate não reclamar.

---

## 4. GELADEIRA (pausado com gatilho, decisão do dono)

| Item | Gatilho de religamento |
|---|---|
| **Brave Search API como descoberta L0** (chave já no `.env` do backend, funciona da VPS: 200 em ~1,5s, resultado certeiro — valinagua, aguasdeholambra) | "Começar retorno" — dono manda. Implementação: provider `brave-api` na frente do Bing em `search_discovery_rows` + chave nos engines. ⚠️ `search_lang=pt-br` (com `pt` dá 422) |
| SearXNG self-host | Medido lento em 29/06 (throughput 6× pior). Só com nova medição |
| local_directory / vertical_source com base real | Alguém construir o fetcher de registros — hoje é stub |
| Backfill/import RFB→pool em massa (fábrica) | Fora desta encomenda; a drenagem do Lote 2 já cobre a busca do cliente |

---

## 5. RISCOS E CUIDADOS

1. **Regra de ouro**: histórico negativo nunca se apaga — nenhum lote toca dado existente
   (verificado: nada preso como `rejected` nas 6 cidades).
2. **Lote 2 muda o coração do loop** — é o lote mais sensível. Testar na bancada (company 39)
   antes de publicar; a lane RFB isenta do gate web (`WEB_GATE_EXEMPT_SOURCES`) continua isenta.
3. **Cap de 100 por cidade** é teto em 3 camadas (front select 25/50/100, DTO, clamp da sessão) —
   drenagem entrega até a META, não além; subir o teto é decisão de produto separada (não incluída).
4. **Estado 1×-por-run da RFB é Map em memória** — o Lote 2 o substitui por marcador de seca;
   restart de backend no meio de run deixa de ser fonte de comportamento diferente.
5. **Publish** reinicia webwhats.service (re-link é seguro; o perigo era loop de reconexão, já
   morto pelo disjuntor) e usa `reload` no nginx (lei do 17/08).
6. Ordem de publicação: cada lote = commit local + teste da cena pelo dono; publicar só quando
   o dono mandar (lei de 04/07 — sem branch).

## 6. O QUE CADA LOTE DEVOLVE EM NÚMERO (régua de sucesso)

- L1: Valinhos accepted 2→~8-11 · Hortolândia 0→até 26 · rejeições `varejo_puro` de água → 0.
- L2: 6 cidades: RFB entrega ~81-com-fone (hoje 5 aceitos no dia); tempo até o 1º card ↓.
- L3: lotes `approved=0` de ~52% → residual; cidade sem base morre em ~2 lotes, não 5.
- L4: dono enxerga cidade zerada e a origem RFB/web sem abrir log de servidor.
- L5: re-busca sem card duplicado novo; `fused>0` quando a mesma empresa vem das duas lanes.
