# PLAN — Tema `future!` (Construtor de Bot cinematográfico, neon/sci-fi)

> Pedido do dono (24/06): criar a pele **`future!`** que transforma o Construtor de Bot
> na cara das 10 mockups em `Desktop/refatoração tutofig/imagens/`. "Quebre todas as regras
> nesse tema", "full imagem / full front", **trabalho de DIAS**, fidelidade pixel.
> **REGRA-MÃE: nada pode afetar os outros temas.** Orquestração com workers (Opus planeja).

## Fonte da verdade (ler antes de editar)
- Mockups (alvo visual): `C:\Users\Jhonatan\Desktop\refatoração tutofig\imagens\*.png` (lote 24/06, 10 telas).
- Protótipo funcional: `…\refatoração tutofig\preview.html` (HTML único, lógica completa).
- Scaffold React (port fiel do preview): `…\refatoração tutofig\components\bot-builder\*` + `app\bot-builder-preview\page.tsx`.

## Decisões de arquitetura (travadas)
1. **Componente NOVO** `FutureBotBuilder` (porte do scaffold), **não** reskin do `BotTutofig`.
   Motivo: as mockups têm mode-selector (Atendimento/Recovery/Prospecção), 5 missões, rail de
   features e gate de termos — estrutura que o tutofig atual (prospecção, 3 colunas) não tem.
2. **Pele `future`** registrada no sistema (`theme-attributes.tsx` PELES + `layout.tsx` THEME_BOOT).
   Toda a estética viciada vive em **`hbx-theme/theme-future.css`** — `check-pele` ISENTA `theme-*.css`,
   então hex/glow/gradiente liberados **sem reprovar lint**.
3. **Isolamento total:** TODO seletor de estilo começa com `[data-theme="future"]`. Componente TSX
   usa só `className` (classes `.fbb-*`); zero hex/style-visual inline em TSX (catraca check-pele).
4. **Gating de montagem:** sob `[data-theme="future"]`, o gatilho do Construtor abre `FutureBotBuilder`;
   nos outros temas continua o `BotTutofig` atual. Swap puro, reversível.
5. **Imagens com fallback CSS:** `theme-future.css` referencia `url(/future/…)` com fallback
   (gradiente/clip-path/ícone do sistema) → bonito ANTES das imagens, auto-upgrade quando o dono dropar.
6. **Visual-first:** Fase A entrega a CARA fiel (visual-only). Wiring real (salvar config de prospecção,
   etc.) é fase posterior — o scaffold já é "visual e local" por design.

## Manifesto de imagens (o dono gera no ChatGPT; dropar em `frontend/public/future/`)
| Arquivo | Uso | Prioridade | Specs |
|---|---|---|---|
| `bg.jpg` | Backdrop (nebulosa + grid/circuito) | MUST | 2560×1440, escuro, centro pouco detalhado, JPG |
| `icon-atendimento.png` | Ícone-herói modo Atendimento (fone, azul) | FORTE | ~512², PNG transparente, centrado |
| `icon-recovery.png` | Ícone-herói modo Recovery (moeda, âmbar) | FORTE | ~512², PNG transparente |
| `icon-prospeccao.png` | Ícone-herói modo Prospecção (alvo, roxo) | FORTE | ~512², PNG transparente |
| `hud-hbx.png` | Emblema hexagonal HBX (HUD topo) | OPCIONAL | ~400², PNG transparente |
| `grid.png` | Overlay hex-grid tileável (se não vier no bg) | OPCIONAL | 512² seamless, PNG transparente |
- NÃO peço: ícones de campo/rail (uso `ICONS` + glow CSS), telefone, botões, mission-node (tudo CSS).

## Fases & blocos de worker
- **F1 — Fundação (visual-only, gated)** ✅ CONCLUÍDO (24/06)
  Registrar pele; criar `theme-future.css` (tokens neon + backdrop/shell/glow CSS); portar o scaffold
  como `components/hbx/future-bot-builder/index.tsx` (classes `.fbb-*`, zero hex em TSX); `@import` no globals;
  montar gated no painel de prospecção (`activePele === "future"` → `FutureBotBuilder`); lint 0 erros, build verde.
  Visual validado: HUD hexagonal, mode-cards neon, wizard com scanline, toast neon, partículas, preview WhatsApp.
- **F2 — Integração de imagens**: trocar fallbacks por `url(/future/*)`; afinar blend/opacidade do bg;
  ícones-herói nos mode-cards; emblema no HUD.
- **F3 — Fidelidade pixel** (1 worker por grupo de mockups): recolor por modo (azul/âmbar/roxo),
  mission-node hexagonal + %, botões chanfrados com seta, hex-grid, espaçamentos, glows exatos.
- **F4 — Wiring real**: prospecção salva de verdade (reusar `useProspectingConfig`); decidir atend/recovery.
- **F5 — Splash/celebração + responsivo + prefers-reduced-motion + QA** nos 3 modos × 5 passos.

## Fidelidade — checklist (bater contra as 10 mockups)
Backdrop nebulosa+grid+partículas+vinheta · HUD hexagonal "HBX" glow · título 46px com termo neon ·
mode-cards (3) com ícone-herói + borda neon no ativo · dots/missão "X de 5" · scanline varrendo o painel ·
cards de campo vidro-escuro + inputs neon · choices/toggles neon · checklist verde glow · métricas neon ·
flow de nós com seta glow · telefone neon (bolhas bot/user/tag) · rail de features · botões chanfrados glow ·
gate de termos rolar-pra-liberar + 2 aceites + cadeado · toast neon · recolor total por modo.

## Reversão
Tudo novo/aditivo: 1 arquivo CSS + 1 pasta de componente + ~3 linhas de registro + 1 swap gated.
`git revert`/remover import desliga sem tocar nos outros temas.
