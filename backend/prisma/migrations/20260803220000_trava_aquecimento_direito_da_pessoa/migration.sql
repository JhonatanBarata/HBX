-- TRAVA DE AQUECIMENTO REMOVÍVEL (04/08/2026)
-- Chip novo roda metade do dailyLimitPerSender (rampa 6→12); remover a trava é
-- direito da pessoa. Default false = freio ligado.
ALTER TABLE "VendasComercialConfig" ADD COLUMN "coldWarmupOff" BOOLEAN NOT NULL DEFAULT false;
