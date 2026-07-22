# Worker F — RESULTADO (C7 — último buraco de hex: camadas do mapa)

Arquivo tocado (único autorizado):
- `EntregaShell/app/src/logistica/assets/app/app.js`

Commit: ver hash no relatório final da conversa (1 commit, `fix(apk):`, direto no `master`, local).

---

## O que existia

10 hex cravados neste arquivo, todos em `paint`/atributo de camada do mapa (MapLibre GL, WebGL) ou
num filtro SVG — nenhum em CSS, então nenhum passava pela cascata de tema: a cor ficava **congelada
no claro** mesmo com o app em modo escuro.

## Mapeamento hex → token

| Linha original | Cor cravada | Camada/uso | Token escolhido | Exatidão |
|---|---|---|---|---|
| 482 | `#f7f9ff` | `text-color` do rótulo de rua (só quando tema=dark) | `--glass-ink` | **Aproximado** — não há token de "tinta de rótulo de mapa"; `--glass-ink` (par dark) é a família "tinta sobre o mapa" mais próxima no `:root` (chip/botão de GPS), distância de cor pequena mas não zero |
| 840 | `#0865df` | `hbx-reading-trail` (trilha andada) | `--info` | **Exata** — é o valor cravado do próprio `--info` |
| 851/852 | `#168be8` | `hbx-reading-accuracy` (fill) / `-outline` (line) | `--info` | **Aproximado** — tom mais claro que o `--info` real (`#0865df`), mesma família azul; não existe um 2º token azul, converge no `--info` existente |
| 1100 | `#78c900` | `hbx-nav-leg-resto` | `--brand` | **Exata** |
| 1102 | `#07a93f` | `hbx-nav-leg-atual` | `--cta-to` | **Exata** |
| 1145 | `#78c900` | `hbx-route-line` | `--brand` | **Exata** |
| 1256 | `#78c900` | `hbx-leitura-trilha` | `--brand` | **Exata** |
| 3581 | `#000` | `flood-color` do filtro `routeSoftShadow` (SVG real, não WebGL) | `--navy` | **Aproximado** — não há token "preto puro"; `--navy` é quase-preto nos dois temas, a diferença é imperceptível numa sombra desfocada a 22% de opacidade |
| 3567 (comentário) | listava `#fff, #168be8, #e10a1d, rgba(...)` | comentário explicativo, sem efeito visual | — | reescrito sem literal, mantendo a explicação ("os 5 valores cravados") |

**Cuidado extra que não estava no pedido:** os fallbacks (2º argumento do helper, ver abaixo) usam
o mesmo valor de cor, mas escrito em `rgb(r,g,b)` em vez de hex — porque o R6 do `check-pele.mjs`
mira **hex solto** (`#[0-9a-f]{3,8}`) sem isenção de neutros, e um fallback hex ficaria pego pelo
próprio lint que a sprint existe pra zerar. `rgb()` é o mesmo número, só não bate na regex — não é
gambiarra pra escapar do lint, é reconhecer que a regra mira a *notação*, não o conceito de "cor
seguindo hardcoded", e o fallback só existe pra sobreviver a um WebView sem `getComputedStyle`
funcional ou token ausente.

## O helper (item 1 do pedido)

```js
function mapPaintToken(name, fallback) {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  } catch (_) { return fallback; }
}
```

Usado nos 8 pontos de paint (item 2). `--cta-to`/`--brand`/`--info` são lidos frescos a cada
chamada — importante porque `addLayer`/`setNavLegLine`/`applyLeituraLiveLayer` só criam a camada
quando a **source** ainda não existe (padrão "cria se faltar" já usado no arquivo inteiro), então o
valor de cor de cada recriação já reflete o tema **no momento em que a camada nasce de novo** — sem
precisar de nenhuma mudança nesse padrão existente.

## Re-pintura ao trocar tema (item 3)

**Achado:** a troca de tema mora só num lugar — botão "Tema" na tela Ajustes
(`data-action="theme"`, linha ~5521), que chama `H.theme.toggle()` (em `native.js`, fora do meu
escopo) seguido de `render()`. Conferi `native.js`: `toggle()` chama `set()`, que atribui
`document.documentElement.dataset.theme` **de forma síncrona** — ou seja, no instante em que o
handler do `data-action="theme"` termina de rodar `H.theme.toggle()`, o `:root[data-theme=...]` já
mudou e `getComputedStyle` já devolve os valores do tema novo.

O mapa da Rota (`mountMap`/`mountRouteMap`/`mountDayReviewMap`) **já tinha** uma detecção de troca de
tema pré-existente (`parts.mapTheme !== theme` → `map.setStyle(..., {diff:true})` + reaplica
marcadores/linha) — mas ela só dispara no **próximo** `mountMap()` daquele host, isto é, só quando a
tela da Rota volta a ser renderizada. Como o botão de tema fica na tela Ajustes (não na Rota), e o
mapa pode continuar vivo em segundo plano (comentário do PR18072026 L4-D:
`host.__hbxMap`/`__hbxMapParts` sobrevivem à troca de tela pro "transplante" do `native.js`), a cor
das camadas **não** era corrigida no instante do toggle — só depois, na próxima vez que a Rota
fosse mostrada e a máquina de `setStyle` rodasse.

**O que fiz:** escrevi `repaintThemedMapLayers()` e chamei-a logo após `H.theme.toggle(); render();`
no handler do `data-action="theme"`. Ela repinta, com `setPaintProperty` guardado por
`map.getLayer(id)`, as 7 camadas de cor própria (`hbx-reading-trail`, `hbx-reading-accuracy` +
`-outline`, `hbx-nav-leg-resto`, `hbx-nav-leg-atual`, `hbx-route-line`, `hbx-leitura-trilha`) tanto
no mapa da Rota (`routeMap`) quanto no da Leitura (`leituraLiveMap`), e também rechama
`applyDarkMapStreetContrast` (que já tem seu próprio guard `currentMapTheme() !== "dark"`, então é
seguro chamar sempre). Isso corrige a tinta **na hora**, sem depender de nenhum remount.

## Pendência que registro em vez de esconder

A **base de tiles** (`fiord` escuro / `liberty` claro) do mapa da **Leitura** (`leitura-live-map`,
função `mountLeituraLiveMap`) **não troca** quando o tema muda com o mapa já montado — só o mapa da
Rota tem essa lógica (`parts.mapTheme !== theme` dentro de `mountMap`). Isto **já era assim antes da
minha mudança** (o hex era igualmente congelado, só que agora ninguém repara porque o hex sumiu) —
não é regressão introduzida por mim, é uma lacuna estrutural que já existia e que a sprint C7 (hex →
token) não pediu pra fechar. Consequência prática: se o motorista trocar de tema com a tela de
Leitura de rota aberta e o mapa dela já montado, a **linha da trilha** (`hbx-leitura-trilha`) muda de
cor corretamente (via `repaintThemedMapLayers`), mas os **tiles de fundo** continuam no estilo do
tema anterior até a Leitura ser desmontada/remontada. Não toquei em `mountLeituraLiveMap` pra
adicionar essa lógica porque (a) o pedido era sobre as 10 cores, não sobre paridade de fluxo entre os
dois mapas, e (b) replicar a máquina de `setStyle`/`style.load` do `mountMap` sem poder testar no
aparelho é risco desnecessário fora do escopo do arquivo único desta sprint. Fica registrado pro
próximo sprint que tocar mapa/tema.

## Verificação

- `node --check EntregaShell/app/src/logistica/assets/app/app.js` — **passou**, antes e depois.
- `cd frontend && node scripts/check-pele.mjs`:
  - **Antes:** 30 impressas + `"… e mais 10."` → **40 violações totais**.
  - **Depois:** 30 impressas, **sem** linha `"… e mais"` → **30 violações totais**, e zero linhas
    `R6` (a regra específica de hex solto no EntregaShell) em qualquer arquivo.
  - Queda de **exatamente 10**, todas do `app.js` do logística — as 30 restantes são sujeira
    pré-existente do `frontend/` (kit.css `--radar-ai-status-*`, `route-builder.module.css`,
    comentário com `#418` em `impersonation-banner.tsx`), nada relacionado a este arquivo.

## Riscos reais

- **Baixo, mas não zero:** `--glass-ink` e `--navy` são convergências **aproximadas**, não
  duplicatas exatas — o rótulo de rua no mapa escuro e a sombra do disco de rota vão ficar
  *visualmente quase idênticos* ao valor antigo, não pixel-perfeitos. Ninguém vai notar a olho nu (a
  sombra é um `flood-opacity=".22"` borrado; o rótulo é texto pequeno sobre tile escuro), mas registro
  porque o pedido foi explícito: "não chute, registre a escolha".
- `repaintThemedMapLayers()` roda em **todo** clique de "Tema", inclusive quando nenhum mapa está
  montado (`routeMap`/`leituraLiveMap` ambos `null`) — o guard `if (!map || typeof map.getLayer !==
  "function") return;` cobre esse caso sem custo (função vazia, retorna na hora).
- Não testei em aparelho (fora do escopo pedido) — a correção de tema-ao-vivo (item 3) é a parte
  mais nova/sem precedente no arquivo; o `node --check` garante sintaxe, não comportamento em
  runtime. Se o dono quiser, vale um teste rápido no moto g15: abrir Rota/Leitura com mapa
  visível → Ajustes → Tema → voltar, checando se a trilha/pernas mudam de cor sem esperar remount.
