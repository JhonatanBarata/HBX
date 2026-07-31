-- CASA DO RISCO + IDENTIDADE ÚNICA DA IA (31/07/2026 → 01/08/2026)
--
-- Refatoração casa/campanha aprovada pelo dono: risco de chip é da EMPRESA
-- (o chip é um só), nunca da busca. O teto morava em VendasAutomationCampaign:
-- duas campanhas de 12/dia rodando juntas somavam 24 no mesmo número — o teto
-- no lugar errado era um furo real, não estético. O espelho de ontem
-- (espelharJanelaNaConfigComercial) era o remendo; esta migration é a cura:
-- os campos de risco passam a existir SÓ em VendasComercialConfig e as colunas
-- da campanha MORREM (sem legado, sem espelho — espelho é a fábrica do
-- "teto tinha 3 números").
--
-- Também nasce aqui a IDENTIDADE ÚNICA da IA (uma persona por empresa,
-- consumida por Atendimento, Recovery e Prospecção — duas personalidades no
-- mesmo WhatsApp é teatro que o lead percebe) e a ENTREVISTA FORÇADA
-- (empresaFazTexto NULO = cliente não respondeu = nenhum bot liga; mesma lei
-- fail-closed do catalogoJson).
--
-- Defaults dos campos de risco = nível MÉDIO (vendas-nivel-disparo.ts).
-- O freio anti-ban por env continua sendo o teto dos tetos.

ALTER TABLE "VendasComercialConfig"
  ADD COLUMN "intervalVarianceMinutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "maxAttemptsPerLead" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "typingSeconds" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "typingVarianceSeconds" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "aiNome" TEXT,
  ADD COLUMN "aiIdentidade" TEXT NOT NULL DEFAULT 'nome_proprio',
  ADD COLUMN "aiUserId" INTEGER,
  ADD COLUMN "empresaFazTexto" TEXT;

-- Empresa que já operava campanha mas nunca teve casa: herda o ritmo da
-- campanha mais recente (não inventar número novo pra quem já rodava).
-- Quem já tem casa MANTÉM a casa — a partir daqui ela é a única verdade.
-- intervalVarianceMinutes ficava em filtersJson (TEXT sem garantia de JSON
-- válido): herda o default 15 de propósito, sem cast arriscado em migration.
INSERT INTO "VendasComercialConfig"
  ("id", "companyId", "workingHoursStart", "workingHoursEnd",
   "dailyLimitPerSender", "intervalMinutes", "maxAttemptsPerLead",
   "typingSeconds", "typingVarianceSeconds", "updatedAt")
SELECT
  'casa_' || c."companyId",
  c."companyId",
  c."workingHoursStart",
  c."workingHoursEnd",
  c."dailyLimit",
  c."intervalMinutes",
  c."maxAttemptsPerLead",
  c."typingSeconds",
  c."typingVarianceSeconds",
  NOW()
FROM (
  SELECT DISTINCT ON ("companyId") *
  FROM "VendasAutomationCampaign"
  ORDER BY "companyId", "updatedAt" DESC
) c
WHERE NOT EXISTS (
  SELECT 1 FROM "VendasComercialConfig" v WHERE v."companyId" = c."companyId"
);

-- Risco sai da campanha SEM legado. Colunas mortas mentem: enquanto existirem,
-- alguém volta a lê-las.
ALTER TABLE "VendasAutomationCampaign"
  DROP COLUMN "intervalMinutes",
  DROP COLUMN "dailyLimit",
  DROP COLUMN "maxAttemptsPerLead",
  DROP COLUMN "workingHoursStart",
  DROP COLUMN "workingHoursEnd",
  DROP COLUMN "typingSeconds",
  DROP COLUMN "typingVarianceSeconds";
