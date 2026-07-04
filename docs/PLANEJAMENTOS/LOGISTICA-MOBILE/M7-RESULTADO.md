# M7 — Recovery (opt-in) · RESULTADO

Cobrança VENCIDA da logística entra no funil de cobrança **hbx-recovery que já roda em prod**,
sem criar nenhum caminho de envio novo. Opt-in duro por tenant, idempotente, fail-closed.
**Backend-only** (badge "em cobrança" na ficha = frontend, ADIADO — o dado já fica disponível
via o `DebtCase`/`HbxRecoveryCustomer` que o front consome depois).

## Ponto de entrada do funil que reusei (arquivo:método)
**`backend/src/hbx-recovery/hbx-recovery.service.ts` → `HbxRecoveryService.createCustomer(user, dto)`** (linha ~3496).

Por que ESSE é o ponto de entrada: a cadência/bot/link-de-pagamento do Recovery operam sobre
`HbxRecoveryCustomer` (`openAmount>0` + `automationEnabled`), NÃO sobre `DebtCase` solto. E o
próprio `createCustomer`, dentro da sua transação, chama `syncRecoveryDebtCaseRecord` — ou seja,
cria o `HbxRecoveryCustomer` **E** sincroniza o `DebtCase` linkado ao `customerProfile` de uma vez.
É o único método público que materializa `{HbxRecoveryCustomer + DebtCase}` e liga a automação.
Eu **não reimplemento cadência nem envio** — só chamo `createCustomer`. Todo o freio de chip
(disjuntor, teto de tentativas, 1-número=1-conexão, outbox) continua vivendo lá dentro, intocado.

## O que foi criado (tudo backend)
- **`backend/src/logistica/logistica-recovery.service.ts`** (NOVO) — `LogisticaRecoveryService.varrer(companyId, date?)`:
  1. **Opt-in duro (fail-closed):** lê `LogisticaConfig.moduloRecoveryAtivo`; se `false` (default),
     early-return **antes** de qualquer leitura de charge ou chamada de funil (`{ ativo:false, injetados:0 }`).
  2. Busca `FinanceiroCharge` `status='pending'`, `dueDate < corte` (início de hoje/`date`),
     `sourceModule IN ('logistica_entrega','logistica_fechamento')`, `customerProfileId != null`.
  3. **Agrupa por cliente** (o funil é 1 caso por cliente — soma o aberto vencido).
  4. **Idempotência:** se já existe `HbxRecoveryCustomer` desse `customerProfileId` (company-scoped)
     → pula (`jaNoFunil`). Senão chama `createCustomer` 1× (`injetados`). Cliente sem telefone
     utilizável (10–15 dígitos) → pula (`semTelefone`), não estoura.
  5. Cron caseiro `setInterval` 1×/dia + passada de boot (45s), no MESMO padrão do M2
     (`logistica-recorrencia.service.ts`) — o repo **não usa `@nestjs/schedule`**. INERTE por
     default: `sweepTodas` só toca empresas com `moduloRecoveryAtivo=true`; sem opt-in, no-op total.
- **`backend/src/logistica/logistica.module.ts`** — importa `HbxRecoveryModule` (exporta
  `HbxRecoveryService`), registra/exporta `LogisticaRecoveryService`. **Sem ciclo**: hbx-recovery
  não importa logistica (verificado em messaging/payments/cadastros/integrations/modules/bot).
- **`backend/src/logistica/logistica.controller.ts`** — endpoint **ADMIN** `POST /logistica/recovery/varrer {date?}`
  (`@UseGuards(JwtAuthGuard, RolesGuard) @Admin()`), company-scoped (companyId do JWT).
- **`backend/src/logistica/dto/logistica.dto.ts`** — `VarrerRecoveryDto { date? }`.
- **`backend/src/logistica/logistica-recovery.service.test.ts`** (NOVO) — `node:test`.

## Idempotência
Unidade do funil = 1 cobrança **por cliente**. A varredura agrupa as charges vencidas por
`customerProfile` e garante **1 `HbxRecoveryCustomer` por cliente**. Rodar 2× no mesmo estado:
a 2ª passada encontra o `HbxRecoveryCustomer` já criado → `injetados=0`, `jaNoFunil=1`,
`createCustomer` NÃO é chamado de novo. O `DebtCase` também não duplica (o `syncRecoveryDebtCaseRecord`
do Recovery já é update-or-create por `customerProfile`+`HBX_RECOVERY`+`open`).

## Opt-in (fail-closed)
`moduloRecoveryAtivo` default `false` no schema. Empresa que não ligou: `varrer` retorna no-op
**sem** ler charge nem chamar o funil. O cron só varre empresas com a flag `true`.

## Checks (verde)
- `cd backend && npm run build` → **verde** (prebuild rodou `prisma generate` limpo).
- `npx prisma validate` → **verde** (`schema is valid 🚀`).
- `npx prisma generate` → **verde** (rodou no prebuild).
- `node --test dist/logistica/logistica-recovery.service.test.js` → **4/4 pass**:
  - (a) vencida + ativo=true → 1 caso (openAmount agregado 80), 2ª varredura NÃO duplica (funil 1×).
  - (b) ativo=false → 0 caso, funil NUNCA chamado.
  - (c) charge NÃO vencida (dueDate ≥ corte) → ignorada, funil não chamado.
  - (extra) cliente sem telefone → pula sem falhar.

## Decisões / notas p/ o dono
- **NÃO há caminho de envio novo.** O único "efeito" desta varredura é gravar `HbxRecoveryCustomer`
  + `DebtCase` via `createCustomer`. O disparo de WhatsApp (quando acontecer) é 100% do funil
  hbx-recovery já blindado. Zero MP, zero socket, zero reconexão aqui.
- **Cron INERTE por default.** Não roda em boot (respiro 45s) e só toca empresas opt-in. Se preferir
  **sem cron nenhum** (só o botão/endpoint), é 1 linha remover o `onModuleInit` — o endpoint basta.
- **Corte de vencimento** = início do dia (hoje ou `?date`). "Vence hoje" ainda **não** é vencida
  (só `dueDate` estritamente anterior). Se quiser incluir o próprio dia, mudo `lt` → `lte`.
- **Cliente sem telefone** é pulado (o Recovery exige alvo de WhatsApp com DDI). Reportado no
  retorno como `semTelefone` — não vira caso mudo nem erro.
- **Badge "em cobrança" (frontend) ADIADO** conforme instrução. O dado já existe: front pode ler
  o `HbxRecoveryCustomer`/`DebtCase` do cliente. Nenhum arquivo em `frontend/**` foi tocado.
