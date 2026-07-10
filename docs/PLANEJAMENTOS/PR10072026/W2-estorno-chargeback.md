# W2 — P0.3: estorno/chargeback compensa créditos + débito manual do master
Mapear charged_back (e in_mediation) em normalizeProviderPaymentStatus. Em refund/cancel/chargeback de
charge de RECARGA (externalReference hbx-credit-recharge-*): compensação idempotente na carteira
(kind purchase_reversal, usageKey mp-reversal:<mpPaymentId>), debita min(saldo, créditos do pack);
shortfall (já consumido) → MasterEvent com a dívida (NÃO bloqueia consumo — decisão aberta pro dono).
refundChargeByMaster ganha a mesma compensação. Novo endpoint master POST débito manual {amount>0, reason}, auditado.
Ledger append-only, nunca saldo negativo. Testes: webhook duplicado → 1 débito; shortfall → alerta.
