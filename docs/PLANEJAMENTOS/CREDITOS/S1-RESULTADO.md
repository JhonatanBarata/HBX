# S1 — Ledger de crédito em LOTES — RESULTADO

> Executado em worktree isolado (`.claude/worktrees/agent-afad0a753d36b76b1`), LOCAL. NÃO publicado,
> NÃO commitado na master, NÃO rodou migration contra banco remoto. Escopo: só a fundação da
> carteira (schema + serviço + testes). Sem enforcement, sem tocar em vendas/commercial-usage-limits,
> sem checkout MP — isso é S2/S3.

---

## ⭐ Rodada de hardening — Fix A + Fix B (revisão Opus, pós-1ª entrega)

O Opus revisou a 1ª entrega (fundação aceita: CAS não vende a mais, FIFO/expiração, D7, decisões
#2/#3/#4/#5) e pediu 2 furos de integridade de DINHEIRO fechados ANTES do S2 depender disto. Ambos
foram corrigidos no MESMO worktree, sem alargar escopo. Estado atual: **13/13 testes verdes**
(11 originais + 2 novos de concorrência-mesma-usageKey), `prisma:validate` OK, `build` limpo.

### Fix A — atomicidade decremento + trilha (transação interativa)
Antes, em `debit`/`refund`/`expireLots`, o `updateMany`/`update` do lote e o `create` da linha de
movimento eram 2 statements soltos. Se o processo caísse ENTRE eles, o lote ficava alterado sem a
trilha → crédito somia sem rastro E um retry re-debitava (a idempotência procurava uma linha que
nunca foi escrita). Corrigido: cada par (mutação do lote + criação da linha de movimento) agora
roda dentro de `this.prisma.$transaction(async (tx) => { ... })`, usando `tx` nos dois — commitam
juntos ou nada. Aplicado nos três métodos:
- `debit`: cada decremento de lote + sua linha `debit` numa tx (por lote consumido).
- `refund`: TODO o corpo (a linha `refund` + os increments dos lotes + lotes-novos de fallback)
  numa ÚNICA tx — a linha `refund` é criada PRIMEIRO dentro dela e serve de trava de idempotência.
- `expireLots`: zerar `remaining` + a linha `expire` numa tx (por lote expirado).

### Fix B — idempotência sob concorrência (`@@unique` + tratamento de P2002)
Antes, o pré-check `findMany({usageKey, kind:'debit'})` NÃO era atômico com o débito: 2 chamadas
paralelas com a MESMA usageKey passavam as duas no pré-check e debitavam 2×. Corrigido:
1. **Schema**: `@@unique([usageKey, parentEntryId])` no `CreditLedgerEntry` (composto nativo do
   Prisma, sem partial index cru). Lotes têm `parentEntryId=null` → NULLs não colidem em unique no
   Postgres, então grants/recharges NÃO quebram. Linhas `debit` sempre têm `parentEntryId` (o lote)
   → o par (usageKey, lote) vira único no banco. A linha `refund` usa `usageKey='refund:<original>'`
   + `parentEntryId` do 1º débito → mesma trava serve pra refund concorrente.
2. **Service**: dentro da transação do Fix A, quando o `create` bate P2002 (concorrente já debitou
   aquele lote com essa usageKey), NÃO re-decrementa — a tx faz rollback daquele passo e a ação é
   tratada como já-processada: relê as linhas `debit` committadas dessa usageKey e retorna o
   resultado idempotente (mesmo shape). Nunca resulta em débito dobrado. O pré-check antigo
   virou só um ATALHO (sai cedo se já processado), não mais a trava.
3. **Migration**: `CREATE UNIQUE INDEX "CreditLedgerEntry_usageKey_parentEntryId_key"` adicionado
   ao `migration.sql` (ainda aditivo puro).

### Teste OBRIGATÓRIO novo — e a prova de que ele PROVA algo
- `debit: 5 chamadas PARALELAS com a MESMA usageKey sobre saldo cheio -> debita 1× só` — 5 débitos
  de 3 em `Promise.all` sobre saldo 100 com a MESMA usageKey; todos retornam `debited:3` e o saldo
  final é **97** (não 85). Também um 2º caso: mesma usageKey cruzando 2 lotes, 2 chamadas paralelas
  → total debitado 1× (saldo 4→1, não 4→-2).
- **Prova de poder de detecção** (feita fora da suíte, com um fake idêntico mas com a trava unique
  DESLIGADA): sem o `@@unique`+P2002, as 5 chamadas duplicam e o saldo cai pra **85** — confirmando
  que a asserção `saldo == 97` de fato depende da trava, não passa por acaso.

### Fake de Prisma atualizado (senão o teste não provaria nada)
O fake in-memory dos testes agora honra as 3 propriedades que importam pro dinheiro: (1) `create`
lança P2002 no par (usageKey, parentEntryId) quando usageKey é não-null e já existe; (2)
`$transaction` interativo com ROLLBACK real (journal de undo aplicado em ordem reversa no erro);
(3) transações SERIALIZADAS por um mutex (fila) — sem isso o event loop intercalaria dois
`updateMany` antes de qualquer `create` e a corrida não seria representativa do lock de linha do
Postgres. Também ganhou `update` (usado no `refund`).

### Confirmações explícitas pedidas pelo Opus
- ✅ O teste concorrência-mesma-usageKey PROVA o não-duplo-débito (saldo cai 1×; provado que
  falharia sem a trava — cairia pra 85).
- ✅ Os pares decremento+trilha agora são transacionais (Fix A) nos 3 métodos (`debit`, `refund`,
  `expireLots`).

### Nit registrado (pergunta pro dono, NÃO bloqueio)
O lote de reposição criado no refund-de-lote-expirado nasce `expiresAt:null` (crédito PERPÉTUO).
Isso preserva o crédito do cliente (não perde por timing), mas cria um lote que nunca expira a
partir de um refund — potencialmente um passivo perpétuo no balanço (contra D6, que recomenda
expiração configurável). **Pergunta pro dono**: refund de lote já expirado deveria (a) nascer sem
expiração como está, (b) herdar uma nova janela curta (ex.: +30d), ou (c) simplesmente NÃO devolver
(o crédito expirou, azar)? Deixado como está no S1; decisão fica pro dono antes do S2/enforcement.

---

## Arquivos criados

- `backend/prisma/migrations/20260704_credits_wallet_ledger/migration.sql` — migration aditiva
  (só `CREATE TABLE`/`CREATE INDEX`/1 `ALTER TABLE ... ADD CONSTRAINT` de FK; nenhum DROP/ALTER
  em tabela existente).
- `backend/src/credits/credit-wallet.service.ts` — `CreditWalletService` (todo o motor de saldo).
- `backend/src/credits/credits.module.ts` — `CreditsModule` (sem controller; só provider exportado).
- `backend/src/credits/credit-wallet.service.test.ts` — 13 testes (`node:test`), fake de Prisma
  em memória com o mesmo padrão dos testes existentes (`radar-mission-queue.service.test.ts`),
  agora com `$transaction` interativo + rollback + `@@unique` honrado (ver Fix A/B acima).
- `docs/PLANEJAMENTOS/CREDITOS/S1-SPEC.md` — copiado do repo principal pro worktree (a spec já
  existia lá; o worktree tinha só o `PLANO.md`, faltava propagar este arquivo).

## Arquivos alterados

- `backend/prisma/schema.prisma` — 2 modelos novos (`CreditWallet`, `CreditLedgerEntry`) no final
  do arquivo + 1 linha de relação inversa mínima em `Company` (`creditWallet CreditWallet?`).
  Nenhuma coluna/índice/tabela existente tocada.
- `backend/src/app.module.ts` — import + registro de `CreditsModule` no array `imports` (2 linhas).
- `.env.production.example` — documentada `HBX_CREDITS_ENABLED=false` (default OFF) com comentário
  explicando que o módulo nasce inerte.

## Checks (todos verdes)

```
cd backend && npm run prisma:validate   → "The schema at prisma\schema.prisma is valid"
cd backend && npm run build             → tsc -p tsconfig.json, sem erros
node --test dist/credits/credit-wallet.service.test.js
  → tests 13, pass 13, fail 0   (11 originais + 2 novos de concorrência-mesma-usageKey)
```

Nota de ambiente: o worktree tinha `node_modules` vazio (git worktree isolado não traz
`node_modules`) e o Prisma CLI global instalado é v7 (o projeto pin `prisma@5.22.0`). Rodei
`npm ci` no `backend/` para instalar as deps locais do projeto — depois disso `prisma:validate`/
`prisma:generate`/`build` resolveram para a v5.22.0 correta. Isso não é uma mudança de escopo,
só setup de ambiente necessário para rodar os checks pedidos. `DATABASE_URL`/`DIRECT_URL` foram
passadas como valores dummy (`postgresql://user:pass@localhost:5432/db`) só para o Prisma CLI
conseguir validar a sintaxe do schema — nenhuma conexão real foi aberta, nenhuma migration rodou
contra banco nenhum (nem local nem remoto).

## Os 6 testes obrigatórios do spec (+ 5 extras de cobertura)

1. **Concorrência** — `10 débitos de 1 em paralelo sobre saldo 5 -> exatamente 5 sucessos, saldo
   final 0, nunca negativo`. ✅
2. **FIFO/expiração** — `consome o lote que expira antes primeiro; lote expirado não entra no
   saldo` + `nulls (nunca expira) são consumidos por último`. ✅
3. **Idempotência** — `debit: mesma usageKey 2x -> 1 débito só` + `grant: mesma usageKey 2x -> 1
   lote só` + (Fix B) `5 chamadas PARALELAS com a MESMA usageKey -> debita 1× só` + `mesma usageKey
   cruzando 2 lotes, 2 chamadas paralelas -> total debitado 1×`. ✅
4. **Overdraft/parcial (D7)** — `pedir 50 com 30 de saldo -> debita 30, partial true, saldo 0`. ✅
5. **Refund** — `débito depois refund devolve o saldo; refund 2x é idempotente` + `lote original
   já expirado vira lote novo sem expiração (não perde o crédito)`. ✅
6. **expireLots** — `marca vencidos, retorna contagem, saldo cai` (roda 2x, 2ª vez não duplica
   breakage). ✅

Extras: `ensureWallet` idempotente (cria só 1x por companyId, corrida cai no P2002 e relê);
`getBalance` de empresa sem wallet retorna 0 sem criar nada (não força `ensureWallet` — só
`getWalletSnapshot`, usado pelo painel, cria).

## Decisões de design (pontos que merecem revisão do Opus)

### 1. Idempotência de `usageKey` — RESOLVIDA no Fix B (unique composto `[usageKey, parentEntryId]`)
Histórico: a 1ª entrega usava `@@index([usageKey])` não-único + checagem em código (a spec dizia
"`@@unique` quando presente", mas também que um débito cruzando 2 lotes gera 2 linhas com a mesma
usageKey — um unique cru na coluna quebraria isso). A revisão do Opus (Fix B) fechou isso com um
unique COMPOSTO nativo do Prisma: **`@@unique([usageKey, parentEntryId])`**. Como lotes têm
`parentEntryId=null` (NULLs não colidem em unique no Postgres) e linhas `debit` sempre têm o lote
em `parentEntryId`, o par (usageKey, lote) fica único no banco — sem precisar de partial index cru,
sem quebrar débitos multi-lote. A checagem em código virou só um atalho de saída-cedo; a trava de
verdade agora é o banco + o tratamento de P2002 dentro da transação. Ver seção "Fix B" no topo.

### 2. Refund de lote expirado vira **lote novo `kind: 'grant'`**, não `kind: 'adjust'`
A spec sugere (no bloco "Serviço") "refund... (senão `adjust` num lote novo curto — ou documentar
a escolha)". Tentei `kind: 'adjust'` primeiro e um teste pegou o bug na hora: a spec também define
(no bloco "Schema") que `adjust` é um **movimento** (remaining=0), não um lote — e `getBalance`/
FIFO só somam `remaining` de linhas `kind IN (grant, recharge, promo)`. Um "adjust com
remaining>0" simplesmente não apareceria no saldo, quebrando o próprio objetivo do refund
(devolver o crédito). Decisão final: o lote de reposição nasce com `kind: 'grant'`,
`expiresAt: null`, `grantType` herdado do lote original quando disponível, e `sourceRef:
"refund-expired-lot:<id-do-debito>"` para rastreio auditável de que não é uma concessão nova do
master. Uma linha `kind: 'refund'` (movimento, remaining=0) é SEMPRE gravada por cima, com
`metadataJson.originalUsageKey`, documentando a reversão em si.

### 3. Decisão de "lote ainda vivo" no refund é feita **atomicamente pelo banco**, não por data
Primeira versão comparava `parentLot.expiresAt > now` ANTES de tentar o `updateMany` — isso
quebrou um teste porque o `now` usado dentro do método (`new Date()`, tempo real de execução)
divergia do `now` fictício passado para `expireLots` no teste (datas de 2026 simuladas). Corrigido:
`refund` agora aceita um 3º parâmetro opcional `now: Date = new Date()` (mesmo padrão de
`getBalance`/`expireLots`), e a decisão "restaura no lote original vs. cria lote novo" é feita
tentando o `updateMany` condicional primeiro — qualquer motivo de falha (expirado segundo aquele
`now`, lote sumiu, ou perdeu a corrida de concorrência) cai no MESMO fallback de lote novo, sem
pré-julgar por um cálculo de data separado do que o banco vai de fato aplicar.

### 4. `expireLots` varre TODAS as wallets (sem filtro por `companyId`)
A spec não especifica se o job roda por empresa ou globalmente; como é descrito como "job" (não
recebe `companyId` na assinatura do spec), implementei como varredura global — roda 1x e expira
lotes de todas as empresas. Se o volume de lotes crescer muito, isso pode precisar de paginação/
cursor no S2+, mas para o S1 (carteira inerte, sem tráfego real ainda) uma varredura simples
é suficiente e mais fácil de auditar.

### 5. `grant`/`debit` idempotência por `usageKey` cobre reconstrução de estado, não lock de linha
Segui o MESMO padrão de concorrência do `hbx-recovery.service.ts` (`applyPayment`/
`reversePayment`): optimistic lock via `updateMany({ where: { id, remaining: <valor lido> } })`
+ loop de retry com teto (`MAX_CONCURRENCY_RETRIES = 8`, análogo ao teto de 5 tentativas do
hbx-recovery). Nenhum `SELECT ... FOR UPDATE` novo foi introduzido — o statement condicional
único no banco é o que garante atomicidade; o loop só cobre a corrida entre leitura e escrita.
Sob contenção patológica acima do teto, `debit` simplesmente para de progredir e retorna o que
conseguiu debitar até ali como `partial: true` (nunca lança exceção, nunca deixa saldo negativo).

## O que NÃO foi feito (fora de escopo, por design)

- Nenhum controller/endpoint HTTP para `credits` (S1 é só schema + service; painel é S6).
- Nenhuma chamada ao `CreditWalletService` a partir de `vendas.service.ts`,
  `commercial-usage-limits.service.ts` ou qualquer fluxo de venda real (isso é S2 — tabela de
  peso por ação + pontos de débito em modo SHADOW).
- Nenhum checkout/webhook MP (`S3`).
- Migration NÃO foi aplicada contra nenhum banco (nem local nem VPS) — só escrita e validada
  sintaticamente via `prisma validate`.

## Resumo do diff pro Opus revisar a lógica atômica

- `backend/prisma/schema.prisma`: 2 modelos + 1 relação inversa em `Company` + `@@unique([usageKey,
  parentEntryId])` no `CreditLedgerEntry` (Fix B).
- `backend/src/app.module.ts`: +2 linhas (import + registro no array `imports`).
- `.env.production.example`: +5 linhas (flag documentada, default `false`).
- Novo: `backend/src/credits/credit-wallet.service.ts` (~525 linhas) — `ensureWallet`,
  `getBalance`, `getWalletSnapshot`, `grant`, `debit`, `refund`, `expireLots`. Os 3 métodos que
  mexem em saldo (`debit`/`refund`/`expireLots`) usam `$transaction` interativo (Fix A) + tratam
  P2002 do `@@unique` como já-processado (Fix B).
- Novo: `backend/src/credits/credits.module.ts` (~13 linhas).
- Novo: `backend/src/credits/credit-wallet.service.test.ts` (~423 linhas, 13 testes; fake com
  `$transaction`+rollback+`@@unique`+mutex).
- Novo: `backend/prisma/migrations/20260704_credits_wallet_ledger/migration.sql` (~47 linhas,
  aditivo puro; inclui o `CREATE UNIQUE INDEX ...usageKey_parentEntryId_key`).

Pontos que mais merecem o olhar do Opus (dinheiro): a lógica atômica dos Fix A/B (transação
interativa + rollback no P2002) — documentada na seção do topo, com a prova empírica de que o
teste de concorrência falha (saldo 85) sem a trava e passa (saldo 97) com ela. Decisão #2 (refund
de expirado vira lote `grant`, não `adjust`) segue valendo; e o nit do `expiresAt:null` no refund
de expirado ficou como pergunta pro dono (seção do topo).
