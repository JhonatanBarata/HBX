# S2 — Teclado nunca cobre nada + Enter avança/confirma em TODO formulário

**Pedido literal do dono:** "pop up q não fica em cima do teclado, enter do teclado q avança
e confirma no final quando não tem mais avanços".

## O que JÁ existe (não recriar — auditar cobertura)

- Contrato de teclado (`app.js` ~486-585): `syncKeyboardViewport()` seta `--hbx-visible-height`
  + classe `keyboard-open`; CSS (~630-673) esconde bottom-nav/fab, encolhe modal pra altura
  visível, `scroll-padding` nos campos. Manifest já é `adjustResize`.
- Enter global (~3173-3208): avança pro próximo campo do escopo (`form`, `[data-enter-scope]`,
  `.center-modal-body`); no último dispara `data-enter-action` ou submete o form; guard 800ms.
- `enhanceKeyboardFields()` (~507): enterkeyhint next/done automático; buscas = go.

## Furos a fechar (evidência)

1. **CTA sticky com teclado aberto só existe pra 3 forms** (`app.css` ~665-673:
   `#new-oneoff-form`, `#leitura-novo-form`, `#edit-product-form`). Os outros 8 forms
   (`new-client-form`, `client-details-form`, `client-product-form`, `new-product-form`,
   `new-delivery-form`, `company-name-form`, `arrival-radius-form`, `leitura-nome-form`)
   deixam o botão Salvar/Cadastrar fora da dobra quando o teclado sobe.
2. **Auditoria Enter form a form**: com 11 forms + 5 `data-enter-scope`, provar no aparelho
   que em CADA um o Enter (a) pula pro próximo campo, (b) no último campo executa a ação
   certa, (c) nunca submete no meio. Atenção especial: selects no meio do form (Enter em
   select deve avançar), textarea (só avança/submete com `data-enter-action`/`data-enter-submit`
   — comportamento atual correto, manter), stepper/day-chips no meio do fluxo.
3. **Popups não-form com input** (DDD `#ddd-input` ~452, busca de cliente/produto da Leitura):
   conferir que o keyboard-open centraliza o popup e o input+ação ficam visíveis.

## Tarefas

1. Generalizar o sticky-CTA: trocar a lista de 3 ids por uma regra genérica
   (ex.: `html.keyboard-open .modal form > .btn-primary:last-child` + mesma pra `.sheet`),
   preservando os 3 casos atuais. Testar que não quebra forms com botão que NÃO é o CTA final.
2. Rodar a auditoria Enter nos 11 forms no aparelho (ADB: focar campo, `input keyevent 66`),
   corrigindo escopo/`data-enter-action` onde falhar.
3. Onde um form tem botão-ação fora do `<form>` (ex.: wizard com setas `center-arrow`),
   garantir `data-enter-action` apontando pra ação da seta ativa (padrão que a Leitura já usa).
4. Registrar na tabela de resultado: form × Enter-avança × Enter-confirma × CTA-visível ✓/✗.

## NÃO fazer

- NÃO mexer no algoritmo do `syncKeyboardViewport` (baseline 120px etc.) — ele está provado;
  o sprint é COBERTURA, não motor.
- NÃO adicionar `autofocus` agressivo nem abrir teclado sozinho em popup que não é de digitação.

## Checks

- `node --check app.js`; no aparelho: abrir CADA form, focar último campo, ver CTA visível
  com teclado aberto (screenshot), Enter no último campo executa e fecha.

**Pronto quando:** tabela 11/11 verde + screenshots, commit local `fix(apk): S2 teclado+enter em todo form`.
