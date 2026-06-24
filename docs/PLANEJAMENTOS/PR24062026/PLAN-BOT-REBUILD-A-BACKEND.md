# PLAN-BOT-REBUILD-A — Backend: expor capacidade do canal + garantir catálogos

Ler `PLAN-BOT-REBUILD-00-INDICE.md` (contrato). Peça **independente** (backend só). Aditivo, reversível, sem migration.

## Objetivo
O GET `/inbox/bot-config` precisa entregar ao front, de forma explícita, **se a conexão da empresa permite botão
interativo (Meta) ou não (QR)** — hoje o front teria que adivinhar pelo `setup.provider`. E garantir que
`actionCatalog`/`variableCatalog` sempre venham preenchidos (o "Ação vazio" do front não pode ter origem no backend).

## O que fazer
1. Em `getBotConfigByCompanyId` (`backend/src/inbox/inbox.service.ts:2270`): além da config sanitizada, anexar no
   payload de resposta `providerCapabilities: { provider, canUseOfficialButtons }` resolvido por
   `resolveProviderCapabilitiesFromCompany(company)` (já existe em `inbox/atendimento-config.ts`). Buscar o
   `company.whatsappConnectionMode` na query que já carrega a empresa (incluir no select se faltar).
2. Confirmar que a resposta inclui `actionCatalog` (não-vazio — `normalizeActionCatalog` parte do DEFAULT, então
   nunca é `[]`) e `variableCatalog`. Se algum não estiver sendo serializado, garantir que está.
3. Não mudar regra de negócio nem a forma dos campos existentes — só **adicionar** `providerCapabilities`. O
   `sanitizeAtendimentoBotConfigForTenant` continua filtrando ações por provider/recovery (não duplicar isso).
4. `getBotConfig` (`:5260`) só repassa — garantir que o novo campo chega ao controller (`inbox.controller.ts:93 @Get('bot-config')`).

## Aceite
- GET `/inbox/bot-config` responde com `providerCapabilities.canUseOfficialButtons` correto: empresa em modo OFFICIAL → `true`; QR/evolution → `false`.
- `actionCatalog` e `variableCatalog` presentes e não-vazios.
- `cd backend && npm run prisma:validate && npm run build` verdes. Testes do inbox que existirem continuam passando.

## Reverter
`git checkout HEAD -- backend/src/inbox/inbox.service.ts backend/src/inbox/inbox.controller.ts`.
