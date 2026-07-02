import test from 'node:test';
import assert from 'node:assert/strict';

import { AtividadesService } from './atividades.service';

type PrismaOverrides = Record<string, any>;

function createPrisma(overrides: PrismaOverrides = {}) {
  const created: any[] = [];
  const timeline: any[] = [];
  const prisma = {
    _created: created,
    _timeline: timeline,
    vendasLead: {
      findFirst: async () => ({ id: 'lead-1', companyId: 7, assignedUserId: 42, createdByUserId: 42 }),
      updateMany: async () => ({ count: 1 }),
      ...(overrides.vendasLead || {}),
    },
    vendasLeadTimelineEvent: {
      create: async ({ data }: any) => {
        timeline.push(data);
        return data;
      },
      ...(overrides.vendasLeadTimelineEvent || {}),
    },
    atividade: {
      create: async ({ data }: any) => {
        const row = { id: `ativ-${created.length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        created.push(row);
        return row;
      },
      findFirst: async () => null,
      findMany: async () => [],
      update: async ({ where, data }: any) => ({ id: where.id, ...data }),
      delete: async () => ({}),
      ...(overrides.atividade || {}),
    },
  } as any;
  return prisma;
}

// -------- HOOK WORM-13: createFromAutomation --------

test('createFromAutomation cria atividade com criadaPor=automacao e herda responsavel do card', async () => {
  const prisma = createPrisma();
  const service = new AtividadesService(prisma);

  const result = await service.createFromAutomation({
    leadId: 'lead-1',
    companyId: 7,
    titulo: 'Ligar em 2 dias',
    vencimento: new Date('2026-07-05T14:00:00.000Z').toISOString(),
  });

  assert.equal(prisma._created.length, 1);
  const row = prisma._created[0];
  assert.equal(row.criadaPor, 'automacao');
  assert.equal(row.companyId, 7);
  assert.equal(row.leadId, 'lead-1');
  assert.equal(row.responsavelId, 42, 'herda o assignedUserId do card');
  assert.equal(result.tipo, 'ligacao');
  assert.equal(result.pendente, true);
});

test('createFromAutomation com origin=ia marca criadaPor=ia', async () => {
  const prisma = createPrisma();
  const service = new AtividadesService(prisma);
  await service.createFromAutomation({
    leadId: 'lead-1',
    companyId: 7,
    titulo: 'Follow-up sugerido',
    vencimento: new Date('2026-07-05T14:00:00.000Z').toISOString(),
    origin: 'ia',
  });
  assert.equal(prisma._created[0].criadaPor, 'ia');
});

test('createFromAutomation recusa card fora da empresa', async () => {
  const prisma = createPrisma({ vendasLead: { findFirst: async () => null } });
  const service = new AtividadesService(prisma);
  await assert.rejects(
    () => service.createFromAutomation({ leadId: 'x', companyId: 7, titulo: 't', vencimento: new Date().toISOString() }),
    /nao encontrado/i,
  );
});

test('createFromAutomation recusa vencimento invalido', async () => {
  const prisma = createPrisma();
  const service = new AtividadesService(prisma);
  await assert.rejects(
    () => service.createFromAutomation({ leadId: 'lead-1', companyId: 7, titulo: 't', vencimento: 'nao-e-data' }),
    /vencimento invalido/i,
  );
});

// -------- Helpers puros (normalizacao / rotulo) --------

test('normalizeTipo cai para ligacao em valor invalido', () => {
  const service = new AtividadesService(createPrisma());
  const norm = (service as any).normalizeTipo.bind(service);
  assert.equal(norm('reuniao'), 'reuniao');
  assert.equal(norm('VISITA'), 'visita');
  assert.equal(norm('qualquer-coisa'), 'ligacao');
  assert.equal(norm(undefined), 'ligacao');
});

test('canonicalResultLabel mapeia sim/nao/remarcar e texto livre vira outro', () => {
  const service = new AtividadesService(createPrisma());
  const label = (service as any).canonicalResultLabel.bind(service);
  assert.equal(label('sim'), 'sim');
  assert.equal(label('Remarcar'), 'remarcar');
  assert.equal(label('cliente pediu retorno'), 'outro');
  assert.equal(label(''), null);
  assert.equal(label(null), null);
});

test('serialize marca atrasada quando vencimento passou e pendente', () => {
  const service = new AtividadesService(createPrisma());
  const serialize = (service as any).serialize.bind(service);
  const past = {
    id: 'a1', leadId: 'lead-1', companyId: 7, tipo: 'ligacao', titulo: 't',
    vencimento: new Date(Date.now() - 3600_000), duracao: null, responsavelId: 42,
    realizadaEm: null, resultado: null, criadaPor: 'user', createdAt: new Date(), updatedAt: new Date(),
  };
  const view = serialize(past);
  assert.equal(view.pendente, true);
  assert.equal(view.atrasada, true);
  assert.equal(view.diaInteiro, true, 'duracao null => dia inteiro');

  const done = { ...past, realizadaEm: new Date() };
  const viewDone = serialize(done);
  assert.equal(viewDone.pendente, false);
  assert.equal(viewDone.atrasada, false);
});

// -------- Escopo (buildAccessWhere) — polaridade own vs company --------

test('buildAccessWhere: quem gere equipe ve a empresa toda; vendedor comum so o proprio', () => {
  const service = new AtividadesService(createPrisma());
  const build = (service as any).buildAccessWhere.bind(service);

  const manager = build({ companyId: 7, userId: 42, canViewCompanyCards: true, canViewOwnCards: true }, { id: 'x' });
  assert.equal(manager.companyId, 7);
  assert.equal(manager.responsavelId, undefined, 'gerente nao filtra por responsavel');
  assert.equal(manager.id, 'x');

  const seller = build({ companyId: 7, userId: 42, canViewCompanyCards: false, canViewOwnCards: true });
  assert.equal(seller.responsavelId, 42, 'vendedor ve so as proprias');

  const blocked = build({ companyId: 7, userId: 42, canViewCompanyCards: false, canViewOwnCards: false });
  assert.deepEqual(blocked.id, { in: [] }, 'sem leitura de card => nada');
});
