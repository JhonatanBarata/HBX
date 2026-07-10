-- OOBE POR CATEGORIA DE MÓDULO (docs/PLANEJAMENTOS/PR10072026/02-OOBE-TUTORIAL.md, 10/07).
-- ADITIVA E NÃO-DESTRUTIVA: 1 coluna nova, nullable, sem default e sem backfill — nenhuma
-- linha/coluna existente muda e o boot em prod não depende dela ("build verde ≠ boot ok").
--
-- Company.moduleCategoriesJson JSONB (nullable):
--   * null/ausente — o dono ainda NÃO escolheu as categorias no primeiro acesso
--     (sanitizeUser deriva modulesPending=true e o portão OOBE pergunta).
--   * ["radar","vendas",...] — categorias escolhidas; o endpoint
--     POST /profile/module-categories grava aqui e materializa post-its em
--     CompanyModule (enabled=true pros módulos das categorias escolhidas,
--     enabled=false pros das não escolhidas). Mapa categoria→módulos:
--     backend/src/modules/module-categories.ts (fonte única).

ALTER TABLE "Company" ADD COLUMN "moduleCategoriesJson" JSONB;
