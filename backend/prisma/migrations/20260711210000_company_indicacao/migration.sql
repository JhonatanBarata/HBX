-- S5 INDICAÇÃO (docs/PLANEJAMENTOS/VISAO-FUTURO/S5-indicacao-com-creditos.md) — programa
-- "indique e ganhe" DORMENTE atrás de HBX_INDICACAO_ENABLED (default OFF). ADITIVA E
-- NÃO-DESTRUTIVA: 2 colunas novas nullable, sem default e sem backfill; nenhuma coluna/
-- linha/índice existente é tocado. NÃO confundir com "referralCode"/"referralReferrerName"
-- (atribuição de venda HBX / comissão de parceiro — outra semântica, campos intocados).
--
-- Company.indicacaoCode TEXT NULL UNIQUE:
--   * código OPACO de indicação da empresa (`ind_` + 8 hex, gerado sob demanda no
--     primeiro acesso ao card "Indique e ganhe" — nunca derivado do nome).
-- Company.indicadaPorCompanyId INTEGER NULL:
--   * id da empresa que INDICOU esta (gravado no signup quando a flag está ON e o
--     ?ref= resolve). Bônus pros dois lados SÓ na 1ª recarga paga aprovada (anti-farm).
--
-- Com a flag OFF nada muda: colunas ficam NULL em toda empresa e ninguém as lê.

ALTER TABLE "Company" ADD COLUMN "indicacaoCode" TEXT;
ALTER TABLE "Company" ADD COLUMN "indicadaPorCompanyId" INTEGER;

CREATE UNIQUE INDEX "Company_indicacaoCode_key" ON "Company"("indicacaoCode");
CREATE INDEX "Company_indicadaPorCompanyId_idx" ON "Company"("indicadaPorCompanyId");
