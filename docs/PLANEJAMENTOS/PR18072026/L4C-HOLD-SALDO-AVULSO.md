# L4-C — Long-press igual Clientes + Saldo 0,00 + filtro Avulsos por origem

Arquivos: `EntregaShell/app/src/logistica/assets/app/app.js`,
`EntregaShell/app/src/main/assets/app/app.css`.

## 1. Long-press de excluir: copiar o efeito de Clientes (feedback do dono: "não deu certo
no rota/produtos, era pra copiar o efeito do clientes")
Hoje (app.js ~1784-1870): clientHold arma `is-hold-arming` IMEDIATO + timer 950ms +
`is-holding` + `H.vibrate(18)`. Os outros 3 (clientProductHold, routeStopHold, productHold)
só põem `is-holding` aos 480/520ms — sem arming, quase sem efeito visível.

Unificar: os 4 holds com o MESMO padrão do clientes — `is-hold-arming` no touchstart,
timer 950ms, `is-holding` + `H.vibrate(18)` ao armar; touchmove/touchend/touchcancel
removem as DUAS classes (hoje só removem is-holding nos 3).

CSS (app.css ~108-110 tem o efeito do `.lead-card`: ::after com animation
`client-hold-fill`): generalizar os seletores pra cobrir também `.stop-card` e
`.client-product-list .row-card` e o card de Produtos (conferir a classe real do card
`[data-product-id]` na aba Produtos — a UI copiou lead-card na 2ª leva). Mesmo visual:
fill vermelho progressivo + borda `var(--danger)`. Tokens, sem hex novo.

## 2. Saldo — "se estiver pago não sumir, deixar 0,00 igual era antes"
Com `configFlag("moduloFinanceiroAtivo")` ON o card do cliente deve mostrar SEMPRE o
`Saldo R$ X,XX`, inclusive `R$ 0,00` (hoje pode estar sumindo quando zerado — conferir o
render do card em ~linha 794). OFF continua escondendo tudo (como está).

## 3. Filtro Avulsos por origem (backend L4-A expõe `item.origem`)
app.js ~734-745: trocar heurística `!!i.scheduledAt` por `i.origem === "avulsa"`
(null/undefined → NÃO é avulsa; comentar que legado sem origem conta como recorrente).
Atualizar comentário da linha 734 que documenta a heurística errada.

## Regras
- Gate: `node --check` no app.js; CSS com tokens existentes.
- Não commitar.
