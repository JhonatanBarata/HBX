# CHECKLIST-ATIVACAO — o que falta LIGAR e o que ficou PENDENTE

> Consolidação de 36 docs "feitos" de `docs/PLANEJAMENTOS` (11/07/2026). O código
> dessas features **está no ar**; o que resta é **ligar flag/aplicar migration na VPS**,
> mais alguns **rabos de escopo** que ficaram e **decisões suas** em aberto.
> Os `.md` originais foram deletados — **o git preserva todos** (`git log --diff-filter=D`).
> Domínios WhatsApp/motor, IA-ponte-30B, Hub, NFSe e as pastas restauradas
> (WEBWHATS-ARQ3/WEBSITE-KIT) NÃO estão aqui — vão na revisão caso-a-caso à parte.

---

## 1) Ligar / conferir no `.env` da VPS (flags & envs)

### Créditos (carteira pré-paga vira o ÚNICO teto)
- **`HBX_CREDITS_ENABLED`** — gate mestra (recarga self-service, overlay de catálogo, action-catalog). Sem ela os endpoints respondem 404. *Memória: já ON pela campanha courtesy — confirmar.*
- **`HBX_CREDITS_SHADOW`** — medir consumo em sombra ANTES de bloquear.
- **`HBX_CREDITS_ENFORCE`** (global, default OFF) **+ `Company.creditsEnforceEnabled`** (por-tenant, nasce false) — as **2 chaves** que ligam o BLOQUEIO por saldo. Qualquer uma OFF = gate no-op.
  - ⚠️ **Ordem crítica:** ENABLED → SHADOW (medir) → ENFORCE + flag por-tenant. A Fase 2 já **removeu a cota antiga** → nada bloqueia entrega de lead até isso ligar.
  - ⚠️ Ligar o enforce/flip **queima o welcome 50** da conta grátis.
- **`HBX_COMMISSION_RECHARGE_PERCENT`** (default `0` = desarmado) — cravar o `%` (>0) pra comissão de recarga passar a gerar receivable. Idempotente por charge.

### Logística / Entrega
- **`HBX_LOGISTICA_ENABLED`** (default OFF) — libera os 2 efeitos do confirmar-entrega: WhatsApp "entregue" + lançar cobrança. OFF = só grava status/GPS.
- **`LogisticaConfig.moduloFinanceiroAtivo`** (por-tenant, default false) — extrato/saldo/fiado na ficha + agregação na rota. *Hoje só a empresa 5 (teste) está ON.* Toggle: Ajustes → Módulos → "Financeiro" (`PATCH /logistica/config`).
- **`LogisticaConfig.moduloRecoveryAtivo`** (por-tenant, default false) — varredura de dívida vencida → funil hbx-recovery. OFF = varredura é no-op.
- **`LogisticaConfig.pixChave/pixNome/pixCidade`** (por-tenant) — sem `pixChave` **nenhum QR Pix** aparece na entrega.
- **SystemModule `logistica`** (kill-switch, por empresa) — habilitar no master conforme a venda.

### Núcleo-CRM
- **`HBX_NUCLEO_INGESTAO_ENABLED`** (vive no `.env` da VPS, **não no git**) — pull do Radar materializa Conta+Contato. *Memória: já =true.*

### Meta Lead Ads (ARQ11)
- **`META_APP_SECRET` + `META_VERIFY_TOKEN`** — **fail-closed**: sem elas o canal parece vivo e **descarta 100% dos leads em silêncio**.
- **`HBX_META_LEADADS_WORKER_ENABLED`** (default ON) — kill-switch; garantir que NÃO está `=0` (senão a fila não drena).
- **`HBX_AD_LEAD_NOTIFY_ENABLED`** (default OFF) — ⚠️ mesmo ligada **não envia nada hoje** (stub — ver §3).
- **Por-tenant (operacional, não flag):** o admin de cada empresa clica **"Assinar webhook"** por página Meta (`POST /integrations/meta/connections/:id/subscribe-webhook`) — sem isso o Meta não manda evento.

### Contábil
- **`HBX_CONTABIL_SCHEDULER_ENABLED`** (default ON) — já ligado; setar `=0` só pra DESLIGAR.
- **Gate REAL (dado, não flag):** cadastrar um **FiscalProfile com `cnpj`** via Contábil — sem isso o relógio fiscal fica **inerte** (não gera obrigação nem alerta).
- **`MASTER_ALERT_WA_COMPANY_ID`** — company cujo chip envia o alerta fiscal por WhatsApp; sem ela o zap não sai (cai só em e-mail+log).
- **`MASTER_ALERT_EMAIL`** (ou um system_master com e-mail) — destino do alerta por e-mail.
- `HBX_CONTABIL_TICK_MS` — opcional (default 6h).

### Vendas / Radar
- **`HBX_SELLER_INACTIVITY_PENALTY_ENABLED`** — **MANTER OFF** (default). É o estado que entrega o fix "teto não zera sozinho"; **ligar reverte** o comportamento.
- **Carga do dump RFB 28M** no Postgres (`CnpjPublicCompany`) — sem ela `baseAvailable=false` e o "28M" não aparece (cai pro pool). *(pareado com `HBX_RADAR_CNPJ_PUBLIC_ENABLED` OFF — ver revisão Vendas.)*

### Limpar do `.env` (obsoleta)
- **`HBX_MODULES_KILLSWITCH_ONLY`** — sem efeito agora (`isModulesKillSwitchOnlyEnabled()` fixo em true). Remover de `.env`/`.env.example`.

### Go-live de SEGURANÇA — ordem de virar os ENFORCE (do GOLIVE-DELTA/CHECKLIST-FLAGS)
> **Eu não ligo flag de enforcement (seu guardrail).** Ordem do mais seguro pro mais arriscado:
1. **`MP_WEBHOOK_SIGNATURE_MODE=enforce`** (default `log`, secret já injetado) — baixo risco, faça já. Pré: confirmar nos logs que um webhook real recente bate a assinatura no modo `log` (secret certo). Ganho: mata replay/sync de IDs arbitrários.
2. **`HBX_TENANT_GUARD_MODE=enforce`** (default prod=`report`) — ⚠️ MAIOR risco. Rode dias em `report`, junte os `[tenant-guard] unscoped model/op/stack` dos logs, corrija cada query legítima (o pool do Radar/night-factory lê sem `companyId` — ver BACKLOG P2b) ANTES de virar. Cobre só `findMany/count/aggregate/updateMany/deleteMany`, NÃO `findUnique/update/delete/upsert` nem SQL cru, e valida só presença da chave — barreira PARCIAL (endurecer o guard é opção sua futura).
3. **Enterprise cutover** (`HBX_CREDITS_ENFORCE=ON` + `Company.creditsEnforceEnabled` por empresa) — só quando a conta enterprise tiver lote contratado; empresa a empresa, nunca a env global de uma vez. Conta `credit` (self-service) **já debita**, nada a fazer pra abrir ao público.

### Flags de emergência (default seguro, não tocar)
- `HBX_SKIP_RUNTIME_SCHEMA_ENSURES` (G1) — OFF; só no dia em que as 44 ensures virarem migrations formais.
- `HBX_SKIP_GATE` / `--skip-gate` (G4) — gate LIGADO; pular o quality gate só em emergência.

---

## 2) Migrations a garantir aplicadas no Postgres da VPS

> Padrão do repo: o dono aplica no deploy (W-A não roda `migrate deploy`). Rodar `npx prisma generate` depois.
> Memória dá Núcleo N1–N6, Contábil e Créditos como **em prod** → provavelmente já aplicadas. **Confirmar.**

- `20260703_120000_arq11_ingestion_retry` — fila durável Meta (payload/attempts/nextRetryAt/lastError + webhookSubscribedAt)
- `20260614_meta_lead_ads_intake` — `VendasLead.leadTemperature`
- `20260703_contabil_obligation_scheduler` — `FiscalObligation`
- `20260705140000_credits_enforce_company_flag` — `Company.creditsEnforceEnabled`
- `20260711020000_credit_action_config` — overlay `CreditActionConfig`
- `20260702230000_add_saved_search` — `SavedSearch`
- `20260705000000_nucleo_conta_contato`, `20260705010000_produto_logistica_fields`, `20260705020000_logistica_entrega`
- `20260705050000_cliente_avisar_entrega` — `CustomerProfile.avisarEntrega`
- `20260705060000_financeiro_charge_link` — links + índices do FinanceiroCharge
- `20260705070000_integridade_espinha` — ⚠️ **deduplica CustomerProfile por (companyId,cnpj)** + índices únicos parciais; rodar `EXPLAIN` num dump antes se a base tiver muitas duplicatas
- `20260707200000_logistica_financeiro_ficha` — `CustomerProfile.limiteFiado` + `LogisticaConfig.pix*`
- `20260710150000_local_entrega_multi` — `LocalEntrega` (multi-endereço) + `localId` em Entrega/ClienteProduto

---

## 3) Pendências de código — prometido e NÃO construído (âncora arquivo:linha)

- **ARQ11 S2 — notificação WhatsApp ao vendedor é STUB:** `notifyAdvertisingLeadOwner` (`backend/src/vendas/vendas.service.ts:7453`) só **loga** "notificacao pronta", não envia (destino self-notify "não canônico no repo"). O espelhamento agenda/inbox (`syncLeadToInboxAgenda`) esse sim funciona.
- **Contábil — alerta sem "valor previsto":** `textoAlerta()` em `obligation-scheduler.service.ts` não puxa o número do `FiscalRevenueMonth` (cosmético; estrutura do alertador completa).
- **Créditos S4 — 3º teto por vendedor** (`vendasPullQuantityLimit`) não construído (deixado como "S4-parte2" opcional; só `monthlyCardsLimit` e `cardDeliveryDailyLimit` existem).
- **Créditos Fase 2 — código morto não removido:** `financeiro.service.ts::_legacyChangePlanForUser` (~630 linhas de proração MP), `seat-billing.util.ts`, `plan-proration.util.ts` compilam mas nunca são chamados. S7 (migração de clientes do modelo antigo) **pulada** (sem clientes reais hoje).
- **LEADS-FINAL 03:** (a) filtro **não é compartilhável por link** (estado só em React, não na URL); (b) **sem "renomear"** pesquisa salva; (c) **endpoints do plano órfãos** — `POST /webscraping/radar/count` (RadarCountService, teto 10k+/rate-limit dedicado) e `radar/saved-searches` foram construídos mas o front usa `cnpj-base/query` limit:1 e o contrato antigo `/saved-search`. Feature funciona, mas fora do contrato desenhado. → **decisão em §4.**
- **Logística M7 — badge "em cobrança" na ficha (front)** não construído (dado existe no backend via HbxRecoveryCustomer/DebtCase).
- **Logística M8 — UI de "resolver" item needs_attention** (reenfileirar manual após teto de 5) adiada; hoje só sinaliza (badge vermelho) e para.
- **Núcleo N2 — backfill:** leads puxados ANTES da flag ON ficam **sem Conta+Contato**; existe só helper call-ready, **sem script dedicado nem execução**.
- **Núcleo R4 — contador de falha de efeito no cockpit master:** backend EMITE `MasterEvent type='logistica.efeito_falhou'`, mas **nenhum front lê/exibe** (dono reformando o front).
- **LASTMD/crédito — furo 3 sem backfill:** leads Enterprise sincronizados **antes de 11/07** tiveram `saleValue` negociado sobrescrito pra preço de tabela; o fix só vale daqui pra frente.
- **Vendas PLANO-UI / S-BACKEND-UI — autocomplete de cidade/CNAE no /vendas** não aberto (rotas `cnpj-base/cities|cnaes` só `MasterGuard`, sem espelho admin/vendedor); rotas `standing-order`/`auto-distribution/run` deixadas **inertes, não removidas**.

---

## 4) Decisões abertas do dono

- **Créditos Fase 2:** deletar de vez a lógica legada `changePlanForUser`? manter ou remover o **2º bloqueio de cota** em `importWebscrapingLeadsForUser`?
- **LEADS-FINAL 03:** aceitar o front como está (**deletar** os endpoints órfãos) ou **religar** o front no contrato desenhado (RadarCountService + saved-searches dedicados, com o teto 10k+/rate-limit)?
- **PR11072026 — enriquecimento pago:** decidido NÃO implementar neste PR (ideia: ação separada no Vendas + IA conferindo entrega antes de debitar). Hold/reserva no ledger **cancelado** de propósito. Flips `track→debit` só com ~30d de dado. **Preço real dos packs** a definir.
- **LASTMD — rateio de comissão de recarga com 2 vendedores no mesmo cliente:** hoje "último a vincular vence" (recarga paga 1, recorrência paga os 2). Decidir. + backfill do furo 3.
- **Comissão de recarga:** cravar o `%` em `HBX_COMMISSION_RECHARGE_PERCENT`.
