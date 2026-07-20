# S10 — Runtime conversacional lê AutomationAgent (flag) ⚠

**Fase 2 · Worker: Sonnet · Depende de: S06, S09 · Revisão adversarial: SIM**

## Objetivo
O runtime que responde cliente passa a ler `AutomationAgent` — atrás da flag
`HBX_AUTOMATION_AGENT` (default OFF). Com a flag OFF, NADA muda (caminho legado intacto).
É o coração da fusão: 1 config, 2 cérebros, mesma precedência.

## Arquivos
- EDITAR `backend/src/automation/inbound-router.service.ts`
- EDITAR `backend/src/assistente/conversation-assistant-runtime.service.ts` (fonte de config parametrizada)
- EDITAR `backend/src/automation/agent.service.ts` (S05 passa a ler/gravar AutomationAgent quando flag on)
- CRIAR `backend/src/automation/agent-runtime.resolver.ts` (+ test) — decide a config efetiva
- EDITAR `backend/package.json` (test)

## Tarefas
1. `AgentRuntimeResolver.effectiveFor(companyId)`: flag ON e AutomationAgent existe → devolve
   `{source:'agent', brain, config}`; senão → `{source:'legacy'}` e o runtime segue EXATAMENTE o
   caminho atual (AssistenteConfig/BotConfig). TODO ponto de leitura de config conversacional do
   router passa pelo resolver.
2. Com agent ativo: brain `'ia'` → `conversation-assistant-runtime` recebe a config do agent
   (nome/tom/fluxo) em vez de ler AssistenteConfig direto — parametrizar a origem SEM alterar
   claim/guards (`published`→`agent.published`, `botArmedAt`, `botActive`, `humanAssigned` idênticos).
   Brain `'roteiro'` → assistente não participa; atendimento de menu segue como hoje, mas a config
   do menu vem do `roteiroJson` do agent (parametrizar a origem no ponto ÚNICO onde o handler de
   atendimento carrega o bot-config; fallback legado se agent sem roteiro).
3. `AgentService` (S05): flag ON → GET/PUT/publish/sandbox leem e gravam AutomationAgent
   (dual-write opcional nos stores antigos NÃO — write só no novo; leitura legada é fallback).
4. Testes: flag OFF → zero diferença (testes S01 verdes). Flag ON + brain ia → responde com config
   do agent. Flag ON + brain roteiro → assistente não reivindica; menu usa roteiro do agent.
   Flag ON sem agent na empresa → legado (empresa não migrada não quebra).
5. Rodar TODOS os testes de automation + assistente + build.

## Critérios de aceite
- `HBX_AUTOMATION_AGENT` ausente/off → comportamento byte-a-byte igual (S01 é o juiz).
- Flag ON: 1 config manda nos 2 cérebros; guards e claim intocados.

## Proibições
- Não remover leitura legada (é o fallback até S20). Não ligar a flag em nenhum env por default.

## DoD
Commit local: `feat(automation): S10 — runtime lê AutomationAgent atrás de flag`
