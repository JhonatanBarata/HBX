import test from 'node:test';
import assert from 'node:assert/strict';

// S04 (MOTOR-ÚNICO) — testes unit do agregador GET /automation/overview.
//
// Estilo de mock copiado dos vizinhos da pasta (node:test + mocks manuais,
// `Object.create(Service.prototype)` — mesmo truque de
// automation/characterization/inbound-precedence.test.ts e
// cadencia/cadencia-gatilho.service.test.ts): instancia SEM DI real, injeta os
// services fonte como propriedades. Cobre: (1) shape feliz com os 5 blocos
// preenchidos por dado real dos mocks, (2) fail-soft por bloco quando o
// service fonte lança, (3) o gate de 3 chaves bloqueando bloco por bloco.

import { AutomationOverviewService } from './automation-overview.service';

type Deps = {
  moduleAccess?: { atendimento?: boolean; bot?: boolean; vendas?: boolean };
  companyRow?: any;
  activation?: any;
  activationThrows?: boolean;
  assistente?: any;
  assistenteThrows?: boolean;
  roteiroVersions?: Array<{ createdAt: Date }>;
  liveStatus?: any;
  liveStatusThrows?: boolean;
  gatilhosAtivos?: number;
  rotinasAtivas?: number;
  regrasThrows?: boolean;
  env?: Record<string, string | undefined>;
};

function makeService(deps: Deps = {}) {
  const access = { atendimento: true, bot: true, vendas: true, ...deps.moduleAccess };
  const svc: any = Object.create(AutomationOverviewService.prototype);

  svc.logger = { log() {}, warn() {}, error() {}, debug() {} };

  svc.prisma = {
    company: { findUnique: async () => deps.companyRow ?? null },
  };

  svc.modulesService = {
    canUserAccessModule: async (_userId: number, key: string) => Boolean((access as any)[key]),
  };

  svc.botActivationService = {
    getActivation: async () => {
      if (deps.activationThrows) throw new Error('activation_boom');
      return (
        deps.activation ?? {
          // "Armar bot" morreu (31/07/2026): o contrato agora carrega perfil
          // (entrevista) e o bloco botArmed do overview deriva DELE.
          perfil: { entrevistaCompleta: true, pendencias: [] },
          types: {
            atendimento: { live: true, preflight: { chipConectado: true, configCompleta: true } },
            recovery: { live: false, preflight: { chipConectado: true, configCompleta: false } },
            prospeccao: { live: false, preflight: { chipConectado: true, configCompleta: false } },
          },
        }
      );
    },
  };

  svc.assistenteService = {
    get: async () => {
      if (deps.assistenteThrows) throw new Error('assistente_boom');
      return deps.assistente ?? { ok: true, publishEnabled: true, assistente: null };
    },
  };

  svc.botConfigStore = {
    listVersions: async () => deps.roteiroVersions ?? [{ createdAt: new Date('2026-07-20T13:14:55Z') }],
  };

  svc.vendasAutomationService = {
    getLiveStatusForUser: async () => {
      if (deps.liveStatusThrows) throw new Error('live_status_boom');
      return (
        deps.liveStatus ?? {
          status: 'aguardando',
          campaign: { id: 'camp-1' },
          pendingJobs: 10,
        }
      );
    },
  };

  svc.cadenciaGatilhoService = {
    countActiveForCompany: async () => {
      if (deps.regrasThrows) throw new Error('gatilho_boom');
      return deps.gatilhosAtivos ?? 3;
    },
  };
  svc.cadenciaRotinaService = {
    countActiveForCompany: async () => deps.rotinasAtivas ?? 2,
  };

  return svc as AutomationOverviewService;
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    prev[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return fn().finally(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });
}

test('overview feliz: todos os blocos ok com dado real dos services injetados', async () => {
  await withEnv(
    {
      HBX_ASSISTENTE_PUBLISH_ENABLED: 'true',
      HBX_CADENCIA_RUNNER_ENABLED: 'true',
      // S20: nomes finais são HBX_AUTOMATION_IA_LIVE/HBX_AUTOMATION_RUNNER_ENABLED
      // (supersedem a proposta provisória HBX_AUTOMATION_AGENT_PUBLISH_ENABLED/
      // HBX_AUTOMATION_PROSPECCAO_RUNNER_ENABLED do CONTRATO.md §5.1) — undefined
      // aqui prova que o fallback pra flag legada funciona.
      HBX_AUTOMATION_IA_LIVE: undefined,
      HBX_AUTOMATION_RUNNER_ENABLED: undefined,
      HBX_RECOVERY_AUTOMATION_WORKER_ENABLED: 'true',
      HBX_AUTOMATION_COBRANCA_WORKER_ENABLED: undefined,
    },
    async () => {
      const svc = makeService({
        assistente: { ok: true, publishEnabled: true, assistente: { published: true, updatedAt: '2026-07-14T05:41:00.000Z' } },
      });
      const result = await svc.getOverview({ id: 9, companyId: 5 });

      assert.equal(result.companyId, 5);
      assert.deepEqual(result.moduleAccess, { atendimento: true, bot: true, vendas: true });
      // armed ⇔ entrevista completa (a tranca nova); autor do pino morreu junto.
      assert.equal(result.botArmed.armed, true);
      assert.equal(result.botArmed.armedByUserId, null);

      assert.equal(result.atendente.ok, true);
      if (result.atendente.ok) {
        assert.equal(result.atendente.brain, 'ia'); // IA publicada tem precedência (CONTRATO §1.2 passo 6)
        assert.equal(result.atendente.published, true);
      }

      assert.equal(result.cobranca.ok, true);
      if (result.cobranca.ok) {
        assert.equal(result.cobranca.live, false);
        assert.equal(result.cobranca.workerEnabled, true);
      }

      assert.equal(result.prospeccao.ok, true);
      if (result.prospeccao.ok) {
        assert.equal(result.prospeccao.campaignId, 'camp-1');
        assert.equal(result.prospeccao.pendingLeads, 10);
      }

      assert.equal(result.regras.ok, true);
      if (result.regras.ok) {
        assert.equal(result.regras.gatilhosAtivos, 3);
        assert.equal(result.regras.rotinasAtivas, 2);
      }

      assert.equal(result.motor.ok, true);
      if (result.motor.ok) {
        assert.equal(result.motor.runnerEnabled, true);
        assert.equal(result.motor.publishEnabled, true);
        assert.equal(result.motor.chipConectado, true);
      }
    },
  );
});

test('atendente cai pra roteiro quando IA nao esta publicada mas o menu esta ao vivo', async () => {
  const svc = makeService({
    assistente: { ok: true, publishEnabled: true, assistente: { published: false, updatedAt: '2026-07-01T00:00:00.000Z' } },
  });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  assert.equal(result.atendente.ok, true);
  if (result.atendente.ok) {
    assert.equal(result.atendente.brain, 'roteiro');
    assert.equal(result.atendente.published, true); // activation.types.atendimento.live = true no mock default
  }
});

test('atendente sem nenhum cerebro configurado devolve brain:null (nao inventa terceiro valor)', async () => {
  const svc = makeService({
    assistente: { ok: true, publishEnabled: true, assistente: null },
    activation: {
      perfil: { entrevistaCompleta: true, pendencias: [] },
      types: {
        atendimento: { live: false, preflight: { chipConectado: false, configCompleta: false } },
        recovery: { live: false, preflight: { chipConectado: false, configCompleta: false } },
        prospeccao: { live: false, preflight: { chipConectado: false, configCompleta: false } },
      },
    },
    roteiroVersions: [],
  });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  assert.equal(result.atendente.ok, true);
  if (result.atendente.ok) {
    assert.equal(result.atendente.brain, null);
    assert.equal(result.atendente.published, false);
  }
});

test('bloco fail-soft: assistenteService lancando NAO derruba o endpoint, so o bloco atendente', async () => {
  const svc = makeService({ assistenteThrows: true });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  assert.equal(result.atendente.ok, false);
  if (!result.atendente.ok) assert.equal(result.atendente.reason, 'atendente_unavailable');
  // outros blocos continuam ok — a falha e isolada por bloco.
  assert.equal(result.regras.ok, true);
  assert.equal(result.prospeccao.ok, true);
});

test('bloco fail-soft: getActivation indisponivel ainda devolve overview com blocos degradados', async () => {
  const svc = makeService({ activationThrows: true });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  // Sem activation nao ha como saber da entrevista -> armed=false (fail-closed), sem lancar.
  assert.equal(result.botArmed.armed, false);
  assert.equal(result.cobranca.ok, true);
  if (result.cobranca.ok) assert.equal(result.cobranca.live, false); // activation nula -> false, nao quebra
});

test('prospeccao nao-armada (getLiveStatusForUser lanca) degrada pros defaults sem marcar ok:false', async () => {
  const svc = makeService({ liveStatusThrows: true });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  assert.equal(result.prospeccao.ok, true);
  if (result.prospeccao.ok) {
    assert.equal(result.prospeccao.campaignId, null);
    assert.equal(result.prospeccao.pendingLeads, 0);
  }
});

test('regras fail-soft: contagem lancando vira bloco ok:false, resto do overview sobrevive', async () => {
  const svc = makeService({ regrasThrows: true });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  assert.equal(result.regras.ok, false);
  if (!result.regras.ok) assert.equal(result.regras.reason, 'regras_unavailable');
  assert.equal(result.companyId, 5);
  assert.equal(result.motor.ok, true);
});

test('gate de 3 chaves: empresa so com vendas nao ve atendente/cobranca, ve prospeccao/regras', async () => {
  const svc = makeService({ moduleAccess: { atendimento: false, bot: false, vendas: true } });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  assert.deepEqual(result.moduleAccess, { atendimento: false, bot: false, vendas: true });
  assert.equal(result.atendente.ok, false);
  if (!result.atendente.ok) assert.equal(result.atendente.reason, 'module_access_denied');
  assert.equal(result.cobranca.ok, false);
  assert.equal(result.prospeccao.ok, true);
  assert.equal(result.regras.ok, true);
});

test('gate de 3 chaves: atendimento sozinho (sem bot/vendas) ve atendente mas nao cobranca/prospeccao/regras', async () => {
  const svc = makeService({ moduleAccess: { atendimento: true, bot: false, vendas: false } });
  const result = await svc.getOverview({ id: 9, companyId: 5 });
  assert.equal(result.atendente.ok, true); // atendimento OU bot — atendimento basta
  assert.equal(result.cobranca.ok, false); // cobranca exige atendimento E bot
  assert.equal(result.prospeccao.ok, false);
  assert.equal(result.regras.ok, false);
});

test('sem companyId no user lanca BadRequestException (mesmo padrao dos services vizinhos)', async () => {
  const svc = makeService();
  await assert.rejects(() => svc.getOverview({ id: 9 }));
});
