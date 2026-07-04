# S2 — Shadow-debit no ponto único de baixa de lead — RESULTADO

> Executado em worktree isolado (`.claude/worktrees/agent-a6a701021cc388ebf`), LOCAL. NÃO
> publicado, NÃO commitado na master, NÃO rodou migration contra banco nenhum. Escopo: só
> MEDIÇÃO (shadow-debit) atrás de flag nova default OFF — zero enforcement, zero mudança de
> comportamento em vendas/cota comercial. Base: merge de `credits/build` (S1 ledger + S3-parte1
> catálogo/grant), congelados e não tocados.

---

## ⭐ Revisão do Opus — MUDANÇA DE PONTO (1ª entrega furava cobertura)

A 1ª entrega plugou o shadow-debit em **3 call-sites diretos de `vendas.service.ts`** (após cada
`recordCardCommercialUseOnce`). O Opus reprovou o PONTO (o mecanismo — idempotente, não afeta saldo,
flag OFF, best-effort — foi aprovado): **cobertura é o objetivo inteiro do shadow, e aquilo
subcontava.**

**O furo:** a cota mensal da empresa é contada por `CARD_SUCCESS_EVENTS = ['card_import_success',
'vendas_card_imported', 'radar_card_claimed', 'card_commercial_used']` (`commercial-usage-limits.service.ts:14`),
NÃO só por `card_commercial_used`. A baixa é consumida por DOIS métodos e MÚLTIPLOS callers:
- `recordCardCommercialUseOnce` → loga `card_commercial_used`.
- `recordCardImport` → loga `vendas_card_imported` / `radar_card_claimed`.

Os 3 hooks antigos cobriam só o `recordCardCommercialUseOnce` **de dentro do vendas.service** e
deixavam de fora: (a) `radar-core-delivery.mixin.ts:3377` (entrega automática do Radar, também chama
`recordCardCommercialUseOnce`), e (b) TODOS os `recordCardImport` — inclusive
`radar-core-delivery.mixin.ts:3330` (`radar_claim`). No enforce (R1) isso vazaria lead grátis.

**A correção (centralizar no DONO da baixa):** o shadow-debit agora é emitido de DENTRO do
`CommercialUsageLimitsService`, logo após cada `this.log(...)` de sucesso em `recordCardImport` E
`recordCardCommercialUseOnce`. Cobre TODOS os callers (vendas + radar + qualquer futuro) por
construção — nada de caçar call-site.

---

## Desenho final

### O hook central (`commercial-usage-limits.service.ts`)
- `CreditsService` injetado no construtor como **`@Optional()`** (2º parâmetro). Opcional-defensivo:
  se ausente (ex.: teste que instancia `new CommercialUsageLimitsService(prisma)` com 1 arg, ou um
  contexto onde `CreditsModule` não esteja carregado), o hook vira no-op silencioso e a cota segue
  normal. Não altera nenhum dos 14 testes existentes desse service.
- Helper privado `emitLeadDeliveryShadowDebit(companyId, userId, metadata)`: fire-and-forget
  (`void ... .catch(() => undefined)`), sem `await` bloqueante — o `try/catch` real e o no-op-por-flag
  moram dentro do `recordShadowDebit`. `actionKey: 'lead_delivery'` (unidade única da baixa, conforme
  D1 do PLANO: "1 crédito = 1 lead").
- Helper privado `resolveLeadDeliveryKey(metadata)`: resolve a chave CANÔNICA de lead, **idêntica**
  nos dois métodos quando falam do mesmo lead — senão a idempotência 1:1 furaria (2 shadows p/ 1
  baixa). Os callers passam a mesma origem por caminhos diferentes:
  - vendas: `usageKey` já vem `vendas:<id>` ou `radar:<id>`.
  - radar `recordCardCommercialUseOnce` (linha 3377): `usageKey: radar:<id>`.
  - radar `recordCardImport` (linha 3330): SÓ `radarLeadId: <id>` CRU (sem usageKey).
  Regra: se veio `usageKey` explícita, usa; senão reconstrói `radar:<radarLeadId>` /
  `vendas:<vendasLeadId>` — o MESMO shape. Assim `radar_claim` (import) e `radar_contact_click`
  (commercial-use) do MESMO lead colidem no mesmo `leadId` → `recordShadowDebit` (idempotente por
  usageKey `shadow:lead_delivery:<leadId>`) grava 1 só.
- Os 3 pontos de emissão (todos aditivos, logo após `this.log(...)` de sucesso — a lógica de cota
  NÃO foi tocada):
  1. `recordCardImport` (linha ~940) — após o `log`. Cobre imports diretos + `radar_claim`.
  2. `recordCardCommercialUseOnce`, branch SEM usageKey (linha ~995) — após o `log`.
  3. `recordCardCommercialUseOnce`, branch COM usageKey (linha ~1017) — após o `log`, passando
     `{ ...metadata, usageKey }` já normalizada. O branch de dedup (`existing` → `alreadyDebited:true`)
     retorna ANTES do shadow — correto: cota não consumiu de novo, shadow também não dispara.

### Eventos de `CARD_SUCCESS_EVENTS` cobertos
Todos os 4, pelos 2 métodos que os geram:
- `card_commercial_used` → `recordCardCommercialUseOnce` ✅
- `vendas_card_imported` → `recordCardImport` (source ≠ radar_claim) ✅
- `radar_card_claimed` → `recordCardImport` (source = radar_claim) ✅
- `card_import_success` → gerado por `recordCardImport`/callers; coberto pelo mesmo hook central ✅
  (nota: o event literal `card_import_success` está no set de cota mas o código atual loga
  `vendas_card_imported`/`radar_card_claimed` via `recordCardImport`; o hook está no método, não no
  nome do evento, então cobre independente de qual dos rótulos o `log` gravar).

### O mecanismo (`credits.service.ts`, INALTERADO desde a 1ª entrega)
`recordShadowDebit(companyId, userId, { leadId, actionKey })`:
- Flag `HBX_CREDITS_SHADOW` OFF → no-op imediato (sem tocar banco).
- Idempotência em código: `findFirst({ companyId, kind: 'debit_shadow', usageKey })` antes do
  `create` (`usageKey = 'shadow:' + actionKey + ':' + leadId`). Filtra por `companyId` também, então
  2 empresas clamando o mesmo `radarLeadId` geram entradas distintas (correto). O `@@unique` do
  schema NÃO cobre este caso (`parentEntryId` null, NULLs não colidem) — a trava é o `findFirst`.
- Grava `kind: 'debit_shadow'`, `amount: 1`, `remaining: 0`, `actionKey`, `usageKey`, `createdByUserId`.
  Usa `wallet.ensureWallet` (idempotente, não mexe em saldo) para o `walletId` (FK obrigatória).
- `try/catch` externo: nunca lança. Best-effort puro.
- `getBalance` é matematicamente indiferente: `openLotsFifo` só lê `kind IN (grant, recharge, promo)`;
  `debit_shadow` fica fora do filtro, e `remaining: 0` somaria zero de qualquer jeito.

## Vendas voltou à baseline

Os 3 hooks diretos, a injeção de `CreditsService` no `VendasService`, o import do `CreditsModule` no
`VendasModule` e o mock no `vendas.service.test.ts` foram TODOS revertidos. Confirmado por
`git diff --stat backend/src/vendas/` = **vazio** (zero diff). O `vendas.service.test.js` roda 64/72
— idêntico à baseline (as 8 falhas em `getBoardForUser`×6 + `importWebscrapingLeadsForUser`×2 são
pré-existentes e não têm relação com créditos; provado por `git stash` na 1ª entrega e reconfirmado
agora que vendas está 100% baseline).

## Arquivos tocados (versão final)

```
backend/src/commercial-plans/commercial-usage-limits.service.ts | +65  (Optional+CreditsService no
                                                                   ctor + 2 helpers + 3 pontos de emissão)
backend/src/commercial-plans/commercial-plans.module.ts         | +5   (import CreditsModule)
backend/src/commercial-plans/commercial-usage-limits.service.test.ts | +130 (4 testes de cobertura)
backend/src/credits/credits.service.ts                          | +60  (Logger + recordShadowDebit) [1ª entrega, mantido]
backend/src/credits/credits.flags.ts                            | +8   (isCreditsShadowEnabled)      [1ª entrega, mantido]
backend/src/credits/credits.service.test.ts                     | +55  (5 testes unitários)          [1ª entrega, mantido]
.env.production.example                                         | +6   (flag HBX_CREDITS_SHADOW)      [1ª entrega, mantido]
docs/PLANEJAMENTOS/CREDITOS/S2-RESULTADO.md                     | reescrito (este arquivo)
```
`backend/src/vendas/*` = SEM diff (revertido). Arquivos do S1 (`credit-wallet.service.ts`) e do
catálogo NÃO tocados — congelados.

## Migration

**Zero migration nova.** `CreditLedgerEntry.kind` é `String` livre; `debit_shadow` é só mais um valor.
`prisma:validate` verde sem diff de schema além do que veio do merge `credits/build`.

## Ciclo de módulo

**Sem ciclo.** `CreditsModule` importa APENAS `PrismaModule` (confirmado: `credits/` não referencia
`commercial-plans` em lugar nenhum; o único provider extra, `MasterGuard`, depende só de
`@nestjs/common`). Direção única: `CommercialPlansModule → CreditsModule`. Não precisou de
`forwardRef`. O `@Optional()` no parâmetro é cinto-e-suspensório (defende o caso de o provider não
estar disponível num contexto de teste/boot parcial).

## Testes

### Cobertura (o que PROVA o fix) — `commercial-usage-limits.service.test.ts`, 4 novos
- `recordCardImport (radar_card_claimed) dispara 1 shadow com leadId canônico` → `radar:abc-123`,
  `actionKey: 'lead_delivery'`, companyId/userId corretos.
- `recordCardCommercialUseOnce dispara 1 shadow com a usageKey como leadId` → `radar:abc-123`.
- `import + commercial-use do MESMO lead usam o MESMO leadId canônico (idempotência 1:1)` — o import
  passa `radarLeadId` cru, o commercial-use passa `usageKey: radar:<id>`, e ambos resolvem para o
  MESMO `radar:abc-123`. Prova que a chave é idêntica nos 2 caminhos (a idempotência real do
  `recordShadowDebit` então grava 1).
- `sem CreditsService injetado (undefined) NÃO quebra recordCardImport` — prova o `@Optional()`.

### Unitários do mecanismo — `credits.service.test.ts`, 5 (da 1ª entrega, mantidos)
idempotente (mesmo leadId 2x = 1 entrada); leadIds diferentes = entradas distintas; `debit_shadow`
não afeta `getBalance`; flag OFF = no-op; nunca lança com input inválido.

## Checks (todos verdes)

```
cd backend && npm ci                                      → node_modules do worktree
DATABASE_URL=... DIRECT_URL=... npm run prisma:validate   → schema válido (sem migration nova)
DATABASE_URL=... DIRECT_URL=... npm run build              → tsc limpo, sem erros
node --test dist/credits/*.test.js                          → 55/55 (50 + 5 shadow unit)
node --test dist/commercial-plans/commercial-usage-limits.service.test.js → 18/18 (14 + 4 cobertura)
node --test dist/vendas/vendas.service.test.js               → 64/72 (8 falhas baseline, vendas intocado)
```

## Confirmação explícita

- ✅ Shadow agora dispara para a ENTREGA DO RADAR também: `recordCardImport` (`radar_claim` →
  `radar_card_claimed`, `radar-core-delivery.mixin.ts:3330`) E `recordCardCommercialUseOnce`
  (`radar_contact_click`, linha 3377) emitem o shadow pelo hook central. Provado por teste.
- ✅ Cobre `recordCardImport` (todos os imports) + `recordCardCommercialUseOnce` (vendas + radar) —
  os 2 métodos que consomem a cota, por todos os callers, por construção.
- ✅ Idempotência 1:1 com a cota: import + commercial-use do mesmo lead → mesmo `leadId` canônico →
  1 shadow (igual a cota real, que dedup por `CARD_SUCCESS_EVENTS` + usageKey).
- ✅ vendas.service voltou 100% à baseline (`git diff` vazio).
- ✅ Best-effort / fire-and-forget / no-op com flag OFF — mecanismo inalterado e aprovado.
- ✅ A lógica de cota comercial (`log`, `assertCanImportCard`, dedup, retornos) NÃO foi alterada — só
  emissão aditiva após os `log` de sucesso.
- ✅ Sem migration nova; sem ciclo de módulo.

## Dúvidas / pontos para o Opus

1. **`leadId` canônico reconstruído quando falta `usageKey`.** No radar `recordCardImport` só chega
   `radarLeadId` cru, sem `usageKey`; reconstruo `radar:<radarLeadId>` para casar com o
   `recordCardCommercialUseOnce` (que manda `usageKey: radar:<id>`). Se algum caller futuro passar a
   MESMA origem com um shape diferente (ex.: `vendasLeadId` num caminho e `usageKey: radar:<id>` no
   outro pro mesmo lead físico), a idempotência 1:1 poderia furar. Hoje os callers reais são
   consistentes (vendas usa `vendas:<id>`/`radar:<id>`; radar usa `radar:<id>`) — mas é uma premissa
   sobre o formato das chaves dos callers, não uma garantia de banco. Se quiser blindar, dá pra
   derivar o leadId de um campo único explícito (ex.: sempre `radarLeadId ?? vendasLeadId`) em vez da
   usageKey — mas aí perderia a colisão com casos onde só a usageKey chega. Deixei alinhado com a
   chave de cota (usageKey-primeiro) por ser o que a dedup real usa.
2. **Idempotência do shadow é só em código (`findFirst`), sem unique de banco** (herdado da 1ª
   entrega). Telemetria, não dinheiro — duplicata rara sob corrida infla o contador em 1, não afeta
   saldo. Mantido por escolha (sem migration nova). Se o dimensionamento do S4 exigir número exato,
   dá pra adicionar índice único parcial depois.
3. **`ensureWallet` a cada shadow novo** cria uma `CreditWallet` vazia para toda empresa que gerar 1
   baixa (mesmo sem nunca ter comprado crédito). Correto pro propósito de medição (ancora o
   histórico), mas é criação de linha "de graça" — nota pro S4.

## Fora de escopo (não feito, por design)

Enforcement/bloqueio, decremento real de saldo, checkout MP, distribuição admin→vendedor (S4),
painel (S6), qualquer mudança na cota comercial atual, migration nova, publish, commit na master,
migration rodada contra banco.
