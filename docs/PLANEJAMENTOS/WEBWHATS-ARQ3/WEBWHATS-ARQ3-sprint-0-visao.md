# WEBWHATS-ARQ3 — Sprint 0: Auditoria completa + visão (índice)

> Arquitetura nº3 do motor WhatsApp. Auditoria feita em 03/07/2026 sobre código real (master) +
> VPS ao vivo (dados checados por SSH). Sucede o GATEWAY-WA (nº2, sprints 1–4 NO AR): este plano
> **absorve** o GATEWAY-WA Sprint 5 (matar polling = S2 daqui; fatiar bridge = S5 daqui) — o
> `GATEWAY-WA-sprint-5-fonte-unica.md` fica SUPERSEDED por este índice.
> 1 subagente por `.md`, apaga ao concluir. NENHUM sprint executa sem ordem do dono.

## Dados reais colhidos na auditoria (03/07/2026, VPS ao vivo)

| Fato | Valor medido | Como |
|---|---|---|
| Frota | 4 instâncias: 3 `open`, `company-13` `close` | `GET /health/fleet` no motor |
| RAM do motor | ~120 MB | `systemctl show webwhats.service` |
| Banco do motor | `webwhats_prod` = 60 MB; `Message` 43 MB / 14,8k linhas | psql via container |
| Outbox | 354 eventos desde 03/07 madrugada (~350/dia) | `SELECT count(*) FROM "EventOutbox"` |
| Disjuntor | funcionando: close 428 → 1 tentativa → open (2 ciclos em 03/07) | telemetria `ConnectionEvent` |
| Redis | **OFF** (`CACHE_REDIS_ENABLED=false`) — cache local, sessão via Prisma/Postgres | `.env` do motor |
| 🔴 **Porta 8080** | **PÚBLICA na internet** — `curl http://<ip>:8080/` de fora responde 200 (manager) e endpoints seguram só na apikey estática; `ufw status` = **inactive**; bind `0.0.0.0:8080` | testado de fora da VPS |
| Flags GATEWAY-WA | consumer/freio/polling-off **ausentes do `.env` do backend** = tudo OFF | grep no `.env` |
| Ollama (contraste) | bind correto `172.18.0.1:11434` (só rede interna) | `ss -ltnp` |

## Arquitetura ATUAL (desenho do fluxo, começo → fim)

```
WhatsApp (Meta)                     Internet pública
   ▲▼ socket Baileys por chip          │ 🔴 :8080 aberto (UFW inativo)
┌──┴────────────────────────────────────▼──────────────────────────── VPS única ┐
│ webwhats.service (systemd, host :8080) — fork Evolution                       │
│   WAMonitoring: 4 chips · boot escalonado 8s · número-único (reap)            │
│   Disjuntor: 4 tentativas, backoff 15→120s+jitter, terminal = re-parear       │
│   whatsapp.baileys.service.ts = 5.391 linhas (god-class)                      │
│   EventManager.emit() = choke point: grava EventOutbox + dispara webhook      │
│     webhook HTTP → backend: retry 10x/backoff EM RAM (restart descarta)       │
│   sessões (creds Baileys) via Prisma → webwhats_prod · Redis OFF              │
│        │ grava TUDO (SAVE_DATA forçado true)                                  │
│        ▼                                                                      │
│ webwhats_prod (Postgres): Message 43MB · Session · EventOutbox · ConnectionEvent
│                                                                               │
│ ┌─ Docker ─────────────────────────────────────────────────────────────────┐ │
│ │ hbx-backend (NestJS) — dono da conversa                                  │ │
│ │   entrada: POST /webhooks/webwhats/events (secret x-hbx-webhook-secret)  │ │
│ │     → processWebwhatsEventCore (miolo compartilhado c/ consumer)         │ │
│ │   saída: fila OutboundMessage (lock PENDING→SENDING, tick 5s)            │ │
│ │     → WebwhatsBridgeService (4.311 linhas) → REST apikey 172.18.0.1:8080 │ │
│ │   messaging.service.ts = 9.432 linhas (god-class nº2)                    │ │
│ │   DORMENTES (flag OFF): consumer outbox · freio envio · polling-off      │ │
│ │   estado do chip em ~5 lugares (motor, webwhats_prod, sessão app,        │ │
│ │     Company.whatsappModalStatus, cache front) = raiz de bugs de painel   │ │
│ │ hbx-postgres (app) · hbx-frontend · hbx-engine-2..8 (Ollama etc.)        │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

### O que JÁ está saudável (não mexer / não reabrir)
- Disjuntor de reconexão (mata a máquina de ban) — **intocável em lógica**.
- Número-único (reap determinístico) + boot escalonado 8 s.
- Telemetria S1 (`ConnectionEvent`) + outbox S2 gravando + freio S3 e consumer prontos atrás de flag.
- Idempotência de ingestão (upsert por providerMessageId) — absorve dupla entrega.
- Fila de saída com lock e atempts — padrão outbox de aplicação correto.

### Achados (ordem de severidade)
1. 🔴 **P0 — API do motor exposta à internet** (bind `0.0.0.0:8080`, UFW inativo, manager público,
   auth = 1 apikey estática global). Evolution API é alvo conhecido de scan; um bypass = frota inteira.
2. 🟠 Webhook motor→backend com retry só em RAM — restart perde a REAÇÃO (bot mudo). Solução já
   construída (outbox+consumer) porém **desligada**; polling de sync segue como rede de segurança.
3. 🟠 Fix `EventOutbox.id Int→BigInt` pronto em `claude/objective-kilby-c68cd6` e não publicado
   (no ritmo atual de ~350 eventos/dia não é urgente, mas é barato AGORA com tabela ≤ 7 dias).
4. 🟠 Estado de conexão em ~5 lugares sem fonte única — gera a família de bugs "Conectado fantasma"
   (painel Equipe lê banco, `connectedAt` não atualiza, selo do admin, RUIM#1/2 do WHATSAPP.md).
5. 🟡 Freio de envio por chip existe e está OFF — anti-ban proativo hoje = só disjuntor + bom senso.
6. 🟡 God-classes: `whatsapp.baileys.service.ts` 5.391 · `webwhats-bridge.service.ts` 4.311 ·
   `messaging.service.ts` 9.432 linhas — custo de manutenção e risco em cada mexida.
7. 🟡 Fork ainda carrega integrações mortas acopladas (openai/dify/typebot/chatwoot/S3 presas ao
   `ChannelStartupService`) — superfície de ataque e RAM à toa (dieta S4 parou nelas).
8. 🟡 Zero métricas agregadas (RAM, lag da outbox, taxa de reconexão) — diagnóstico é `journalctl`.

## Arquitetura IDEAL (o que altíssimo porte usa de verdade)

Empresas grandes (bancos, varejo, unicórnios de CRM) **não rodam WhatsApp Web/Baileys**. O desenho:

```
Clientes ──► WAF + API Gateway (mTLS, rate-limit, zero porta crua)
                 │
        Serviços stateless (k8s, autoscale, blue/green)
                 │
        Broker de eventos (Kafka/SQS) ── outbox → consumers idempotentes → DLQ
                 │
        Policy engine de envio (token bucket POR NÚMERO, warm-up, orçamento diário)
                 │
        WhatsApp Cloud API oficial (direto Meta ou BSP: Twilio/Infobip/Gupshup)
          → sem ban, SLA, 80 msg/s por número, template + janela 24h, $/conversa
                 │
        Dados: Postgres (conversas) · Redis (cache/sessão) · S3 (mídia, retenção)
        Transversal: métricas (Prometheus) + traces + alertas + on-call
   [nicho não-oficial em escala: farm de sessões shardada — N workers, lease por
    sessão, estado em Redis/DB, 1 worker cai = só as sessões dele remanejam]
```

**Tradução honesta pro HBX ($):** metade disso o HBX **já tem em embrião** — outbox durável (S2),
freio por chip (S3), telemetria (S1), esqueleto Cloud API no backend (`/webhooks/whatsapp` +
verify Meta já existem em `messaging.controller.ts`). O que NÃO faz sentido copiar no VPS único:
Kafka, k8s, multi-região (custo >> retorno com 4 chips; Postgres dá conta — decisão do GATEWAY-WA
S0 mantida). O que faz sentido e falta: **porta fechada, espinha durável LIGADA, fonte única de
estado, freio LIGADO, observabilidade mínima e a ROTA pronta pro canal oficial** (hedge anti-ban:
chip de cliente pagante banido → religa no oficial em horas, não semanas).

## Sprints (ordem por $ e risco — cada `.md` é autocontido)

| # | Sprint | Dor que mata | Depende de |
|---|---|---|---|
| [1](WEBWHATS-ARQ3-sprint-1-porta-fechada.md) | Porta fechada + BigInt publicado | P0 exposição pública; overflow latente | — |
| [2](WEBWHATS-ARQ3-sprint-2-espinha-duravel.md) | Espinha durável ON (consumer→matar polling) | bot mudo pós-deploy | 1 (motor são) |
| [3](WEBWHATS-ARQ3-sprint-3-fonte-unica-estado.md) | Fonte única do estado de conexão | "Conectado fantasma" e família | 2 (eventos fluem) |
| [4](WEBWHATS-ARQ3-sprint-4-freio-anti-ban.md) | Freio de envio ON + orçamento por chip | ban = receita morta | 2 |
| [5](WEBWHATS-ARQ3-sprint-5-fatiar-god-classes.md) | Fatiar god-classes (strangler) | velocidade/risco de manutenção | 2 estável |
| [6](WEBWHATS-ARQ3-sprint-6-dieta2-observabilidade.md) | Dieta fase 2 + métricas de frota | superfície + cegueira operacional | 5 (desacople) |
| [7](WEBWHATS-ARQ3-sprint-7-canal-oficial.md) | Canal oficial (Cloud API) como hedge | dependência total do não-oficial | — (paralelo) |

## Guardrails INEGOCIÁVEIS (herdados do GATEWAY-WA S0 + CLAUDE.md)

- Chip banido não tem `git revert`. Conexão/reconexão SÓ em número descartável meu.
- Disjuntor intocável em lógica; derrubar chip só via `disconnectCompanySession`.
- 1 número = 1 conexão; fonte da verdade = motor ao vivo.
- Todo sprint no motor passa `cd Webwhats && npm run typecheck` (publish roda estrito).
- Nenhuma migração/deploy/flag na VPS sem ordem explícita do dono.
- Trabalho paralelo do dono no working tree é sagrado (regra 18/06).

## Decisões mantidas (não reabrir)
- NÃO reescrever o motor do zero; NÃO Kafka/RabbitMQ/Redis-Streams; NÃO containerizar o motor;
  NÃO mexer no modelo `company-{id}-user-{n}`. (GATEWAY-WA S0, continuam válidas.)
- Novo neste plano: NÃO adotar Cloud API como substituto big-bang — é HEDGE + rota de migração
  seletiva (S7); Baileys continua o canal barato enquanto o freio + disjuntor seguram o risco.
