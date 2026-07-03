# INTENTENGINE — Sprint 5: pipeline de inbound em handlers (extração incremental)

> Plano auto-contido. Editar código = subagente Sonnet (1 por .md); Opus planeja.
> ÚLTIMO da fila por ser o mais caro e o de retorno mais indireto (redução de risco de
> regressão futura, não feature). Só começar com Sprints 1-2 no ar e estáveis.
> REGRA DE OURO: extração 1:1 — nenhum comportamento muda, nem log, nem ordem.

## Objetivo
O roteador de inbound deixa de ser um trecho de um arquivo de ~9,3 mil linhas e vira uma
cadeia explícita de handlers, um arquivo por etapa. Motivo de negócio: hoje qualquer
mudança no atendimento edita o mesmo arquivo onde moram os guards anti-ban que custaram
chips banidos em jun/26 — reduzir a superfície de cada mudança É o freio.

## ESTADO ATUAL (verificado 01/07/2026)
`backend/src/messaging/messaging.service.ts` — cascata real (ordem do código):
1. `processPersistedInbound` ~9000: guards (histórico webwhats >2min ~9042; startup
   guard pós-restart ~9067) → `handleAtendimentoInbound` → fallback recovery ~9117 →
   legado (session orchestrator + AutoReplyRule ~9135-9193).
2. `handleAtendimentoInbound` ~6588: contato pessoal → prospecção
   (`handleVendasAutomationInbound` ~6751) → globalBotEnabled ~6792 → agenda gate →
   recovery gates → FSM de botões (WELCOME/MAIN_MENU/RECOVERY_GATE/POST_ACTION/AGENDA/
   HUMAN/CLOSED).

## O QUE FAZER (1 handler por PR — nunca mais de um por vez)
Contrato comum: `InboundHandler.handle(ctx): Promise<{handled: boolean, result?}>` em
`backend/src/bot/pipeline/`. O `processPersistedInbound` vira o executor da cadeia.
Ordem de extração (do menos ao mais arriscado):
1. PR-1 `LegacyRulesHandler` — session orchestrator + AutoReplyRule (~9135-9193). Menor risco.
2. PR-2 `InboundGuardsHandler` — histórico + startup + contato pessoal. COPIAR, não
   "melhorar": esses guards são anti-ban comprovado.
3. PR-3 `RecoveryInboundHandler` — fallback recovery + gates de devedor.
4. PR-4 `ProspectingReplyHandler` — `handleVendasAutomationInbound` inteiro (já consome o
   IntentEngine do Sprint 1).
5. PR-5 `AtendimentoBotHandler` — a FSM de botões + NLU do Sprint 2. Maior e último.
Antes de cada PR: testes de caracterização do trecho (entrada → efeitos: outbound
enfileirado, metadata, flowState) rodando verdes ANTES e DEPOIS da extração.

## GUARDRAILS
- Comportamento 1:1 é critério de aceite, não aspiração: mesmo texto enviado, mesma
  ordem de decisão, mesmos logWhatsAppEvent (o suporte lê esses logs).
- Guards anti-ban: proibido "aproveitar pra melhorar". Mudança neles = plano separado
  com aprovação do dono.
- Se um PR travar, os anteriores ficam — a cadeia aceita extração parcial (handlers
  extraídos + resto inline no messaging.service até o próximo PR).
- Nenhum teste em chip real; nada aqui toca conexão.

## PRONTO QUANDO (por PR e no total)
- tsc estrito 0 erros; testes de caracterização + suíte existente verdes.
- Diff do PR contém só: arquivo novo do handler + remoção do trecho + fiação da cadeia.
- Ao final: `processPersistedInbound` reduzido a executor; nenhum handler > ~800 linhas.
