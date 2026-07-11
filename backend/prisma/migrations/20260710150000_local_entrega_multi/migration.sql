-- MULTILOCAL (10/07, docs/PLANEJAMENTOS/MULTILOCAL-10072026/CONTRATOS.md) — 1 CONTA
-- (CustomerProfile) recebe em N endereços e é cobrada 1 vez só. A cobrança segue da
-- CONTA (FinanceiroCharge.customerProfileId) — NADA de cobrança/saldo muda aqui. Multi-
-- local é só ONDE se entrega.
--
-- 100% ADITIVO E NÃO-DESTRUTIVO: cria 1 tabela nova "LocalEntrega" (2 índices + 2 FKs)
-- e adiciona 1 coluna OPCIONAL "localId" em "Entrega" e "ClienteProduto" (1 FK cada,
-- ON DELETE SET NULL — apagar o local NÃO apaga a entrega/vínculo). NÃO altera/dropa
-- nenhuma coluna, tabela ou índice existente. Usa "IF NOT EXISTS" nos aditivos (padrão
-- do repo). A migration roda UMA vez (tracking do Prisma). NÃO aplicar em banco vivo por
-- este worker — o dono aplica no deploy do VPS.

-- 1) LocalEntrega = um endereço de entrega da CONTA (tabela nova)
CREATE TABLE IF NOT EXISTS "LocalEntrega" (
    "id"                TEXT NOT NULL,
    "companyId"         INTEGER NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "apelido"           TEXT,
    "endereco"          TEXT,
    "numero"            TEXT,
    "bairro"            TEXT,
    "cidade"            TEXT,
    "uf"                TEXT,
    "cep"               TEXT,
    "lat"               DOUBLE PRECISION,
    "lng"               DOUBLE PRECISION,
    "geoFonte"          TEXT,
    "isPrincipal"       BOOLEAN NOT NULL DEFAULT false,
    "ativo"             BOOLEAN NOT NULL DEFAULT true,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocalEntrega_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "LocalEntrega_companyId_customerProfileId_idx"             ON "LocalEntrega"("companyId", "customerProfileId");
CREATE INDEX IF NOT EXISTS "LocalEntrega_companyId_customerProfileId_isPrincipal_idx" ON "LocalEntrega"("companyId", "customerProfileId", "isPrincipal");

-- 2) Entrega e ClienteProduto ganham "localId" opcional (ONDE entrega; null = perfil/legado)
ALTER TABLE "Entrega"        ADD COLUMN IF NOT EXISTS "localId" TEXT;
ALTER TABLE "ClienteProduto" ADD COLUMN IF NOT EXISTS "localId" TEXT;

-- 3) FKs — LocalEntrega pertence à company + conta (CASCADE); as colunas localId de
--    Entrega/ClienteProduto usam SET NULL (apagar o local não apaga a entrega/vínculo).
ALTER TABLE "LocalEntrega"   ADD CONSTRAINT "LocalEntrega_companyId_fkey"         FOREIGN KEY ("companyId")         REFERENCES "Company"("id")         ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "LocalEntrega"   ADD CONSTRAINT "LocalEntrega_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "CustomerProfile"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "Entrega"        ADD CONSTRAINT "Entrega_localId_fkey"                FOREIGN KEY ("localId")           REFERENCES "LocalEntrega"("id")    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClienteProduto" ADD CONSTRAINT "ClienteProduto_localId_fkey"         FOREIGN KEY ("localId")           REFERENCES "LocalEntrega"("id")    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) BACKFILL (Postgres 13+, gen_random_uuid()::text p/ id — misturar com cuid é ok,
--    ambos são texto único). Materializa 1 local PRINCIPAL por cliente que já tem
--    endereço/geo no perfil; depois liga os vínculos/entregas ao local principal do
--    próprio cliente. Cliente com 1 local (todos após backfill) = comportamento idêntico.

-- 1 local principal por cliente que já tem endereço/geo
INSERT INTO "LocalEntrega" (id,"companyId","customerProfileId",apelido,endereco,numero,bairro,cidade,uf,cep,lat,lng,"geoFonte","isPrincipal",ativo,"createdAt","updatedAt")
SELECT gen_random_uuid()::text,"companyId",id,NULL,endereco,numero,bairro,cidade,uf,cep,lat,lng,"geoFonte",true,true,now(),now()
FROM "CustomerProfile" WHERE "isCliente"=true AND (endereco IS NOT NULL OR lat IS NOT NULL);
-- vínculos e entregas apontam pro local principal do próprio cliente
UPDATE "ClienteProduto" cp SET "localId"=le.id FROM "LocalEntrega" le
  WHERE le."customerProfileId"=cp."customerProfileId" AND le."isPrincipal"=true AND cp."localId" IS NULL;
UPDATE "Entrega" e SET "localId"=le.id FROM "LocalEntrega" le
  WHERE le."customerProfileId"=e."customerProfileId" AND le."isPrincipal"=true AND e."localId" IS NULL;
