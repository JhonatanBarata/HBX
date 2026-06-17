# PR17062026045 — BOT: chave-mestra ÚNICA (Master libera) + Prospecção religada

> **Ordem do dono (17/06):** "religue a Prospecção. Mas antes: delete TODA a sujeira dos planos
> de bot, limpa mesmo. A regra vai ser **ÚNICA: Master libera**. O bot aparece pra TODO MUNDO,
> **até pro plano List** — de propósito, pra dar vontade no povo. Vê tudo, configura, brinca com
> os robozinhos — mas **só o Master tem a chavinha** que liga de verdade. Master passa pro Admin,
> Admin libera pro Gerente/Vendedor. Vendedor prospecta só a carteira dele. Número compartilhado.
> Pensa Webwhats E Meta (o plano forte). **Não quero saber de regra legada de plano de bot.**"

## A REGRA (só essa, decore)
**O Bot inteiro (Atendimento-bot + Prospecção) NÃO tem mais gate de plano.** Ele **aparece pra
todos** (List/Lead/Pro/Full — todos). A **única** coisa que o liga de verdade é a **chave-mestra
do Master**. Cascata: **Master arma a empresa → Admin propaga papéis → Vendedor só a carteira dele.**
Canais: **Webwhats** (base) e **Meta** (forte) — o Master escolhe ao armar.

```
VER/CONFIGURAR/BRINCAR  = TODOS (de graça, até List — pra dar vontade)
LIGAR DE VERDADE        = só com a chave-mestra do Master  ← regra única
QUEM USA dentro da casa = Admin propaga (Gerente/Vendedor)
```

Três verdades de acesso no código hoje — esta é a **3ª, nova e independente**:
1. Cobrança → `backend/src/modules/company-access-state.ts` (não toco)
2. Plano/módulos → `backend/src/modules/module-access-policy.ts` (tiro o bot daqui)
3. **Chave-mestra do bot (NOVO)** → `backend/src/modules/bot-activation-state.ts` (crio)

---

## MODOS DO BOT + VALOR (por cliente — é IMPLANTAÇÃO, sem legado de preço)
O bot é **um motor, vários modos**, ligados por cliente (o Master/Admin escolhe quais):
- **Responder** (inbound / atendimento-bot — "responde com 3 msg") — já existe (`atendimento-config.ts`
  + gate em `messaging.service.ts`).
- **Prospectar WhatsApp** (outbound) — já existe (`vendas-automation.service.ts`), é o religar.
- **Prospectar E-mail** (outbound) — **NOVO** (Bloco H).

**Preço do bot = decisão manual do dono, por cliente, na implantação.** NÃO existe preço de
catálogo pro bot (nada de `bot_ia` faturável — morre no A4). O valor entra no **override manual que
o Master já tem por empresa** (`finance-settings` / `monthlyValueOverride` / `setupValue` em
`modules.service.ts` + `modules.controller.ts`), no mesmo momento em que o Master arma. Um cliente
quer só responder, outro quer prospectar, outro os dois — cada um com o valor que o dono definir.

> WhatsApp e E-mail são **duas telas separadas** e **nunca disparam juntos** no mesmo lead/momento.

---

## BLOCO A — DESTRUIÇÃO: matar o `bot_ia` de plano (faxina cirúrgica)
> Cada ocorrência classificada: **DELETE** (acoplamento de plano morre), **SWAP** (troca o gate
> de plano pela chave-mestra do Bloco C), **AUDIT** (zona de dinheiro: confere antes de mexer),
> **UPDATE** (teste acompanha). **Fazer A2 (executar deleção) só DEPOIS dos blocos B/C existirem**,
> senão o SWAP não tem pra onde apontar.

### A1 — Catálogo / entitlement (raiz do acoplamento) — **DELETE**
| Arquivo | Âncora | Ação |
|---|---|---|
| `backend/src/commercial-plans/commercial-plan-catalog.ts` | `BOT_IA: 'bot_ia'` (~L12) | DELETE a chave |
| ″ | `BOT_IA_PLAN_REQUIRED_PAYLOAD` (~L99-102) | DELETE o payload + o redirect `/planos?intent=bot_ia` |
| ″ | `bot_ia` em `COMMERCIAL_PLAN_MODULE_KEYS` PRO/MELHOR (~L159-160) | DELETE o item da lista |
| ″ | `BOT_IA` em `COMMERCIAL_PLAN_ENTITLEMENT_KEYS` (~L181, L191) | DELETE |
| `backend/src/commercial-plans/commercial-plans.service.ts` | `import { BOT_IA_PLAN_REQUIRED_PAYLOAD }` (~L14) | DELETE import |
| ″ | `assertBotAiEntitlementForUser` (~L476-477) | DELETE o método |
| ″ | `assertBotAiEntitlementForCompany` (~L480-482) | DELETE o método |
| ″ | branch `BOT_IA` em `assertEntitlementForUser` (~L461) | DELETE o branch |
| ″ | uso de `BOT_IA_PLAN_REQUIRED_PAYLOAD` (~L518) | DELETE |
| ″ | `bot_ia` no snapshot de entitlements (~L213, L241, L250, L276, L305, L446) | DELETE o campo do snapshot |
| `backend/src/commercial-plans/commercial-entitlement.guard.ts` | caso especial `BOT_IA` (~L30-31) | DELETE o caso |
| `backend/src/auth/auth.service.ts` | projeção da key `BOT_IA` (~L787) | DELETE |
| `backend/src/modules/modules.service.ts` | `'bot_ia'` na lista de módulos (~L133) | DELETE da lista |

### A2 — Gates de RUNTIME (não deletar o gate; **SWAP** pela chave-mestra)
> Estes não perdem trava — **trocam** `entitlement bot_ia` por `resolveBotActivation().armed`
> (helper do Bloco B). É aqui que a regra única passa a valer no tempo de execução.

| Arquivo | Âncora | Ação |
|---|---|---|
| `backend/src/vendas/vendas.controller.ts` | 8× `@CommercialEntitlement(BOT_IA)` (L39,46,58,65,72,79,86,93) | SWAP → `@BotArmed()` (Bloco C) |
| `backend/src/vendas/vendas.service.ts` | `assertBotAiEntitlementForUser` (~L326, L331) | SWAP → `assertBotArmed` (ou remove se o guard do controller já cobre) |
| `backend/src/vendas/vendas-automation.service.ts` | `assertEntitlement`→`assertBotAiEntitlementForUser` (~L530) | SWAP → `resolveBotActivation` |
| `backend/src/inbox/inbox.service.ts` | `assertBotAiEntitlementForCompany` (~L4704, L4775, L4827) | SWAP → checagem de chave-mestra |
| `backend/src/messaging/messaging.service.ts` | `hasCommercialBotAiEntitlementForCompany` (~L377, L513-540, L6276) | SWAP → `isBotArmedForCompany` (gate do "bot responde inbound?") |

### A3 — Frontend (tirar acoplamento de plano da tela) — **DELETE/CLEAN**
| Arquivo | Âncora | Ação |
|---|---|---|
| `frontend/src/components/hbx/shell.tsx` | `bot: "bot_ia"` (L382, L395) | DELETE o gate → Bot aparece pra **todos** (até List) |
| `frontend/src/app/(app)/configuracoes/page.client.tsx` | `bot_ia: "Bot IA"` (~L95) | DELETE/repaginar o rótulo de plano |
| `frontend/src/app/planos/page.tsx` | comentário/upsell legado `bot_ia` (~L7) | CLEAN (baixa prioridade) |

### A4 — Cobrança do bot: matar `bot_ia` faturável (SEM LEGADO) — **DELETE**
> Ordem do dono 17/06: o bot **não tem preço de catálogo**. Valor é **manual, por cliente, na
> implantação** (override do Master). Então `bot_ia` faturável morre limpo — não é "audit + talvez",
> é remover. O que substitui já existe: `finance-settings` / `monthlyValueOverride` / `setupValue`
> por empresa (Bloco D liga isso ao armar).

| Arquivo | Âncora | Ação |
|---|---|---|
| `backend/src/financeiro/financeiro.service.ts` | `bot_ia` faturável (~L508, L637, L1241) | DELETE a linha de cobrança `bot_ia` (sem fallback legado) |

> Único cuidado operacional (não trava o plano): se houver empresa hoje com `bot_ia` num lançamento
> já emitido, o lançamento **histórico** fica; só não se gera mais nada novo por catálogo. Valor novo
> = override manual.

### A5 — Testes que citam `bot_ia` — **UPDATE** (manter catraca verde)
- `backend/src/modules/module-access-policy.test.ts` (L62, L73-74)
- `backend/src/master-provisioning/master-provisioning.service.test.ts` (L19, L44)
- `backend/src/messaging/messaging.service.test.ts` (L712, L823, L938)
- `backend/src/inbox/inbox.service.test.ts` (L221)
- `backend/src/vendas/vendas.service.test.ts` (L117)
- `tests/e2e/atendimento.spec.ts` (L169), `tests/e2e/whatsapp-mobile.spec.ts` (L148)

### A6 — Migrations antigas — **NÃO editar**
- `backend/prisma/migrations/20260428_commercial_signup_checkout_states/migration.sql:10` cita
  `bot_ia` — é **história imutável**, não tocar. Se houver linhas de entitlement a remover do
  banco, vai numa migration NOVA (Bloco B), nunca editando a antiga.

---

## BLOCO B — O NOVO EIXO: a chave-mestra (dado + leitura)
- **Schema** `backend/prisma/schema.prisma` — no model `Company`, **aditivo**:
  - `botArmedAt DateTime?`
  - `botArmChannel String?`  // `'webwhats'` | `'meta'`
  - `botArmedByUserId Int?`
  - `botArmReason String?`
- **Migration NOVA** `backend/prisma/migrations/20260617_bot_master_key/migration.sql` (só `ADD COLUMN`).
- **Leitura central (fonte única)** — criar `backend/src/modules/bot-activation-state.ts`:
  - `resolveBotActivation(company) → { armed: boolean; channel: 'webwhats'|'meta'|null; blockedCode: 'bot_not_armed'|null; blockedReason: string|null }`
  - Espelha o estilo de `company-access-state.ts`. **Não** re-deriva cobrança nem plano.
- **Projetar** o `armed`/`channel` no snapshot que o front já lê (mesmo caminho do `accessState`),
  pra tela saber se mostra o cadeado.

## BLOCO C — O GUARDA ÚNICO (substitui o gate de plano)
- Criar `backend/src/modules/bot-armed.guard.ts` + `bot-armed.decorator.ts` (`@BotArmed()`),
  no padrão de `module-feature.decorator.ts` / `module-access.guard.ts`.
- Protege **só os endpoints que disparam de verdade** (start/resume Prospecção, "Bot ligado",
  resposta runtime). **NÃO** protege os endpoints de configuração — config fica aberta pra todos
  brincarem.
- Aplicar o `@BotArmed()` nos pontos marcados SWAP do Bloco A2.

## BLOCO D — MASTER ARMA (a torneira) — **caminho onde implanto no Master**
- **Backend** `backend/src/modules/modules.controller.ts` + `modules.service.ts`:
  `PUT /modules/master/company/:id/bot-activation  { armed, channel, modes, reason }` — auditado
  (a `auditTimeline` já existe no detalhe). Mesmo padrão de `.../courtesy`, `.../suspension`, `.../plan`.
  - `modes` = quais ligar por cliente: `responder` | `prospectar_whatsapp` | `prospectar_email`
    (refletir no schema do Bloco B como `botModes String[]` ou flags).
- **Master UI** `frontend/src/app/(app)/master/janela-empresas.tsx` (o "CORAÇÃO do /master") —
  card novo **"Bot"** no detalhe da empresa: toggle **Armar** + **canal** (Webwhats / Meta) +
  **modos** (checkbox: responder / prospectar WhatsApp / prospectar e-mail) + motivo. Ao lado dos
  toggles de módulo/cortesia já existentes (contrato no topo do arquivo, L5-21).
- **Valor (implantação):** no mesmo card, o Master define o valor manual reusando o que já existe —
  `finance-settings` (`monthlyValueOverride` / `setupValue`). Sem preço de catálogo (ver A4).
- **Webwhats vs Meta:** ao escolher **Meta** (forte), checar credencial master provisionada — o
  detalhe já traz `whatsapp.usingMasterToken` e `masterIntegrations.whatsappLibrary` (L100, L102).

## BLOCO E — ADMIN PROPAGA (cascata Master→Admin→Gerente/Vendedor)
- Empresa armada → o **Admin** libera papéis. Reusar a régua que já existe:
  `backend/src/vendas/vendas.controller.ts` `PATCH /vendas/seller-audit/:sellerId/governance`
  (L170) + `vendas.service.ts` `updateSellerGovernanceForUser` — estender com
  `botAccess`/`prospectingAccess`.
- **Vendedor só a carteira dele** — já é o comportamento do motor (`resolveUserContext` em
  `vendas-automation.service.ts` L520). Default: armado mas não propagado = **só Admin usa**.

## BLOCO F — RE-EXIBIR O BOT + RELIGAR PROSPECÇÃO WHATSAPP (rosto · tela 1)
- **Bot pra todos** — sai do gate (feito no A3 shell). Aparece em List/Lead também (dar vontade).
- **Estado na tela** (memória: ferramenta sem estado visível irrita o dono) — selo no topo do Bot
  e da Prospecção: 🔒 *"Modo demonstração — configure à vontade; o gatilho é liberado pelo
  Suporte."* Desarmado: **"Bot ligado"** e **start da Prospecção** travados → clique = toast
  **"Acione o suporte para ativar"** (exatamente o pedido do dono). Armado: some o cadeado +
  aparece a régua "quem usa".
- **Prospecção WhatsApp = aba dentro de Vendas** (`frontend/src/app/(app)/vendas/page.client.tsx`),
  reusando o motor vivo já pronto: `vendas-automation.service.ts` + `GET /vendas/automation/live-status`
  + eventos realtime `automation`. Mostra fila viva, status, classificação das respostas
  (`prospecting-safety.ts`) e **handoff** do positivo pro Atendimento.

## BLOCO H — DISPARO DE E-MAIL AUTOMÁTICO (motor novo · tela 2)
> Mesma alma da Prospecção WhatsApp, canal e-mail. **Tela separada, nunca dispara junto com o WhatsApp
> no mesmo lead/momento.** Infra de ENVIO já existe forte (`backend/src/mail/company-mailer.service.ts`
> + templates `company-email-template.service.ts` + settings `company-email-settings.service.ts`); o
> que **não** existe é o motor de CAMPANHA/CADÊNCIA — é o que se cria, espelhando o do WhatsApp.
- **Motor** — criar `backend/src/vendas/email-automation.service.ts` (irmão do `vendas-automation.service.ts`):
  worker, fila de jobs, agenda, horário comercial, limite diário — **reusa** `company-mailer.service.ts`
  pra enviar. Abertura/resposta/bounce via webhook do provedor (não inventar SMTP cru).
- **Schema** — tabelas próprias `EmailAutomationCampaign` / `EmailAutomationJob` (espelham as do
  WhatsApp da migration `20260504_vendas_prospecting_automation`), migration aditiva.
- **Gate** — mesmo `@BotArmed()` (Bloco C), exige o modo `prospectar_email` ligado pelo Master.
- **Tela 2** — aba "E-mail" dentro de Vendas (seção irmã da Prospecção), mesma casca viva: fila,
  status, abertos/respondidos. Mesmo selo 🔒 quando desarmado.
- **Anti-cruzamento** — um lead em campanha de e-mail não entra na de WhatsApp ao mesmo tempo
  (flag de canal no job; checagem no enqueue dos dois motores).

## BLOCO G — ORDEM + CHECKS
- **Ordem:** **B** → **C** → **D** → **A** (executar SWAP/DELETE com destino pronto, inclui A4)
  → **E** → **F** → **H** (e-mail, motor novo, depois do WhatsApp de pé) → **A5** (testes).
- **Checks mínimos:** `cd backend && npm run prisma:validate && npm run build`;
  `cd frontend && npm run lint && npm run build`; catraca de testes (atualizar A5).
- **Trava:** nada em PRODUÇÃO/deploy sem ordem na hora. A4 deleta `bot_ia` faturável **sem legado**
  (decisão do dono: valor do bot é manual, por cliente, na implantação).

## Caminhos novos (resumo pro Sonnet não se perder)
- `backend/src/modules/bot-activation-state.ts` (novo — leitura)
- `backend/src/modules/bot-armed.guard.ts` + `bot-armed.decorator.ts` (novos — guarda)
- `backend/prisma/migrations/20260617_bot_master_key/migration.sql` (nova — colunas)
- Master: `backend/src/modules/modules.controller.ts` + `modules.service.ts` (endpoint) →
  `frontend/src/app/(app)/master/janela-empresas.tsx` (card)
- Rosto: `frontend/src/app/(app)/vendas/page.client.tsx` (abas Prospecção WhatsApp + E-mail) +
  `frontend/src/components/hbx/shell.tsx` (bot pra todos)
- E-mail (motor novo): `backend/src/vendas/email-automation.service.ts` +
  `EmailAutomationCampaign`/`EmailAutomationJob` (schema) — reusa `backend/src/mail/company-mailer.service.ts`
