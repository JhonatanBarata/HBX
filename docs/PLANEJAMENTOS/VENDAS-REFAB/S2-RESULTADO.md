# S2 — Leis de distribuição (backend) — RESULTADO

> Worker local, NÃO publicado, NÃO commitado. Build + testes verificados por mim.
> Não revertei nada do S1 (já aplicado no working tree antes deste sprint).

## Arquivos tocados

- `backend/src/webscraping/radar/05-delivery/radar-core-distribution.mixin.ts`
- `backend/src/webscraping/radar/05-delivery/radar-core-distribution.test.ts` (novo)

## Onde estava o gap de verdade

A tarefa apontava `pickLeadsForEnrichment` como cego à preferência do vendedor.
Investiguei e essa função **não existe** no mixin de distribuição — vive em
`backend/src/night-factory/night-factory.service.ts`, um worker noturno GLOBAL
de enriquecimento do pool (sem conceito de empresa/vendedor: não recebe
`companyId`/`userId`). Não é o caminho de entrega por-vendedor e mexer nela
seria alterar comportamento de enriquecimento fora do escopo do Vendas —
sinalizado, não tocado.

O gap real (Gaps 1 e 2 do plano: "roteia por 1 segmento global da empresa,
ignora preferência do vendedor") está em
`executeRadarAutoDistributionRule` (distribuição automática por-empresa, pump
~2min): a fila (`queue`) round-robin entre recipients (admin + vendedores) e
a leitura de linhas (`queryRadarRowsForCompany`) usavam **um único filtro de
segmento — o da regra da empresa (`rule.segment`)** — para todo mundo. O card
que cada slot da fila recebia era simplesmente o próximo da lista compartilhada,
sem checar se batia com o segmento preferido daquele vendedor específico
(`User.preferredSegmentsJson`).

O Gap 3 (teto por vendedor = cerca de baixas, sem travar empresa/admin) **já
estava correto antes deste sprint**: `getSellerActiveCardQuotaSnapshot` já era
chamado por-recipient (linha ~841 original) e um vendedor sem `availableSlots`
já virava `needed=0` isoladamente, sem afetar os demais. Escrevi teste pra
travar essa garantia (não regredir no futuro), mas não havia bug aqui.

## O que mudou

### 1. `listActiveDistributionSellers` agora lê `preferredSegmentsJson`

Faltava no `select` do Prisma (só a variante `listRadarDistributionSellers`,
usada pelo fluxo de tenant, já selecionava). Adicionado o campo + método novo
`resolveSellerPreferredSegments(seller)`, que reusa `extractPreferredSegmentList`
(já existente em `06-presentation`, mixado no mesmo `this` via
`applyRadarCoreMixins`) — mesma fonte de leitura que o boost de
`resolveRadarPreferenceSegments` no Radar/Leads já usa. Nenhuma lógica de
parsing nova; só reuso.

### 2. Cada recipient carrega seus `preferredSegments` (normalizados)

`recipients` (admin + vendedores) ganharam o campo `preferredSegments: string[]`.
Admin sempre `[]` (ele usa o segmento da regra, sem cerca de segmento — regra
de negócio inalterada). Vendedor recebe `resolveSellerPreferredSegments(seller)`.

### 3. Query de linhas alarga a rede pro segmento preferido de quem está na fila

`buildRadarAutoDistributionFilterInput` ganhou um 3º parâmetro opcional
`extraSegments`. Dentro de `executeRadarAutoDistributionRule`, antes de
consultar `queryRadarRowsForCompany`, calculo a união dos `preferredSegments`
de todos os recipients na `queue` e passo como `extraSegments` — o filtro de
segmento que vai pro banco vira `rule.segment` ∪ segmentos preferidos da fila
(usa a mesma sintaxe de multi-segmento por vírgula que `splitHbxBatchSegments`
já suporta, sem inventar filtro novo). Território/cidade continuam hard-filter
inalterado (a cerca real); segmento virou uma rede mais larga pra dar
candidato real ao passo 4. A fábrica externa (`replenishRadarStockForUser`,
motor de descoberta) continua chamada só com o segmento da regra — não alterei
o gatilho comercial da campanha, só a leitura do banco já existente.

### 4. Alocação de card por slot agora escolhe por preferência, não por ordem crua

Troquei o `for (const row of rows)` que consumia a lista sequencialmente por
um laço que, a cada slot da `queue`, chama `pickRowForTarget(target)`:
- Se o vendedor tem `preferredSegments`, procura a primeira linha ainda não
  usada cujo `normalizedSegment` bata com a preferência dele.
- Se não achar (ou não tiver preferência), cai no pool geral (primeira linha
  não usada) — **nunca fica sem card por causa de preferência de outro**
  (boost, nunca filtro — mesma filosofia de `boostRadarRowsByPreference` no
  Radar/Leads).

Preservei o comportamento de erro do laço original: se `importRadarLeadToVendasForUser`
falhar pra uma linha, o `target` (slot) **não avança** — a próxima iteração
tenta outra linha pro mesmo target (a linha que falhou já foi marcada como
usada por `pickRowForTarget`, então não é retentada). `blockedByLimit` (erro
de limite do plano) continua abortando o laço inteiro, igual antes.

## Decisões

- **Território continua sendo o único hard-filter da cerca.** Segmento
  preferido é BOOST (prioriza dentro do que já seria entregue), nunca filtro —
  decisão consciente pra não correr o risco de "vendedor com preferência
  esquisita nunca recebe nada". Isso espelha a filosofia já estabelecida em
  `resolveRadarPreferenceSegments`/`boostRadarRowsByPreference` (Radar/Leads,
  14/06), só estendida pro caminho de distribuição automática.
- **`executeRadarTenantDistributionRule` (distribuição do MASTER por tenant)
  NÃO foi tocada.** O próprio código já documenta a intenção do dono pra esse
  fluxo: `segmentMode: 'free'`, comentário `'Responsavel escolhe cidades;
  vendedor escolhe segmento no Vendas.'` — território fixo, segmento
  deliberadamente livre/sem preferência. Aplicar boost de segmento aqui
  contrariaria uma decisão de produto já tomada, não um gap.
- **Não toquei `night-factory.service.ts`.** É um worker global sem conceito
  de vendedor/empresa; "priorizar segmento preferido de vendedor" não se aplica
  a ele sem uma decisão de produto nova (a quem atribuir a Night Factory?).
  Sinalizo pro dono decidir se isso é escopo de um sprint futuro.
- **Sem migration.** `User.preferredSegmentsJson` já existe no schema (mesmo
  campo usado desde 14/06 pelo Radar/Leads); só passei a SELECIONAR no
  `listActiveDistributionSellers`, que antes não trazia essa coluna.

## Build / Testes

- `cd backend && npm run build` — verde (typecheck estrito).
- Novo arquivo `radar-core-distribution.test.ts` (4 testes, todos verdes):
  - `vendedor A CHEIO (teto de baixas atingido) nao impede vendedor B nem o
    admin de receber` — prova o Gap 3 (já correto, agora travado por teste).
  - `vendedor com segmento preferido e priorizado nesse segmento dentro da
    sua cerca` — prova o fix dos Gaps 1/2. **Confirmei que este teste FALHA
    sem meu fix** (rodei com `git stash` só do mixin de produção, mantendo o
    teste: o card do segmento errado ia pro vendedor errado) e passa com o
    fix restaurado.
  - `vendedor sem segmento preferido continua recebendo do pool geral` —
    garante que a mudança é aditiva (boost), nunca regressiva.
  - `territorio fora da cerca continua bloqueando so aquele vendedor` — prova
    que a cerca de território pré-existente não regrediu.
- Suítes adjacentes rodadas e verdes: `webscraping.service.test.ts` (115
  pass / 0 fail / 1 skip pré-existente — mesmo número de antes do S2),
  `commercial-usage-limits.service.test.ts` (14/14), `radar-delivery-
  orchestrator.test.ts`, `radar-post-delivery-vendas-update.test.ts`,
  `radar-post-delivery-ai-saneamento.service.test.ts`, `commercial-contact-
  fingerprint.test.ts`, `vendas-automation.service.test.ts`, `vendas-lead-
  enrichment.test.ts` — todas 100% verdes.
- `vendas.service.test.ts`: 72 testes / 64 pass / 8 fail, **idêntico com e
  sem meu diff** (confirmado via `git stash` só do meu arquivo de produção) —
  são as mesmas 8 falhas pré-existentes já documentadas no S1-RESULTADO.md,
  não relacionadas a este sprint.

## Pendente pro dono

1. Testar ao vivo: empresa com 2+ vendedores com `preferredSegmentsJson`
   diferentes rodando a distribuição automática (`runRadarAutoDistributionForUser`
   ou o pump de 2min) — confirmar que cada um recebe majoritariamente do seu
   segmento preferido, sem ninguém ficar sem card.
2. Decidir se a Night Factory (`night-factory.service.ts`) deve ganhar recorte
   por empresa/vendedor no futuro — hoje é global por design, fora do escopo
   desta árvore de distribuição.
3. Migrations: nenhuma.
4. Sprint 3 (filtro do Vendas = 28M + fusão) segue sequencial, dependente
   deste S2 — não mexi em `01-search`/filtro conforme pedido.
