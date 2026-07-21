# S3 — Reconciler: detectar e curar instância `open` sem webhook

## Contexto
Incidente 20/07: instância `open` sem linha `Webhook` fica muda PARA SEMPRE — nenhum cron/poll
verifica webhook depois que a instância conecta. Este sprint adiciona o guard: quando o reconciler
central olhar uma instância `open`, conferir (throttled) se o webhook existe e está certo; se não,
logar ALTO e reconfigurar via fluxo existente.

## Arquivo
`backend/src/companies/whatsapp-modal.service.ts` (único).
⚠️ Byte NUL ~offset 78644 — Grep/ripgrep para no meio; use `grep -a` ou Read por faixa de linhas.
⚠️ S1 e S2 já mexeram neste arquivo nesta sessão — leia o estado ATUAL antes de editar
(em particular: `tryConfigureProviderWebhook` agora só carimba cooldown no sucesso, com retry
de falha curto; `resetProviderInstanceForPairing` limpa o carimbo).

## Onde ancorar
`reconcileSessionAgainstProvider` (~linha 725; comentário PR4-F3 diz "só corrige status no banco").
Ele já roda throttled por `providerReconcileCooldownMs` e já sabe o estado vivo da instância.
Adicionar, quando o estado vivo for `open`/`connected`:

```ts
void this.ensureProviderWebhookHealthy(tenantKey); // fire-and-forget, nunca bloquear o reconcile
```

## Novo método `ensureProviderWebhookHealthy(tenantKey)`
- Throttle próprio: `private readonly recentWebhookHealthCheckAt = new Map<string, number>();`
  + `private readonly webhookHealthCheckCooldownMs = 5 * 60 * 1000;` (5 min por tenant — o find é
  barato mas não precisa rodar a cada status poll). Declarar junto dos outros cooldowns (~197).
- Fluxo:
  1. Dentro do cooldown → return silencioso.
  2. Carimbar o cooldown do health-check (aqui PODE carimbar antes — é só leitura).
  3. `GET /webhook/find/{tenantKey}` via `requestProviderDiagnostic` (mesmo helper que
     `tryConfigureProviderWebhook` usa, ~2908).
  4. Validar com `validateProviderWebhookSettings` (já existe, ~2852) contra
     `buildProviderWebhookUrl()` + `buildProviderWebhookEvents()`.
  5. Se 404/linha ausente/inválida/mismatch:
     `this.logger.error('Webhook WebWhats AUSENTE em instancia open instance=... — reconfigurando (incidente-20-07)')`
     (error, não warn — esse é o sinal de detecção de regressão) e chamar
     `await this.tryConfigureProviderWebhook(tenantKey, 'reconcile')`.
     Antes de chamar, `this.recentWebhookConfigureAt.delete(tenantKey)` — a cura não pode ser
     engolida pelo cooldown (é exatamente o bug original).
  6. Qualquer erro do find (transiente/timeout): warn e return — nunca propagar; o reconcile de
     status não pode quebrar por causa do guard.
- `'reconcile'` entra como novo valor de `reason` — conferir se `reason` é tipado (union) e, se
  for, adicionar o literal.

## Proibições
- NÃO mexer no fluxo de socket/conexão (nada de connect/restart/logout dentro do guard).
- NÃO criar branch, NÃO commitar, NÃO publicar. NÃO tocar no Webwhats/.
- O guard NUNCA pode lançar exceção para fora nem atrasar o reconcile (sempre fire-and-forget
  com catch interno).

## Gate
`cd backend && npx tsc -p tsconfig.json --noEmit` limpo. Relatório: pontos de ancoragem
(arquivo:linha), diff, typecheck.
