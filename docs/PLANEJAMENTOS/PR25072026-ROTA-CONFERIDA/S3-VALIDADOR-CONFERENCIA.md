# S3 — Validador geográfico central (o cérebro, dry-run)

Pré-requisito: `01-CONTRATO-WORKER.md`, `docs/Rules/BACKEND.md`. Depende de S1+S2.
LER ANTES: `backend/src/nucleo/nucleo-geo.util.ts` (freio do geocode, a filosofia
inteira está no comentário de topo) e `logistica-geo-fonte.util.ts`.

## Entregável
1. **Util puro** `backend/src/logistica/logistica-conferencia.util.ts` —
   matemática/regras sem banco, 100% testável (padrão da "MATEMÁTICA PURA" no
   fim de `logistica-rota.service.ts`).
2. **Service+endpoint** `POST /logistica/rota/conferir` (controller
   `logistica.controller.ts`, service novo `logistica-conferencia.service.ts`).
   Body: `{ date?, deliveryIds?, origemLat?, origemLng? }` (mesmo contrato do
   planejar). ⚠️ Backend NÃO tem prefixo `/api`.

## Contrato do endpoint (DRY-RUN ABSOLUTO)
- NÃO grava `rotaOrdem`/`etaAt`; NÃO chama `prepareRoute`; NÃO debita; NÃO
  dispara WhatsApp. Ele monta as paradas (mesmo select do `fetchParadasAbertas`,
  ESTENDIDO com `geoFonte` de local e perfil — hoje o select não traz), roda o
  plano em memória (`planRouteByRoads` com o fetcher da S1) e devolve:
```jsonc
{
  "date": "...", "engine": "osrm", "degradedReason": null,
  "total": 18, "verdes": 15, "amarelas": 1, "vermelhas": 2,
  "distanciaTotalKm": 47.2, "terminoPrevisto": "...",
  "paradas": [{
    "id": "...", "nome": "...", "rotaOrdem": 0,
    "lat": ..., "lng": ..., "etaAt": "...",
    "legDistanceM": 500, "legDurationS": 180,
    "semaforo": "verde" | "amarelo" | "vermelho",
    "motivos": ["pino_compartilhado", "fora_do_casulo"]
  }]
}
```

## Regras do semáforo (TODAS locais, R$0 — Lei 5)
🟢 verde: `geoFonte` da fonte escolhida (regra `resolverCoordenadaMultilocal`)
   ∈ {`gps_entrega`, `gps_cadastro`}.
🟡 amarelo (motivos): `geocode_nao_provado_em_campo` (geoFonte='geocode');
   `nunca_entregue` (sem entrega concluída daquele cliente/local — conferir
   como detectar barato: 1 query agregada, não N+1); `rota_degradada`
   (engine='haversine' pinta TODAS de amarelo no mínimo).
🔴 vermelho (motivos): `sem_pino` (semCoordenada); `pino_compartilhado`
   (mesma célula de ~4 casas decimais em ≥2 paradas do dia — assinatura do
   centroide de via, era 154/248 na empresa 41); `fora_do_casulo` (distância
   Haversine à MEDIANA das paradas do dia > teto, default 15 km — constante
   nomeada, SEM migration nesta sprint); `perna_outlier` (legDistanceM > 3× a
   mediana das pernas do dia, com piso de 2 km pra não acusar rota curta).
- Vermelho SEMPRE vence amarelo; `motivos[]` acumula todos os que bateram.
- `diverge_gps_ouro` (>300 m da última entrega concluída): implementar SÓ se
  a coordenada da entrega concluída estiver acessível barato (investigar se
  Entrega guarda lat/lng da conclusão); senão, deixar TODO comentado com o
  motivo — não inventar query cara N+1.

## Limiares
Constantes nomeadas no util (`TETO_CASULO_KM = 15`, `FATOR_PERNA_OUTLIER = 3`,
`PISO_PERNA_OUTLIER_M = 2000`, `CELULA_PINO_DECIMAIS = 4`) com comentário de
que virarão config por empresa depois. NENHUMA migration nesta sprint.

## Testes (obrigatórios — é o coração da frente)
- Unit no util com os casos REAIS da empresa 41 (pinos idênticos em N clientes;
  divergências ~3 km) + casos de borda (0 paradas, 1 parada, todas sem pino).
- **Teste-invariante da Lei 3**: mock do Prisma → chamar conferir → afirmar que
  NENHUM `update`/`updateMany` em `entrega` e NENHUM método de billing foi
  invocado (espião no service de billing).
- Registrar script `test:rota-conferencia` no package.json (padrão dos test:*).
- `cd backend && npm run build && node --test dist/logistica/logistica-conferencia*.test.js`.
