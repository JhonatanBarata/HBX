# BACKLOG-ABERTO — o que as auditorias acharam e ainda está de pé

> Consolidação de 3 auditorias (05-07, RELEASE-20X furos/play/codex, TESTE-GERAL), 11/07/2026.
> Cruzado com o código HOJE — só entrou o que **ainda está aberto**. Já corrigidos ficaram de fora
> (identidade fake, Recovery baixa-sem-approved, handoff CPF, e ~34 achados resolvidos desde 05/07).
> Auditorias originais deletadas — git preserva. **É lista de prioridade, não mandato de fix.**

> ⚠️ **CLUSTER LEGADO (assinatura/preapproval):** vários P0 abaixo vivem no billing de PLANO/assinatura
> que a **Fase 2 (créditos) aposentou** (`_legacyChangePlanForUser` compila mas nunca é chamado).
> Provável **código morto** — confirmar se o caminho ainda executa ANTES de investir fix. Marcados 🧟.

---

## Frontend (05-07/01-FRONTEND)
- **FE-01 (P0)** — Paywall de dados Pro é só visual: tier `lead` recebe CNPJ/sócio/tel no payload, só desfocado (bypass via DevTools). `vendas.service.ts:1502` gate por `canSeeLeadIntelligence` vs front `detalhes-negocio.tsx:1474/1541`. **Decisão de gating comercial + gate real no backend.**
- **FE-03 (P1)** — Entitlement falha ABERTO: `/commercial-plans/me` erro → null cacheado 60s, default `canSeeLeadIntelligence:true`, sem tier→'lead' libera inteligência. `shell.tsx:463-519`.
- **FE-04 (P1)** — Bootstrap de auth: shell monta incondicional, token só em `useEffect` → flash de tela protegida/requests antes de autenticar. `layout.tsx:8-11` + `auth-gate.tsx:20-24`. *(a identidade fake já foi corrigida)*
- **FE-05 (P1)** — `apiFetch` sem timeout/AbortSignal; SSE do Atendimento `while(alive)` reconecta infinito e fetch cru foge do handler 401. `api.ts:81`, `atendimento/page.client.tsx:959-965`.
- **FE-07/08/09 (P2)** — handoff Vendas→Conversas via sessionStorage frágil (`vendas:733`); retorno grava 09:00 no fuso do browser (`vendas:684`); requests concorrentes sem AbortController podem chegar fora de ordem (`leads:680`).
- **FE-11/12 (P2)** — sem primitive central de dialog/focus-trap (a11y parcial, 23 arquivos); CSS/bundle monolítico (`globals.css:9-79`, Radar acoplado ao bundle de Vendas).
- **FE-13 (P2)** — testes Node órfãos apontam p/ arquivos removidos (`tests/frontend-vendas-channel-icons.test.mjs`, `frontend-radar-channel-filter.test.mjs`) — ninguém roda, mas sujam o repo. *(mesma família do validate-email-lab que já virou chip)*
- **FE-14 (P2)** — Bearer em localStorage (qualquer JS lê) + CSP ausente (`api.ts:31-42`, `next.config.ts:27-28`).
- **FE-15 (P3)** — drift: `globals.css:6` diz "nenhuma pele" importando 4 temas; DTOs locais por página.

## Pagamentos — VIVO (05-07/03-PAGAMENTOS)
- **P0-03 (P0)** — `reversePayment` do Recovery sem clamp e acumuladores em update separado (não-transacional) → crash entre passos pode duplicar reversão. `hbx-recovery.service.ts:3123,3250`.
- **P0-09 (P0)** — Billing HBX e cobrança Recovery **compartilham a mesma credencial MP** (flag única `useMasterMercadoPagoToken`). `master-global-integrations.util.ts:291`.
- **P0-10 (P0)** — Permissão financeira do Recovery ampla demais: `mark-paid`/`refund` só com `ModuleAccessGuard('atendimento')`, sem RolesGuard → qualquer usuário do módulo quita dívida/pede estorno real. `hbx-recovery.controller.ts:178,281,318`.
- **P0-11 (P0)** — Webhook sempre responde 200 mesmo com `processed:false`; sem inbox durável nem worker de reconciliação. `financeiro.webhook.controller.ts:40`.
- **P0-12 (P0)** — Refund/chargeback de **assinatura** não revoga acesso/entitlement (só alerta). *(recarga de crédito já compensa carteira — P0.3)*. `financeiro.service.ts:2432`.
- **P1-01 (P1)** — Assinatura de webhook **fail-open**: default `log` aceita assinatura inválida; prod em `log`. Promover a `enforce`. `mercado-pago-webhook-signature.ts:85`. *(pareado com FUROS P3 abaixo)*
- **P1-02 (P1)** — Idempotência de grants de crédito não-concorrente (check-then-create sem tx; `@@unique` com `parentEntryId` NULL não deduplica lote). `credit-wallet.service.ts:253/279`.
- **P1-03 (P1)** — `refundPayment` sem `X-Idempotency-Key` nem lock → refunds parciais podem repetir. `mercado-pago-client.service.ts:298`.
- **P1-04 (P1)** — `MasterBillingLedgerEntry` é DDL em runtime, não model Prisma; sem unique estrutural.
- **P1-06 (P1)** — **Tokens MP em texto puro** no banco (`Company.mercadoPagoAccessToken`, `MasterGlobalIntegrationConfig`). `schema.prisma:76,3403,3409`.
- **P1-08 (P1)** — **Dinheiro em Float** (`FinanceiroCharge`/`HbxRecoveryPayment` amount/refundAmount); sem `amountCents`. `schema.prisma:592,611,651,671`.
- **P2-01 (P2)** — `HbxRecoveryPaymentEvent` sem operation key único + `recordPaymentEvent` engole falha.
- **P2-02 (P2)** — ⭐ **Notificação de pagamento aprovado do Recovery não dispara**: `normalizeLifecycle` (`:273-278`) não tem case `'paid'` (cai em `'in_progress'`); a detecção pós-update passa `updated.lifecycle` (='paid') → `isPaidNow=false`. **É a causa raiz do teste vermelho** "concurrent deliveries notify once". Fix pequeno (adicionar case `'paid'`) — candidato a corrigir junto.

## Pagamentos — 🧟 LEGADO de assinatura (confirmar se ainda executa)
- **P0-01** — preapproval `authorized` chama `activateCompanyFromSubscription` antes de pagamento aprovado (grace 48h). `financeiro.service.ts:3595`.
- **P0-04** — `recordProrationCharge` cria charge aprovada sem `mpPaymentId` → refund não alcança o MP. `:4507`.
- **P0-05** — `syncChargeFromProvider` ativa plano em QUALQUER charge aprovada, sem checar `chargeKind/purpose`. `:2426`.
- **P0-06** — `CompanySubscription` sem `@@unique` parcial por empresa/status → corrida cria 2 assinaturas. `schema.prisma:520`.
- **P0-07** — `updatePreapproval` best-effort; plano local muda mesmo se o valor no MP não mudar. `:4090,4429`.
- **P0-08** — crédito de downgrade incrementa `billingCreditCents` sem op key (retry duplica) e não é abatido. `:4379`.

## RELEASE-20X — furos de segurança
- **[P2] Tenant guard observa-only** em prod (`mode=report`: loga e deixa passar); SQL cru não coberto. `tenant-guard.extension.ts:167`.
- **[P2b] Ligar `HBX_TENANT_GUARD_MODE=enforce`** quebraria o pool global do Radar (night-factory lê sem companyId). `night-factory.service.ts:366`. → precisa envolver os reads legítimos em `withoutTenantScope` antes.
- **[P3] Prompt injection** no classificador de intenção (texto inbound cru no prompt; risco baixo, saída constrangida). `ai-intent-classifier.service.ts:173`.
- **[P3] Webhook MP `mode=log`** por default (mitigado por refetch); endurecer p/ `enforce` no VPS após ~48h. `mercado-pago-webhook-signature.ts:85`.
- **[G4-gap] Quality gate NÃO roda em `npm run new`** (só no `publish.js`, não no `release.js`). `scripts/release.js`.

## RELEASE-20X — Play (tarefas do dono, no aparelho/Console)
- **Validar a voz (Web Speech) no aparelho**; se não funcionar, remover `RECORD_AUDIO` (permissão sem uso = red flag Data safety). `AndroidManifest.xml:9`.
- **Formulários do Play Console**: FGS location (vídeo demo), full-screen intent, Data safety, revisar política de privacidade, conta demo do revisor, conta org.
- **[fase 2] App Links / assetlinks.json** (autoVerify) — depende do SHA256 da chave Play após 1º upload. `AndroidManifest.xml:40-48`.

## RELEASE-20X — Codex (refactor/estrutura)
- Decompor `janela-empresas.tsx` (2073 linhas, tela mais crítica do master) e `janela-contabil.tsx` (1215 linhas).
- Painel **'Equipe' ainda lê o banco do app**, não o motor ao vivo (`/instance/connectionState`). *(migrou p/ Gerencial→aba Equipe)*
- **RBAC nº5 (27 chaves)** — na fila do dono; hoje o sistema decide por kill-switch de módulo.

## TESTE-GERAL
- **~194 `catch` de front sem `reportError`** (59 arquivos) — erro engolido vira "tela que não faz nada". Só as janelas financeiras foram instrumentadas (C9). Cleanup amplo aberto.

## Decisões abertas do dono (não são bug)
- **P2-03 / FUROS P0.3** — enforcement de crédito e hold de chargeback EXISTEM mas dormentes (track-first); ativar = rollout do dono (`HBX_CREDITS_ENFORCE` + flag por-tenant). → ver `CHECKLIST-ATIVACAO`.
- **FUROS P3 — free-riding do pool global**: e-mail enriquecido (que custou crédito de um tenant) é servido de graça a qualquer tenant logado. `night-factory.service.ts:361`. Decisão de produto.
- **CODEX** — corpo da issue #1 do GitHub inacessível (`gh` não instalado / repo privado): colar o texto ou instalar `gh` pra fechar o mapeamento.
