# HUB-INTEGRACOES — SPRINT 5: Um cofre, um portão (gateway de webhooks + contract dos segredos)

> Arquitetura nº12 — Hub de Integrações. Última da série: depende das Sprints 1 (ledger/resolvedor),
> 3 (contrato de adapter com `verifyWebhook`) e 4 (broker).

## Objetivo

Fechar o ciclo: todo webhook entra por um portão só (assinatura → ledger → fila → 200 rápido) e todo
segredo vive num cofre só (`IntegrationConnection` cifrada). Os 4 padrões de guarda viram 1.

## Fatos verificados

- 5 controllers de webhook hoje, cada um com sua lógica: `webhooks/mercadopago` (hbx-recovery),
  `webhooks/mercadopago/financeiro`, `webhooks/meta/leadgen`, `webhooks/whatsapp*` e
  `webhooks/webwhats/events` (messaging).
- Cofres de segredo: (1) `IntegrationConnection.secretCiphertext` cifrado; (2) `MetaLeadConnection.
  accessTokenCiphertext` cifrado próprio; (3) `Company.whatsappAccessToken` / `mercadoPagoAccessToken`
  texto plano; (4) `masterGlobalIntegrationConfig.mercadoPagoLibrary` / `whatsappLibrary` JSON plano.
- Inventário de migração já documentado e nunca executado:
  `backend/src/integrations/company-secret-inventory.ts`.

## Tarefas

1. **Gateway único `POST /webhooks/:provider`:** corpo cru preservado → `verifyWebhook` do adapter
   (registry da Sprint 3) → `recordReceived` no ledger → grava job (tabela `IntegrationJob`:
   id, provider, eventId, payloadJson, status, tentativas) → responde 200. Worker `setInterval`
   processa a fila com retry/backoff e teto (padrão do projeto, sem Redis).
   - **URLs antigas NÃO somem:** MP e Meta têm URL registrada no painel deles; os controllers atuais
     viram wrappers finos que delegam ao pipeline do gateway. Trocar URL no painel dos provedores é
     ação à parte, do dono, sem pressa.
   - **Webwhats/WhatsApp fica FORA desta sprint** — mensageria tem regras próprias (chips) e não entra
     no gateway sem decisão explícita do dono.
2. **Contract dos segredos (fecha o expand da Sprint 1):**
   - Migração de dados: `Company.mercadoPagoAccessToken` / `whatsappAccessToken` e bibliotecas master
     planas → `IntegrationConnection` cifrada (ou campo cifrado master, no caso da biblioteca).
   - Código: toda leitura passa pelo resolvedor unificado; grep-gate no repo — zero leitura direta de
     `Company.*AccessToken` fora do resolvedor (exceção: escrita legada durante o expand).
   - Migration final: colunas planas dropadas SÓ depois de ciclo completo em produção sem leitura
     legada (log de `source` do resolvedor comprova).
3. **`MetaLeadConnection`:** passa a decriptar via broker (Sprint 4) — mesmo cofre, mesma chave com
   rotação; avaliar se vira `IntegrationConnection` provider META ou mantém tabela com segredo
   unificado.

## Critérios de aceite

- Webhook MP/Meta entregue na URL antiga e na nova produz o MESMO efeito, com ledger em ambas.
- Fila: job com falha reprocessa com backoff e para no teto (disjuntor).
- Grep-gate verde: nenhuma leitura direta de segredo plano fora do resolvedor.
- Dropar coluna só com evidência de zero leitura legada (métrica/log de source).
- `cd backend && npx tsc --noEmit` verde.

## Guardrails

- VPS = Mercado Pago LIVE: migração de segredo é expand/contract com leitura dupla — NUNCA big-bang.
- Mudar `env_file`/env no VPS = RECREATE do container (regra INFRA).
- Webwhats intocado.
