import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionResultApplyService } from './mission-result-apply.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';

// Fake prisma mínimo: leadContact (gate write path) + radarLeadPool (nota) + hasTable.
function createFakePrisma(seedLead?: { id: string; metadataJson?: string | null }) {
  const contacts: any[] = [];
  const leads: any[] = seedLead ? [{ ...seedLead }] : [];
  const tableSet = new Set(['RadarLeadPool', 'LeadContact']);
  return {
    contacts,
    leads,
    hasTable: async (name: string) => tableSet.has(name),
    leadContact: {
      findFirst: async ({ where }: any) =>
        contacts.find((c) => c.radarLeadId === where.radarLeadId && c.kind === where.kind && c.valueNormalized === where.valueNormalized) || null,
      create: async ({ data }: any) => { contacts.push({ id: `c${contacts.length + 1}`, ...data }); return data; },
    },
    radarLeadPool: {
      findUnique: async ({ where }: any) => leads.find((l) => l.id === where.id) || null,
      update: async ({ where, data }: any) => {
        const l = leads.find((x) => x.id === where.id);
        if (!l) throw new Error('not found');
        Object.assign(l, data);
        return l;
      },
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

test('E1 apply xray_note: nota + resumo gravam no metadataJson (bloco aiNote), aditivo', async () => {
  const prisma = createFakePrisma({ id: 'lead-4', metadataJson: JSON.stringify({ cnpj: '123', existente: true }) });
  const svc = buildService(prisma);
  const out = await svc.apply({
    stage: 'xray_note',
    payload: { radarLeadId: 'lead-4' },
    result: { notaIcp: 72, resumo: 'empresa ativa com canais', model: 'qwen3:30b' },
  });
  assert.equal(out.applied, true);
  assert.equal(out.kind, 'note');
  const meta = JSON.parse(prisma.leads[0].metadataJson);
  assert.equal(meta.aiNote.notaIcp, 72);
  assert.equal(meta.aiNote.resumo, 'empresa ativa com canais');
  assert.equal(meta.aiNote.source, 'ponte_30b');
  assert.equal(meta.existente, true, 'não apaga o metadata anterior (aditivo)');
});

test('E1 apply xray_note: nota null → noop, NÃO zera nota existente', async () => {
  const prisma = createFakePrisma({ id: 'lead-5', metadataJson: JSON.stringify({ aiNote: { notaIcp: 90 } }) });
  const svc = buildService(prisma);
  const out = await svc.apply({ stage: 'xray_note', payload: { radarLeadId: 'lead-5' }, result: { notaIcp: null, resumo: null } });
  assert.equal(out.applied, true);
  assert.equal(out.reason, 'nota_nula_noop');
  const meta = JSON.parse(prisma.leads[0].metadataJson);
  assert.equal(meta.aiNote.notaIcp, 90, 'nota anterior preservada');
});

test('E1 apply xray_note: idempotente — reaplicar sobrescreve o mesmo bloco, não duplica', async () => {
  const prisma = createFakePrisma({ id: 'lead-6', metadataJson: null });
  const svc = buildService(prisma);
  await svc.apply({ stage: 'xray_note', payload: { radarLeadId: 'lead-6' }, result: { notaIcp: 40, resumo: 'a' } });
  await svc.apply({ stage: 'xray_note', payload: { radarLeadId: 'lead-6' }, result: { notaIcp: 55, resumo: 'b' } });
  const meta = JSON.parse(prisma.leads[0].metadataJson);
  assert.equal(meta.aiNote.notaIcp, 55, 'última aplicação vence, bloco único');
  assert.equal(Object.keys(meta).length, 1, 'só o bloco aiNote, sem duplicação');
});

test('E1 apply: lead sem id → applied false, não-retryable (payload ruim)', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  const out = await svc.apply({ stage: 'xray_note', payload: {}, result: { notaIcp: 50 } });
  assert.equal(out.applied, false);
  assert.equal(out.reason, 'lead_id_ausente');
});

test('E1 apply: stage da fábrica (não-ponte) → noop applied true (complete segue normal)', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  const out = await svc.apply({ stage: 'card', payload: {}, result: {} });
  assert.equal(out.applied, true);
  assert.equal(out.kind, 'noop');
});
