# PLAN — Planos, Cobrança & Acesso + Master Self-Checkout

> Origem: ordem do dono 18/06 (organograma "planos"). **Um assunto, várias frentes**
> na ordem travada. Não confundir com `PLAN-WHATSAPP-PER-USER.md` (outro assunto).
>
> **Fronteira (19/06):** a EXPERIÊNCIA do funil público (cadastro → confirmação → pagamento,
> continuidade, visual, "Lista Fria", mock card, confirmação por WhatsApp) saiu pra
> `PLAN-ONBOARDING-SELF-CHECKOUT-FUNIL.md`. Aqui mora o **backend comercial** (catálogo do
> master F2, estados, gate do **logado** F8); lá mora o **anônimo no funil**. Sem duplicar regra.

## Regra de ouro (organograma único)

- **Preço vem de UM lugar: o PLANO.** Reajuste (ex.: +10%) = mexe no plano, 1 vez;
  toda empresa naquele plano sobe junto. Empresa **nunca copia** o preço — só aponta
  `plano + ciclo`.
- **Assinatura recorrente = `preço do plano + (assentos extras × R$ 24,90)`.** Tudo que
  mexe em dinheiro **recalcula esse número num lugar só** e empurra pro Mercado Pago.
- **Acesso nasce de 3 origens — nenhuma grátis por engano:**
  1. **PAGO** — assinatura/assento ativo e aprovado.
  2. **CORTESIA** — única liberação grátis, motivo obrigatório (`status='courtesy'`).
  3. **PREÇO 0 / PENDENTE** — cadastro feito, **sem acesso operacional** (`pending_checkout`),
     tela neutra "especialista entra em contato".
- **$ mora no ADMIN.** Gerente preenche (cadastra), Vendedor recebe. **Cadastro nunca
  cruza com dinheiro.**
- **Sem legado:** mata o `Plan` legado (prata/ouro/diamante) no passo do catálogo editável.

## Decisões travadas (18/06)

1. **Preço 0** → cria em `pending_checkout` + flag "contato comercial". **Não** é cortesia
   (cortesia libera acesso — não serve). Acesso = **read-only** (passeio), e a **tela de
   espera/showcase o DONO desenha** (fora deste plano). Backend só crava o **modo read-only**
   (o que é visível × bloqueado) pra não vazar feature/dado pago.
   > ⚠ **REVISTA em 19/06 (ver F8):** o dono cravou **"sem cartão, sem app"** — curioso
   > sem cartão **não passeia**. F8 assume que 19/06 SUPERSEDE este read-only/passeio.
   > **Confirmar com o dono antes de buildar** (decisão de regra, não de código).
2. **Plano é dono do preço**; empresa só aponta; override por empresa = exceção rara e
   marcada; mata `Plan` legado.
3. **Cobrança MP:** assinatura recorrente = `plano + assentos`; ao mudar, recalcula e
   empurra pro MP (vale do próximo ciclo); **proporcional = cobrança avulsa na hora**
   (`24,90 × dias restantes / dias do ciclo`); **paga-primeiro** (assento só com cobrança
   aprovada).
4. **Bloco de assentos:** Admin compra capacidade ("+N acessos" paga o bloco na hora);
   Gerente preenche o cadastro sem nova cobrança. Cobrança no **bloco (capacidade)**, nunca
   na pessoa. `seatCap` (já existe) = capacidade paga; usuários ativos ≤ seatCap.
   Gerente **só módulo**, nunca assento/cobrança.

## O que JÁ existe (não reconstruir)

- `+ Nova empresa` (`frontend/.../master/janela-empresas.tsx` → `POST /master/provisioning/tenants`):
  já cria com `planKey`, `billingCycle`, `admin {nome,email,phone}`, slug, `taxDocument` (CNPJ/CPF).
- **MasterEd ~80% pronto** na aba *Comercial* da empresa: edita trial, plano, quota+`seatCap`,
  desconto, meses grátis, ciclo, setup, mensalidade override, liga/desliga módulo
  (gateado em `isFull` — "régua única" PR13062026007).
- **Catálogo em CÓDIGO** (`backend/src/commercial-plans/commercial-plan-catalog.ts`): preços,
  planos (List/Lead Plus/Pro/Implantação), assentos inclusos, extra R$24,90, módulos por plano,
  entitlements, quotas. **Não é editável em runtime.**
- **`Plan` legado** semeado em `backend/src/bootstrap/structural-defaults.json` (prata/ouro/diamante)
  — "unificação pendente".
- **"Gerente" já existe** = `ADMIN` com `canViewBilling=false` (não é papel novo). Papéis reais:
  `USER` (vendedor) e `ADMIN`. (`profile.controller.ts`, `financeiro.service.ts:670-672`,
  `Company.sellerCargoAccessJson` + `User.canViewBilling`.)
- **`seat-billing.util.ts`** já existe (base do assento extra).
- **Módulos hoje** (`structural-defaults.json`): `atendimento, vendas, gerencial, webscraping,
  cadastro`. **Bot e e-mail NÃO são módulos** — bot é a chave-mestra do master (`bot-armed.guard.ts`).
- **Estados comerciais canônicos** (`Company.status` + `resolveCompanyAccessState`):
  `pending_checkout | trial | active | courtesy | overdue | suspended`.

## Frentes (ordem de build travada)

### F1 — Bot e e-mail viram módulos  ✅ FEITO 18/06 (worker Sonnet, verificado)

> `bot`+`email` em `structural-defaults.json` (defaultEnabled:false), `team-access-catalog.ts`
> (`bot.access`/`email.access` + MODULE_ACCESS_EQUIVALENTS), `modules.service.ts` (display
> order + blocked p/ infra). 4 checks verdes. Chave-mestra intacta. **Aberto:** `email.access`
> `defaultForSeller` (worker pôs `true`); `bot` fora de SELLER_ELIGIBLE e serviceUrl null = F4/F5.

- **Escopo:** promover `bot` e `email` a módulos de 1ª classe (chaves de módulo), tratados
  como os demais (liga/desliga por empresa, distribuição por usuário via team policy).
- **Regra:** "atendimento sempre libera 1 user pro WhatsApp" (alinha com WHATSAPP.md
  1 número = 1 user). Acesso de módulo **nunca misturado** entre admin/users.
- **Manter** a chave-mestra do master como trava anti-ban (bot).
- **Contrato backend:** add keys em `structural-defaults.json` + `team-access-catalog.ts`;
  refletir em `modules.service` e na lista de módulos do MasterEd.
- **Checks:** `cd backend && npm run prisma:validate && npm run build`; `cd frontend && npm run lint && npm run build`.

### F2 — Catálogo editável (Self-Checkout)  ✅ FEITO 19/06 (orquestrador Opus)

> **Entregue:** overlay editável em `commercial-plan-catalog.ts` (getters + catálogo
> leem override; fallback seguro na base) hidratado de `PlanModuleConfig.planInfoJson`
> no boot e a cada PUT (`modules.service.refreshCommercialCatalogOverlay`). Novos campos
> nome/observação/**status (paused)** no mesmo JSON. Vitrine pública (`/?ver=planos`)
> embaça/inclica card pausado (`plan-card.tsx` + `.site-plan2.is-paused`); checkout
> barra plano pausado (`commercial-plans.service.selectPlanForUser`). UI nova **janela
> Self-Checkout** (4 guias: Planos/Preços e ciclo/Módulos/Acentos) — `PlanosEditor`
> legado do Sistema removido (sem duplicar). Teste novo no catálogo (overlay reflete +
> pausa + fallback). 4 checks verdes. **Aberto:** aplicar limites de quota (régua) segue
> fora deste plano (comentário em `modules.service.resolvePlanInfoBase` mantém).
- **Escopo:** master edita por plano — nome, observação, **ativo/pausado**, preço, ciclo,
  módulos inclusos, assentos. Reflete no app e na página pública (`?ver=planos`).
- **Arquitetura limpa:** tabela DB sobrepondo o catálogo (seed = valores de hoje), **fonte
  única**; empresa só aponta. Invalidação de cache.
- **`Plan` legado: JÁ MORTO** (migration `20260613_remove_legacy_plan_feature` — drop de
  `Plan`/`Feature`/`_PlanFeatures`/`Company.planId`; código/schema/seed já limpos, confirmado
  18/06). Nota do `PAGAMENTOS.md` ("ainda semeia Plan legado") está **desatualizada**.
- **Pausar plano:** `status: paused` → card embaçado/inclicável na página de planos até liberar.
- **Risco:** lista sensível (preço/plano/paywall). Trilha planejada, com teste.
- **Confirmado:** `?ver=planos` é deste app/site — o pause reflete aqui mesmo.

### F3 — Wizard "+Nova empresa" + aba "MasterEd" + fronteira master/empresa
- **Wizard** (etapas: nome → plano → ciclo → admin inicial → avançado): em "avançado" seta
  preço/acentos/acessos; **preço 0 → `pending_checkout` read-only** (decisão 1).
- **MasterEd:** consolidar a aba Comercial; **gate `isFull` LIFTADO** — master edita
  módulo/preço/acento/trial de todas as empresas (List/Lead seguem rodando sozinhas).
- **Fronteira (#5):** master atua no nível **empresa**; quem distribui módulo a usuário é
  admin/gerente. Garantir/testar (já é a arquitetura: superfície master mínima + "assumir contexto").
- **CNPJ/CPF:** `taxDocument` **opcional na criação, exigido na cobrança**; validar CPF×CNPJ.

### F4 — Painel admin/gerente + delegação
- Admin e gerente (=ADMIN sem $) têm painel de módulos em "gerenciar"; vendedor não.
- **Delegação** ("do master pra baixo só libera o que você tem"): cada nível só concede o
  que possui. Gerente concede **só módulo** (nunca assento/cobrança).

### F5 — Agenda do bot (depende de F1)
- Sequência: 1º contato pela vendedora → retorno agendado (agenda revive). Opções: e-mail
  automático (se card tem e-mail), WhatsApp automático (se card tem whatsapp); avisar se os
  automáticos se cruzam em dias. Anexo de apresentação **próprio do vendedor**.
- Ao iniciar a agenda: perguntar retorno **automático × manual** — só se **bot é módulo**.
- Bot módulo presente mas **sem a chave-mestra do master** → aviso "faltando configuração,
  contate suporte (clique aqui)" + **dispara WhatsApp pro master** (quem pediu + telefone/empresa).
  (Master já tem chip de WhatsApp.) Quebrar em sub-itens.

### F6 — Cobrança de assento extra  ✅ NÚCLEO FEITO 19/06 (orquestrador Opus)

> **Entregue:** `computeImmediateExtraSeatCharge` (puro+teste) = `extraSeatMonthly × N ×
> diasRestantes/diasDoMês` — valor do assento vem do catálogo (reflete F2). Serviço
> `financeiro.purchaseExtraSeats` espelha o upgrade: **admin-gated** (`assertCanManageBilling`
> → gerente sem billing barrado), **paga-primeiro** (seatCap só sobe com cobrança ok),
> dry-run preview, **mock roda ponta a ponta** (cobra proporcional + sobe `seatCap`),
> **live com cobrança>0 → `LIVE_SEAT_CHARGE_TODO`** sem mexer em nada (mesmo gate do
> upgrade). Endpoint `POST /financeiro/subscription/extra-seats`. UI **"+N acessos"**
> (`extra-seats-card.tsx`) na Config → Plano e cobrança (admin pagante, plano ≠ List).
> "Valor cheio no próximo mês" já vem do seat snapshot recorrente.
- **Aberto (mesmo da troca de plano):** validar a cobrança avulsa LIVE no Mercado Pago na
  VPS com credenciais de teste + bump do `updatePreapproval`. Idempotência da cobrança
  avulsa entra junto nessa validação. **Risco máximo:** provedor de pagamento.
- "+N acessos" = bloco pago (capacidade); gerente preenche depois. Remover pessoa libera o
  assento pra reuso dentro do cap; recorrente só cai se admin remover **capacidade**.

### F2.1 — Política comercial dentro do Self-Checkout + fim de cruzamentos  ✅ FEITO 19/06

> Ordem do dono 19/06: "injete a política comercial no self-checkout, não deixe repetir
> regra". **Fonte única** estabelecida em 3 eixos que cruzavam:
> - **Desconto anual:** era hardcoded 20 no catálogo E um campo paralelo `annualPlanDiscountPercent`
>   na policy (mostrava 0, ignorado p/ planos comerciais — enganoso). Agora: catálogo é
>   autoridade (`getCommercialAnnualDiscountPercent`, default 20), alimentado pela policy via
>   overlay; aplicado em catálogo/financeiro/modules/commercial-plans/serialize. GET devolve o
>   **efetivo** (não 0). UI migrou p/ guia **Política** do Self-Checkout.
> - **Assento extra:** era por-plano (catálogo) E global (policy). Agora **só por-plano**
>   (`getCommercialPlanExtraUserMonthlyPrice`, overlay) em todos os snapshots; knob global da
>   policy removido (coluna órfã, sem migration destrutiva).
> - **Assentos inclusos:** `modules.service.buildSeatBillingSnapshot` usava `2` hardcoded →
>   agora `getCommercialPlanIncludedUsers(planKey)`.
> - "Política comercial" saiu do Sistema (subtabs renumeradas); `PlanosEditor` já tinha saído.
> - Teste novo (anual fonte única) + corrigido teste stale de título (`module-access-policy`:
>   'HBX Full — Bot e IA' → 'Implantação'). 40 testes verdes; back+front build; catraca 510/516.

### F7 — Faxina / sem legado (inventário 19/06 — confirmado lendo o código)

> Ordem do dono 19/06: "limpe a sujeira que achar no caminho — sem legado". Varredura
> feita junto do mapeamento do onboarding. **Aliases redirect-only NÃO são sujeira**
> (`/register`, `/planos`, `/workspace`, `/dashboard/master` → padrão sancionado de alias).
> O kill do `Plan` legado já caiu em F2.

**Sujeira CONFIRMADA (morta) — sai junto de F8:**
- `hbx:need-checkout` (`frontend/.../bloqueio-gate.tsx:42`): tem **listener, zero
  dispatcher** no projeto inteiro. Código morto — o checkout inline nunca abre sozinho.
- Exceção "pending_checkout não bloqueia / vitrine read-only" ("B2 de 040",
  `bloqueio-gate.tsx:83-95`): contradiz a regra única (F8). Sai em F8.
- `/pre-checkout` + `/precheckout` (`app/(app)/pre-checkout/page.tsx`,
  `.../precheckout/page.tsx`): redirecionam pro `/dashboard`; o motivo declarado ("a tela
  de checkout ainda não existe no front novo") está **FALSO** — o checkout vive na casca
  `/?ver=planos`. **Load-bearing:** o backend ainda emite `next:'/pre-checkout?reason=...'`
  (`auth.service.ts:414` + 4 testes). **F8 repõe o destino** → só então as rotas saem.

**Doc desatualizada (corrigir):**
- `docs/Rules/PAGAMENTOS.md` (Catálogo comercial) ainda diz que `structural-defaults.json`
  "semeia Plan legado (prata/ouro/diamante)" — **já morto** (migration
  `20260613_remove_legacy_plan_feature`, confirmado em F2.1). Apagar a nota.

**A VERIFICAR (não cortar sem confirmar a canônica — regra "tela do menu"):**
- `/tutorial` (página real, `TutorialClient`) + `/boasvindas` (alias → `/tutorial`) vs. o
  **coach interativo** disparado por `BoasVindasGate` + `TutorialCoachHost` (vive no
  app-shell). O backend manda recém-confirmado pra `/boasvindas`→`/tutorial`, mas o gate
  também resolve `tutorialPending` com o coach. Confirmar se há **dois tutoriais** e qual
  é o canônico antes de mexer.

**Resultado da varredura (workers Sonnet, 19/06):**
- ✅ Nota stale do `PAGAMENTOS.md` corrigida (Plan legado morto; seed só tem `systemModules`).
- ✅ 403 cru no export de relatórios corrigido (`relatorios/page.client.tsx`): 403 vira
  upsell ("Exportar PDF faz parte do HBX Lead Plus ou superior"), outros erros = mensagem
  amigável sem HTTP; botão "Exportar PDF" escondido pra `hbx_lite` via `useEntitlements`
  (fail-closed). lint+build verdes.
- `/boasvindas`: **alias morto confirmado** — backend NÃO manda mais ninguém pra lá
  (`auth.service.ts:1772-1774`; comentário do `page.tsx` é histórico), nenhum link interno
  aponta. **Remover na limpeza de aliases** — atualizar junto `docs/Rules/FRONTEND.md:117`
  (ainda lista `/boasvindas` e `/pre-checkout` como aliases ativos).
- `/tutorial`: **NÃO é vestígio** — botão "Tutorial" no menu avatar (`shell.tsx:831`) re-roda
  o tour; manter. Inconsistência menor: `/tutorial` não chama `POST /profile/tutorial-done`
  (só o gate chama) → re-assistir não remarca. Alinhar quando mexer.

### F8 — Onboarding & Acesso unificado: regra única "sem cartão, sem app"  ✅ FEITO 19/06 (worker Sonnet + revisão Opus)

> **Entregue:** `bloqueio-gate` agora BARRA `pending_checkout` (removidas a exceção
> read-only B2 e o listener morto `hbx:need-checkout`; vendedor segue NEUTRO);
> `signupWithGoogle` default → **Lead Plus**; `preCheckoutNextPath` → `/dashboard` (rota
> morta `/pre-checkout` saiu); 3 rotas mortas deletadas (`/pre-checkout`, `/precheckout`,
> `/boasvindas`) + `FRONTEND.md` (lista de aliases) atualizado; 4 asserts de
> `auth.service.test.ts` ajustados. Checks verdes no worktree (16/16 testes, back+front
> build, check-pele 510/510); runtime confirmado (`accessPaused = !canUse` ⇒ pending
> bloqueia). **Aberto:** copy do `SubscribeCardModal` ciente de trial (polish, item 6);
> build integrado final no main pendente (há WIP do dono em `whatsapp-connect-modal.tsx`).

> Ordem do dono 19/06. **Não é regra nova em cima de regra** — é a regra ÚNICA, e o
> trabalho é APAGAR as exceções que a furam (ver F7). Dono: "a ideia sempre foi forçar o
> cartão, espanta curioso que cadastra e sai; liberar pelo Google quebra a regra."

**Regra única:** ninguém entra no app sem cartão na ficha. O trial de 14d **também exige
cartão** (não cobra, mas exige). Vale **idêntico** pro cadastro por e-mail e pro Google.

**✅ Conflito RESOLVIDO (confirmado pelo dono 19/06):** a regra de 19/06 **supersede a
Decisão 1** — o passeio read-only IN-APP morre (sem cartão = barrado). O "encher o olho"
(teaser de empresas borradas) sobrevive **só no funil público pré-cartão**, nunca dentro do app.

**O furo hoje (por que o Google entra de graça):**
- Google usuário novo (`auth.service.googleLoginOrSignup` → `signupWithGoogle`) cria
  empresa em **`hbx_lite`/`pending_checkout`** e **entra no app**, sem cartão
  (`auth.service.ts:322,1383`).
- `pending_checkout` não bloqueia + `hbx:need-checkout` nunca dispara (F7) → navega de
  graça, sem lugar pra pagar.
- Login gate manda `next:'/pre-checkout'` (rota morta, F7).

**Decisão FINAL (confirmada 19/06) — como o mercado faz:** separar por estado de login.
- **Anônimo** (sem conta) → casca `/?ver=planos` (cadastro+pagamento por e-mail). **Inalterada.**
- **Logado e sem cartão** (Google novo, login pending/overdue/trial-expirado) → **ativação
  IN-APP**: entra logado mas **barrado**, na tela que JÁ existe (`bloqueio-gate` "Ative seu
  plano HBX" + `Configurações → Plano e cobrança`), com **Lead Plus pré-selecionado** (trial
  14d), podendo trocar, cartão ali. Refina o "(b)": o equivalente do funil pro logado é a
  tela de billing interna — a casca de marketing **NÃO** vira auth-aware.
- Fundamento: padrão dos SaaS (Notion/Linear/Slack/Vercel) — funil = aquisição (anônimo);
  depois de logar, cobrança mora dentro do produto. Reusa o que já existe, respeita fonte única.

**Contrato (execução via worker Sonnet + revisão do Opus — financeiro sensível):**
1. **Frontend `bloqueio-gate.tsx` (NÚCLEO):** remover a exceção "pending_checkout não
   bloqueia / vitrine read-only" (~linhas 83-95) → `pending_checkout` passa a **barrar** e
   mostrar o card de ativação que JÁ existe ("Ativar agora" → `SubscribeCardModal`; "Ver
   planos" → Configurações). Remover o listener morto `hbx:need-checkout`. Preservar o
   bloqueio NEUTRO do vendedor (USER nunca vê preço/cobrança).
2. **Backend `signupWithGoogle`:** default deixa de ser `hbx_lite` → **`hbx_padrao` (Lead
   Plus)**, só no caminho do Google. NÃO mexer em preço/entitlement/quota nem no fallback geral.
3. **Backend `preCheckoutNextPath` (`auth.service.ts:413`):** parar de apontar `/pre-checkout`
   (rota morta) → `/dashboard` (entrada do app, onde o `bloqueio-gate` captura). O destino
   final já é `/dashboard` hoje (via redirect da rota morta) → preserva comportamento, tira o
   hop morto. **Tracear os 3 callers** e garantir que o e-mail (CheckoutPanel na casca) NÃO
   quebra. Atualizar os **4 testes** de `auth.service.test.ts`.
4. **Faxina acoplada (F7):** remover rotas mortas `/pre-checkout` + `/precheckout` + alias
   morto `/boasvindas`; atualizar `docs/Rules/FRONTEND.md:117` (lista de aliases).
5. **GUARD-RAILS (inegociável):** backend é fonte de verdade; **nada de afrouxar paywall**;
   não tocar em preço/plano/entitlement/quota/webhook; trial = cartão exigido, sem cobrança.
   Build + testes verdes; **sem push/deploy**.
6. Polish (não-bloqueante): copy do `SubscribeCardModal` ciente de trial pro Lead Plus
   (reusar "não cobramos por X dias" do `CheckoutPanel`). Bug do 403 no export **já corrigido**.

**Bugs ao vivo (documentados a pedido do dono 19/06 — corrigir junto de F8):**
- 403 cru na cara do cliente: `app/(app)/relatorios/page.client.tsx:134`
  (`Não foi possível exportar (HTTP ${res.status})`). Nunca vazar status HTTP; botão
  "Exportar PDF" não deve aparecer pra quem não tem `canExportConversionPdf` (List).
- Copy "Upgrade/Downgrade sem perder o pago" pra quem nunca pagou: revisar a narrativa de
  pagante na vitrine/resumo quando a empresa está sem assinatura ativa. (O
  `trocar-plano-modal` já trata o caso, mas a moldura externa vende crédito/proporcional.)

**Checks:** `cd backend && npm run prisma:validate && npm run build` + `auth.service.test.ts`;
`cd frontend && npm run lint && npm run build`. Caminho de acesso/checkout = **teste
obrigatório** (nada de paywall afrouxado no front).

## Decisões fechadas (18/06 — 2º bloco)

- **F3 gate `isFull`:** **LIFTADO** — master edita módulo/preço/acento/trial de **toda**
  empresa (List/Lead/Pro/Full). List/Lead seguem rodando sozinhas; o master só mexe se
  precisar. Um painel pra todos (mais simples).
- **F3 `taxDocument`:** **opcional na criação, exigido na cobrança** (billing precisa de
  CNPJ/CPF). Não trava o cadastro rápido / preço-0. Validar CPF×CNPJ.
- **F2 `?ver=planos`:** é **deste app/site** — o pause reflete aqui mesmo.
- **F2/F6 (financeiro):** cartão on-file no MP **confirmado**. O **DONO autorizou o
  orquestrador (Opus) a executar as frentes financeiras direto** — não delegar a worker Sonnet.

## Execução (orquestração)

- Workers **Sonnet** (subagente, worktree próprio) fazem: **F1, F3, F4, F5**.
- **Opus (orquestrador) faz direto: F2 e F6** (preço/cobrança — sensível).
- Ordem real (dependência): **F1 → F2 → F3 → F4/F5 → F6 → F7 → F8**.
- **F8 (acesso/checkout)** é trilha financeira sensível → **Opus direto** (como F2/F6);
  depende de F7 (limpeza das exceções que furam a regra).
- Worker volta com dúvida → orquestrador tria → pergunta ao dono → injeta SÓ o decidido → segue.
- Push / abrir PR / deploy = passo **explícito** do dono, nunca automático.

## Checks padrão por frente

- Backend: `cd backend && npm run prisma:validate && npm run build` + testes direcionados.
- Frontend: `cd frontend && npm run lint && npm run build`.
- F2/F6 (sensíveis): teste obrigatório do caminho de preço/cobrança; nada de paywall afrouxado no front.

### F9 — Catálogo de módulos morre; Self-Checkout vira fonte única + Gerencial → admin (ordem do dono 21/06)

> Ordem do dono 21/06: "remover esse Módulos sem ferir o Self-Checkout (já tem as regras de
> criações futuras); o Self-Checkout é a fonte; Gerencial não é módulo, vai pros admin;
> corrigir de vez sem afetar a árvore." **Frente financeira/acesso → Opus direto + diff revisado.**

**Verdade apurada (contra "a regra já está desativada" — ela NÃO está):** o catálogo antigo
(`Sistema → Módulos`, edita `SystemModule.defaultEnabled`) está VIVO em 3 lugares:
1. Gatilho `trg_company_insert_modules` (`modules.service.ensureDatabaseAutomation`) — empresa
   nova nasce com `CompanyModule` por módulo = `defaultEnabled`.
2. Gatilho `trg_system_module_insert_companies` — módulo novo retroalimenta todas as empresas.
3. `syncCompanyModulesForAllCompanies` — roda no boot **e** a cada load do `/master`
   (`getMasterWorkspace`/`listMasterOverview`): `INSERT … SELECT defaultEnabled … ON CONFLICT
   DO NOTHING` pra toda empresa × módulo.
- **Efeito colateral (o bug):** como o sync cria post-it (`CompanyModule`) pra TODO mundo, o
  `override` em `canUserAccessModule:2171` e `listMyModules:2321` é **sempre não-nulo** → a régua
  do plano (`getPlanModuleDefaults` = Self-Checkout) **fica sombreada**. O Self-Checkout só "pega"
  quando a empresa NÃO tem post-it — e hoje sempre tem.
- `financeiro` já é **role-gated** (admin-only, `canUserAccessModule:2118-2124`), curto-circuita
  antes do plano. `gerencial` é "muro Dono/Gerente" (`SELLER_CARGO_WALL_MODULES`,
  `EMPLOYEE_BLOCKED_MODULE_KEYS`) MAS ainda depende do catálogo/plano marcar ON.

**Decisões (dono 21/06):**
- **UI:** Self-Checkout continua janela própria; apaga só a aba **Módulos** legada do `Sistema`.
- **Gerencial:** vira capacidade de **admin sempre-ligada** (mesmo molde do `financeiro`); sai de
  `COMMERCIAL_PLAN_MODULE_KEYS` e deixa de ser módulo vendável.
- **Profundidade:** ir à raiz — aposentar sync + 2 gatilhos pro Self-Checkout virar fonte única,
  **sem mass-delete de linhas existentes** (não afeta a árvore das empresas atuais).

**Bloco A — Front (seguro, reversível):**
- `frontend/.../master/janela-sistema.tsx`: remover a subaba "Módulos" (`SUBTABS[0]` + bloco
  `sub === 0`, o catálogo `/modules/master/system-modules`); renumerar as subabas restantes
  (Credenciais/Exclusões/Reclamações) e o default do `useTabIndex("sistema")`.

**Bloco B — Gerencial → admin (espelha `financeiro`):**
- `backend/.../modules.service.ts` `canUserAccessModule`: adicionar branch `gerencial` junto do
  `financeiro` (early return `canUseAdminOnlyModule`, independente de plano/catálogo); incluir no
  ramo de empresa inativa só se for a regra desejada (default: gerencial NÃO escapa suspensão —
  só `financeiro` é rota-de-pagamento).
- `backend/.../commercial-plan-catalog.ts` `COMMERCIAL_PLAN_MODULE_KEYS`: remover `'gerencial'`
  de PADRAO/PRO/MELHOR.
- `listMyModules`: gerencial passa a resolver por role (visível p/ admin/master, fora do molho de
  vendedor — já é muro). Manter `companyAssignable:true` no catálogo (igual `financeiro`).
- Frontend `shell.tsx` (`isModuleVisible`): garantir que o item Gerencial aparece p/ admin via
  `/modules/me` (sem depender do plano).

**Bloco C — Aposentar o catálogo como fonte (raiz):**
- `ensureDatabaseAutomation`: **DROP** dos 2 gatilhos (`trg_company_insert_modules`,
  `trg_system_module_insert_companies`) em vez de recriar; manter a limpeza `platform_infra`.
- `syncCompanyModulesForAllCompanies`: remover o `INSERT … SELECT defaultEnabled` (semeadura do
  catálogo); manter só o `DELETE … platform_infra`.
- Empresa nova segue o **plano** (provisioning já cria `CompanyModule` de `plan.modules`).
- **Não mexer nas linhas das empresas existentes** (congela o estado atual = não afeta a árvore).

**Risco/rollback:** tudo em localhost, `git revert` por bloco. Risco real = acesso a módulo (B/C).
Confirmar em runtime (não só build): admin vê Gerencial em qualquer plano; vendedor não; empresa
nova segue plano; empresa existente inalterada. **Caveat documentado:** empresas ANTIGAS mantêm os
post-it eco-do-catálogo (não realinham ao plano sozinhas — realinhar exigiria delete deliberado,
fora de escopo por "não afetar a árvore").

**Checks:** `cd backend && npm run prisma:validate && npm run build` + testes de
`modules`/`master-provisioning`/`team-policy`; `cd frontend && npm run lint && npm run build`.
**Sem push/deploy.**
