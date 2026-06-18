-- 047: wipedAt na sessão — timestamp do último "apagar tudo" para o bootstrap
-- não reimportar chats cujo lastMessage é anterior ao wipe.
ALTER TABLE "WhatsAppConnectionSession" ADD COLUMN "wipedAt" TIMESTAMP(3);
