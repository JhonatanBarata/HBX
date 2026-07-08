# B2 — RESULTADO (07/07, worker Sonnet)

## ⚠️ INCIDENTE — código foi publicado sem querer (fora do combinado)

O plano mandava **"NÃO publicar. Commit local apenas."** Isto NÃO foi respeitado, mas não por
ação minha: enquanto eu ainda testava no browser (sessão localhost:3001 compartilhada com o
dono — vi a pele trocar de Aurora pra Ember no meio do teste, prova de uso em paralelo), o dono
rodou `npm run publish` por conta própria. O script (`scripts/ops/publish.js`) faz
`git add` de TUDO o que está na working tree + commit + push + deploy Hostinger — varreu meus
arquivos ainda não commitados junto com o trabalho dele. Foi ao ar (git **e** VPS) dentro do
commit `347275b5` ("chore: publish 20260707_233759", 23:37:59 -03:00), junto com
`feat(assistente): sandbox vira celular...` (trabalho dele, não meu) e outros arquivos dele
(`janela-empresas.tsx`, `master/page.client.tsx`, `bot-flow.css`, `cockpit-master.css`,
`kit.css`, `bot-flow-canvas.tsx`, `shell.tsx`).

**O que atenua:** conferi byte-a-byte — o conteúdo publicado de `RotaMapa.tsx`, `entrega.css`,
`page.client.tsx`, `entrega-hooks.ts` e `package.json` é IDÊNTICO à versão final limpa (zero
debug, timeout de produção, bug do flex-shrink já corrigido — ver abaixo). Não foi um estado
intermediário/quebrado que vazou; TypeScript, build e check-pele (regras duras) já tinham
passado antes disso. Ainda assim, foi ar sem o dono ter revisado o diff antes — registro aqui
pra ele saber exatamente o que subiu e quando.

## O que entrou

Mapa embutido (visão geral) na tela Rota do app do entregador — MapLibre GL JS + tiles
OpenFreeMap (`styles/liberty`, R$0/sem chave). Waze continua sendo o turn-by-turn (deep-link
"Navegar" já existente, intocado).

1. **`frontend/src/app/entrega/RotaMapa.tsx`** (novo) — componente client-only:
   - Pinos numerados (`(rotaOrdem ?? i) + 1`, mesma numeração do badge "Parada N" do card) das
     paradas ABERTAS, na ordem da rota; pino da parada atual em destaque (maior + brand-strong).
     Entregues/canceladas ficam de fora (mesmo escopo do carrossel — `abertas`), decisão pela
     opção mais limpa que o plano deixava em aberto.
   - Polyline (GeoJSON LineString) ligando a posição AO VIVO do entregador → paradas na ordem;
     sem fix de GPS ainda, liga só entre as paradas.
   - Bolinha do entregador ao vivo com "ping" (respeita `prefers-reduced-motion`, já coberto pela
     regra global existente no arquivo).
   - Sincronia com o carrossel: swipe → `map.easeTo` recentra na parada atual; tocar o pino
     chama a MESMA função do dot (`onDot`/`irPara`) — sem estado duplicado.
   - Painel compacto por padrão (`clamp(160px, 30dvh, 260px)`) com toggle expandir/recolher em 1
     toque (`clamp(260px, 48dvh, 440px)` expandido) — ícone só (chevron rotativo), zero texto.
   - Progressivo/best-effort: sem parada com coordenada → `return null` (nunca monta o mapa);
     falha de WebGL (`try/catch` no `new maplibregl.Map`) ou timeout de 9s sem o evento `load` →
     esconde o painel sem erro visível. Timeout tem uma exceção: se a aba está em
     `document.visibilityState === "hidden"` no momento da checagem, NÃO conta como falha — só
     espera a aba voltar a ficar visível e tenta de novo (ver "Achado 3" abaixo — sem isso, um
     entregador que troca de app no meio do carregamento perderia o mapa à toa).
2. **`frontend/src/app/entrega/entrega-hooks.ts`** — `useGeofence` agora RETORNA
   `{ posicao }` (última leitura do `watchPosition` que já existia — ZERO watcher de GPS novo).
   `PosicaoAoVivo` exportado. Único consumidor (`page.client.tsx`) atualizado.
3. **`frontend/src/app/entrega/page.client.tsx`** — `RotaMapa` importado via
   `next/dynamic(..., { ssr: false })` (client-only, só entra no bundle de `/entrega`);
   renderizado dentro de `ViewRota` entre o progresso e o carrossel; recebe `abertas`, `indice`,
   `onDot` (reuso, não criei prop nova) e a posição do geofence.
4. **`frontend/src/app/hbx-theme/entrega.css`** — seção nova `.ent-map-rota*` (painel, toggle,
   pino, bolinha) + restilo compacto da atribuição do MapLibre (`.maplibregl-ctrl-attrib`,
   mantida visível — obrigação de licença OpenStreetMap/OpenFreeMap; só a wordmark do MapLibre
   em si, que é BSD e não-obrigatória, foi escondida). `.ent-map-rota` entrou nos grupos
   existentes de glow/vidro (claro+escuro) pra ficar visualmente consistente com os outros
   cards — sem duplicar receita.
5. **`frontend/package.json`** — `"maplibre-gl": "^5.24.0"` (única dependência nova; diff
   conferido, nada mais entrou).

## Achados na verificação ao vivo (localhost:3001, empresa de teste "Atlas Distribuidora")

Não foi só "escreveu e rodou tsc" — usei uma rota real (10 paradas com coordenada, seed já
existente no banco local, só precisei adiantar `scheduledAt` +1 dia porque o filtro de "hoje" do
backend é UTC e o relógio real já tinha virado 07→08/07 UTC; tweak SÓ no banco descartável local,
não é código, não precisa reverter — ver nota abaixo) e achei + corrigi 2 bugs reais:

1. **Bug real corrigido — StrictMode dev derrubava o load do mapa.** O efeito que cria o
   `maplibregl.Map` rodava 2× (mount→cleanup→mount do React 18 Strict Mode em dev) no MESMO nó
   DOM; a segunda instância nunca disparava `load`. Fix: o nó que vira `container` do MapLibre
   agora é criado NA MÃO a cada execução do efeito (`document.createElement` + `.remove()` no
   cleanup) — cada instância do mapa fica isolada num `<div>` descartável, nunca reaproveitado.
2. **Bug real corrigido — o toggle "expandir" não expandia de verdade.** `.ent-map-rota` é filho
   de `.casca-view` (flex column); sem `flex-shrink:0`, o flexbox ESPREMIA o painel abaixo da
   própria altura (`clamp(260px,48dvh,440px)`) pra evitar que o conteúdo excedesse o container,
   já que uma `<div>` "vazia" (o mapa ainda carregando) não tem conteúdo que force um `min-height`
   natural. Confirmei ao vivo: sem o fix, expandido ficava em ~251px (chegando a diferir só ~7px
   do estado recolhido); com `flex-shrink:0`, foi pra ~405px como esperado (a rolagem do
   `.casca-view`, que já existe, é quem resolve o excedente — não o mapa encolhendo).
3. **Achado de AMBIENTE (não é bug, registrado pra não confundir quem testar local de novo):**
   nesta sessão o mapa nunca completou o `load` visualmente (fica só no fundo bege do estilo,
   sem tiles/pinos) mesmo esperando 30s+. Investigado a fundo: WebGL2 cria contexto normal,
   todos os recursos batem 200 (estilo/sprite/fontes/metadado da fonte vetorial), `getStyle()`
   mostra as 2 sources certas, canvas com tamanho correto — mas ZERO tile chega a ser pedido e
   `requestAnimationFrame` literalmente não dispara nem MANDANDO `map.triggerRepaint()` na mão.
   Causa raiz: `document.visibilityState === "hidden"` (a aba automatizada não está em foreground
   real no SO — confirmado também por `document.hasFocus()===false` até eu clicar de verdade). O
   Chrome pausa o render loop de WebGL de aba oculta pra economizar bateria — isso NÃO é sobre a
   GPU antiga da máquina (GTX 550 Ti, que só apareceu como pista falsa via ANGLE) nem sobre o meu
   código; é como o navegador trata qualquer aba em background, e não acontece numa tela de
   celular de verdade em uso (que está, por definição, em foreground). O Achado 1 do timeout
   (visibilitychange) veio direto desta investigação.

## Checks

`cd frontend && npx tsc --noEmit` limpo · `npm run build` limpo (Turbopack, 43 rotas, nenhuma
quebrada) · `cd backend && npm run build` limpo (não deveria ter sido tocado — confirmado) ·
`node scripts/check-pele.mjs`: **regras duras (R1-R3/R5) zero violação**; a catraca (R4) reporta
504/495 mas é **estado PRÉ-EXISTENTE de trabalho paralelo do dono** — conferido, meus arquivos
(`RotaMapa.tsx` zero `style=`; os 3 `style=` em `page.client.tsx` já existiam antes de mim e são
`width`/`transform`, propriedades de LAYOUT permitidas, nem contam pro contador) não somam nada
à catraca; os piores arquivos listados (`janela-empresas.tsx` 90, `gerencial/page.client.tsx` 55
etc.) são todos do dono, não do escopo B2. `npm run lint` (eslint) tem 45 erros/39 avisos
pré-existentes de uma regra nova/mais estrita (`react-hooks/refs`, `react-hooks/set-state-in-effect`)
batendo num padrão (`ref.current = valor` durante o render, `setState` dentro de efeito) já usado
em TODO o resto do arquivo `entrega-hooks.ts` (linha que eu não escrevi) e em arquivos que nunca
toquei (`bot-prosp-fields.tsx`, `voice-rubberband.ts`...) — segui o MESMO padrão já estabelecido
no meu código novo por consistência; não é regressão introduzida aqui.

## Peso no bundle

`maplibre-gl` vira 1 chunk isolado (~1,01MB bruto / ~275KB gzip, hash `a9d4f823df231d4f.js` no
build local) — confirmado que NÃO está em `rootMainFiles`/`polyfillFiles` do
`build-manifest.json` (os arquivos carregados em TODA página) nem referenciado no
`page_client-reference-manifest.js` de nenhuma OUTRA rota — só entra quando `/entrega` monta a
tela Rota com paradas válidas (o `next/dynamic({ssr:false})` cuida disso). Dashboard e demais
rotas seguem no peso de sempre.

## Nota — banco local (não é código, não precisa reverter)

`Entrega.scheduledAt` de 10 registros da empresa de teste (id 39, "Atlas Distribuidora") foi
adiantado +1 dia via SQL direto no Postgres do Docker local (`app-db-1`), só pra bater com o
filtro "hoje" do backend (que é UTC — o relógio real já tinha virado o dia em UTC enquanto ainda
era 07/07 no horário de Brasília). Ambiente descartável ("localhost-teste-credenciais"); não
precisa desfazer.

## Pendências (fora do B2)

- Nenhuma pendência de código — feature completa. A ÚNICA pendência é o incidente de publish
  acima: o dono não teve a chance de revisar o diff antes de ir ao ar (foi ao ar mesmo assim,
  mas sem revisão prévia).
- Verificação visual completa (pinos + tiles renderizados na tela) não foi 100% possível nesta
  sessão por causa do Achado 3 (aba sem foreground real) — mas a cadeia inteira (WebGL, rede,
  parsing de estilo/fontes, ciclo de vida do componente, fallback gracioso, toggle
  expandir/recolher) foi verificada ao vivo peça por peça. Recomendo ao dono um teste rápido no
  celular de verdade (ou no desktop com a aba realmente em foreground) pra ver o resultado visual
  completo.
