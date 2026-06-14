# PR14062026005 — Comissão visível / assentos: o que sobrou (follow-ups backend)

> Migrado do PR13062026005 na virada do dia. **F1 (implantação: valor + comissão visível),
> F2 (cap rígido de assento) e F3 (tabela de preço no modal de fechar) estão NO AR**
> (restart feito 13/06, migrations up-to-date): comissão de mensalidade + implantação aparece
> no card e no resumo "a receber"; cap de assento barra criar acesso além do teto; a vendedora
> vê a mensalidade por plano ANTES de fechar. Resta só o abaixo (follow-up backend, não bloqueia).

## F3 — ENTREGUE 14/06 (frontend)
Tabela "Mensalidade por plano (referência)" no modal de Fechar venda
(`frontend/src/app/(app)/vendas/page.client.tsx`): List/Lead+/Full lidos da vitrine pública
do catálogo (`GET /commercial-plans/public-catalog`, sem hardcode — /me e /catalog zeram o
preço para role USER), render por classe central (`.doc-slot`/`.kv`), catraca 564/564, lint+build
verdes. Vendedor vê PREÇO do plano, nunca a cobrança do cliente.

## Pendências

1. **Receivable `kind:'setup'` no payout** (follow-up backend): a comissão de implantação hoje
   vive no lead e aparece no card + no resumo "a receber", mas NÃO vira linha formal no batch
   de pagamento. Integrar quando for pagar comissão de verdade (passo "dinheiro").

2. **Cap na reativação** (follow-up): o teto rígido barra na CRIAÇÃO de acesso; reativar um
   acesso inativo não passa pelo gate. Fechar só se virar problema.

## Trava
- Migração só aditiva; edições de backend em lote (PLAN14062026001) + docker restart.
- Vendedor vê a PRÓPRIA comissão (permitido), NUNCA a cobrança do cliente.
- Front respeita as 5 LEIS (classe central/token, catraca não sobe).
