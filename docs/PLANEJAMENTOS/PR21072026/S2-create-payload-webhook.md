# S2 — Embutir webhook no payload do /instance/create (mata a classe do bug)

## Contexto
Incidente 20/07: instância recriada nasce SEM webhook porque `buildSessionCreatePayload`
(backend/src/companies/whatsapp-modal.service.ts:~2507) manda só
`{ instanceName, qrcode, integration, number? }`, e o set separado pode ser engolido/falhar.
O motor Evolution ACEITA webhook no create: `Webwhats/src/api/controllers/instance.controller.ts`
(~linha 88) chama `eventManager.setInstance(instanceName, instanceData)` →
`Webwhats/src/api/integrations/event/event.manager.ts` (~122-133) → `webhook.set()` (upsert).
Instância nascendo COM webhook elimina a dependência da segunda chamada.

## Pré-requisito OBRIGATÓRIO: verificar o shape exato no motor
Antes de editar o backend, leia no motor (READ-ONLY, NÃO edite o Webwhats):
1. `Webwhats/src/api/integrations/event/event.manager.ts` — método `setInstance`: qual chave ele
   lê do body (`webhook`? `data.webhook`?) e que campos repassa (url/enabled/events/byEvents/base64/headers).
2. O DTO/validação do create (`Webwhats/src/api/dto/instance.dto.ts` ou schema equivalente
   referenciado pelo `instance.controller.ts` no POST /instance/create) — confirmar que `webhook`
   é aceito no body e o nome exato dos subcampos (em Evolution v2 costuma ser
   `webhook: { url, byEvents, base64, headers, events }`).
3. `Webwhats/src/api/integrations/event/webhook/webhook.controller.ts` — método `set`: como os
   campos são gravados (mapeamento byEvents→webhookByEvents etc.).
Anote no relatório o shape confirmado com arquivo:linha. Se o create do motor NÃO aceitar webhook
(hipótese refutada), PARE e relate — não improvisar.

## Mudança (backend/src/companies/whatsapp-modal.service.ts)
⚠️ Arquivo tem byte NUL ~offset 78644 — Grep/ripgrep para no meio; use `grep -a` ou Read por faixa.

Em `buildSessionCreatePayload` (~2507), incluir o webhook quando houver URL:
```ts
const webhookUrl = this.buildProviderWebhookUrl();
if (webhookUrl) {
  payload.webhook = {
    // usar o shape CONFIRMADO no pré-requisito; referência do set atual:
    // buildProviderWebhookPayload (~2703): { enabled, url, events, byEvents, base64 }
  };
}
```
Reusar `this.buildProviderWebhookUrl()` e `this.buildProviderWebhookEvents()` — NÃO duplicar
listas de eventos nem URL. Se o shape do create divergir do shape do /webhook/set (ex.: sem
`enabled`), montar o objeto conforme o create espera.

MANTER o `tryConfigureProviderWebhook` pós-create como está (S1 já o endureceu) — vira redundância
defensiva (set+validate), não substituição.

## Proibições
- NÃO editar nada em Webwhats/ (motor) — leitura apenas.
- NÃO criar branch, NÃO commitar, NÃO publicar.
- NÃO alterar `createProviderInstanceForPairing`/fluxos além do payload builder.

## Gate
`cd backend && npx tsc -p tsconfig.json --noEmit` limpo. Relatório: shape confirmado (arquivo:linha
do motor), diff do backend, typecheck.
