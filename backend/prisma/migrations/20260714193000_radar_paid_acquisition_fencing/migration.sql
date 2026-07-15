-- Aquisição do Radar só existe quando há prova materializada do débito e o
-- worker que executa a saga possui um fencing token válido.

ALTER TABLE "RadarLeadProcessRun"
  ADD COLUMN "workerToken" TEXT,
  ADD COLUMN "workerLeaseUntil" TIMESTAMP(3);

CREATE UNIQUE INDEX "RadarLeadProcessRun_workerToken_key"
  ON "RadarLeadProcessRun"("workerToken");

ALTER TABLE "RadarLeadCompanyState"
  ADD COLUMN "paidClaimOperationId" TEXT,
  ADD COLUMN "claimUsageKey" TEXT,
  ADD COLUMN "acquiredAt" TIMESTAMP(3);

CREATE INDEX "RadarLeadCompanyState_companyId_acquiredAt_idx"
  ON "RadarLeadCompanyState"("companyId", "acquiredAt");

ALTER TABLE "VendasLead"
  ADD COLUMN "claimOperationId" TEXT,
  ADD COLUMN "contactSnapshotJson" TEXT;

-- O schema já projetava este snapshot, mas a cadeia histórica nunca criou a
-- coluna em VendasLead. O IF NOT EXISTS cobre bancos onde ela foi adicionada
-- manualmente e permite que o corte de PII seja aplicado de forma uniforme.
ALTER TABLE "VendasLead"
  ADD COLUMN IF NOT EXISTS "opportunityScore" INTEGER;

CREATE UNIQUE INDEX "VendasLead_claimOperationId_key"
  ON "VendasLead"("claimOperationId");

CREATE INDEX "VendasLead_companyId_claimOperationId_idx"
  ON "VendasLead"("companyId", "claimOperationId");

-- Cards Radar anteriores ao fencing não têm como provar débito. Eles não viram
-- cards manuais: ficam marcados como Radar em quarentena e têm toda projeção de
-- identidade/contato removida. Estados comerciais negativos e opt-out não são
-- reclassificados; apenas PII e vínculos auxiliares deixam de ser acessíveis.
CREATE TEMP TABLE "_RadarUnpaidVendasLead" ON COMMIT DROP AS
SELECT DISTINCT vl."id", vl."customerProfileId"
FROM "VendasLead" vl
LEFT JOIN "RadarLeadCompanyState" rcs ON rcs."vendasLeadId" = vl."id"
WHERE vl."claimOperationId" IS NULL
  AND (
    vl."sourceHistoryId" LIKE 'radar:%'
    OR LOWER(COALESCE(vl."sourceType", '')) IN ('radar', 'webscraping', 'radar_quarantined')
    OR LOWER(COALESCE(vl."primarySource", '')) IN ('radar', 'webscraping', 'radar_quarantined')
    OR rcs."id" IS NOT NULL
  );

-- Conversas vazias criadas automaticamente a partir de Radar não pago não têm
-- história legítima para preservar. Conversas com mensagens reais permanecem,
-- mas perdem todo vínculo/metadado de Vendas para não reidratar o card.
DELETE FROM "Conversation" c
USING "_RadarUnpaidVendasLead" q
WHERE c."vendasLeadId" = q."id"
  AND NOT EXISTS (
    SELECT 1 FROM "Message" m WHERE m."conversationId" = c."id"
  );

UPDATE "Conversation" c
SET "vendasLeadId" = NULL,
    "customerProfileId" = NULL,
    "vendasLeadLinkedAt" = NULL,
    "vendasLeadLinkSource" = NULL,
    "contact" = 'contato-removido',
    "sourcePhoneNormalized" = NULL,
    "sourceTenantKey" = NULL,
    "metadata" = NULL
FROM "_RadarUnpaidVendasLead" q
WHERE c."vendasLeadId" = q."id";

-- O import Radar antigo também criava CustomerProfile antes de existir prova
-- de débito. Só saneamos perfis puros de webscraping, sem confirmação, inbound,
-- papel de cliente/fornecedor ou outro card legítimo. Perfis compartilhados são
-- preservados e apenas perdem o vínculo com o card Radar em quarentena.
CREATE TEMP TABLE "_RadarUnpaidCustomerProfile" ON COMMIT DROP AS
SELECT DISTINCT cp."id"
FROM "CustomerProfile" cp
JOIN "_RadarUnpaidVendasLead" q ON q."customerProfileId" = cp."id"
WHERE LOWER(COALESCE(cp."externalSource", '')) = 'webscraping'
  AND cp."nameConfirmed" = FALSE
  AND cp."firstInboundAt" IS NULL
  AND cp."lastInboundAt" IS NULL
  AND cp."isCliente" = FALSE
  AND cp."isFornecedor" = FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM "VendasLead" other
    LEFT JOIN "_RadarUnpaidVendasLead" unpaid ON unpaid."id" = other."id"
    WHERE other."customerProfileId" = cp."id"
      AND unpaid."id" IS NULL
  )
  AND NOT EXISTS (SELECT 1 FROM "AtendimentoCustomer" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "HbxRecoveryCustomer" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "FinanceiroCharge" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "RecoveryDebtItem" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "Entrega" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "ClienteProduto" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "LocalEntrega" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "DebtCase" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (SELECT 1 FROM "Conversation" x WHERE x."customerProfileId" = cp."id")
  AND NOT EXISTS (
    SELECT 1
    FROM "Contato" x
    WHERE x."customerProfileId" = cp."id"
      AND LOWER(COALESCE(x."source", '')) NOT IN (
        'radar',
        'webscraping',
        'cnpj_socio',
        'receita_qsa'
      )
  );

UPDATE "Contato" c
SET "nome" = 'Contato removido',
    "cargo" = NULL,
    "whatsapp" = NULL,
    "phone" = NULL,
    "email" = NULL,
    "isPrincipal" = FALSE,
    "source" = 'radar_quarantined'
FROM "_RadarUnpaidCustomerProfile" q
WHERE c."customerProfileId" = q."id"
  AND LOWER(COALESCE(c."source", '')) IN (
    'radar',
    'webscraping',
    'cnpj_socio',
    'receita_qsa'
  );

UPDATE "CustomerProfile" cp
SET "sourceConnectionId" = NULL,
    "name" = NULL,
    "profileName" = NULL,
    "nameSource" = NULL,
    "phone" = NULL,
    "phoneNormalized" = NULL,
    "email" = NULL,
    "document" = NULL,
    "externalSource" = 'radar_quarantined',
    "externalCustomerId" = NULL,
    "status" = 'inactive',
    "notes" = NULL,
    "searchName" = NULL,
    "cnpj" = NULL,
    "endereco" = NULL,
    "numero" = NULL,
    "bairro" = NULL,
    "cidade" = NULL,
    "uf" = NULL,
    "cep" = NULL,
    "lat" = NULL,
    "lng" = NULL,
    "isLead" = FALSE
FROM "_RadarUnpaidCustomerProfile" q
WHERE cp."id" = q."id";

-- Snapshots e filas auxiliares podem carregar nome, telefone, e-mail, texto de
-- conversa ou blobs 3x3. O corte é deliberadamente destrutivo e tenant-safe
-- porque a seleção nasce do próprio VendasLead marcado como Radar.
DELETE FROM "EmailOutboundMessage" e USING "_RadarUnpaidVendasLead" q WHERE e."leadId" = q."id";
DELETE FROM "AutomationLedgerEvent" e USING "_RadarUnpaidVendasLead" q WHERE e."leadId" = q."id";
DELETE FROM "AutomationStepRun" s USING "_RadarUnpaidVendasLead" q WHERE s."leadId" = q."id";
DELETE FROM "AutomationEnrollment" e USING "_RadarUnpaidVendasLead" q WHERE e."leadId" = q."id";
DELETE FROM "VendasAutomationJob" j USING "_RadarUnpaidVendasLead" q WHERE j."leadId" = q."id";
DELETE FROM "VendasLeadCockpitState" s USING "_RadarUnpaidVendasLead" q WHERE s."leadId" = q."id";
DELETE FROM "VendasLeadTimelineEvent" e USING "_RadarUnpaidVendasLead" q WHERE e."leadId" = q."id";
DELETE FROM "Atividade" a USING "_RadarUnpaidVendasLead" q WHERE a."leadId" = q."id";

UPDATE "RadarLeadCompanyState" rcs
SET "vendasLeadId" = NULL
FROM "_RadarUnpaidVendasLead" q
WHERE rcs."vendasLeadId" = q."id";

UPDATE "VendasLead"
SET "sourceType" = 'radar_quarantined',
    "primarySource" = 'radar_quarantined',
    "sourceHistoryId" = NULL,
    "sourceSignature" = NULL,
    "customerProfileId" = NULL,
    "contactSnapshotJson" = NULL,
    "name" = NULL,
    "phone" = NULL,
    "phoneNormalized" = NULL,
    "email" = NULL,
    "address" = NULL,
    "website" = NULL,
    "rating" = NULL,
    "reviews" = 0,
    "opportunityScore" = NULL,
    "city" = NULL,
    "state" = NULL,
    "segment" = NULL,
    "nextAction" = NULL,
    "shortNote" = NULL,
    "lastResult" = NULL,
    "assignedUserId" = NULL,
    "assignedByUserId" = NULL,
    "assignedAt" = NULL
WHERE "id" IN (SELECT "id" FROM "_RadarUnpaidVendasLead");

-- Snapshots antigos não carregavam prova de acesso e podiam conter identidade,
-- URLs ou contatos. O corte não tenta adivinhar quais eram seguros.
UPDATE "RadarLeadProcessRun"
SET "snapshotJson" = '{}',
    "eventsJson" = '[]',
    "errorMessage" = NULL,
    "workerToken" = NULL,
    "workerLeaseUntil" = NULL;

-- Corte destrutivo deliberado: owner/state legado sem prova de ledger não é
-- grandfathered. O VendasLead histórico permanece no CRM, mas o Radar volta a
-- mascarar/requerer uma aquisição canônica nova.
UPDATE "RadarLeadPool"
SET "ownerCompanyId" = NULL,
    "claimedAt" = NULL,
    "status" = CASE
      WHEN "status" IN ('reserved', 'delivered', 'in_attendance', 'sent_to_vendas') THEN 'clean'
      ELSE "status"
    END
WHERE "ownerCompanyId" IS NOT NULL
   OR "claimedAt" IS NOT NULL
   OR "status" IN ('reserved', 'delivered', 'in_attendance', 'sent_to_vendas');

-- Estado por tenant também podia esconder o card mesmo depois de limpar owner.
-- Normalize apenas estados de posse/entrega; negativos, opt-out, reclamações e
-- bloqueios continuam preservados por segurança comercial.
UPDATE "RadarLeadCompanyState"
SET "vendasLeadId" = NULL,
    "assignedUserId" = NULL,
    "assignedByUserId" = NULL,
    "assignedAt" = NULL,
    "lastActionAt" = CURRENT_TIMESTAMP,
    "status" = 'released'
WHERE "paidClaimOperationId" IS NULL
  AND "claimUsageKey" IS NULL
  AND "acquiredAt" IS NULL
  AND "status" IN (
    'reserved',
    'claimed',
    'delivered',
    'imported_to_vendas',
    'in_attendance',
    'sent_to_vendas'
  );

-- Produto único: qualidade continua bloqueando risco/contato inválido, mas não
-- cria categorias comerciais nem entrega diferente por plano.
UPDATE "RadarLeadPool"
SET "deliveryProduct" = 'lead',
    "visibilityTier" = CASE
      WHEN "status" IN ('blocked', 'denied', 'complaint', 'rejected', 'negative') THEN 'blocked'
      ELSE 'eligible'
    END;

UPDATE "LeadContact"
SET "claimedByCompanyId" = NULL
WHERE "claimedByCompanyId" IS NOT NULL;

-- Vocabulário único de origem. Mantém manual/google/brave intactos e converte
-- somente aliases históricos conhecidos, usando kind+rank para distinguir os
-- contatos oficiais primário/secundário e e-mail da Receita.
UPDATE "LeadContact"
SET "source" = CASE
  WHEN LOWER("source") IN ('receita_primary', 'cnpj_public_primary')
    AND LOWER("kind") = 'email' THEN 'rfb_email'
  WHEN LOWER("source") IN ('receita_secondary', 'cnpj_public_secondary')
    AND LOWER("kind") = 'email' THEN 'rfb_email'
  WHEN LOWER("source") IN ('receita_primary', 'cnpj_public_primary')
    AND LOWER("kind") IN ('phone', 'whatsapp') THEN 'rfb_primary'
  WHEN LOWER("source") IN ('receita_secondary', 'cnpj_public_secondary')
    AND LOWER("kind") IN ('phone', 'whatsapp') THEN 'rfb_secondary'
  WHEN LOWER("source") IN ('receita', 'cnpj_public', 'cnpj_l4')
    AND LOWER("kind") = 'email' THEN 'rfb_email'
  WHEN LOWER("source") IN ('receita', 'cnpj_public', 'cnpj_l4')
    AND LOWER("kind") IN ('phone', 'whatsapp')
    AND COALESCE("rank", 1) <= 1 THEN 'rfb_primary'
  WHEN LOWER("source") IN ('receita', 'cnpj_public', 'cnpj_l4')
    AND LOWER("kind") IN ('phone', 'whatsapp') THEN 'rfb_secondary'
  WHEN LOWER("source") = 'web_crawl' THEN 'website_crawl'
  WHEN LOWER("source") IN (
    'lead_plus_engine',
    'lead_harvest_import',
    'metadatajson_backfill',
    'metadata',
    'legacy',
    'radar',
    'primary'
  ) THEN 'hbx_engine'
  ELSE "source"
END
WHERE "source" IS NOT NULL
  AND LOWER("source") IN (
    'receita',
    'receita_primary',
    'receita_secondary',
    'cnpj_public',
    'cnpj_public_primary',
    'cnpj_public_secondary',
    'cnpj_l4',
    'web_crawl',
    'lead_plus_engine',
    'lead_harvest_import',
    'metadatajson_backfill',
    'metadata',
    'legacy',
    'radar',
    'primary'
  );

-- Missões anteriores a esta trava não carregam state+operação+usageKey e podem
-- ter nascido no Raio-X antes da compra. Não há prova segura para grandfather:
-- o corte é destrutivo e a saga paga recria apenas o que for adquirido depois.
DELETE FROM "RadarMission";

-- O Raio-X passa a ser cadastral-only. Jobs antigos em execução não podem ser
-- retomados porque suas camadas vivo/IA foram removidas; finalizados continuam
-- disponíveis para auditoria, mas sem contadores que sugiram execução suportada.
UPDATE "CnpjXrayJob"
SET "layers" = '["cadastral"]',
    "status" = CASE
      WHEN "status" IN ('queued', 'running_cadastral', 'running_vivo', 'running_ia') THEN 'error'
      ELSE "status"
    END,
    "lastError" = CASE
      WHEN "status" IN ('queued', 'running_cadastral', 'running_vivo', 'running_ia')
        THEN 'Job encerrado no corte cadastral-only; execute novamente para gerar o XLSX local.'
      ELSE "lastError"
    END,
    "finishedAt" = CASE
      WHEN "status" IN ('queued', 'running_cadastral', 'running_vivo', 'running_ia') THEN CURRENT_TIMESTAMP
      ELSE "finishedAt"
    END;

ALTER TABLE "CnpjXrayJob"
  DROP COLUMN "missionsQueued",
  DROP COLUMN "missionsDone",
  DROP COLUMN "aiDone";
