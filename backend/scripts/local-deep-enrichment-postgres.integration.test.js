const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const enabled = process.env.HBX_RUN_LOCAL_ENRICHMENT_DB_TEST === '1';
const container = `hbx-local-enrichment-test-${process.pid}`;
const sleepSignal = new Int32Array(new SharedArrayBuffer(4));
const migration = readFileSync(
  join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260716233000_local_deep_enrichment_contract_v1',
    'migration.sql',
  ),
  'utf8',
);
const repairMigration = readFileSync(
  join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260716235900_reapply_local_deep_enrichment_contract_v1',
    'migration.sql',
  ),
  'utf8',
);
const productionAclBeforeRepair = String.raw`
REVOKE SELECT ON public."RadarLeadEvent" FROM hbx_local_enrichment_owner;
REVOKE SELECT ON public."VendasLeadTimelineEvent" FROM hbx_local_enrichment_owner;
`;

const fixtureSql = String.raw`
CREATE TABLE "Company" ("id" integer PRIMARY KEY);
CREATE TABLE "User" ("id" integer PRIMARY KEY);
CREATE TABLE "RadarLeadPool" (
  "id" text PRIMARY KEY, "companyId" integer, "ownerCompanyId" integer,
  "placeId" text UNIQUE, "name" text NOT NULL, "phone" text,
  "phoneDigits" text UNIQUE, "address" text, "city" text, "state" text,
  "normalizedCity" text NOT NULL DEFAULT '', "segment" text,
  "normalizedSegment" text NOT NULL DEFAULT '', "website" text,
  "websiteStatus" text NOT NULL DEFAULT 'unknown', "email" text,
  "emailStatus" text DEFAULT 'missing', "emailSource" text,
  "instagramUrl" text, "facebookUrl" text, "socialStatus" text DEFAULT 'missing',
  "rating" double precision, "reviews" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'clean', "metadataJson" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  "updatedAt" timestamp(3) NOT NULL DEFAULT current_timestamp
);
CREATE TABLE "RadarMission" (
  "id" text PRIMARY KEY, "stage" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued', "priority" integer NOT NULL DEFAULT 0,
  "payloadVersion" integer NOT NULL DEFAULT 1, "payloadJson" jsonb NOT NULL,
  "dedupeKey" text, "correlationId" text, "attempts" integer NOT NULL DEFAULT 0,
  "maxAttempts" integer NOT NULL DEFAULT 3,
  "nextAttemptAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  "leaseId" text, "leasedBy" text, "leaseExpiresAt" timestamp(3),
  "heartbeatAt" timestamp(3), "lastError" text, "resultJson" jsonb,
  "completedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  "updatedAt" timestamp(3) NOT NULL DEFAULT current_timestamp
);
CREATE UNIQUE INDEX "RadarMission_stage_dedupeKey_key"
  ON "RadarMission"("stage", "dedupeKey");
CREATE TABLE "LeadContact" (
  "id" text PRIMARY KEY, "radarLeadId" text NOT NULL, "kind" text NOT NULL,
  "value" text NOT NULL, "valueNormalized" text NOT NULL,
  "rank" integer NOT NULL DEFAULT 1, "source" text, "confidence" integer DEFAULT 0,
  "claimedByCompanyId" integer, "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  UNIQUE("radarLeadId", "kind", "valueNormalized")
);
CREATE TABLE "LeadPerson" (
  "id" text PRIMARY KEY, "radarLeadId" text NOT NULL, "name" text NOT NULL,
  "role" text, "phoneDigits" text, "email" text, "source" text NOT NULL,
  "personKey" text NOT NULL, "rank" integer NOT NULL DEFAULT 1,
  "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  UNIQUE("radarLeadId", "personKey")
);
CREATE TABLE "VendasLead" (
  "id" text PRIMARY KEY, "companyId" integer NOT NULL, "email" text,
  "phone" text, "phoneNormalized" text, "website" text, "address" text,
  "rating" double precision, "reviews" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  "updatedAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  UNIQUE("companyId", "phoneNormalized")
);
CREATE TABLE "RadarLeadCompanyState" (
  "id" text PRIMARY KEY, "companyId" integer NOT NULL, "radarLeadId" text NOT NULL,
  "vendasLeadId" text, "paidClaimOperationId" text, "claimUsageKey" text,
  "acquiredAt" timestamp(3), "status" text NOT NULL DEFAULT 'new',
  "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  "updatedAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  UNIQUE("companyId", "radarLeadId")
);
CREATE TABLE "RadarLeadEvent" (
  "id" text PRIMARY KEY, "leadId" text NOT NULL, "companyId" integer,
  "eventType" text NOT NULL, "note" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp
);
CREATE TABLE "VendasLeadTimelineEvent" (
  "id" text PRIMARY KEY, "leadId" text NOT NULL, "eventType" text NOT NULL,
  "title" text NOT NULL, "description" text, "sourceType" text,
  "statusFrom" text, "statusTo" text, "resultLabel" text,
  "returnAt" timestamp(3), "createdByUserId" integer, "idempotencyKey" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT current_timestamp,
  UNIQUE("leadId", "idempotencyKey")
);
`;

const scenarioSql = String.raw`
INSERT INTO "Company"("id") VALUES (7001), (7002);
INSERT INTO "RadarLeadPool"(
  "id", "companyId", "name", "normalizedCity", "normalizedSegment", "metadataJson"
) VALUES (
  'radar-main', 7001, 'Empresa Sintetica', 'cidade', 'segmento',
  '{"aiSaneamento":{"keep":true}}'
);
INSERT INTO "VendasLead"("id", "companyId") VALUES ('vendas-main', 7001);
INSERT INTO "VendasLead"(
  "id", "companyId", "email", "phone", "phoneNormalized", "website"
) VALUES (
  'vendas-unchanged', 7002, 'existente@empresa.invalid', '+55 21 98888-0000',
  '5521988880000', 'https://existente.invalid'
);
INSERT INTO "RadarLeadCompanyState"(
  "id", "companyId", "radarLeadId", "vendasLeadId"
) VALUES
  ('state-main', 7001, 'radar-main', 'vendas-main'),
  ('state-unchanged', 7002, 'radar-main', 'vendas-unchanged');
INSERT INTO "RadarMission"(
  "id", "stage", "status", "payloadJson", "correlationId", "companyId",
  "radarLeadId", "runId", "workVersion", "consumerKind", "leaseId",
  "leasedBy", "leaseExpiresAt", "startedAt"
) VALUES (
  'mission-main', 'local_deep_enrich_v1', 'leased', '{}', 'run-main', 7001,
  'radar-main', 'campaign-main', 1, 'owner_local', 'lease-main', 'worker-main',
  current_timestamp + interval '10 minutes', current_timestamp - interval '1 second'
);

CREATE TEMP TABLE hbx_test_payload(payload jsonb);
INSERT INTO hbx_test_payload VALUES ($json$
{
  "contractVersion":"local_deep_enrich_v1",
  "mission":{"id":"mission-main","leaseId":"lease-main","workerId":"worker-main","radarLeadId":"radar-main","companyId":7001,"workVersion":1,"correlationId":"run-main","requestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
  "evidence":[{"id":"ev-main","sourceUrl":"https://empresa.invalid/contato","pageType":"contact","capturedAt":"2026-07-16T22:00:00.000Z","contentHash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","excerpt":"Contato contato@empresa.invalid telefone +55 11 99999-0000 e Socia Administradora"}],
  "delta":{
    "contacts":[
      {"kind":"email","value":"contato@empresa.invalid","valueNormalized":"contato@empresa.invalid","rank":1,"source":"website_crawl","confidence":95,"evidenceId":"ev-main"},
      {"kind":"whatsapp","value":"+55 11 99999-0000","valueNormalized":"5511999990000","rank":1,"source":"website_crawl","confidence":95,"evidenceId":"ev-main","whatsappConfirmed":true}
    ],
    "people":[{"name":"Socia Administradora","role":"Socia","personKey":"socia-administradora","rank":1,"source":"website_crawl","evidenceId":"ev-main"}],
    "radarPatch":{
      "email":{"value":"contato@empresa.invalid","evidenceId":"ev-main","domainCompatible":true},
      "phone":{"value":"+55 11 99999-0000","evidenceId":"ev-main","whatsappConfirmed":true},
      "website":{"value":"https://empresa.invalid","evidenceId":"ev-main","officialSite":true}
    },
    "vendasPatch":{
      "email":{"value":"contato@empresa.invalid","evidenceId":"ev-main","domainCompatible":true},
      "phone":{"value":"+55 11 99999-0000","evidenceId":"ev-main","whatsappConfirmed":true},
      "website":{"value":"https://empresa.invalid","evidenceId":"ev-main","officialSite":true}
    },
    "metadataBlock":{"summary":"teste sintetico"}
  },
  "noNewData":false
}
$json$::jsonb);

DO $commit$
DECLARE first_receipt jsonb; replay_receipt jsonb;
BEGIN
  SELECT hbx_local_enrichment.hbx_commit_local_enrichment_v1(payload)
  INTO first_receipt FROM hbx_test_payload;
  IF first_receipt->>'noNewData' <> 'false'
    OR jsonb_array_length(first_receipt->'createdContactIds') <> 2
    OR jsonb_array_length(first_receipt->'createdContacts') <> 2
    OR jsonb_array_length(first_receipt->'createdPersonIds') <> 1 THEN
    RAISE EXCEPTION 'recibo inicial incorreto: %', first_receipt;
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(first_receipt->'createdContacts') AS contact
      WHERE contact->>'kind' = 'email') <> 1
    OR (SELECT count(*) FROM jsonb_array_elements(first_receipt->'createdContacts') AS contact
        WHERE contact->>'kind' IN ('phone', 'whatsapp')) <> 1
    OR (first_receipt#>>'{summary,emailsAdded}')::integer <> 1
    OR (first_receipt#>>'{summary,phonesAdded}')::integer <> 1
    OR (first_receipt#>>'{summary,peopleAdded}')::integer <> 1
    OR first_receipt#>>'{summary,metadataUpdated}' <> 'true' THEN
    RAISE EXCEPTION 'summary/createdContacts do recibo incorretos: %', first_receipt;
  END IF;
  SELECT hbx_local_enrichment.hbx_commit_local_enrichment_v1(payload)
  INTO replay_receipt FROM hbx_test_payload;
  IF replay_receipt->>'idempotentReplay' <> 'true' THEN
    RAISE EXCEPTION 'replay nao foi idempotente';
  END IF;
  IF (SELECT count(*) FROM "RadarLocalEnrichmentAudit" WHERE "missionId"='mission-main') <> 1
    OR (SELECT count(*) FROM "LeadContact" WHERE "createdByMissionId"='mission-main') <> 2 THEN
    RAISE EXCEPTION 'replay duplicou gravacoes';
  END IF;
  IF (SELECT "metadataJson"::jsonb->'aiSaneamento' FROM "RadarLeadPool" WHERE "id"='radar-main')
    <> '{"keep":true}'::jsonb THEN
    RAISE EXCEPTION 'metadata irma foi alterada';
  END IF;
  IF (SELECT count(*) FROM "VendasLeadTimelineEvent"
      WHERE "idempotencyKey"='local_deep_enrich_v1:mission-main') <> 1
    OR EXISTS (
      SELECT 1 FROM "VendasLeadTimelineEvent"
      WHERE "leadId"='vendas-unchanged'
        AND "idempotencyKey"='local_deep_enrich_v1:mission-main'
    ) THEN
    RAISE EXCEPTION 'timeline foi gravada em card sem alteracao';
  END IF;
  IF (SELECT "description"::jsonb->'fields'
      FROM "VendasLeadTimelineEvent"
      WHERE "leadId"='vendas-main'
        AND "idempotencyKey"='local_deep_enrich_v1:mission-main')
      <> '["email","phone","phoneNormalized","website"]'::jsonb
    OR (SELECT "description"::jsonb#>>'{delta,email,after}'
        FROM "VendasLeadTimelineEvent"
        WHERE "leadId"='vendas-main'
          AND "idempotencyKey"='local_deep_enrich_v1:mission-main')
      <> 'contato@empresa.invalid' THEN
    RAISE EXCEPTION 'timeline nao guardou delta exato do card alterado';
  END IF;
END
$commit$;

DO $divergent$
BEGIN
  BEGIN
    PERFORM hbx_local_enrichment.hbx_commit_local_enrichment_v1($json$
      {"contractVersion":"local_deep_enrich_v1","mission":{"id":"mission-main","leaseId":"lease-main","workerId":"worker-main","radarLeadId":"radar-main","companyId":7001,"workVersion":1,"correlationId":"run-main","requestHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"evidence":[],"delta":{"contacts":[],"people":[],"radarPatch":{},"vendasPatch":{},"metadataBlock":{}},"noNewData":true}
    $json$::jsonb);
    RAISE EXCEPTION 'replay divergente aceito';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'hbx_local_enrichment:request_hash_mismatch' THEN RAISE; END IF;
  END;
END
$divergent$;

INSERT INTO "RadarLeadPool"("id","name","normalizedCity","normalizedSegment","metadataJson")
VALUES ('radar-none','Sem novidade','cidade','segmento','{}');
INSERT INTO "RadarMission"(
  "id","stage","status","payloadJson","correlationId","radarLeadId","runId",
  "workVersion","consumerKind","leaseId","leasedBy","leaseExpiresAt"
) VALUES (
  'mission-none','local_deep_enrich_v1','leased','{}','run-none','radar-none','run-none',
  1,'owner_local','lease-none','worker-main',current_timestamp + interval '10 minutes'
);
DO $nonew$
DECLARE receipt jsonb;
BEGIN
  receipt := hbx_local_enrichment.hbx_commit_local_enrichment_v1($json$
    {"contractVersion":"local_deep_enrich_v1","mission":{"id":"mission-none","leaseId":"lease-none","workerId":"worker-main","radarLeadId":"radar-none","companyId":null,"workVersion":1,"correlationId":"run-none","requestHash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"},"evidence":[],"delta":{"contacts":[],"people":[],"radarPatch":{},"vendasPatch":{},"metadataBlock":{}},"noNewData":true}
  $json$::jsonb);
  IF receipt->>'noNewData' <> 'true'
    OR (SELECT "status" FROM "RadarMission" WHERE "id"='mission-none') <> 'completed' THEN
    RAISE EXCEPTION 'no-new-data nao concluiu corretamente';
  END IF;
END
$nonew$;

INSERT INTO "RadarLeadPool"("id","name","normalizedCity","normalizedSegment","metadataJson")
VALUES ('radar-assessment','Assessment novo','cidade','segmento','{}');
INSERT INTO "RadarMission"(
  "id","stage","status","payloadJson","correlationId","radarLeadId","runId",
  "workVersion","consumerKind","leaseId","leasedBy","leaseExpiresAt"
) VALUES (
  'mission-assessment','local_deep_enrich_v1','leased','{}','run-assessment',
  'radar-assessment','run-assessment',1,'owner_local','lease-assessment','worker-main',
  current_timestamp + interval '10 minutes'
);
DO $assessment$
DECLARE receipt jsonb;
BEGIN
  receipt := hbx_local_enrichment.hbx_commit_local_enrichment_v1($json$
    {"contractVersion":"local_deep_enrich_v1","mission":{"id":"mission-assessment","leaseId":"lease-assessment","workerId":"worker-main","radarLeadId":"radar-assessment","companyId":null,"workVersion":1,"correlationId":"run-assessment","requestHash":"abababababababababababababababababababababababababababababababab"},"evidence":[],"delta":{"contacts":[],"people":[],"radarPatch":{},"vendasPatch":{},"metadataBlock":{"summary":"assessment material novo"}},"noNewData":false}
  $json$::jsonb);
  IF receipt->>'noNewData' <> 'false'
    OR receipt#>>'{summary,metadataUpdated}' <> 'true'
    OR (receipt#>>'{summary,emailsAdded}')::integer <> 0
    OR (receipt#>>'{summary,phonesAdded}')::integer <> 0
    OR (receipt#>>'{summary,peopleAdded}')::integer <> 0
    OR (SELECT "eventType" FROM "RadarLeadEvent"
        WHERE "leadId"='radar-assessment') <> 'local_deep_enrich_completed' THEN
    RAISE EXCEPTION 'assessment novo foi classificado como sem novidade: %', receipt;
  END IF;
END
$assessment$;

INSERT INTO "RadarLeadPool"("id","name","normalizedCity","normalizedSegment","metadataJson")
VALUES ('radar-role','Cargo literal','cidade','segmento','{}');
INSERT INTO "RadarMission"(
  "id","stage","status","payloadJson","correlationId","radarLeadId","runId",
  "workVersion","consumerKind","leaseId","leasedBy","leaseExpiresAt"
) VALUES (
  'mission-role','local_deep_enrich_v1','leased','{}','run-role','radar-role','run-role',
  1,'owner_local','lease-role','worker-main',current_timestamp + interval '10 minutes'
);
DO $role_literal$
BEGIN
  BEGIN
    PERFORM hbx_local_enrichment.hbx_commit_local_enrichment_v1($json$
      {
        "contractVersion":"local_deep_enrich_v1",
        "mission":{"id":"mission-role","leaseId":"lease-role","workerId":"worker-main","radarLeadId":"radar-role","companyId":null,"workVersion":1,"correlationId":"run-role","requestHash":"cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"},
        "evidence":[{"id":"ev-role","sourceUrl":"https://cargo.invalid/equipe","pageType":"about","capturedAt":"2026-07-16T22:00:00.000Z","contentHash":"edededededededededededededededededededededededededededededededed","excerpt":"Maria Diretora"}],
        "delta":{"contacts":[],"people":[{"name":"Maria","role":"Proprietaria","personKey":"maria","rank":1,"source":"website_crawl","evidenceId":"ev-role"}],"radarPatch":{},"vendasPatch":{},"metadataBlock":{}},
        "noNewData":false
      }
    $json$::jsonb);
    RAISE EXCEPTION 'cargo nao literal aceito';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'hbx_local_enrichment:literal_evidence_missing:person_role' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM "LeadPerson" WHERE "radarLeadId"='radar-role')
    OR EXISTS (SELECT 1 FROM "RadarLocalEnrichmentAudit" WHERE "missionId"='mission-role') THEN
    RAISE EXCEPTION 'cargo nao literal deixou escrita parcial';
  END IF;
END
$role_literal$;

INSERT INTO "RadarLeadPool"("id","companyId","name","normalizedCity","normalizedSegment","metadataJson")
VALUES ('radar-cross',7001,'Tenant cruzado','cidade','segmento','{}');
INSERT INTO "VendasLead"("id","companyId") VALUES ('vendas-cross',7002);
INSERT INTO "RadarLeadCompanyState"(
  "id","companyId","radarLeadId","vendasLeadId"
) VALUES ('state-cross',7001,'radar-cross','vendas-cross');
INSERT INTO "RadarMission"(
  "id","stage","status","payloadJson","correlationId","companyId","radarLeadId",
  "runId","workVersion","consumerKind","leaseId","leasedBy","leaseExpiresAt"
) VALUES (
  'mission-cross','local_deep_enrich_v1','leased','{}','run-cross',7001,'radar-cross',
  'run-cross',1,'owner_local','lease-cross','worker-main',current_timestamp + interval '10 minutes'
);
DO $tenant$
BEGIN
  BEGIN
    PERFORM hbx_local_enrichment.hbx_commit_local_enrichment_v1($json$
      {"contractVersion":"local_deep_enrich_v1","mission":{"id":"mission-cross","leaseId":"lease-cross","workerId":"worker-main","radarLeadId":"radar-cross","companyId":7001,"workVersion":1,"correlationId":"run-cross","requestHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"},"evidence":[],"delta":{"contacts":[],"people":[],"radarPatch":{},"vendasPatch":{},"metadataBlock":{}},"noNewData":true}
    $json$::jsonb);
    RAISE EXCEPTION 'tenant cruzado aceito';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'hbx_local_enrichment:tenant_mismatch' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM "RadarLocalEnrichmentAudit" WHERE "missionId"='mission-cross')
    OR (SELECT "metadataJson" FROM "RadarLeadPool" WHERE "id"='radar-cross') <> '{}' THEN
    RAISE EXCEPTION 'tenant divergente deixou escrita parcial';
  END IF;
END
$tenant$;

INSERT INTO "RadarLeadPool"("id","name","normalizedCity","normalizedSegment","metadataJson")
VALUES ('radar-expired','Lease vencida','cidade','segmento','{}');
INSERT INTO "RadarMission"(
  "id","stage","status","payloadJson","correlationId","radarLeadId","runId",
  "workVersion","consumerKind","leaseId","leasedBy","leaseExpiresAt"
) VALUES (
  'mission-expired','local_deep_enrich_v1','leased','{}','run-expired','radar-expired',
  'run-expired',1,'owner_local','lease-expired','worker-main',current_timestamp - interval '1 minute'
);
DO $expired$
BEGIN
  BEGIN
    PERFORM hbx_local_enrichment.hbx_commit_local_enrichment_v1($json$
      {"contractVersion":"local_deep_enrich_v1","mission":{"id":"mission-expired","leaseId":"lease-expired","workerId":"worker-main","radarLeadId":"radar-expired","companyId":null,"workVersion":1,"correlationId":"run-expired","requestHash":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"},"evidence":[],"delta":{"contacts":[],"people":[],"radarPatch":{},"vendasPatch":{},"metadataBlock":{}},"noNewData":true}
    $json$::jsonb);
    RAISE EXCEPTION 'lease vencida aceita';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'hbx_local_enrichment:lease_expired' THEN RAISE; END IF;
  END;
END
$expired$;

DO $roles$
BEGIN
  IF (SELECT rolcanlogin FROM pg_roles WHERE rolname='hbx_local_enrichment_executor')
    OR has_table_privilege('hbx_local_enrichment_executor','public."LeadContact"','INSERT')
    OR has_table_privilege('hbx_local_enrichment_executor','public."LeadContact"','DELETE')
    OR has_function_privilege('hbx_local_enrichment_executor','hbx_local_enrichment.hbx_revert_local_enrichment_v1(jsonb)','EXECUTE')
    OR NOT has_function_privilege('hbx_local_enrichment_executor','hbx_local_enrichment.hbx_commit_local_enrichment_v1(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'papel executor excedeu o contrato';
  END IF;
END
$roles$;

DO $append_only$
BEGIN
  BEGIN
    UPDATE "RadarLocalEnrichmentAudit" SET "durationMs"=0 WHERE "missionId"='mission-main';
    RAISE EXCEPTION 'append-only nao bloqueou update';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'hbx_local_enrichment:append_only_violation' THEN RAISE; END IF;
  END;
END
$append_only$;

UPDATE "RadarLeadPool" SET "email"='humano@empresa.invalid' WHERE "id"='radar-main';
UPDATE "VendasLead" SET "website"='https://humano.invalid' WHERE "id"='vendas-main';
UPDATE "LeadContact" SET "confidence"=77
WHERE "id"=(SELECT min("id") FROM "LeadContact" WHERE "createdByMissionId"='mission-main');

DO $reversal$
DECLARE receipt jsonb;
BEGIN
  receipt := hbx_local_enrichment.hbx_revert_local_enrichment_v1(
    '{"missionId":"mission-main","requestedBy":"system-master-test","reason":"teste sintetico"}'::jsonb
  );
  IF receipt->>'idempotentReplay' <> 'false'
    OR (SELECT "email" FROM "RadarLeadPool" WHERE "id"='radar-main') <> 'humano@empresa.invalid'
    OR (SELECT "emailStatus" FROM "RadarLeadPool" WHERE "id"='radar-main') <> 'confirmed'
    OR (SELECT "phone" FROM "RadarLeadPool" WHERE "id"='radar-main') IS NOT NULL
    OR (SELECT "website" FROM "VendasLead" WHERE "id"='vendas-main') <> 'https://humano.invalid'
    OR (SELECT "phone" FROM "VendasLead" WHERE "id"='vendas-main') IS NOT NULL THEN
    RAISE EXCEPTION 'reversao seletiva alterou edicao posterior';
  END IF;
  IF (SELECT count(*) FROM "LeadContact" WHERE "createdByMissionId"='mission-main') <> 1
    OR NOT EXISTS (SELECT 1 FROM "LeadContact" WHERE "createdByMissionId"='mission-main' AND "confidence"=77)
    OR EXISTS (SELECT 1 FROM "LeadPerson" WHERE "createdByMissionId"='mission-main') THEN
    RAISE EXCEPTION 'reversao de contato/pessoa nao foi seletiva';
  END IF;
  IF (SELECT "metadataJson"::jsonb->'aiSaneamento' FROM "RadarLeadPool" WHERE "id"='radar-main')
      <> '{"keep":true}'::jsonb
    OR (SELECT "metadataJson"::jsonb ? 'localDeepEnrich' FROM "RadarLeadPool" WHERE "id"='radar-main') THEN
    RAISE EXCEPTION 'reversao danificou metadata';
  END IF;
END
$reversal$;

SET ROLE hbx_local_enrichment_executor;
SELECT hbx_local_enrichment.hbx_local_enrichment_contract_v1();
RESET ROLE;
SET ROLE hbx_local_enrichment_reverter;
SELECT hbx_local_enrichment.hbx_revert_local_enrichment_v1(
  '{"missionId":"mission-main","requestedBy":"system-master-test","reason":"replay"}'::jsonb
)->>'idempotentReplay';
RESET ROLE;
SELECT 'LOCAL_DEEP_ENRICHMENT_POSTGRES_OK';
`;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 120_000,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${options.label ?? args.join(' ')} falhou\n${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    );
  }
  return result.stdout ?? '';
}

function psql(sql, label) {
  return docker(
    ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'],
    { input: sql, label },
  );
}

test(
  'migration v1 funciona atomicamente em PostgreSQL 15 descartável',
  { skip: !enabled },
  () => {
    docker([
      'run',
      '--rm',
      '-d',
      '--name',
      container,
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      'postgres:15-alpine',
    ]);
    try {
      let ready = false;
      let consecutiveReady = 0;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const probe = spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], {
          encoding: 'utf8',
          timeout: 5_000,
        });
        if (probe.status === 0) {
          consecutiveReady += 1;
          if (consecutiveReady >= 3) {
            ready = true;
            break;
          }
        } else {
          consecutiveReady = 0;
        }
        Atomics.wait(sleepSignal, 0, 0, 250);
      }
      assert.equal(ready, true, 'PostgreSQL descartável não ficou pronto');
      Atomics.wait(sleepSignal, 0, 0, 500);
      psql(fixtureSql, 'fixture SQL');
      psql(migration, 'migration SQL');
      psql(productionAclBeforeRepair, 'ACL anterior à reparação');
      psql(repairMigration, 'migration corretiva SQL');
      const output = psql(scenarioSql, 'cenários SQL');
      assert.match(output, /LOCAL_DEEP_ENRICHMENT_POSTGRES_OK/);
    } finally {
      spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', timeout: 30_000 });
    }
  },
);
