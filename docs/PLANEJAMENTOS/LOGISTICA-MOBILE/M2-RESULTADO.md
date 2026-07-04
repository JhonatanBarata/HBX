# M2 — Amarração produto×cliente + recorrência (RESULTADO)

Branch: `master` (direto, sem branch nova). **NÃO publicado. Migrations NÃO aplicadas.**
Base: `45ce0eb0` (M1 já no master).

## Schema novo (aditivo — `backend/prisma/schema.prisma`)
- **`ClienteProduto`** — vínculo produto×cliente + recorrência: `companyId`, `customerProfileId`,
  `productId`, `qtdPadrao Int @default(1)`, `precoAcordado Float?`, `frequenciaDias Int?`,
  `diasSemana String?` ("1,3,5"=seg/qua/sex), `proximaData DateTime?`, `ativo Boolean @default(true)`,
  timestamps. `@@unique([companyId, customerProfileId, productId])` + 3 índices. FKs company/conta/produto
  = CASCADE.
- **`EntregaItem`** — item da entrega (multi-produto): `entregaId`(Cascade), `productId?`(SetNull),
  `qtdPrevista Int @default(1)`, `qtdEntregue Int?`, `valorUnit Float @default(0)`. Back-rel `itens` em Entrega.
- **`LogisticaConfig`** — 1/empresa (`@@unique([companyId])`): `avisoWhatsEnabled` (true), `templateAviso?`,
  `raioChegadaM` (60), `velocidadeMediaKmH` (25), `tempoParadaMin` (5), `cobrancaNaEntrega` (false),
  `moduloFinanceiroAtivo` (false), `moduloRecoveryAtivo` (false), `gerarDiaAutomatico` (false), timestamps.
- **`Entrega`** ganhou (todas nullable/aditivas): `rotaOrdem Int?`, `etaAt DateTime?`, `whatsappStatus String?`,
  `cobrancaOutcome String?`, `recebidoNaHora Boolean?`, `receiptMethod String?`, `idempotencyKey String? @unique`
  + `itens EntregaItem[]` + índice `[companyId, customerProfileId, scheduledAt]`.
- Back-rels adicionadas em `Company` (clienteProdutos/logisticaConfig), `CustomerProfile` (clienteProdutos),
  `Product` (clienteProdutos/entregaItens).

## Migração (à mão)
`backend/prisma/migrations/20260705030000_logistica_recorrencia/migration.sql` — 100% aditiva, `IF NOT EXISTS`,
sem DROP. Adiciona as 7 colunas da Entrega (+ índice único parcial de `idempotencyKey` WHERE NOT NULL),
cria as 3 tabelas com PK/índices/FKs. Não aplicar em banco vivo (passo do dono). `prisma validate` + `generate` verdes.

## Backend
- Serviço novo `backend/src/logistica/logistica-recorrencia.service.ts` (N6 `logistica.service.ts` intocado):
  - CRUD `ClienteProduto` company-scoped (list por cliente, create, update, toggleAtivo) — valida cliente E
    produto da MESMA empresa; `@@unique` → 400 amigável se já vinculado.
  - `listProdutos` — catálogo do tenant p/ o seletor da UI (prioriza `usaLogistica`).
  - **`gerarDia(companyId, date?)`** — varre `ClienteProduto` ativos vencidos (`proximaData <= dia` OU dia bate no
    `diasSemana`), cria `Entrega` + `EntregaItem`, avança `proximaData` (+`frequenciaDias` ou próximo `diasSemana`).
  - **Cron** atrás de `LogisticaConfig.gerarDiaAutomatico` (default OFF): `setInterval` 24h + 1 passada 30s após boot
    (padrão do repo, sem `@nestjs/schedule`). INERTE — só toca empresas opt-in; sem nenhuma, no-op total. NÃO roda EM boot.
- Endpoints em `logistica.controller.ts` (JwtAuthGuard, companyId do JWT):
  `GET /logistica/produtos`, `GET/POST /logistica/cliente-produtos`, `PATCH /logistica/cliente-produtos/:id`,
  `POST /logistica/gerar-dia`. DTOs novos com class-validator. Service registrado no `logistica.module.ts`.

### Idempotência (o coração do M2)
Guardada por **[companyId, customerProfileId, dia]**: antes de criar, `gerarDia` faz `entrega.findFirst` na faixa
do dia daquele cliente; se já existe QUALQUER entrega dele no dia (recorrência anterior OU agendada à mão), **pula**
(conta `puladas`) e ainda assim avança `proximaData` (não deixa o vínculo preso no passado). Rodar 2× no mesmo dia
= 1 entrega por cliente. **Provado por teste** (`node --test`, ver abaixo).

### Backward-compat (N6 intacto)
Ao criar a Entrega, além dos `EntregaItem`, gravamos `Entrega.quantidade`/`valor` coerentes (qtd × valorUnit) —
o N6 (`confirmarEntrega`/cobrança) segue usando os escalares sem alteração. Testes N6 (2) seguem verdes.

## Bug de fuso corrigido (achado no teste)
`?date=YYYY-MM-DD` era parseado como UTC-midnight → em Brasília (-3) escorregava pro dia anterior e a rota/geração
saía do dia errado. `parseDateOrNull` agora lê `YYYY-MM-DD` puro como **midnight LOCAL** (datas com hora/offset
seguem o parse padrão). Afeta o dia certo do gerador.

## Frontend (mínimo)
- **`frontend/src/app/(app)/contatos/page.client.tsx`** — na view "Clientes", cada linha ganhou botão **Produtos**
  que abre o drawer `ClienteProdutosDrawer`: lista vínculos (qtd× produto, recorrência, preço), toggle ativar/desativar,
  e form de adicionar (seletor de produto do catálogo só com os não-vinculados, qtd padrão, preço acordado, frequência
  sem/7/15/30 dias).
- **`frontend/src/app/(app)/logistica/page.client.tsx`** — botão admin **"Gerar entregas de hoje"** (`POST /logistica/gerar-dia`,
  só `isTenantAdmin`), com feedback e reload da rota. Idempotente no backend, clicar 2× não duplica.
- CSS central novo em `frontend/src/app/hbx-theme/screens.css` (bloco `.cli-prod*`/`.ctt-prod-btn`, tudo em token;
  zero hex/inline nos meus arquivos). check-pele: 0 violação nova (as 13 restantes são pré-existentes de
  bot-builder/whatsapp/screens 1555-1572, no HEAD antes de mim).

## Checks
- `backend npm run build` ✅ · `npx prisma validate` ✅ · `npx prisma generate` ✅
- `backend node --test` (logistica-recorrencia + logistica N6) → **12/12 pass, 0 fail** ✅
  (idempotência 2× = 1 entrega provada; frequência 7d avança +7 provada; lógica pura dueOnDay/nextProximaData/valor).
- `frontend tsc --noEmit` ✅ · `frontend npm run build` ✅ · `check-pele` — 0 violação nos meus arquivos ✅

## Decisões p/ o dono
1. **Cron gerar-dia**: `setInterval` 24h (repo não tem `@nestjs/schedule`). É INERTE por default; só liga por empresa
   via `LogisticaConfig.gerarDiaAutomatico=true`. O botão manual do admin é o caminho primário na V1.
2. **Frequência na UI**: expus 3 presets (7/15/30 dias) + "sem recorrência". `diasSemana` ("1,3,5") existe no schema/API
   e no gerador, mas ainda NÃO tem editor visual (fica p/ M5 "regras do admin"). Se quiser dias-da-semana na UI já, aviso.
3. **Preço**: `valorUnit` resolve acordado > catálogo do produto > `precoPadrao` do cliente > 0.
4. **"Ficha do cliente"**: não há tela de ficha dedicada reutilizável — o drawer na aba **Clientes** (Contatos) foi o
   ponto de entrada, conforme o plano permitia ("um painel simples na aba Contatos/Clientes serve").
