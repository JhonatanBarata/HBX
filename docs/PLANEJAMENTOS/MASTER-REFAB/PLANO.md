# MASTER-REFAB v2 — /master no modelo FINAL (crédito + negociada)

> v1 planejada 07/07. **v2 fechada 10/07** após auditoria ao vivo no VPS (master + banco) e
> diretivas novas do dono. Orquestração: workers Sonnet, 1 sprint por vez, ordens em
> `docs/PLANEJAMENTOS/PR10072026/`, diff revisado entre sprints, commit local por sprint,
> **publish só quando o dono mandar**.

## O modelo FINAL (dono, 10/07 — sobrepõe tudo; adendo cortesia 10/07 noite)
- **Morre: free trial, extensão, plano-como-produto, assento/vendedor adicional pago e
  CORTESIA como conceito/estado de conta.** Presente/liberação grátis = o master entra na
  ficha e ADICIONA CRÉDITOS (grant, que já existe). Nada de estado especial com prazo/motivo.
- Só 2 TIPOS de conta (palavras do dono):
  1. **Conta CRÉDITO** — entra grátis, welcome, recarrega packs. Usuários ilimitados; a única
     cobrança é o consumo de crédito; ativa por default (bloqueio só por suspensão/saldo/módulo).
  2. **Conta EMPRESARIAL (exceção)** — montada pelo master NA FICHA: módulos (kill-switch),
     crédito concedido, preço fixo manual, regras/tetos próprios.
- Tipo vira campo EXPLÍCITO (`Company.accountType credit|enterprise`, aditivo, default credit;
  wizard do master cria enterprise; editável na ficha). A derivação provisória do S1
  (cobrança manual = "Negociada") e o rótulo "Negociada" morrem — rótulo oficial: Empresarial.
- Regras anti-scraper são requisito do dono ("não posso deixar uma empresa drenar os 28M").

## Fatos da auditoria 10/07 (base do delta v1→v2)
- Publishes 08–09/07 varreram o backlog: kill-switch FASE2, courtesy-debita-real (`5e10b0d8`)
  e vitrine v2 **JÁ ESTÃO EM PROD**. Kill-switch é a régua ÚNICA de módulo (SystemModule:
  signup nasce com 10 ON; bot/email/vc/website OFF).
- Zona confirmada no /master: ficha estampa "Plano: HBX Lead Plus" em conta de crédito;
  lista "Módulos ON" conta post-its (4) e a ficha mostra efetivos (10); box Cortesia da ficha
  contradiz o badge da lista; packs LIVE com copy "placeholder" (R$97/1000 · 247/3000 ·
  597/10000); landing `?ver=planos` com a metade esquerda VAZIA (packs available, régua não
  renderiza); comissão fantasma latente (courtesy→payable recorrente; 0 receivables ainda);
  lixo de teste em prod (companies 37/38 + 5 charges "Entrega/TESTE" R$15 pending).

## Decisões da v1 — todas RESOLVIDAS
1. Self-Checkout → **MORRE** (não re-propósito): negociada é montada na FICHA, não em catálogo.
   Conteúdo vivo (packs, bônus de cadastro) migra pra Créditos.
2. Trial → **morto em definitivo** (ordem literal do dono).
3. Pagamento manual → **FICA** = a rota da empresa negociada (fatura manual + crédito concedido).
4. Vitrine pública → consertar a v2 (lado esquerdo vazio); `PlanModuleConfig` morre como fonte.

## Decisões que NÃO bloqueiam (viram config editável, dono ajusta quando quiser)
- Preço/tamanho dos packs (já editável no master; copy "placeholder" sai, valor fica).
- Teto diário self-service — default recomendado **500 leads/dia**, editável.
- Welcome — `CreditGlobalConfig.welcomeCredits` já existe (50 na campanha), só expor.

## Sprints (ordem = dor do dono primeiro)

### S1 — Empresas: ficha vira o MONTADOR + painel para de mentir (front + leitura)
`janela-empresas.tsx` (+`page.client.tsx` onde a lista/labels moram).
- Ficha: "Plano: X" → **"Modo: Créditos | Negociada"** (derivação acima). Aba Comercial:
  REMOVER blocos Plano/Degustação/Trial/Condições de cobrança/Limites cards-mês·dia. MANTER
  Cortesia (consertando a contradição com o badge — uma régua só, `company-access-state`),
  Suspensão, Excluir, Credenciais master, Bot chave-mestra, cobrança manual.
- Aba Financeiro: bloco **Carteira** no topo (saldo, lotes, conceder, extrato — endpoints
  `credits/master` existem); assinatura MP legada vira seção colapsada "Legado".
- Lista: "Trial/Período" → **Créditos** (saldo + tag sem-saldo); **"Módulos ON" passa a contar
  módulos EFETIVOS** (mesma régua da ficha); badge de modo.
- Wizard Nova empresa = fluxo da NEGOCIADA: some Plano/Ciclo; campo "créditos iniciais"
  (default = welcomeCredits).
- `STATUS_LABEL`: enxugar (courtesy/ativa/suspensa + legados marcados).
- Pronto quando: nenhuma menção a plano/trial na janela; lista e ficha contam a MESMA verdade.

### S2 — Créditos vira o centro financeiro (front)
`janela-creditos.tsx` absorve `janela-pagamentos.tsx` (menu enxuga).
- Guias: **Visão geral** (receita recarga 30d, créditos em circulação, expirações 30d, quem
  está sem saldo) · **Empresas** (saldo/lotes/último consumo, grant inline) · **Packs** (CRUD
  atual; matar copy "placeholder"; aviso "preço definido por você") · **Bônus de cadastro**
  (welcomeCredits/expiry editável) · **Recargas** (charges+webhooks da ex-Pagamentos).
- Backend: só leitura agregada se faltar (`GET /credits/master/overview`).
- Pronto quando: "quanto entrou este mês / quem está sem saldo" respondido em 1 tela.

### S3 — Guardrails anti-scraper (backend + campos na ficha) **[NOVO — pedido do dono]**
- **Teto diário de entregas por empresa**, mesmo com saldo: config global (default 500) +
  override por empresa (campo na ficha S1). Enforce no MESMO choke do débito
  (`enforceLeadDeliveryDebit`/`reserveLeadDeliveryCredit`) — erro claro, sem card órfão.
- **Throttle da busca grátis** (por empresa, janela por minuto/hora) no caminho público do radar.
- **Export/lote**: passa pelo mesmo teto diário (sem canal lateral).
- **MasterAlert de consumo anormal**: >N créditos/24h ou teto batido → alerta no /master.
- Flags aditivas, fail-open se config ausente (não derrubar venda por bug de guardrail).
- Pronto quando: teste prova que a 501ª entrega do dia bloqueia e alerta, com saldo sobrando.

### S4 — Self-Checkout morre + vitrine pública consertada (front)
- `janela-self-checkout.tsx` sai do menu; nada no /master edita `PlanModuleConfig`.
- Landing `?ver=planos`: consertar o lado esquerdo vazio — render da régua de packs +
  explicação do modelo (conta grátis → créditos → recarga). Fonte = `credits/public-catalog`.
- Pronto quando: grep no front por PlanModuleConfig/planos-catálogo = zero uso vivo.

### S5 — Cockpit no modelo crédito (front + 1 agregado)
- "MRR ativo" → Receita de recarga 30d + créditos em circulação + burn 7d.
- Funil: cadastros → ativou (1º consumo) → 1ª recarga. Roster: MRR → saldo/consumo 30d.
- Pronto quando: cockpit não menciona MRR/assinatura.

### S6 — CORTESIA MORRE: 2 tipos explícitos de conta (adendo do dono 10/07 noite)
- Migration aditiva: `Company.accountType TEXT NOT NULL DEFAULT 'credit'`
  ('credit' | 'enterprise'); backfill documentado: cobrança manual/assinatura ativa →
  'enterprise'. Wizard master cria 'enterprise'; toggle na ficha.
- `company-access-state.ts` simplifica: conta credit = ativa por default (bloqueio só
  suspensão/exclusão; consumo gateado por crédito/módulo/teto); estados courtesy/trial/
  pending_checkout nunca mais atribuídos (legado lê como credit ativa; dado não some).
- **Enforcement de crédito atrelado ao TIPO**: `isEnforceActiveForCompany` troca o predicado
  courtesy→`accountType==='credit'` (enterprise segue no cutover 2 chaves). REVISÃO LINHA A
  LINHA do orquestrador neste ponto (é cobrança).
- UI: box "Cortesia" some da ficha (presente = grant na Carteira); badge/status "Cortesia"
  some da lista (status = Ativa/Suspensa + legados em leitura); rótulo "Negociada" →
  **"Empresarial"** em tudo que o S1 criou; signup cria conta credit ativa.
- Ledger: grantType `courtesy_internal` FICA no dado/fiscal (não é receita) — só o RÓTULO de
  UI vira "Concessão interna".

### S7 — Aposentadoria backend + comissão-freio + vocabulário (risco alto, POR ÚLTIMO)
- Aposentar endpoints de plano/trial que S1–S5 tiraram do front (`company/:id/plan`,
  `plan-taste`, `trial`, `card-quota`, `finance-settings`, PUT plan/modules, política anual).
  Dado NUNCA some; leitura de status legado aceita, escrita nova bloqueada. Testes reescritos.
- **Comissão-freio (EU edito — frente financeira):** courtesy/exempt NUNCA vira payable —
  fica `pending` até 1ª receita REAL (recarga paga ou fatura manual paga); base = valor pago,
  não tabela. Mata a comissão fantasma sem inventar política nova.
- E-mails/templates: matar trial/checkout, welcome fala créditos. `janela-sistema`: restos de
  política anual. Varredura de vocabulário (trial/assento/plano) + CSS órfão.

### S0 — Faxina de dados de teste **[GATED — só com OK explícito do dono no chat]**
Excluir companies 37/38 (testes dele) e as 5 charges "Entrega/TESTE CLAUDE" R$15 pending da
company 37. Destrutivo → não roda sem ordem.

## Guardrails de orquestração
- 1 worker Sonnet por sprint, **sequencial**, ordem self-contained em `PR10072026/S{n}-*.md`
  (o .md some ao concluir); diff revisado pelo orquestrador antes do próximo.
- Sem branch/worktree (regra do dono) — direto no master, commit local por sprint.
- NÃO ligar flag de enforcement nova, NÃO migration destrutiva, NÃO tocar WhatsApp/motor.
- Leis do design system (tokens hbx-theme, check-pele) em todo front.
- Typecheck + testes do que tocou + `next build` por sprint; QA visual = dono no VPS pós-publish.
