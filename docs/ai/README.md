# HBX — Contexto para agentes de IA

Este é o índice de contexto local referenciado pelo `AGENTS.md` da raiz.
Leia o `AGENTS.md` primeiro — as regras de segurança, invariantes de cobrança
e o mapa do master estão lá e valem sempre.

## Onde as coisas moram

- `AGENTS.md` (raiz): regras de segurança, invariantes de acesso/cobrança,
  superfície do master, checks padrão e diretrizes de revisão.
- `docs/PLANEJAMENTOS/`: planos de trabalho por lote de PR (pasta `PR#<data>NNN`,
  data mais recente vence). O plano ativo descreve o estado-alvo do sistema e o
  que já foi executado.
- `Webwhats/AGENTS.md`: instruções próprias do projeto Webwhats (motor WhatsApp).

## Pontos de entrada do código

- Estado canônico de acesso/cobrança: `backend/src/modules/company-access-state.ts`
  — única fonte de verdade; todo o resto projeta dele.
- Política de módulos por plano: `backend/src/modules/module-access-policy.ts`
  (inclui `presentModuleBlockForRole`: vendedor nunca vê motivo financeiro).
- Catálogo comercial (planos, preços, módulos, entitlements):
  `backend/src/commercial-plans/commercial-plan-catalog.ts` — o frontend consome
  via API (`workspace.plansCatalog`), nunca copia valores.
- Central master: `frontend/src/app/master/_command-center/` (abas Empresas |
  Planos & Regras | Email | Webwhats | Banco de Dados | Tokens | Links).
- Gate de cobrança do app: `frontend/src/components/PreCheckoutGate.tsx`
  (cobrança só para admin; vendedor vê `CompanyAccessPausedScreen` neutra).

## Invariantes que quebram o produto se violadas

1. Vendedor/funcionário (role `USER`) nunca vê cobrança, valores ou status de
   pagamento — bloqueio sempre neutro.
2. Estado comercial nunca é re-derivado de `paymentStatus`/`subscriptionStatus`
   crus fora do resolvedor canônico.
3. `premiumAccess` = liberação manual do master; nunca é efeito colateral de
   assinatura paga/trial.
4. Isenção de cobrança é dado (`Company.billingExempt` + motivo + auditoria),
   nunca special-case por slug/nome de empresa.
5. Backend é a fonte de verdade de autorização comercial; nenhum paywall é
   afrouxado no frontend.
