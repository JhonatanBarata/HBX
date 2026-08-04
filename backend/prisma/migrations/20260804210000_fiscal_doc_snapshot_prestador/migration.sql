-- FISCAL DO TENANT — revisão adversarial A2 (04/08): snapshot do PRESTADOR no
-- documento. A DANFSe é representação do XML assinado na emissão; sem snapshot,
-- mudar o perfil hoje mudava o PDF de nota antiga (papel divergente do XML).
-- ADITIVO: 3 colunas nulas, zero impacto em linha existente.
ALTER TABLE "FiscalDocumento" ADD COLUMN "prestadorRazaoSocial" TEXT;
ALTER TABLE "FiscalDocumento" ADD COLUMN "prestadorCnpj" TEXT;
ALTER TABLE "FiscalDocumento" ADD COLUMN "prestadorMunicipio" TEXT;
