import test from 'node:test';
import assert from 'node:assert/strict';

// S09 (MOTOR-ÚNICO) — testes unit do AgentBackfillService (backfill
// idempotente de AutomationAgent a partir de AssistenteConfig + BotConfig
// domain='atendimento_bot'). Mesmo estilo dos vizinhos da pasta: mocks
// manuais em memória (Map) simulando as tabelas relevantes, instanciando o
// service via `new AgentBackfillService(prisma, botConfigStore,
// botActivationService)` (mesmo padrão de commercial-automation-state.
// service.test.ts — classe simples, sem necessidade do truque
// Object.create(prototype) usado nos services com DI mais pesada).
//
// Cobre os critérios de aceite da S09.md: (1) empresa só-assistente, (2) só
// bot/roteiro, (3) ambos, (4) nenhuma fonte, (5) idempotência (rodar 2x não
// duplica), (6) guard não regride quando a linha já está tão nova quanto a
// fonte, (7) re-sync quando a fonte legada muda DEPOIS da última migração.

import { AgentBackfillService } from './agent-backfill.service';
import { DEFAULT_ATENDIMENTO_BOT_CONFIG } from '../inbox/atendimento-config';

type FakeAssistenteRow = {
  companyId: number;
  nome: string;
  tom: string;
  perfil: string;
  produtos: string | null;
  empresaNome: string | null;
  fluxoJson: string;
  published: boolean;
  testCounter: number;
  updatedAt: Date;
};

type FakeRoteiroCompany = {
  versions: Array<{ version: number; updatedByUserId: number | null; createdAt: Date }>;
  payload: unknown;
};

function assistenteFixture(overrides: Partial<FakeAssistenteRow> = {}): FakeAssistenteRow {
  return {
    companyId: 1,
    nome: 'Bia',
    tom: 'normal',
    perfil: 'vendas',
    produtos: 'Água mineral',
    empresaNome: 'Empresa Teste',
    fluxoJson: '{"entradaPassoId":"p1","passos":[{"id":"p1","tipo":"mensagem","texto":"Oi!"}],"condicoes":[]}',
    published: false,
    testCounter: 3,
    updatedAt: new Date('2026-07-15T10:00:00.000Z'),
    ...overrides,
  };
}

function makeHarness(opts: {
  assistenteRows?: FakeAssistenteRow[];
  roteiroByCompany?: Map<number, FakeRoteiroCompany>;
  liveByCompany?: Map<number, boolean>;
  activationThrowsFor?: Set<number>;
} = {}) {
  const assistenteRows = opts.assistenteRows ?? [];
  const roteiroByCompany = opts.roteiroByCompany ?? new Map<number, FakeRoteiroCompany>();
  const liveByCompany = opts.liveByCompany ?? new Map<number, boolean>();
  const activationThrowsFor = opts.activationThrowsFor ?? new Set<number>();

  const automationAgents = new Map<number, any>();
  const calls = { create: 0, update: 0, getActivation: 0, botConfigGet: 0 };
  let nextId = 1;

  const prisma: any = {
    assistenteConfig: {
      findMany: async ({ select }: any = {}) =>
        assistenteRows.map((row) => (select?.companyId ? { companyId: row.companyId } : { ...row })),
      findUnique: async ({ where: { companyId } }: any) =>
        assistenteRows.find((row) => row.companyId === companyId) ?? null,
    },
    botConfig: {
      findMany: async ({ where }: any = {}) => {
        const domain = where?.domain;
        const ids = Array.from(roteiroByCompany.entries())
          .filter(([, v]) => (domain ? v.versions.length > 0 : true))
          .map(([companyId]) => companyId);
        return ids.map((companyId) => ({ companyId }));
      },
    },
    automationAgent: {
      findUnique: async ({ where: { companyId } }: any) => automationAgents.get(companyId) ?? null,
      create: async ({ data }: any) => {
        calls.create += 1;
        const row = { id: `aa-${nextId++}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        automationAgents.set(data.companyId, row);
        return row;
      },
      update: async ({ where: { companyId }, data }: any) => {
        calls.update += 1;
        const existing = automationAgents.get(companyId);
        const row = { ...existing, ...data, updatedAt: new Date() };
        automationAgents.set(companyId, row);
        return row;
      },
    },
  };

  const botConfigStore: any = {
    listVersions: async (companyId: number) => roteiroByCompany.get(companyId)?.versions ?? [],
    get: async (companyId: number) => {
      calls.botConfigGet += 1;
      return roteiroByCompany.get(companyId)?.payload ?? null;
    },
  };

  const botActivationService: any = {
    getActivation: async ({ companyId }: any) => {
      calls.getActivation += 1;
      if (activationThrowsFor.has(companyId)) throw new Error('activation_boom');
      return { types: { atendimento: { live: liveByCompany.get(companyId) ?? false } } };
    },
  };

  const svc = new AgentBackfillService(prisma, botConfigStore, botActivationService);
  return { svc, automationAgents, calls };
}

// ── cenário: só AssistenteConfig ────────────────────────────────────────────

test('empresa só-assistente: cria AutomationAgent com migratedFrom "assistente" e brain "ia"', async () => {
  const { svc, automationAgents, calls } = makeHarness({
    assistenteRows: [assistenteFixture({ companyId: 1, published: true })],
  });

  const summary = await svc.runBackfill({ companyId: 1 });

  assert.equal(summary.created, 1);
  assert.equal(calls.create, 1);
  const row = automationAgents.get(1);
  assert.equal(row.migratedFrom, 'assistente');
  assert.equal(row.brain, 'ia');
  assert.equal(row.published, true);
  assert.equal(row.nome, 'Bia');
  assert.equal(row.roteiroJson, '{}', 'sem BotConfig configurado, roteiroJson fica no default do schema');
  assert.equal(row.fluxoJson, assistenteFixture().fluxoJson);
});

// ── cenário: só BotConfig(atendimento_bot) ──────────────────────────────────

test('empresa só-bot: cria AutomationAgent com migratedFrom "bot" e brain "roteiro"', async () => {
  const roteiroByCompany = new Map<number, FakeRoteiroCompany>([
    [
      2,
      {
        versions: [{ version: 1, updatedByUserId: 9, createdAt: new Date('2026-07-10T00:00:00.000Z') }],
        payload: DEFAULT_ATENDIMENTO_BOT_CONFIG,
      },
    ],
  ]);
  const liveByCompany = new Map<number, boolean>([[2, true]]);
  const { svc, automationAgents, calls } = makeHarness({ roteiroByCompany, liveByCompany });

  const summary = await svc.runBackfill({ companyId: 2 });

  assert.equal(summary.created, 1);
  assert.equal(calls.create, 1);
  assert.equal(calls.getActivation, 1, 'published do roteiro vem do BotActivationService (pino ao vivo)');
  const row = automationAgents.get(2);
  assert.equal(row.migratedFrom, 'bot');
  assert.equal(row.brain, 'roteiro');
  assert.equal(row.published, true);
  assert.equal(row.nome, 'Assistente', 'sem AssistenteConfig, identidade cai nos defaults do schema');
  assert.equal(row.fluxoJson, '{}');
  const parsedRoteiro = JSON.parse(row.roteiroJson);
  assert.equal(parsedRoteiro.welcomeMessage, DEFAULT_ATENDIMENTO_BOT_CONFIG.welcomeMessage);
});

// ── cenário: os dois configurados ───────────────────────────────────────────

test('empresa com os dois: migratedFrom "ambos", brain segue resolveAgentBrain (ia preferida)', async () => {
  const roteiroByCompany = new Map<number, FakeRoteiroCompany>([
    [
      3,
      {
        versions: [{ version: 2, updatedByUserId: 1, createdAt: new Date('2026-07-11T00:00:00.000Z') }],
        payload: DEFAULT_ATENDIMENTO_BOT_CONFIG,
      },
    ],
  ]);
  const { svc, automationAgents } = makeHarness({
    assistenteRows: [assistenteFixture({ companyId: 3, published: false })],
    roteiroByCompany,
  });

  const summary = await svc.runBackfill({ companyId: 3 });

  assert.equal(summary.created, 1);
  const row = automationAgents.get(3);
  assert.equal(row.migratedFrom, 'ambos');
  assert.equal(row.brain, 'ia', 'os 2 existem sem publish -> ia preferida (mesma regra da S05)');
  assert.equal(row.published, false, 'brain ia -> published reflete AssistenteConfig.published, não o pino');
  assert.notEqual(row.roteiroJson, '{}', 'roteiro também foi migrado, mesmo brain sendo ia');
});

// ── cenário: nenhuma fonte ──────────────────────────────────────────────────

test('empresa sem nenhuma fonte: skipped_no_source, nada é criado', async () => {
  const { svc, automationAgents, calls } = makeHarness({});

  const summary = await svc.runBackfill({ companyId: 4 });

  assert.equal(summary.created, 0);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.results[0].outcome, 'skipped_no_source');
  assert.equal(calls.create, 0);
  assert.equal(automationAgents.has(4), false);
});

// ── idempotência: rodar 2x não duplica ──────────────────────────────────────

test('idempotência: rodar o backfill 2x pra mesma empresa não duplica nem regrava', async () => {
  const { svc, automationAgents, calls } = makeHarness({
    assistenteRows: [assistenteFixture({ companyId: 1, published: true })],
  });

  const first = await svc.runBackfill({ companyId: 1 });
  assert.equal(first.created, 1);
  assert.equal(calls.create, 1);

  const second = await svc.runBackfill({ companyId: 1 });
  assert.equal(second.created, 0, 'segunda rodada não cria de novo');
  assert.equal(second.results[0].outcome, 'skipped_up_to_date');
  assert.equal(calls.create, 1, 'create ainda chamado só 1 vez no total');
  assert.equal(calls.update, 0, 'sem mudança na fonte, nem update é chamado');
  assert.equal(automationAgents.size, 1, 'continua 1 única linha pra empresa 1 — sem duplicata');
});

// ── guard não regride edição/migração já sincronizada ───────────────────────

test('guard: linha existente mais nova que a fonte legada não é sobrescrita (mesmo com dado diferente)', async () => {
  const { svc, automationAgents, calls } = makeHarness({
    assistenteRows: [assistenteFixture({ companyId: 1, nome: 'Nome Antigo', updatedAt: new Date('2026-07-01T00:00:00.000Z') })],
  });
  // Simula uma linha já migrada/editada DEPOIS da última mudança na fonte
  // (ex.: edição manual futura pós-S10, ou backfill anterior) — updatedAt
  // mais novo que a fonte (2026-07-01).
  automationAgents.set(1, {
    id: 'aa-manual',
    companyId: 1,
    nome: 'Nome Editado Manualmente',
    brain: 'ia',
    migratedFrom: 'assistente',
    updatedAt: new Date('2026-07-18T00:00:00.000Z'),
  });

  const summary = await svc.runBackfill({ companyId: 1 });

  assert.equal(summary.results[0].outcome, 'skipped_up_to_date');
  assert.equal(calls.update, 0);
  assert.equal(automationAgents.get(1).nome, 'Nome Editado Manualmente', 'edição não foi regredida');
});

// ── re-sync: fonte legada mudou DEPOIS da última migração ───────────────────

test('re-sync: fonte legada mais nova que a linha existente dispara update (não é regressão, é sincronização)', async () => {
  const { svc, automationAgents, calls } = makeHarness({
    assistenteRows: [assistenteFixture({ companyId: 1, nome: 'Nome Novo', updatedAt: new Date('2026-07-20T00:00:00.000Z') })],
  });
  automationAgents.set(1, {
    id: 'aa-1',
    companyId: 1,
    nome: 'Nome Velho',
    brain: 'ia',
    migratedFrom: 'assistente',
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
  });

  const summary = await svc.runBackfill({ companyId: 1 });

  assert.equal(summary.updated, 1);
  assert.equal(calls.update, 1);
  assert.equal(automationAgents.get(1).nome, 'Nome Novo');
});

// ── dry-run: computa sem gravar ─────────────────────────────────────────────

test('dry-run (apply:false): computa o resultado mas não chama create/update', async () => {
  const { svc, automationAgents, calls } = makeHarness({
    assistenteRows: [assistenteFixture({ companyId: 1, published: true })],
  });

  const summary = await svc.runBackfill({ companyId: 1, apply: false });

  assert.equal(summary.mode, 'dry_run');
  assert.equal(summary.created, 1, 'outcome ainda é reportado como "created" (o que TERIA acontecido)');
  assert.equal(calls.create, 0, 'mas nada é escrito de verdade');
  assert.equal(automationAgents.size, 0);
});

// ── resumo agregado sem filtro de empresa ───────────────────────────────────

test('sem --company-id: descobre o universo de empresas via AssistenteConfig + BotConfig(atendimento_bot)', async () => {
  const roteiroByCompany = new Map<number, FakeRoteiroCompany>([
    [2, { versions: [{ version: 1, updatedByUserId: null, createdAt: new Date('2026-07-10T00:00:00.000Z') }], payload: DEFAULT_ATENDIMENTO_BOT_CONFIG }],
  ]);
  const { svc, automationAgents } = makeHarness({
    assistenteRows: [assistenteFixture({ companyId: 1, published: true })],
    roteiroByCompany,
  });

  const summary = await svc.runBackfill({});

  assert.equal(summary.scannedCompanies, 2);
  assert.equal(summary.created, 2);
  assert.equal(automationAgents.size, 2);
});
