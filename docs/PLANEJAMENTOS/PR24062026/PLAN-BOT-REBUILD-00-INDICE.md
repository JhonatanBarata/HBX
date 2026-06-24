# PLAN-BOT-REBUILD-00 — Índice + contrato (rebuild do Construtor de Bot)

Rebuild da tela `/bot` (escopo: tipo **Atendimento**) numa experiência "tipo jogo": tela dividida, organograma
que se monta ao vivo, botões que se adaptam ao canal (QR×Meta) e um castelo de variáveis que desliza da direita.

**Paralelismo:** 4 peças isoladas (A backend, B/C/D componentes novos) rodam ao MESMO tempo em arquivos
disjuntos; depois a etapa **E (integração)** costura tudo no `bot/page.client.tsx`. Cada worker lê ESTE índice
(contrato) + o seu `.md`.

## Backend já serve os dados (não recriar)
`backend/src/inbox/atendimento-config.ts`:
- `DEFAULT_VARIABLE_CATALOG` → `variableCatalog: { key, label, example, description, scope:'shared'|'atendimento'|'recovery', required }[]`
  (`{{cliente}}`, `{{empresa}}`, `{{cumprimentacao}}`, `{{valor_formatado}}`, `{{funcionario}}`, `{{agenda_nome}}`, `{{agenda_slots}}`).
- `DEFAULT_ACTION_CATALOG` → `actionCatalog: { actionId, title, description, route, kind, enabled, responseMessage?, agendaGroupId? }[]` (16 ações).
- Capacidades de canal: `getProviderCapabilities` / `resolveProviderCapabilitiesFromCompany(company)` →
  `EVOLUTION.canUseOfficialButtons=false` (QR), `META.canUseOfficialButtons=true`.
GET `/inbox/bot-config` (`inbox.service.ts:2270 getBotConfigByCompanyId`, `:5260 getBotConfig`) já devolve a config
sanitizada por `sanitizeAtendimentoBotConfigForTenant` (seta `setup.provider`).

## Contrato (tipos que as peças trocam)
- `BotConfig` (front, em `bot/page.client.tsx`): `welcomeMessage, returningCustomerMessage, mainMenuPrompt,
  postActionPrompt, humanAckMessage, closeTopicMessage, blockedMessage`, grupos de botões
  `welcomeButtons, mainMenuButtons` (e os demais do backend), `routingRules`, `actionCatalog`,
  **`variableCatalog`** (a adicionar no tipo do front), **`setup.provider`** + **`providerCapabilities`** (Parte A).
- `BotButton = { buttonId, actionId, title, nextNodeId? }`.
- `BotAction = { actionId, title?, description?, route?, kind?, enabled? }`.
- `VarDef = { key, label, example, description, scope, required }`.
- `providerCapabilities = { provider:'evolution'|'meta', canUseOfficialButtons: boolean }`.
- Campos de mensagem (fases): welcomeMessage, returningCustomerMessage, mainMenuPrompt, postActionPrompt,
  humanAckMessage, closeTopicMessage, blockedMessage.

## Mapa de donos de arquivo (NÃO invadir o do outro)
| Peça | Arquivos (cria/edita) |
|---|---|
| **A** backend | `backend/src/inbox/inbox.service.ts` (`getBotConfigByCompanyId`), `inbox.controller.ts` |
| **B** organograma | `frontend/src/components/hbx/bot-flow-canvas.tsx`, `frontend/src/app/hbx-theme/bot-flow.css` |
| **C** botões | `frontend/src/components/hbx/bot-buttons-editor.tsx`, `frontend/src/app/hbx-theme/bot-buttons.css` |
| **D** variáveis | `frontend/src/components/hbx/bot-variables-drawer.tsx`, `frontend/src/app/hbx-theme/bot-variables.css` |
| **E** integração | `frontend/src/app/(app)/bot/page.client.tsx` + registrar imports dos 3 CSS no tema |

**Ninguém** (exceto E) toca `page.client.tsx`, `screens.css`, `kit.css`. CSS de cada peça vai no seu `bot-*.css`.

## Leis (todas as peças)
5 Leis do Design System: cor/borda/sombra/fonte/radius só por token/classe central (`frontend/src/app/hbx-theme/`),
**zero `#hex`/inline color** (`npm run lint` roda `check-pele.mjs` e reprova). Inline só layout puro. Ler
`docs/Rules/FRONTEND.md`. Não publicar (deploy é do dono). Reportar no fim: arquivos + props expostas + como reverter.
