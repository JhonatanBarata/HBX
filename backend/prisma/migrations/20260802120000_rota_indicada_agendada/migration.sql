-- AGENDADOR DE MISSÃO (02/08) — a rota indicada ganha HORA.
--
-- Até aqui "indicar" era sempre AGORA: o web mandava e o popup abria no próximo
-- poll do app. O dono pediu agendador ("o admin vai enviando comandos para o
-- motorista"), então a indicação passa a poder nascer com hora marcada: fica
-- ARMADA (o app agenda um despertador nativo) e só vira popup na hora.
--
-- NULL = comportamento antigo, imediato. Nenhuma linha existente muda de
-- sentido — por isso a coluna é opcional e sem default.
ALTER TABLE "LogisticaRotaIndicada" ADD COLUMN "agendadaPara" TIMESTAMP(3);

-- Carimbo do despertador: quando o aparelho confirmou que ARMOU o alarme desta
-- indicação. Sem ele o web não tem como dizer "o celular já sabe" — e mentir
-- sobre isso é pior do que não mostrar (o admin agenda e vai embora achando
-- que o motorista vai ser acordado).
ALTER TABLE "LogisticaRotaIndicada" ADD COLUMN "alarmeArmadoEm" TIMESTAMP(3);

-- A varredura do app é sempre "minhas indicações vivas com hora" — o índice
-- acompanha exatamente essa pergunta.
CREATE INDEX "LogisticaRotaIndicada_agendada_idx"
  ON "LogisticaRotaIndicada" ("companyId", "paraUserId", "status", "agendadaPara");
