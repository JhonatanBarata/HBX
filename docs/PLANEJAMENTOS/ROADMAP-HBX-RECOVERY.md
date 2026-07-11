# ROADMAP — HBX-RECOVERY (frente PARADA de propósito)

> Consolidação dos sprints de `HBX-RECOVERY/` (11/07/2026). Docs originais deletados — **git preserva**.
> Frente parada por decisão do dono; **não auto-construir** (toca WhatsApp/dinheiro/dep. externa).

## Visão
Arquitetura nº14 — endurecer e desacoplar o módulo HBX Recovery (cobrança de inadimplentes por WhatsApp): S1 blinda o caixa (webhook MP + saldo atômico), S2 unifica o caminho de pagamento e adiciona ledger auditável, S3 liga o executor de réguas automáticas (a RECEITA), S4-S6 são strangler/refactor pra tirar bot, templates e configs de dentro do messaging.service gigante (~9k linhas). Parou porque: S1 já está no código mas espera janela operacional no VPS (observar 48h de webhook antes de virar enforce); S3 é a receita mas alto risco de ban (disparo automático em massa) e nasce OFF esperando piloto/decisão; S4-S6 são higiene/refactor sem receita direta, despriorizados frente ao Play/RELEASE-20X. Obs: memória diz "S1/S2 c9923fdc", mas o código mostra S2 só PARCIAL (ledger sim; fusão do pagamento e Decimal não).

## Sprints

| Sprint | Estado | O que falta |
|---|---|---|
| Sprint 1 — Blindar o caixa (webhook MP + saldo atômico) | ✅ feito | Código pronto (gate log/enforce em mercado-pago-webhook-signature.ts nos 2 controllers, applyPayment/reversePayment atômicos com lock otimista updateMany+updatedAt, cross-check tenant metadata.company_id); falta só rodar os passos no VPS: setar secret + MP_WEBHOOK_SIGNATURE_MODE=log (RECREATE do container), observar 48h e virar enforce. |
| Sprint 2 — Caminho único de pagamento + ledger | 🟡 parcial | Ledger HbxRecoveryPaymentEvent criado e gravado (recordPaymentEvent); MAS a fusão num recovery-payments.service.ts único NÃO foi feita (sendPaymentLink e createAndSendRecoveryPaymentLink seguem divergentes) e Decimal não aplicado (openAmount/totalPaid ainda Float, deferido pro S6). |
| Sprint 3 — Executor de réguas (a receita) | ⬜ não feito | Nada existe: sem RecoveryFlowRunnerService, sem flag, sem colunas de estado (flowStageIndex/flowAnchorAt); daysAfter continua exibido e nunca executado — falta o runner com disjuntor, migration de estado por cliente e gate por provider (só Cloud API oficial no v1). |
| Sprint 4 — Bot engine volta pro módulo (strangler) | ⬜ não feito | Sem bot-flow-registry.service.ts / recovery-bot-flow.ts / recovery-bot-engine.service.ts; messaging.service.ts ainda tem 72 hits hbx_recovery e getRecoveryBotConfig duplicado — falta o strangler em 5 fatias movendo a máquina de estados via registry runtime. |
| Sprint 5 — wa-templates (módulo compartilhado) | ⬜ não feito | Sem módulo wa-templates e sem tabelas WhatsAppTemplate/History/Media; templates seguem em blob JSON na linha-sentinela HBX_RECOVERY_META_TEMPLATES e hbx-recovery.service.ts tem 4741 linhas (meta ~2800) — falta extrair ~1.700 linhas com migração dual-read. |
| Sprint 6 — ModuleConfig tipada + higiene | ⬜ não feito | Sem CompanyModuleConfig nem module-config.store.ts; assinatura 'Colsani' ainda hardcoded (hbx-recovery.service.ts:116), user:any 42x, sem HBX_ALLOW_DEMO_SEED nem AuthUser — falta a tabela+store, migração das sentinelas, fixes de higiene, Decimal e RESPONDER a pergunta do dono (Recovery vira módulo cobrável próprio?). |

## Flags / passos VPS pendentes
- S1 VPS: setar MERCADO_PAGO_WEBHOOK_SECRET (painel MP) + MP_WEBHOOK_SIGNATURE_MODE=log→enforce — mudar env_file = RECREATE do container, observar ≥48h de logs 'valid' antes do enforce
- S3: HBX_RECOVERY_FLOW_ENABLED (default 0, ligar por empresa piloto) + HBX_RECOVERY_FLOW_DAILY_CAP (default 30) + teto global + HBX_RECOVERY_FLOW_TICK_MS (só teste) — runner nasce OFF
- S6: HBX_ALLOW_DEMO_SEED (default OFF em produção) pra travar o auto-seed/reset-seed das 20 empresas fake
- Migrations pendentes (aplicar local + conferir no VPS pós-publish): S3 (flowStageIndex/flowAnchorAt/flowStageLastSentAt em HbxRecoveryCustomer), S5 (WhatsAppTemplate/History/Media), S6 (CompanyModuleConfig)
- DECISÃO do dono (S6 item 6): Recovery hoje usa gate ModuleAccess('atendimento'); vira módulo cobrável próprio (systemModule hbx_recovery já existe) ou continua junto do atendimento? Impacto direto em plano/preço
- S3 gate de segurança: empresa em Webwhats (não-oficial) NÃO entra na régua automática no v1 — só Cloud API com template aprovado; disparo em massa por canal não-oficial = receita de chip banido
