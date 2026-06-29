# Modo Foco GAME — /vendas desktop (cinematográfico)

Pacote de planejamento para implementar do ZERO em outro chat. Tudo que foi
desenhado/aprovado em brainstorm com o dono está aqui, passo a passo. **Não é o
Modo Foco mobile** (`vendas-modo-foco-mobile.md` / `VendasModoFoco` / `.vf-*`) —
aquele é fila 1-a-1 no celular e está PRONTO/intocado. Este é outra coisa:
experiência cinematográfica de **desktop**.

## A ALMA (a única coisa que não pode faltar)
O vendedor escolhe **UM foco** = **1 segmento + 1 cidade**. **Só esse foco
aparece** no tablado. Todo o resto do funil (outros segmentos/cidades) fica **fora
da tela**. Modo Foco que mostra a carteira misturada = FRACASSO (vira a bagunça com
4 colunas pintadas). É um modo pra LIMPAR a zona do vendedor — novato ou hiperativo
— deixar cristalino, full foco, sem mistureba de segmento/cidade.

## O erro da 1ª tentativa (NÃO repetir)
A implementação anterior **espelhou o funil inteiro misturado** nas 4 colunas →
recriou exatamente a zona que o modo existe pra matar. Sintomas: cards de
"ar-condicionado · Rio Claro" e "psicólogos · Rio Claro" na mesma tela de um foco
"buffets"; contador "21 / 10" (teto de 10 não valia); "Nova missão" morta; a tela
de **escolher o foco veio depois (ou não veio)**.

**Lições duras:**
1. A tela de **escolher o foco vem PRIMEIRO** (logo após comprometer). Sem foco
   escolhido, não há tablado.
2. O tablado é **filtrado por segmento E cidade** do foco ativo, **cortado em 10**.
3. Nunca mapear "todos os leads → 4 colunas". Sempre **filtrar pelo foco**.
4. Custom props de cor (fogo) em `:root` (não no `.foco-overlay`) — senão o botão de
   entrada, que vive FORA do overlay, não enxerga a cor e nasce sem fundo.

## Índice
1. `01-conceito-decisoes.md` — decisões travadas no brainstorm (4 etapas, sprint, missões, cap, plano, config).
2. `02-fluxo-telas.md` — passo a passo da UX, fase por fase.
3. `03-efeitos-cinematograficos.md` — queima/broto: spec, opções e o que foi escolhido.
4. `04-arquitetura-frontend.md` — onde pluga no /vendas, dados, lint de pele, tokens, ICONS, naming.
5. `05-robo-prospector.md` — o robô v2 premium (disparador existente + anti-ban).
6. `06-backend-pendencias-aceite.md` — front × backend, ordem de implementação, critérios de aceite.

## Estado do working tree (29/06)
Há código meu pela metade no tree (`components/hbx/foco-game.tsx`,
`hbx-theme/foco-game.css`, import no `globals.css`, ganchos no `vendas/page.client
.tsx`). Compila verde (lint/tsc), mas o dono julgou ruim. Para começar do zero:
`git checkout -- frontend/src/app/globals.css frontend/src/app/(app)/vendas/page.client.tsx`
e `rm frontend/src/components/hbx/foco-game.tsx frontend/src/app/hbx-theme/foco-game.css`
(remover do `globals.css` o `@import "./hbx-theme/foco-game.css";`). **Não tocar** no
Modo Foco mobile do dono nem na casca crossfade do `/vendas`.
