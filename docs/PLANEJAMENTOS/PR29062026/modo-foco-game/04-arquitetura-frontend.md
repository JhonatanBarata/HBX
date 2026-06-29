# Modo Foco GAME — arquitetura frontend (onde pluga)

## Onde mora hoje o /vendas (mapa real)
`frontend/src/app/(app)/vendas/page.client.tsx` (`VendasClient`):
- Casca de **2 modos** `modo: "funil" | "buscar"` (crossfade `.vnd-modehost` /
  `.vnd-layer` / `.vnd-funhead`), KPIs no topo via `KpiRow`.
- **Radar embutido**: `LeadsClient` (`../leads/page.client`) com props
  `embedded / onLeadPulled / onEmbedStats / embedTitle`. O seletor de cidade+segmento
  do Radar usa `setSegment` + filtros (estado/cidade/segmento já existem lá).
- **Disparador controlado JÁ existe**: drawer "Prospecção automática" (`prospOpen`,
  `loadProsp`, `prospAcao`, `/vendas/automation/live-status` + `prospecting/start|
  pause|resume|cancel`, triagem, gate Bot IA 402). → é o motor do robô v2.
- Board: `/vendas/board` → `summary{total,today,overdue,scheduled,closed}` +
  `blocks{today,overdue,scheduled,closed}` (`BLOCK_ORDER`); cada `VendasLead` tem
  `segment, city, status, block, isInInbox, saleConfirmedAt, statusLabel, phone, name…`.
  `normalizeStage(status)` → `novo|contato|retorno|qualificado|encerrado`.

## Como o Modo Foco GAME pluga (cirúrgico, aditivo)
- É um **3º modo OVERLAY full-screen** (`position: fixed; inset:0; z-index alto`),
  **DESKTOP only** (`!isMobile`). **Separado** do Modo Foco mobile do dono
  (`vendas-modo-foco.tsx` / `VendasModoFoco` / `.vf-*` / `modo-foco.css`).
- Gancho no `page.client.tsx` (3 pontos, NÃO mexer na casca crossfade):
  1. estado `const [focoGameOpen, setFocoGameOpen] = useState(false)`;
  2. botão de entrada na `.vnd-funhead`, gated `!isMobile && canAtendimento`;
  3. render no topo do `return`: `{!isMobile && focoGameOpen && board && <FocoGame …/>}`.
- Passar pro componente: `summary`, `leads` (TODOS os leads mapeados — o componente
  FILTRA pelo foco internamente), `canRobot` (`botStatus?.botModuleEnabled`),
  `onExit`, `onOpenProspector` (`() => setProspOpen(true)`), `onSelectLead` (acha o
  `VendasLead` por id e `setSel`).

## Naming (NÃO colidir com o mobile do dono)
- Arquivos: `components/hbx/foco-game.tsx` (`FocoGame`) + `hbx-theme/foco-game.css`.
- Classes: prefixo **`.foco-*`** (o mobile dele usa `.vf-*`). Importar `foco-game.css`
  no `globals.css` (junto dos outros `hbx-theme/*.css`).

## Dados (já existem — NÃO criar backend pra v1)
- Tipo do lead pro componente: `{ id, name, segment, city, phone, col, inInbox }` onde
  `col` = etapa da jornada (mapa no `02-fluxo-telas.md`).
- Focos disponíveis (Fase 2) = combos únicos `segment+city` dos leads (com contagem).
- `canRobot` = `botStatus.botModuleEnabled`. `canAtendimento` = item `atendimento` de
  `/modules/me` com `accessible:true`.

## Lint de pele — DURO (`frontend/scripts/check-pele.mjs`)
- **R1**: cor literal (hex/rgb/hsl) em CSS só dentro de bloco
  `/* pele-allow: motivo */ … /* pele-allow-end */`. `#fff/#000` são neutros liberados.
  Arquivos de pele isentos: `theme*.css`, `skeleton.css`, `marketing.css` — o
  `foco-game.css` **NÃO** é isento → usar `pele-allow` pro fogo + tons das 4 etapas.
  Truque: definir tudo como custom props `--foco-*` num bloco `pele-allow` em `:root`,
  resto do arquivo usa só `var()` (não dispara R1).
- **R2**: zero cor literal em TSX.
- **R3**: zero valor arbitrário Tailwind (`bg-[#..]`).
- **R4 (catraca)**: `style` inline com prop VISUAL em TSX (background, color, border,
  borderRadius, boxShadow, fontFamily, outline…) **não pode subir** o contador. →
  componente **só classes**. Layout inline (display/grid/gap/padding/width) é OK.

## Tokens e helpers a usar
- Tokens: `--hbx-surface`, `--hbx-surface-soft`, `--hbx-surface-raised`,
  `--text-strong`, `--text-muted`, `--border-hairline`, `--radius-sm|md|lg|pill`,
  `--font-display|-body|-mono`.
- Ícones do shell (`I`, `ICONS`, `WhatsAppMark`): disponíveis e usados —
  `scrape, search, msg, crown, bot, play, bolt, check, mark, users, plus, mapin,
  arrow`. (Não inventar chave de ICONS — dá erro de tipo.)

## Checks obrigatórios (verde)
`cd frontend && npm run lint` (eslint + check-pele) + `npx tsc --noEmit`. Não restartar
o dev server `:3001` (é do dono). Verificação visual em Chrome `localhost:3001`.
