# HUB-INTEGRACOES — SPRINT 2: Sync confiável (reaper, verdade no painel, cron)

> Arquitetura nº12 — Hub de Integrações. Depende de nada; pode rodar em paralelo à Sprint 1.

## Objetivo

O lock de sync já existe e funciona (unique parcial em SQL cru — ver veredito no SPRINT1). O que falta
é operação: destravar run zumbi, parar de gravar sucesso em run com falha, e religar o incremental
que existe mas ninguém chama.

## Fatos verificados

- Unique parcial real: `IntegrationSyncRun_connectionId_running_key` WHERE `status='RUNNING'`
  (`backend/prisma/migrations/20260329_align_auvo_scaffold_schema/migration.sql:42`). **NÃO recriar.**
- Run zumbi: se o processo morrer com run RUNNING, todo `syncNow` futuro cai no P2002 → ConflictException
  para sempre (`backend/src/integrations/auvo/auvo.sync.service.ts:195`). Não há reaper.
- `lastSuccessAt` gravado mesmo com `failedCount > 0` (`auvo.sync.service.ts:370-378`; TagPlus análogo)
  — painel pode mentir "sucesso" em run parcial. Mesma classe de problema do painel WhatsApp
  (banco ≠ verdade).
- `syncIncremental` sem nenhum caller (`backend/src/integrations/auvo/auvo.integration.service.ts:66`)
  — sync é 100% botão manual.
- Sync AUVO carrega TODOS os `AuvoExternalRecord` da empresa em memória
  (`auvo.sync.service.ts:226-230`) — O(N) por run.
- Padrão de agendador do projeto = worker `setInterval` (ex.: `modules.service.ts:1544` tasteSweep,
  `night-factory.worker.ts`). Não existe `@nestjs/schedule`, Bull ou Redis no backend — **não
  introduzir dependência nova**.

## Tarefas

1. **Stale-run reaper:** antes de criar run em `syncNow` (AUVO e TagPlus), marcar como
   `ERROR` (`errorSummary: 'stale RUNNING > Xmin — reaped'`) qualquer run RUNNING da conexão com
   `startedAt` mais velho que `HBX_INTEGRATIONS_SYNC_STALE_MIN` (default 30). Só então criar o novo.
2. **Verdade no painel:** `lastSuccessAt` só quando `failedCount === 0`; `lastSyncAt` continua sempre.
   Corrigir nos dois sync services.
3. **Worker incremental:** `setInterval` com jitter (base `HBX_INTEGRATIONS_SYNC_INTERVAL_MIN`,
   default 15, ± 20%), varre conexões `isActive && status CONNECTED`, chama `syncIncremental`.
   **Disjuntor obrigatório** (lição Webwhats): teto de N falhas consecutivas por conexão → status
   `ERROR` + para de tentar até ação manual. Flag mestre `HBX_INTEGRATIONS_SYNC_CRON_ENABLED`
   (default **off** até homologação com provider real).
4. **Memória do sync AUVO:** trocar o findMany-tudo por lookup em chunks de `externalId` vistos na
   página (ou upsert direto comparando `sourceUpdatedAt` no update) — sem pré-carga da tabela inteira.

## Critérios de aceite

- Teste: run RUNNING velho → reaped e novo sync passa; run RUNNING recente → ConflictException mantida.
- Teste: run PARTIAL não atualiza `lastSuccessAt`.
- Worker desligado por default; ligado em teste, dispara e respeita disjuntor.
- `cd backend && npx tsc --noEmit` verde + testes dos sync services passam.

## Guardrails

- Nenhuma dependência nova de infra (sem Redis/Bull/@nestjs/schedule).
- Worker nasce desligado por env; ligar é decisão do dono após homologação.
