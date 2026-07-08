# B2 — Mapa DENTRO do app (MapLibre + OpenFreeMap, R$ 0) na tela Rota

> Worker Sonnet. Trabalhar DIRETO no master (NUNCA criar branch/worktree/stash). Commit local por
> caminho (`git add <paths>`), mensagem `feat(logistica): ...`. **NÃO publicar.** Antes de começar:
> `git status` + conferir `origin/master`. `casca.css` e `kit.css` estão sujos do dono —
> INTOCÁVEIS (CSS novo vai em `hbx-theme/entrega.css`). Aprovado pelo dono 07/07.

## Decisão (brainstorm 07/07)
Mapa embutido = visão geral da rota; **Waze continua sendo o turn-by-turn** (deep-link existente
fica). NÃO usar Google Maps JS API (armadilha de custo no SaaS multi-tenant). Stack:
- **MapLibre GL JS** (npm `maplibre-gl`, open-source) no frontend.
- **Tiles OpenFreeMap** — estilo público `https://tiles.openfreemap.org/styles/liberty`
  (grátis, ilimitado, SEM chave). Se indisponível, o app degrada gracioso (mapa some, rota segue).

## O que fazer
- `frontend/src/app/entrega/RotaMapa.tsx` (novo, client-only via `next/dynamic` `ssr:false`):
  - Pinos numerados das paradas ABERTAS na ordem (`rotaOrdem`), pino da parada ATUAL em destaque;
    entregues/canceladas fora (ou apagadas em cinza — escolher o mais limpo visualmente).
  - Polyline (GeoJSON LineString) ligando origem→paradas na ordem da rota (linha reta entre
    paradas é o esperado — o trecho-a-trecho é do Waze).
  - Bolinha do entregador ao vivo: reusar a posição que o geofence já captura
    (`useGeofence`/`watchPosition` em `entrega-hooks.ts` — expor a última posição via hook, sem
    criar segundo watcher de GPS).
  - Sincronia com o carrossel: swipe → mapa recentra na parada atual; tocar pino → vai pro slide.
- Integração em `page.client.tsx` (ViewRota): painel de mapa compacto (~40% da altura) acima do
  carrossel com toggle expandir/recolher em 1 toque. Paradas sem coordenada não quebram nada.
- CSS: classes `ent-map*` SÓ em `hbx-theme/entrega.css`. O CSS do MapLibre
  (`maplibre-gl/dist/maplibre-gl.css`) importa no componente (CSS de node_modules é permitido).
  Esconder controles/attribution poluídos ao estilo do app, MANTENDO atribuição © OpenStreetMap
  visível (obrigação da licença — pode ser compacta).
- Leis do app: ZERO texto explicativo, alvos ≥48px, transições suaves, claro/escuro do skin
  entrega. Offline/tiles fora → container some ou fica estático SEM erro na tela.

## Guardrails
- NÃO tocar backend, WhatsApp, cobrança, flags. NÃO adicionar chave/conta de API nenhuma.
- Bundle: importar maplibre só na rota `/entrega` (dynamic) — não pesar o dashboard.
- Checks: `cd frontend && npx tsc --noEmit` + build ok + check-pele verde (zero hex/inline em TSX)
  + conferir no código que nenhum watcher de GPS novo foi criado (reusa o existente).

## Ao concluir
Gravar `B2-RESULTADO.md` (o que mudou, arquivos, checks, peso adicionado ao bundle) e APAGAR este
arquivo. Commit local.
