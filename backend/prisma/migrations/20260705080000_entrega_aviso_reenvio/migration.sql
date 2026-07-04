-- NÚCLEO-CRM R4 (05/07) — FALHA VISÍVEL: persistir o desfecho dos efeitos do
-- confirmar entrega + o teto do reenvio manual do aviso.
--
--   whatsappMotivo  = razão curta quando o aviso falhou/foi pulado
--                     (sem_telefone | aviso_off | erro …). Complementa whatsappStatus
--                     (já existente, M2), que passa a guardar 'enviado'|'falhou'|'pulado'.
--   avisoReenviado  = TETO DURO de 1 reenvio manual do aviso por entrega. Uma vez
--                     true, o endpoint /reenviar-aviso barra — ZERO loop de reconexão.
--
-- whatsappStatus e cobrancaOutcome JÁ existem (migration 20260705020000_logistica_entrega).
-- ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS, defaults seguros, ZERO drop.
-- Migração escrita à mão (padrão N1/R2/R3): o dono aplica no deploy.

ALTER TABLE "Entrega"
  ADD COLUMN IF NOT EXISTS "whatsappMotivo" TEXT,
  ADD COLUMN IF NOT EXISTS "avisoReenviado" BOOLEAN NOT NULL DEFAULT false;
