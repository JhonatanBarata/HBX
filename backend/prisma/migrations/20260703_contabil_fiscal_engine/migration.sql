-- CONTABIL S1 — motor fiscal (contador-robô do dono, /master).
-- Aditivo: apenas 2 modelos novos (prefixo Fiscal*). NÃO toca em nenhuma tabela
-- existente e NÃO altera fluxo de pagamento — o Contabil só LÊ a receita.

-- FiscalProfile: singleton do dono (1 linha, id fixo = 1).
CREATE TABLE "FiscalProfile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "cnpj" TEXT,
    "razaoSocial" TEXT,
    "dataAbertura" TIMESTAMP(3),
    "regime" TEXT NOT NULL DEFAULT 'simples',
    "anexoBase" TEXT NOT NULL DEFAULT 'V',
    "cnaePrincipal" TEXT NOT NULL DEFAULT '6203-1/00',
    "aliquotaIssMunicipal" DOUBLE PRECISION,
    "prolaboreAlvoPct" DOUBLE PRECISION NOT NULL DEFAULT 0.28,
    "certA1Encrypted" TEXT,
    "certA1ExpiresAt" TIMESTAMP(3),
    "serproCredEncrypted" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalProfile_pkey" PRIMARY KEY ("id")
);

-- FiscalRevenueMonth: consolidação mensal por competência ('YYYY-MM').
-- Dinheiro em CENTS (INTEGER). Float só em percentuais (fatorR, aliquotaEfetiva).
CREATE TABLE "FiscalRevenueMonth" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "receitaCaixaCents" INTEGER NOT NULL DEFAULT 0,
    "receitaNotasCents" INTEGER NOT NULL DEFAULT 0,
    "ajusteManualCents" INTEGER NOT NULL DEFAULT 0,
    "ajusteMotivo" TEXT,
    "folhaMesCents" INTEGER NOT NULL DEFAULT 0,
    "rbt12Cents" INTEGER NOT NULL DEFAULT 0,
    "folha12mCents" INTEGER NOT NULL DEFAULT 0,
    "fatorR" DOUBLE PRECISION,
    "anexoAplicado" TEXT,
    "aliquotaEfetiva" DOUBLE PRECISION,
    "dasPrevistoCents" INTEGER,
    "inssPrevistoCents" INTEGER,
    "irrfPrevistoCents" INTEGER,
    "fechadoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalRevenueMonth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalRevenueMonth_competencia_key" ON "FiscalRevenueMonth"("competencia");
