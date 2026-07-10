-- MASTER-REFAB S6 (docs/PLANEJAMENTOS/MASTER-REFAB/PLANO.md, 10/07 noite — ordem literal do
-- dono: "não vai existir mais contas cortesias... só vão ter 2 tipos: conta crédito ou conta
-- empresarial"). ADITIVA E NÃO-DESTRUTIVA: só adiciona 1 coluna nova + 1 backfill idempotente;
-- nenhuma coluna/linha existente é removida (courtesyEndsAt/courtesyReason/status ficam, viram
-- só leitura pra conta credit — ver company-access-state.ts).
--
-- Company.accountType TEXT NOT NULL DEFAULT 'credit' ('credit' | 'enterprise'):
--   * 'credit'     — self-service, ativa por default, teto real é o saldo de crédito.
--   * 'enterprise' — exceção montada pelo master na ficha (cobrança manual/assinatura MP,
--                    módulos e crédito concedidos manualmente).
--
-- Backfill (mesmo critério que a ficha master já usa pra derivar "Modo: Negociada" desde o S1,
-- ver frontend/src/app/(app)/master/janela-empresas.tsx::modoConta — só torna EXPLÍCITO o que
-- já era lido em runtime):
--   cobrança manual ATIVA  → paymentMethod = 'MANUAL' (maiúsculo, é enum de valor fixo)
--   OU assinatura MP ATIVA → billingProvider = 'mercadopago' (minúsculo, idem)
--   OU platform_infra      → companyKind = 'platform_infra' (tenant técnico, não é self-service)
-- Todo o resto (inclui toda empresa 'courtesy'/'trial'/'pending_checkout' sem cobrança manual/MP
-- configurada — a maioria dos tenants grátis de hoje) fica no DEFAULT 'credit' da coluna, sem
-- UPDATE nenhum. Idempotente: rodar de novo produz o mesmo resultado (WHERE não usa relatividade).

ALTER TABLE "Company" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'credit';

UPDATE "Company"
SET "accountType" = 'enterprise'
WHERE "paymentMethod" = 'MANUAL'
   OR "billingProvider" = 'mercadopago'
   OR "companyKind" = 'platform_infra';
