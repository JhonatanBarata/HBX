# 01 — Backend: `POST /logistica/rota/encerrar` (transacional)

**Frente DINHEIRO-CRÍTICO.** O Opus revisa este diff linha a linha. Regra dura: **nenhuma linha pode
criar, alterar, anular ou apagar `FinanceiroCharge`, nem tocar em entrega com status `entregue` ou em
`comprovante`.** Se você achar que precisa mexer em cobrança pra cumprir o objetivo, PARE e reporte —
não improvise.

## Objetivo
Hoje o app encerra rota chamando `POST /logistica/entregas/:id/cancelar` num **loop** por parada aberta
(`performCancelRoute`, `EntregaShell/app/src/logistica/assets/app/app.js:1021`). Se a rede cair no meio,
metade cancela e metade fica → **cancelamento parcial** (o toast "Canceladas 12 de 40" aceita isso).
Além disso, `cancelar` marca a entrega como `cancelada` (= "não entregue", uma FALHA) — semântica errada
para "parei a rota, o resto continua pendente pra outro dia".

Criar **um** endpoint transacional que faz tudo-ou-nada e usa a semântica certa (pendência, não
cancelamento). Ele serve os DOIS casos do app: "Cancelar planejamento" (antes de iniciar) e
"Encerrar rota" (no meio) — a diferença é só a cópia na tela, o backend é o mesmo primitivo.

## Contrato (CONGELADO — o app já está sendo escrito contra isto)
`POST /logistica/rota/encerrar`
- Guard/escopo: idêntico a `rota/iniciar` (`@Post('rota/iniciar')`,
  `backend/src/logistica/logistica.controller.ts:555`). `JwtAuthGuard` já global; company via
  `this.ensureCompanyIdFromUser(req.user)`. **NÃO** `@Admin()`.
- Body (crie `EncerrarRotaDto` no mesmo arquivo dos outros DTOs de logística):
  `{ date?: string /* YYYY-MM-DD, default = hoje America/Sao_Paulo */, motivo?: string }`
- Resposta: `{ ok: true, resumo: { total: number, entregues: number, naoEntregues: number, pendentes: number } }`

## Semântica exata (o que a transação faz)
Numa **única** `prisma.$transaction`:
1. Carrega as entregas do dia (mesmo range/escopo que `planejarRota`/`iniciarRota` usam — reaproveite
   `resolveDayRange`/`canonicalRouteDate` de `logistica-rota.service.ts`; company-scoped).
2. **Abertas** (`status IN ('agendada','em_rota')`) → revert para pendência:
   `status='agendada'`, `rotaOrdem=null`, `etaAt=null`, `startedAt=null`.
   **Mantém `scheduledAt` como está** (não backdatar). Assim a retomada no mesmo dia re-planeja normal, e
   no dia seguinte elas aparecem na lista de pendências (a query de pendência é `scheduledAt < início do dia`
   — ver `logistica-admin-route.service.ts:94`). Conta essas em `resumo.pendentes`.
3. **Entregues** (`status='entregue'`) → **intocadas**. Conta em `resumo.entregues`.
4. **Canceladas** (`status='cancelada'`) → **intocadas**. Conta em `resumo.naoEntregues`.
5. `resumo.total` = total de entregas do dia.
6. **Rota (`LogisticaRoute`)**: se existir linha ACTIVE/PLANNED para essa empresa+data, encerra para que
   o app pare de ver `routeStatus==='ACTIVE'` (o app faz `serverRouteActive()` = `routeStatus==='ACTIVE'`,
   `app.js:126`; `routeStatus` vem de `tracking.getOperationalRouteMetadata`).
   ⚠️ **INVESTIGUE ANTES DE ESCOLHER O STATUS.** O enum é `PLANNED|INITIALIZING|ACTIVE|COMPLETED|REFUNDING|
   FAILED` (`schema.prisma:1285`). Leia `logistica-route-billing.service.ts` e os reconciliadores
   (`logistica-offline-reservation-reconciler.service.ts`, `logistica-offline-tracked-billing.service.ts`)
   e confirme que a transição que você escolher **NÃO dispara estorno/reconciliação de cobrança** para o
   modo ESSENCIAL já faturado. Se `COMPLETED` for seguro (é o terminal natural), use-o. Se houver QUALQUER
   caminho de refund atrelado à transição, **não** faça a transição de status e **reporte** — encerrar as
   entregas abertas já tira a rota do "ativo" no app na prática (openItems vazia). Documente no código o que
   você verificou.
7. **NÃO** dispara WhatsApp nem cobrança. **NÃO** cria `DeletionRecord`. Best-effort de re-ETA NÃO se aplica
   (a rota acabou).

## Idempotência
Encerrar 2× seguidas não pode quebrar: a 2ª vez acha 0 abertas → `pendentes: 0`, resposta normal. Sem 409.

## Onde pôr o código
- Método novo `encerrarRota(companyId, input, actorUserId?)` — sugiro em `logistica-rota.service.ts`
  (já tem o range/escopo do dia e o billing service injetado). Se ficar mais limpo num arquivo próprio,
  pode, mas mantenha company-scope e transação.
- Endpoint no `logistica.controller.ts` perto do `rota/iniciar`, seguindo o padrão dos vizinhos.
- DTO junto dos outros (`dto/logistica.dto.ts`).

## Testes obrigatórios (node:test — cobre casos 4–8 do plano do dono)
Crie `backend/src/logistica/logistica-rota-encerrar.service.test.ts`. Espelhe o mock de Prisma/`$transaction`
de `logistica-admin-route.service.test.ts` (referência da casa). Casos mínimos:
1. **Entregues permanecem** — entrega `entregue` não muda status nem perde nada.
2. **Cobranças permanecem** — nenhum `FinanceiroCharge` é tocado (o mock de prisma deve FALHAR o teste se
   qualquer método de charge for chamado com create/update/delete).
3. **Abertas viram pendência** — `agendada`/`em_rota` → `agendada` com `rotaOrdem/etaAt/startedAt = null`,
   `scheduledAt` inalterado; **nunca** `cancelada`.
4. **Atomicidade** — se um update falha no meio, a `$transaction` faz rollback (nada meio-aplicado). Prove
   que o encerrar usa `$transaction` (uma falha injetada não deixa estado parcial).
5. **Idempotência** — 2ª chamada retorna `pendentes: 0` sem erro.
6. **Resumo correto** — `{ total, entregues, naoEntregues, pendentes }` bate com o fixture.

## Checks antes de reportar
```
cd backend && npm run build
node --test dist/logistica/logistica-rota-encerrar.service.test.js
# regressão dos vizinhos:
node --test dist/logistica/logistica-rota.service.test.js dist/logistica/logistica-admin-route.service.test.js
```
Se `npm run build` (tsc do projeto todo) estiver muito lento, ainda assim rode — é o gate real.

## Regras
Master direto, sem branch, **sem publish**. Reporte ao Opus: arquivos tocados, a decisão do status da
`LogisticaRoute` (com o que você verificou sobre estorno), saída dos testes, e qualquer coisa que você
quis mexer em cobrança e NÃO mexeu.
