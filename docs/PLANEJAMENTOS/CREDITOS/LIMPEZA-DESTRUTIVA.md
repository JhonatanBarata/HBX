# LIMPEZA DESTRUTIVA — matar toda regra de papel que não seja "admin vê preço"

> Ordem do dono 04/07 (noite). O /vendas está cheio de legado de papel (vendedor×admin×gerente
> com comportamentos diferentes). O modelo final é UM só:
>
> **Master passa módulos ao admin (kill-switch) → Admin contrata créditos (mensal/avulso, MP) →
> Admin transfere créditos e acesso a gerentes/vendedores e controla quanto cada um usa →
> NO USO, TODOS SÃO IGUAIS. ÚNICA DIFERENÇA: ADMIN VÊ PREÇO, O RESTO NÃO.**
>
> Plano DESTRUTIVO: deletar código, não esconder atrás de flag. Workers executam sprint a sprint,
> LOCAL, dono revisa e publica. Casa com `PLANO.md` (Sprint 0 fechado): camadas módulo/RBAC/crédito,
> 1 crédito = 1 lead, cota da empresa = proto-carteira (D2: unificar, nada de double-accounting).

---

## O que ACONTECEU hoje (bug vivo que motivou isto — provado na VPS 04/07)

Busca "Anta Gorda / cartórios" → vitrine vazia ("Nenhuma empresa disponível") E o card
`cartorios.info` apareceu SOZINHO no funil. Causa única, no código:

- `shouldAutoImportRadarRunToVendas(user)` = `!isCompanySellerUser(user)`
  (`radar-core-delivery.mixin.ts:679-680`).
- `isCompanySellerUser` = `role === 'USER'` (presentation.mixin:215). O dono loga como
  **USERMASTER** → NÃO é seller → auto-import = **SEMPRE TRUE** pra ele.
- A cada batch com card aprovado, `autoImportAndStopIfPaused('incremental')` (search-loop) empurra
  o card direto pro funil E o reivindica (`sent_to_vendas`/owner) — e a vitrine "Disponíveis" só
  lista card SEM dono → **o auto-import ROUBA a vitrine**. Os 3 achados de Anta Gorda foram
  importados sozinhos; a vitrine ficou vazia.
- O refab S-BACKEND-UI só removeu auto-import **pro vendedor**; admin/master manteve o legado.
  Por isso "pedi pra remover e voltou": a remoção foi escopada por papel — exatamente o tipo de
  bifurcação que este plano mata.

Bônus do mesmo run: as mensagens "Radar parou sem cards novos para Vendas. Localizei 3..." vêm do
**gate de estoque** (`vendasStockTarget`) — outro legado por papel/fluxo que morre aqui.

---

## Inventário do legado (medido no código 04/07 — números reais)

| # | Legado | Onde | Tamanho |
|---|---|---|---|
| D1 | **Auto-import pós-run** (busca empurra pro funil sozinha) | `shouldAutoImportRadarRunToVendas`, `autoImportRadarSearchRunToVendas`, `autoImportAndStopIfPaused`, `isSearchRunPausedByLimit` (caminho de pausa por import) | 10 call-sites |
| D2 | **Gate de estoque do Vendas** (run freado pelo funil) | `vendasStockTarget`, `isRadarVendasStockGatedRun`, `getRadarVendasStockSnapshotForRun`, `hasReachedRadarVendasStockTarget`, `buildRadarVendasStockExhaustedMessage`, `stopSearchRunIfVendasStockLimitReached` | 36 sites |
| D3 | **Bifurcação de papel no Radar** (vendedor vê/faz diferente) | `isCompanySellerUser` em 4 mixins (search/delivery/distribution/presentation): sellerScope, `assertRadarLeadVisibleForUser`, assignToUserId, vitrine escopada | 21 sites |
| D4 | **Posse por vendedor no card** (card "do" vendedor) | `assignedUserId` no webscraping (claim/visibilidade/distribuição) | 76 sites |
| D5 | **Standing order** (compra automática por vendedor; pump já morto no refab, restos vivos) | `webscraping.controller.ts` (GET/PUT `/radar/standing-order`), delivery+distribution mixins, `saved-search.service.ts` | 5 arquivos |
| D6 | **Distribuir cards a vendedores** (admin distribui CARD; no modelo novo distribui CRÉDITO) | `/radar/leads/distribute-to-vendedores` + `claimRadarLeadForCompany` caminho de distribuição (distribution.mixin) | endpoint + mixin |
| D7 | **Cota por plano/tier no Radar** (paywall por tier — CREDITOS matou o tier) | `COMMERCIAL_PLAN_QUOTAS` + `resolveCommercialPlanKeyForCapabilities` importados em 4+ arquivos do radar | 4+ arquivos |
| D8 | **Capacidade de cards por papel no Vendas** | `cardCapacity.isSeller` / slots por vendedor (`vendas.service.ts:7679-7687`) | 1 bloco |

## O que FICA (e é TUDO que fica)

1. **LEI DO VENDEDOR** — máscara de preço/valores pra não-admin (`vendas.service.ts:7711`,
   `PAGAMENTOS.md`). Única bifurcação por papel permitida, e SÓ na camada de apresentação.
2. **Camada módulo** — kill-switch do master por empresa (PLANO.md invariante 1).
3. **Camada RBAC de ACESSO (hierarquia de GERIR) — FICA INTEIRA.** `UserTeamPolicy.modulesJson` /
   `team-access-catalog`. Decide (a) se o usuário ENTRA no módulo e (b) **quem CONCEDE/REMOVE acesso e
   crédito de quem está abaixo**. Hierarquia real: **admin > gerente > vendedor**. **Vendedor NÃO
   concede nem remove acesso de ninguém; gerente/admin sim.** Isso é regra legítima, não legado.
   > ⚠️ **NÃO CONFUNDIR "achatar consumo" com "achatar quem gere acesso".** Módulo ≠ Acesso: módulo é
   > kill-switch do master (existe/não existe, sem papel); acesso é a hierarquia de gerir. A limpeza
   > (L1–L5) só achata o **CONSUMO do lead** (buscar/puxar/trabalhar = igual pra todos, menos preço).
   > Matar os `isCompanySellerUser` do **radar** (vitrine/funil/posse de card) NÃO encosta na RBAC de
   > acesso, que vive no `UserTeamPolicy`. Se um worker for mexer em quem-concede-acesso, PAROU — não é
   > escopo desta limpeza.
4. **Cota da empresa** (a "baixa" da árvore VENDAS-REFAB) — **único freio de quantidade**, contado
   no puxar manual. É o proto-crédito: CREDITOS S1/S2 troca o contador pela carteira (D2 fechado).
   ⚠️ NÃO deletar antes da carteira existir — é o único freio que sobra.
5. Governadores físicos de custo (SourceBudget/Brave, zap-disjuntor) — fora do crédito por design (D1 do PLANO.md).

---

## Sprints (workers, 1 por sprint, LOCAL, dono publica)

### L1 — Matar o auto-import (a dor de agora) 🔴 primeiro
- Deletar `shouldAutoImportRadarRunToVendas`, `autoImportRadarSearchRunToVendas` e TODOS os
  `autoImportAndStopIfPaused` do search-loop/delivery (10 sites). Busca abastece a VITRINE, ponto.
  Funil só recebe por puxada manual — pra TODO papel, inclusive USERMASTER/admin.
- Deletar o caminho de "pausa por import" (`isSearchRunPausedByLimit` no fluxo de import).
- Aceite: buscar → vitrine enche, funil NÃO muda; puxar 1 card → funil ganha 1, cota da empresa
  baixa 1. Testar logado como USERMASTER (o papel do dono — o caso que sempre escapou).

### L2 — Matar o gate de estoque (36 sites)
- Deletar toda a família `vendasStockTarget` (D2 da tabela). Run busca até `targetQuantity` e
  termina; funil nunca freia busca. Morrem as mensagens "Radar parou sem cards novos para Vendas".
- Aceite: run de cidade pequena termina `completed`/`completed_insufficient_results` com mensagem
  padrão de busca, sem referência a estoque do Vendas.

### L3 — Matar bifurcação de papel no Radar (21 + 76 sites)
- `isCompanySellerUser`: remover TODOS os usos comportamentais (sellerScope, vitrine escopada,
  `assertRadarLeadVisibleForUser`, assignToUserId no claim). Vitrine = lagoa única da empresa,
  igual pra todos; card puxado pertence à EMPRESA.
- `assignedUserId` vira só INFORMATIVO ("Responsável" = quem puxou) — nunca filtro de visibilidade
  nem trava de claim. Dos 76 sites, manter apenas escrita do responsável no puxar.
- `vendas.service`: deletar bloco `cardCapacity.isSeller` (D8). Manter APENAS a máscara de preço.
- Aceite: vendedor e admin veem a MESMA vitrine e o MESMO funil; única diferença nas telas =
  colunas/somas de R$ ocultas pro não-admin.

### L4 — Matar standing-order + distribuição de cards
- Deletar endpoints `GET/PUT /webscraping/radar/standing-order` + código nos mixins + hook no
  `saved-search.service.ts`.
- Deletar `/radar/leads/distribute-to-vendedores` + caminho de distribuição no distribution.mixin.
  (Admin distribui CRÉDITO — CREDITOS S4 — não card.)
- Front: remover UI de standing order e de distribuição.
- Aceite: endpoints 404; nenhuma busca dispara sozinha; tsc + suítes verdes.

### L5 — Matar tier/plan-quota no Radar (junto ou logo após CREDITOS S1/S2)
- Remover `COMMERCIAL_PLAN_QUOTAS`/`resolveCommercialPlanKeyForCapabilities` do caminho do radar
  (4+ arquivos). Limite de quantidade = cota da empresa (proto-crédito) — e SÓ ela.
- Quando CREDITOS S2 (débito shadow) provar em prod: contador da cota → carteira (1 puxada =
  1 crédito, FIFO por lote, fail-closed D7). Sem saldo: PUXAR bloqueia (neutro pro vendedor:
  `company_access_paused`-like); a BUSCA continua grátis (lane R$0 da árvore).
- Aceite: nenhuma referência a tier/plano decide quantidade no radar/vendas.

### L6 — Varredura final (front + testes + mortos)
- Grep de guarda: `isCompanySellerUser|standingOrder|vendasStockTarget|distribute-to-vendedores|
  COMMERCIAL_PLAN_QUOTAS` no radar/vendas → 0 hits comportamentais (exceção: máscara de preço).
- Atualizar testes que fixavam comportamento por papel; front sem UI órfã; Chrome test nos 2
  papéis (USERMASTER e vendedor) — mesmas telas, preço oculto num deles.

---

## Ordem e riscos
- **L1 e L2 já** (dor ativa do dono; zero dependência de crédito).
- **L3/L4 em seguida** (destroem papel; a cota da empresa segue sendo o freio).
- **L5 só com a carteira nascendo** (CREDITOS S1/S2) — senão fica-se sem freio de quantidade.
- Risco conhecido: memória `dono-e-usermaster-de-tenant` — todo aceite testa como USERMASTER,
  não como ADMIN; foi assim que o auto-import escapou do refab.
- Não tocar em: máscara de preço, kill-switch de módulo, governadores físicos, contador da cota
  (até L5).
