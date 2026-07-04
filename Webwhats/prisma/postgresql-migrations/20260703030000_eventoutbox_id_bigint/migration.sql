-- GATEWAY-WA S2 fix — EventOutbox.id Int (int4) -> BigInt (int8).
-- A outbox grava TODO evento sem flag; a sequence é monotônica e o purge não a reseta. Em int4
-- (teto 2.147.483.647) o INSERT acabaria estourando "integer out of range" e, sendo best-effort,
-- a falha seria engolida em silêncio -> a outbox pararia de receber -> bot mudo sem alarme.
-- BigInt (teto ~9.2e18) remove essa bomba. O consumer do backend já lê com BigInt(id).
-- Fazer AGORA, com a tabela pequena (purga <=7d), torna o rewrite rápido.

ALTER TABLE "EventOutbox" ALTER COLUMN "id" SET DATA TYPE BIGINT;

-- Garante que a sequence também seja bigint (caso tenha sido criada AS integer). No-op se já for.
ALTER SEQUENCE IF EXISTS "EventOutbox_id_seq" AS bigint;
