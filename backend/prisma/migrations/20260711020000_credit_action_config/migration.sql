-- PR11072026 W1 (docs/PLANEJAMENTOS/PR11072026/01-OVERLAY-CATALOGO-ACOES.md) — overlay
-- editável do catálogo de AÇÕES de crédito (credit-action-catalog.ts).
-- ADITIVO E NÃO-DESTRUTIVO: cria APENAS 1 tabela nova (CreditActionConfig). NÃO altera/
-- dropa nenhuma coluna, tabela ou índice existente. Segue atrás de HBX_CREDITS_ENABLED
-- (default OFF) — endpoints master respondem 404 com a flag desligada.

CREATE TABLE "CreditActionConfig" (
    "id"         SERIAL NOT NULL,
    "actionKey"  TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditActionConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditActionConfig_actionKey_key" ON "CreditActionConfig"("actionKey");
