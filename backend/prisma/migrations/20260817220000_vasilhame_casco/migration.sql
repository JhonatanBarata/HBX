-- VASILHAME / CASCO (17/08/2026) — controle da embalagem que vai emprestada e volta
-- (garrafão 20L, botijão de gás, engradado de cerveja).
--
-- 100% ADITIVO E NÃO-DESTRUTIVO:
--   - 2 colunas novas em "Product", ambas com default/nulo que preservam o legado.
--     Com "possuiVasilhame" = false (padrão) NADA muda em nenhuma tela de nenhum
--     tenant — quem não trabalha com casco não vê o assunto existir.
--   - 2 tabelas novas ("VasilhameSaldo" = quanto cada cliente está com você,
--     "VasilhameMovimento" = o extrato append-only que explica o saldo).
-- NÃO altera, NÃO dropa e NÃO renomeia nada existente.
-- "IF NOT EXISTS" em tudo (padrão dos aditivos do repo, migration idempotente).

-- ── 1. Catálogo: o produto passa a poder ter casco ──────────────────────────
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "possuiVasilhame"     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "vasilhamePrecoCents" INTEGER;

-- ── 2. Saldo por (empresa, conta do cliente, produto) ───────────────────────
-- O saldo é da CONTA (CustomerProfile), não do vínculo ClienteProduto: o mesmo
-- produto pode ter N vínculos no mesmo cliente (galão na segunda + galão na
-- sexta), e saldo por vínculo contaria o mesmo garrafão duas vezes.
CREATE TABLE IF NOT EXISTS "VasilhameSaldo" (
  "id"                TEXT         NOT NULL,
  "companyId"         INTEGER      NOT NULL,
  "customerProfileId" TEXT         NOT NULL,
  "productId"         INTEGER      NOT NULL,
  "qtd"               INTEGER      NOT NULL DEFAULT 0,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VasilhameSaldo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VasilhameSaldo_companyId_customerProfileId_productId_key"
  ON "VasilhameSaldo" ("companyId", "customerProfileId", "productId");
CREATE INDEX IF NOT EXISTS "VasilhameSaldo_companyId_customerProfileId_idx"
  ON "VasilhameSaldo" ("companyId", "customerProfileId");
CREATE INDEX IF NOT EXISTS "VasilhameSaldo_companyId_productId_idx"
  ON "VasilhameSaldo" ("companyId", "productId");

-- ── 3. Extrato append-only ──────────────────────────────────────────────────
-- Saldo sem história é briga sem prova ("eu já devolvi"). "userId" e "entregaId"
-- são escalares SOLTOS de propósito: apagar um funcionário ou uma entrega não pode
-- apagar nem anular em cascata o histórico patrimonial da empresa.
CREATE TABLE IF NOT EXISTS "VasilhameMovimento" (
  "id"                TEXT         NOT NULL,
  "companyId"         INTEGER      NOT NULL,
  "customerProfileId" TEXT         NOT NULL,
  "productId"         INTEGER      NOT NULL,
  "tipo"              VARCHAR(16)  NOT NULL,
  "qtd"               INTEGER      NOT NULL,
  "saldoDepois"       INTEGER      NOT NULL,
  "motivo"            VARCHAR(240),
  "userId"            INTEGER,
  "entregaId"         TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VasilhameMovimento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VasilhameMovimento_companyId_customerProfileId_createdAt_idx"
  ON "VasilhameMovimento" ("companyId", "customerProfileId", "createdAt");
CREATE INDEX IF NOT EXISTS "VasilhameMovimento_companyId_productId_createdAt_idx"
  ON "VasilhameMovimento" ("companyId", "productId", "createdAt");
CREATE INDEX IF NOT EXISTS "VasilhameMovimento_companyId_entregaId_idx"
  ON "VasilhameMovimento" ("companyId", "entregaId");

-- ── 4. FKs (mesma convenção de ClienteProduto: Cascade em empresa/cliente/produto) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VasilhameSaldo_companyId_fkey') THEN
    ALTER TABLE "VasilhameSaldo" ADD CONSTRAINT "VasilhameSaldo_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VasilhameSaldo_customerProfileId_fkey') THEN
    ALTER TABLE "VasilhameSaldo" ADD CONSTRAINT "VasilhameSaldo_customerProfileId_fkey"
      FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VasilhameSaldo_productId_fkey') THEN
    ALTER TABLE "VasilhameSaldo" ADD CONSTRAINT "VasilhameSaldo_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VasilhameMovimento_companyId_fkey') THEN
    ALTER TABLE "VasilhameMovimento" ADD CONSTRAINT "VasilhameMovimento_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VasilhameMovimento_customerProfileId_fkey') THEN
    ALTER TABLE "VasilhameMovimento" ADD CONSTRAINT "VasilhameMovimento_customerProfileId_fkey"
      FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'VasilhameMovimento_productId_fkey') THEN
    ALTER TABLE "VasilhameMovimento" ADD CONSTRAINT "VasilhameMovimento_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
