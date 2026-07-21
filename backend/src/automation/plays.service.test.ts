import test from 'node:test';
import assert from 'node:assert/strict';

// S11 (MOTOR-ÚNICO) — testes unit do PlaysService (adapter de leitura +
// ações roteadas dos "plays" proativos: prospecção/cadência/rotina).
// Mesmo estilo dos vizinhos da pasta (node:test + mocks manuais,
// `Object.create(Service.prototype)` — ver automation-overview.service.
// test.ts / agent.service.test.ts): instancia SEM DI real, injeta os
// services fonte como propriedades. Cobre os critérios de aceite da S11.md:
// (1) lista compõe os 3 tipos, (2) toggle roteia pro service certo por tipo,
// (3) empresa sem módulo vendas -> plays de vendas ausentes sem 500,
// (4) canManage negado -> 403 propagado sem tradução.

import { PlaysService } from './plays.service';

function user(companyId = 5, id = 1) {
  return { id, companyId, role: 'ADMIN' };
}

type Deps = {
  hasVendas?: boolean;
  moduleAccessThrows?: boolean;
  activation?: any;
  activationThrows?: boolean;
  liveStatus?: any;
  liveStatusThrows?: boolean;
  cadencias?: any[];
  cadenciaListThrows?: boolean;
  rotinas?: any[];
  rotinaListThrows?: boolean;
  updateCadenciaImpl?: (user: any, id: string, dto: any) => Promise<any>;
  updateRotinaImpl?: (user: any, id: string, dto: any) => Promise<any>;
  putActivationImpl?: (user: any, body: any) => Promise<any>;
  aplicarCadenciaImpl?: (user: any, id: string, dto: any) => Promise<any>;
};

type Calls = {
  updateCadencia: number;
  updateRotina: number;
  putActivation: number;
  aplicarCadencia: number;
};

function makeService(deps: Deps = {}): { svc: PlaysService; calls: Calls } {
  const calls: Calls = { updateCadencia: 0, updateRotina: 0, putActivation: 0, aplicarCadencia: 0 };

  const svc: any = Object.create(PlaysService.prototype);
  svc.logger = { log() {}, warn() {}, error() {}, debug() {} };

  svc.modulesService = {
    canUserAccessModule: async () => {
      if (deps.moduleAccessThrows) throw new Error('module_access_boom');
      return deps.hasVendas ?? true;
    },
  };

  svc.botActivationService = {
    getActivation: async () => {
      if (deps.activationThrows) throw new Error('activation_boom');
      return (
        deps.activation ?? {
          armed: true,
          types: { prospeccao: { live: true, preflight: { chipConectado: true, configCompleta: true } } },
        }
      );
    },
    putActivation: async (u: any, body: any) => {
      calls.putActivation += 1;
      if (deps.putActivationImpl) return deps.putActivationImpl(u, body);
      return { ok: true, type: body.type, live: body.live };
    },
  };

  svc.vendasAutomationService = {
    getLiveStatusForUser: async () => {
      if (deps.liveStatusThrows) throw new Error('live_status_boom');
      return (
        deps.liveStatus ?? {
          status: 'aguardando',
          campaign: { id: 'camp-1', segment: 'água mineral', city: 'Campinas', state: 'sp' },
          pendingJobs: 12,
          sentToday: 4,
          lastSuccessfulSendAt: '2026-07-20T12:00:00.000Z',
        }
      );
    },
  };

  svc.cadenciaService = {
    listForUser: async () => {
      if (deps.cadenciaListThrows) throw new Error('cadencia_list_boom');
      return {
        ok: true,
        canManage: true,
        runnerEnabled: true,
        cadencias:
          deps.cadencias ??
          [
            {
              id: 'cad-1',
              nome: 'Conservador',
              persona: 'conservador',
              passosCount: 5,
              whatsSteps: 3,
              ativa: true,
              isSeed: true,
              inscritos: 7,
            },
          ],
      };
    },
    updateForUser: async (u: any, id: string, dto: any) => {
      calls.updateCadencia += 1;
      if (deps.updateCadenciaImpl) return deps.updateCadenciaImpl(u, id, dto);
      return { ok: true, cadencia: { id, nome: 'Conservador', ativa: Boolean(dto?.ativa) } };
    },
    aplicarForUser: async (u: any, id: string, dto: any) => {
      calls.aplicarCadencia += 1;
      if (deps.aplicarCadenciaImpl) return deps.aplicarCadenciaImpl(u, id, dto);
      return { ok: true, inscritos: 1, jaInscritos: 0, conflitosAutomacao: 0, total: 1, runnerEnabled: true };
    },
  };

  svc.cadenciaRotinaService = {
    listForUser: async () => {
      if (deps.rotinaListThrows) throw new Error('rotina_list_boom');
      return {
        ok: true,
        canManage: true,
        runnerEnabled: true,
        rotinas:
          deps.rotinas ??
          [
            {
              id: 'rot-1',
              nome: 'Toda segunda',
              savedSearchId: 'busca-1',
              everyWeeks: 1,
              maxLeads: 50,
              ativa: true,
              lastRunAt: '2026-07-13T09:00:00.000Z',
              lastRunCount: 42,
              lastRunStatus: 'sucesso',
            },
          ],
      };
    },
    updateForUser: async (u: any, id: string, dto: any) => {
      calls.updateRotina += 1;
      if (deps.updateRotinaImpl) return deps.updateRotinaImpl(u, id, dto);
      return { ok: true, rotina: { id, nome: 'Toda segunda', ativa: Boolean(dto?.ativa) } };
    },
  };

  return { svc: svc as PlaysService, calls };
}

// ── (1) lista compõe os 3 tipos ─────────────────────────────────────────────

test('listForUser: compoe prospeccao + cadencia + rotina numa lista uniforme', async () => {
  const { svc } = makeService();
  const plays = await svc.listForUser(user());

  const tipos = plays.map((p) => p.tipo).sort();
  assert.deepEqual(tipos, ['cadencia', 'prospeccao', 'rotina']);

  const prospeccao = plays.find((p) => p.tipo === 'prospeccao')!;
  assert.equal(prospeccao.ativo, true);
  assert.equal(prospeccao.id, 'camp-1');
  assert.equal(prospeccao.contagem, 12);
  assert.equal(prospeccao.ultimaExecucao.status, 'aguardando');
  assert.equal(prospeccao.ultimaExecucao.count, 4);

  const cadencia = plays.find((p) => p.tipo === 'cadencia')!;
  assert.equal(cadencia.id, 'cad-1');
  assert.equal(cadencia.nome, 'Conservador');
  assert.equal(cadencia.ativo, true);
  assert.equal(cadencia.contagem, 7);
  assert.equal(cadencia.resumo, '5 toques · 3 WhatsApp');
  assert.equal(cadencia.fonte.persona, 'conservador');

  const rotina = plays.find((p) => p.tipo === 'rotina')!;
  assert.equal(rotina.id, 'rot-1');
  assert.equal(rotina.ativo, true);
  assert.equal(rotina.fonte.savedSearchId, 'busca-1');
  assert.equal(rotina.ultimaExecucao.at, '2026-07-13T09:00:00.000Z');
  assert.equal(rotina.ultimaExecucao.status, 'sucesso');
  assert.equal(rotina.ultimaExecucao.count, 42);
});

test('listForUser: prospeccao sem campanha ainda aparece como singleton (defaults honestos)', async () => {
  const { svc } = makeService({ liveStatus: { status: 'parado', campaign: null, pendingJobs: 0 } });
  const plays = await svc.listForUser(user());
  const prospeccao = plays.find((p) => p.tipo === 'prospeccao')!;
  assert.equal(prospeccao.id, 'prospeccao');
  assert.equal(prospeccao.resumo, 'Nenhuma campanha configurada.');
  assert.equal(prospeccao.contagem, 0);
});

// ── (2) toggle roteia pro service certo por tipo ────────────────────────────

test('togglePlay: tipo cadencia delega pro CadenciaService.updateForUser({ativa})', async () => {
  const { svc, calls } = makeService();
  const result = await svc.togglePlay(user(), 'cadencia', 'cad-1', false);
  assert.equal(calls.updateCadencia, 1);
  assert.equal(calls.updateRotina, 0);
  assert.equal(calls.putActivation, 0);
  assert.equal(result.tipo, 'cadencia');
  assert.equal(result.ativo, false);
});

test('togglePlay: tipo rotina delega pro CadenciaRotinaService.updateForUser({ativa})', async () => {
  const { svc, calls } = makeService();
  const result = await svc.togglePlay(user(), 'rotina', 'rot-1', true);
  assert.equal(calls.updateRotina, 1);
  assert.equal(calls.updateCadencia, 0);
  assert.equal(calls.putActivation, 0);
  assert.equal(result.tipo, 'rotina');
  assert.equal(result.ativo, true);
});

test('togglePlay: tipo prospeccao delega pro BotActivationService.putActivation({type:"prospeccao"})', async () => {
  const { svc, calls } = makeService();
  const result = await svc.togglePlay(user(), 'prospeccao', 'camp-1', true);
  assert.equal(calls.putActivation, 1);
  assert.equal(calls.updateCadencia, 0);
  assert.equal(calls.updateRotina, 0);
  assert.equal(result.tipo, 'prospeccao');
  assert.equal(result.ativo, true);
});

test('togglePlay: tipo invalido lanca BadRequestException sem chamar nenhum service dono', async () => {
  const { svc, calls } = makeService();
  await assert.rejects(() => svc.togglePlay(user(), 'gatilho', 'x', true), /Tipo de play inválido/);
  assert.equal(calls.updateCadencia, 0);
  assert.equal(calls.updateRotina, 0);
  assert.equal(calls.putActivation, 0);
});

test('aplicarCadenciaPlay: delega pro CadenciaService.aplicarForUser sem traduzir a resposta', async () => {
  const { svc, calls } = makeService();
  const result: any = await svc.aplicarCadenciaPlay(user(), 'cad-1', { leadIds: ['lead-1'] });
  assert.equal(calls.aplicarCadencia, 1);
  assert.equal(result.inscritos, 1);
});

// ── (3) empresa sem modulo vendas -> plays de vendas ausentes sem 500 ──────

test('listForUser: empresa sem modulo vendas devolve lista vazia (fail-soft, sem lancar)', async () => {
  const { svc } = makeService({ hasVendas: false });
  const plays = await svc.listForUser(user());
  assert.deepEqual(plays, []);
});

test('listForUser: canUserAccessModule lancando tambem degrada pra lista vazia (nao derruba o endpoint)', async () => {
  const { svc } = makeService({ moduleAccessThrows: true });
  const plays = await svc.listForUser(user());
  assert.deepEqual(plays, []);
});

test('listForUser: bloco cadencia lancando (ex.: ForbiddenException de resolveVendasAccessContext) nao derruba os outros blocos', async () => {
  const { svc } = makeService({ cadenciaListThrows: true });
  const plays = await svc.listForUser(user());
  assert.equal(plays.some((p) => p.tipo === 'cadencia'), false);
  assert.equal(plays.some((p) => p.tipo === 'prospeccao'), true);
  assert.equal(plays.some((p) => p.tipo === 'rotina'), true);
});

test('listForUser: bloco rotina lancando nao derruba os outros blocos', async () => {
  const { svc } = makeService({ rotinaListThrows: true });
  const plays = await svc.listForUser(user());
  assert.equal(plays.some((p) => p.tipo === 'rotina'), false);
  assert.equal(plays.some((p) => p.tipo === 'cadencia'), true);
  assert.equal(plays.some((p) => p.tipo === 'prospeccao'), true);
});

test('listForUser: prospeccao nao-armada (getLiveStatusForUser lanca) degrada pro singleton default, sem derrubar a lista', async () => {
  const { svc } = makeService({ liveStatusThrows: true, activationThrows: true });
  const plays = await svc.listForUser(user());
  const prospeccao = plays.find((p) => p.tipo === 'prospeccao')!;
  assert.ok(prospeccao);
  assert.equal(prospeccao.ativo, false);
  assert.equal(prospeccao.contagem, 0);
});

// ── (4) canManage negado -> 403 propagado sem traducao ──────────────────────

test('togglePlay: cadencia sem canManage propaga o ForbiddenException do CadenciaService (403), sem traducao', async () => {
  const { ForbiddenException } = await import('@nestjs/common');
  const { svc } = makeService({
    updateCadenciaImpl: async () => {
      throw new ForbiddenException('Sem permissão para gerenciar automações.');
    },
  });
  await assert.rejects(() => svc.togglePlay(user(), 'cadencia', 'cad-1', false), /Sem permiss/);
});

test('togglePlay: rotina sem canManage propaga o ForbiddenException da CadenciaRotinaService (403)', async () => {
  const { ForbiddenException } = await import('@nestjs/common');
  const { svc } = makeService({
    updateRotinaImpl: async () => {
      throw new ForbiddenException('Sem permissão para gerenciar rotinas.');
    },
  });
  await assert.rejects(() => svc.togglePlay(user(), 'rotina', 'rot-1', false), /Sem permiss/);
});

test('togglePlay: prospeccao sem admin propaga o BadRequestException do BotActivationService', async () => {
  const { BadRequestException } = await import('@nestjs/common');
  const { svc } = makeService({
    putActivationImpl: async () => {
      throw new BadRequestException('Apenas administradores podem alterar a ativação do bot.');
    },
  });
  await assert.rejects(() => svc.togglePlay(user(), 'prospeccao', 'camp-1', true), /administradores/);
});

test('aplicarCadenciaPlay: sem canManage propaga o Forbidden do CadenciaService', async () => {
  const { ForbiddenException } = await import('@nestjs/common');
  const { svc } = makeService({
    aplicarCadenciaImpl: async () => {
      throw new ForbiddenException('Sem permissão para gerenciar automações.');
    },
  });
  await assert.rejects(() => svc.aplicarCadenciaPlay(user(), 'cad-1', {}), /Sem permiss/);
});
