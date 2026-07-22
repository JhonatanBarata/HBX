# PR22072026-UIUX-ADAPTATIVO — Detalhes sem corte + Vendas modo Excel + Automação premium

**Dor do dono (22/07):** vendedora abriu o detalhe do lead em notebook (1368x768) e a tela
CORTA (foto 1). "Já repassamos milhões de vezes o visual." Meta em 3 frentes:

1. **Tela Detalhes (cockpit do lead)** — refazer inteira, adaptativa. NÃO PODE cortar em
   1368x768, HD (1280x720), Full HD (1920x1080) e 4K (3840x2160). Em 4K tem que USAR o
   espaço (não ficar um selo pequeno no meio).
2. **/vendas modo Lista → planilha estilo Excel** — editável inline, colunas escolhíveis
   POR USUÁRIO (catálogo = tudo que existe no Detalhes + os 6~7 ícones de canal/social do
   Buscar), 1 linha por lead (nada empilhado), letra maior/menos espaço em branco
   ("sensação de alta resolução"), select-all pelo checkbox do cabeçalho (a mesma ideia
   vai pro Buscar empresas), toolbar de ações no lugar do "33 cards", botão
   "Reiniciar layout".
3. **/automacao** — hero gigante some (foto 2); primeira tela = 4 cards clicáveis PREMIUM;
   seções no padrão de mercado (Intercom / HubSpot / ManyChat / Blip).

**Fonte da verdade visual:** `docs/Rules/FRONTEND.md` (5 Leis + zero-scroll). Todo worker
LÊ antes de editar. Resumo do que mais morde aqui:
- Métrica estrutural (font-size, alturas, larguras de shell) nasce SÓ em
  `skeleton.css`/`typography.css`/`spacing.css` — pele/casca NUNCA declara.
- Zero hex/inline visual em tela (check-pele reprova o build). Inline `style` só layout.
- Pop-up SEMPRE `.hbx-veil` + `.hbx-modal` central; PROIBIDO re-centralizar na tela.
- Seleção ativa (abas/chips/menus) = Glass Pill deslizante (`glass-pill.tsx`).
- Zero-scroll vertical em desktop 100% zoom (≥768px de altura útil); overflow se corrige
  compactando espaçamento via `@media (max-height:…)` em `screens.css`, nunca com
  `overflow-y:auto` no container da tela. Painel INTERNO com scroll próprio é permitido
  (ex.: corpo de guia do cockpit) — a tela em si não rola.
- Gotcha: `*/` dentro de comentário CSS derruba o build (já derrubou 2x).

## Escopo de arquivos

| Frente | Arquivos principais |
|---|---|
| Detalhes | `frontend/src/components/hbx/lead-cockpit-modal.tsx` (~1022 l), `frontend/src/components/hbx/detalhes-negocio.tsx` (painel lateral, ~2911 l), `frontend/src/app/hbx-theme/vendas-details2.css` (+`-legibility.css`) |
| Vendas grid | `frontend/src/app/(app)/vendas/page.client.tsx` (~1839 l), `frontend/src/app/hbx-theme/screens.css`/`kit.css` (tabela), Buscar = `LeadsClient` em `frontend/src/app/(app)/leads/` |
| Automação | `frontend/src/app/(app)/automacao/page.client.tsx` + `kit/*` + `secao-*.tsx`, `frontend/src/app/hbx-theme/automacao.css` |
| Backend | `backend/src/auth/profile.controller.ts` (+ service novo de UI prefs no padrão `theme-preferences.service.ts`), `backend/src/vendas/` (edição inline + campos de canal no board) |

## Regras de execução (duras)

1. **Branch atual (master), commit local por sprint, NÃO publicar** — publish é do dono.
   NUNCA criar branch/worktree (regra 04/07). Dono edita em paralelo → não reverter o que
   não criou.
2. **Sequência por colisão de arquivo:** S1→S2 (mesmos arquivos de detalhes);
   S4→S5 (mesmo page.client.tsx de vendas); S6→S7 (mesma /automacao).
   S3 (backend) pode rodar em paralelo com S1/S2; S4 só entra depois de S3 pronto.
3. Check mínimo por sprint de front: `cd frontend && npm run lint && npm run build`
   (check-pele incluso). Backend: `cd backend && npm run build` + teste dos endpoints
   novos com curl no localhost.
4. Teste visual local: Chrome em `localhost:3001` (credenciais `.test-login.local.md`,
   `teste`/`teste123`; script de subir em `backend/scripts/`). Preview do Claude dá muito
   erro — usar Chrome. Resoluções via DevTools device toolbar: 1368x768, 1280x720,
   1920x1080, 3840x2160.
5. **Não inventar copy** — zero textão novo; UI orienta pela forma (regra do dono).
   Termo técnico não vaza pra tela (humanize/LABEL_MAP já existem).
6. Worker que achar coisa fora do escopo do seu .md: ANOTA no RESULTADO, não conserta.
7. Cada sprint grava `S{n}-RESULTADO.md` na pasta (o que fez, o que ficou de fora, prova).

## Sprints (ordem de execução)

| # | Arquivo | Tema | Risco |
|---|---------|------|-------|
| S1 | S1-detalhes-relayout.md | Refazer a tela Detalhes (cockpit): estrutura fluida, fim do 1180x650 fixo | médio |
| S2 | S2-adaptativo-4-resolucoes.md | Tokens fluidos + compactação por altura + aproveitamento de 4K (app inteiro) | médio |
| S3 | S3-backend-prefs-e-edicao.md | UI-prefs por usuário (JSON) + PATCH inline de campos do lead + canais no board | baixo |
| S4 | S4-vendas-grid-excel.md | Grade Excel: colunas por usuário, edição inline, 1 linha, densidade, select-all | alto |
| S5 | S5-vendas-toolbar-e-buscar.md | Toolbar de ações no lugar do "33 cards" + select-all no Buscar empresas | baixo |
| S6 | S6-automacao-hub-premium.md | Hero enxuto + 4 cards-objetivo PREMIUM | médio |
| S7 | S7-automacao-secoes-mercado.md | Seções internas no padrão Intercom/HubSpot/ManyChat/Blip | médio |
| S8 | S8-QA-INTEGRAL.md | Teste de qualidade: 4 resoluções × 3 frentes + leis da casca + prova | — |

## Critério de pronto da frente

- Cockpit do lead abre INTEIRO (header, guias, rodapé de ações) nas 4 resoluções, sem
  corte e sem scroll da página; em 4K o conteúdo cresce (não fica ilhado).
- /vendas Lista opera como planilha: célula edita inline, colunas escolhidas por usuário
  sobrevivem a relogin, "Reiniciar layout" volta ao padrão, checkbox do cabeçalho marca
  todos, 1 linha por lead, toolbar de ações alinhada no lugar do "N cards".
- /automacao: primeira dobra = 4 cards premium + chip de status discreto; seções com
  visual nível mercado; nada do hero antigo sobrando.
- `npm run lint` (check-pele) e `npm run build` verdes no frontend; backend build verde;
  S8 executado com RESULTADO verde (0 ❌) ou GO-COM-RESSALVAS justificado.
