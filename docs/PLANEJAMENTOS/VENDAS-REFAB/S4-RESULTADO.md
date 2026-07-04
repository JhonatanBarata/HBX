# S4 — Front Vendas + Dashboard (modelo CNPJ Biz) — RESULTADO

> Worker local. Build + lint verificados por mim.
> **AVISO IMPORTANTE:** durante a execução deste sprint o dono commitou (localmente,
> author `JhonatanBarata`) o working tree inteiro — inclusive este trabalho de S4 — no
> commit `e1f3b276` ("feat(vendas): VENDAS-REFAB WIP do dono + docs (publicado a pedido:
> 'pode publicar tudo')"), junto com o S1/S2/S3 do backend. **NÃO fui eu quem commitou**
> (a instrução desta tarefa era não commitar/publicar) — foi ação do dono em paralelo.
> Confirmei que `origin/master` (`016171ea`) ainda NÃO tem esse commit — está commitado
> local, 2 commits à frente do remoto, `git push` ainda não rodou. Não revertive/mexi
> nisso (regra: nunca atropelar trabalho do dono) — só documentando o estado real.

## Arquivos tocados

- `frontend/src/app/(app)/vendas/page.client.tsx`
- `frontend/src/app/(app)/dashboard/page.client.tsx`
- `frontend/src/app/(app)/leads/page.client.tsx`
- `frontend/src/app/hbx-theme/screens.css`
- `frontend/src/app/globals.css`
- Removidos: `frontend/src/components/hbx/foco-game.tsx`, `frontend/src/app/hbx-theme/foco-game.css`

## O que mudou (por item da missão)

### 1. Números reais da base 28M (contrato S3)

- `leads/page.client.tsx`: `LeadsResponse.meta` e `BankResponse` ganharam
  `baseAvailable?`/`baseTotal?`. Novo `totalBrasilReal` = `bank.baseTotal` quando
  `bank.baseAvailable===true`, senão cai pro `bank.total` (pool) — nunca mostra
  `null`/"—" se o pool tiver número, nunca inventa 28M fixo. Usado em:
  - `onEmbedStats` (alimenta o card "Total no Brasil" do painel Buscar empresas,
    embutido no Vendas via `buscarStats.totalBrasil`).
  - Linha fininha "Total no Brasil" da tela `/leads` standalone (não embutida).
- `dashboard/page.client.tsx`: "Leads na base (Radar)" trocou de
  `/webscraping/radar/leads?page=1&limit=1` (lia só `total` do pool, sem `scope=vitrine`
  então nunca teria `baseTotal`) para `GET /night-factory/leads-bank`, que já devolve
  `baseAvailable`/`baseTotal` prontos (endpoint mais barato pra 1 KPI, contrato S3
  documentado explicitamente pra esse número).
- Local (ambiente do dono agora) mostra `baseAvailable:false` até a carga da RFB rodar
  na VPS — cai pro pool antigo, igual documentado no S3-RESULTADO. Não é bug novo.

### 2. Removido "Canais Exigidos" e "Ativar modo foco"

- **Canais exigidos** (BLOCO B3 do painel Buscar empresas, `leads/page.client.tsx`):
  removido o toggle "Forçar: Ligado/Desligado" + 6 chips de canal. Foi substituído por
  um **filtro estilo CNPJ Biz** no mesmo bloco (ver item 5). Limpeza de órfãos:
  `canalAtivos`/`forcarCanais`/`toggleCanal`/`ALL_CANAIS`/`CanalKey` removidos;
  `buildFiltroSnapshot` perdeu o parâmetro `requiredChannels` (não há mais UI pra
  produzi-lo); `applySavedSearch` não tenta mais restaurar canal de pesquisa salva
  antiga (ignora o campo em silêncio, sem erro); `executarBusca` não manda mais
  `requiredChannels`/`channelMatchMode`. `describeFiltro` manteve a leitura de
  `requiredChannels` só pra description de pesquisas SALVAS antigas (não escrevo mais
  esse campo, mas leio se existir). CSS órfão removido de `screens.css`
  (`.radar-canais__chips`, `.radar-canais__warn`, `.radar-canal-toggle*`).
  **Não toquei** `requiredChannels`/`channelMatchMode` no backend — o S3-RESULTADO já
  confirmou que não é lixo morto (`RadarSearchInputService` ainda consome de verdade);
  só a UI que oferecia esse controle foi removida, como pedido.
- **Ativar modo foco** (botão desktop em `vendas/page.client.tsx`, abria `FocoGame`):
  removido o botão + o render condicional de `<FocoGame>` + estado `focoGameOpen` +
  derivação `focoLeads`. Como `FocoGame` ficou **sem nenhum outro caller** no repo
  (única tela que o usava), deletei o componente inteiro
  (`components/hbx/foco-game.tsx`, 284 linhas) e seu CSS dedicado
  (`hbx-theme/foco-game.css`, 257 linhas — incluía tokens `--foco-fire*` que só ele
  usava) + o `@import` em `globals.css` (sem legado, FRONTEND.md). O "Modo foco"
  MOBILE (`VendasModoFoco`, botão separado, componente diferente) **não foi tocado** —
  não é o item pedido, e não usa `FocoGame`/`focoGameOpen`.

### 3. "Cards no funil" rotulado como agregado da empresa

`GET /vendas/board` devolve o board SEM filtro de vendedor (`buildLeadAccessWhere`)
quando `context.canManageTeam` é true (admin/master) — todos os cards da empresa,
não só os do usuário. Confirmei lendo `backend/src/vendas/vendas.service.ts:1927`
(`buildLeadAccessWhere`). Front agora rotula condicionalmente:
- `dashboard/page.client.tsx`: KPI vira `"Cards no funil (empresa)"` quando
  `!isSeller` (usa `isCompanySeller` de `@/lib/roles`, já importado); mantém
  `"Cards no funil"` simples pro vendedor (o board dele já é escopado só nos
  cards dele — rótulo correto como estava).
- `vendas/page.client.tsx`: mesma ideia usando `board?.team` como sinal de
  `canManageTeam` (já documentado no tipo `BoardResponse` como "só vem preenchido
  pra admin/gerente") — `"Cards no funil (empresa)"` quando presente.

### 4. Cota só pro ADMIN

Investiguei toda a cadeia cota/valor/baixa em `leads`/`vendas`/`dashboard`:
- `leads/page.client.tsx` **já** branch corretamente por papel: `meterLabel` vira
  `"Em mãos"` (carteira pessoal, não-financeiro) pro vendedor e só mostra
  `"Cota da empresa (mês)"` (a cota financeira de verdade) pro admin — confirmado
  lendo `isSeller`/`meterLabel`/`meterValue`. `renderQuotaPaywall()` já tem
  `if (!meterBlocked || isSeller) return null` — paywall de cota nunca aparece pro
  vendedor. Nenhuma mudança necessária aqui, já estava certo.
- `dashboard/page.client.tsx`: não tem nenhum conceito de "cota" — vendedor vê
  "Comissão a receber" (a comissão DELE, não a cota da empresa; comentário no
  código já registra "ordem do dono"), demais perfis veem a base do Radar. Sem
  vazamento.
- `vendas/page.client.tsx`: reforço defensivo no card "Cota do mês" do painel
  Buscar empresas — adicionei `isSellerVnd = isCompanySeller(userVnd)` e, quando
  true, o card sempre mostra rótulo `"Em mãos"` (não `buscarStats.cotaLabel`, que
  hoje já vem seguro do `leads/page.client.tsx` mas fica hard-coded seguro aqui
  também, caso o contrato do backend mude no futuro). Nunca mostra `"Cota da
  empresa (mês)"` pro vendedor.

### 5. Filtro estilo CNPJ Biz

Não reinventei o filtro do zero (S3 deixou explícito que `porte` não existe ainda em
`RadarFiltersInput`/`NormalizedRadarFilters` — inventar campo de UI sem contrato de
backend violaria "sem dado real"). Usei o que **já existe** no DTO do backend
(`RadarDatabaseQueryDto`/`RadarPullDto`, confirmado lendo
`backend/src/webscraping/webscraping.controller.ts:238-251`) mas nunca foi exposto
na UI:
- **Tem site**: tri-estado Qualquer / Com site / Sem site → `withWebsite`/`noWebsite`
  (mutuamente exclusivos, como o backend já espera).
- **Tem WhatsApp provável**: Qualquer / Com WhatsApp → `likelyWhatsapp`.

Aplicado em 2 lugares:
- `loadList` (GET `/webscraping/radar/leads?scope=vitrine`) — filtra a prateleira
  (pool + amostra da base), com debounce de 300ms igual aos demais filtros
  (`siteFiltro`/`zapFiltro` entraram na dependency array do efeito de filtro).
- `executarBusca` (POST `/webscraping/radar/search-runs`) — mesmos parâmetros no
  corpo da busca ao vivo (`RadarPullDto` estende o mesmo DTO), pra busca e
  prateleira ficarem consistentes.

CSS: reusei as classes centrais já existentes (`.radar-canais`, `.radar-canais__head`,
`.radar-canais__lbl`, `.radar-canais__switch`/`--on`) — só troquei o conteúdo dos
botões e adicionei `.radar-canais__tristate` (flex-wrap) pro agrupamento dos 2
mini-grupos de toggle. Zero hex/cor nova.

## 5 Leis do Design System — verificação

- `cd frontend && node ./scripts/check-pele.mjs` **falha**, mas as violações são
  **100% pré-existentes em `origin/master`** (`016171ea`), em arquivos que eu não
  toquei (`hbx-theme/bot-builder.css:163`, `hbx-theme/whatsapp.css` — várias linhas)
  e em `screens.css:1555`/`1572`, que já existiam nesses exatos números de linha
  antes do meu diff (confirmado via `git show origin/master:...`). Meu diff em
  `screens.css` na verdade **removeu uma violação** (`rgba(0,0,0,0.05)` do bloco
  `.foco-enter`, deletado junto com o FocoGame). Nenhuma violação nova em
  `vendas`/`dashboard`/`leads` `page.client.tsx` (confirmei filtrando a saída do
  check-pele por esses arquivos — zero ocorrências). Fora do escopo deste sprint
  mexer em `whatsapp.css`/`bot-builder.css` (regra dura de `Webwhats`/CLAUDE.md);
  sinalizando a pendência pro dono via task separada.

## Build / Testes

- `cd frontend && npm run build` — verde (Next 16 + TypeScript, compilação e
  typecheck sem erros, 32 rotas geradas).
- `npm run lint` (eslint) — sem erros novos introduzidos pelos meus 3 arquivos;
  os erros/warnings que aparecem no output (`master/contabil-fechar-mes.tsx`,
  `master/janela-contabil.tsx`, `components/hbx/bot-prosp-fields.tsx`,
  `lib/voice-rubberband.ts`, `register/page.client.tsx`) são em arquivos que eu
  não modifiquei (confirmado `git status`/`git show` — pré-existentes).
- `check-pele.mjs` — ver seção acima (falha pré-existente, não-regressão minha).

## Pendente pro dono

1. **Estado do commit `e1f3b276`**: está local, 2 commits à frente de
   `origin/master`. Não fiz `git push`/`npm run publish` (proibido pela tarefa) —
   decidir se/quando publicar de fato.
2. `check-pele.mjs` está QUEBRADO em `origin/master` por violações pré-existentes
   em `bot-builder.css`/`whatsapp.css`/`screens.css` (linhas 1555/1572, não
   tocadas por mim) — não é regressão deste sprint, mas bloqueia `npm run lint`
   pra qualquer um até alguém tokenizar essas cores. Sinalizado como tarefa
   separada.
3. Filtro "tem site"/"tem WhatsApp" funciona local só sobre o POOL (poucos
   registros) — validação com volume real (28M) depende da carga RFB na VPS,
   mesma pendência já registrada no S3.
4. Se o dono quiser filtro por `porte` (como no CNPJ Biz), falta estender
   `RadarFiltersInput`/`NormalizedRadarFilters` no backend primeiro (S3 já
   registrou isso como fora do escopo dele; segue fora do meu também — é mudança
   de contrato, não só UI).
5. Não validei visualmente no Chrome (só build/typecheck/lint) — o dono pediu
   para não publicar; se quiser eu suba um preview local (`npm run up`) pra
   conferir visual antes de decidir publicar, é só pedir.
