# S4 — OSRM via backend (tirar o servidor demo do caminho crítico)

Arquivos: `backend/` (NestJS — LER `docs/Rules/BACKEND.md` antes),
`EntregaShell/app/src/logistica/assets/app/app.js`,
`EntregaShell/app/src/logistica/assets/app/index.html` (CSP),
`EntregaShell/app/src/main/java/br/com/hbxsystem/entrega/NativeApiClient.kt` (allowlist).

## Porquê
`router.project-osrm.org` é servidor de DEMONSTRAÇÃO — sem SLA, pode bloquear
tráfego comercial a qualquer momento, direto do aparelho do motorista. Passando pelo
backend: cache compartilhado, rate-limit por empresa, e self-host futuro vira só
trocar uma env.

## 1. Backend — módulo/contromember no domínio logística
Endpoints autenticados (mesmo guard/tenancy dos demais `/logistica/*`):
- `GET /logistica/osrm/route?coords=lng,lat;lng,lat;…` → repassa para
  `${OSRM_BASE_URL}/route/v1/driving/{coords}?overview=full&geometries=geojson&steps={steps}`
  (query `steps` opcional, default false — a S5 vai usar true).
- `GET /logistica/osrm/table?coords=…` → `/table/v1/driving/{coords}?annotations=duration`.
Regras:
- `OSRM_BASE_URL` por env, default `https://router.project-osrm.org`. Documentar no
  .env.example se o projeto tiver.
- Validação dura do `coords`: regex de pares numéricos separados por `;`, máx. 80
  pontos, lat/lng em faixa válida. Nada de repassar string crua.
- Timeout upstream 9s; erro/timeout → 502 `{ code: "OSRM_INDISPONIVEL" }`.
- Cache em memória TTL 10min, chave = path+coords arredondadas a 5 casas, máx ~200
  entradas (LRU simples). Rota com posição do motorista quase nunca acerta o cache —
  tudo bem, o cache serve pro planejamento/prévia.
- Rate-limit simples por empresa: máx 30 chamadas/min → 429 (o disjuntor do app da
  S3 já segura o normal; isso é a trava contra loop).
- Sem Prisma/migration — endpoint stateless.

## 2. App — trocar as URLs com FALLBACK
`roadGeometry` (app.js:358) e `roadOptimizedPoints` (app.js:376):
1º tenta `H.api("/logistica/osrm/route?...")` (auth já embutida no H.api);
falhou (qualquer erro) → fallback direto pro `router.project-osrm.org` como hoje.
Cache local `roadGeometryCache` continua igual.

## 3. CSP e allowlist
- `index.html` CSP: `connect-src` já tem api.hbxsystem.com.br e o OSRM público —
  conferir que nada precisa entrar; NÃO remover o OSRM público (é o fallback).
- `NativeApiClient.kt`: adicionar prefixo `/logistica/osrm/` na allowlist (mesmo
  padrão dos endpoints adicionados em PRs anteriores). Cuidado com comentário de
  bloco aninhado em Kotlin.

## Validação
`cd backend && npx tsc --noEmit` exit 0 (typecheck; NÃO subir docker).
`node --check` no app.js exit 0. Relatar: contrato dos endpoints, limites
(timeout/cache/rate), e o caminho de fallback no app.

## NÃO fazer
Não self-hostar OSRM agora (fica pra depois, é só trocar OSRM_BASE_URL). Não mexer
em steps/voz (S5). Não commitar/criar branch. Não rodar migration.
