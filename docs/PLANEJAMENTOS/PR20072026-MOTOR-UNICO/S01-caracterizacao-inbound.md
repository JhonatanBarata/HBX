# S01 — Testes de caracterização do pipeline inbound ⚠

**Fase 0 · Worker: Sonnet · Depende de: nada · Revisão adversarial: SIM**

## Objetivo
Congelar em teste o comportamento ATUAL da decisão "quem responde um inbound humano" antes de
qualquer refatoração. Estes testes são o contrato que S06/S10 têm que manter verde SEM alteração.

## Contexto mínimo
`backend/src/messaging/messaging.service.ts:10040-10169` decide, nesta ordem, para inbound humano válido:
1. `commercialContactControl.interruptForInbound(...)` — sempre (idempotente por messageId).
2. `dispatchCadenciaInbound(...)` — dispara gatilhos (fire-and-forget).
3. `conversationAssistant.prepareReply(...)` — SÓ se `isValidHumanInbound && !recoveryCustomer`.
   Se `handled:true` (mesmo duplicate/failed), retorna `source:'conversation_assistant'` e NÃO cai no atendimento.
4. `handleAtendimentoInbound(...)` — menu/recovery.

`conversation-assistant-runtime.service.ts` só responde se: flag `HBX_ASSISTENTE_PUBLISH_ENABLED` on,
`AssistenteConfig.published`, `company.botArmedAt` setado, conversa `botActive===true` e `humanAssigned!==true`.
Claim único por `inboundMessageId` (P2002 → duplicate).

## Arquivos
- CRIAR `backend/src/automation/characterization/inbound-precedence.test.ts`
- CRIAR `backend/src/automation/characterization/assistant-claim.test.ts`
- EDITAR `backend/package.json` — adicionar script `test:automation` no padrão da casa
  (`npm run build && node --test dist/automation/characterization/*.test.js` — listar arquivos explícitos como os outros scripts).

## Tarefas
1. Estudar como os testes vizinhos mockam Prisma/serviços: `backend/src/assistente/conversation-assistant-runtime.service.test.ts` e `backend/src/cadencia/cadencia-gatilho.service.test.ts`. Seguir o MESMO estilo (node:test + mocks manuais), sem framework novo.
2. `inbound-precedence.test.ts` — casos mínimos (todos SEM tocar rede/WhatsApp):
   a. Assistente publicado+armado+botActive → assistente responde; atendimento NÃO é chamado.
   b. Assistente `handled:true duplicate:true` → atendimento NÃO é chamado (sem resposta dupla).
   c. Assistente não publicado → cai no atendimento.
   d. `recoveryCustomer` presente → assistente NEM é consultado; atendimento/recovery trata.
   e. Inbound não-humano (auto-reply de prospecção classificado) → nem cadência nem assistente.
   f. `interruptForInbound` é chamado ANTES de qualquer resposta, com o messageId certo.
3. `assistant-claim.test.ts`: claim P2002 → `{handled:true, duplicate:true}`; conversa `humanAssigned:true` → `handled:false`; sem `botArmedAt` → `handled:false`.
4. Se o trecho 10040-10169 estiver enterrado num método gigante não-testável isoladamente, é PERMITIDO extrair o trecho para um método `resolveInboundAutomation(...)` no MESMO service (mudança mecânica, zero lógica nova) para dar ponto de apoio ao teste. Nada além disso.
5. Rodar `cd backend && npm run test:automation` até verde.

## Critérios de aceite
- Os 2 arquivos de teste passam; cobrem no mínimo os 9 casos acima.
- `npm run build` verde. Nenhuma lógica de produção alterada (exceção: extração mecânica do item 4).
- Script `test:automation` registrado.

## Proibições
- Não alterar comportamento. Não mockar "por cima" do que se quer provar (mock só nas bordas: prisma, conversations, whatsapp).
- Não tocar `Webwhats/`.

## DoD
Commit local: `feat(automation): S01 — testes de caracterização do pipeline inbound`
