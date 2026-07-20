# S03 — Contrato técnico do motor único

**Fase 0 · Worker: Sonnet · Depende de: S01, S02 · Somente docs**

## Objetivo
Escrever o contrato que TODAS as sprints F1-F3 seguem: nomes, tipos, endpoints, flags e o mapa
de dependências atual. Evita cada worker inventar um vocabulário.

## Tarefas
1. Ler: `messaging.service.ts` (trechos inbound 10040-10169 e queueOutbound), `cadencia/*.ts`,
   `assistente/*.ts`, `bot/bot-activation.service.ts`, `vendas/vendas-automation.service.ts`
   (assinaturas públicas — não precisa ler as 4400 linhas), `modules/bot-armed.guard.ts`,
   INVENTARIO.md da S02, e o trecho de precedência congelado na S01.
2. CRIAR `docs/PLANEJAMENTOS/PR20072026-MOTOR-UNICO/CONTRATO.md` com:
   - **Mapa de dependências atual** (quem importa quem; onde cada motor pendura no messaging;
     todos os `sourceModule` de outbound existentes e quem os emite).
   - **Vocabulário alvo** (fixo): módulo backend `automation`; serviços `AgentService`,
     `InboundRouterService`, `OutboundOrchestratorService`, `EventRuleService`,
     `AutomationOverviewService`. Frontend: rota `/automacao`, seções `atendente`, `cobranca`,
     `prospeccao`, `regras` (gatilhos+rotinas).
   - **Contratos de API** (request/response TS) de: `GET /automation/overview`,
     `GET|PUT /automation/agent`, `POST /automation/agent/sandbox`, `POST /automation/agent/publish`,
     e os endpoints reaproveitados (cadencia/rotinas/gatilhos/prospecção) com seus paths atuais.
   - **Tipos do agente**: `AgentBrain = 'roteiro' | 'ia'`; shape do `roteiroJson` (campos atuais do
     BotConfig atendimento) e do `fluxoJson` (shape atual do assistente) — SEM inventar campos novos.
   - **Família de flags**: `HBX_AUTOMATION_AGENT` (S10), mapa velha→nova para S20
     (`HBX_ASSISTENTE_PUBLISH_ENABLED`→?, `HBX_CADENCIA_RUNNER_ENABLED`→?), com regra: flag velha
     continua lida como fallback até S20.
   - **Regras invioláveis** copiadas do README (porta única de saída, interrupt, claim, precedência).
3. Validar o contrato contra os testes da S01 (a precedência descrita = a testada).

## Critérios de aceite
- CONTRATO.md existe, sem ambiguidade de nome/rota/tipo; qualquer worker de F1-F3 consegue
  trabalhar sem reabrir esta discussão.

## DoD
Commit local: `docs(automation): S03 — contrato técnico do motor único`
