import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HbxEngineGovernorService,
  decideHbxEngineGovernorActions,
  resolveHbxEngineDesiredState,
  shouldEnableHbxEngineGovernor,
} from './hbx-engine-governor.service';
import { isAllowedHbxEngineContainerName } from './hbx-engine-docker-adapter.service';

function withEnv<T>(patch: NodeJS.ProcessEnv, fn: () => T) {
  const previous = { ...process.env };
  const restore = () => {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    const result = fn();
    if (result && typeof (result as any).finally === 'function') {
      return (result as any).finally(restore) as T;
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('governor opt-in stays disabled unless env is explicit', () => {
  withEnv({ HBX_ENGINE_GOVERNOR_ENABLED: '' }, () => {
    assert.equal(shouldEnableHbxEngineGovernor(), false);
  });
  withEnv({ HBX_ENGINE_GOVERNOR_ENABLED: 'true' }, () => {
    assert.equal(shouldEnableHbxEngineGovernor(), true);
  });
});

test('docker adapter only allows hbx-engine numbered containers', () => {
  assert.equal(isAllowedHbxEngineContainerName('hbx-engine-1'), true);
  assert.equal(isAllowedHbxEngineContainerName('hbx-engine-200'), true);
  assert.equal(isAllowedHbxEngineContainerName('hbx-backend'), false);
  assert.equal(isAllowedHbxEngineContainerName('hbx-engine-watchdog'), false);
  assert.equal(isAllowedHbxEngineContainerName('hbx-engine-1;docker rm hbx-backend'), false);
});

test('governor desired state resolves from lock status without migration', () => {
  assert.equal(resolveHbxEngineDesiredState('draining'), 'draining');
  assert.equal(resolveHbxEngineDesiredState('stopped'), 'stopped');
  assert.equal(resolveHbxEngineDesiredState('inactive'), 'stopped');
  assert.equal(resolveHbxEngineDesiredState('busy'), 'running');
});

test('governor decision starts, stops and restarts according to desired state', () => {
  const actions = decideHbxEngineGovernorActions({
    nowMs: 10_000,
    cooldownMs: 0,
    engines: [
      {
        name: 'hbx-engine-1',
        desiredState: 'running',
        leaseActive: false,
        containerExists: true,
        containerRunning: false,
        health: 'none',
      },
      {
        name: 'hbx-engine-2',
        desiredState: 'stopped',
        leaseActive: false,
        containerExists: true,
        containerRunning: true,
        health: 'healthy',
      },
      {
        name: 'hbx-engine-3',
        desiredState: 'running',
        leaseActive: false,
        containerExists: true,
        containerRunning: true,
        health: 'unhealthy',
      },
    ],
  });

  assert.deepEqual(actions.map((action) => [action.name, action.action]), [
    ['hbx-engine-1', 'start'],
    ['hbx-engine-2', 'stop'],
    ['hbx-engine-3', 'restart'],
  ]);
});

test('governor respects active lease and stopped unhealthy container', () => {
  const actions = decideHbxEngineGovernorActions({
    nowMs: 10_000,
    cooldownMs: 0,
    engines: [
      {
        name: 'hbx-engine-1',
        desiredState: 'stopped',
        leaseActive: true,
        containerExists: true,
        containerRunning: true,
        health: 'healthy',
      },
      {
        name: 'hbx-engine-2',
        desiredState: 'stopped',
        leaseActive: false,
        containerExists: true,
        containerRunning: false,
        health: 'unhealthy',
      },
      {
        name: 'hbx-engine-3',
        desiredState: 'draining',
        leaseActive: true,
        containerExists: true,
        containerRunning: true,
        health: 'healthy',
      },
    ],
  });

  assert.equal(actions.length, 0);
});

test('governor stops draining engine after lease is gone and suppresses loop by cooldown', () => {
  const actions = decideHbxEngineGovernorActions({
    nowMs: 20_000,
    cooldownMs: 60_000,
    engines: [
      {
        name: 'hbx-engine-1',
        desiredState: 'draining',
        leaseActive: false,
        containerExists: true,
        containerRunning: true,
        health: 'healthy',
        lastActionAtMs: 0,
      },
      {
        name: 'hbx-engine-2',
        desiredState: 'running',
        leaseActive: false,
        containerExists: true,
        containerRunning: false,
        health: 'none',
        lastActionAtMs: 10_000,
      },
    ],
  });

  assert.deepEqual(actions.map((action) => [action.name, action.action]), [
    ['hbx-engine-1', 'stop'],
  ]);
});

test('governor runOnce applies docker actions through adapter mock only', async () => {
  await withEnv({
    HBX_ENGINE_GOVERNOR_ENABLED: 'true',
    HBX_ENGINE_GOVERNOR_COOLDOWN_SECONDS: '0',
    HBX_ENGINE_COUNT: '2',
    HBX_ENGINE_MAX_COUNT: '2',
  }, async () => {
    const lockUpdates: any[] = [];
    const dockerActions: Array<[string, string]> = [];
    const rows = [
      {
        id: 'hbx-engine-1',
        engineIndex: 0,
        status: 'running',
        lockedRunId: null,
        lockedUntil: null,
      },
      {
        id: 'hbx-engine-2',
        engineIndex: 1,
        status: 'stopped',
        lockedRunId: null,
        lockedUntil: null,
      },
    ];
    const prisma = {
      hasTable: async (name: string) => name === 'HbxEngineLock',
      hbxEngineLock: {
        findMany: async () => rows,
        updateMany: async (input: any) => {
          lockUpdates.push(input);
          return { count: 1 };
        },
      },
    };
    const pool = {
      refreshEngineRegistryFromEnv: async () => rows,
    };
    const telemetry = {
      getEngineTelemetry: async () => new Map([
        ['hbx-engine-1', { name: 'hbx-engine-1', exists: true, running: false, status: 'exited', health: 'none', actualState: 'exited', memoryRssMb: null }],
        ['hbx-engine-2', { name: 'hbx-engine-2', exists: true, running: true, status: 'running', health: 'healthy', actualState: 'running', memoryRssMb: null }],
      ]),
    };
    const docker = {
      startEngine: async (name: string) => {
        dockerActions.push(['start', name]);
      },
      stopEngine: async (name: string) => {
        dockerActions.push(['stop', name]);
      },
      restartEngine: async (name: string) => {
        dockerActions.push(['restart', name]);
      },
    };
    const service = new HbxEngineGovernorService(prisma as any, pool as any, telemetry as any, docker as any);

    const result = await service.runOnce();

    assert.deepEqual(result.actions.map((action) => [action.name, action.action]), [
      ['hbx-engine-1', 'start'],
      ['hbx-engine-2', 'stop'],
    ]);
    assert.deepEqual(dockerActions, [
      ['start', 'hbx-engine-1'],
      ['stop', 'hbx-engine-2'],
    ]);
    assert.equal(lockUpdates.some((input) => input.where.id === 'hbx-engine-2' && input.data.status === 'stopped'), true);
  });
});
