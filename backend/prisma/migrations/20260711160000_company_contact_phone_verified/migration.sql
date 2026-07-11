-- CONFIRMACAO-TELEFONE F2 (docs/PLANEJAMENTOS/CREDITOS/CONFIRMACAO-TELEFONE.md) —
-- brinde de boas-vindas amarrado ao TELEFONE VERIFICADO. ADITIVA E NÃO-DESTRUTIVA:
-- só adiciona 1 coluna nova, nullable, sem default e sem backfill. Nenhuma coluna/
-- linha/índice existente é tocado.
--
-- Company.contactPhoneVerifiedAt TIMESTAMP(3) NULL:
--   * null (default de fábrica da coluna) — telefone só digitado, NÃO verificado.
--   * data — telefone do cadastro provado por código OTP (F6, /auth/onboarding/
--            whatsapp/confirm ou /auth/whatsapp/verify/confirm).
--
-- Gate (HBX_CREDITS_REQUIRE_VERIFIED_PHONE, default OFF) e o dedup anti-farra passam
-- a exigir este carimbo quando ligados. Com a flag OFF nada muda: a coluna fica NULL
-- em toda empresa e ninguém lê ela pra decidir o brinde (regressão zero).

ALTER TABLE "Company" ADD COLUMN "contactPhoneVerifiedAt" TIMESTAMP(3);
