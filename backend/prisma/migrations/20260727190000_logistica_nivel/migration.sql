-- PR27072026 F1 (27/07) — ROTA 3 NÍVEIS: nível comercial (Basic/Advanced/Full) do
-- plano de logística. Migration ADITIVA, DEFAULT 'ADVANCED' = GRANDFATHERING
-- (decisão do dono): Postgres grava o default em TODA linha já existente de uma
-- coluna NOT NULL nova no mesmo ALTER TABLE — nenhuma empresa que já usa
-- financeiro real/aviso/tracking perde recurso quando os níveis ligarem.
ALTER TABLE "LogisticaConfig" ADD COLUMN IF NOT EXISTS "logisticaNivel" VARCHAR(10) NOT NULL DEFAULT 'ADVANCED';
