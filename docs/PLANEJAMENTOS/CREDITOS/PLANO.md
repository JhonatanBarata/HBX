# CRÉDITOS — carteira única substitui paywall por plano/tier

> Ordem do dono 04/07. Objetivo: trocar o modelo "plano/tier limita módulo" por um modelo de
> **crédito (carteira recarregável)**. Master libera **módulos** (só como kill-switch de teste,
> não como paywall). Master libera **créditos** ao admin. Admin controla, dos abaixo dele
> (gerente/vendedor), **o que** e **quanto** cada um faz com o crédito. Admin do HBX = admin normal;
> regalias saem de crédito, não de tier. **Modules NÃO limitam; créditos limitam.**
>
> Simplifica MUITO o produto — mas é frente financeira (dinheiro/imposto). Opus edita direto o que
> for cobrança/saldo/checkout + revisão obrigatória do diff. Workers implementam o resto LOCAL, não
> publicam; o dono revisa e publica. **Nunca sobrescrever trabalho paralelo do dono / do VENDAS-REFAB.**

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

## Decisões que TRAVAM o plano — Sprint 0 (o dono responde, sem código)
Nenhum sprint de schema começa antes disso. Cada uma muda a modelagem:

- **D1 — Unidade do crédito.** Crédito é **ponderado por ação** (tabela de peso: pull-lista=1,
  enriquecimento-web=N, envio-WA=M, NFS-e=…) ou **1 crédito = 1 baixa de lead** e as ações caras
  ficam FORA do crédito (nos governadores físicos que já existem)? — **Recomendação: crédito só
  cobre o que é barato/previsível (pull da lista 28M); Brave/chip/Serpro seguem no
  `SourceBudgetService`/disjuntor, fail-closed, crédito não fura eles.** Simplifica e protege margem.
- **D2 — Unificar com a "baixa" do VENDAS-REFAB.** Crédito **É** a mesma unidade que a "baixa da cota
  da empresa" que o VENDAS-REFAB está construindo agora? — **Recomendação: SIM, unificar.** Este plano
  vira "tornar a cota da árvore uma carteira persistente + recarregável". Duas moedas = double-accounting.
- **D3 — Reconhecimento de receita.** Recarga vira receita **na compra** ou **no consumo** (diferida)?
  — **Recomendação: diferida (reconhece no consumo).** Fecha certo com o contador-robô/DAS. Precisa de
  conta de passivo (crédito comprado não-consumido).
- **D4 — Pool único vs sub-orçamento por vendedor.** Todos da empresa puxam de um saldo só, ou o admin
  aloca saldo por vendedor? — **Recomendação: saldo da empresa é a fonte; teto por vendedor é OPCIONAL
  (default sem teto)** — idêntico à árvore, sem inventar tabela nova.
- **D5 — Assento por usuário sobrevive?** Adicionar vendedor ainda cobra assento (`extraUserMonthly`)
  ou headcount fica grátis e só consumo custa? — decisão de receita; muda `buildSeatBillingSnapshot`.
- **D6 — Expiração.** Crédito recarregado expira (ex.: 12 meses) ou nunca? — nunca-expira = passivo
  perpétuo no balanço. **Recomendação: expira, configurável pelo master.**
- **D7 — Overdraft.** Pedido de 50 com 30 de saldo: nega tudo, ou serve 30 e para? — **Recomendação:
  nunca negativa (fail-closed); serve o que couber e para com aviso, igual disjuntor.**

---

## FASE 1 — IMPLANTAÇÃO (construir a carteira ao lado do sistema atual, atrás de flag)
Regra de ouro da fase 1: **nada quebra em prod**. A carteira nasce em SHADOW (mede o que *seria*
debitado sem bloquear), prova em prod, e só então vira gate. Flags default OFF.

- **S1 — Ledger de crédito (schema + saldo atômico).**
  `CreditWallet` (por empresa) + `CreditLedgerEntry` (`grant` | `recharge` | `debit` | `refund` |
  `expire` | `adjust`, com `grantType: paid | courtesy_internal | promo`, `weight`, `actionKey`,
  `usageKey` idempotente, `createdByUserId`). Saldo = fonte ÚNICA derivada do ledger; **decremento
  atômico condicional** (`WHERE saldo>=n`) em transação — **reusar o padrão do HBX-RECOVERY
  (`hbx-recovery.service.ts`, saldo atômico já em prod)**. Nada de contar log como faz o
  `CommercialUsageLimitsService`. Flag `HBX_CREDITS_ENABLED` OFF. Migration + testes de concorrência.

- **S2 — Tabela de peso por ação + pontos de débito (SHADOW).**
  `CREDIT_ACTION_WEIGHTS` (fonte única, tipo `commercial-plan-catalog`). Débito no **único choke por
  ação**: pull/import de card (`LeadContactWriteService` / `recordCardImport`), enriquecimento
  (`recordLeadEnrichmentUseOnce`), envio WA (`wa-send-throttle.service`) — conforme D1. Débito
  **on-success**, **refund atômico on-failure/PARAR** (reusa evento `vendas_card_refunded`), nunca
  negativa (D7). Modo SHADOW: registra `debit_shadow` sem bloquear, pra comparar com a cota atual
  antes de valer. Flag separada `HBX_CREDITS_ENFORCE` OFF.

- **S3 — Master emite crédito + Recarga (checkout MP).**
  Master concede crédito ao admin (`grant`, com `grantType`). Recarga via MP: **webhook credita
  atômico, fail-closed 2-fases — reusar `hbx-recovery` S1 (webhook fail-closed já em prod)**. Recarga
  gera `recharge` no ledger + passivo (D3), não receita imediata. Nunca copiar credencial MP local→VPS
  (INFRA). Idempotência por `usageKey`/id do webhook.

- **S4 — Admin distribui crédito p/ os abaixo (RBAC continua separado).**
  Sub-orçamento/teto de crédito por vendedor/gerente (D4), UI no painel do admin. Reaproveita a árvore
  do VENDAS-REFAB (admin aloca baixas por vendedor, default sem teto). **RBAC (o que cada um faz) segue
  em `UserTeamPolicy`** — crédito só decide o "quanto". **Vendedor NUNCA vê saldo/valor** (LEI DO
  VENDEDOR, `PAGAMENTOS.md`): bloqueio dele é neutro (`company_access_paused`/`module_not_enabled`).

- **S5 — Integração fiscal (contador-robô).**
  Recarga = passivo; receita reconhecida **no consumo** (débito de `grantType:paid`). Concessão
  `courtesy_internal`/`promo` **nunca** conta como receita. `revenue-sync.service`/`MasterBillingLedger`
  passam a ler o ledger de crédito. Reconciliação: passivo + consumido = recarregado. Frente
  financeira → Opus edita direto + revisão do diff. (D9 do chat: tenant HBX interno = admin normal com
  `courtesy_internal`, sem special-case por slug.)

- **S6 — Painéis.**
  Admin: carteira (saldo, recarga, consumo por ação/por vendedor). Master: cockpit de emissão de
  crédito + saúde (reusa MasterEvent/cockpit já existente). Números reais (nada de contagem falsa,
  ver lixo catalogado do VENDAS-REFAB).

- **S7 — Migração dos clientes VIVOS (shadow → cutover por empresa).**
  Mapear cada `selectedPlanKey`/assinatura viva → concessão de crédito recorrente equivalente
  (List/Lead/Pro/Company). Rodar em shadow, comparar consumo real × cota antiga por N dias, cutover
  **por empresa** (flag por-tenant), nunca big-bang. Só depois de S1–S6 provados em prod com cliente real.

---

## FASE 2 — REMOÇÃO (desligar o paywall por plano; módulo vira só kill-switch)
Só começa com a Fase 1 provada em prod e a migração (S7) concluída por empresa. Passos R1–R2 são
reversíveis pela flag; R3–R4 são via-única → por último.

- **R1 — Ligar o gate de crédito (enforce ON).**
  `HBX_CREDITS_ENFORCE` ON por empresa migrada. Crédito passa a ser o teto real; a cota
  count-based do `CommercialUsageLimitsService` vira só leitura/telemetria (deixa de bloquear).

- **R2 — Desacoplar módulo de plano.**
  `resolveCompanyModuleAccessPolicy` para de derivar `moduleKeys` de `COMMERCIAL_PLAN_MODULE_KEYS`.
  Módulo passa a ser: **disponível por default**, escondível só pelo kill-switch do master
  (`SystemModule.defaultEnabled` / toggle). Acesso comercial continua respeitando `Company.status`
  (suspenso/atraso) — isso NÃO é paywall de tier, é inadimplência.

- **R3 — Aposentar o tier como driver de acesso.**
  `selectedPlanKey` deixa de decidir módulo/capacidade (`getCommercialPlanCapabilities`,
  `COMMERCIAL_PLAN_QUOTAS`). Mantém, se útil, só como rótulo histórico/faixa de recarga. Capacidades
  booleanas (ver Gerencial, usar Bot, auto-enriquecer) migram pra **RBAC** (camada 2), não pra crédito.

- **R4 — Faxina.**
  Remover código morto: limites count-based do `CommercialUsageLimitsService`, fluxo de
  upgrade/downgrade "cobra a diferença", seat-por-plano se D5 mandar. Atualizar
  `docs/Rules/PAGAMENTOS.md` (novo cânone: 3 camadas + carteira). Migration destrutiva só depois de
  1 ciclo de billing limpo no modelo novo.

---

## Riscos / guardrails duros (não violar)
- **Colisão com VENDAS-REFAB (rodando AGORA nos mesmos arquivos** — `vendas.service`,
  `commercial-usage-limits`, árvore de cota**).** Coordenar: este plano é a evolução da cota da árvore
  (D2), não um sistema paralelo. Conferir `origin/master` antes de cada sprint (worktree pode estar atrás).
- **Dinheiro é atômico e fail-closed.** Sem débito não-atômico, sem saldo negativo, sem crédito que
  fure `SourceBudgetService`/disjuntor de zap (Brave/chip = COGS real e irreversível).
- **LEI DO VENDEDOR.** Vendedor nunca vê saldo/valor/motivo financeiro. Bloqueio neutro.
- **Fiscal.** Recarga ≠ receita na compra. Uso interno HBX ≠ receita. Sem isso o DAS mente.
- **Migrations.** Postgres já esteve down com migrations não aplicadas — aplicar e conferir na VPS.
  MP é LIVE na VPS; nunca copiar credencial local→VPS; mudar env_file = RECREATE container.
- **Reversibilidade.** Tudo atrás de flag até R2. R3/R4 são via-única → só com o modelo novo provado.

## Checks por sprint
Backend: `cd backend && npm run build` + suíte tocada verde (inclui testes de concorrência do ledger).
Front: `check-pele.mjs`. Fiscal/checkout: teste obrigatório (red flag `PAGAMENTOS.md`). NÃO publicar;
cada worker grava `S{n}-RESULTADO.md` nesta pasta. Frente financeira: Opus edita direto + revisão do diff.
