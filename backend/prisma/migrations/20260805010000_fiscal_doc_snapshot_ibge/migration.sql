-- Revisão adversarial M1 (04/08): a chave da DPS na reconciliação usava o
-- município ATUAL do perfil — troca de cidade pós-timeout gerava 404 falso e
-- "reemitir é seguro" (convite à duplicata). Snapshot do IBGE na emissão.
ALTER TABLE "FiscalDocumento" ADD COLUMN "prestadorMunicipioIbge" TEXT;
