-- RECADO COM ROTA/PARADA EMBUTIDA (12/08) — o recado deixa de ser só texto.
--
-- A Central anexa uma PARADA (conta) ou uma ROTA SALVA a um recado do chat; o
-- motorista decide no aparelho (encaixar / analisar / negar). O mecanismo mora
-- no CHAT de propósito: todo motorista já sabe usar chat, e o canal paralelo de
-- "rota indicada" (aceitar/negar em tela própria) morreu em 06/08 por ter sido
-- 4 linhas de história servidas por 2.981 polls.
--
-- Aditiva e idempotente: as duas colunas nascem NULL, e NULL é exatamente o
-- recado de hoje — sem anexo, card antigo, zero comportamento novo. Sem
-- backfill, sem índice: nada consulta POR anexo, só se lê o anexo do recado que
-- já foi encontrado pelo fio.
--
-- 🔴 `anexoEstado` NULL vs 'pendente' são coisas DIFERENTES: null = não há
-- anexo; 'pendente' = há anexo e ninguém decidiu ainda. Colapsar os dois faria
-- todo recado antigo do banco parecer uma decisão esperando o motorista.

ALTER TABLE "LogisticaRecado"
  ADD COLUMN IF NOT EXISTS "anexoJson" JSONB,
  ADD COLUMN IF NOT EXISTS "anexoEstado" VARCHAR(12);
