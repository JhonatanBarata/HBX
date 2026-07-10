# CRÉDITOS — carteira única substitui paywall por plano/tier

> **STATUS 05/07 (noite): CÓDIGO COMPLETO até R2, tudo LOCAL no master, flags OFF, nada publicado.**
> Feitos: S1 (fusão, Fix A+B) · S2 shadow · S3 completo (catálogo+concessão+recarga MP com fiscal
> S5 no mesmo choke) · S4 teto por vendedor · S6 painéis · S8 hierarquia · A3 lote grátis ·
> R1-código (gate 2 chaves) · R2 kill-switch (flag OFF) · L6 varredura · migrations reconciliadas.
> RESULTADOs nesta pasta. **Nas mãos do dono:** publicar · validar recarga LIVE (cartão real) ·
> ligar `HBX_CREDITS_ENABLED` → depois `HBX_CREDITS_SHADOW` (medir) → depois `HBX_CREDITS_ENFORCE`
> + flag por-empresa (cutover S7, com decisão de preço dos pacotes-migração) → `HBX_MODULES_
> KILLSWITCH_ONLY`. **R3/R4/R5 (via-única) só após 1 ciclo de billing limpo — guardrail mantido.**

> Ordem do dono 04/07. Objetivo: trocar o modelo "plano/tier limita módulo" por um modelo de
> **crédito (carteira recarregável)**. Master libera **módulos** (só como kill-switch de teste,
> não como paywall). Master libera **créditos** ao admin. Admin controla, dos abaixo dele
> (gerente/vendedor), **o que** e **quanto** cada um faz com o crédito. Admin do HBX = admin normal;
> regalias saem de crédito, não de tier. **Modules NÃO limitam; créditos limitam.**
>
> Simplifica MUITO o produto — mas é frente financeira (dinheiro/imposto). Opus edita direto o que
> for cobrança/saldo/checkout + revisão obrigatória do diff. Workers implementam o resto LOCAL, não
> publicam; o dono revisa e publica. **Nunca sobrescrever trabalho paralelo do dono / do VENDAS-REFAB.**
>
> **⚠️ ATUALIZADO 04/07 — Sprint 0 FECHADO pelo dono (respostas abaixo).** O modelo escolhido é
> **pré-pago puro self-service**: 1 crédito = 1 lead; recarga via MercadoPago já na Fase 1; receita
> reconhecida **na compra** (regime de caixa, casa com o DAS/Simples); **assento grátis** (só crédito
> custa); crédito **expira** (prazo configurável pelo master). Isto derruba mais legado do que o
> rascunho anterior supunha — ver mudanças marcadas `[FECHADO 04/07]`.

---

## Invariante-mãe: 3 CAMADAS separadas (não fundir numa só)
O erro fatal do "tudo é crédito" é misturar capacidade com quantidade. São camadas distintas:

1. **MÓDULO = disponibilidade (kill-switch do MASTER).** Existe só pra o master esconder/remover o
   que está em teste. **Deixa de ser paywall.** Não deriva mais de plano/tier. Default: tudo ligado.
2. **RBAC/PERMISSÃO = o que cada cargo PODE fazer (do ADMIN pra baixo).** Já existe hoje em
   `UserTeamPolicy.modulesJson` / `team-access-catalog.ts`. É AQUI que o admin "controla os abaixo"
   (quais ações o vendedor/gerente executa). Crédito **não** substitui isso.
3. **CRÉDITO = quanto pode consumir (carteira).** Saldo persistente, recarregável, debitado por ação.
   O admin dá sub-orçamento/limite de crédito a cada cargo abaixo.

> Precedência de bloqueio (LEI, ordem fixa): **(1) estado comercial da empresa** (`Company.status`
> via `resolveCompanyAccessState` — suspenso/atraso trava tudo) → **(2) kill-switch de módulo do
> master** → **(3) RBAC do cargo** → **(4) saldo de crédito**. Qualquer camada anterior nega antes
> da seguinte ser consultada. Sem essa ordem escrita, o produto entra em estado contraditório.

---

## Sprint 0 — DECISÕES (FECHADAS 04/07 pelo dono)
Estavam travando o schema. Agora resolvidas; cada uma vira consequência de código:

- **D1 — Unidade do crédito → `[FECHADO]` 1 crédito = 1 lead (baixa).** Débito SÓ na entrega/baixa do
  lead. Ações caras e irreversíveis (Brave/scraping pago, chip WhatsApp, Serpro/NFS-e) **ficam FORA
  do crédito**, nos governadores físicos que já existem (`SourceBudgetService`, disjuntor de zap,
  gate Serpro) — fail-closed, crédito não fura eles. Enriquecimento/IA/templates/e-mail viram
  **capacidade grátis** (RBAC decide se pode, não crédito). Só o lead é metrado.

  > **ADENDO 10/07 (dono) — D1 parcialmente REVOGADO: crédito vira moeda UNIVERSAL, track-first.**
  > "Só o lead é metrado" caiu. Agora TODO uso de módulo é MEDIDO por ação
  > (`backend/src/credits/credit-action-catalog.ts` + `CreditMeterService`): `lead_delivery`
  > segue **debit** (único que cobra — caminho assert intocado); `ai_realtime`/`ai_batch`,
  > `whatsapp_auto_send` e `logistica_delivery` nascem **track** (linha `debit_shadow` no ledger,
  > saldo intocado). Virar `debit` é decisão explícita do dono com ~30d de número real na mão —
  > nunca flip silencioso. **Exceções decididas pelo dono:** WhatsApp automação **NUNCA debita**
  > ("ninguém cobra a não ser que for Meta" — Evolution/Baileys não tem custo por mensagem);
  > mensagem HUMANA nem é medida (allowlist por `sourceModule` no dispatch). IA local = track
  > (custo ~R$0); IA PAGA futura entra como ação nova já debit no dia 1. Os governadores físicos
  > do D1 original continuam valendo (crédito não fura orçamento de fonte paga/disjuntor).
  > **Pendências registradas:** overlay do catálogo de ações editável no /master (hoje só código);
  > IA batch do Radar (extração/saneamento/xray) roda sem empresa dona → sem medição por tenant
  > (fábrica global — medir por empresa exigiria propagar companyId pelo lote).
- **D2 — Unificar com a "baixa" do VENDAS-REFAB → `[FECHADO]` SIM, unificar.** Este plano é "tornar a
  cota da árvore uma carteira persistente + recarregável". Uma moeda só. `1 lead puxado = 1 baixa da
  empresa = 1 crédito debitado`. Nada de double-accounting.
- **D3 — Reconhecimento de receita → `[FECHADO]` NA COMPRA (à vista).** Recarga vira receita no dia do
  pagamento confirmado. **Casa com o regime de caixa do Simples/DAS** (receita = quando o dinheiro
  entra) — mais simples que diferir. **Sem conta de passivo, sem contabilidade de crédito não-usado.**
  Estorno/chargeback abate receita **no mês corrente** (reusa o "líquido de estorno" que o
  contador-robô já faz). Expiração de crédito **não** mexe em receita (dinheiro já entrou = breakage).
- **D4 — Pool vs sub-orçamento → `[FECHADO]` saldo da empresa é a fonte; teto por vendedor OPCIONAL
  (default sem teto).** Idêntico à árvore do VENDAS-REFAB; teto por-cargo mora no `UserTeamPolicy`
  (`vendasPullQuantityLimit`/`cardDeliveryDailyLimit` viram sub-orçamento de crédito). Sem tabela nova.
- **D5 — Assento por usuário → `[FECHADO]` GRÁTIS. Só crédito custa.** Adicionar vendedor **não cobra
  mais** `extraUserMonthly`. Aposenta `seat-billing.util.ts`/`CompanyBillableSeatUsage` como cobrança
  (ver R4). Headcount livre; a conta ociosa gigante não gera receita nem custo — o custo é o lead.
- **D6 — Expiração → `[FECHADO]` EXPIRA, prazo configurável pelo master.** Ledger em **lotes com
  `expiresAt`**, consumo **FIFO (expira-primeiro sai primeiro)**, job diário de expiração. Saldo =
  Σ(lotes não-expirados).restante. Default do prazo (ex.: 12 meses) editável em Política comercial.
- **D7 — Overdraft → `[FECHADO]` nunca negativa (fail-closed).** Pedido de 50 com 30 de saldo: serve
  30 e para com aviso (igual disjuntor). Débito atômico condicional; nunca deixa saldo < 0.

> **Modelo resultante:** pré-pago puro self-service. O tier (List/Lead/Pro) **morre como driver de
> cobrança e de acesso**. "Empresas" (Implantação/Company) mantém tudo que já existe — crédito
> liberado manual conforme o combinado (concessão do master), fora do self-checkout.

---

## FASE 1 — IMPLANTAÇÃO (construir a carteira ao lado do sistema atual, atrás de flag)
Regra de ouro: **nada quebra em prod**. Sequência segura: crédito ENTRA (recarga/concessão) pode ir
ao vivo cedo — só ADICIONA saldo, não bloqueia nada. O DÉBITO nasce em SHADOW (mede o que *seria*
debitado sem bloquear), prova em prod contra a cota atual, e só então vira gate. Flags default OFF.

- **S1 — Ledger de crédito em LOTES (schema + saldo atômico + expiração).** `[FECHADO 04/07: lotes]`
  `CreditWallet` (por empresa, 1:1) + `CreditLedgerEntry`. Cada entrada de entrada de saldo é um
  **lote**: `kind` (`grant` | `recharge` | `promo`), `amount`, `remaining`, `expiresAt`,
  `grantType` (`paid` | `courtesy_internal` | `promo`), `createdByUserId`, `sourceRef` (id do
  pagamento MP / ação master). Débitos/estornos: `debit` | `refund` | `expire` | `adjust` com
  `usageKey` idempotente e `actionKey`. **Saldo = Σ(lotes com `remaining>0` e não expirados)** —
  fonte ÚNICA derivada do ledger. Débito: transação que trava a wallet (padrão atômico do
  **HBX-RECOVERY já em prod**, `hbx-recovery.service.ts`), consome dos lotes que **expiram primeiro**,
  `WHERE remaining>=n` condicional, nunca negativa (D7). Job diário `expireCreditLots` escreve
  `expire` nos lotes vencidos. **Nada de contar log** como o `CommercialUsageLimitsService` faz.
  Flag `HBX_CREDITS_ENABLED` OFF. Migration + testes de concorrência + teste de FIFO/expiração.

- **S2 — Débito por lead (SHADOW).** `[FECHADO 04/07: só o lead]`
  Débito no **único choke da baixa de lead**: onde o card é entregue/puxado ao vendedor
  (`LeadContactWriteService` / `recordCardImport` / distribuição do Radar — o MESMO ponto do
  VENDAS-REFAB, D2). Peso fixo **1 crédito por lead** (sem tabela de peso — D1 tirou as ações caras).
  Débito **on-success**; **refund atômico on-failure/PARAR** (reusa evento `vendas_card_refunded`),
  nunca negativa. Modo SHADOW: registra `debit_shadow` sem bloquear, pra comparar com a cota atual
  por N dias antes de valer. Flag separada `HBX_CREDITS_ENFORCE` OFF.

- **S3 — Entrada de crédito: concessão do master + Recarga self-service (MercadoPago).** `[FECHADO
  04/07: MP no F1]`
  (a) **Master concede** crédito ao admin (`grant`, com `grantType` e `expiresAt`) — painel master.
  (b) **Recarga self-service via MercadoPago**: catálogo de pacotes de crédito (fonte única em código,
  tipo `commercial-plan-catalog`); checkout MP; **webhook fail-closed 2-fases** creditando lote
  atômico (reusa `hbx-recovery` S1, já em prod). Idempotência por id do pagamento/webhook. **Crédito
  só entra com pagamento CONFIRMADO** (nunca no `pending`). Nunca copiar credencial MP local→VPS
  (INFRA); mudar env_file = RECREATE. Como entrada só ADICIONA saldo, S3 pode ir a prod antes do
  débito virar gate — seguro.

- **S4 — Admin distribui crédito p/ os abaixo (RBAC continua separado).** `[FECHADO 04/07: assento
  grátis]`
  Sub-orçamento/teto de crédito por vendedor/gerente (D4), UI no painel do admin — reaproveita os
  campos que **já existem** no `UserTeamPolicy` (`vendasPullQuantityLimit`, `cardDeliveryDailyLimit`,
  `monthlyCardsLimit`) como teto de crédito; default **sem teto**. **RBAC (o que cada um faz) segue em
  `UserTeamPolicy.modulesJson`** — crédito só decide o "quanto". Convite de vendedor **deixa de exibir
  aviso de custo de assento** (assento grátis). **Vendedor NUNCA vê saldo/valor** (LEI DO VENDEDOR,
  `PAGAMENTOS.md`): bloqueio dele é neutro (`company_access_paused`/`module_not_enabled`).

- **S5 — Integração fiscal (contador-robô) — receita NA COMPRA.** `[FECHADO 04/07: à vista, sem
  passivo]`
  Recarga/`grantType:paid` com pagamento confirmado → **receita reconhecida IMEDIATA** no
  `MasterBillingLedgerEntry` (regime de caixa, casa com DAS/Livro Caixa). Concessão
  `courtesy_internal`/`promo` **nunca** conta como receita (tenant HBX interno = admin normal com
  `courtesy_internal`, sem special-case por slug). Estorno/chargeback → abate receita **no mês
  corrente** (reusa "líquido de estorno" existente). Expiração de lote → **zero efeito fiscal**
  (breakage). **Sem conta de passivo, sem receita diferida** — bem mais leve que o rascunho anterior.
  Frente financeira → Opus edita direto + revisão do diff.

- **S6 — Painéis.**
  Admin: carteira (saldo, validade dos lotes, botão Recarregar, consumo por vendedor). Master: cockpit
  de emissão/concessão de crédito + saúde (reusa MasterEvent/cockpit já existente). Números REAIS
  (nada de contagem falsa — ver lixo catalogado do VENDAS-REFAB). Vendedor: vê só "leads disponíveis"
  (nunca R$/saldo).

- **S7 — Migração dos clientes VIVOS (shadow → cutover por empresa).**
  Cada assinatura/`selectedPlanKey` viva → **auto-recarga recorrente equivalente** (List/Lead/Pro
  viram um pacote de crédito/mês; o pagamento mensal que já existe passa a creditar o lote do mês).
  "Empresas" (Company) → concessão manual do combinado. Rodar em shadow, comparar consumo real × cota
  antiga por N dias, cutover **por empresa** (flag por-tenant), nunca big-bang. Só depois de S1–S6
  provados em prod com cliente real.

---

## FASE 2 — REMOÇÃO (desligar o paywall por plano; módulo vira só kill-switch)
Só começa com a Fase 1 provada em prod e a migração (S7) concluída por empresa. R1–R2 são reversíveis
pela flag; R3–R5 são via-única → por último.

- **R1 — Ligar o gate de crédito (enforce ON).**
  `HBX_CREDITS_ENFORCE` ON por empresa migrada. Crédito passa a ser o teto real; a cota count-based do
  `CommercialUsageLimitsService` vira só leitura/telemetria (deixa de bloquear).

- **R2 — Desacoplar módulo de plano.**
  `resolveCompanyModuleAccessPolicy` para de derivar `moduleKeys` de `COMMERCIAL_PLAN_MODULE_KEYS`.
  Módulo passa a ser: **disponível por default**, escondível só pelo kill-switch do master
  (`SystemModule.defaultEnabled` / toggle `CompanyModule`). Acesso comercial continua respeitando
  `Company.status` (suspenso/atraso) — isso NÃO é paywall de tier, é inadimplência.

- **R3 — Aposentar o tier como driver de acesso/capacidade.**
  `selectedPlanKey` deixa de decidir módulo/capacidade (`getCommercialPlanCapabilities`,
  `COMMERCIAL_PLAN_QUOTAS`, `getCommercialPlanTier`). As capacidades booleanas (ver Gerencial, usar
  Bot, auto-enriquecer, inteligência do card) migram pra **RBAC** (camada 2) e nascem **ligadas por
  default** — não pra crédito. Tier fica, no máximo, como rótulo histórico/faixa de pacote de recarga.

- **R4 — Aposentar a cobrança por assento.** `[FECHADO 04/07: assento grátis]`
  Retirar `seat-billing.util.ts`/`computeImmediateExtraSeatCharge`/`CompanyBillableSeatUsage` do fluxo
  de cobrança; `extraUserMonthly` sai do catálogo/recorrente. `seatCap` (teto rígido do master) pode
  sobreviver como limite operacional, não como cobrança.

- **R5 — Faxina + cânone.**
  Remover código morto: limites count-based do `CommercialUsageLimitsService`, fluxo de
  upgrade/downgrade "cobra a diferença" (`plan-proration.util`), quotas por plano. Reescrever
  `docs/Rules/PAGAMENTOS.md` (novo cânone: 3 camadas + carteira pré-paga, receita na compra, assento
  grátis). Migration destrutiva só depois de **1 ciclo de billing limpo** no modelo novo.

---

## Correções de arquitetura — linhagem do tenant (05/07, revisão + veredito)
A linhagem do dono (master→módulos→admin→gerente→vendedor, só admin vê preço) está CERTA e é a
precedência já fechada acima. 4 correções viram cânone das próximas ondas:

- **A1 — Módulo NÃO desce a cadeia.** Módulo é assunto Master↔Empresa (kill-switch, default ON, sem
  preço). Do admin pra baixo descem DUAS coisas distintas: **acesso** (chave RBAC do `UserTeamPolicy`)
  e **teto de crédito** (opcional). Fundir isso num "pode/não pode" só foi a origem da bagunça (3
  sistemas decidindo acesso ao mesmo tempo: módulo-por-plano + RBAC + quota-por-tier).
- **A2 — "Só passa o que tem" NÃO existe no código → S8.** Hoje `team-policy.service.ts:1219` só faz
  regra bruta (gerente só concede módulos), sem conferir se o concedente TEM o que concede. O
  invariante certo é **1 ponto no `updatePolicy`: interseção** entre o mapa de acesso do concedente e
  o que ele tenta conceder (`grant ⊆ granter`). **Trava dura junto:** `canViewBilling` só editável por
  dono/master — como "gerente" É `ADMIN + canViewBilling=false` (`access/actor-kind.ts`), deixar gerente
  flipar essa flag = auto-promoção pra ver dinheiro. S8 é RBAC puro (não-financeiro) → executável por worker.
- **A3 — Plano grátis = LOTE-CORTESIA, não trial por tempo.** O "1 grátis pra conhecer" vira um lote
  `grantType:promo` na criação da conta (ex.: 20–30 créditos, validade 30d, nunca vira receita — D3).
  Mede valor por USO, não por tempo, e mata a máquina de trial inteira (`COMMERCIAL_PLAN_TRIAL_DAYS`,
  estados trial). CNPJ.biz dá ~10 créditos; dar 2–3× é argumento de venda. Entra no R3 (aposentar tier).
- **A4 — "Empresas" (Implantação) fica como está.** `contactOnly`, mensalidade "a partir de" negociada,
  sem self-checkout. Crédito entra por concessão manual do master (S3a `grant`). É a ÚNICA que mantém
  fatura recorrente → a única que ainda usa `overdue`. No self-service, `pending_checkout/overdue/grace`
  praticamente somem (sem fatura mensal não há atraso; sem saldo o cara só não puxa lead): `Company.status`
  encolhe pra `active | courtesy | suspended`.

> **$$ — 2 travas de preço (não ignorar no S7):** (1) NÃO ancorar a recarga em R$0,045/lead (Lead Plus
> R$99÷2.200). Isso fixa o lead 10× abaixo do mercado (CNPJ.biz R$0,53→0,015). Régua sugerida: R$0,15–0,40/
> crédito com curva de volume; pacote-migração dos vivos = exceção grandfathered. (2) Crédito É taxímetro —
> a bandeira "sem taxímetro" se resolve no QUE cobra: **1 crédito = 1 lead ENTREGUE e validado**
> (débito on-success + refund atômico, já no S2); a BUSCA continua grátis (lane R$0). É o discurso de venda.

## Riscos / guardrails duros (não violar)
- **Colisão com VENDAS-REFAB (rodando AGORA nos mesmos arquivos** — `vendas.service`,
  `commercial-usage-limits`, árvore de cota, `LeadContactWriteService`**).** Este plano É a evolução da
  cota da árvore (D2), não um sistema paralelo. Conferir `origin/master` antes de CADA sprint (worktree
  pode estar atrás — aprendizado 03/07).
- **Dinheiro é atômico e fail-closed.** Sem débito não-atômico, sem saldo negativo, sem crédito que
  fure `SourceBudgetService`/disjuntor de zap (Brave/chip/Serpro = COGS real e irreversível, ficam
  FORA do crédito por D1).
- **Receita na compra ≠ vale-tudo.** Só pagamento CONFIRMADO reconhece receita; `courtesy_internal`/
  `promo` nunca; estorno abate no mês corrente. Sem isso o DAS mente.
- **LEI DO VENDEDOR.** Vendedor nunca vê saldo/valor/motivo financeiro. Bloqueio neutro.
- **Migrations.** Postgres já esteve down com migrations não aplicadas — aplicar e conferir na VPS.
  MP é LIVE na VPS; nunca copiar credencial local→VPS; mudar env_file = RECREATE container.
- **Reversibilidade.** Tudo atrás de flag até R2. R3/R4/R5 são via-única → só com o modelo novo provado
  em 1 ciclo de billing.

## Checks por sprint
Backend: `cd backend && npm run build` + `npm run prisma:validate` + suíte tocada verde (inclui testes
de concorrência/FIFO/expiração do ledger). Front: `check-pele.mjs`. Fiscal/checkout: teste obrigatório
(red flag `PAGAMENTOS.md`). **NÃO publicar**; cada worker grava `S{n}-RESULTADO.md` nesta pasta. Frente
financeira (S1/S3/S5 + R4): Opus edita direto + revisão do diff.
