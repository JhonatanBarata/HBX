-- BUG 1 (11/07) — busca por nome ACENTUADO ("Déia", "José", "André"...) não achava o
-- cliente: `{ name: { contains: query, mode: 'insensitive' } }` do Prisma vira ILIKE no
-- Postgres, que é acento-SENSÍVEL. Fix Prisma-native e ADITIVO: coluna espelho
-- `searchName` sem acento/caixa, gravada pelo service em todo write de `name`
-- (nucleo-search.util.ts#normalizeSearch) e comparada com o MESMO normalizador aplicado
-- na busca (contains simples, sem ILIKE).
--
-- `unaccent(lower(...))` do Postgres produz a MESMA saída que `normalizeSearch` (JS,
-- NFD + strip de diacríticos) pro alfabeto PT-BR — por isso o backfill em SQL casa com
-- as linhas novas escritas via JS sem precisar rodar JS no banco.
--
-- Escopo: só CustomerProfile (listEmpresas/listClientes). Contato.nome tem a mesma
-- lacuna de acento — follow-up documentado em nucleo-cadastro.service.ts#listContatos,
-- fora desta migration.
--
-- Idempotente (IF NOT EXISTS / WHERE ... IS NULL) — seguro rodar mais de uma vez.
-- NÃO aplicar em banco nenhum por este worker (regra da tarefa) — o dono aplica no
-- deploy via `migrate deploy`.

-- unaccent é extensão padrão do Postgres (contrib), não custa nada habilitá-la e é
-- idempotente. Pré-checado: o hbx_user de produção tem permissão de CREATE EXTENSION
-- neste banco (mesmo padrão de extensões já usadas no projeto).
CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE "CustomerProfile" ADD COLUMN IF NOT EXISTS "searchName" TEXT;

-- Backfill: só linhas que ainda não têm searchName (idempotente — reexecutar não
-- reprocessa o que já foi preenchido).
UPDATE "CustomerProfile"
SET "searchName" = unaccent(lower(coalesce("name", '')))
WHERE "searchName" IS NULL;

CREATE INDEX IF NOT EXISTS "CustomerProfile_companyId_searchName_idx"
  ON "CustomerProfile" ("companyId", "searchName");
