-- S20 (MOTOR-ÚNICO) — DDL destrutivo CONDICIONADO. NÃO APLICAR EM BANCO
-- NENHUM a partir desta sprint. Esta pasta (`prisma/migrations-hold/`) fica
-- FORA de `prisma/migrations/` de propósito — `prisma migrate deploy` nunca
-- enxerga este arquivo. O orquestrador move (renomeia com timestamp real e
-- copia pra `prisma/migrations/`) só no dia do publish final desta frente,
-- DEPOIS de rodar `backend/scripts/automation-pre-drop-dump.sh` no VPS.
--
-- ⚠️ PROVENIÊNCIA / CONFLITO COM O INVENTÁRIO (leia antes de mover pra valer)
-- ─────────────────────────────────────────────────────────────────────────
-- O INVENTARIO.md (S02, coletado 2026-07-20 — ANTES de S09/S10 existirem)
-- classifica AssistenteConfig e BotConfig(domain='atendimento_bot') como
-- "EM USO" / "migrar com cuidado", NÃO como "LIVRE PRA DEMOLIR" — o único
-- item que o INVENTARIO efetivamente libera pra demolição é o chat de teste
-- FAKE do /bot (frontend, já removido na S18/S19). Company 5 tinha 33
-- versões de BotConfig(atendimento_bot) editadas NO MESMO DIA da coleta, e
-- AssistenteConfig.published=true há 7 dias — dado ativo, não residual.
--
-- O texto da S20 (S20-backend-orfaos-flags-ddl.md item 3) pede o DROP/DELETE
-- abaixo mesmo assim, mas CONDICIONA explicitamente a "S10 validado" — ou
-- seja, só faz sentido depois que (a) o backfill idempotente
-- (backend/scripts/automation-agent-backfill.js, AgentBackfillService) rodou
-- pra TODA empresa com dado nas tabelas legadas, E (b) o runtime rodou tempo
-- suficiente lendo de `AutomationAgent` (HBX_AUTOMATION_AGENT default ON
-- desde esta sprint) sem regressão. Isso NÃO estava provado no INVENTARIO
-- (que é anterior a S09/S10) e não é algo que este worker pode provar sozinho
-- de dentro do repo — só o dono/orquestrador, olhando o VPS no dia do
-- publish, decide se already é seguro mover este arquivo pra valer.
--
-- Por isso a migration abaixo tem uma CHECAGEM DE PARIDADE embutida (regra de
-- ouro "na dúvida, não dropa" como CÓDIGO, não só como comentário): se
-- alguma empresa com dado na tabela legada não tiver uma linha correspondente
-- e ATUALIZADA em AutomationAgent, a migration inteira ABORTA (RAISE
-- EXCEPTION) e NADA é destruído. Mesmo que isto seja movido pra
-- prisma/migrations/ e rodado sem uma segunda checagem manual, o pior caso é
-- "migration falha, publish para" — nunca "perde dado de empresa não migrada".
--
-- Pré-requisito ANTES de mover pra valer:
--   1. bash backend/scripts/automation-pre-drop-dump.sh   (dump seletivo, ver script)
--   2. Confirmar HBX_AUTOMATION_AGENT != 0 estável em produção por um período
--      de burn-in (recomendação: não aplicar esta migration no MESMO publish
--      que liga o flag pela primeira vez).
--   3. Rodar de novo o backfill (idempotente, seguro repetir):
--        node backend/scripts/automation-agent-backfill.js
--      e conferir 0 `error` no resumo.

DO $$
DECLARE
  missing_assistente INT;
  missing_atendimento INT;
BEGIN
  -- Toda empresa com AssistenteConfig precisa ter uma linha em
  -- AutomationAgent ATUALIZADA na hora (ou depois) da última edição legada —
  -- mesmo critério de "up to date" que AgentBackfillService.backfillCompany
  -- usa (updatedAt do agente >= updatedAt da fonte).
  SELECT count(*) INTO missing_assistente
  FROM "AssistenteConfig" ac
  LEFT JOIN "AutomationAgent" aa ON aa."companyId" = ac."companyId"
  WHERE aa."companyId" IS NULL
     OR aa."updatedAt" < ac."updatedAt";

  IF missing_assistente > 0 THEN
    RAISE EXCEPTION 'ABORTADO (S20 golden rule: na duvida, nao dropa): % linha(s) de AssistenteConfig sem AutomationAgent correspondente/atualizado — backfill incompleto ou desatualizado. Rode node backend/scripts/automation-agent-backfill.js e confira de novo antes de tentar esta migration.', missing_assistente;
  END IF;

  -- Idem pro roteiro: toda empresa com QUALQUER versão de
  -- BotConfig(domain='atendimento_bot') precisa ter AutomationAgent
  -- atualizado na hora (ou depois) da versão mais recente dessa empresa.
  SELECT count(*) INTO missing_atendimento
  FROM (
    SELECT bc."companyId", max(bc."createdAt") AS latest_version_at
    FROM "BotConfig" bc
    WHERE bc.domain = 'atendimento_bot'
    GROUP BY bc."companyId"
  ) latest
  LEFT JOIN "AutomationAgent" aa ON aa."companyId" = latest."companyId"
  WHERE aa."companyId" IS NULL
     OR aa."updatedAt" < latest.latest_version_at;

  IF missing_atendimento > 0 THEN
    RAISE EXCEPTION 'ABORTADO (S20 golden rule: na duvida, nao dropa): % empresa(s) com BotConfig(atendimento_bot) sem AutomationAgent correspondente/atualizado — backfill incompleto ou desatualizado. Rode node backend/scripts/automation-agent-backfill.js e confira de novo antes de tentar esta migration.', missing_atendimento;
  END IF;

  RAISE NOTICE 'Paridade OK: toda empresa com AssistenteConfig e/ou BotConfig(atendimento_bot) tem AutomationAgent atualizado. Prosseguindo com o DROP/DELETE.';
END $$;

-- Só chega aqui se a checagem de paridade acima passou (senão a transação já
-- abortou com RAISE EXCEPTION e nada abaixo executa).

-- AssistenteConfig: dado já migrado (backfill S09) pra AutomationAgent.brain
-- 'ia'/AutomationAgent.fluxoJson — tabela inteira pode sumir (1 linha por
-- empresa, sem histórico de versão pra preservar, ao contrário do BotConfig).
DROP TABLE IF EXISTS "AssistenteConfig";

-- BotConfig domain='atendimento_bot': absorvido em AutomationAgent.roteiroJson
-- (só a versão mais recente — o backfill não preserva histórico de versões
-- antigas, só o "estado atual"). A TABELA "BotConfig" FICA — outros domains
-- (recovery_bot, bot_master_switch, atendimento_agenda, etc.) continuam nela
-- até frente própria; só as linhas do domain 'atendimento_bot' saem.
DELETE FROM "BotConfig" WHERE domain = 'atendimento_bot';
