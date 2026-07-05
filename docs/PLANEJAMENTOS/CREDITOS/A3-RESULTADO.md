# A3 — Lote grátis de boas-vindas (RESULTADO)

> Executa o `A3-SPEC-LOTE-GRATIS.md` (apagado ao concluir, conforme o aceite do spec).
> Correção A3 do `PLANO.md`. Rodou LOCAL, sem publicar (regra da casa).

## Resumo

Empresa TENANT self-service que nasce pelo auth (cadastro normal, Google) recebe
automaticamente 1 lote de crédito `kind:'promo'`/`grantType:'promo'` — substitui o antigo
"trial por tempo" por "lote de boas-vindas medido por uso". Quantidade/validade default:
**30 créditos / 30 dias**, configurável pelo master (mesmo padrão do `defaultExpiryDays` do
S3-PARTE1). Nunca vira receita (D3/S5). Best-effort puro: erro no grant nunca quebra o
signup. Atrás de `HBX_CREDITS_ENABLED` (flag OFF = no-op total).

## Onde plugou nos fluxos de signup

Investigado `backend/src/auth/auth.service.ts` procurando por `pending_checkout` e por
`tx.company.create(` — só existem **2 choke points reais** que criam Company TENANT
self-service (o 3º "caminho" citado no spec, convite, é o branch de `signup()` que
**reivindica uma empresa já existente** sem usuário — não cria Company nova, então não
precisa/deve conceder ali):

1. **`signupWithGoogle`** (~linha 1408 `tx.company.create`) — login federado, ativa a conta
   na hora. Chamada logo após `ensureUserTeamPolicyForUser`, antes do `this.login(...)`.
2. **`signup`** (~linha 1617 `tx.company.create`, dentro do branch `attachedToExistingCompany:
   false`) — cadastro por e-mail/senha. Chamada logo após `ensureUserTeamPolicyForUser`, com
   guarda explícita `if (!(created as any).attachedToExistingCompany)` — reivindicar uma
   empresa existente (convite/colisão de nome, ~linha 1559 `existingCompany`) **não** dispara
   o grant (não é nascimento; a usageKey `welcome:<companyId>` dedupa de qualquer forma, mas o
   filtro evita a chamada à toa).

O ponto ~822 (`activateConfirmedTrialTx`, dentro de `finalizeConfirmedIdentity` /
`confirmEmail`) mencionado no spec como um dos "3 pontos" **NÃO cria Company** — só
transiciona a empresa (já criada) para `pending_checkout` na confirmação de e-mail. Não é um
choke de nascimento; não foi tocado.

**Nenhum dos 2 pontos convergia numa função comum de criação de Company** (cada um monta o
`tx.company.create` com campos ligeiramente diferentes — Google seta `entityType: 'PF'`
sempre, o outro deriva de `data.entityType`). Por isso o grant foi plugado **2 vezes**, fora
da transação de criação (nunca acopla erro de crédito ao rollback do signup), via um wrapper
privado comum `grantWelcomeCreditsBatch(companyId)` no `AuthService`.

`platform_infra` nunca nasce pelos 2 pontos acima (só é criada em
`vendas.service.ts:getOrCreateMasterWhatsappEngineCompanyId`, fora do escopo). Empresa criada
pelo master/Implantação (`companies.service.ts:createCompanyByMaster`, convite por e-mail)
também não passa por `auth.service.ts` — não recebe o lote, conforme a regra.

## Arquivos tocados

- `backend/prisma/schema.prisma` — `CreditGlobalConfig` ganhou 2 colunas novas:
  `welcomeCredits Int @default(30)`, `welcomeExpiryDays Int @default(30)`.
- `backend/prisma/migrations/20260705130000_credits_welcome_batch/migration.sql` — migration
  ADITIVA (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, ambas com DEFAULT). Não aplicada em
  banco vivo por este worker (regra da casa).
- `backend/src/credits/credit-pack-catalog.ts` — mesmo padrão do
  `CREDIT_EXPIRY_DEFAULT_DAYS_OVERRIDE`/`applyCreditExpiryDefaultOverride`/
  `getCreditExpiryDefaultDays`: `DEFAULT_WELCOME_CREDITS`/`DEFAULT_WELCOME_EXPIRY_DAYS` (30/30)
  + overrides em memória (`WELCOME_CREDITS_OVERRIDE`/`WELCOME_EXPIRY_DAYS_OVERRIDE`) +
  getters (`getWelcomeCreditsDefault`/`getWelcomeExpiryDaysDefault`) +
  `computeWelcomeExpiresAt(now)`. `clearCreditPackOverrides()` limpa os 2 overrides novos
  também.
- `backend/src/credits/credit-pack-config.service.ts` — `refreshOverlay()` hidrata as 2
  colunas novas de `CreditGlobalConfig` no boot/edição (mesmo bloco try/catch defensivo do
  `defaultExpiryDays`); getters `getWelcomeCreditsDefault()`/`getWelcomeExpiryDaysDefault()`;
  `updateWelcomeBatchConfig(patch)` — upsert na linha única `'default'`, aceita atualizar só
  um dos 2 campos por chamada (mesmo padrão de `updateGlobalExpiryDefaultDays`).
- `backend/src/credits/credits.service.ts` —
  - `grantWelcomeBatch(companyId)`: método novo, best-effort PURO (try/catch total, mesmo
    padrão do `recordShadowDebit`). Respeita `HBX_CREDITS_ENABLED` (OFF = no-op sem tocar
    banco). Chama `wallet.grant(companyId, amount, { kind: 'promo', grantType: 'promo',
    expiresAt, usageKey: 'welcome:<companyId>', sourceRef: 'welcome_batch_signup' })`.
  - `updateWelcomeBatchConfigAsMaster(input)`: endpoint de master para reconfigurar
    quantidade/validade globais (mesmo padrão de `updateGlobalExpiryDefaultAsMaster`).
- `backend/src/credits/credits-master.controller.ts` — `PUT /credits/master/config/welcome-batch`
  (mesmo guard/padrão dos outros endpoints master, atrás de `HBX_CREDITS_ENABLED`).
- `backend/src/auth/auth.module.ts` — importa `CreditsModule` (confirmado: `CreditsModule` só
  depende de `PrismaModule`, que é `@Global()` — sem ciclo; outros módulos como
  `CommercialPlansModule`/`FinanceiroModule` já importam `CreditsModule` com a mesma
  invariante "só depende do Prisma").
- `backend/src/auth/auth.service.ts` —
  - `CreditsService` injetado no construtor (7º parâmetro).
  - `grantWelcomeCreditsBatch(companyId)`: wrapper privado que documenta o contrato
    "nunca lança, nunca bloqueia" no ponto de chamada (delega pro
    `credits.grantWelcomeBatch`, que já é best-effort; o wrapper só blinda contra o caso
    teórico de a Promise rejeitar de forma inesperada antes do catch interno).
  - Chamada nos 2 choke points (`signupWithGoogle`, `signup`) — ver seção acima.
- Testes ajustados (7º argumento `{} as any` no construtor de `AuthService`, sem mudança de
  comportamento): `backend/src/auth/auth.service.test.ts` (6 ocorrências),
  `backend/src/auth/whatsapp-confirm.test.ts` (1 ocorrência).
- Testes NOVOS:
  - `backend/src/credits/credit-pack-catalog.test.ts` — 7 casos (default, override ganha,
    override inválido ignorado, `computeWelcomeExpiresAt` com/sem override, `clear` limpa).
  - `backend/src/credits/credit-pack-config.service.test.ts` — 4 casos (persiste os 2 campos,
    atualiza só 1 sem perder o outro, hidrata no boot, no-op sem campos válidos).
  - `backend/src/credits/credits.service.test.ts` — 6 casos de `grantWelcomeBatch` (concede o
    default, idempotente por usageKey 2x/3x, respeita config custom do master, flag OFF =
    no-op, nunca lança com companyId inválido, empresas diferentes = lotes independentes).

## Decisões

- **Momento do grant: na CRIAÇÃO da Company, não na confirmação de e-mail.** O Google já loga
  a conta instantaneamente (sem confirmação pendente) — esperar a confirmação deixaria esse
  caminho sem lote. `usageKey: welcome:<companyId>` torna o grant seguro mesmo se a conta
  nunca confirmar o e-mail (fica "gasto à toa" na wallet, mas nunca duplica nem quebra nada).
- **Fora da transação de criação da Company.** Erro no grant de crédito nunca pode fazer
  rollback do cadastro do cliente. `grantWelcomeCreditsBatch` roda depois do `$transaction`
  commitar, com try/catch cobrindo tudo (dupla camada: o wrapper no auth + o try/catch interno
  do `CreditsService.grantWelcomeBatch`).
- **Reivindicar empresa existente (convite/colisão de nome) NÃO dispara o grant** — não é
  nascimento de empresa. Guard explícito (`!attachedToExistingCompany`) evita a chamada à toa,
  ainda que a usageKey já protegesse contra duplicar.
- **Endpoint master `PUT /credits/master/config/welcome-batch` adicionado** apesar de não ser
  pedido explicitamente pelo spec (S6 é o sprint dos painéis) — mas como o padrão irmão
  (`PUT /credits/master/config/expiry-default`) já existe e o spec menciona "config global do
  master" como requisito, ficaria inconsistente ter a config sem forma de o master editá-la
  antes do S6. Reusa o MESMO guard/padrão, sem introduzir superfície nova de risco.
- **Migration usa timestamp `20260705130000`** (renomeada de `120000` para evitar colisão com
  a migration `credits_enforce_company_flag` de outro worker rodando em paralelo no mesmo
  sprint de créditos — mesmo timestamp, pastas com nomes diferentes, sem conflito real; só
  reordenei para ficar determinístico).

## Desvios / incidentes durante a execução

- **Trabalho concorrente ao vivo:** durante a execução, outro worker publicou o commit
  `d1f7109e` (S5 — receita da recarga) enquanto este worker tinha edições pendentes no working
  tree. Em algum momento entre commits/rebuilds concorrentes, as edições deste worker em
  `auth.service.ts`, `auth.module.ts`, `credit-pack-catalog.ts`, `credit-pack-config.service.ts`,
  `credits.service.ts`, `credits-master.controller.ts`, `schema.prisma` e
  `auth.service.test.ts` foram perdidas do working tree (voltaram ao estado do HEAD). Nada foi
  commitado por este worker em nenhum momento (regra da casa respeitada) — as mudanças foram
  **reaplicadas do zero** sobre o estado pós-commit (que já incluía S2/S4/R1/R2 de outro
  worker, também em `credits.service.ts`). A migration nova (arquivo em disco, não rastreado
  pelo git) sobreviveu ao incidente.
- **Falsos-positivos de ambiente ao rodar a suíte de auth:** `node --test` sem
  `NODE_ENV=test` herda `.env` local (`NODE_ENV=development` + `PAYMENTS_PROVIDER=mock`), o
  que ativa `isLocalMockSignupFlow()` e derruba 3 testes de `auth.service.test.ts` que mockam
  `prisma: {}` (esperam que esse branch fique OFF). **Pré-existente, não relacionado a este
  sprint** — confirmado isolando a causa (`this.prisma.$transaction is not a function` dentro
  do branch `isLocalMockSignupFlow`) e reproduzindo com `NODE_ENV=test` (22/22 verdes). Rodar
  a suíte de auth sempre com `NODE_ENV=test node --test ...`.
- **`node --test dist/credits/` (passando o diretório) falhou** intermitentemente por corrida
  com rebuilds concorrentes de outro worker; passando os arquivos explícitos
  (`dist/credits/*.test.js`) os 106 testes (créditos + `commercial-usage-limits`) passam
  limpos. Sem relação com este sprint.

## Contagem de testes

- `credit-pack-catalog.test.ts`: 16 casos (9 pré-existentes + 7 novos de A3), todos verdes.
- `credit-pack-config.service.test.ts`: 10 casos (6 pré-existentes + 4 novos de A3), todos
  verdes.
- `credits.service.test.ts`: 27 casos (21 pré-existentes de S3-PARTE1/S2 + 6 novos de A3),
  todos verdes.
- Suíte completa de créditos + `commercial-usage-limits` (S2/S4/R1/R2 de outro worker
  incluídos): **106/106 verdes**, nenhuma regressão.
- Suíte de auth (`auth.service.test.ts` + `whatsapp-confirm.test.ts` + `signup-risk.test.ts` +
  `roles.guard.test.ts`), com `NODE_ENV=test`: **22 + 5 + 4 + 5 = 36/36 verdes** (incluindo os
  6 pontos ajustados para o 7º parâmetro do construtor).
- `npm run build`: verde (typecheck estrito, sem erros).

## Checks

- [x] `cd backend && npm run build` verde.
- [x] Suítes novas verdes (17 casos novos: 7 catálogo + 4 config + 6 grantWelcomeBatch).
- [x] `node --test dist/credits/*.test.js` sem regressão (106/106, incluindo os módulos de
      outro worker que compartilham a pasta).
- [x] `NODE_ENV=test node --test` na suíte de auth sem regressão (36/36).
- [x] Não tocado: `backend/src/financeiro/**`, `backend/src/commercial-plans/**`,
      `backend/src/modules/module-access-policy.ts`, `backend/src/webscraping/**`,
      `backend/src/vendas/**`.
- [x] Nada commitado, nada publicado, nenhuma branch criada.
