-- BUSCA DA PARADA AVULSA — índice COBRIDOR do grupo COMÉRCIOS (12/08/2026,
-- PR12082026-PESQUISA-PAINEL-AVULSA F1).
--
-- Vive em migration PRÓPRIA porque a 20260812150000 já tinha sido APLICADA em
-- produção (publish do dono, 12/08 03:34) quando este índice nasceu — editar
-- migration aplicada quebra o checksum do prisma migrate deploy.
--
-- POR QUE: o grupo "comércios" de GET /logistica/busca filtra a RFB por
-- (normalizedCity, state) e a cidade tinha ~1 linha POR PÁGINA no heap de
-- 61 GB — Heap Blocks: 31.765 medidos em Rio Claro = ~140 ms SÓ de heap, em
-- toda tecla digitada. Com este índice a fase de nome roda em INDEX-ONLY SCAN
-- (nunca toca o heap). ⚠️ index-only depende do visibility map: depois de
-- carga grande da RFB, rodar VACUUM (PROCESS_TOAST FALSE) "CnpjPublicCompany"
-- — sem isso o planner (certo) volta pro heap.
--
-- PARCIAL em state='SP' de propósito (corte honesto): CnpjGeo só cobre SP —
-- o produto GPS-ranqueado É SP hoje; outra UF não casa o índice e degrada pro
-- caminho do heap (funciona, só não voa). Nacional custaria ~4 GB; SP custou
-- 1.452 MB (medido, 8,8M linhas). O UF entra LITERAL na consulta (validado
-- ^[A-Z]{2}$ na peça pura) porque o planner não casa predicado parcial com
-- parâmetro.
--
-- ⚠️ CONCURRENTLY NÃO ENTRA AQUI (migration roda em transação). Em produção
-- foi criado à mão com CREATE INDEX CONCURRENTLY (12/08, ~4 min); o
-- IF NOT EXISTS torna isto no-op lá. A carga mensal da RFB o dropa e recria
-- (scripts/import-cnpj-dataset.js, SQL_DROP_INDEXES/SQL_CREATE_INDEXES) —
-- mesma convenção do searchText_trgm e do cnaeSecundarias_gin.

CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_buscaSpCover_idx"
  ON "CnpjPublicCompany" ("normalizedCity") INCLUDE ("situacao", "searchText", "cnpj")
  WHERE "state" = 'SP';
