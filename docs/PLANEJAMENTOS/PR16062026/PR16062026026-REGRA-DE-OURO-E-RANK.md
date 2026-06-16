# PR16062026026 — Regra de Ouro no código + ranking de plano + liberar o Pro

> Lê o **023**. Este bloco prepara o terreno dos blocos 027–029: define **direção** (upgrade x
> downgrade), **libera o Pro** no caminho de troca e crava a Regra de Ouro (nada muda sem pagamento).

## OBJETIVO
1. Ranking de preço pra decidir upgrade x downgrade.
2. **Liberar o `hbx_pro`** no caminho de troca (hoje está barrado — item 3 do dono).
3. Garantir que **selecionar plano NÃO altera acesso na hora** — a mudança real fica nos blocos
   028 (upgrade, pós-pagamento) e 029 (downgrade, na confirmação).

## ACHADO (o que está errado hoje)
- `commercial-plans.service.ts` → `isSupportedPlanKey()` aceita só `LITE | PADRAO | MELHOR`.
  **O Pro (`hbx_pro`) fica de fora** → não dá pra trocar pra ele por esse caminho.
- `selectPlanForUser()` quando o plano difere joga a empresa em `pending_checkout` + `isActive:false`
  (corta acesso no clique). Isso **viola a Regra de Ouro**. Vai ser substituído pela tela de troca
  (027) + cobrança (028) / crédito (029).

## FAZER — BACKEND (catálogo / helpers)
Arquivo: `backend/src/commercial-plans/commercial-plan-catalog.ts`
1. Criar helper `getCommercialPlanRank(planKey): number` — ordem por preço mensal dos planos
   **pagos**: `list=1, padrao=2, pro=3`. Implantação (`melhor`) = fora do ranking (retorna `null`
   ou `-1`: não é troca self-service).
2. Criar `classifyPlanChange(fromKey, toKey): 'upgrade' | 'downgrade' | 'same' | 'contact'`
   - `contact` se o destino é Implantação (cai na tela de contato do 024, não na troca).
   - compara ranks pra upgrade/downgrade.

## FAZER — liberar o Pro
Arquivo: `commercial-plans.service.ts`
3. `isSupportedPlanKey()` passa a aceitar `PRO` também (`LITE | PADRAO | PRO`). **MELHOR continua
   barrado** (é contato).
4. **NÃO** deixar `selectPlanForUser` cortar acesso no clique. Reescopo: `select` só serve pra
   registrar a **intenção** e devolver o cálculo (quanto custa / quanto credita) pra tela do 027 —
   **sem** mudar `status`, `isActive`, módulos ou entitlements. A troca efetiva é 028/029.
   (Se preferir, deixar `selectPlanForUser` só pro caso `same`/sem efeito e mover a lógica de troca
   pros métodos novos do financeiro — o que for mais limpo; a 031/032 remove o caminho morto.)

## REGRA DE OURO (cravar)
- Nenhum método de troca altera plano/módulo/entitlement **antes** da confirmação de pagamento
  (upgrade) ou da confirmação explícita do downgrade.
- Não pagou / não confirmou = estado anterior **idêntico**.

## NÃO FAZER
- Não liberar `hbx_melhor` no self-checkout.
- Não reintroduzir leitura de campo cru (`paymentStatus` etc.) — só `resolveCompanyAccessState`.

## CHECKS
`cd backend && npm run build` + testes do catálogo (`commercial-plan-catalog.test.ts`):
rank correto, `classifyPlanChange` cobre upgrade/downgrade/same/contact; `isSupportedPlanKey`
aceita Pro e barra Implantação.

## DEPENDE DE
Nada. É base pros 027/028/029.

## STATUS
Planejado 16/06.
