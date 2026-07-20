# S07 — OutboundOrchestratorService: 1 scheduler, N executores ⚠

**Fase 1 · Worker: Sonnet · Depende de: S04 · Revisão adversarial: SIM**

## Objetivo
Hoje há DOIS agendadores proativos: `CadenciaSchedulerService` (tick 60s → `runDueSteps` +
`runDueRoutines`, flag `HBX_CADENCIA_RUNNER_ENABLED`) e o timing próprio do
`vendas-automation` (prospecção). Alvo do mercado: UM orquestrador com N executores plugados.
**Executores NÃO são reescritos** — prospecção (4400 linhas, crédito/débito/governor) e cadência
continuam donos da sua execução; o orquestrador unifica tick, flag, telemetria e teto.

## Arquivos
- CRIAR `backend/src/automation/outbound-orchestrator.service.ts`
- CRIAR `backend/src/automation/outbound-orchestrator.service.test.ts`
- EDITAR `backend/src/cadencia/cadencia-scheduler.service.ts` (vira executor registrado; timer próprio morre)
- EDITAR `backend/src/vendas/vendas-automation.service.ts` (SÓ se tiver timer/cron próprio — registrar
  no orquestrador; se o disparo é por request/fila, NÃO mexer e documentar)
- EDITAR `backend/src/automation/automation.module.ts`

## Tarefas
1. Interface `OutboundExecutor { key: string; isEnabled(): boolean; tick(now): Promise<Resultado> }`.
2. Orquestrador: timer único (60s default), executa executores REGISTRADOS em série (nunca
   paralelo — chip é recurso único), com o mesmo padrão anti-sobreposição (`running` guard) do
   scheduler atual. Log por tick só quando algo executou (padrão atual).
3. Migrar `CadenciaSchedulerService`: os métodos `runDueSteps`/`runDueRoutines` viram 2 executores
   (`cadencia_steps`, `cadencia_rotinas`). A flag `HBX_CADENCIA_RUNNER_ENABLED` continua sendo
   respeitada DENTRO deles (fonte única da flag preservada — nada liga sozinho).
4. Prospecção: investigar como o vendas-automation agenda hoje (buscar setInterval/cron/tick no
   service). Tem timer? → registrar como executor `prospeccao` mantendo flags/gates internos.
   Não tem (dispara por evento/request)? → NÃO forçar; deixar documentado no código e no CONTRATO.md.
5. Overview (S04): acrescentar bloco `motor.executores: [{key, enabled, lastTickAt, lastResult}]`
   — telemetria do orquestrador.
6. Teste: executores mock (1 on, 1 off, 1 que lança) → orquestrador roda os on em série, isola erro
   (executor que lança não derruba o tick dos outros), respeita guard de sobreposição.

## Critérios de aceite
- Build + testes verdes. Cadência dispara exatamente como antes (mesma flag, mesmo teto diário,
  mesmos logs) — só o dono do timer mudou.
- NENHUM envio novo criado; `queueOutboundForCompany` segue a única porta.

## Proibições
- Não mexer no corpo de `runDueSteps`/`runDueRoutines` além da assinatura de registro.
- Não mexer em crédito/débito/governor da prospecção.

## DoD
Commit local: `refactor(automation): S07 — scheduler único com executores registrados`
