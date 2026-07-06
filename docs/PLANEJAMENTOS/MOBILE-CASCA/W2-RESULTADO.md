# W2 — RESULTADO: VENDAS/LEADS mobile (mockup aprovado 1)

Tela mobile registrada em `/vendas` **e** `/leads` (uma tela, dois modos —
em `/leads` abre direto no modo Buscar lendo o pathname, então o alias
`/webscraping → /leads` e links internos nunca caem no fallback, mesmo antes
do redirect client-side `leads/redirect.client.tsx` resolver). Dois modos por
segmented compacto 28px (Funil | Buscar), consumindo os MESMOS
hooks/endpoints que `vendas/page.client.tsx` e `leads/page.client.tsx` usam no
desktop. Zero backend novo, zero endpoint novo, zero alteração na lógica das
telas desktop (DOM mobile é árvore separada, registrada via `CASCA_SCREENS`).

## Arquivos criados

- `frontend/src/components/casca/screens/vendas.tsx` — `VendasMobile`
  (orquestra o modo ativo) + `ModoSegment` (segmented Funil|Buscar,
  compartilhado pelas duas telas — fundido na barra superior de cada modo, sem
  virar linha própria de cromo).
- `frontend/src/components/casca/screens/vendas-funil.tsx` — modo Funil:
  toolbar (`ModoSegment` + Lista|Quadro + "Modo foco" ícone + "+ Novo"),
  grupos por bloco real do backend (Hoje/Atrasados/Agendados/Fechados — vista
  Lista) OU por etapa real (Prospecção→Fechamento — vista Quadro), linhas
  56–64px, sheet de detalhe, "+ Novo" em `CascaSheet` (pela central da casca,
  com IR/VOLTAR — corrigido na revisão: a 1ª versão usava `.hbx-veil`/
  `.hbx-modal` do desktop, que abre/fecha seco).
- `frontend/src/components/casca/screens/vendas-foco.tsx` — Modo Foco: nasce
  DE NOVO como takeover (`CascaView`), 1 card por vez, swipe ←/→ (pointer
  events), ações rápidas (WhatsApp/ligar/avançar etapa). O `VendasModoFoco`
  velho (deletado no W0) NÃO foi tocado nem referenciado.
- `frontend/src/components/casca/screens/vendas-buscar.tsx` — modo Buscar:
  campo 36px + filtro (CascaSheet) fundidos com o `ModoSegment`, stats 1 linha
  11px, faixa viva de busca (pulso + contador "n novos" + × que para),
  resultados entrando NA lista com transição (`.is-new`), sheet de detalhe com
  CTA "Puxar".
- `frontend/src/components/casca/screens/negocio-sheet.tsx` — `NegocioSheet`
  compartilhado (Funil e Buscar): `CascaSheet` + `<DetalhesNegocio>` (mesmo
  componente do desktop) + ações rápidas (WhatsApp externo `wa.me`, Conversar
  = `POST /inbox/conversations/start` + handoff `sessionStorage` pro
  `/atendimento`, Ligar = `tel:`, Puxar pro funil = `POST
  /webscraping/radar/leads/:id/send-to-vendas`, só quando é lead do Radar).
- `frontend/src/components/casca/screens/vendas-types.ts` — tipos/mapeadores
  compartilhados (`VendasLeadMobile`, `VendasBoardResponse`,
  `BLOCK_ORDER_MOBILE`, `STAGE_ORDER_MOBILE`, `vendasLeadToDetail`) — espelham
  os tipos locais (não exportados) de `vendas/page.client.tsx`, mesmo
  contrato de API, sem acoplar no estado interno do `VendasClient`.

## Arquivos alterados

- `frontend/src/components/casca/registry.tsx` — `CASCA_SCREENS["/vendas"]`
  trocado do stub pra `<VendasMobile/>` + entrada `"/leads": VendasMobile` e
  título em `CASCA_TITLES` (revisão do orquestrador).
- `frontend/src/app/hbx-theme/screens.css` — bloco novo "MOBILE-CASCA/W2" no
  final do arquivo (estrutura por-tela, Lei 2 do Design System): classes
  `.vnd-m__*` e `.vnd-foco__*`. Zero cor/hex — só tokens (`--casca-*`,
  `--space-*`, `--text-*`). Nenhum arquivo de pele tocado.

## Dados — mesmos endpoints do desktop (conferido linha a linha)

- Funil: `GET /vendas/board` (board com `summary`/`blocks`), `PATCH
  /vendas/lead/:id {status}` (avançar etapa no Modo Foco), `POST
  /vendas/manual` ("+ Novo").
- Buscar: `GET /webscraping/radar/leads` (lista/vitrine), `POST/GET/:id/cancel
  /webscraping/radar/search-runs` (busca ao vivo, mesmo polling de 4s do
  desktop), `GET /night-factory/leads-bank`, `GET /vendas/usage` (stats
  Brasil/Disponíveis/cota).
- Detalhe: `POST /inbox/conversations/start`, `POST
  /webscraping/radar/leads/:id/send-to-vendas`.
- `buildNegocioDetailFromLead` (exportado de `leads/page.client.tsx`) reusado
  tal-qual no modo Buscar — mesmo padrão que `leads/[id]/page.client.tsx` já
  usa no desktop.

## Régua (auditada e corrigida em 2 rodadas)

Primeira versão estourou o orçamento de cromo (~200px, calculado por agente
dedicado somando os tokens reais). Corrigido fundindo o `ModoSegment` na
barra superior de cada modo (em vez de linha própria) e comprimindo padding
vertical dos blocos de cromo para `--space-1`:
- **Funil:** topo 48px + toolbar ~36px + stats ~18px = **~106px** (< 140px).
- **Buscar:** topo 48px + searchbar ~44px + statsrow/faixa viva ~28px =
  **~124px** (< 140px).
- Linhas `--casca-row-h` (56–64px), segmented 28px, stats 11px mantidos.
- ≥8 linhas visíveis em 812px de viewport (cromo ~106–124px + tab bar 55px +
  topo já contado ≈ 161–179px de moldura fixa, sobram ~630px pra lista → mais
  de 10 linhas de 60px cabem).

## Checks

- `npx tsc --noEmit` — limpo (0 erros).
- `npm run lint` (eslint + check-pele) — **45 errors / 38 warnings**, IDÊNTICO
  à baseline do W1 (`W1-RESULTADO.md`): meus arquivos somaram **0** erro/aviso
  novo.
- `check-pele` isolado — **0 violações duras; catraca 495/495** (inalterada).
- `npm run build` — **verde**, "Compiled successfully", 42 rotas geradas
  (`/vendas` incluída).

## Pendência honesta

Não consegui o spot-check visual ao vivo (Chrome 375×812 logado) nesta
rodada: a porta 3001 (onde o backend libera CORS) estava ocupada pelo dev
server do dono — não derrubei, por regra. Subi um `frontend-preview` em porta
dinâmica, mas o backend só aceita `Origin: http://localhost:3001` (código em
`backend/src/main.ts`, `buildAllowedOrigins()`), então o login (`POST
/auth/login`) falhou com 500/CORS antes de eu conseguir navegar autenticado
até `/vendas` mobile. Confirmei build+tsc+lint verdes e recalculei o
orçamento de cromo em px a partir dos tokens reais (não estimativa visual) —
alta confiança estrutural, mas falta o olho no pixel real. Fica pendente pro
dono ou pro W7 (QA): abrir `localhost:3001/vendas` no Chrome 375×812 (login
`.test-login.local.md`), conferir os 2 modos, o Modo Foco (swipe) e o sheet de
detalhe com transição.
