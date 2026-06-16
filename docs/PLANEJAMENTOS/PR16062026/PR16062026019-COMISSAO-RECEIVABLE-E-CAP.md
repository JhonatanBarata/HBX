# PR16062026019 — COMISSÃO: receivable de setup + cap na reativação (follow-ups backend)

> Migrado de `PR14062026005`. F1/F2/F3 **NO AR** (restart 13/06): comissão de mensalidade +
> implantação aparece no card e no resumo "a receber"; cap de assento barra criar acesso além do
> teto; a vendedora vê a mensalidade por plano ANTES de fechar (lido da vitrine pública do catálogo).
> Resta só o abaixo — follow-up backend, não bloqueia.

## ⛔ FALTA
1. **Receivable `kind:'setup'` no payout** — a comissão de implantação hoje vive no lead e
   aparece no card + no resumo "a receber", mas **NÃO vira linha formal no batch de pagamento**.
   Integrar quando for pagar comissão de verdade (passo "dinheiro", zona protegida).
2. **Cap na reativação** — o teto rígido barra na **CRIAÇÃO** de acesso; **reativar** um acesso
   inativo NÃO passa pelo gate. Fechar só se virar problema.

## Travas
- Migração só aditiva; edições de backend em lote (`PLAN16062026001`) + `docker restart`.
- Vendedor vê a PRÓPRIA comissão (permitido), **NUNCA** a cobrança do cliente.
- Front respeita as 5 Leis (classe central/token).

## Status
Núcleo no ar; 2 follow-ups pendentes (entram com o passo "dinheiro").
