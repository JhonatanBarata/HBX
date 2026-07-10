-- GUARDRAILS S3 (docs/PLANEJAMENTOS/MASTER-REFAB/PLANO.md, 10/07) — teto diário de ENTREGAS de
-- lead por empresa, anti-scraper ("não posso deixar uma empresa drenar os 28M mesmo com saldo").
-- ADITIVA E NÃO-DESTRUTIVA: só adiciona 2 colunas novas, nenhuma existente muda.
--
--  * CreditGlobalConfig.dailyDeliveryCapDefault: teto GLOBAL default (500), aplicado a toda
--    empresa que não tem override próprio.
--  * Company.dailyDeliveryCapOverride: override POR EMPRESA (nullable — null = herda o
--    global). Semântica em runtime (commercial-usage-limits.service.ts): valor <= 0 = SEM teto.
--
-- Default 500 na coluna global preserva o comportamento hoje mesmo que o boot rode antes do
-- master configurar nada. Nenhuma linha existente precisa de backfill (DEFAULT cobre).

ALTER TABLE "Company" ADD COLUMN "dailyDeliveryCapOverride" INTEGER;

ALTER TABLE "CreditGlobalConfig" ADD COLUMN "dailyDeliveryCapDefault" INTEGER NOT NULL DEFAULT 500;
