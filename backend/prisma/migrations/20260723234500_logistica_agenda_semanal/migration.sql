-- AGENDA-SEMANAL (23/07) — fundação aditiva e reversível.
--
-- Nada abaixo remove/renomeia campos legados. ClienteProduto continua como
-- acordo comercial; LogisticaRotaModelo.paradasJson continua como espelho de
-- compatibilidade; Entrega/EntregaItem existentes não recebem backfill nem são
-- reescritos. Os novos snapshots são todos nullable.

ALTER TABLE "LocalEntrega"
  ADD COLUMN "acessoTipo" VARCHAR(20),
  ADD COLUMN "acessoAndares" INTEGER,
  ADD COLUMN "acessoTemElevador" BOOLEAN,
  ADD COLUMN "acessoObservacao" VARCHAR(240);

ALTER TABLE "LogisticaConfig"
  ADD COLUMN "agendaV2Ativa" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "CustomerProfile_id_companyId_key"
  ON "CustomerProfile"("id", "companyId");
CREATE UNIQUE INDEX "LocalEntrega_id_companyId_key"
  ON "LocalEntrega"("id", "companyId");
CREATE UNIQUE INDEX "Product_id_companyId_key"
  ON "Product"("id", "companyId");

ALTER TABLE "LogisticaRotaModelo"
  ADD COLUMN "tipo" VARCHAR(20) NOT NULL DEFAULT 'LIVRE',
  ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "LogisticaRotaModelo_id_companyId_key"
  ON "LogisticaRotaModelo"("id", "companyId");
CREATE INDEX "LogisticaRotaModelo_companyId_tipo_diaSemana_ativo_idx"
  ON "LogisticaRotaModelo"("companyId", "tipo", "diaSemana", "ativo");

ALTER TABLE "Entrega"
  ADD COLUMN "agendaOcorrenciaKey" VARCHAR(160),
  ADD COLUMN "planoEntregaId" TEXT,
  ADD COLUMN "planoEntregaRevisao" INTEGER,
  ADD COLUMN "rotaModeloId" TEXT,
  ADD COLUMN "rotaModeloVersao" INTEGER,
  ADD COLUMN "janelaInicioSnapshot" VARCHAR(5),
  ADD COLUMN "janelaFimSnapshot" VARCHAR(5),
  ADD COLUMN "janelaTipoSnapshot" VARCHAR(20),
  ADD COLUMN "tempoParadaMinSnapshot" INTEGER,
  ADD COLUMN "instrucoesSnapshot" VARCHAR(500),
  ADD COLUMN "acessoTipoSnapshot" VARCHAR(20),
  ADD COLUMN "acessoAndaresSnapshot" INTEGER,
  ADD COLUMN "acessoTemElevadorSnapshot" BOOLEAN,
  ADD COLUMN "acessoObservacaoSnapshot" VARCHAR(240),
  ADD COLUMN "adicionalTipoSnapshot" VARCHAR(20),
  ADD COLUMN "adicionalValorSnapshot" DOUBLE PRECISION,
  ADD COLUMN "adicionalMotivoSnapshot" VARCHAR(120);

CREATE INDEX "Entrega_companyId_planoEntregaId_scheduledAt_idx"
  ON "Entrega"("companyId", "planoEntregaId", "scheduledAt");
CREATE INDEX "Entrega_companyId_rotaModeloId_scheduledAt_idx"
  ON "Entrega"("companyId", "rotaModeloId", "scheduledAt");
CREATE UNIQUE INDEX "Entrega_companyId_agendaOcorrenciaKey_key"
  ON "Entrega"("companyId", "agendaOcorrenciaKey");

CREATE TABLE "LogisticaPlanoEntrega" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "customerProfileId" TEXT NOT NULL,
  "localId" TEXT,
  "diaSemana" INTEGER NOT NULL,
  "frequencia" VARCHAR(20) NOT NULL DEFAULT 'SEMANAL',
  "intervaloDias" INTEGER,
  "proximaData" TIMESTAMP(3),
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "revisao" INTEGER NOT NULL DEFAULT 1,
  "origem" VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
  "legadoChave" VARCHAR(200),
  "janelaInicio" VARCHAR(5),
  "janelaFim" VARCHAR(5),
  "janelaTipo" VARCHAR(20),
  "tempoParadaMin" INTEGER,
  "instrucoes" VARCHAR(500),
  "acessoTipo" VARCHAR(20),
  "acessoAndares" INTEGER,
  "acessoTemElevador" BOOLEAN,
  "acessoObservacao" VARCHAR(240),
  "adicionalTipo" VARCHAR(20),
  "adicionalValor" DOUBLE PRECISION,
  "adicionalMotivo" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaPlanoEntrega_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticaPlanoEntrega_id_companyId_key"
  ON "LogisticaPlanoEntrega"("id", "companyId");
CREATE UNIQUE INDEX "LogisticaPlanoEntrega_companyId_legadoChave_key"
  ON "LogisticaPlanoEntrega"("companyId", "legadoChave");
CREATE INDEX "LogisticaPlanoEntrega_companyId_diaSemana_ativo_idx"
  ON "LogisticaPlanoEntrega"("companyId", "diaSemana", "ativo");
CREATE INDEX "LogisticaPlanoEntrega_companyId_customerProfileId_ativo_idx"
  ON "LogisticaPlanoEntrega"("companyId", "customerProfileId", "ativo");
CREATE INDEX "LogisticaPlanoEntrega_companyId_localId_idx"
  ON "LogisticaPlanoEntrega"("companyId", "localId");

CREATE TABLE "LogisticaPlanoEntregaItem" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "planoEntregaId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "qtd" INTEGER NOT NULL DEFAULT 1,
  "valorUnit" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaPlanoEntregaItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogisticaPlanoEntregaItem_planoEntregaId_productId_idx"
  ON "LogisticaPlanoEntregaItem"("planoEntregaId", "productId");
CREATE INDEX "LogisticaPlanoEntregaItem_companyId_planoEntregaId_idx"
  ON "LogisticaPlanoEntregaItem"("companyId", "planoEntregaId");
CREATE INDEX "LogisticaPlanoEntregaItem_companyId_productId_idx"
  ON "LogisticaPlanoEntregaItem"("companyId", "productId");

CREATE TABLE "LogisticaRotaModeloParada" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "rotaModeloId" TEXT NOT NULL,
  "planoEntregaId" TEXT,
  "customerProfileId" TEXT,
  "localId" TEXT,
  "ordem" INTEGER NOT NULL,
  "ordemTravada" BOOLEAN NOT NULL DEFAULT true,
  "janelaInicio" VARCHAR(5),
  "janelaFim" VARCHAR(5),
  "janelaTipo" VARCHAR(20),
  "tempoParadaMin" INTEGER,
  "instrucoes" VARCHAR(500),
  "acessoTipo" VARCHAR(20),
  "acessoAndares" INTEGER,
  "acessoTemElevador" BOOLEAN,
  "acessoObservacao" VARCHAR(240),
  "adicionalTipo" VARCHAR(20),
  "adicionalValor" DOUBLE PRECISION,
  "adicionalMotivo" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaRotaModeloParada_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticaRotaModeloParada_id_companyId_key"
  ON "LogisticaRotaModeloParada"("id", "companyId");
CREATE UNIQUE INDEX "LogisticaRotaModeloParada_rotaModeloId_ordem_key"
  ON "LogisticaRotaModeloParada"("rotaModeloId", "ordem");
CREATE UNIQUE INDEX "LogisticaRotaModeloParada_rotaModeloId_planoEntregaId_key"
  ON "LogisticaRotaModeloParada"("rotaModeloId", "planoEntregaId");
CREATE INDEX "LogisticaRotaModeloParada_companyId_rotaModeloId_ordem_idx"
  ON "LogisticaRotaModeloParada"("companyId", "rotaModeloId", "ordem");
CREATE INDEX "LogisticaRotaModeloParada_companyId_planoEntregaId_idx"
  ON "LogisticaRotaModeloParada"("companyId", "planoEntregaId");

CREATE TABLE "LogisticaRotaModeloParadaItem" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "paradaId" TEXT NOT NULL,
  "productId" INTEGER,
  "produtoNomeSnapshot" VARCHAR(140) NOT NULL,
  "qtd" INTEGER NOT NULL,
  "valorUnit" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaRotaModeloParadaItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogisticaRotaModeloParadaItem_companyId_paradaId_idx"
  ON "LogisticaRotaModeloParadaItem"("companyId", "paradaId");
CREATE INDEX "LogisticaRotaModeloParadaItem_companyId_productId_idx"
  ON "LogisticaRotaModeloParadaItem"("companyId", "productId");

CREATE TABLE "LogisticaAgendaAcao" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "idempotencyKey" VARCHAR(100) NOT NULL,
  "requestHash" VARCHAR(64) NOT NULL,
  "acao" VARCHAR(20) NOT NULL,
  "diaOrigem" INTEGER NOT NULL,
  "diaDestino" INTEGER,
  "dataInicio" TIMESTAMP(3) NOT NULL,
  "entregasAbertas" VARCHAR(20) NOT NULL,
  "executadoPorUserId" INTEGER,
  "resultadoJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LogisticaAgendaAcao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticaAgendaAcao_companyId_idempotencyKey_key"
  ON "LogisticaAgendaAcao"("companyId", "idempotencyKey");
CREATE INDEX "LogisticaAgendaAcao_companyId_createdAt_idx"
  ON "LogisticaAgendaAcao"("companyId", "createdAt");
CREATE INDEX "LogisticaAgendaAcao_companyId_diaOrigem_createdAt_idx"
  ON "LogisticaAgendaAcao"("companyId", "diaOrigem", "createdAt");

ALTER TABLE "LogisticaPlanoEntrega"
  ADD CONSTRAINT "LogisticaPlanoEntrega_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaPlanoEntrega_customerProfileId_companyId_fkey"
  FOREIGN KEY ("customerProfileId", "companyId") REFERENCES "CustomerProfile"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaPlanoEntrega_localId_companyId_fkey"
  FOREIGN KEY ("localId", "companyId") REFERENCES "LocalEntrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticaPlanoEntregaItem"
  ADD CONSTRAINT "LogisticaPlanoEntregaItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaPlanoEntregaItem_planoEntregaId_companyId_fkey"
  FOREIGN KEY ("planoEntregaId", "companyId") REFERENCES "LogisticaPlanoEntrega"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaPlanoEntregaItem_productId_companyId_fkey"
  FOREIGN KEY ("productId", "companyId") REFERENCES "Product"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticaRotaModeloParada"
  ADD CONSTRAINT "LogisticaRotaModeloParada_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaRotaModeloParada_rotaModeloId_companyId_fkey"
  FOREIGN KEY ("rotaModeloId", "companyId") REFERENCES "LogisticaRotaModelo"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaRotaModeloParada_planoEntregaId_companyId_fkey"
  FOREIGN KEY ("planoEntregaId", "companyId") REFERENCES "LogisticaPlanoEntrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaRotaModeloParada_customerProfileId_companyId_fkey"
  FOREIGN KEY ("customerProfileId", "companyId") REFERENCES "CustomerProfile"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaRotaModeloParada_localId_companyId_fkey"
  FOREIGN KEY ("localId", "companyId") REFERENCES "LocalEntrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticaRotaModeloParadaItem"
  ADD CONSTRAINT "LogisticaRotaModeloParadaItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaRotaModeloParadaItem_paradaId_companyId_fkey"
  FOREIGN KEY ("paradaId", "companyId") REFERENCES "LogisticaRotaModeloParada"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaRotaModeloParadaItem_productId_companyId_fkey"
  FOREIGN KEY ("productId", "companyId") REFERENCES "Product"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LogisticaAgendaAcao"
  ADD CONSTRAINT "LogisticaAgendaAcao_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaAgendaAcao_executadoPorUserId_companyId_fkey"
  FOREIGN KEY ("executadoPorUserId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Entrega"
  ADD CONSTRAINT "Entrega_planoEntregaId_companyId_fkey"
  FOREIGN KEY ("planoEntregaId", "companyId") REFERENCES "LogisticaPlanoEntrega"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Entrega_rotaModeloId_companyId_fkey"
  FOREIGN KEY ("rotaModeloId", "companyId") REFERENCES "LogisticaRotaModelo"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
