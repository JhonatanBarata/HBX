# Worker A — RESULTADO (S1 contrato · S2 movimento · S4 som · S5 disco)

Arquivos tocados (só os dois autorizados):
- `EntregaShell/app/src/main/assets/app/app.css`
- `EntregaShell/app/src/logistica/assets/app/app.js`

Commits locais, um por sprint, direto no `master` (sem branch, sem publish):
- `06c73793` — S1
- `4e481d90` — S2
- `66a9c388` — S5
- S4 não gerou commit — ver seção própria abaixo (nada pra corrigir).

⚠️ Nota operacional: durante a execução o dono (ou outro processo) editou
`app.js`/`app.css`/`app/build.gradle.kts`/`backend/.../logistica.service.ts` **em
paralelo**, ao vivo (layout "chegada" opção A, `historicoLinha`, versionCode).
Não toquei nesse conteúdo — cada commit acima foi montado com `git apply
--cached` sobre um patch recortado só dos meus hunches, então o trabalho do
dono continua intacto e não commitado no working tree, pronto pra ele
commitar quando quiser.

---

## S1 — ícone volta a carregar só geometria (`06c73793`)

**app.css linhas ~94-118** (bloco antigo ~94-131): removido o bloco de ~30
seletores que pintavam sub-elemento por posição no DOM (`> path:first-of-type`,
`> circle:last-of-type`...). Achado concreto, não só teórico: no chip de rede
(`chip-rede`, ícones `wifi`/`signal`), o glifo ficava **sempre azul**
(`--info`) porque o `stroke:` no filho vencia o `color:` do
`.hbx-chip.is-off` (vermelho) do componente — ou seja, o ícone mentia sobre o
estado real da conexão. Removido também `.btn-primary .hbx-icon > * { stroke:
currentColor }` (linha antiga 130-131), que só existia pra desfazer o próprio
estrago.

Conferi manualmente (não há lint automático pra este arquivo — `check-pele.mjs`
só cobre `frontend/src/`, não `EntregaShell/`) os usos soltos que dependiam da
cor por sub-elemento: `.delivery-arrived`, `.day-home-icon`, `.settings-row`
+ `.avatar`, `.hbx-chip.is-ok/.is-warn/.is-off`, `.search`, `.btn-secondary`,
`.route-follow-control` — todos já fixam `color`/`fill` própria no componente;
nenhum ficou sem contraste.

**app.css linha 56 (`:root[data-theme="dark"]`)**: `--info` não tinha par no
escuro (bug de tema confirmado no plano) — caía o azul de tema claro
`#0865df` sobre `--surface: #151c15`, contraste ~3,3:1. Adicionado `--info:
#4d9dff` (linha 56), mesma família, luminosidade alinhada com `--success`
(~65% L).

## S2 — movimento domado (`4e481d90`)

**app.js `replayIconMotion` (linha ~371)**: era global em qualquer
`pointerdown`/`click` que subisse até `button,a,[role='button'],[data-action],
[data-nav],[data-screen]` — na prática quase todo controle do app, inclusive
os 7 cards de segurar-pressionado (Lei 1: excluir É o hold). Agora só reage a
`[data-hbx-motion]`. Marcado nos 4 controles explícitos do plano ("refresh,
tema, play/stop"):
- `data-action="theme"` e `data-action="refresh"` (settings-row, linha 3652)
- `data-action="resume-route"`/`"finish-route"` no banner de rota pausada
  (linha 3490)
- `routeSatellite(...)` ganhou um 5º parâmetro `motion` opcional (linha 3546),
  usado só na chamada do satélite "Encerrar rota" (mesma ação de
  `finish-route`, agora com feedback também quando a rota está ativa, não só
  pausada).

**app.css `.hbx-icon.is-animating` (linha ~120-158)**: `animation-fill-mode:
both` → `backwards` em toda a família (10 declarações) — `both` congelava
`transform`/`filter` como identidade pra sempre, virando containing-block
eterno pra `position:fixed` de qualquer modal que nascesse depois dentro do
mesmo ícone (já cortou modal em 22/07). `app.js` limpa a classe sozinha no
`animationend` (linha 375), nunca mais fica presa.

**`stroke-dasharray: 64` → `1`** (app.css linha ~154) + `pathLength="1"` nos
3 glifos que usam a animação de "desenhar" (`route` linha 313, `check` linha
325, `volumeOff` linha 343 em app.js): antes um valor chumbado servia os três
com comprimentos bem diferentes; no mais curto o traço virava fade em vez de
desenhar.

**O "sobe e desce" ao criar rota**: `.lrt-endereco-loading-icon` pulsava pra
sempre (`lrt-gps-pulse 1.15s infinite`) atrás do ícone GPS durante "Recebendo
sinal do GPS…"/"Localizando endereço…". Removida a animação e o `:has()` que
escondia o anel de loading nesse estado — agora só o anel (`hbx-loading-spin`,
já existia, já é honesto/determinístico) é o indicador de espera; o ícone
virou estático (rótulo do que está acontecendo, não spinner). Keyframe
`lrt-gps-pulse` morto foi removido (sem outro uso no arquivo).

Varredura final: as únicas `animation: ... infinite` que sobraram são
`shimmer` (skeleton), `hbx-loading-spin` (spinner ×2) e
`route-current-location-pulse` (ping do ponto no mapa — mantido de propósito,
é padrão de mercado e não é ícone de UI). Nenhuma sobra em elemento com
`.hbx-icon` dentro.

## S4 — 1 gesto = 1 som (sem commit — auditoria não achou violação)

Auditei os 11 call sites de `H.sound(` listados no plano (linhas ~1883, 2642,
3281, 3987, 4002, 4015, 4624, 4986, 5106, 5161, 6553) e o listener
`[data-day]` do `render()` (o único `addEventListener` direto dentro de
`render()`). **Todos já seguem a regra** ("som no fato, depois do await, com
`toast(..., {mudo:true})` quando o mesmo gesto já tocou som específico"):

- `route_start` (linha 4624, `activateNativeRoute`) já tem o guard
  `inicioReal` com comentário datado de 22/07 explicando exatamente o bug "som
  tocava 2x (Iniciar e Continuar rota)" — **este é o commit `19a4141b`**, que
  já estava no `master` antes desta sessão começar.
- `sync_pending`/`sync_complete`, `creditsLock` (3 sites), `confirmDelivery`,
  `performEncerrarRota`, `uploadProof`, `pause_detected` — todos guardados por
  flag de transição (`wasLocked`/`jaPendente`/`hadPending`) e com `mudo` no
  toast irmão quando aplicável.
- Nenhum outro `addEventListener` é re-registrado sem guarda dentro de função
  chamada pelo `render()`.

Conclusão: o bug "som tocando 2x" que o dono relatou em 22/07 **já estava
corrigido** pelo commit imediatamente anterior a esta frente (`19a4141b`) mais
a leva de sprints "PR22072026-APP-SOUNDS" (S1-S7, já em prod conforme
memória). Não decidi inventar trabalho pra preencher o sprint — implementei
exatamente o que a auditoria pedia (ler e conferir), não achei violação, não
criei um fix cosmético pra justificar um commit vazio.

## S5 — disco de rota nasce do catálogo (`66a9c388`)

**app.js `routeTransmuxControl` (~linha 3564-3590)**: os símbolos
play/gps/stop eram 3 `<path>` desenhados à mão com hex cravado (`#fff`,
`#168be8`, `#e10a1d`, `rgba(8,101,223,.22)`, `rgba(223,7,26,.14)`) — o botão
mais visível do app pintando a própria cor. Trocado pela geometria do
catálogo `paths`, escalada da grade 24 pro viewBox 120 (fator 5):
- `play` → `polygon points='40 25 97.5 60 40 95'` (mesmo triângulo de
  `icon("play")`, centróide a ~0,8px do centro do disco — negligível)
- `stop` → `rect x=30 y=30 width=60 height=60 rx=12.5` (mesmo `rect` de
  `icon("stop")`) — larga o octógono de placa + barra vermelha
- `gps` → `polygon points='15 55 110 10 65 105 55 65 15 55'` (glifo
  `navigation`, a seta "me leve" que Waze/Maps usam)

Cor saiu 100% pra `app.css`: novo token `--route-icon-on: #fff` (linha 369,
sem par dark — o disco é cor fixa de marca nos dois temas, mesmo padrão já
usado por `--cta`/`--route-icon-nav`/`--route-icon-stop`) + reaproveitado
`--route-icon-nav` pro ponto do pin. Disco continua **sólido**: o catálogo dá
só a silhueta, quem preenche é a classe (`.play-symbol polygon` etc., app.css
linha ~715-716), nunca o contorno de traço 1.8 cru.

### Ressalvas visuais (leia antes de aprovar o S5 sem olhar o aparelho)

1. **Rotação da seta `gps` não foi recalibrada.** As regras
   `rotate(-44deg)/rotate(48deg)/rotate(32deg)` por estado (app.css linhas
   ~723-737) foram calibradas visualmente pro glifo antigo (uma forma tipo
   bússola desenhada à mão). O catálogo `navigation` do Lucide aponta por
   padrão pra nordeste (~45°), não necessariamente na mesma orientação de
   repouso do glifo antigo. Mantive os graus EXATAMENTE como estavam (não
   inventei número sem ver o resultado) — o dono precisa olhar a transição
   pro estado "gps" no aparelho e, se a seta nascer torta, é só ajustar o
   `rotate()` de `.gps-symbol` nos 3 estados.
2. **Perdeu o sombreado interno** que `gps`/`stop` tinham (o path/rect em
   opacidade baixa dentro do símbolo, dando um relevo sutil). Isso é
   INTENCIONAL e consistente com a decisão de 22/07 já registrada no arquivo
   ("Fundo CHAPADO por estado... O aro branco, o anel interno e o brilho
   falso saem") — o catálogo só tem 1 shape por ícone, não 2. Se o dono achar
   o símbolo chapado demais depois de ver no aparelho, é decisão de design
   nova, não bug.
3. Conforme o plano pediu: implementei pelo catálogo mesmo sem poder
   confirmar visualmente se fica melhor que o octógono antigo — **não decidi
   sozinho manter o octógono**. O dono julga com o olho dele; reverter é 1
   commit (`66a9c388`) isolado dos outros 2.

## O que NÃO precisou (e por quê) de arquivo do worker B

Nenhuma correção do S1/S2/S4/S5 dependeu de `native.js` ou
`mobile-contract.js`. Não precisei anotar pendência pro worker B.

## Pendências gerais / achados fora de escopo (não mexidos)

- `.route-cancel-icon, .route-nav-external { color: var(--text); ... }`
  (app.css) usa um token `--text` que **não existe** em lugar nenhum do
  arquivo — provavelmente resquício de um rename. Na prática não quebra nada
  visível (custom property inválida cai pro valor herdado, que acaba sendo
  `--ink` via `body`), mas é uma declaração morta/confusa. Fora do escopo
  desta frente (não é ícone, não é movimento, não é som, não é o disco) —
  registrando só como achado, não mexi.
