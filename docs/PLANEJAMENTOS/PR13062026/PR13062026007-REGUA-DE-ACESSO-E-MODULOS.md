# PR13062026007 — Régua única de acesso + módulos (Radar/Leads/Vendas) + bot

## 🟢 ESTADO ATUAL — HANDOFF (13/06, leia isto primeiro)

**Tudo abaixo está NO AR e validado** (build backend + testes + lint check-pele 576/576 +
build front + `docker restart backend`, healthy). Único container a reiniciar p/ backend:
`docker restart backend` (colunas/tabela nascem no boot via runtime-ensure).

**Modelo final (post-it):** módulo da empresa = `exceção da empresa (CompanyModule, se houver
linha) ?? caixa do plano (viva)`. Plano = base editável; empresa segue o plano ao vivo; HBX
(linhas antigas) intocada.

**O que está pronto:**
- **Gate por cargo + post-it:** `canUserAccessModule`/`listMyModules` (`backend/src/modules/modules.service.ts`)
  via `getPlanModuleDefaults`/`getCompanyModuleOverride`/`resolveCargoModuleAllowed`.
- **Planos editáveis:** `PlanModuleConfig` (tabela) + `GET/PUT /modules/master/plan/:planKey/modules`;
  UI = aba **Planos** em /master→Sistema (`frontend/src/components/hbx/planos-editor.tsx`).
- **Gerente** = ADMIN com `User.canViewBilling=false`; muro do $ em `canManageBilling`
  (financeiro.service.ts) + `billingAudience` (profile.controller.ts). Criar no
  `novo-acesso-modal.tsx` (campo Cargo); `/configuracoes` esconde cobrança por `canSeeBilling`.
- **List/Lead = painel mínimo** (`janela-empresas.tsx`, `const isFull`): esconde cortesia,
  módulos, aba Financeiro, e na Comercial: trial/suspensão/limites/condições/credenciais.
  Sobra Plano + Excluir (manual, só o dono). Auto-suspende ao não pagar (já existia).
- **Full = Central de Implantação:** aba Comercial tem bloco **Implantação** (`Company.setupValue`
  + `Company.monthlyValueOverride`, via finance-settings — REGISTRO, não fia em $).
- **Bot fail-closed (5º muro):** `VendasAutomationCampaign.triagemConfirmedAt`; `findNextDueJob`
  exige `triagemConfirmedAt != null` → "Prospecção automática" NÃO dispara sem triagem; ligar
  exige config + só ADMIN/master (`vendas-automation.service.ts`).

**O que FALTA (tudo opcional/consciente — núcleo e segurança de segunda OK):**
1. **Dinheiro:** fiar setup/parcela/desconto na cobrança REAL + comissão (passo deliberado).
2. **Triagem do bot:** tela de checklist + status "aguardando triagem" no front (trava já protege).
3. Assentos/quota **editáveis** por plano (hoje read-only do catálogo); reorg do Full numa aba própria.
4. **C2 (entitlement)** ainda usa o catálogo hardcoded; **cadência/aquecimento** (PR13062026001) não construída.
5. **Dívida limpeza:** consts `canUseAdminOnlyModule`/`defaultUserModuleAllowed`/`SELLER_*` +
   view master de políticas por-usuário (modules.service ~2407) ainda vivos (cosmético, não-gate).

**Outras frentes do dia (docs próprios):** distribuição modelo B / Radar-banco / Leads-Vendas
(memória `arquitetura-radar-leads-vendas` + `regua-unica-acesso-junho-2026`); 003 front-telas;
004 alcance-radar (PULADO, decisão pendente + Radar virou read-only); 005 comissão (F3 pendente).

---

> ## DESIGN FINAL (13/06, supersede o que vier abaixo) — "post-it sobre plano vivo"
> **Motor = UMA regra:** módulo da empresa = `post-it da empresa (se houver) ?? plano (ao vivo)`.
> - **Plano = base VIVA**, editável em **/master → Sistema → Planos** (List/Lead/Full): módulos
>   padrões + **assentos inclusos (antes do extra R$24,90)** + **quota de deep search/enriquecimento**
>   + parcela + trial. Editou o plano → **todos do plano recebem ao vivo**.
> - **Post-it = exceção por empresa** (só Full): grava SÓ o módulo mudado; resto segue o plano.
>   A diferença List/Lead×Full é só a **TELA mostrar/esconder o botão** — sem galho no motor.
> - **Full nasce com o padrão Full** (não vazio) e o master apara por empresa.
> **List/Lead = automático, painel mínimo** (sem humano): trial auto, **auto-suspende ao não
>   pagar / reativa ao pagar (JÁ EXISTE no motor de status)**, sem cortesia, sem módulos, sem
>   limites, sem condições, sem registrar-pagamento manual. **Excluir = MANUAL, só o dono**
>   (NÃO há cron de auto-delete — decisão 13/06). Auditoria fica.
> **Full = "Central de Implantação"** (aba ao lado da Auditoria, dentro da empresa): consolida
>   o que hoje está espalhado — implantação (setup), parcela, acessos (post-it), assentos
>   liberados, condições, **desconto (raro; avisa impacto na comissão — fora por enquanto)**,
>   credenciais.
> **Decisões travadas:** (1) delete só manual; (2) desconto fora no começo (uso raro).
> **Storage novo:** defaults por plano saem do hardcode → DB (tabela `PlanModule` ou JSON por
>   plano), semeado de `COMMERCIAL_PLAN_MODULE_KEYS`. **Passos:** PF1 painel List/Lead mínimo
>   (front, mata o perigo) · PB1 `PlanModule` em DB + seed · PB2 gate post-it (`override ?? plano`)
>   · PF2 Sistema→Planos UI · PF3 Full "Central de Implantação".
>
> ### STATUS APLICADO 13/06 (no ar)
> - **PB1 ✅** `PlanModuleConfig` (1 linha/plano, modulesJson) via runtime-ensure; default cai
>   no `COMMERCIAL_PLAN_MODULE_KEYS` quando vazio. `getPlanModuleDefaults`.
> - **PB2 ✅** gate post-it: `canUserAccessModule`+`listMyModules` = `override(CompanyModule) ??
>   plano(vivo)`. Semeadura: empresa nasce SEM cópia (`seedDefaultCompanyModulesTx` no-op);
>   trocar plano LIMPA post-its (`syncCompanyModulesForPlanTx` = deleteMany). HBX (tem linhas
>   antigas) segue INTOCADA (override = estado atual). Build + 29 testes + restart OK.
> - **Endpoints ✅** `GET/PUT /modules/master/plan/:planKey/modules`.
> - **PF1 ✅ COMPLETO** List/Lead esconde Cortesia, Módulos, aba Financeiro, e dentro da aba
>   Comercial: Trial/Suspensão/Limites/Condições/Credenciais. Mantém **Plano** (atribuir/subir)
>   + **Excluir** (manual). Full mantém tudo. lint 576/576+build.
> - **PF2 ✅** aba **Planos** no /master→Sistema (`planos-editor.tsx`, zero inline) com
>   `planInfo`: parcela + assentos inclusos + extra R$24,90 + deep search/dia + enriquec./dia +
>   cards/mês + trial. Toggle ON/OFF dos módulos padrões. lint 576/576+build.
> - **PF3 ✅** Full "Central de Implantação": aba Comercial ganhou bloco **Implantação**
>   (valor de implantação/setup + parcela acordada) — `Company.setupValue` +
>   `Company.monthlyValueOverride` (runtime-ensure), via `finance-settings` (registro do
>   master, NÃO fia em cobrança/comissão sozinho). Build + 29 testes + restart + front lint/build.
> - **BOT FAIL-CLOSED (5º muro) ✅** `VendasAutomationCampaign.triagemConfirmedAt` (runtime-ensure);
>   `findNextDueJob`/`findNextDueJobForCampaign` exigem `triagemConfirmedAt != null` → campanha
>   sem triagem NUNCA dispara (a "Prospecção automática" 15/06 08:00 está travada). Arm
>   (`setCampaignStatusForUser` running) exige mensagem/opt-out/limite/horário + só ADMIN/master
>   (vendedor não liga) + carimba triagem. Build + 36 testes automação + restart. FALTA polish:
>   tela de triagem (checklist) + status "aguardando triagem" no front.
> - **FALTA (acabamento opcional):** (a) assentos/quota EDITÁVEIS por plano (hoje mostro
>   read-only do catálogo — atende o "ver"); (b) fiar setup/parcela/desconto na cobrança +
>   comissão de verdade (passo de DINHEIRO, deliberado, fora por enquanto); (c) reorg visual
>   do Full numa aba "Implantação" própria (hoje o bloco vive na aba Comercial — já funciona).

> Decisão do dono, 13/06/2026 (sprint de regras, ANTES de ter clientes — fazer
> a fundação agora é mais barato que em dado vivo com promessas feitas).
> Memória do projeto: `regua-unica-acesso-junho-2026`. Backend já mexido vive na
> fila `PR12062026/PLAN12062026001.md` (E13, E14, E16).

## Princípio: 2 árvores ortogonais + 1 lei + 5 muros

**Árvore A — o que a EMPRESA tem** (capacidade). `CompanyModule.enabled` é a
fonte ÚNICA, semeada do PADRÃO MASTER (catálogo `SystemModule.defaultEnabled`),
master edita por empresa em QUALQUER plano. Plano = nome+preço+preset+quota, NÃO
muro.

**Árvore B — o que cada PESSOA vê** (papel). **Por CARGO, não por nome** (mata
rivalidade): todo USER tem o mesmo molho; todo GERENTE o mesmo; só o DONO varia
(quem paga). Guardar por **(empresa, cargo)** = 2 configs (Gerente/Vendedor), não
por usuário → o editor "acessos por vendedor" vira "por cargo".

Papéis (sem enum novo): Master=`isSystemMaster` · Dono=`ADMIN` c/ `billing.view`
· Gerente=`ADMIN` sem `billing.view` · Vendedor=`USER`.

**A LEI única:** "só concede a chave que você tem" (1 check no gravar; aposenta
`SELLER_DEFAULT/ELIGIBLE/BLOCKED`).

**5 MUROS (não caem):** empresa não vê empresa · $ é papel, não chave de empresa
· não pagou = porta trancada · 1 dono por empresa · **automação que contata
humano = fail-closed**.

**Preferência (lagoa)** = dado por pessoa, separado do acesso.

> Árvore de acessos: **APROVADA pelo dono** (estrutura + lei + muros).

## Camadas de implementação

- **C1 — gate single-source:** FEITO no código (modules.service.ts), validado
  (build + 15/15). Fila E16, aguardando `docker restart`.
- **C2 — entitlement entra na MESMA máquina de módulo** (módulo atômico: "ativou,
  vem tudo q tem nele"; sub-recurso vem junto). Front gata menu só por módulo.
- **C3 — papel Gerente** (`billing.view`) + Admin não-transmissível + esconder $
  de quem não é Admin. Spec na fila E14.

## Radar / Leads / Vendas (modelo B)

Radar e Leads = MESMA tabela `/webscraping/radar/leads` (muda só `status`:
available→in_attendance→imported). Vendas = base própria `/vendas/board`.

- **RADAR = vitrine read-only ("encher o olho").** NINGUÉM altera; quem VÊ é
  decidido pela Árvore A (cargo). Front "show off": sonar girando, contador de
  empresas mapeadas, "X na sua região / Y vendas possíveis / metas". Dado
  LIMITADO (nome/segmento/cidade/score); **sem telefone/e-mail**. Operação de
  busca NÃO mora aqui. Números têm que ser HONESTOS (não inflar pipeline).
  Refatorar a tela: **pós-segunda, não perder**. Anti-exfiltração: **sem export**,
  rate-limit, log de quem viu.
- **LEADS = o que a empresa pede.** Puxar do banco existente = **grátis**; pedir
  busca NOVA (deep search) = **gasta QUOTA** (medidor já existe: card-quota /
  enrichment). Distribuição = **modelo B (puxar)**, **lagoa COMPARTILHADA**
  (FIFO, score escondido na fila, teto de mão/WIP). **Revelar-no-pull**: tel/e-mail
  só ao puxar pra carteira. Vendedor declara **preferência** (lagoa =
  segmento+região) e puxa filtrado. Falta o PULL do vendedor (hoje é PUSH:
  `distribute-to-vendedores` + regra auto; `radar/pull` já existe).
- **VENDAS = bancada.** Lista (ótima) + somar **kanban** (colunas = blocos da
  agenda: hoje/atrasado/agendado/fechado) + **"sua comissão" no topo** +
  **SCORE no card** (buraco confirmado: `/vendas/board` não carrega
  `opportunityScore`). Polish pós-segunda.

## Escada de planos (preço + preset + quota)

| Plano | Entrega | Linha |
|---|---|---|
| **HBX List** | Radar(banco) + Leads + Vendas | achar e vender |
| **HBX Lead Plus** | List + **Atendimento** + mais quota | **(diferencial em revisão — "atenda no zap" é fraco)** |
| **HBX Full** | Lead Plus + **Bot/IA/automação** + quota top | robô trabalha |

**ABERTO:** repensar o diferencial do Lead Plus (Atendimento) pra não morrer em
"abre o WhatsApp". Direção candidata: inbox de TIME em 1 número da empresa +
dossiê do lead do lado + histórico que fica com a EMPRESA + tudo virando venda.

## Árvore 3 — Atendimento + Bot (por último; deixar pronto, NÃO impor)

- Bot/automação = **Full** (default; master pode liberar manual).
- **Triagem = LEI (muro fail-closed):** automação OFF até triagem 100%, armada só
  por dono/gerente, NUNCA por vendedor, nunca default-on. Trava simples
  (`triagemCompleta` → pode armar); construir a triagem (remetente, mensagens
  aprovadas, horário, teto diário, opt-out, público, ok do dono).
- **BUG/URGENTE:** "Prospecção automática" no /vendas ligada sem config, agendada
  pra acordar **15/06 08:00** → travar ANTES de segunda (não surpreender as 2
  vendedoras novas). Cadência/automação detalhada: `PR13062026001`.
- Plano de adoção: deixar pronto HOJE, mas **não jogar o bot na cara das
  vendedoras na 1ª semana** — elas aprendem o HBX primeiro, automatiza depois.

## Sequência

1. Árvore de acessos — **APROVADA**.
2. Módulos do vendedor (Leads/Radar/Vendas) — modelo B encaixado.
3. Atendimento + Bot — por último (triagem fail-closed primeiro, por causa de segunda).

## EXECUÇÃO — Árvore limpa por CARGO (DESTRUTIVO, autorizado dono 13/06)

> Ordem do dono: "VC TEM QUE SER destrutivo com as leis antigas, pode derrubar o
> sistema. Não posso começar leis de vendedor com a árvore suja." Mata as leis
> hardcoded e a resolução de acesso por-usuário; acesso passa a ser por CARGO.
> Split: **acesso = por cargo**; comissão/preferência/limite = por pessoa (fica no
> UserTeamPolicy). Aplicação via runtime-ensure (`docker restart` cria coluna).

- **P1 — Schema (additivo): ✅ APLICADO (no ar).** `Company.sellerCargoAccessJson`
  (molho do cargo Vendedor, 1 por empresa) + `User.canViewBilling` (Dono=true /
  Gerente=false). `RUNTIME_SCHEMA_ENSURES` + schema.prisma; criadas no boot
  (`ensureReguaCargoAccessColumns` ok).
- **P2 — Resolução por cargo: ✅ APLICADO (no ar).** No gate (`canUserAccessModule`
  + `listMyModules`): USER resolve de `parseSellerCargoAccess` (molho do cargo,
  seed = vendas+radar via `SELLER_CARGO_DEFAULT_ACCESS`); ADMIN/master = tudo;
  `financeiro`/`gerencial` = muro (`SELLER_CARGO_WALL_MODULES`). O gate NÃO consulta
  mais `resolveTeamPolicyModuleAllowed`/`defaultUserModuleAllowed` por-usuário
  (removidos do gate; ainda usados na view master de políticas até o P7). Build +
  15/15 testes + restart OK. (Limpeza dos consts/funcs mortos = P7.)
- **P3 — Gerente $ wall: ✅ APLICADO (backend no ar).** Definição do dono:
  "gerente pra baixo ninguém vê o vínculo HBX×contratante (assinatura/plano).
  SÓ ISSO." `canManageBilling` ([financeiro.service.ts:669]) + `billingAudience`
  ([profile.controller.ts:48]) = `master || (ADMIN && canViewBilling !== false)`.
  `req.user`/`findById` já trazem `canViewBilling` → sync, sem mexer no token.
  Perfil expõe `canViewBilling` pro front esconder a seção. Build + 14/14 + restart.
  FALTA: front esconder "Plano e cobrança" por `!canViewBilling` (cosmético — backend
  já mascara o dado; sem gerente criado ainda, não vaza). Vai junto com o P5.
  Comissão/preço/venda CONTINUAM com o gerente (só a assinatura HBX é muro).
- **P4 — Editor por cargo: ✅ BACKEND no ar.** Endpoints `GET/PUT
  /modules/company/seller-cargo-access` (Admin + gerencial) →
  `getSellerCargoAccessForAdmin`/`setSellerCargoAccessForAdmin`. Grava
  `Company.sellerCargoAccessJson`. **FALTA: a TELA** (aba Acessos consumir o
  endpoint) — hoje o seed (vendas+radar) já funciona; o molho é editável via API.
- **P5 — Criação: ✅ APLICADO (back + front).** `createCompanyUser`: ADMIN criado
  pelo dono nasce com `canViewBilling=false` (Gerente); admin-com-$ só Master por
  outro fluxo. Front: `novo-acesso-modal` ganhou seletor **Cargo (Vendedor/Gerente)**;
  `/configuracoes` esconde "Plano e cobrança" por `canSeeBilling` (`!canViewBilling`).
- **P6 — Lei única (write-time): ✅ APLICADO.** Em `setSellerCargoAccessForAdmin`:
  só grava no molho módulo que a EMPRESA tem (CompanyModule.enabled); muro
  (financeiro/gerencial) nunca entra.
- **P7 — Verificação: ✅ build backend + 38 testes + lint(check-pele 576/576) +
  build front + restart, tudo healthy.** Limpeza de código morto: `canUseAdminOnlyModule`
  /`defaultUserModuleAllowed`/`SELLER_*` ainda são usados (muro do financeiro +
  view master de políticas por-usuário) → remoção exige reescrever a view master
  (cosmética, não-gate); fica como dívida menor, não bloqueia as leis.
