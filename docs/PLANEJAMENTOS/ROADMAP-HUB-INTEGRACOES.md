# ROADMAP — HUB-INTEGRACOES (frente PARADA de propósito)

> Consolidação dos sprints de `HUB-INTEGRACOES/` (11/07/2026). Docs originais deletados — **git preserva**.
> Frente parada por decisão do dono; **não auto-construir** (toca WhatsApp/dinheiro/dep. externa).

## Visão
Arquitetura nº12 — Hub de Integrações (backend/src/integrations): unificar tudo num cofre só de credenciais cifradas + uma fábrica genérica de conectores de ERP (hoje AUVO/TagPlus) com sync confiável e um gateway único de webhooks. Parou porque as sprints pesadas (fábrica de conectores, broker de token, gateway) são gatilhadas por demanda EXTERNA: um 3º conector comercial real e a homologação em sandbox do contrato verdadeiro das APIs AUVO/TagPlus (hoje o contrato é só assumido) — sem isso, construir o broker/fábrica é arquitetura de brochura. Só o pedaço que toca dinheiro real (guard anti-corrida do webhook MP) foi de fato entregue.

## Sprints

| Sprint | Estado | O que falta |
|---|---|---|
| SPRINT1 — Dinheiro seguro (Mercado Pago): ledger de idempotência + guard anti-corrida no webhook + unificação do resolvedor MP | 🟡 parcial | Feito e em prod só o guard anti-corrida da notificação no webhook recovery (ledger recordReceived/markProcessed em hbx-recovery.service.ts:3308); FALTA ledger no webhook do financeiro, unificar resolveCompanyMercadoPagoAccess p/ ler IntegrationConnection cifrada (degrau 0) e expand cifrado da biblioteca master (mercadoPagoLibraryCiphertext). |
| SPRINT2 — Sync confiável (reaper + verdade no painel + worker incremental) | ⬜ não feito | Nada feito: falta stale-run reaper antes do syncNow, gravar lastSuccessAt só quando failedCount===0 (auvo.sync.service.ts:375 ainda incondicional), worker setInterval com disjuntor chamando syncIncremental (método existe, sem caller), e trocar o findMany-tudo (auvo.sync.service.ts:226) por chunks. |
| SPRINT3 — Fábrica de conectores (registry + engine genérico) | ⏸️ segurado | Nada feito e ADIADO por gatilho (3º conector comercial): falta contrato IntegrationProviderAdapter, registry por DI (INTEGRATION_ADAPTERS) matando os if provider==='AUVO'/'TAGPLUS' (integration-connections.service.ts:304-344), IntegrationSyncEngine, tabela ExternalObject genérica + IntegrationSyncCursor, e migrar AUVO/TagPlus. |
| SPRINT4 — Credencial de verdade (envelope v3 + broker + rotação de chave) | ⏸️ segurado | Nada feito e ADIADO por gate (tarefa 0 = homologação sandbox do contrato real AUVO/TagPlus): falta envelope v3 tipado (oauth/expiresAt/refreshToken), CredentialBroker com refresh single-flight, e rotação de chave de cifra (INTEGRATION_SECRET_KEYS/ACTIVE_KEY); envelope ainda é v2 fixo. |
| SPRINT5 — Um cofre, um portão (gateway único de webhooks + contract dos segredos planos) | ⏸️ segurado | Nada feito e depende de S1/S3/S4: falta gateway POST /webhooks/:provider com fila IntegrationJob+worker, migração dos segredos planos (Company.*AccessToken e bibliotecas master) p/ cofre cifrado via resolvedor unificado com grep-gate, e MetaLeadConnection pelo broker; company-secret-inventory.ts documentado mas nunca executado. |

## Flags / passos VPS pendentes
- HBX_INTEGRATIONS_SYNC_STALE_MIN (default 30) — janela do stale-run reaper (S2)
- HBX_INTEGRATIONS_SYNC_INTERVAL_MIN (default 15, jitter ±20%) — base do worker incremental (S2)
- HBX_INTEGRATIONS_SYNC_CRON_ENABLED (default OFF até homologação) — flag mestre que liga o worker de sync (S2)
- INTEGRATION_SECRET_KEYS (mapa keyId→chave) + INTEGRATION_SECRET_ACTIVE_KEY — rotação de chave de cifra, formato v2.keyId.iv.tag.data (S4)
- MERCADO_PAGO_WEBHOOK_SECRET — assinatura do webhook MP (já existe, opt-in; sem ele processa sem verificar) (S1/S5)
- Homologação/sandbox AUVO + TagPlus (tarefa 0, GATE da S4): auth real, expiração, refresh, paginação, rate limit — registrar contrato CONFIRMADO em docs/Rules
- VPS: trocar URL de webhook no painel do MP/Meta p/ o gateway único = ação manual do dono, à parte (S5)
- VPS: mudar env_file/env = RECREATE do container (regra INFRA); migração de segredo plano→cifrado é expand/contract com leitura dupla, NUNCA big-bang (VPS = MP LIVE) (S5)
