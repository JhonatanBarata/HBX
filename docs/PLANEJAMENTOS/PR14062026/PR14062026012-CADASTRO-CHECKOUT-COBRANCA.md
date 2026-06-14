# PR14062026012 — CADASTRO → TRIAL → CHECKOUT → COBRANÇA → BLOQUEIO (sprint a sprint)

> **Ordem do dono (14/06):** "autorizo criar o plano da conversa inteira, pagamentos etc,
> aplicar HOJE, sprint um atrás do outro, FULL autorização pra tudo. Remova o tutorial
> (faço em outra tela)." → Este é o plano de EXECUÇÃO consolidado (absorveu o antigo
> PR14062026011, menos o tutorial). Zona protegida (PAGAMENTOS.md) liberada por ordem
> explícita. A transição visual do site público fica em `website-magnifico.md`.

## ESTADO VIVO (handoff — ler daqui)
- ✅ **Sprint 1 (UX plano/trial, frontend) APLICADO** (lint+build verdes).
- ✅ **Sprint 2 (Full 349,90 + alerta master) APLICADO e RODANDO EM DEV** — `docker restart
  backend` feito por mim; boot limpo (MasterAlert+CommercialPlans sem ciclo; rota
  `/commercial-plans/request-full` mapeada). Verdes: backend build+prisma+catalog test;
  front lint+build. Pra o **WhatsApp** disparar em dev/prod: setar `MASTER_ALERT_WA_COMPANY_ID`
  (e-mail já cai no system_master). Item 4 (fila dedicada no /master) DEFERIDO — o alerta já
  grava em MasterPaymentNotificationLog (janela Pagamentos do /master). **VPS = no publish do
  dono** (item E-S2 em PLAN…001 é o checklist dele: preço, módulo novo, env).
- ✅ **Sprint 3 (telas de bloqueio, paywall mansa) APLICADO e RODANDO EM DEV** — gate
  `bloqueio-gate.tsx` no AuthGate (reusa classes `.bv-*`, zero CSS novo); backend ganhou
  sinal NEUTRO `accessPaused` no `/commercial-plans/me` (sobrevive p/ vendedor). Boot dev
  limpo; front lint (catraca 560) + build verdes. Falta só o item 5 (nudges D-7/3/1).
- Sprints 4–5 abaixo. Única dependência externa: **credenciais Mercado Pago + decisão
  recorrente/Pix** (Sprint 4).

---

## O QUE JÁ EXISTE (não reinventar)
- **Estados** (`Company.status` → `resolveCompanyAccessState`): `pending_checkout | trial |
  active | courtesy | overdue | suspended` (+ `grace`/`trial_ending` pelas datas).
- **Catálogo único** (`commercial-plan-catalog.ts`): List 45 · Lead 99 · **Full 149,90**
  (→ 349,90). **Trial só Lead 14d**; List/Full contratação direta. Full já tem
  `requiresAssistedSetup:true` + `setupFeeMode:'negotiated'`.
- **GAP:** `requiresCheckout:false` em todos → **nenhum gateway ligado** = a "trilha de
  pagamento" que faltou ao clicar List.
- **`/commercial-plans/me`** já entrega `current{planKey,isTrial,trialEndsAt,
  trialRemainingDays,accessStateLabel,assistedSetup}` + `plans[]` + `permissions`; e já
  **esconde valor/trial de vendedor** (`presentCurrentStateForUser`).
- **Alerta do master pronto pra reusar:** `masterNotice` (sino) · `MailService` (e-mail) ·
  `WebwhatsBridgeService.sendText` (WhatsApp, já manda "MP aprovado") + log
  `MasterPaymentNotificationLog` (janela Pagamentos do `/master`). **Mercado Pago** = provedor
  de referência.

## DECISÕES DE PRODUTO DO DONO
- **Full = R$ 349,90 · implantação assistida · SEM cartão.** Cria a conta → técnico (o dono)
  contata. **Master alertado**: e-mail + WhatsApp **19997024884** + sino. Ele PRECISA ver.
- **Trial só no Lead. List sem trial.**

---

## SPRINTS

### 🟢 SPRINT 1 — UX do plano/trial (frontend, zero risco de billing) — APLICAR JÁ
1. **Card de plano da sidebar real + clicável + trial** (`shell.tsx`): lê
   `/commercial-plans/me`; mostra título do plano + "Teste · N dias" (ou `accessStateLabel`);
   "Gerenciar plano" → Configurações→Plano e cobrança (via `sessionStorage hbx:config-sec`);
   **escondido para vendedor**.
2. **"+" visível** (`kit.css`): `.round-btn.add` perdia no empate de especificidade pro
   `[data-theme] .round-btn` → vira `button.round-btn.add` (ganha). "+" reaparece em todas
   as peles/modos.
3. **Cadastro nomeia o plano** (`register/page.client.tsx`): "teste o **HBX Lead Plus** por
   14 dias, sem cartão".
4. **`/planos`: List sem promessa de trial** (`planos/page.client.tsx`): CTA do List neutro
   ("Criar conta"); só o Lead diz "Testar grátis 14 dias".
> Checks: `cd frontend && npm run lint`.

### ✅ SPRINT 2 — HBX Full assistido + ALERTA DO MASTER (APLICADO no código)
1. ✅ **Preço Full → 349,90** (`COMMERCIAL_PRICING.melhorMonthly`) + teste atualizado.
2. ✅ **Full sem self-checkout**: novo `POST /commercial-plans/request-full` (controller +
   `requestFullPlan`) — NÃO muda plano/entitlement (evita feature paga sem pagamento);
   só registra o pedido e alerta. Front: card Full vira "Falar com a HBX" → confirm →
   "um especialista vai entrar em contato". `select()` continua barrando auto-Full.
3. ✅ **Alerta do master** via `MasterAlertModule` NOVO (módulo-folha Prisma+Mail+bridge
   próprio — sem ciclo): **e-mail** (system_master ou `MASTER_ALERT_EMAIL`) + **WhatsApp**
   (`MASTER_ALERT_WHATSAPP_TO`=19997024884, envia da empresa `MASTER_ALERT_WA_COMPANY_ID`)
   + **log** `MasterPaymentNotificationLog`. Best-effort: nenhuma falha derruba o pedido.
4. ⏳ **Fila "Implantações Full pendentes" no `/master`** — DEFERIDO (o log já aparece em
   Pagamentos do /master; dashboard dedicado vira fast-follow).
> ⚠️ Backend → **`docker restart`** pra subir. Pra o WhatsApp disparar: setar
> `MASTER_ALERT_WA_COMPANY_ID` (empresa HBX com WhatsApp conectado). E-mail já funciona
> com o usuário system_master. Checks feitos: prisma validate + build + catalog test +
> front lint/build (todos verdes).

### ✅ SPRINT 3 — Telas de BLOQUEIO (paywall mansa, papel-aware) — APLICADO (falta item 5)
1. ✅ Bloqueio **fim de trial** (admin, `suspended`+trial vencido): "Seu teste terminou" + "Ver planos".
2. ✅ Bloqueio **`pending_checkout`** (admin): "Ative seu plano HBX" + "Ver planos".
3. ✅ **`overdue`** "Pagamento em atraso" / **`suspended`** "Acesso suspenso" (admin).
4. ✅ **Vendedor**: "Acesso pausado — fale com o administrador" (neutro, zero valor — via
   `accessPaused`, que o backend NÃO zera p/ vendedor; `accessState` continua nulo p/ ele).
5. ⏳ **Avisos de fim de trial** D-7/D-3/D-1 (e-mail + sino) — DEFERIDO (job leve).
> Implementado: `frontend/src/components/hbx/bloqueio-gate.tsx` (montado em `auth-gate.tsx`,
> reusa `.bv-*`); backend `accessPaused` neutro em `/commercial-plans/me`. O gate NÃO cobre
> `/configuracoes` (admin precisa chegar no plano pra resolver) nem o master. Enforcement
> real segue no backend (gate é só UX). Restart dev feito; tudo verde.

### 🔴 SPRINT 4 — Checkout recorrente (Mercado Pago) — DECIDIDO, pronto p/ construir
**Decisão do dono (14/06):** **cartão recorrente (assinatura)** via **Mercado Pago**.
Construo no SANDBOX; dono troca chave de produção no publish.

**Acelerador:** quase tudo já existe —
- `payments/mercado-pago-client.service.ts` é completo e stateless (recebe o token por
  chamada) e JÁ tem **preapproval/assinatura** (`createPreapproval`, `getPreapproval`,
  `cancelPreapproval`, `searchPreapproval` + `init_point`/`sandbox_init_point`).
- Token da PLATAFORMA (HBX→empresa) mora no master global integrations
  (`getMasterGlobalIntegrationConfig` + `pickMasterMercadoPagoCredential`); fallback env
  `HBX_MP_ACCESS_TOKEN`. (NÃO é o token por-tenant do `resolveCompanyMercadoPagoAccess`.)
- `PaymentsModule` exporta o client e **não tem imports** → CommercialPlans pode importar
  sem ciclo.

**Build (incrementos verificados, sem afobar — é a zona mais sensível):**
1. **Schema:** `Company.mpSubscriptionId` + `mpSubscriptionStatus` (via runtime-ensure, padrão
   do projeto — sem migration que conflite com o outro agente).
2. **HbxBillingService** (novo, na pasta payments ou commercial-plans): resolve token da
   plataforma → `createPreapproval({ reason, external_reference:"hbx-{companyId}-{plan}",
   payer_email, auto_recurring:{frequency:1, frequency_type:'months', transaction_amount:
   preço do catálogo, currency_id:'BRL'}, back_url, status:'pending' })` → grava
   `mpSubscriptionId` → devolve `initPoint`.
3. **Endpoint** `POST /commercial-plans/subscribe` (admin only) → `{ initPoint }`.
4. **Webhook** `POST /billing/mp-webhook` → on `preapproval`/`subscription_authorized_payment`
   → `getPreapproval` (confia na API, não no payload) → `authorized`/pago ⇒ `Company.status=
   active` + período; falha ⇒ overdue/grace. Idempotência + verificação de assinatura.
5. **Front:** plano pago no catálogo → `subscribe` → `window.location = initPoint`; página de
   retorno (back_url) lê status. Liga `requiresCheckout` onde fizer sentido.
6. **Config → Plano e cobrança:** próxima cobrança, cancelar assinatura.
> ⚠️ **CONSTRAINT REAL:** o webhook do MP **não alcança o backend em localhost**. O fluxo
> criar-assinatura+redirect dá pra ver em dev (sandbox), mas a **confirmação por webhook só
> testa de verdade na VPS** (ou via túnel tipo ngrok). Lógica do handler testável por unit.
> Checkout/webhook **com teste** obrigatório (PAGAMENTOS.md).

### 🔵 SPRINT 5 — Cockpit de cobrança no `/master`
Assinaturas ativas, inadimplência, implantações Full pendentes, ações (ativar/cobrar/cortesia).

---

## RESTRIÇÕES (PAGAMENTOS.md — valem mesmo com full autorização)
- Backend é a verdade da autorização; nada de paywall afrouxado no front.
- Preço/plano sempre da fonte única (`commercial-plan-catalog`); sem hardcode no front.
- Vendedor (role USER) nunca vê valor/cobrança/motivo financeiro.
- Checkout/webhook/assinatura com teste; nada em PRODUÇÃO sem ordem na hora.
- Visual só em tokens/classes centrais (5 LEIS).

## FORA DESTE PLANO
- **Tutorial** — o dono faz em outra tela.
- **Transição do site público / `/planos` cinematográfico** — `website-magnifico.md`.
