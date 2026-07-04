# S1 — Regras/Cota do Vendas (backend) — RESULTADO

> Worker local, NÃO publicado, NÃO commitado. Build + testes verificados por mim.

## Arquivos tocados

- `backend/src/webscraping/radar/05-delivery/radar-core-delivery.mixin.ts`
- `backend/src/commercial-plans/commercial-usage-limits.service.ts`
- `backend/src/webscraping/webscraping.service.test.ts`
- `backend/src/commercial-plans/commercial-usage-limits.service.test.ts`

## O que mudou

### 1. Gate de estoque (pending-count) agora só vale pro caminho do VENDEDOR

`getVendasPendingCountForRadarContext` (radar-core-delivery.mixin.ts) reescrito. Antes:
não-vendedor caía no `else` e contava `getPendingCount(companyId)` (empresa toda) —
esse número alimentava `stopSearchRunIfVendasStockLimitReached`, `assertRadarCanFeedVendas`,
`canResumePausedSearchRun` e o gate em `buildRadarSearchRunResponse`, pausando a busca do
admin com "Vendas ja esta com N de M card(s)" mesmo os N cards sendo de outros vendedores.

Agora:
- Se o contexto tem `user` (caminho quente, sem round-trip extra): `isCompanySellerUser(user)`
  decide na hora. Não-vendedor → devolve `0` incondicionalmente, sem nem consultar o banco de
  pendências. Vendedor → conta só a carteira dele (`getPendingCountForSeller`).
- Se só há `companyId`/`userId` crus (run pausado/retomada assíncrona): resolve o papel via
  `CommercialUsageLimitsService.getSellerActiveCardQuotaSnapshot` quando o serviço está
  injetado; se não está (`@Optional()`, pode faltar em algum boot), fallback novo
  `isRadarSellerUserId` consulta `prisma.user` direto (role/isSystemMaster). Em qualquer
  ambiguidade, o resultado é "NÃO é vendedor" — nunca o contrário — pra jamais travar admin
  por omissão de dependência opcional.

Como **todos** os call-sites do gate de estoque (`stopSearchRunIfVendasStockLimitReached`,
`assertRadarCanFeedVendas`, `canResumePausedSearchRun`, `buildRadarSearchRunResponse`,
`RadarVendasSyncService.autoImportSearchRunToVendas` via `buildRadarVendasSyncHost`) passam
por esse método único, a correção fecha o bug em todos eles de uma vez — não precisei tocar
call-site por call-site.

### 2. Cota comercial da empresa (teto real do Master) — INTOCADA

`quotaBlocked` em `startRadarSearchRunForUser` (via `CommercialUsageLimitsService.getUsageSnapshot`)
continua valendo pra todos, inclusive admin. Esse é o único teto legítimo do admin — decidido
pelo Master, mensal ("LEADS DO MÊS x/5.000"). Não toquei nessa lógica.

### 3. Teto por vendedor: default ilimitado + penalidade de inatividade atrás de flag

Investiguei `getSellerActiveCardQuotaSnapshot` (commercial-usage-limits.service.ts) e constatei
que **já** estava alinhado com a regra "vendedor sem teto explícito do admin nasce ILIMITADO"
(lei do dono 27/06, `SELLER_ACTIVE_CARD_LIMIT_UNLIMITED`): sem `targetStockPerSeller` configurado
e sem `activeCards` na team policy, `unlimited=true`, sem penalidade. Isso já era código existente
— não é invenção minha, só confirmei que cobre o item do plano.

O que faltava: quando o admin **já configurou** um teto (`targetStockPerSeller`), a penalidade
dinâmica de inatividade (`resolveSellerCardQuota` em `seller-card-quota.util.ts`) cortava o
`effectiveLimit` sozinha (25%/50%/quase-zero conforme dias sumido) sem nova ação do admin — o
"zera sozinha" citado na tarefa. Implementei `HBX_SELLER_INACTIVITY_PENALTY_ENABLED` (env,
default **OFF**) gateando `allowInactivityPenalty` passado a `resolveSellerCardQuota`. Com a
flag OFF (default), o vendedor com teto explícito mantém o teto cheio mesmo sumido há 30+ dias;
com a flag ON, a penalidade dinâmica volta a valer como antes.

Também removi `resolveInactivityPenalty` (método morto em `commercial-usage-limits.service.ts` —
não era chamado por ninguém; a penalidade real sempre veio de `resolveSellerCardQuota`, do util).

## Decisões

- Optei por env-flag (`HBX_SELLER_INACTIVITY_PENALTY_ENABLED`) em vez de campo novo no schema
  Prisma pra não puxar uma migration pra dentro do S1 — o plano pedia "flag admin default OFF";
  se o dono quiser esse controle exposto na UI (por empresa, não global), é mudança de schema +
  S2/S4 (front), fora do escopo deste sprint. Sinalizando aqui pro dono decidir.
- O gate de estoque decide "é vendedor?" com **fail-safe para não-vendedor**: qualquer situação
  de dúvida (serviço de cota ausente, usuário não encontrado) resolve como "não é vendedor" →
  não pausa. Isso é proposital e simétrico à árvore (nunca capar admin por engano), mas também
  significa que se um `userId` de vendedor genuíno ficar inacessível no banco (usuário deletado,
  por exemplo) ele deixaria de ter o gate de estoque aplicado — cenário de borda considerado
  aceitável (o teto de vendedor é proteção operacional, não trava de segurança/dinheiro).
- Não toquei em `radar-core-distribution.mixin.ts` nem nas leis de distribuição
  (território/segmento/alocação por vendedor) — isso é S2, sequencial e dependente deste S1.

## Build / Testes

- `cd backend && npm run build` — verde (typecheck estrito, `tsc -p tsconfig.json` sem erros).
  Obs.: `node_modules` do backend estava vazio no início da sessão; rodei `npm ci` primeiro
  (317 pacotes) — não é uma mudança minha, era pré-requisito de ambiente.
- `webscraping.service.test.ts`: 115 pass / 0 fail / 1 skip (pré-existente). Reescrevi o teste
  `startRadarSearchRunForUser pausa quando Vendas ja esta no limite` — antes mockava
  `service.assertRadarCanFeedVendas` diretamente (mascarando o próprio método corrigido) usando
  `createUser()` = ADMIN; virou dois testes:
  - `... VENDEDOR pausa quando Vendas ja esta no limite (teto explicito do vendedor)` — prova
    que o gate CONTINUA valendo pra vendedor real (role=USER).
  - `VENDAS-REFAB S1: ADMIN com 20 cards pendentes na EMPRESA NAO pausa a busca (cerne do bug)`
    — prova o fix: admin com 20 cards pendentes reais na empresa (mock de
    `radarVendasSync.getPendingCount` retornando 20) segue a busca normalmente; a contagem de
    empresa nem chega a ser chamada pra decidir o gate do admin.
- `commercial-usage-limits.service.test.ts`: 14 pass / 0 fail (12 pré-existentes + 2 novos).
  Novos testes provam que a penalidade de inatividade fica OFF por default (vendedor com teto
  de 20 e 30 dias sumido mantém `effectiveLimit=20`) e só corta quando
  `HBX_SELLER_INACTIVITY_PENALTY_ENABLED=true`.
- `seller-card-quota.util.test.ts`: 5 pass / 0 fail (inalterado).
- Suítes adjacentes rodadas por precaução (radar-delivery-orchestrator, radar-post-delivery-
  vendas-update, vendas-automation, commercial-contact-fingerprint, vendas-lead-enrichment):
  todas verdes.
- `vendas.service.test.ts` tem 8 falhas **pré-existentes**, confirmadas via `git stash` (mesmo
  resultado — 72 tests/64 pass/8 fail — com e sem meu diff). Causas: mock de teste sem
  `getSellerCardCapacitySnapshot` e dessincronia de asserção em
  `importWebscrapingLeadsForUser`. Não relacionadas a este sprint; não mexi nelas.

## Pendente pro dono testar ao vivo

1. Login como ADMIN numa empresa com vendedores carregados (cards pendentes na empresa
   >= quantidade pedida na busca) e disparar "Buscar empresas" no Radar — busca NÃO deve mais
   pausar com "Vendas ja esta com N de M card(s)".
2. Login como VENDEDOR (role USER) na mesma situação — o gate de estoque da CARTEIRA DELE
   (não da empresa) deve continuar pausando normalmente quando ele mesmo estiver cheio.
3. Confirmar que a cota comercial da empresa (mensal, "LEADS DO MÊS x/5.000") ainda bloqueia
   corretamente quando esgotada — testado só via mock, não ao vivo.
4. Decidir se `HBX_SELLER_INACTIVITY_PENALTY_ENABLED` deve virar configuração por empresa
   (banco) em vez de env global — hoje é flag de processo, vale pra todas as empresas do
   ambiente igual.
5. Migrations: nenhuma. Esta mudança não alterou o schema Prisma.
