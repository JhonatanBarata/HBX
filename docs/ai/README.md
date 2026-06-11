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
- Contrato obrigatório de frontend:
  `docs/PLANEJAMENTOS/PR#10062026NNN/OK-PR10062026004-contrato-frontend-obrigatorio.md`
  — shell, overlays, rotas, CSS, acesso/cobrança e catálogo comercial para
  novas mudanças de frontend.
- Blueprint/checklists da contenção de entropia frontend:
  `docs/PLANEJAMENTOS/PR#10062026NNN/OK-PR10062026005-blueprint-tela-nova-frontend.md`,
  `OK-PR10062026006-inventario-ui-legado.md`,
  `OK-PR10062026007-manifesto-rotas-canonicas.md`,
  `OK-PR10062026008-especificacao-kit-ui.md` e
  `OK-PR10062026009-checklist-revisao-frontend.md`.

## Invariantes que quebram o produto se violadas

1. Vendedor/funcionário (role `USER`) nunca vê cobrança, valores ou status de
   pagamento — bloqueio sempre neutro; login do vendedor cai direto em Vendas
   e nunca recebe destino de checkout.
2. `Company.status` é o ÚNICO estado comercial persistido
   (`pending_checkout | trial | active | courtesy | overdue | suspended`);
   as datas (`trialEndsAt`, `courtesyEndsAt`, `billingGraceEndsAt`) decidem os
   vencimentos na leitura. Os campos legados (`paymentStatus`,
   `subscriptionStatus`, `premiumAccess`, `onboardingStatus`,
   `billingExempt*`) e a tabela `UserModuleAccess` FORAM REMOVIDOS do schema
   no DROP do PR10062026002 — não recriar, não re-derivar.
3. Cortesia (`status='courtesy'` + motivo obrigatório + prazo opcional) é a
   única liberação sem cobrança: funde a antiga "liberação manual" e a
   "isenção"; sem prazo = permanente (caso do tenant interno HBX), com prazo
   vencido volta a cobrar. Nunca special-case por slug/nome de empresa.
4. Permissão por usuário vive SÓ na team policy (`UserTeamPolicy.modulesJson`);
   vendedor nasce com Vendas+Radar operacionais por default do catálogo, em
   qualquer superfície (desktop = mobile).
5. Backend é a fonte de verdade de autorização comercial; nenhum paywall é
   afrouxado no frontend. O frontend consome `accessState`/`accessStateLabel`/
   `accessReleased` — nunca calcula cobrança.
