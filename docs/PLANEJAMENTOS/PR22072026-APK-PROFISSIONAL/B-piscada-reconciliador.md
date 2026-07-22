# Worker B — S3 fim da piscada

Arquivos que você pode tocar (**só estes dois**):
- `EntregaShell/app/src/main/assets/app/native.js`
- `EntregaShell/app/src/logistica/assets/app/mobile-contract.js`

**NÃO** encoste em `app.css` nem em `logistica/assets/app/app.js` — worker A está neles. Se sua
correção exigir mudança lá, **não faça**: descreva no RESULTADO e o orquestrador aplica depois.

---

## Contexto — o que já foi feito e por que não bastou

Em 22/07 o `mount()` do `native.js` (~214) ganhou o primeiro freio da piscada: compara a
MARCAÇÃO GERADA com a do render anterior e, se nada mudou, não encosta no DOM. Os overlays já são
reconciliados peça a peça. Isso matou o caso "toast entra e sai = 2 reconstruções".

**O que sobrou** (linha ~283):

```js
if (nextContent && contentChanged) content.replaceWith(nextContent);
```

`contentChanged` é `true` se **um único byte** da marcação do `.content` mudou. Durante uma rota
ativa o GPS atualiza distância/ETA/ordem das paradas a cada tique — então a tela INTEIRA é
destruída e recriada de segundo em segundo. Consequências visíveis:
- tudo que estava animando recomeça do zero, ritmadamente → é o "sobe e desce" e o "pisca às vezes";
- scroll de container interno, estado de `:active`, `<img>` já pintada, tudo reinicia;
- é caro num WebView de aparelho de entregador.

## S3a — reconciliar o `.content` por filho, não tudo-ou-nada

Aplicar dentro do `.content` a MESMA ideia que já funciona nos overlays (linhas ~305–353):
chavear os filhos, comparar cada um com a marcação que ELE tinha no render anterior, trocar só os
que mudaram, remover os que sumiram, inserir os que nasceram.

Diretrizes:
- **Conservador.** Mesma tag + mesma chave ⇒ pode recursar/atualizar. Estrutura diferente ⇒
  `replaceWith` naquele filho e pronto. Na dúvida, troca o filho inteiro: um `replaceWith` de
  card é barato, o de tela inteira é que dói.
- **Chave estável primeiro.** Usar `data-delivery`, `data-client`, `id` quando existir; cair pra
  primeira classe + ordem (o `chavear()` dos overlays) só quando não houver.
- **Comparar com o que foi GERADO, não com o DOM vivo.** O nó vivo sofre mutação depois do mount
  (mapa transplantado, foco, scroll) e nunca voltaria a bater na string. O código dos overlays já
  explica isso em comentário — mesma regra aqui.
- **Nó de texto puro:** se só o texto mudou, escrever `textContent` em vez de trocar o nó. É o caso
  mais comum do tique de GPS e o que mais paga.
- **Limite de profundidade.** Recursão sem teto em lista grande custa mais que a troca. Definir um
  teto (sugestão: 3–4 níveis) e abaixo disso trocar o nó.
- **Preservar o transplante do mapa.** `transplantarMapa("route-live-map", …)` (linha ~269) hoje só
  roda quando `contentChanged`. Com reconciliação fina, o `#route-live-map` pode estar em um ramo
  que não vai ser trocado — nesse caso ele já está vivo no lugar certo e não deve ser tocado.
  Garantir os dois caminhos: se o ramo for trocado, transplanta antes; se não for, não encosta.
- **Idempotência a jusante.** Quando o nó SOBREVIVE, tudo que roda depois do mount tem que ser
  idempotente. Os guardas `__hbx*` já existem em `app.js` (`__hbxDayBound`, `attachMoneyInput`,
  `enhancePaymentForms`) justamente por isso. Com a reconciliação fina, MAIS nós vão sobreviver —
  se você identificar um pós-mount que passa a rodar 2x sobre o mesmo nó, **não corrija em
  `app.js`** (é do worker A): liste no RESULTADO com arquivo e linha.

## S3b — `mobile-contract.js`: o observador que se auto-alimenta

Linhas ~251–252:

```js
const observer = new MutationObserver(() => refreshVisibleSheet());
observer.observe(document.documentElement, { childList: true, subtree: true });
```

Observa **o documento inteiro, em profundidade**, e chama `refreshVisibleSheet()` a cada mutação.
E `renderReceiptPanel()` MUTA o DOM (`insertAdjacentElement`, `confirm.disabled`,
`classList.toggle`) — ou seja, o observador dispara a si mesmo. Existe um guarda de `signature`
que impede reescrever o `innerHTML` à toa, então não vira loop infinito de repintura, mas a
callback roda a cada mutação do app inteiro, durante o render inteiro.

Fazer:
- Coalescer em `requestAnimationFrame` (uma passada por quadro, no máximo), com flag de "já
  agendado".
- Sair cedo: se não existe `.delivery-sheet` na tela, não faz nada.
- Estreitar o alvo do `observe` para o container do app em vez de `document.documentElement`, se
  der pra fazer com segurança.
- Escrever só quando o valor MUDA (`disabled`, classe) — atribuição redundante em WebView ainda
  custa e ainda dispara mutação.

---

## Fechamento
- Sem branch nova. Commit local no `master`, mensagem `fix(apk): ...`, sem publish.
- Um commit para S3a e outro para S3b.
- Escrever `B-RESULTADO.md` nesta pasta: o que mudou, o RISCO que você vê (reconciliador é a peça
  mais perigosa deste PR — seja honesto sobre onde pode quebrar), e a lista de pendências em
  arquivos do worker A.
- **Não testar no aparelho** — o dono testa.
