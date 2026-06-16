# PR16062026029 — Downgrade: vira CRÉDITO, sem cartão

> Lê o **023** + **026** + **027**. Exceção da Regra de Ouro: no downgrade nada é cobrado, então
> **não toca no cartão**. **Risco alto** (mexe em acesso/cobrança).

## OBJETIVO
No downgrade (plano mais barato), o cliente:
1. **Mantém o tier atual** até **compensar os dias já pagos** (o que ele pagou ele usa).
2. O que sobra de valor vira **crédito** que rola pros próximos meses do plano novo.
3. O backend **baixa** módulos/entitlements só quando o período pago é consumido.
Sem cartão, sem cobrança nova.

## CÁLCULO DO CRÉDITO
`credito = (mensalAtual − mensalNovo) × diasRestantesDoCiclo / diasDoCiclo`
- Mesma base de dias do upgrade (028) — reusar o helper de proração, não inventar.
- O crédito é registrado e **abatido na próxima fatura** do plano novo (recorrente do provedor).

## COMO APLICAR (sem cortar acesso na hora)
Arquivo: `backend/src/financeiro/financeiro.service.ts`
1. **Preview (sem efeito):** devolve `{ direction:'downgrade', creditAmount, switchDate, newMonthly }`
   pra tela 027. `switchDate` = `subscriptionCurrentPeriodEnd`/`nextBillingAt`.
2. **Confirmar downgrade:** `POST /financeiro/subscription/change` `{ planKey }` (sem cartão):
   - `assertCanManageBilling`.
   - **Agenda** a troca: grava `scheduledPlanKey = novo` na `CompanySubscription` (campo novo) ou em
     metadata da assinatura. **Não** muda `selectedPlanKey`/módulos/entitlements agora.
   - Registra o **crédito** no ledger (`insertBillingLedgerEntry`, entryType `plan_downgrade_credit`,
     status que o overview saiba abater).
   - Mantém o `updatePreapproval` do provedor pro **novo valor** só valendo **no próximo ciclo**
     (ou aplica no virar do período — ver passo 3). Não cobrar nada agora.
3. **No virar do período** (estender o sweep que já existe — `processBillingGracePeriods` roda de
   15 em 15 min; criar um `processScheduledPlanChanges` no mesmo intervalo, OU aplicar no webhook do
   provedor quando a próxima cobrança roda):
   - Aplica `applyPlanChange` pra baixo: `selectedPlanKey = novo`, `syncPaidPlanModulesTx`,
     `syncPaidCommercialEntitlementsTx` (remove o que o plano novo não tem).
   - `updatePreapproval(transaction_amount = novoMensal)` se ainda não aplicado.
   - Abate o crédito na fatura.
   - Limpa `scheduledPlanKey`.

## CANCELAR O DOWNGRADE AGENDADO
Enquanto não virou o período, o cliente pode **desfazer** (botão na tela): limpa `scheduledPlanKey`
e o crédito agendado. Volta ao estado normal do plano atual.

## NÃO FAZER
- Não cortar acesso/módulo no clique nem na confirmação — só no virar do período.
- Não acessar cartão / não cobrar nada no downgrade.
- Sem reembolso em dinheiro (é crédito interno; dinheiro de volta = nunca, ver 030).
- Estado canônico (`resolveCompanyAccessState`), sem campo cru.

## SCHEMA (se precisar)
- `CompanySubscription.scheduledPlanKey String?` + `scheduledPlanChangeAt DateTime?` (ou guardar em
  metadata JSON já existente, se preferir não migrar). Se migrar: migration **aditiva**, nunca
  destrutiva.

## CHECKS
`cd backend && npm run build` + testes: crédito correto, acesso **não** cai na confirmação,
`processScheduledPlanChanges` aplica no vencimento, cancelar agendamento volta ao normal.
Ao vivo (mock): Pro→List mostra "crédito R$ Y", confirma, segue no Pro até a data, crédito no overview.

## DEPENDE DE
**026** (rank), **027** (tela). Compartilha o `applyPlanChange` com o **028**.

## STATUS
Planejado 16/06. **LIVE só com o dono.**
