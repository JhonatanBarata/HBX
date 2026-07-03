# HBX-OWNER — Sprint 4: SSE + Árvore composta (fim do polling-marreta)

> Arquitetura nº9 (HBX Owner). Escopo: `hbx-owner/local-agent/` (server.js + web/).
> Depende do Sprint 1 (cache do snapshot VPS) — fazer depois dele.

## Por quê (ROI)
Hoje o front puxa: barra de transferência a cada 1,2 s, Árvore com ~8 GETs × 2 escopos a cada
12 s, painel em vários timers. Parte desses GETs desce até SSH (30–75 s de timeout) — a VPS
apanha e o painel mostra dado de idades diferentes (cada card com um generatedAt). O agent já
tem os caches; ele que EMPURRE o estado e monte o snapshot uma vez só.

## Tarefas
1. **`GET /owner/events` (SSE)** — `Content-Type: text/event-stream`, sem lib externa
   (`res.write("data: ...\n\n")`). Eventos: `transfer` (a cada mudança do transferJob),
   `enricher` (a cada ciclo), `snapshot` (a cada refresh interno). Auth: mesmo Bearer via
   query-token (EventSource não manda header) — validar `?token=` SÓ nesta rota.
   Heartbeat `: ping` a cada 25 s. Reconexão é nativa do EventSource.
2. **`GET /owner/tree`** — o agent monta o snapshot da Árvore inteiro (local + VPS) reusando os
   readers/caches existentes (`readSystemSnapshot`, `readVpsSystem`, `readRadarCockpit`,
   `readVpsLeads`, `readLeadsBank`, `readVpsEngineCapacity`, enricher, integrações) num único
   JSON com UM `generatedAt`. Refresh interno num timer do agent (30 s), não por demanda do front.
3. **Front**:
   - `app.js`: barra de transferência e métricas do enricher escutam SSE; o polling de 1,2 s
     vira fallback (se EventSource falhar 2×, volta ao polling atual — não quebrar nunca).
   - `tree.js`: `loadScope` deixa de fazer 8 GETs — consome `/owner/tree` (1 GET, ou o evento
     `snapshot` do SSE). Manter o botão ⟳ com `force=1`.
4. Remover os timers que ficarem órfãos (conferir com grep `setInterval` no web/).

## Critérios de aceite
- Com o painel aberto, `journalctl`/log do Ops Control mostra chamadas SSH espaçadas pelo timer
  do agent (não pelo nº de abas/cards do front).
- Barra de transferência atualiza em <300 ms após mudança (sem esperar tick de 1,2 s).
- Árvore local e VPS pintam com o MESMO generatedAt.
- Derrubar o agent e religar: painel reconecta sozinho (EventSource retry) sem F5.

## Não fazer
- NÃO adotar WebSocket/socket.io (dependência à toa pra 1 usuário).
- NÃO remover os endpoints GET atuais — são o fallback e a API de debug.
