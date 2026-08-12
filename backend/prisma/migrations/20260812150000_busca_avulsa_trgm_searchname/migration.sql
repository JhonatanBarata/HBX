-- BUSCA DA PARADA AVULSA — F1 (12/08/2026, PR12082026-PESQUISA-PAINEL-AVULSA)
--
-- Fuzzy de "Meus clientes": `GET /logistica/busca` compara o texto digitado com
-- "CustomerProfile"."searchName" por similaridade de trigrama ("Mracia" acha
-- "Márcia" — word_similarity 0.2857, medido). A extensão pg_trgm JÁ EXISTE em
-- produção (migration 20260702210300 + carga da RFB); o IF NOT EXISTS abaixo é
-- pra ambiente novo nascer completo.
--
-- POR QUE o índice, se o filtro por companyId já resolve o tenant de hoje
-- (centenas de linhas): a tabela é multi-tenant e cresce com cada empresa nova.
-- O GIN aqui é a reserva que deixa o planner fazer BitmapAnd (companyId ×
-- trigrama) quando algum tenant passar de dezenas de milhares de clientes —
-- criado agora, barato agora (tabela pequena), pra não virar migração de
-- emergência com a tabela grande.
--
-- ⚠️ CONCURRENTLY NÃO ENTRA AQUI: o Prisma aplica migration dentro de transação
-- e CREATE INDEX CONCURRENTLY não roda em bloco transacional. Em produção o
-- índice foi criado ANTES, à mão, com CREATE INDEX CONCURRENTLY (janela 12/08);
-- o IF NOT EXISTS torna esta migration um no-op lá. Mesma convenção do
-- CnpjPublicCompany_cnaeSecundarias_gin_idx (20260805160000).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "CustomerProfile_searchName_trgm_idx"
  ON "CustomerProfile"
  USING gin ("searchName" gin_trgm_ops);
