# A3 — Lote grátis de boas-vindas (substitui o trial por tempo) — SPEC pronto p/ execução

> Correção A3 do PLANO.md. NÃO executado na sessão 05/07 de propósito: o choke é o fluxo de
> AUTH/signup (3 pontos criando Company com `pending_checkout` no `auth.service.ts` ~822/1423/
> 1643) — mexer em auth às pressas é risco desnecessário; merece execução dedicada com teste
> dos 3 caminhos (cadastro normal, Google, convite). Worker Sonnet pode executar; NÃO é
> financeiro-live (promo nunca vira receita).

## Regra
- Ao nascer empresa TENANT self-service: conceder lote `kind:'promo'`, `grantType:'promo'`
  (NUNCA receita — D3/S5), `usageKey: welcome:<companyId>` (1 lote por empresa, PRA SEMPRE —
  o grant já dedupa por usageKey).
- Quantidade/validade: config global do master (estender o padrão `CreditGlobalConfig`/
  `credit-pack-catalog` com `welcomeCredits` default 30 e `welcomeExpiryDays` default 30 +
  override persistido, mesmo desenho do `defaultExpiryDays`). Âncora de mercado: CNPJ.biz dá
  ~10 créditos de trial — dar 2–3× é argumento de venda (ver "$$ travas" no PLANO.md).
- Best-effort atrás de `HBX_CREDITS_ENABLED`: flag OFF = no-op; erro no grant NUNCA quebra o
  signup (try/catch + log, padrão do `recordShadowDebit`).
- `platform_infra` NUNCA recebe. Empresa criada pelo master (Implantação) também não — lá o
  crédito é concessão manual (S3a).
- Wire de módulo: quem cria a Company importa `CreditsModule` (só depende do Prisma — sem ciclo).
- NÃO remover o trial ainda: o lote convive com o trial até o R3 (aposentar tier). Sem
  enforcement (R1 OFF) o lote é só visível no painel — inofensivo.

## Aceite
1 empresa nova (cada um dos 3 caminhos) → carteira nasce com o lote promo com validade; criar
2x/retry não duplica (usageKey); flag OFF → zero efeito; signup nunca falha por causa do grant.
Testes `node --test` + `S A3-RESULTADO.md` nesta pasta; este spec some ao concluir.

## S4 — veredito da mesma revisão (por que NÃO agora)
Sub-orçamento por vendedor (D4) é ENFORCEMENT: sem o gate de crédito ligado (R1/`HBX_CREDITS_
ENFORCE`), teto individual é decorativo — e os campos alvo (`vendasPullQuantityLimit`/
`cardDeliveryDailyLimit` no `UserTeamPolicy`) estão no meio da colisão viva com o VENDAS-REFAB.
Ordem certa: shadow (S2) medir → R1 enforce por empresa → S4 teto individual. Não firar worker
antes disso.
