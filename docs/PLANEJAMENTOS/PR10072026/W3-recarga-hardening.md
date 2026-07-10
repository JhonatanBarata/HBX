# W3 — P0.4: recarga MP amarrada à empresa/intenção
X-Idempotency-Key = credrech-<companyId>-<key>. Validar resposta do MP: payment.id OBRIGATÓRIO
(sem id → falha + MasterEvent, nunca sintetizar ref-*), external_reference confere, transaction_amount
= preço do pack, currency BRL. P2002 cross-empresa em mpPaymentId → erro + alerta (não falso-sucesso).
alreadyProcessed de usageKey de OUTRA empresa → erro + alerta. Manter 10/10 testes verdes + novos.
