-- Fast chat list support.
-- Avoid CONCURRENTLY here because Prisma migrations may run inside a transaction.

CREATE INDEX IF NOT EXISTS "Message_instanceId_messageTimestamp_desc_idx"
ON "Message"("instanceId", "messageTimestamp" DESC);

CREATE INDEX IF NOT EXISTS "Message_instanceId_remoteJid_timestamp_desc_idx"
ON "Message"("instanceId", ("key"->>'remoteJid'), "messageTimestamp" DESC);

CREATE INDEX IF NOT EXISTS "Message_remoteJid_expr_idx"
ON "Message"(("key"->>'remoteJid'));

CREATE INDEX IF NOT EXISTS "Chat_instanceId_remoteJid_key"
ON "Chat"("instanceId", "remoteJid");

CREATE INDEX IF NOT EXISTS "Contact_instanceId_remoteJid_idx"
ON "Contact"("instanceId", "remoteJid");
