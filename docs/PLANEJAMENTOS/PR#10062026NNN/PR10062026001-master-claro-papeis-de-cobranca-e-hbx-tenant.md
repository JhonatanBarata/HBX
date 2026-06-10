# PR10062026001 — Master claro, papéis de cobrança e empresa HBX como tenant comum

Data: 10/06/2026
Status: PLANEJADO (To-Do)
Escopo: backend (modules, commercial-plans, billing state), frontend (master command center, gates de cobrança), AGENTS.md

---

## Visão do dono (como o sistema deve funcionar)

1. **Master é o mestre do sistema.** Toda regra ou módulo novo passa por ele. A superfície do
   master precisa de apenas: **Planos, Master, Email (do sistema) e Webwhats**. Nada de
   atendimento/vendas/cadastro na navegação do master — empresa se opera assumindo contexto.
2. **A tela master deve responder em 1 olhada:** qual cliente está em dia, qual foi liberado
   manualmente, qual está em trial/atrasado/suspenso, e qual regra está obsoleta ou competindo
   com outra. Hoje isso está espalhado em telas demais e calculado por motores demais.
3. **Empresa HBX é um tenant igual a qualquer outro** (sem privilégio nenhum no código),
   porém o master decide **não cobrar** (é a empresa do dono). Isso precisa ser um estado
   explícito ("isenta"), não uma gambiarra de "acesso manual" que aparece como alerta.
4. **Só o contratante (ADMIN) é cobrado ou avisado sobre plano.** Funcionário/vendedor nunca
   vê tela, banner ou motivo de cobrança. Se a empresa está irregular, o vendedor vê bloqueio
   neutro ("acesso pausado, fale com o administrador") — sem saber se o dono pagou ou não.

---

## Diagnóstico (verificado no código em 10/06/2026)

### Bug do vendedor cobrado (causa raiz)
- `frontend/src/components/PreCheckoutGate.tsx` roda em toda rota autenticada e só isenta
  `isSystemMaster`. Qualquer usuário — vendedor incluído — com empresa irregular é
  redirecionado para `/pre-checkout`, que em 5s manda para `/pagamento` (checkout).
- O backend já devolve o papel no perfil (`userKind: 'admin' | 'seller'`,
  `sellerProfile.isAdmin` em `backend/src/auth/profile.controller.ts` → `sanitizeUser`),
  mas o gate não usa.
- `listMyModules` (`backend/src/modules/modules.service.ts:2162`) devolve `blockedReason`
  financeiro ("Plano inativo. Regularize o acesso…", "Finalize a contratação…") para
  qualquer papel — o vendedor vê motivo de cobrança no grid de módulos.
- **(achado na execução)** `frontend/src/app/_lib/api.ts` redirecionava QUALQUER 403
  `MODULE_ACCESS_DENIED` para `/pre-checkout?reason=payment_failed` — mesmo quando o motivo
  era permissão de usuário, sem relação com pagamento. Era provavelmente o gatilho exato do
  caso do vendedor. Removido na Fase 1.3.
- **(achado na execução)** O backend financeiro já estava correto: `financeiro.service.ts`
  mascara valores/contatos para não-admin (`canManageBilling`) e bloqueia mutações
  (`assertCanManageBilling`). O vazamento era só de superfície (frontend + /modules/me).

### Regras competindo (mesma empresa, ~6 classificações diferentes)
| Motor | Arquivo | Vocabulário |
|---|---|---|
| `resolveCompanyModuleAccessPolicy` | `backend/src/modules/module-access-policy.ts` | pending_checkout, trial, paid, manual, grace, open, blocked |
| `companyStatusBucket` + `buildMasterCompanySummary` | `backend/src/modules/modules.service.ts` | PAYING, MANUAL_PREMIUM, TRIAL, TRIAL_ENDING, OVERDUE, NO_METHOD, SUSPENDED + `riskLevel` + `financialSituation` (string) |
| `buildMasterBillingSituation` | `backend/src/modules/master-billing-situation.ts` | paid, trial, manual, overdue, suspended, no_method, unknown |
| `evaluateCompanyStatus` | `backend/src/modules/modules.service.ts:1831` | recalcula `accessReleased` por conta própria |
| Heurísticas do Command Center | `frontend/src/app/master/_command-center/MasterCommandCenter.utils.ts` | `companyHasOperationalAccess`, `companyNoAccess`, `companyBillingPending`, `companyManualPremium`, `resolveReality` — tudo re-derivado de paymentStatus/subscriptionStatus crus |
| Gate global do app | `frontend/src/lib/billing-access.ts` (`resolvePreCheckoutReason`) | trial_expired, payment_failed, pending_checkout |

Conflitos concretos encontrados:
- **`grace` só existe na política de módulos.** Não existe em `statusBucket` nem em
  `billingSituation` → empresa em período de graça aparece como atrasada (ou some do filtro).
- **`PENDING` vira "Em atraso"** em `buildMasterBillingSituation.resolveReason`
  (linha 119: `!paidAllowed && paymentStatus === 'PENDING'` → overdue), mas na política é
  `pending_checkout` ("Checkout pendente"). Cliente novo que nunca pagou aparece como devedor.
- **`MANUAL_PREMIUM` → `riskLevel: 'warning'`** (`modules.service.ts:2695`) → toda empresa
  liberada manualmente (inclusive a HBX do dono) polui o radar de risco para sempre.
- **`MASTER_PLAN_CATALOG` duplicado à mão** no frontend
  (`MasterCommandCenter.utils.ts:18-56`, com preços/módulos/entitlements) — se o catálogo
  backend (`backend/src/commercial-plans/commercial-plan-catalog.ts`) mudar, o preview de
  troca de plano do master mente.
- **Dois estoques de permissão por usuário:** `userModuleAccess` (legado) + team policy,
  sincronizados por `syncUserTeamPolicyModulesFromLegacyAccess`. Funciona, mas é regra
  duplicada viva — candidata a aposentadoria controlada.

### Telas demais / código morto no master
- **Código morto (~140KB), inclusive ainda recebendo manutenção:**
  - `frontend/src/app/master/_components/MasterOperationalViews.tsx` (51KB — não é importado por ninguém, e está no diff de hoje!)
  - `frontend/src/app/master/_components/MasterPremiumCharts.tsx`
  - `frontend/src/app/master/_components/MasterPremiumChrome.tsx`
  - `frontend/src/app/master/page.module.css` (42KB — só importado pelos 3 mortos acima)
- **Navegação fantasma:** `page.premium.tsx` passa `initialSection={searchParams.get("tab")}`,
  mas `MasterCommandCenter.tsx` **nunca lê** `initialSection`. Resultado: as rotas legadas
  `/master/clientes`, `/master/financeiro`, `/master/operacao`, `/master/whatsapp`,
  `/master/planos` redirecionam para um parâmetro ignorado — todas caem em "Empresas".
- **Master vê tudo:** `listMyModules` para system master devolve TODOS os módulos
  (atendimento, vendas, webscraping, cadastro, financeiro, gerencial, website, master,
  exclusoes) com `accessible: true`.
- AGENTS.md aponta para `docs/ai/README.md` e mais 6 arquivos — **a pasta `docs/ai` não existe**.

### Empresa HBX
- Não há special-case por slug "hbx" no backend (correto, manter assim).
- `companyKind: 'platform_infra'` é outra coisa (empresa de infraestrutura, sem módulos
  comerciais). A empresa HBX de operação deve ser `tenant` comum.
- Hoje a única forma de "não cobrar" é `paymentStatus: MANUAL` / `premiumAccess`, que:
  aparece como "Acesso manual" (warning permanente), entra nos KPIs de atenção e se mistura
  com liberações temporárias de clientes reais. Falta o estado **isenta**.

---

## To-Do — refatorações cirúrgicas

> Ordem pensada para cada fase entregar valor sozinha e nenhuma fase enfraquecer paywall.
> Regra de ouro em todas: **bloqueio neutro para vendedor ≠ liberar acesso** — o vendedor
> continua bloqueado quando a empresa está irregular; só a mensagem muda.

### Fase 0 — Higiene antes de mexer
- [x] **0.1 Working tree limpa** — o trabalho pendente era do Codex e foi descartado pelo
      dono em 10/06/2026; preservado em `git stash` "trabalho-pendente-codex-descartado-10062026".
- [x] **0.2 Apagar código morto do master:** `MasterOperationalViews.tsx`,
      `MasterPremiumCharts.tsx`, `MasterPremiumChrome.tsx`, `master/page.module.css`.
      Critério: `npm run build` do frontend passa; nenhum import quebrado. ✔ build OK.

### Fase 1 — Bug urgente: vendedor nunca vê cobrança
- [x] **1.1 `PreCheckoutGate.tsx`:** redireciona para `/pre-checkout` apenas quando
      `userKind === 'admin'`. Vendedor com empresa irregular vê o novo
      `CompanyAccessPausedScreen` — neutro, sem valores, sem checkout, com "Verificar
      novamente" e "Sair". O poll de 15s libera sozinho quando o admin regularizar.
- [x] **1.2 Backend:** novo helper puro `presentModuleBlockForRole` em
      `module-access-policy.ts` aplicado em `listMyModules` — para papéis não-ADMIN,
      `pending_checkout`/`subscription_inactive` viram `company_access_paused` e
      `plan_required` vira `module_not_enabled`, sempre com `criticalEngine: null`
      (a UI deixa de oferecer "Regularizar"/link de pagamento). O bloqueio em si não muda
      (`accessible` continua calculado com o motivo original).
- [x] **1.3 Auditoria de superfícies:** removido o redirect global de 403
      `MODULE_ACCESS_DENIED` → `/pre-checkout?reason=payment_failed` em `api.ts` (assumia
      que qualquer negação de módulo era pagamento, para qualquer papel). TopBar sem banner
      ativo (`pendingCheckoutLocked` hardcoded false); `ModuleNav` cai em texto neutro para
      códigos desconhecidos; `boasvindas` só redireciona com `?reason=` explícito na URL;
      backend financeiro já mascarava dados para não-admin.
- [x] **1.4 Testes:** 3 casos novos em `module-access-policy.test.ts` (admin vê motivo
      financeiro / seller vê neutro e segue bloqueado / bloqueios não-financeiros passam
      intactos). 14/14 passando; builds backend e frontend OK.

### Fase 2 — Uma única fonte de verdade para o estado do cliente
- [x] **2.1 `backend/src/modules/company-access-state.ts` criado:** `resolveCompanyAccessState`
      com vocabulário `platform_infra | exempt | manual | paying | trial | trial_ending |
      grace | overdue | pending_checkout | suspended | unknown` + canUse, statusLabel,
      riskLevel, detailCode. Decisões de precedência documentadas no arquivo.
- [x] **2.2 Os 4 motores viraram projeções** (4 commits, contratos preservados):
      `resolveCompanyModuleAccessPolicy` (novo blockedCode `billing_overdue`, neutralizado
      p/ vendedor), `companyStatusBucket` (novos buckets GRACE/PENDING_CHECKOUT/EXEMPT),
      `buildMasterBillingSituation` (grace/pending_checkout/exempt no financeiro),
      `evaluateCompanyStatus` (pergunta ao canônico; graça não ressuscita suspensão dura).
      Corrigido na passagem: PENDING ≠ "Em atraso"; manual ≠ warning; PAID sem método ≠
      "Sem método"; **reativação não espalha mais premiumAccess para empresa paga/trial**
      (bug que transformava cliente pago em "Acesso manual").
- [x] **2.3 `accessState`/`accessStateLabel` expostos** no CompanySummary (workspace e
      detail) e em `/profile/current-user` (detalhe só para admin/master; vendedor recebe
      apenas `accessReleased` booleano — coerente com a Fase 1).
- [x] **2.4 Frontend master lê o canônico:** heurísticas re-derivadas substituídas por
      leitura de `company.accessState`; `resolveReality` reescrito; filtro e label novos
      para Isenta/Graça/Checkout pendente; trial-vencendo unificado (7d, backend decide).
- [x] **2.5 Catálogo duplicado morto:** `MASTER_PLAN_CATALOG` virou esqueleto sem preços;
      dados reais vêm de `workspace.plansCatalog` servido pelo backend
      (`buildMasterPlansCatalog` → mesma fonte do checkout).
- [x] **2.6 `billing-access.ts`** prefere `accessReleased`/`accessState` do perfil;
      cálculo legado mantido como fallback (payloads antigos e distinção
      trial_expired × payment_failed em suspended).
- [x] **2.7 Matriz de testes:** 18 casos no resolvedor canônico (1 por estado + conflitos
      históricos + precedência com empresa desativada pelo runtime + proteção de paywall
      para trial vencido sem sinais).

### Fase 3 — Empresa HBX: tenant comum + isenção explícita
- [x] **3.1 Schema + migração:** `Company.billingExempt/billingExemptReason/billingExemptAt/
      billingExemptByUserId` (migração `20260610_company_billing_exempt` idempotente +
      colunas garantidas em runtime via `ensureMasterBillingRuntimeSchema`). Setável apenas
      por `PUT /modules/master/company/:id/billing-exemption` (MasterGuard), motivo
      obrigatório ao isentar, auditoria `COMPANY_BILLING_EXEMPTION_SET/REMOVED`.
- [x] **3.2 Resolvedor canônico:** `exempt` liberada, estável, label "Isenta (decisão
      master)" (entregue na Fase 2); sweeps de e-mail (régua de cobrança e aviso de trial)
      pulam `billingExempt` explicitamente em `financeiro.service.ts`.
- [x] **3.3 Master UI:** aba Cobrança ganhou bloco de isenção (motivo + "Isentar cobrança" /
      "Remover isenção"), InfoItem "Isenção", aviso quando isenta; KPI "Isentas" e filtro
      "Isenta" separados de "Premium manual" (board da Fase 2).
- [x] **3.4 Invariante mantida:** zero special-case por slug/nome; isenção é só dado.
      Bônus: corrigido `updateCompanyProfileByMaster` que espalhava `premiumAccess` para
      assinatura active/trialing (mesma classe do bug do evaluate).
- [ ] **3.5 Aplicar na prática (operação do dono):** abrir Master → empresa HBX → aba
      Cobrança → "Isentar cobrança" com motivo "Empresa interna HBX". Depois disso ela
      aparece como "Isenta" no board e nunca recebe cobrança/aviso.

### Fase 4 — Master enxuto, organizado por módulo
- [x] **4.1 Superfície do master:** `MASTER_SURFACE_MODULE_KEYS` (`master`, `exclusoes`) em
      `listMyModules` — master puro não vê mais a lista inteira de módulos comerciais na
      navegação. Quando assume contexto de empresa, continua vendo a operação completa.
- [x] **4.2 Abas primárias:** `Empresas | Planos & Regras | Email | Webwhats | Banco de
      Dados | Tokens | Links | Atualizar`. Nova aba **Planos & Regras**: catálogo vivo
      (workspace.plansCatalog, mesma fonte do checkout) + exceções ativas agrupadas
      (Isentas com motivo, Acesso manual, Em graça, Checkout pendente), cada uma com botão
      "Abrir" direto na empresa.
- [x] **4.3 Board com badge única:** linha mostra `accessStateLabel` canônico (tom = risco)
      + plano + valor mensal + próxima ação. Removidos rótulos concorrentes e a
      `recommendedBoardAction` duplicada. Bônus: toolbar do board ganhou filtro por estado
      (com contagens) e busca — `MASTER_COMMAND_FILTERS`/`filterCompanies` existiam mas
      estavam mortos, sem nenhuma UI usando.
- [x] **4.4 Navegação fantasma consertada:** `initialSection` agora é lido —
      clientes/empresas/operacao→Empresas, financeiro→Empresas+filtro "Cobrança pendente",
      whatsapp→Empresas+filtro "WhatsApp atenção", planos→Planos & Regras, email/webwhats→
      abas respectivas. As rotas legadas `/master/*` voltaram a funcionar.
- [x] **4.5 Webwhats no master:** aba própria com visão de governo do motor (saudáveis ×
      atenção, próximo passo por empresa, atalho para o inspector). Sem duplicar a tela de
      conexão, que segue na aba WhatsApp do inspector.

### Fase 5 — Documentação pós-refatoração (não se perder)
- [ ] **5.1 Atualizar `AGENTS.md`:**
      - Nova seção **"Access & Billing State"**: o resolvedor canônico
        (`company-access-state.ts`) é a única fonte de verdade; proibido re-derivar estado
        de `paymentStatus`/`subscriptionStatus` crus em tela.
      - Nova invariante: **vendedor nunca vê cobrança** — mensagens financeiras só para
        admin/contratante; bloqueio de vendedor é sempre neutro.
      - Nova invariante: **empresa HBX é tenant comum** — isenção é estado de dados
        (`billingExempt`), nunca special-case de código.
      - Mapa do master atualizado (abas, superfície mínima: Planos, Master, Email, Webwhats).
      - Corrigir o índice quebrado: criar `docs/ai/` mínimo com os arquivos referenciados
        ou remover a referência do AGENTS.md.
- [ ] **5.2 Marcar este documento como CONCLUÍDO** com data e desvios anotados.

---

## Checks por fase (do AGENTS.md)
- Frontend: `cd frontend && npm run lint && npm run build`
- Backend: `cd backend && npm run prisma:validate && npm run build` + testes dirigidos:
  `module-access-policy.test.ts`, `commercial-plan-catalog.test.ts`,
  `team-policy.service.test.ts`
- Nada de deploy/publish durante o refactor.

## Riscos e salvaguardas
- **Paywall:** nenhuma fase pode tornar feature paga acessível sem plano — os testes da
  Fase 1.4/2.7 garantem que o bloqueio do vendedor permanece, só a mensagem muda.
- **Migração Prisma (3.1):** aditiva (campo novo com default `false`), sem operação destrutiva.
- **Fase 2 é a maior** — fazer motor por motor (4 commits), nunca os 4 de uma vez, mantendo
  o contrato de API até a 2.3.
