-- ITEM 4 — CNAE SECUNDÁRIO PESQUISÁVEL (05/08/2026)
--
-- PROBLEMA: `CnpjPublicCompany."cnaeSecundarias"` é CSV de códigos de 7 dígitos
-- ("4635401,4691500,..."), ~60% preenchido em 28.438.115 linhas. O filtro de CNAE do Radar
-- caía em `LIKE '%codigo%'` (Prisma `contains`), que não é indexável: seq scan de 41 GB,
-- MEDIDO em 88.048 ms pra responder "quem tem 4635-4/01 como secundária".
-- Custo comercial: a mercearia que vende bebida como atividade SECUNDÁRIA era invisível
-- pro Radar — e é exatamente ali que mora o cliente da HBX (água/gás/bebida).
--
-- POR QUE ÍNDICE DE EXPRESSÃO E NÃO COLUNA/TABELA:
--   * Coluna `GENERATED ... STORED`: MEDIDO em teste controlado que `ADD COLUMN ... GENERATED`
--     TROCA O FILENODE, isto é, REESCREVE a tabela inteira (ACCESS EXCLUSIVE em 61 GB).
--     Descartado — a tabela acabou de sair de uma limpeza de bloat.
--   * Tabela lateral (cnpj, codigo): ~71,5 M linhas (16,9 M empresas × 4,234 códigos medidos)
--     = ~6-8 GB entre heap e índices, + repopulação a cada carga mensal da RFB. Caro demais
--     pro ganho, já que a contagem por CNAE já tem moradia em `CnpjBaseStats`.
--   * Este índice GIN de expressão: NÃO adiciona coluna, NÃO reescreve a tabela, NÃO gera
--     bloat, e `string_to_array`/`btrim` são IMMUTABLE (verificado em pg_proc) — requisito
--     do Postgres pra aceitar a expressão num índice.
--
-- SEMÂNTICA: `&&`/`@>` sobre o array é EQUIVALENTE ao LIKE antigo no caso exato (medido:
-- 58 = 58 numa amostra de 56 mil linhas) e MAIS CORRETO no caso de prefixo — o `LIKE '%47%'`
-- de hoje casa 34 classes de CNAE erradas (o prefixo aparece no MEIO de outro código).
-- Prefixo agora se resolve expandindo pelo catálogo `CnpjPublicCnae` (1.359 linhas) e
-- passando a lista de códigos de 7 dígitos pro operador de array.
--
-- ⚠️ CONCURRENTLY NÃO ENTRA AQUI: o Prisma aplica a migration dentro de transação e
-- `CREATE INDEX CONCURRENTLY` não roda em bloco transacional. Em ambiente novo a tabela está
-- vazia e este CREATE é instantâneo. Em PRODUÇÃO o índice já foi criado com
-- `CREATE INDEX CONCURRENTLY` na janela de manutenção, então o `IF NOT EXISTS` torna esta
-- migration um no-op — ela existe pra que ambiente novo//reset não fique sem o índice.
-- Mesma convenção do `CnpjPublicCompany_searchText_trgm_idx` (índice operacional, fora do
-- modelo Prisma, também recriado por scripts/import-cnpj-dataset.js na carga mensal).

CREATE INDEX IF NOT EXISTS "CnpjPublicCompany_cnaeSecundarias_gin_idx"
  ON "CnpjPublicCompany"
  USING gin (string_to_array(btrim("cnaeSecundarias"), ',') array_ops);
