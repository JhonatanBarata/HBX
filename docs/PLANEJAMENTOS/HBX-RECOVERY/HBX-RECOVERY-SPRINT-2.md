# HBX Recovery — Sprint 2: Caminho único de pagamento

> Arquitetura nº14. Depende do Sprint 1 (atomicidade do saldo).
> **Frente financeira** → Opus edita DIRETO + revisão obrigatória do diff.

## Problema
Dois geradores de preferência Mercado Pago que DIVERGIRAM (não são cópias):
- `hbx-recovery.service.ts:3565` `sendPaymentLink` — só à vista, seta `createdByUserId`,
  mensagem hardcoded + menu interativo.
- `messaging.service.ts:5748` `createAndSendRecoveryPaymentLink` — parcelado até 12x com juros
  (`calculateInstallment`, `messaging.service.ts:~5460`), metadata extra (`requested_mode`,
  `charge_type`, `installment_count`, `conversation_id`), mensagens configuráveis do bot config,
  NÃO seta `createdByUserId`.
Regra nova de cobrança hoje = mexer em 2 lugares. Um dia alguém muda só um.

## Solução — fusão (não deleção)
1. Criar `backend/src/hbx-recovery/recovery-payments.service.ts` com UM método
   `createPaymentLink(input)` que cobre o superset:
   `{ companyId, customerId, amount?, chargeType: 'avista'|'parcelado', installmentCount?,
   conversationId?, createdByUserId?, requestedMode?, targetPhone?, messageStyle: 'api'|'bot' }`.
   Mover pra dentro dele: `calculateInstallment` (juros), montagem da preference (payer, items,
   expiração 3 dias, `payment_methods.installments`), criação/atualização de `HbxRecoveryPayment`,
   envio da mensagem (template do bot config OU mensagem+menu da API — decidir por `messageStyle`).
2. `sendPaymentLink` (service) e `createAndSendRecoveryPaymentLink` (messaging) viram wrappers
   finos chamando o novo service. O messaging recebe `RecoveryPaymentsService` injetado
   (`HbxRecoveryModule` já é importável; se der ciclo de módulo, usar `forwardRef` — ciclo some
   no Sprint 4).
3. Mover pra cá também: `refundPayment`, `markPaid`/`markInteractionPaid` (aplicação de saldo),
   `syncMercadoPagoPayment` e `applyPayment`/`reversePayment` (já atômicos do Sprint 1).
4. **Ledger de eventos** (comissão de 3% em jogo → trilha auditável): nova tabela
   `HbxRecoveryPaymentEvent { id, companyId, paymentId, type (created|link_sent|approved|
   refunded|reversed|marked_paid|failed), amount, actorUserId?, source (api|bot|webhook|manual),
   payloadJson?, createdAt }`. Escrever evento em cada transição. Migration Prisma.
5. **Decimal nas tabelas do Recovery**: `HbxRecoveryCustomer.openAmount/totalPaid` e
   `HbxRecoveryPayment.amount/installmentValue/refundAmount/appliedToCustomerAmount/reversedAmount`
   de `Float` → `Decimal @db.Decimal(12,2)`. Ajustar conversões no service (Prisma Decimal → Number
   na borda de resposta, manter shape do JSON pro frontend). Se o impacto no frontend estourar o
   sprint, adiar SÓ o Decimal pro Sprint 6 e registrar aqui.

## Critérios de aceite
- [ ] Uma única função monta preference MP no código todo (grep `createPreference` → 1 caller
      no domínio recovery; financeiro é outro domínio, não tocar).
- [ ] Bot continua oferecendo parcelado com juros; API continua à vista — mesmo comportamento
      visível de antes (testar fluxo do bot em número descartável, NUNCA chip do dono).
- [ ] Ledger grava created→approved→refunded num ciclo completo (teste com webhook simulado).
- [ ] `npx tsc --noEmit` verde; testes do módulo + `messaging.service.test.ts` verdes.
- [ ] Migration aplicada local; anotar necessidade de conferir no VPS pós-publish.

## Guardrails
- NÃO alterar valores de juros/parcelas existentes — portar `calculateInstallment` byte-a-byte.
- NÃO remover os wrappers antigos neste sprint (remoção é no Sprint 4).
- Reembolso e comissão-ao-closer têm trabalho em andamento no working tree (memória PAGAMENTOS)
  — conferir estado antes de mexer em `refundPayment`.
