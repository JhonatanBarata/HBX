-- F4 (27/07, PR27072026-ROTA-3-NIVEIS) — MÁQUINA DE ENGOLIR LISTA PODRE: quarentena
-- obrigatória de importação de clientes de logística. 2 tabelas NOVAS, migration
-- 100% ADITIVA — nenhuma coluna tocada em tabela existente, nenhum dado migrado.
-- Ver o comentário do model em schema.prisma pro porquê (empresa 41, lista podre
-- direto na base viva — a operação travou 2 semanas).

CREATE TABLE "LogisticaImportacaoLote" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "origem" VARCHAR(20) NOT NULL,
  "nomeArquivo" TEXT,
  "cidadePadrao" TEXT,
  "ufPadrao" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'RASCUNHO',
  "totalItens" INTEGER NOT NULL DEFAULT 0,
  "totalVerdes" INTEGER NOT NULL DEFAULT 0,
  "totalVermelhos" INTEGER NOT NULL DEFAULT 0,
  "totalPendentes" INTEGER NOT NULL DEFAULT 0,
  "totalEfetivados" INTEGER NOT NULL DEFAULT 0,
  "criadoPorUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaImportacaoLote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticaImportacaoLote_id_companyId_key"
  ON "LogisticaImportacaoLote"("id", "companyId");
CREATE INDEX "LogisticaImportacaoLote_companyId_status_createdAt_idx"
  ON "LogisticaImportacaoLote"("companyId", "status", "createdAt");

CREATE TABLE "LogisticaImportacaoItem" (
  "id" TEXT NOT NULL,
  "companyId" INTEGER NOT NULL,
  "loteId" TEXT NOT NULL,
  "linha" INTEGER NOT NULL,
  "bruto" TEXT NOT NULL,
  "nome" TEXT,
  "telefone" TEXT,
  "endereco" TEXT,
  "numero" TEXT,
  "bairro" TEXT,
  "cidade" TEXT,
  "uf" TEXT,
  "cep" TEXT,
  "diasSemana" TEXT,
  "produtoTexto" TEXT,
  "produtoId" INTEGER,
  "qtd" INTEGER,
  "valorUnit" DOUBLE PRECISION,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "geoFonte" TEXT,
  "statusSanitizacao" VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
  "motivoProblema" VARCHAR(200),
  "customerProfileId" TEXT,
  "efetivadoAt" TIMESTAMP(3),
  "fotoOriginalFilename" TEXT,
  "fotoStoredFilename" TEXT,
  "fotoStoragePath" TEXT,
  "fotoContentType" TEXT,
  "fotoByteSize" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LogisticaImportacaoItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LogisticaImportacaoItem_loteId_linha_key"
  ON "LogisticaImportacaoItem"("loteId", "linha");
CREATE INDEX "LogisticaImportacaoItem_companyId_loteId_statusSanitizacao_idx"
  ON "LogisticaImportacaoItem"("companyId", "loteId", "statusSanitizacao");
CREATE INDEX "LogisticaImportacaoItem_companyId_customerProfileId_idx"
  ON "LogisticaImportacaoItem"("companyId", "customerProfileId");

ALTER TABLE "LogisticaImportacaoLote"
  ADD CONSTRAINT "LogisticaImportacaoLote_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- companyId sem FK dura (mesmo padrão de LogisticaAgendaEvento): o item é o RASTRO
-- de um lote/cliente, não pode travar exclusão de conta nem arrastar histórico.
ALTER TABLE "LogisticaImportacaoItem"
  ADD CONSTRAINT "LogisticaImportacaoItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LogisticaImportacaoItem_loteId_companyId_fkey"
  FOREIGN KEY ("loteId", "companyId") REFERENCES "LogisticaImportacaoLote"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
