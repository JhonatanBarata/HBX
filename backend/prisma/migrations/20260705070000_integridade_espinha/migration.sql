-- NÚCLEO-CRM R3 (05/07) — INTEGRIDADE da espinha (PLANO-ROBUSTEZ, dívidas 5 e a corrida do R2).
-- Dois índices UNIQUE PARCIAIS (Postgres: CREATE UNIQUE INDEX ... WHERE) que fecham
-- corridas de concorrência que a idempotência-no-serviço sozinha não fecha:
--
--   1) FinanceiroCharge.entregaId → 1 cobrança POR entrega, no máximo. Mata a corrida
--      do R2 (dois confirmarEntrega simultâneos criando 2 charges da mesma entrega):
--      o 2º INSERT bate no índice e o serviço trata como "já existe" (idempotente).
--      PARCIAL (WHERE entregaId IS NOT NULL): charge legada (assinatura HBX/recovery,
--      todas com entregaId null) NÃO colide — Postgres trata NULL como distinto, mas o
--      índice parcial é explícito e mais barato (só indexa as linhas da Logística).
--
--   2) CustomerProfile (companyId, cnpj) → 1 conta PJ por CNPJ dentro da empresa. Mata
--      a corrida de conta duplicada (dois pulls do Radar materializando o mesmo CNPJ).
--      PARCIAL (WHERE cnpj IS NOT NULL): PF sem CNPJ nunca colide.
--
-- ⚠️ O índice de cnpj EXIGE DEDUPE ANTES (unique não sobe com duplicatas existentes).
-- A migração DEDUPLICA primeiro (fundindo por [companyId,cnpj], vencedor = mais dado)
-- e SÓ DEPOIS cria o índice. entregaId não precisa de dedupe (coluna nova do R2, sem
-- dado legado). Idempotente (IF NOT EXISTS/IF EXISTS). NÃO aplicar em banco vivo por
-- este worker — Postgres está down; o que importa é o SQL estar CERTO.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) FinanceiroCharge.entregaId — UNIQUE PARCIAL (sem dedupe: coluna nova, sem legado)
-- ─────────────────────────────────────────────────────────────────────────────
-- Defensivo: se por acaso já houver duas cobranças da MESMA entrega (bug do R2 antes
-- deste freio), mantém a MAIS ANTIGA (createdAt asc; empate por id) e desliga o link
-- entregaId das demais (não apaga a cobrança — só solta o vínculo idempotente). Assim
-- o índice sobe mesmo num banco que rodou o R2 sem a trava por um tempo.
UPDATE "FinanceiroCharge" fc
SET "entregaId" = NULL
WHERE fc."entregaId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "FinanceiroCharge" keep
    WHERE keep."entregaId" = fc."entregaId"
      AND keep."companyId" = fc."companyId"
      AND (keep."createdAt" < fc."createdAt"
           OR (keep."createdAt" = fc."createdAt" AND keep."id" < fc."id"))
  );

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceiroCharge_entregaId_key"
  ON "FinanceiroCharge" ("entregaId")
  WHERE "entregaId" IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) CustomerProfile (companyId, cnpj) — DEDUPE e DEPOIS UNIQUE PARCIAL
-- ─────────────────────────────────────────────────────────────────────────────
-- 2.a) Elege o VENCEDOR por grupo [companyId, cnpj]: quem tem MAIS DADO vence.
--      "Mais dado" = mais colunas de contato/endereço preenchidas; empate → o mais
--      ANTIGO (createdAt asc), empate final → menor id (determinístico). Isto casa com
--      a regra do serviço de merge (mesma heurística "quem tem mais dado vence").
CREATE TEMPORARY TABLE "_cp_dupes" ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    "id",
    "companyId",
    "cnpj",
    ROW_NUMBER() OVER (
      PARTITION BY "companyId", "cnpj"
      ORDER BY
        ( (CASE WHEN "name"     IS NOT NULL AND "name"     <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "phone"    IS NOT NULL AND "phone"    <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "email"    IS NOT NULL AND "email"    <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "endereco" IS NOT NULL AND "endereco" <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "document" IS NOT NULL AND "document" <> '' THEN 1 ELSE 0 END)
        ) DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS rn,
    FIRST_VALUE("id") OVER (
      PARTITION BY "companyId", "cnpj"
      ORDER BY
        ( (CASE WHEN "name"     IS NOT NULL AND "name"     <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "phone"    IS NOT NULL AND "phone"    <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "email"    IS NOT NULL AND "email"    <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "endereco" IS NOT NULL AND "endereco" <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN "document" IS NOT NULL AND "document" <> '' THEN 1 ELSE 0 END)
        ) DESC,
        "createdAt" ASC,
        "id" ASC
    ) AS winner_id
  FROM "CustomerProfile"
  WHERE "cnpj" IS NOT NULL AND "cnpj" <> ''
)
SELECT "id" AS loser_id, "winner_id"
FROM ranked
WHERE rn > 1;

-- 2.b) Migra as REFERÊNCIAS das perdedoras para a vencedora (mesma empresa, garantido
--      pelo PARTITION por companyId). Tabelas filhas da espinha + a cobrança linkada.
UPDATE "Entrega"          t SET "customerProfileId" = d."winner_id" FROM "_cp_dupes" d WHERE t."customerProfileId" = d."loser_id";
UPDATE "Contato"          t SET "customerProfileId" = d."winner_id" FROM "_cp_dupes" d WHERE t."customerProfileId" = d."loser_id";
UPDATE "ClienteProduto"   t SET "customerProfileId" = d."winner_id" FROM "_cp_dupes" d WHERE t."customerProfileId" = d."loser_id";
UPDATE "FinanceiroCharge" t SET "customerProfileId" = d."winner_id" FROM "_cp_dupes" d WHERE t."customerProfileId" = d."loser_id";
UPDATE "VendasLead"       t SET "customerProfileId" = d."winner_id" FROM "_cp_dupes" d WHERE t."customerProfileId" = d."loser_id";

-- 2.c) Some com as CONTAS perdedoras (as refs já apontam pra vencedora). As demais
--      filhas com FK onDelete=Cascade/SetNull (atendimento/recovery/debt) resolvem
--      sozinhas; a espinha (as migradas acima) já foi preservada.
DELETE FROM "CustomerProfile" cp USING "_cp_dupes" d WHERE cp."id" = d."loser_id";

-- 2.d) AGORA (base limpa) cria o índice UNIQUE PARCIAL por [companyId, cnpj].
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerProfile_companyId_cnpj_key"
  ON "CustomerProfile" ("companyId", "cnpj")
  WHERE "cnpj" IS NOT NULL;
