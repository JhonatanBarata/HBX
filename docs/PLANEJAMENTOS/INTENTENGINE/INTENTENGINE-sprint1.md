# INTENTENGINE — Sprint 1: motor de intenção único + log de decisão

> Plano auto-contido pra retomar em chat novo. Editar código = subagente Sonnet (1 por .md);
> Opus planeja. Arquitetura INTENTENGINE = 5 sprints, este é o 1º (pré-requisito dos demais).
> Ordem: 1 motor único → 2 NLU atendimento → 3 config versionada → 4 outbox → 5 pipeline.

## Objetivo
Um único motor de intenção (`IntentEngine`) consumido por todos os fluxos, com log
persistente de cada decisão. Mata a duplicação do pipeline de prospecção e cria o
dataset real (texto → rótulo → fonte ia/keyword) que decide upgrade de modelo/GPU
com dados em vez de achismo.

## ESTADO ATUAL (verificado 01/07/2026)
- `backend/src/vendas/ai-intent-classifier.service.ts` — `AiIntentClassifierService`
  (`classifyIntentWithFallback`: IA → fallback keyword). Módulo leaf. FUNCIONA — não reescrever.
- Call-sites:
  - `backend/src/messaging/messaging.service.ts` ~3016 (`handleVendasAutomationInbound`) —
    **caminho VIVO de produção** (inbound real). Tem testes em `messaging.service.test.ts`.
  - `backend/src/vendas/vendas-automation.service.ts` ~1874 (`simulateProspectingForUser`,
    sandbox `/bot`) — vivo, é o simulador do painel.
  - `backend/src/vendas/vendas-automation.service.ts` ~4359 (`classifyProspectingInbound`) —
    **CÓPIA MORTA**: nenhum caller de produção (verificado por grep em todo backend/src;
    só `vendas-automation.service.test.ts` chama). Pipeline quase idêntico ao de messaging
    ~3016. Risco: correção aplicada numa cópia e não na outra.
- Decisão de cada classificação NÃO é persistida de forma estruturada (só logWhatsAppEvent).

## O QUE FAZER (em ordem)
1. Criar `backend/src/bot/intent/intent-engine.service.ts` + `intent-engine.module.ts`
   (módulo leaf, mesmo padrão do atual). O engine ENVELOPA `AiIntentClassifierService`
   (mover o arquivo pra `backend/src/bot/intent/` junto; ajustar imports nos consumidores).
   API pública idêntica (`classifyIntentWithFallback` drop-in) + novo param opcional
   `context: { companyId, conversationId?, flow: 'prospeccao'|'atendimento'|'simulador' }`.
2. Migration Prisma: tabela `IntentDecision`
   (`id, companyId, conversationId?, flow, textPreview (≤200 chars), source ('ai'|'keyword'),
   label, confidence, latencyMs?, model?, createdAt`). Índice `(companyId, createdAt)`.
   Persistir best-effort (falha no insert NUNCA quebra a classificação — try/catch e segue).
3. Trocar os 2 call-sites vivos (messaging ~3016 e vendas-automation ~1874) para o engine,
   passando `flow`. Comportamento de classificação 1:1 — mesmo retorno, mesma ordem de decisão.
4. DELETAR `classifyProspectingInbound` (vendas-automation ~4359 até o fim do método) e
   migrar os cenários de teste ÚNICOS de `vendas-automation.service.test.ts` (~977, ~1003)
   para testes do caminho vivo (`messaging.service.test.ts`, `handleVendasAutomationInbound`).
   Antes de deletar: diff manual das duas cópias — se a cópia morta tiver alguma regra que a
   viva não tem, PARAR e reportar ao dono (pode ser correção que se perdeu).
5. Grep final: zero referências à cópia morta; zero imports quebrados de `vendas/ai-intent-*`.

## GUARDRAILS
- Fallback keyword INTOCADO (`classifyProspectingIntent` em `prospecting-safety.ts` não muda).
- Flags/envs atuais (`HBX_LLM_CLASSIFIER_*`) continuam valendo sem rename — VPS já as usa.
- Nenhuma mudança em conexão de chip. Nada de teste em chip real.
- Migration nova → conferir aplicação no VPS no publish (pendência conhecida: migrations
  não conferidas automaticamente; ver HANDOFF-continuar.md do PR30062026).

## PRONTO QUANDO
- `backend/node_modules/.bin/tsc.cmd -p backend/tsconfig.json --noEmit` = 0 erros.
- Testes de `messaging.service.test.ts` e `vendas-automation.service.test.ts` verdes.
- `IntentDecision` recebendo linhas no fluxo real (validar em dev com flag ligada).
- Cópia morta deletada; simulador `/bot` do painel respondendo igual antes.
