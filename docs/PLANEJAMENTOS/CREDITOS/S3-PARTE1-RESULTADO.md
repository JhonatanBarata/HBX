# S3-PARTE1 — Catálogo de pacotes de crédito + endpoints master + /credits/me — RESULTADO

> Executado em worktree isolado (`.claude/worktrees/agent-afc3d316c7352d10f`), LOCAL. NÃO
> publicado, NÃO commitado na master, NÃO rodou migration contra banco nenhum. Escopo: catálogo
> de pacotes (base+overlay) + endpoints MASTER (editar pacotes, conceder crédito manual) +
> `GET /credits/me` role-gated. SEM MercadoPago, SEM checkout, SEM webhook, SEM débito nos
> fluxos de venda — isso é S2/S4/S5, fora de escopo aqui.

---

## ⭐ Rodada de hardening — Fix I + Fix II (revisão Opus, pós-1ª entrega)

O Opus revisou a 1ª entrega (catálogo base+overlay, grant, `/credits/me` role-gated e o bug do
truncamento de `amount` aprovados) e pediu 2 furos fechados antes de abençoar. O 3º ponto que eu
havia levantado (prazo global×pacote) foi confirmado como **corretamente adiado pro checkout** —
NÃO foi mexido. Estado atual: **50/50 testes verdes** (43 anteriores + 7 novos dos 2 fixes),
`prisma:validate` OK, `build` limpo, 13 testes do S1 intocados.

### Fix I — `/credits/me` respeita Dono×Gerente (LEI DO VENDEDOR completa)
Antes, `getMeForUser` usava `isBillingAudience = isSystemMaster || role==='ADMIN' ||
role==='USERMASTER'` — isso deixava um **GERENTE** (role `ADMIN` com `canViewBilling=false`) cair
na audiência de cobrança e ver saldo + preços em R$, violando o cânone existente (Gerente = ADMIN
que NÃO vê cobrança/plano; `sanitizeUser`/`resolveActorKind`/`User.canViewBilling`). Corrigido:
- `getMeForUser` agora usa a **fonte única** `isBillingOwnerActor(user)` de
  `access/actor-kind.ts` (audiência de cobrança = master OU dono; dono = ADMIN/USERMASTER com
  `canViewBilling !== false`). O gerente cai na MESMA visão neutra do vendedor
  (`getMeForSellerAudience`, só `leadsDisponiveis`, nunca R$/saldo/pacote/preço).
- O controller já passava `req.user` inteiro pro service, e `req.user` vem de
  `usersService.findById` (JWT strategy) SEM `select` restrito → `canViewBilling` (coluna do
  `User`, default `true`) chega cru no request. Nenhuma query extra necessária.
- Teste novo: ADMIN com `canViewBilling=false` NÃO recebe `balance`/`lots`/`packs`/`price`, só
  `leadsDisponiveis` (asserção explícita de chaves proibidas, idêntica à do vendedor).

### Fix II — concessão master exige chave de idempotência (dinheiro)
Antes, se o master não mandasse `usageKey` nem `sourceRef`, a `usageKey` virava `null` e o `grant`
do S1 criava um lote NOVO a cada chamada → double-click do master = crédito dobrado de graça.
Corrigido: `grantToCompanyAsMaster` agora **EXIGE** `usageKey` OU `sourceRef` (do qual deriva a
usageKey `master-grant:<sourceRef>`); vazio/só-espaços nos dois → `BadRequest("concessao exige
idempotencyKey (usageKey) ou sourceRef")`. Assim o painel (S6) é forçado a mandar um token estável
por intenção (UUID gerado na abertura do form) — dedupa o double-submit da MESMA intenção, mas
duas concessões legítimas usam tokens diferentes e criam lotes distintos.
- Testes novos: 2 grants com a MESMA `usageKey` → 1 lote só (saldo sobe 1×, `alreadyProcessed`);
  grant sem `usageKey`/`sourceRef` → `BadRequest` (e nada é concedido); só-espaços → `BadRequest`;
  2 tokens diferentes → 2 lotes distintos.

---

## PASSO 0 — merge do S1

`git merge credits/s1-ledger --no-edit` aplicado no início (merge automático, sem conflitos).
Confirmado: `backend/src/credits/credit-wallet.service.ts` com `grant`, `debit`, `refund`,
`expireLots`, `getWalletSnapshot`, `getBalance` presentes e os 13 testes do S1 continuam verdes
(rodados junto da suíte nova — ver seção Checks).

## Arquivos criados

- `backend/src/credits/credit-pack-catalog.ts` — catálogo de PACOTES de crédito. Espelha
  `commercial-plan-catalog.ts`: base em código (3 pacotes fixos `starter`/`growth`/`scale` com
  `credits`/`price` **PLACEHOLDER** — ver seção "Preços" abaixo — + `defaultExpiryDays`) + overlay
  editável (`applyCreditPackOverrides`/`getCreditPackDefinition`/`buildCreditPacksCatalog`),
  mesmo padrão `COMMERCIAL_CATALOG_OVERRIDES` (Map em memória, override GANHA campo a campo, sem
  override cai na base). Também traz a config global de expiração default do crédito
  (`applyCreditExpiryDefaultOverride`/`getCreditExpiryDefaultDays`/`computeDefaultExpiresAt`),
  espelhando `applyCommercialAnnualDiscountOverride`.
- `backend/src/credits/credit-pack-config.service.ts` — `CreditPackConfigService`
  (`OnModuleInit`): lê `CreditPackConfig`/`CreditGlobalConfig` do banco e empurra pro overlay em
  memória (`refreshOverlay`, chamado no boot e a cada `updatePack`/`updateGlobalExpiryDefaultDays`
  — mesmo contrato do `modules.service.refreshCommercialCatalogOverlay`). `updatePack` faz MERGE
  sobre o `configJson` existente (não apaga campos já salvos por uma edição anterior), mesmo
  padrão do `planInfoJson`/`setCompanyModuleByMaster`.
- `backend/src/credits/credits.service.ts` — `CreditsService`: orquestra `CreditWalletService`
  (S1) + `CreditPackConfigService` pros casos de uso do S3: `listPacksForMaster`,
  `updatePackAsMaster`, `updateGlobalExpiryDefaultAsMaster`, `grantToCompanyAsMaster` (concessão
  manual, idempotente), `getMeForUser` (role-gating do `/credits/me`).
- `backend/src/credits/credits.flags.ts` — `isCreditsFeatureEnabled()`, mesmo padrão booleano de
  `HBX_AI_EXTRACTION_ENABLED` (`['true','1','yes','on'].includes(...)`).
- `backend/src/credits/credits.controller.ts` — `GET /credits/me` (`JwtAuthGuard`). Flag OFF →
  404 antes de chamar o service (nada ativo).
- `backend/src/credits/credits-master.controller.ts` — `GET/PUT /credits/master/packs*`,
  `PUT /credits/master/config/expiry-default`, `POST /credits/master/company/:id/grant`. Guard
  `JwtAuthGuard, MasterGuard` — MESMO padrão de `master-provisioning.controller.ts`.
- `backend/prisma/migrations/20260704_credits_pack_catalog/migration.sql` — migration ADITIVA
  (só `CREATE TABLE` de `CreditPackConfig` e `CreditGlobalConfig`; nenhum DROP/ALTER em tabela
  existente).
- Testes novos (30 casos): `credit-pack-catalog.test.ts` (9), `credit-pack-config.service.test.ts`
  (6), `credits.service.test.ts` (15).

## Arquivos alterados

- `backend/prisma/schema.prisma` — 2 modelos novos no final do arquivo (`CreditPackConfig`,
  `CreditGlobalConfig`). Nenhuma coluna/índice/tabela existente tocada.
- `backend/src/credits/credits.module.ts` — registra os 2 controllers novos + os providers
  (`CreditPackConfigService`, `CreditsService`, `MasterGuard`) e os exporta. O módulo já estava
  importado no `AppModule` pelo merge do S1 (nenhuma mudança necessária lá).

## Desenho dos endpoints

### `GET /credits/master/packs` (MASTER)
Lista os 3 pacotes com overlay aplicado, **incluindo pausados** (o master precisa ver/reativar).

### `PUT /credits/master/packs/:packKey` (MASTER)
Body: `{ title?, observation?, status?, credits?, price?, defaultExpiryDays? }`. Persiste em
`CreditPackConfig.configJson` (merge) e refresca o overlay na hora — reflete imediatamente em
qualquer leitura seguinte (mesmo padrão "escada front↔backend" do catálogo comercial).
`packKey` só aceita as 3 chaves fixas do catálogo em código (S3-PARTE1 não cria pacote novo).

### `PUT /credits/master/config/expiry-default` (MASTER)
Body: `{ defaultExpiryDays }`. Config GLOBAL (linha única `CreditGlobalConfig.key='default'`) que
alimenta o `expiresAt` das concessões manuais quando o master não especifica uma data — e serve
de base pro prazo por-pacote também (cada pacote pode ter seu próprio `defaultExpiryDays` via
overlay; a config global é o "não escolhi nada" de última instância, D6 do S1).

### `POST /credits/master/company/:id/grant` (MASTER) — "master libera créditos ao admin"
Body: `{ amount, grantType: 'paid'|'courtesy_internal'|'promo', expiresAt?, sourceRef?, usageKey?,
metadata? }`. Chama `CreditWalletService.grant` (S1) com:
- `createdByUserId` = o master autenticado (trilha de auditoria já existente no ledger do S1).
- **Idempotência OBRIGATÓRIA (Fix II)**: `usageKey` OU `sourceRef` é EXIGIDO — vazio nos dois →
  `BadRequest`. Se `usageKey` não vier explícita, é derivada do `sourceRef`
  (`master-grant:<sourceRef>`). Chamadas repetidas com a MESMA chave (double-click, retry de
  rede) NÃO duplicam a concessão (o `grant` do S1 é idempotente por `usageKey`).
- `expiresAt`: se omitido, usa `computeDefaultExpiresAt()` (o default global, editável acima).

### `GET /credits/me` (qualquer usuário autenticado)
Role-gated **na própria rota** pela fonte única `isBillingOwnerActor` (Fix I), idêntica à régua
`billingAudience`/`sanitizeUser`:
- **Audiência de cobrança** = master OU DONO (ADMIN/USERMASTER com `canViewBilling !== false`) →
  `{ enabled, balance, lots[], packs[] }` — saldo completo, lotes com validade, pacotes
  disponíveis pra comprar (com preço).
- **Audiência NEUTRA** = VENDEDOR (role USER) E GERENTE (ADMIN com `canViewBilling=false`) →
  `{ enabled, leadsDisponiveis }` — **SÓ isso**. Testado explicitamente que nenhuma das chaves
  `balance`/`lots`/`packs`/`price`/`preco`/`saldo` aparece na resposta do vendedor NEM do gerente
  (2 testes "LEI DO VENDEDOR" em `credits.service.test.ts`).
- Flag `HBX_CREDITS_ENABLED` OFF → `enabled: false` (vendedor) ou
  `{ enabled:false, balance:0, lots:[], packs:[] }` (billing audience) — nunca 500, nunca vaza
  contagem real com a flag desligada.

## Flag `HBX_CREDITS_ENABLED` (default OFF)

Documentada desde o S1 em `.env.production.example` (`HBX_CREDITS_ENABLED=false`), reaproveitada
sem alteração. Com a flag OFF:
- `GET /credits/me` → `404 Not Found` (controller barra ANTES de chamar o service).
- Todos os 4 endpoints `/credits/master/*` → `404 Not Found` (mesmo padrão).
- `CreditsService` também recusa internamente (`NotFoundException`) em qualquer método de
  escrita/leitura chamado com a flag OFF — dupla trava (controller + service), então mesmo que
  um novo call site interno esqueça de checar a flag no controller, o service ainda barra.

## Preços — PLACEHOLDER, não cravado (decisão do dono 04/07)

Os 3 pacotes nascem com `price`/`credits` de exemplo (`starter` 100 créditos/R$97,
`growth` 300/R$247, `scale` 800/R$597) **só pra o catálogo ter uma forma coerente antes do
master editar**. Isso segue a régua explícita do prompt ("NÃO cravar preço final — os defaults
do catálogo são placeholders editáveis"). O dono edita os valores reais via
`PUT /credits/master/packs/:packKey` depois. Nenhum desses números aparece hardcoded em
frontend — a única fonte é este arquivo + o overlay persistido.

## Checks (todos verdes)

```
cd backend && npm ci                       → node_modules instalado no worktree isolado (era vazio)
cd backend && npm run prisma:validate      → "The schema at prisma\schema.prisma is valid"
                                             (com DATABASE_URL/DIRECT_URL dummy)
cd backend && npm run build                → tsc -p tsconfig.json, sem erros
node --test dist/credits/*.test.js
  → tests 50, pass 50, fail 0
    (13 testes do S1 — TODOS continuam verdes — + 37 testes do S3-PARTE1:
     30 da 1ª entrega + 7 novos dos Fix I/II da revisão Opus)
node --test dist/credits/credit-wallet.service.test.js   → tests 13, pass 13 (S1 intocado)
node --test dist/access/actor-kind.test.js               → tests 7, pass 7
    (fonte única isBillingOwnerActor que o Fix I reusa — verde, sem regressão)
node --test dist/modules/module-access-policy.test.js
  → tests 15, pass 15, fail 0  (confirma que presentModuleBlockForRole/LEI DO VENDEDOR
    não foi alterado nem quebrado por este sprint — só CONSULTADO como padrão)
```

Nenhuma migration foi aplicada contra banco nenhum (nem local nem VPS) — só escrita e validada
sintaticamente via `prisma validate`. `DATABASE_URL`/`DIRECT_URL` usados como valores dummy só
para o Prisma CLI validar a sintaxe (mesma nota de ambiente do S1).

### Bug pego pelo próprio teste (corrigido antes de fechar)
O teste `amount invalido (zero/negativo/nao-inteiro)` pegou uma falha real na validação de
`grantToCompanyAsMaster`: a implementação inicial fazia `Math.trunc(Number(amount))` **antes** de
checar `Number.isInteger`, então `amount: 1.5` virava `1` e passava — um master mandando um
valor fracionário por engano seria silenciosamente arredondado em vez de rejeitado. Corrigido:
agora valida `Number.isInteger` no valor CRU (antes de qualquer truncamento), rejeitando
`1.5` explicitamente.

## Testes obrigatórios do escopo — mapeamento

1. **Catálogo overlay** (`credit-pack-catalog.test.ts`, 9 casos) — base sozinha devolve os 3
   defaults de código; override aplicado GANHA por campo (preço/créditos/título/status); override
   PARCIAL só troca os campos presentes; pacote pausado some do catálogo público mas aparece pro
   master; `clearCreditPackOverrides` volta tudo à base; normalização de chave; expiração default
   global (override troca o prazo usado por `computeDefaultExpiresAt`); valores inválidos
   (NaN/negativo) são ignorados/clampados, não corrompem o catálogo.
2. **`CreditPackConfigService`** (`credit-pack-config.service.test.ts`, 6 casos) — persiste +
   refresca o overlay; merge sobre `configJson` existente (2 PUTs em campos diferentes convivem);
   pausa via master reflete nos dois catálogos (público vs. master); boot (`onModuleInit`)
   hidrata do que já estava persistido; `configJson` corrompido no banco não derruba o refresh
   (defensivo); config global de expiração persiste e vale no overlay.
3. **Concessão master** (`credits.service.test.ts`) — idempotência por `sourceRef` E por
   `usageKey` (2ª chamada com a MESMA chave não duplica o lote, `alreadyProcessed:true`, mesmo
   `entryId`, saldo sobe 1×); **(Fix II)** grant SEM `usageKey`/`sourceRef` → `BadRequest` e nada
   é concedido; só-espaços também → `BadRequest`; 2 tokens diferentes → 2 lotes distintos;
   `grantType` correto gravado; `grantType` inválido rejeitado (mesmo com usageKey válida);
   `amount` inválido (zero/negativo/fracionário) rejeitado (mesmo com usageKey válida); empresa
   inexistente rejeitada; `expiresAt` usa o default global (90d) quando omitido; `expiresAt`
   explícito respeitado; default reconfigurado pelo master (30d) passa a valer; flag OFF recusa.
4. **`/credits/me` role-gating** (`credits.service.test.ts`) — **asserção explícita** de que o
   VENDEDOR (role `USER`) E o **GERENTE (role `ADMIN` + `canViewBilling=false`, Fix I)** NUNCA
   recebem `balance`/`lots`/`packs`/`price`/`preco`/`saldo` (só `leadsDisponiveis`); DONO
   (ADMIN/USERMASTER com `canViewBilling !== false`) recebe saldo+lotes+pacotes com preço; ADMIN
   sem `canViewBilling` explícito segue como dono (default do campo é `true`); `isSystemMaster`
   é audiência de cobrança mesmo com `canViewBilling=false` (anti-spoof: a flag manda); flag OFF
   devolve `enabled:false` sem vazar contagem real; sem `companyId` recusa (evita 500 e
   vazamento cross-tenant).
5. **S1 (13 testes originais)** — todos continuam verdes, rodados na mesma suíte
   (`dist/credits/*.test.js`), sem nenhuma alteração no `credit-wallet.service.ts`.

## O que NÃO foi feito (fora de escopo, por design)

- Nenhum checkout MercadoPago, webhook de pagamento, ou qualquer chamada real de cobrança.
- Nenhum débito nos fluxos de venda reais (`vendas.service.ts`, `commercial-usage-limits`,
  `LeadContactWriteService` NÃO foram tocados) — isso é S2.
- Nenhuma distribuição admin→vendedor de crédito (S4).
- Nenhuma integração fiscal (S5).
- Nenhuma UI/tela de painel (S6) — só os endpoints que a tela vai consumir.
- Migration NÃO foi aplicada contra nenhum banco.

## Pontos de dúvida em dinheiro / decisões

### 1. [FECHADO — Fix II] Idempotência da concessão master agora é OBRIGATÓRIA
Antes ficava como pergunta ("e se o front mandar sourceRef novo a cada clique?"). O Opus pediu e
foi fechado: `grantToCompanyAsMaster` EXIGE `usageKey` OU `sourceRef` — sem chave estável →
`BadRequest`. O painel (S6) fica obrigado a gerar um token estável por INTENÇÃO de concessão
(UUID na abertura do form), o que dedupa o double-submit da mesma intenção. Nada de "grant sem
trava" sobrevive. Ver seção "Fix II" no topo.

### 2. [ABERTO — corretamente adiado pro checkout, confirmado pelo Opus] Prazo global × por-pacote
Cada pacote tem seu `defaultExpiryDays` (editável no `PUT .../packs/:packKey`) E existe a config
GLOBAL (`PUT .../config/expiry-default`), usada hoje só na **concessão manual** quando `expiresAt`
é omitido. Quando o checkout de PACOTE existir (S2/S3 seguinte), o prazo do lote comprado deve vir
de `getCreditPackDefinition(packKey).defaultExpiryDays`, não do global — os dois caminhos já
existem no `credit-pack-catalog.ts`, só não foram costurados porque o fluxo de compra está fora de
escopo aqui. **O Opus confirmou que isto está CERTO adiado pro checkout — não foi mexido.**

### 3. [FECHADO — Fix I] `/credits/me` respeita Dono×Gerente
Antes o gerente (ADMIN com `canViewBilling=false`) caía na audiência de cobrança e via saldo/preço.
Fechado: `getMeForUser` usa a fonte única `isBillingOwnerActor` — gerente cai na mesma visão
neutra do vendedor (só `leadsDisponiveis`). `canViewBilling` chega cru no `req.user` (findId do
JWT strategy, sem select restrito), então nenhuma query extra foi necessária. Ver seção "Fix I" no
topo. **Nenhuma dúvida residual aqui.**

## Resumo do diff pro Opus revisar

- `backend/prisma/schema.prisma`: +2 modelos (`CreditPackConfig`, `CreditGlobalConfig`), 0
  alterações em modelos existentes.
- `backend/prisma/migrations/20260704_credits_pack_catalog/migration.sql`: +23 linhas, aditivo
  puro (2 `CREATE TABLE`, nenhum índice extra, nenhuma FK — as 2 tabelas são standalone).
- Novo `backend/src/credits/credit-pack-catalog.ts` (~210 linhas) — estado em módulo (Map),
  mesmo padrão do catálogo comercial; nenhuma leitura de banco aqui (isso é do config service).
- Novo `backend/src/credits/credit-pack-config.service.ts` (~150 linhas) — único ponto que fala
  com `CreditPackConfig`/`CreditGlobalConfig` via Prisma.
- Novo `backend/src/credits/credits.service.ts` (~200 linhas) — orquestração + validação de
  entrada (grantType, amount, expiresAt, **idempotência obrigatória — Fix II**) + os 2 branches
  de `/credits/me` (**role-gating via `isBillingOwnerActor` — Fix I**). Import novo:
  `isBillingOwnerActor` de `access/actor-kind.ts` (fonte única, não reinventei a régua).
- Novo `backend/src/credits/credits.flags.ts` (5 linhas) — flag isolada, importável sem puxar
  o resto do módulo.
- Novo `backend/src/credits/credits.controller.ts` (~22 linhas) e
  `backend/src/credits/credits-master.controller.ts` (~55 linhas) — HTTP puro, toda a lógica
  fica no service. O controller passa `req.user` inteiro (com `canViewBilling` cru do JWT).
- `backend/src/credits/credits.module.ts`: +9 linhas (2 controllers, 2 providers novos).
- 3 arquivos de teste novos (~620 linhas no total, 37 casos: 30 da 1ª entrega + 7 dos Fix I/II)
  + os 13 testes do S1 continuam intocados e verdes.

Estado após a revisão do Opus: **os 2 fixes obrigatórios (I e II) estão fechados e testados**;
o único item ABERTO (prazo global×pacote) foi confirmado pelo Opus como corretamente adiado pro
checkout e NÃO foi tocado. Nenhum bug de integridade de ledger (a atomicidade é 100% do S1, não
mexida aqui) — os fixes foram de role-gating (Lei do Vendedor) e de contrato de idempotência.
