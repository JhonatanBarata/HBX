# Worker B — RESULTADO (S3 fim da piscada)

Commits locais (master, sem publish):
- `3244b321` — `fix(apk): S3a reconciliar .content por filho em vez de trocar a tela inteira`
- `1d11848e` — `fix(apk): S3b domar o MutationObserver que se auto-alimentava na folha de entrega`
- `67875ddf` — `fix(apk): S3a corrigir alcance da guarda de foco (tela travava com teclado aberto)`
  — correção pós-revisão do orquestrador, ver seção dedicada logo abaixo. **Este é o commit que
  importa mais para o teste**: sem ele, digitar em qualquer campo dentro de `.content` (teclado
  aberto) travava a tela inteira em vez de só piscar.

Arquivos tocados (só os dois autorizados): `EntregaShell/app/src/main/assets/app/native.js`,
`EntregaShell/app/src/logistica/assets/app/mobile-contract.js`.

---

## S3a — `.content` reconciliado por filho (`native.js`)

### O que mudou

- `native.js:120-249` — nova função `hbxReconciliarConteudo()` (+ helpers `hbxChaveDoNo`,
  `hbxChavearLista`, `hbxSincronizarAtributos`, linhas 68-108), em escopo de módulo, fora do
  `mount()`.
- `native.js:511` — o antigo `if (nextContent && contentChanged) content.replaceWith(nextContent)`
  virou `hbxReconciliarConteudo(content, nextContent, HBX_CONTEUDO_PROFUNDIDADE_MAX, transplantarMapa)`.
  O `<main class="content">` em si **nunca mais é trocado** — só o que está dentro dele.
- `native.js:472-488` (comentário) — a chamada única e incondicional
  `if (contentChanged) transplantarMapa("route-live-map", template.content)` **foi removida**. Isso
  não era cosmético: com reconciliação fina, `contentChanged` vira `true` por causa de QUALQUER
  pedaço do `.content` (ex.: um card mudou de status do outro lado da lista), não só quando o ramo
  do mapa muda. A chamada antiga arrancaria o mapa vivo do lugar certo e o prenderia dentro do
  template descartado toda vez que isso acontecesse — a tela ficaria com "Carregando mapa…" para
  sempre, mesmo com o mapa tecnicamente "vivo" só que órfão. O transplante do `#route-live-map`
  agora só acontece dentro da própria reconciliação (`native.js:174`, `200`, `241` — no ponto exato
  em que um nó vai mesmo ser trocado/inserido), exatamente a mesma regra que já valia para
  `#route-plan-preview-map` nos overlays.

### CORREÇÃO pós-revisão (`67875ddf`) — a guarda de foco tinha o alcance errado

O orquestrador revisou o S3a e achou um defeito real, que corrigi antes de qualquer teste do
dono. Registro aqui porque é a mudança mais importante do lote:

- **O defeito**: a guarda de foco original ficava no TOPO da função, como
  `if (vivo.contains(document.activeElement)) return;`. A 1ª chamada de `hbxReconciliarConteudo`
  (feita por `mount()`, `native.js:511`) recebe `vivo = .content` **inteiro**. `contains()` inclui
  qualquer descendente em qualquer profundidade — então bastava UM campo com foco em QUALQUER
  lugar do `.content` (o normal de teclado aberto: observação da leitura, valor em dinheiro, nome
  do cliente — `logistica/app.js` tem `focusedControlSnapshot()`/`restoreFocusedControl()` em
  volta do mount e um listener de `focusin` justamente porque isto acontece o tempo todo) pra essa
  1ª chamada retornar na hora e a **TELA INTEIRA parar de reconciliar** enquanto o entregador
  digitava. Na prática eu tinha trocado piscada por tela congelada — pior, porque não é óbvio que
  travou.
- **O conserto**: a intenção original (não arrancar o cursor no meio do gesto) estava certa, só o
  ALCANCE estava errado — proteção de foco tem que ser de FOLHA, não de RAMO.
  1. A guarda do topo (`native.js:149`) virou `if (vivo === document.activeElement) return false;`
     — só o nó QUE É o foco bloqueia. Recursar por dentro de um ancestral do campo focado é
     inofensivo: o próprio campo se protege quando chegar a vez dele nesta mesma checagem.
  2. `contains()` voltou, mas só nos dois pontos que REALMENTE destroem o nó — os dois
     `replaceWith` (`native.js:169` estrutura diferente, `native.js:199` teto de profundidade
     estourado): se há foco em qualquer descendente ali, não troca, fica atrasado até o foco sair.
     Perder o cursor do entregador é pior que um ramo desatualizado por alguns segundos.
  3. O patch de folha (`native.js:189`, `innerHTML`) e `hbxSincronizarAtributos` (`native.js:180`)
     continuam livres de guarda — a checagem `===` do item 1 já barra o nó focado, e a `contains()`
     do item 2 já barra o ramo dele; folha não tem filho pra esconder outro foco.
- **Segundo problema, do mesmo tronco**: `vivo.__hbxGen = html` era carimbado no ancestral mesmo
  quando um descendente tinha sido PULADO (por foco ou por mapa vivo). O ancestral passava a
  afirmar "estou igual ao novo" sem estar, e o `if (vivo.__hbxGen === html) return` do próximo
  render saía cedo — o ramo pulado ficava errado **pra sempre**, só consertava quando a marcação
  mudasse de novo por outro motivo, nunca quando o foco saía. Conserto: `hbxReconciliarConteudo`
  agora devolve `true`/`false` ("reconciliei este nó por completo"). Quem pula (foco em
  `native.js:130`/`149`/`169`/`199`, mapa vivo em `native.js:130`) devolve `false`; o laço de
  filhos (`native.js:226-246`) só deixa o pai carimbar `__hbxGen` (`native.js:247`) se TODOS os
  filhos voltaram `true` — senão o pai também devolve `false`, propagando até o topo. Assim o ramo
  pendente é reavaliado a cada render seguinte, até o foco sair de verdade.

### Como funciona (resumo técnico, já com a correção acima)

Por nó, recursivamente, com teto de profundidade `HBX_CONTEUDO_PROFUNDIDADE_MAX = 5`:
1. **Mapa vivo (`vivo.__hbxMap`) → nunca reconcilia por dentro, devolve `false`** (`native.js:130`).
   Motivo: o maplibre injeta canvas/controles reais como filhos do host; nenhum bate por chave com
   o `<span class="route-map-loading">` que a marcação gerada assume como filho. Reconciliar por
   dentro apagaria os filhos de verdade do mapa. Só um ANCESTRAL sendo trocado pode mexer nele —
   e aí é o `transplantarMapa()` daquele ponto que resgata o mapa antes da troca.
2. **O NÓ É o foco (`vivo === document.activeElement`) → não toca, devolve `false`**
   (`native.js:149`). Só o campo em si bloqueia; um ancestral dele reconcilia normalmente por
   dentro (ver correção acima).
3. **`__hbxGen` bate com o que eu mesmo gerei da última vez → não toca, devolve `true`**
   (`native.js:158`) — o nó vivo sofre mutação depois do mount (mapa, foco, scroll) e nunca mais
   bateria comparando com `vivo.outerHTML`; por isso a comparação é sempre contra o que a própria
   função gerou.
4. **Tag diferente, campo de formulário (INPUT/TEXTAREA/SELECT), ou virou folha/deixou de ser →
   se há foco em algum descendente, não troca (`false`, `native.js:169`); senão troca o nó inteiro
   e devolve `true`** (`native.js:162-178`). Campo de formulário é sempre replace (quando não há
   foco) porque o atributo `value` não reflete o que o usuário já digitou — um patch fino mostraria
   valor errado sem avisar.
5. **Folha (sem filhos-elemento) → `innerHTML` só se mudou, devolve `true`** (`native.js:182-192`).
   É o caso do tique de GPS: distância, ETA, texto do badge.
6. **Teto de profundidade estourou num galho → se há foco em algum descendente, não troca (`false`,
   `native.js:199`); senão troca só aquele galho e devolve `true`** (`native.js:194-204`).
7. **Galho normal → reconcilia filhos por chave** (`native.js:206-248`): chave estável
   (`data-delivery`/`data-client`/`id`) com fallback classe+ordem (mesma técnica dos overlays);
   remove o que sumiu, insere o que nasceu, reordena quem sobreviveu mas mudou de posição (linha
   233 — sem isto uma fila reordenada por proximidade ficaria com o conteúdo certo na ordem
   errada), sincroniza atributos via `getAttribute`/`setAttribute` (nunca `.className` — em nó SVG
   isso lança `TypeError` em strict mode), e só carimba `__hbxGen` do próprio galho
   (`native.js:247`) se TODO filho devolveu `true` (senão propaga `false` — ver correção acima).

Profundidade 5, não os "3-4" sugeridos na ordem de serviço: medi a estrutura real do
`stopCard()` (`logistica/app.js:3558-3561`) e o caminho até o texto é `.content` → `.list` →
`<article data-delivery>` → `.stop-top` → `.card-main` → texto = 5 níveis. Com teto 4 o
reconciliador estourava exatamente 1 nível ANTES de chegar no nome/endereço/badge do card — ou
seja, trocaria `.card-main` inteiro (pequeno, mas não o ideal) toda vez que qualquer texto dele
mudasse, em vez de reescrever só o `<span>`/`<small>` que mudou. Com 5, o texto do card recebe o
patch fino de verdade. A recursão continua limitada (não é "sem teto"), só que no número que os
dados da tela pedem.

### Onde isto pode quebrar — leia antes de testar

1. **Qualquer parte de `.content` que tenha DOM injetado por FORA da marcação gerada** (algo que
   `render()` não conhece e que só existe porque uma função imperativa mexeu direto no nó) vai ser
   tratado como "estrutura diferente" no próximo render e substituído — se essa parte tiver estado
   próprio (não é o caso do mapa, que já está protegido pelo guard `__hbxMap`), o estado se perde.
   Não encontrei outro caso assim em `app.js`, mas não land audit exaustivo das 6000+ linhas.
2. **O teto de profundidade 5 é medido em CIMA da estrutura da tela Rota** (a mais visitada e a
   que dispara pelo GPS). Telas com nichos mais profundos (Clientes, Vendas, catálogos com
   wizard) podem ter o texto-alvo um ou dois níveis abaixo do teto — nesse caso o comportamento
   cai pra "troca o galho pai inteiro", que é seguro (não é a tela toda) mas não é o patch mais
   fino possível. Não é bug, é o teto fazendo seu trabalho; só significa que a tela Rota é a que
   ganha o efeito completo primeiro.
3. **Reordenação de lista** (`native.js:233-234`) usa `insertBefore` no nó VIVO (não clona) —
   por spec do DOM isso preserva foco/estado do nó movido, mas é a parte menos testada
   manualmente deste reconciliador.
4. **O que o dono deveria olhar primeiro no teste real** (ordem importa — o item (a) é o teste
   nº1 depois do incidente da guarda de foco):
   (a) **tocar num campo de texto (observação, valor em dinheiro, nome do cliente) e DEIXAR O
   TECLADO ABERTO enquanto uma atualização de GPS acontece ao fundo** — confirmar que (i) o cursor
   não pula e o que foi digitado não se perde, e (ii) o RESTO da tela (distância/ETA de outros
   cards, badge de status) continua atualizando normalmente enquanto o teclado está aberto — este
   é exatamente o caso que travava a tela inteira antes de `67875ddf`;
   (b) criar uma rota e confirmar que a tela NÃO pisca mais durante o GPS ativo (o sintoma
   original);
   (c) com uma rota ativa e o mapa carregado, deixar rodar uns minutos — inclusive com algum campo
   focado durante parte desse tempo — e confirmar que o mapa CONTINUA lá (não vira spinner de novo)
   — é o ponto onde um reconciliador ruim quebraria pior e de forma menos óbvia;
   (d) alternar os filtros da lista de paradas (Fila/Entregue/Avulsos) algumas vezes seguidas e
   confirmar que os cards não embaralham/duplicam.

### Idempotência a jusante — o que eu conferi (não é meu arquivo, só relato)

A ordem de serviço pedia para eu verificar se código pós-mount em `app.js` deixaria de ser
idempotente com MAIS nós sobrevivendo. Chequei os padrões de `querySelectorAll` +
`addEventListener`/`insertAdjacentHTML` fora da delegação global (`app.addEventListener` em
`document`/`window`/`app` — esses já eram seguros por serem ligados 1x no boot, não por render):
- `attachMoneyInput` (`logistica/app.js:1616-1622`) já tem o guard `__hbxMoneyBound`.
- `enhancePaymentForms` → `.lead-card[data-client]` (`logistica/app.js:4400-4407`) já tem o guard
  `__hbxScheduleLine`.
- `[data-day]` buttons (`logistica/app.js:4452-4460`) já tem o guard `__hbxDayBound`.

Os três já existem e já foram adicionados em 22/07 antecipando exatamente isto (o comentário em
`logistica/app.js:4448-4451` já cita "o mount() agora pula a troca do .content" como motivo). Não
precisei pedir nada novo ao worker A — a base já estava preparada. **Não é auditoria exaustiva**:
se aparecer algum sintoma de "dobrou" (vibração 2x, contador subindo 2x, dígito de dinheiro
duplicando) em uma tela que eu não testei, o padrão a procurar é `querySelectorAll` seguido de
`addEventListener`/`insertAdjacentHTML` sem um guard `__hbx*` — mas isso é edição em `app.js`,
fora do meu escopo (ver pendências abaixo).

---

## S3b — MutationObserver domado (`mobile-contract.js`)

### O que mudou

- `mobile-contract.js:258-294` — o `observer.observe(document.documentElement, {...})` virou
  `observer.observe(observerRoot, {...})` com `observerRoot = document.getElementById("app") ||
  document.documentElement` (linha 292) — `#app` existe estático no `index.html` antes dos
  scripts carregarem, então a busca é síncrona e segura.
- O callback do observer deixou de ser `() => refreshVisibleSheet()` direto e virou
  `agendarRefreshVisibleSheet` (linha 281-289): coalesce em `requestAnimationFrame` com a flag
  `hbxRefreshSheetAgendado` — não importa quantas mutações cheguem no mesmo quadro,
  `refreshVisibleSheet()` roda no máximo 1x por quadro.
- `mobile-contract.js:148-159` — dentro de `renderReceiptPanel`, `confirm.disabled` só é escrito
  se o valor mudou (`deveDesabilitar`); `classList.toggle(cls, force)` já era idempotente por
  spec (não precisou de guarda extra).

### Por que isto NÃO era loop infinito, mas custava caro

O `MutationObserver` estava configurado só com `{ childList: true, subtree: true }` — **sem**
`attributes: true`. Isso significa que `confirm.disabled = ...`/`classList.toggle(...)` nunca
disparavam o observer de volta (atributo não é observado). O que disparava era o `innerHTML` do
painel e o `insertAdjacentElement`/`remove()` — e esses já tinham o guard de `signature`
(`mobile-contract.js:128`) que impedia reescrever à toa. Então a cadeia real era: mutação externa
→ `refreshVisibleSheet()` → (se mudou) `innerHTML`/insert/remove → dispara o observer de novo →
`refreshVisibleSheet()` de novo → bate o guard de `signature`, não reescreve nada → some. No
máximo 2 execuções por mudança real, nunca infinito — exatamente como a ordem de serviço já
diagnosticava. O problema de verdade era a callback rodar a CADA mutação childList do documento
inteiro, inclusive durante um `render()` inteiro (centenas de mutações antes do S3a). A correção
de S3b ataca isso: menos observações (escopo menor) e no máximo 1 execução por quadro.

### Onde isto pode quebrar

- **Atraso de 1 quadro (~16ms) entre a folha de entrega aparecer e o painel "Como recebeu?"
  aparecer/atualizar**, quando o gatilho vem de uma mutação QUE NÃO seja o clique direto nos
  botões Pix/Dinheiro/Fiado (esses continuam síncronos — `mobile-contract.js:240` chama
  `renderReceiptPanel(sheet)` direto, sem passar pelo observer). Imperceptível a olho, mas é a
  mudança de comportamento a verificar: abrir a folha de uma entrega com financeiro "aberto"
  ativo e confirmar que o painel aparece junto, sem atraso visível.
- Se alguma outra tela do app depender de mutação FORA de `#app` (por exemplo algo que mexesse em
  `<body>`/`<html>` e devesse acordar `refreshVisibleSheet`), o escopo mais estreito deixaria de
  reagir. Não encontrei nenhum caso assim — `.delivery-sheet` é sempre um `.sheet-wrap` filho
  direto de `#app` (mesmo padrão dos overlays em `native.js`) — mas é a hipótese a descartar se o
  painel de recebimento algum dia parecer "não atualizar".

---

## Pendências que caem em arquivos do worker A (app.css / logistica/app.js)

Nenhuma mudança MINHA exigiu mexer nesses arquivos — as guardas de idempotência que a reconciliação
fina precisa (`__hbxDayBound`, `__hbxMoneyBound`, `__hbxScheduleLine`) **já existem**, adicionadas
em 22/07 antecipando este trabalho. Não encontrei nenhum ponto novo que exigisse um guard que
ainda não existe. Registro mesmo assim, por transparência, o único item que é uma decisão de
produto (não um bug) e que também não é meu escopo:

- **Depende do dono/worker A decidir se vale**: se o profiling em aparelho real mostrar que a
  tela Clientes/Vendas (estruturas mais aninhadas que a Rota) ainda troca galhos maiores do que o
  ideal, a alavanca é simplificar o aninhamento de wrappers nesses templates (menos `<div>`
  encapsulando `<div>` sem propósito visual) — não é algo que eu deva decidir sozinho nem que
  peça mudar `HBX_CONTEUDO_PROFUNDIDADE_MAX` de novo (o número já reflete o dado real da tela mais
  usada).

---

## Honestidade sobre risco

Este é o pedaço mais perigoso do PR, como a ordem de serviço já dizia, e eu concordo com a
avaliação. Não testei no aparelho (proibido pela ordem de serviço). Os pontos que eu NÃO
conseguiria validar sem rodar de verdade: (1) o transplante do mapa sobrevivendo a várias dezenas
de renders reais em sequência com GPS ligado — a lógica está correta no papel e eu tracei os 3
caminhos (ramo intacto / ramo trocado / novo nó) à mão, mas maplibre é uma biblioteca externa com
comportamento próprio que só se confirma ao vivo; (2) a reordenação de lista com `insertBefore`
em nó focado — o comportamento de preservação de foco em `insertBefore` é padrão de spec, mas o
WebView do Android historicamente já teve implementações excêntricas de coisas "padrão". Peço que
o dono trate os itens 4(a)-4(d) da seção S3a como o roteiro mínimo de teste, na ordem dada.
