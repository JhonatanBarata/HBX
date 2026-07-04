-- LOGÍSTICA-MOBILE M4 (05/07) — pagamento condicional na entrega.
-- 2 EIXOS SEPARADOS no cliente (regra do dono 04/07, NÃO misturar):
--   · formaPagamento = COMO/QUANDO paga (fonte da verdade do fluxo do app do entregador).
--     'aberto' (novo/avulso: chips de recebimento aparecem) | 'mensal' | 'na_hora' | 'pendura'.
--   · metodoPadrao  = método fixo p/ 'na_hora' ('pix' | 'dinheiro').
--   · contabilizar  = entra na contabilidade? (M6 usa; M4 só lê formaPagamento p/ os chips).
-- ADITIVO e idempotente: ADD COLUMN IF NOT EXISTS, defaults seguros, ZERO drop.
-- NÃO aplicar em banco vivo aqui — segue o padrão N1 (migração à mão).

ALTER TABLE "CustomerProfile"
  ADD COLUMN IF NOT EXISTS "formaPagamento" TEXT NOT NULL DEFAULT 'aberto',
  ADD COLUMN IF NOT EXISTS "metodoPadrao" TEXT,
  ADD COLUMN IF NOT EXISTS "contabilizar" BOOLEAN NOT NULL DEFAULT true;
