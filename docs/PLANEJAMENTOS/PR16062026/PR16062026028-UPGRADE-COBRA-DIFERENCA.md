# PR16062026028 — Upgrade: cobrar a diferença e SÓ ENTÃO subir o plano

> Lê o **023** + **026** + **027**. Coração do upgrade. **Risco alto** (cobrança real). Em dev usa
> `PAYMENTS_PROVIDER=mock`. LIVE só com o dono.

## OBJETIVO
No upgrade (plano mais caro), cobrar **a diferença proporcional agora** no cartão e, **apenas após a
confirmação do pagamento**, subir o plano: módulos + entitlements + valor recorrente do provedor.
Se o pagamento não confirmar, **nada muda**.

## CÁLCULO DA DIFERENÇA (proporcional ao que falta do ciclo)
`diferenca = (mensalNovo − mensalAtual) × diasRestantesDoCiclo / diasDoCiclo`
- `mensalNovo`/`mensalAtual` = `getCommercialPlanMonthlyPrice` (catálogo, fonte única).
- `diasRestantes` = de hoje até `subscriptionCurrentPeriodEnd`/`nextBillingAt` (o que existir).
- Espelhar o padrão de proração de assento que **já existe** (`seat-billing.util.ts` /
  `computeCompanyCommercialAmount`) — não inventar fórmula nova; reusar o jeito de contar dias.
- Recalcular **assento** no plano novo (inclusos mudam) e somar ao breakdown.

## ENDPOINTS (financeiro)
Arquivo: `backend/src/financeiro/financeiro.service.ts` + `.controller.ts`
1. **Preview (sem efeito):** método que recebe `toPlanKey` e devolve
   `{ direction:'upgrade', amountNow, trialDaysLost, newMonthly, breakdown }`. Alimenta a tela 027.
2. **Aplicar upgrade:** `POST /financeiro/subscription/change` `{ planKey, cardTokenId, ... }`:
   - `assertCanManageBilling`.
   - Cobra a diferença **agora**: `mercadoPagoClient.createPayment` (cobrança avulsa única) com o
     `cardTokenId` confirmado na tela. Registrar no ledger (`insertBillingLedgerEntry`, entryType
     tipo `plan_upgrade_proration`).
   - **Só se aprovado** (`normalizeProviderPaymentStatus === 'approved'`):
     - `mercadoPagoClient.updatePreapproval(preapprovalId, { auto_recurring: { transaction_amount:
       novoValorRecorrente } })` — sobe a mensalidade dos próximos ciclos.
     - `applyPlanChange` (tx única): `Company.selectedPlanKey = novo`, `syncPaidPlanModulesTx`,
       `syncPaidCommercialEntitlementsTx`. Mantém `status` vigente (paying/trial→paying conforme o caso).
   - Se **não aprovado**: NÃO sobe nada; devolve erro mansinho ("pagamento não autorizado, plano
     mantido"). Estado anterior intacto.

## CONSERTAR O NO-OP DE HOJE (porta morta)
Em `createSubscriptionForUser`, o ramo "reuse" (~linha 3209) hoje, quando já existe assinatura,
**re-sincroniza a antiga e ignora o plano novo** (cliente troca e continua no antigo). A troca de
plano de empresa **já assinante** passa a ir pelo `subscription/change` deste bloco (que mexe no
`updatePreapproval` + cobra diferença). Não deixar dois caminhos divergentes — o `change` é o dono
do upgrade de quem já tem assinatura. (A 031/032 limpa o que sobrar.)

## UPGRADE PRO PRO → ACIONAR SUPORTE DO BOT
Quando o upgrade for **para `hbx_pro`** e aprovado: disparar alerta do master
(`MasterAlertService`) "configurar bot do Pro p/ <empresa>" — best-effort. Motivo do dono: cliente
quase nunca configura o bot sozinho e "dá merda"; a HBX entra pra ligar/ajustar.

## TRIAL
Se a empresa está em trial (só Lead tem trial) e faz upgrade, o aviso de "perde N dias" vem do
preview (027). Ao confirmar o pagamento, o trial encerra e vira pago no plano novo.

## NÃO FAZER
- Não subir módulo/entitlement antes do pagamento aprovado.
- Não cobrar no downgrade (isso é o 029, vira crédito).
- Não ler campo cru de status; usar `resolveCompanyAccessState`.
- Sem número de plano hardcoded.

## CHECKS
`cd backend && npm run build` + testes do cálculo da diferença e do "não aprovado = não muda".
Ao vivo (mock): List→Pro mostra valor, "paga", sobe módulos do Pro + dispara alerta do bot;
simular recusa → plano permanece List.

## DEPENDE DE
**026** (rank), **027** (tela). É pré-req do número de upgrade no preview da 027.

## STATUS
Planejado 16/06. **LIVE só com o dono** (precisa MERCADO_PAGO test/live key + webhook na VPS).
