# Modo Foco GAME — efeitos cinematográficos (queima + broto)

O dono testou em mock e aprovou ("ficou ótimo"). Ajuste final pedido: **mais lento,
ordem aleatória, o foco nascendo ENQUANTO a distração queima, com bastante
sobreposição.** Esse é o comportamento travado.

## Princípio
Queima **CONTROLADA, item a item** (não a página inteira de uma vez), **ordem
ALEATÓRIA**, **ritmo LENTO**, e as folhas do foco **brotam por cima** com **muita
sobreposição** (broto começa antes da queima terminar). Efeito-assinatura pesado **só
no liga/desliga do modo** — micro-animação leve no resto (mover card etc.).

## Entrada — 3 opções desenhadas (escolhida: QUEIMA DE FOLHA)
1. **Queima de folha** ✅ — cada distração carboniza (char → curl → vira cinza), com
   fagulha subindo; uma a uma, ordem aleatória, lento. Assinatura.
2. Vinheta de foco — dessatura/desfoca tudo menos o centro, snap nítido no radar.
3. Colapso pro centro — KPIs/cards sugam pra um ponto e o modo floresce dele.

## Transição (coluna→coluna) — leve, <300ms
1. Rastro de brasa (ember trail) · 2. Flip + lock (micro-shake) · 3. Slide magnético.
(Escolha fina fica pro implementador; tem que ser CURTA.)

## Saída — 3 opções (escolhida: CINZAS ASSENTANDO)
1. **Cinzas assentando** ✅ — espelho da entrada: o tablado queima/vira cinza e a tela
   normal brota de volta.
2. Zoom out · 3. Cofre/arquivo (gaveta que tranca → comunica "arquivado, recuperável").

## Spec de implementação (valores travados do mock aprovado)
- **Queima por item** (`charcurl`, ~0.95s): `opacity 1 → 0`, `filter brightness/sepia`
  escurecendo, `transform: perspective rotateX(0→72deg) scale(1→0.7) translateY`.
- **Borda de brasa** varrendo o item de baixo pra cima (`::after`, ember, `edgeup`).
- **Fagulhas**: 5 spans por item, sobem e somem (`sparkup` ~1.05s), posição aleatória.
- **Broto** (`unfurl`, ~0.85s, ease overshoot `cubic-bezier(.34,1.56,.64,1)`): de
  `scale(.5) translateY(16px) rotate(-7deg) opacity 0` → natural.
- **Stagger**: queima `i * 270ms`; broto começa em `140 + i * 240ms` (sobreposição
  forte com a queima). **Ordem aleatória** (`shuffle` dos itens e das folhas).
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` → sem animação
  (item já some / folha já visível).

## Lint de pele (DURO — ver 04)
- Cores de fogo são **cinematográficas/em evolução** → ficam num **bloco
  `/* pele-allow: … */ … /* pele-allow-end */`** no CSS novo. Estrutura/layout via
  token central.
- Definir os custom props de cor (`--foco-ember/-spark/-fire/...`) em **`:root`** (não
  em `.foco-overlay`), porque o **botão de entrada vive FORA do overlay** e precisa
  enxergar `--foco-fire`. (Bug real da 1ª tentativa: botão nasceu sem fundo.)
- Em TSX: **zero** cor/estilo visual inline (catraca do `check-pele`). Sparks recebem
  `style.left/bottom` via JS em runtime (não conta — não está no source).
