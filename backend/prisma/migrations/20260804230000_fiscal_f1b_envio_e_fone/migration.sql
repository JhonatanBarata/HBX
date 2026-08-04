-- FISCAL DO TENANT F1b — envio do PDF+XML ao tomador (e-mail/WhatsApp).
-- tomadorFone: snapshot do WhatsApp do tomador (auto-fill da base RFB na tela).
-- envio*: trilha por canal (carimbo de sucesso + último erro) — falha de envio
-- nunca muda o status fiscal da nota. ADITIVO: 5 colunas nulas.
ALTER TABLE "FiscalDocumento" ADD COLUMN "tomadorFone" TEXT;
ALTER TABLE "FiscalDocumento" ADD COLUMN "envioEmailEm" TIMESTAMP(3);
ALTER TABLE "FiscalDocumento" ADD COLUMN "envioEmailErro" TEXT;
ALTER TABLE "FiscalDocumento" ADD COLUMN "envioWhatsEm" TIMESTAMP(3);
ALTER TABLE "FiscalDocumento" ADD COLUMN "envioWhatsErro" TEXT;
