# Regras — PAGAMENTOS, ACESSO E COBRANÇA

> Leia este arquivo antes de tocar em qualquer coisa de plano, cobrança, checkout,
> acesso comercial ou permissão. Estas invariantes quebram o produto se violadas.

## Estado comercial canônico

- `Company.status` é o ÚNICO estado comercial persistido:
  `pending_checkout | trial | active | courtesy | overdue | suspended`.
- As datas (`trialEndsAt`, `courtesyEndsAt`, `billingGraceEndsAt`) decidem vencimento
  NA LEITURA, nunca em coluna derivada.
- `backend/src/modules/company-access-state.ts` (`resolveCompanyAccessState`) é o único
  lugar que projeta o status para o vocabulário de leitura:
  `platform_infra | exempt | manual | paying | trial | trial_ending | grace | overdue | pending_checkout | suspended | unknown`.
- Os campos legados (`paymentStatus`, `subscriptionStatus`, `premiumAccess`,
  `onboardingStatus`, `billingExempt*`) e a tabela `UserModuleAccess` foram DROPADOS
  do schema. **Nunca recriar, nunca re-derivar estado de campo cru.**

## Cortesia — única liberação grátis

- Cortesia (`status='courtesy'` + motivo obrigatório + prazo opcional) é o ÚNICO
  mecanismo de acesso sem cobrança. Fundiu "liberação manual" e "isenção".
- Sem prazo = permanente (caso do tenant interno HBX). Prazo vencido = volta a cobrar.
- Setada apenas via ação master: `PUT /modules/master/company/:id/courtesy`.
- A empresa interna HBX é um tenant normal com cortesia permanente —
  **nunca fazer special-case por slug ou nome de empresa.**

## Vendedor nunca vê cobrança

- Usuário com role `USER` (vendedor/funcionário) NUNCA vê telas de cobrança, valores,
  status de pagamento ou motivo financeiro de bloqueio.
- Bloqueio de vendedor é sempre neutro: `company_access_paused` ou `module_not_enabled`.
- Login do vendedor cai em `/vendas` e nunca recebe destino de checkout.
- Pontos de enforcement: `presentModuleBlockForRole` e `presentOperationalStatusForRole`
  (backend), payloads neutros em `sanitizeUser` e `commercial-plans`,
  e `PreCheckoutGate` (frontend — redireciona para checkout só quando `userKind === 'admin'`).

## Catálogo comercial

- Fonte única: `backend/src/commercial-plans/commercial-plan-catalog.ts`
  (`COMMERCIAL_PLAN_KEYS`: List / Lead Plus / Full).
- O frontend consome via API (`workspace.plansCatalog`). **Nunca copiar preço, plano,
  entitlement ou módulo para constante de frontend.**
- A tabela `Plan` legada (`prata`/`ouro`/`diamante`...) foi DROPADA na migration
  `20260613_remove_legacy_plan_feature` (junto com `Feature` e `_PlanFeatures`).
  `backend/src/bootstrap/structural-defaults.json` não semeia Plan legado — apenas
  `systemModules`. **Nunca recriar essa taxonomia.**

## Permissão por usuário

- Vive SÓ na team policy (`UserTeamPolicy.modulesJson`).
- Vendedor nasce com Vendas+Radar operacionais por default do `team-access-catalog.ts`.
- Mesma regra em qualquer superfície (desktop = mobile).

## Proibido sem ordem explícita do dono

Preço, plano, paywall, quota, entitlement, billing, reembolso, provedor de pagamento,
checkout, webhook, assinatura — só com ordem na tarefa (lista única no
[CLAUDE.md](../../CLAUDE.md)). O backend é a fonte de verdade comercial; nenhum paywall
é afrouxado no frontend.

## Red flags em revisão (prioridade máxima)

- Feature paga usável sem plano/pagamento/entitlement válido.
- Estado de cobrança re-derivado de campos crus em vez de `resolveCompanyAccessState`.
- Valor/status de pagamento renderizado para usuário não-admin.
- Guard de auth ou fronteira tenant/usuário enfraquecida.
- Mudança em checkout/webhook/assinatura sem teste.
