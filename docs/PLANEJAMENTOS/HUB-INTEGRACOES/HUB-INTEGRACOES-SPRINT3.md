# HUB-INTEGRACOES — SPRINT 3: Fábrica de conectores (registry + engine genérico)

> Arquitetura nº12 — Hub de Integrações. Fazer ANTES do 3º conector — esse é o gatilho. Se não há
> 3º conector no radar comercial, esta sprint espera.

## Objetivo

Derrubar o custo marginal de conector novo de ~1,9k linhas copiadas + 4 pontos de toque no core para
~300 linhas (1 fetcher + 1 mapper). "Integra com seu ERP" é argumento de venda; o retorno desta sprint
é velocidade de fábrica.

## Fatos verificados

- AUVO + TagPlus somam 1.925 linhas sem testes (2.855 com), com run-lifecycle ~90% idêntico
  (`auvo.sync.service.ts` × `tagplus.sync.service.ts`: criar run, cursor since, loop, projeção,
  contadores, checkpoint JSON, finalização).
- Despacho hardcoded: `if provider === 'AUVO' / 'TAGPLUS'`
  (`backend/src/integrations/integration-connections.service.ts:304-355`).
- Tabela-espelho por provider: `AuvoExternalRecord` exigiria N tabelas + N migrations para N conectores.
- `unwrapListPayload` com ~25 shapes candidatos (`backend/src/integrations/auvo/auvo.client.ts:46-124`)
  — adivinhação de contrato; fica no adapter, nunca no engine.

## Tarefas

1. **Contrato `IntegrationProviderAdapter`** (novo `integration-adapter.types.ts`):
   `providerId`, `testConnection(creds)`, `streams` (ex.: `customers`, `receivables`, `tasks`) com
   `fetchPage(creds, stream, cursor)` e `mapRecord(stream, raw)` → projeção canônica; opcional
   `verifyWebhook(headers, rawBody)` (usado na Sprint 5).
2. **Registry por DI:** multi-provider Nest (token `INTEGRATION_ADAPTERS`) → `Map<providerId, adapter>`.
   `IntegrationConnectionsService.testByCompanyId/syncNowByCompanyId` despacham pelo registry; os
   `if provider ===` morrem. `INTEGRATION_PROVIDER_MODELS` continua como metadado de UI.
3. **`IntegrationSyncEngine`** (1 classe): extrai o run-lifecycle duplicado. Cursor persistido POR
   STREAM (tabela `IntegrationSyncCursor`: connectionId, stream, cursor, updatedAt) em vez de JSON de
   checkpoint. Reaper e regras de `lastSuccessAt` da Sprint 2 vivem aqui, num lugar só.
4. **`ExternalObject` genérico:** (companyId, connectionId, objectType, externalId, payloadJson,
   sourceUpdatedAt, unique(connectionId, objectType, externalId)). Expand/contract de
   `AuvoExternalRecord`: engine escreve nas duas, leitura migra, contract quando painel estiver lido
   da nova.
5. **Migrar AUVO e TagPlus** para o contrato — comportamento idêntico, testes atuais adaptados passam.

## Critérios de aceite

- Teste de fábrica: adapter fake registrado em teste roda sync completo SEM nenhuma alteração no core.
- Zero `if provider ===` em `integration-connections.service.ts`.
- Testes existentes de auvo/tagplus (client, mapper, integration.service) passam adaptados.
- `cd backend && npx tsc --noEmit` verde.

## Guardrails

- Refactor sem mudança de comportamento observável — diffs de payload/contadores nos testes.
- Não generalizar além do contrato: nada de "categoria unificada" estilo Merge; a projeção canônica
  `CustomerProfile`/`DebtCase` já é o teto certo de abstração.
