# Arq. nº11 — Ingestão Externa de Leads — Sprint 1: nenhum lead pago se perde

Data do plano: 01/07/2026 · Código-base: `backend/src/meta-lead-ads/` · Depende de: nada · Destrava: Sprint 2

## Contexto (auditado no código em 01/07/2026)
O canal Meta Lead Ads recebe webhook em `/webhooks/meta/leadgen`, busca o lead na Graph API e cria
card no CRM via `VendasService.intakeAdvertisingLead`. A base é boa (HMAC fail-closed + timing-safe,
`rawBody: true` confirmado em `main.ts:139`, ledger de idempotência, token cifrado, dedup oficial do CRM).
O problema é o destino da falha:

- `processLeadgenChange` devolve `'skipped'` em falha transitória (Graph caiu, token venceu, sem responsável)
  e a linha do ledger fica `received` pra sempre — `meta-lead-ads.service.ts:121-190`.
- Resposta é SEMPRE 200 → o Meta não reenvia. `ExternalWebhookEvent` guarda só `payloadHash`
  (`schema.prisma`, model `ExternalWebhookEvent`) → replay impossível. Sem retry, sem reconciliação.
- Fetch na Graph roda SÍNCRONO dentro da requisição do webhook, em loop lead a lead.
- **Furo de onboarding (não estava na análise original): nenhum código chama
  `POST /{page-id}/subscribed_apps`.** Cadastrar pageId+token no admin NÃO faz o Meta mandar evento —
  hoje exige passo manual fora do app (Graph Explorer). Grep em todo o backend: zero ocorrências.
- `markRejected` do ledger existe e nunca é usado → assinatura inválida não deixa rastro.
- Corrida: `wasProcessed` é checado antes de `recordReceived` e o flag `duplicate` retornado por
  `recordReceived` é ignorado → duas entregas simultâneas do mesmo `leadgen_id` podem passar ambas
  (o dedup por telefone do CRM segura o estrago, mas é sorte, não desenho).

## Por que este sprint é o primeiro ($)
Lead de anúncio é o lead mais caro do sistema — o cliente pagou CPL ao Meta por ele. Skip silencioso =
dinheiro do cliente queimado sem ninguém saber = churn. Este sprint transforma "quase nunca perde"
em "não perde": tudo que entra ou é processado, ou está numa fila visível com retry, ou está em
dead-letter reprocessável — e o que nem chegou é pescado pela reconciliação (o Meta retém leads 90 dias).

## Escopo IN
1. **Migration** em `ExternalWebhookEvent`: `payload Json?`, `attempts Int @default(0)`,
   `nextRetryAt DateTime?`, `lastError String?`. `status` passa a usar também `retry` e `dead_letter`.
2. **Webhook só recebe**: verificar HMAC → extrair changes → `recordReceived` com payload COMPLETO
   (+ companyId se a conexão resolver) → 200. Nenhuma chamada à Graph dentro da requisição.
3. **Worker assíncrono** (`meta-lead-ads.worker.ts`, `@Cron` a cada 30s, sem Redis/Bull — volume não pede):
   claim atômico de lote (ex.: 20) de eventos `received`/`retry` com `nextRetryAt <= now` via
   `updateMany` condicional (seguro se um dia houver réplica). Processa com a lógica atual
   (fetch Graph → map → intake). Falha transitória → `attempts+1` + backoff exponencial
   (1min, 5min, 30min, 2h, 12h) → teto 8 tentativas → `dead_letter` + `lastError` + `touchConnectionError`.
   Sucesso → `markProcessed`.
4. **Assinatura inválida** → registrar com `markRejected` (eventId = hash do payload). Observabilidade de ataque/misconfig.
5. **Fechar a corrida**: usar o retorno de `recordReceived` — `duplicate === true` encerra como duplicata.
6. **Reconciliação diária** (`@Cron` 1x/dia, por conexão ativa): `GET /{pageId}/leadgen_forms` →
   `GET /{formId}/leads` (janela 72h) → todo lead sem linha `processed` no ledger vira evento
   `received` com `eventType: 'reconciliation'` e cai na fila do worker. É a rede de segurança.
7. **Assinar a página no webhook**: endpoint admin `POST /integrations/meta/connections/:id/subscribe-webhook`
   → `POST /{pageId}/subscribed_apps` com `subscribed_fields=['leadgen']` usando o token da conexão +
   `GET` de conferência. Novo campo `webhookSubscribedAt DateTime?` em `MetaLeadConnection`.

## Escopo OUT (sprints seguintes)
Notificação ao vendedor e tela admin (Sprint 2) · generalização multi-canal (Sprint 3) · CTWA e painel de intake (Sprint 4).

## Arquivos
- `backend/src/meta-lead-ads/meta-lead-ads.service.ts` — separar "receber" de "processar"
- `backend/src/meta-lead-ads/meta-lead-ads.worker.ts` — NOVO (cron de retry + reconciliação)
- `backend/src/meta-lead-ads/meta-graph.client.ts` — + `listForms`, `listLeads`, `subscribePage`
- `backend/src/integrations/external-webhook-ledger.service.ts` — + payload/attempts/claim de lote
- `backend/prisma/schema.prisma` + migration
- `backend/src/meta-lead-ads/meta-lead-ads-admin.controller.ts` — + subscribe-webhook
- `backend/src/meta-lead-ads/meta-lead-ads.service.test.ts` — cobrir retry, dead-letter, corrida, reconciliação

## Checks e deploy
- `cd backend && npm run typecheck` + testes node do módulo.
- Migration aplicada LOCAL antes de qualquer teste manual.
- **VPS**: conferir migrations aplicadas no deploy (aprendizado 30/06 — já houve migration pendurada) e
  presença de `META_APP_SECRET` / `META_VERIFY_TOKEN` no env. Fail-closed: sem elas o canal parece vivo
  mas descarta 100% em silêncio.

## Critérios de aceite
1. Graph mockada fora do ar → evento vai a `retry`; Graph volta → card criado sem intervenção.
2. 8 falhas seguidas → `dead_letter` com `lastError` e conexão marcada com erro.
3. Reentrega do mesmo `leadgen_id` (inclusive concorrente) → zero card duplicado.
4. Lead que nunca chegou por webhook aparece via reconciliação em ≤24h.
5. `subscribe-webhook` deixa a página assinada (conferível no `GET /{pageId}/subscribed_apps`).
