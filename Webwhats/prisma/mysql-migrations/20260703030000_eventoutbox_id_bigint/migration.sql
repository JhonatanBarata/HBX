-- GATEWAY-WA S2 fix — EventOutbox.id INT -> BIGINT.
-- A outbox grava TODO evento sem flag; a sequence AUTO_INCREMENT é monotônica e o purge não a
-- reseta. Em INT (teto 2.147.483.647) o INSERT acabaria estourando e, sendo best-effort, a falha
-- seria engolida em silêncio -> a outbox pararia de receber -> bot mudo sem alarme. BIGINT remove
-- essa bomba. O consumer do backend já lê com BigInt(id).

ALTER TABLE `EventOutbox` MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT;
