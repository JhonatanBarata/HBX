-- 046-B6: Radar Automático — preferência persistida por vendedor.
-- Aditivo: adiciona radarSellerStandingOrderJson (nullable) ao User.
-- JSON: { active, city, state, segment, alcance, quantos }

ALTER TABLE "User" ADD COLUMN "radarSellerStandingOrderJson" TEXT;
