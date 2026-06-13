# PR12062026006 — Design System oficial (esqueleto + 5 leis + fiscal)

> 12/06/2026, fim do dia. Ordem do dono após flagrar visual herdado 3x:
> "PARAR tela por tela. Criar um design system oficial." Executado.

## O que entrou

1. **ESQUELETO** (ordem literal): peles corporate/friendly DELETADAS
   (theme-corporate.css, theme-friendly.css, colors.css, effects.css,
   corporate.css → kit.css). App roda na base neutra `skeleton.css` —
   contrato de tokens inteiro em cinza, com **dark automático**
   (`[data-theme-mode="dark"]` troca a escada; telas não sabem do dark).
2. **Tailwind v4 = casa dos tokens** (`theme.css`): paleta default APAGADA
   (`--color-*: initial`), tokens HBX expostos como utilities via
   `@theme inline` (resolve var() em runtime → tema troca tudo). Sem
   preflight (zero impacto no CSS atual).
3. **Caça final às cores cravadas**: 83 no CSS do kit (sessão anterior) +
   **89 nos TSX** (bot 24 + 65 nas demais telas/modais) → tokens 1-pra-1.
   App TSX/CSS = ZERO cor literal (isenções mundo-site: marketing.css,
   landing page.client, trabalhe-conosco).
4. **Componentes centrais**: overlays `.hbx-veil/.hbx-modal/.hbx-pop/
   .hbx-drawer` ganharam a PINTURA no kit.css; 48 usos em telas/modais
   despintados (inline ficou só layout).
5. **Fiscal `check-pele.mjs` no `npm run lint`** (build reprova):
   - DURO: cor literal em CSS fora de pele; cor literal em TSX;
     `bg-[#…]` arbitrário do Tailwind.
   - CATRACA: styles visuais inline em TSX (cor/borda/sombra/fonte/radius)
     — baseline 643 → **595** na entrega; teto desce sozinho a cada
     melhoria; subir reprova. Meta: 0.
   - Provado em runtime: violação de teste → exit 1; removida → verde.
6. **Regras regravadas**: AS 5 LEIS no CLAUDE.md (curto) + espec completa
   no FRONTEND.md (este formato substituiu "copiar visual do docs/TEMAS" —
   o handoff virou referência de ESTRUTURA/escrita apenas).

## Validação
- `npm run lint` ✓ (eslint + check-pele: 0 duras, catraca 595/595).
- `npm run build` ✓ após cada fase.

## Fila aberta (catraca)
- 595 styles visuais inline a migrar para classes centrais/utilities,
  tela a tela (piores: gerencial, master, vendas, configuracoes). O fiscal
  impede regressão enquanto a fila desce.
- Peles novas (Aurora/Ember/Mono/Terra — ~60 linhas de tokens cada)
  desenhadas, AGUARDANDO aprovação do dono sobre o esqueleto.
- Decisões dele na lista de legado: deletar duplicata docs/TEMAS (1,7M),
  24 SVGs órfãos em public/hbx-theme, electron/, backups/ na raiz.
