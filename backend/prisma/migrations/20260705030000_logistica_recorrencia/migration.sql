-- LOGÍSTICA-MOBILE M2 (05/07) — amarração PRODUTO×CLIENTE + recorrência.
-- 100% ADITIVO E NÃO-DESTRUTIVO. Adiciona:
--   1) 7 colunas OPCIONAIS na "Entrega" (rota/ETA/desfecho/idempotência) — todas
--      nullable, defaults preservam o comportamento do N6.
--   2) 3 tabelas novas: "ClienteProduto" (vínculo produto×cliente + recorrência),
--      "EntregaItem" (item da entrega, multi-produto) e "LogisticaConfig" (config
--      por empresa).
-- NÃO altera/dropa nenhuma coluna, tabela ou índice existente. Usa "IF NOT EXISTS"
-- p/ idempotência (padrão dos aditivos do repo). NÃO aplicar em banco vivo por
-- este worker (Postgres pode estar down; a aplicação é passo separado do dono).

-- 1) Entrega ganha colunas ADITIVAS (rota/ETA/desfecho/offline)
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "rotaOrdem"       INTEGER;
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "etaAt"           TIMESTAMP(3);
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "whatsappStatus"  TEXT;
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "cobrancaOutcome" TEXT;
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "recebidoNaHora"  BOOLEAN;
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "receiptMethod"   TEXT;
ALTER TABLE "Entrega" ADD COLUMN IF NOT EXISTS "idempotencyKey"  TEXT;

-- idempotencyKey é @unique (base do offline-first M8). Índice único parcial p/
-- não colidir entre linhas NULL (várias entregas sem chave convivem).
CREATE UNIQUE INDEX IF NOT EXISTS "Entrega_idempotencyKey_key"
  ON "Entrega"("idempotencyKey") WHERE "idempotencyKey" IS NOT NULL;

-- Índice p/ a varredura "entregas do dia" idempotente por [empresa, cliente, dia].
CREATE INDEX IF NOT EXISTS "Entrega_companyId_customerProfileId_scheduledAt_idx"
  ON "Entrega"("companyId", "customerProfileId", "scheduledAt");

-- 2) ClienteProduto = vínculo produto×cliente + recorrência (tabela nova)
CREATE TABLE IF NOT EXISTS "ClienteProduto" (
    "id"                TEXT NOT NULL,
    "companyId"         INTEGER NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "productId"         INTEGER NOT NULL,
    "qtdPadrao"         INTEGER NOT NULL DEFAULT 1,
    "precoAcordado"     DOUBLE PRECISION,
    "frequenciaDias"    INTEGER,
    "diasSemana"        TEXT,
    "proximaData"       TIMESTAMP(3),
    "ativo"             BOOLEAN NOT NULL DEFAULT true,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteProduto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClienteProduto_companyId_customerProfileId_productId_key"
  ON "ClienteProduto"("companyId", "customerProfileId", "productId");
CREATE INDEX IF NOT EXISTS "ClienteProduto_companyId_ativo_proximaData_idx"
  ON "ClienteProduto"("companyId", "ativo", "proximaData");
CREATE INDEX IF NOT EXISTS "ClienteProduto_companyId_customerProfileId_idx"
  ON "ClienteProduto"("companyId", "customerProfileId");
CREATE INDEX IF NOT EXISTS "ClienteProduto_companyId_productId_idx"
  ON "ClienteProduto"("companyId", "productId");

-- FKs (company + conta + produto = CASCADE: sem produto/conta, o vínculo não existe).
ALTER TABLE "ClienteProduto" ADD CONSTRAINT "ClienteProduto_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClienteProduto" ADD CONSTRAINT "ClienteProduto_customerProfileId_fkey"
  FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClienteProduto" ADD CONSTRAINT "ClienteProduto_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) EntregaItem = item de uma Entrega (multi-produto) — tabela nova
CREATE TABLE IF NOT EXISTS "EntregaItem" (
    "id"          TEXT NOT NULL,
    "entregaId"   TEXT NOT NULL,
    "productId"   INTEGER,
    "qtdPrevista" INTEGER NOT NULL DEFAULT 1,
    "qtdEntregue" INTEGER,
    "valorUnit"   DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntregaItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntregaItem_entregaId_idx" ON "EntregaItem"("entregaId");
CREATE INDEX IF NOT EXISTS "EntregaItem_productId_idx" ON "EntregaItem"("productId");

-- FKs (entrega = CASCADE: some com a entrega; product = SET NULL: item sobrevive).
ALTER TABLE "EntregaItem" ADD CONSTRAINT "EntregaItem_entregaId_fkey"
  FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntregaItem" ADD CONSTRAINT "EntregaItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) LogisticaConfig = config do módulo por empresa (1 linha/tenant) — tabela nova
CREATE TABLE IF NOT EXISTS "LogisticaConfig" (
    "id"                    TEXT NOT NULL,
    "companyId"             INTEGER NOT NULL,
    "avisoWhatsEnabled"     BOOLEAN NOT NULL DEFAULT true,
    "templateAviso"         TEXT,
    "raioChegadaM"          INTEGER NOT NULL DEFAULT 60,
    "velocidadeMediaKmH"    INTEGER NOT NULL DEFAULT 25,
    "tempoParadaMin"        INTEGER NOT NULL DEFAULT 5,
    "cobrancaNaEntrega"     BOOLEAN NOT NULL DEFAULT false,
    "moduloFinanceiroAtivo" BOOLEAN NOT NULL DEFAULT false,
    "moduloRecoveryAtivo"   BOOLEAN NOT NULL DEFAULT false,
    "gerarDiaAutomatico"    BOOLEAN NOT NULL DEFAULT false,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticaConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LogisticaConfig_companyId_key" ON "LogisticaConfig"("companyId");

ALTER TABLE "LogisticaConfig" ADD CONSTRAINT "LogisticaConfig_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
