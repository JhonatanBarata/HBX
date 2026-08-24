-- ROTA NASCE RASTREADA + FINANCEIRO HARD-ON (24/08/2026) — ordem do dono.
--
-- A "última passada" de simplificação do módulo de rota, decidida em 24/08:
--   1. NÃO EXISTE MAIS ESCOLHA DE MODO: toda rota nova nasce TRACKED. A régua
--      de 4 gates (env HBX_LOGISTICA_TRACKING_ENABLED + trackingAtivo + nível
--      FULL + modoRotaPadrao) morreu no código; rota ANTIGA segue com o modo
--      congelado na própria linha (ESSENTIAL continua sendo lido normalmente).
--   2. FINANCEIRO É SEMPRE LIGADO: R$ 0,00 é valor legítimo (a folha mostra o
--      número, sem "sem preço"). O toggle moduloFinanceiroAtivo morreu no
--      código e a coluna vai cair (ver migrations-hold).
--
-- ⚠️ A ARMADILHA DOCUMENTADA da casa (20260821140000_financeiro_nasce_ligado):
-- SET DEFAULT muda SÓ O NASCIMENTO — linha existente não é tocada. Por isso
-- todo hard-on precisa do UPDATE explícito ANTES de qualquer drop:
--   · moduloFinanceiroAtivo: MEDIDO em 21/08, 12 das 14 empresas estavam com
--     false sem nunca terem escolhido isso. Sem este UPDATE, qualquer leitor
--     remanescente (código velho durante a janela de deploy, relatório ad-hoc,
--     dump) ainda veria "off" — e o dado ficaria mentindo até o DROP.
--
-- Os DROP COLUMN NÃO moram aqui de propósito: DDL destrutivo segue o padrão da
-- casa em prisma/migrations-hold/pending_drop_logistica_colunas_de_gate_24_08/
-- (o orquestrador move com timestamp real no dia do publish final, depois do
-- burn-in — `prisma migrate deploy` nunca enxerga aquela pasta).

-- 1. Financeiro hard-on: liga o módulo em TODA linha existente (as 12 off).
UPDATE "LogisticaConfig" SET "moduloFinanceiroAtivo" = true;

-- 2. Toda rota NOVA nasce TRACKED (o código não passa mais o modo por escolha;
--    o default da coluna é a única fonte que resta pra linhas criadas cruas).
ALTER TABLE "LogisticaRoute" ALTER COLUMN "mode" SET DEFAULT 'TRACKED';
