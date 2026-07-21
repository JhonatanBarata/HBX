import test from 'node:test';
import assert from 'node:assert/strict';

// S07 (MOTOR-ÚNICO) — testes unit do OutboundOrchestratorService.
//
// Estilo de mock copiado dos vizinhos da pasta (node:test + mocks manuais,
// `Object.create(Service.prototype)` cast `any` — mesmo truque de
// automation-overview.service.test.ts / cadencia/cadencia.service.test.ts):
// instancia SEM DI real, chama `tick()` (privado) direto via `any`. Cobre o
// que o contrato pede: (1) roda os executores habilitados em série, (2)
// pula os desabilitados sem chamar tick() neles, (3) isola o erro de 1
// executor sem derrubar os outros, (4) respeita o guard anti-sobreposição,
// (5) telemetria por executor.

import { OutboundOrchestratorService } from './outbound-orchestrator.service';
import type { OutboundExecutor, OutboundExecutorResult } from './outbound-orchestrator.service';

function makeOrchestrator(executors: OutboundExecutor[]) {
  const svc = Object.create(OutboundOrchestratorService.prototype) as any;
  svc.logger = { log() {}, warn() {}, error() {}, debug() {} };
  svc.timer = null;
  svc.running = false;
  svc.telemetry = new Map();
  svc.executors = executors;
  return svc as OutboundOrchestratorService;
}

function okResult(didWork: boolean, detail?: Record<string, unknown>): OutboundExecutorResult {
  return { ok: true, didWork, detail };
}

test('roda em serie os executores habilitados, pulando o desabilitado', async () => {
  const order: string[] = [];
  const executors: OutboundExecutor[] = [
    {
      key: 'ligado_1',
      isEnabled: () => true,
      tick: async () => {
        order.push('ligado_1:start');
        await new Promise((r) => setTimeout(r, 5));
        order.push('ligado_1:end');
        return okResult(true, { executed: 3 });
      },
    },
    {
      key: 'desligado',
      isEnabled: () => false,
      tick: async () => {
        order.push('desligado:TICK_NAO_DEVERIA_RODAR');
        return okResult(true);
      },
    },
    {
      key: 'ligado_2',
      isEnabled: () => true,
      tick: async () => {
        order.push('ligado_2:start');
        return okResult(false);
      },
    },
  ];
  const svc: any = makeOrchestrator(executors);
  await svc.tick(new Date());

  // serie: ligado_1 termina (start+end) ANTES de ligado_2 comecar.
  assert.deepEqual(order, ['ligado_1:start', 'ligado_1:end', 'ligado_2:start']);
  // desligado nunca teve tick() chamado.
  assert.ok(!order.includes('desligado:TICK_NAO_DEVERIA_RODAR'));
});

test('erro de 1 executor e isolado — nao derruba o tick dos outros', async () => {
  const order: string[] = [];
  const executors: OutboundExecutor[] = [
    {
      key: 'antes',
      isEnabled: () => true,
      tick: async () => {
        order.push('antes');
        return okResult(true, { executed: 1 });
      },
    },
    {
      key: 'quebrado',
      isEnabled: () => true,
      tick: async () => {
        order.push('quebrado');
        throw new Error('boom');
      },
    },
    {
      key: 'depois',
      isEnabled: () => true,
      tick: async () => {
        order.push('depois');
        return okResult(true, { executed: 1 });
      },
    },
  ];
  const svc: any = makeOrchestrator(executors);
  await assert.doesNotReject(() => svc.tick(new Date()));

  assert.deepEqual(order, ['antes', 'quebrado', 'depois']);
  const telemetry = (svc as OutboundOrchestratorService).getTelemetry();
  const quebrado = telemetry.find((t) => t.key === 'quebrado');
  assert.equal(quebrado?.lastResult, 'error');
  const depois = telemetry.find((t) => t.key === 'depois');
  assert.equal(depois?.lastResult, 'ok');
});

test('guard anti-sobreposicao: tick concorrente enquanto o anterior roda e ignorado', async () => {
  let running = 0;
  let maxConcurrent = 0;
  const executors: OutboundExecutor[] = [
    {
      key: 'lento',
      isEnabled: () => true,
      tick: async () => {
        running += 1;
        maxConcurrent = Math.max(maxConcurrent, running);
        await new Promise((r) => setTimeout(r, 20));
        running -= 1;
        return okResult(true, { executed: 1 });
      },
    },
  ];
  const svc: any = makeOrchestrator(executors);

  const first = svc.tick(new Date());
  const second = svc.tick(new Date()); // dispara enquanto o primeiro ainda esta 'running'
  await Promise.all([first, second]);

  assert.equal(maxConcurrent, 1, 'nunca deveria haver 2 ticks rodando o mesmo executor ao mesmo tempo');
});

test('log/telemetria so marca lastResult=ok quando didWork=true; skipped quando nao fez nada', async () => {
  const executors: OutboundExecutor[] = [
    { key: 'trabalhou', isEnabled: () => true, tick: async () => okResult(true, { executed: 2 }) },
    { key: 'nada_a_fazer', isEnabled: () => true, tick: async () => okResult(false) },
  ];
  const svc: any = makeOrchestrator(executors);
  await svc.tick(new Date());

  const telemetry = (svc as OutboundOrchestratorService).getTelemetry();
  assert.equal(telemetry.find((t) => t.key === 'trabalhou')?.lastResult, 'ok');
  assert.equal(telemetry.find((t) => t.key === 'nada_a_fazer')?.lastResult, 'skipped');
});

test('getTelemetry reflete enabled:false pro executor desligado, sem lastTickAt forjado', async () => {
  const executors: OutboundExecutor[] = [
    { key: 'off', isEnabled: () => false, tick: async () => okResult(true) },
  ];
  const svc: any = makeOrchestrator(executors);
  await svc.tick(new Date());

  const telemetry = (svc as OutboundOrchestratorService).getTelemetry();
  const off = telemetry.find((t) => t.key === 'off');
  assert.equal(off?.enabled, false);
  assert.equal(off?.lastTickAt, null);
  assert.equal(off?.lastResult, null);
});

test('isEnabled() lancando e tratado como desligado (nao derruba o tick)', async () => {
  const order: string[] = [];
  const executors: OutboundExecutor[] = [
    {
      key: 'isEnabled_quebrado',
      isEnabled: () => {
        throw new Error('boom_isEnabled');
      },
      tick: async () => {
        order.push('NAO_DEVERIA_CHAMAR');
        return okResult(true);
      },
    },
    {
      key: 'normal',
      isEnabled: () => true,
      tick: async () => {
        order.push('normal');
        return okResult(true, { executed: 1 });
      },
    },
  ];
  const svc: any = makeOrchestrator(executors);
  await assert.doesNotReject(() => svc.tick(new Date()));
  assert.deepEqual(order, ['normal']);
});
