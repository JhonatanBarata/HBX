-- FISCAL DO TENANT F1a (PR04082026-FISCAL-TENANT) — emissão de NFS-e do tenant
-- direto na API nacional (Sefin). ADITIVO PURO: 4 tabelas novas, NÃO toca em
-- nenhuma tabela existente. Certificado A1 vive CRIPTOGRAFADO (envelope JSON no
-- certA1Encrypted, cofre AES-256-GCM) — nada de segredo em claro aqui.

-- 1 perfil fiscal POR EMPRESA (difere do FiscalProfile singleton do contabil).
CREATE TABLE "FiscalTenantProfile" (
    "id"                 TEXT NOT NULL,
    "companyId"          INTEGER NOT NULL,
    "cnpj"               TEXT,
    "razaoSocial"        TEXT,
    "inscricaoMunicipal" TEXT,
    "regimeCrt"          INTEGER NOT NULL DEFAULT 1,
    "municipioIbge"      TEXT,
    "ambiente"           TEXT NOT NULL DEFAULT 'restrita',
    "certA1Encrypted"    TEXT,
    "certA1ExpiresAt"    TIMESTAMP(3),
    "serieDps"           TEXT NOT NULL DEFAULT '1',
    "proximoNumeroDps"   INTEGER NOT NULL DEFAULT 1,
    "escopoServico"      BOOLEAN NOT NULL DEFAULT false,
    "escopoProduto"      BOOLEAN NOT NULL DEFAULT false,
    "emailAutoEnvio"     BOOLEAN NOT NULL DEFAULT false,
    "whatsAutoEnvio"     BOOLEAN NOT NULL DEFAULT false,
    "estoqueAtivo"       BOOLEAN NOT NULL DEFAULT false,
    "estoqueNegativo"    TEXT NOT NULL DEFAULT 'avisar',
    "errosConsecutivos"  INTEGER NOT NULL DEFAULT 0,
    "disjuntorPausado"   BOOLEAN NOT NULL DEFAULT false,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalTenantProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalTenantProfile_companyId_key" ON "FiscalTenantProfile"("companyId");

-- Catálogo de serviços do tenant (montado 1x com o contador; emissão só escolhe).
CREATE TABLE "FiscalServicoCatalogo" (
    "id"                       TEXT NOT NULL,
    "companyId"                INTEGER NOT NULL,
    "descricao"                TEXT NOT NULL,
    "codigoTributacaoNacional" TEXT NOT NULL,
    "cnae"                     TEXT NOT NULL,
    "aliquotaIss"              DOUBLE PRECISION,
    "issRetido"                BOOLEAN NOT NULL DEFAULT false,
    "ativo"                    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalServicoCatalogo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FiscalServicoCatalogo_companyId_ativo_idx" ON "FiscalServicoCatalogo"("companyId", "ativo");

-- 1 documento por emissão; originKey = idempotência dura (mesma origem nunca
-- vira 2 notas). origem já nasce com 'OS' (plugará sem reforma).
CREATE TABLE "FiscalDocumento" (
    "id"                 TEXT NOT NULL,
    "companyId"          INTEGER NOT NULL,
    "tipo"               TEXT NOT NULL,
    "origem"             TEXT NOT NULL,
    "originKey"          TEXT NOT NULL,
    "status"             TEXT NOT NULL DEFAULT 'PENDENTE',
    "tomadorDoc"         TEXT,
    "tomadorNome"        TEXT,
    "tomadorEmail"       TEXT,
    "servicoId"          TEXT,
    "descricao"          TEXT,
    "valorCents"         INTEGER NOT NULL,
    "competencia"        TEXT NOT NULL,
    "emissorRota"        TEXT NOT NULL DEFAULT 'NACIONAL_DIRETO',
    "ambiente"           TEXT,
    "serie"              TEXT,
    "numero"             INTEGER,
    "chaveAcesso"        TEXT,
    "xmlGzB64"           TEXT,
    "erroMsg"            TEXT,
    "tentativas"         INTEGER NOT NULL DEFAULT 0,
    "emitidaEm"          TIMESTAMP(3),
    "canceladaEm"        TIMESTAMP(3),
    "motivoCancelamento" TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalDocumento_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalDocumento_originKey_key" ON "FiscalDocumento"("originKey");
CREATE UNIQUE INDEX "FiscalDocumento_chaveAcesso_key" ON "FiscalDocumento"("chaveAcesso");
CREATE INDEX "FiscalDocumento_companyId_status_idx" ON "FiscalDocumento"("companyId", "status");
CREATE INDEX "FiscalDocumento_companyId_createdAt_idx" ON "FiscalDocumento"("companyId", "createdAt");
CREATE INDEX "FiscalDocumento_companyId_competencia_idx" ON "FiscalDocumento"("companyId", "competencia");

-- GLOBAL: allowlist de municípios homologados (rollout por cidade = governança).
CREATE TABLE "FiscalMunicipio" (
    "id"        TEXT NOT NULL,
    "ibge"      TEXT NOT NULL,
    "nome"      TEXT NOT NULL,
    "uf"        TEXT NOT NULL,
    "rotaNfse"  TEXT NOT NULL DEFAULT 'NACIONAL_DIRETO',
    "status"    TEXT NOT NULL DEFAULT 'EM_VALIDACAO',
    "obs"       TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalMunicipio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FiscalMunicipio_ibge_key" ON "FiscalMunicipio"("ibge");
