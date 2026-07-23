-- Uma rota TRACKED concluída é terminal e preserva sua sessão/trilha.
-- Nova saída do mesmo motorista no mesmo dia precisa de outra LogisticaRoute.
DROP INDEX IF EXISTS "LogisticaRoute_companyId_entregadorId_routeDate_key";
