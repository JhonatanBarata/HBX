-- PR18072026 W1 (18/07) — schema aditivo do pacote "App entregador: entregar
-- pro cliente". Tudo nullable/com default seguro: nenhuma linha existente muda
-- de comportamento, boot em prod não depende de nenhuma coluna nova.
--
-- CustomerProfile.observacoes  VARCHAR(500), nullable — observação livre do
--   vendedor/entregador sobre o cliente ("deixa na portaria"...). Exposta em
--   listRota (cliente.observacoes), lista/detalhe de clientes e dia-preview.
--
-- LogisticaConfig.cobrancaSimples  BOOLEAN NOT NULL DEFAULT false — reservado
--   para a UI simplificar a folha de chegada quando o dono ligar.
--
-- LogisticaRotaModelo  (nova tabela) — roteiro salvo (nome + dia da semana +
--   paradas em ordem, JSONB). Aplicar o modelo é 100% client-side (o app manda
--   `ordemManual`); esta tabela só guarda o molde.
--
-- LogisticaRouteStop.billingExempt  BOOLEAN NOT NULL DEFAULT false — coluna da
--   frente de BILLING (W2/Opus); migration é do W1 só para não conflitar no
--   schema.prisma. logistica-route-billing.service.ts NÃO é tocado aqui.

ALTER TABLE "CustomerProfile" ADD COLUMN "observacoes" VARCHAR(500);

ALTER TABLE "LogisticaConfig" ADD COLUMN "cobrancaSimples" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LogisticaRouteStop" ADD COLUMN "billingExempt" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LogisticaRotaModelo" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "nome" VARCHAR(80) NOT NULL,
  "diaSemana" INTEGER,
  "paradasJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaRotaModelo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogisticaRotaModelo_companyId_idx" ON "LogisticaRotaModelo"("companyId");

ALTER TABLE "LogisticaRotaModelo"
  ADD CONSTRAINT "LogisticaRotaModelo_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
