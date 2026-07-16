import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionResultApplyService } from './mission-result-apply.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';

// Fake prisma mínimo: leadContact (gate write path) + hasTable.
function createFakePrisma() {
  const contacts: any[] = [];
  const tableSet = new Set(['LeadContact']);
  return {
    contacts,
    hasTable: async (name: string) => tableSet.has(name),
    leadContact: {
      findFirst: async ({ where }: any) =>
        contacts.find((c) => c.radarLeadId === where.radarLeadId && c.kind === where.kind && c.valueNormalized === where.valueNormalized) || null,
      create: async ({ data }: any) => { contacts.push({ id: `c${contacts.length + 1}`, ...data }); return data; },
    },
  };
}

function buildService(prisma: any) {
  const write = new LeadContactWriteService();
  const svc = new MissionResultApplyService(prisma as any, write);
  return svc;
}

// Fonte que CONTÉM literalmente o telefone/e-mail (gate de proveniência precisa disso).
const SOURCE_WITH_CONTACTS = 'Fale conosco: (11) 3222-4455 ou contato@acme.com.br. Endereço: Rua X, 100.';

test('E1 apply enrich_lead: contatos LITERAIS passam pelo gate e gravam com source ai_extraction', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  const out = await svc.apply({
    stage: 'enrich_lead',
    payload: { radarLeadId: 'lead-1' },
    result: { telefones: ['(11) 3222-4455'], emails: ['contato@acme.com.br'], nome_dono: null, sourceText: SOURCE_WITH_CONTACTS },
  });
  assert.equal(out.applied, true);
  assert.equal(out.kind, 'contacts');
  assert.equal(out.written, 2);
  assert.equal(prisma.contacts.length, 2);
  assert.ok(prisma.contacts.every((c: any) => c.source === 'ai_extraction' && c.confidence === 60));
});

test('E1 apply enrich_lead: telefone ALUCINADO (não está na fonte) é REPROVADO pelo gate no backend', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  const out = await svc.apply({
    stage: 'enrich_lead',
    payload: { radarLeadId: 'lead-2' },
    result: { telefones: ['(11) 99999-0000'], emails: [], nome_dono: null, sourceText: SOURCE_WITH_CONTACTS },
  });
  assert.equal(out.applied, true);
  assert.equal(out.written, 0, 'nada grava — gate reprova o que não existe na fonte');
  assert.equal(out.rejected! >= 1, true);
  assert.equal(prisma.contacts.length, 0);
});

test('E1 apply enrich_lead: idempotente — reaplicar a mesma missão não duplica contato', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  const args = {
    stage: 'enrich_lead' as const,
    payload: { radarLeadId: 'lead-3' },
    result: { telefones: ['(11) 3222-4455'], emails: [], nome_dono: null, sourceText: SOURCE_WITH_CONTACTS },
  };
  const first = await svc.apply(args);
  const second = await svc.apply(args);
  assert.equal(first.written, 1);
  assert.equal(second.written, 0);
  assert.equal(second.skipped, 1, 'segunda aplicação pula o já existente');
  assert.equal(prisma.contacts.length, 1);
});

test('E1 apply: stage da fábrica (não-ponte) → noop applied true (complete segue normal)', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  const out = await svc.apply({ stage: 'card', payload: {}, result: {} });
  assert.equal(out.applied, true);
  assert.equal(out.kind, 'noop');
});
