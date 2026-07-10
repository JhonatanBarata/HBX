# W4 — P1.3: anexos do inbox saem do público
Storage privado (fora de backend/public), migração idempotente dos arquivos existentes no boot.
Rota GET autenticada por URL assinada (HMAC + expiração ~24h, nosniff, attachment p/ não-mídia).
Backend assina mediaUrl na SAÍDA dos payloads (sem migration de banco). Novos uploads: UUID, não timestamp.
Motor WhatsApp não quebra (envio já é base64 do disco — atualizar resolução de path); fallback público do
bridge vira URL assinada. Frontend resolveMediaUrl usa URL do backend. Magic bytes básicos nos tipos permitidos.
