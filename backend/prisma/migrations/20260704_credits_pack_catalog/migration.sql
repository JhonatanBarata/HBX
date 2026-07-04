-- CRÉDITOS S3-PARTE1 (docs/PLANEJAMENTOS/CREDITOS/S3-PARTE1-RESULTADO.md) — overlay editável
-- dos pacotes de recarga de crédito + config global de expiração default.
-- ADITIVO E NÃO-DESTRUTIVO: cria APENAS 2 tabelas novas (CreditPackConfig, CreditGlobalConfig).
-- NÃO altera/dropa nenhuma coluna, tabela ou índice existente. Segue atrás de
-- HBX_CREDITS_ENABLED (default OFF) — sem enforcement neste sprint (S2/S4 fora de escopo).

CREATE TABLE "CreditPackConfig" (
    "packKey"    TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditPackConfig_pkey" PRIMARY KEY ("packKey")
);

CREATE TABLE "CreditGlobalConfig" (
    "key"               TEXT NOT NULL DEFAULT 'default',
    "defaultExpiryDays" INTEGER NOT NULL DEFAULT 90,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditGlobalConfig_pkey" PRIMARY KEY ("key")
);
