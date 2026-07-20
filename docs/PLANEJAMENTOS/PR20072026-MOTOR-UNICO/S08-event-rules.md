# S08 — EventRuleService: gatilhos generalizados

**Fase 1 · Worker: Sonnet · Depende de: S06 · Aditivo**

## Objetivo
`CadenciaGatilho` (evento → ações) é um motor de regras escondido no domínio cadência. Alvo
(HubSpot Workflows): serviço genérico `EventRuleService` no módulo automation, com o gatilho de
WhatsApp como primeiro produtor de evento — abre caminho pra futuros eventos (etapa mudou,
atividade vencida) SEM criar outro motor.

## Arquivos
- CRIAR `backend/src/automation/event-rule.service.ts`
- CRIAR `backend/src/automation/event-rule.service.test.ts`
- EDITAR `backend/src/cadencia/cadencia-gatilho.service.ts` (vira produtor/consumidor via serviço novo)
- EDITAR `backend/src/automation/inbound-router.service.ts` (dispatch de gatilho passa pelo EventRule)
- EDITAR `backend/src/automation/automation.module.ts`

## Tarefas
1. `EventRuleService.emit(companyId, evento, payload)`: carrega regras ativas da empresa para o
   evento (hoje: tabela `CadenciaGatilho` — SEM schema novo nesta sprint), executa ações em série
   com o MESMO comportamento atual (mover_status / criar_atividade / notificar_vendedor),
   incrementa `fireCount`/`lastFiredAt` como hoje.
2. A execução das ações continua no código atual do `cadencia-gatilho.service` — o EventRule
   ORQUESTRA (busca regras, itera, isola erro por regra) e delega a ação; não duplicar as ações.
3. `InboundRouterService`: `dispatchCadenciaInbound` passa a emitir
   `EventRuleService.emit(companyId, 'lead_respondeu_whatsapp', {...})` — mantendo fire-and-forget
   (void + catch) como hoje. Comportamento observável idêntico (testes S01 verdes).
4. Registrar no CONTRATO.md os eventos futuros candidatos (não implementar): `etapa_mudou`,
   `atividade_vencida`, `email_lido`.
5. Testes: regra ativa dispara ação; regra de outra empresa NÃO dispara (tenant); erro numa regra
   não bloqueia a próxima; evento sem regra = no-op barato.

## Critérios de aceite
- Build + `test:automation` + testes existentes de `cadencia-gatilho` verdes (se assinatura interna
  mudou, atualizar SÓ o cabeçalho dos testes existentes, não os cenários).
- Zero mudança de comportamento visível.

## DoD
Commit local: `refactor(automation): S08 — gatilhos viram EventRuleService genérico`
