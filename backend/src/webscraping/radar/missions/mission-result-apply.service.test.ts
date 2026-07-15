import test from 'node:test';
import assert from 'node:assert/strict';
import { MissionResultApplyService } from './mission-result-apply.service';
import { LeadContactWriteService } from '../persistence/lead-contact-write.service';

// Fake prisma mínimo: leadContact (gate write path) + radarLeadPool (nota) + hasTable.
function createFakePrisma(seedLead?: { id: string; metadataJson?: string | null }) {
  const contacts: any[] = [];
  const leads: any[] = seedLead ? [{ ...seedLead }] : [];
  const tableSet = new Set(['RadarLeadPool', 'LeadContact']);
  const fake: any = {
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
    radarLeadCompanyState: {
      findUnique: async ({ where }: any) => {
        const id = where.companyId_radarLeadId.radarLeadId;
        return { paidClaimOperationId: `op-${id}`, claimUsageKey: `usage-${id}`, acquiredAt: new Date() };
      },
    },
    radarLeadProcessRun: { findFirst: async ({ where }: any) => ({ id: where.id }) },
    creditLedgerEntry: { findFirst: async ({ where }: any) => where.kind === 'debit' ? { id: 'debit-1' } : null },
    vendasLead: { findUnique: async () => ({ id: 'card-1', companyId: 1 }) },
  };
  fake.$transaction = async (callback: (tx: any) => Promise<any>) => callback(fake);
  return fake;
}

function buildService(prisma: any) {
  const write = new LeadContactWriteService();
  const svc = new MissionResultApplyService(prisma as any, write);
  return svc;
}

// Fonte que CONTÉM literalmente o telefone/e-mail (gate de proveniência precisa disso).
const SOURCE_WITH_CONTACTS = 'Fale conosco: (11) 3222-4455 ou contato@acme.com.br. Endereço: Rua X, 100.';

function paidPayload(radarLeadId: string) {
  return {
    companyId: 1,
    radarLeadId,
    claimOperationId: `op-${radarLeadId}`,
    claimUsageKey: `usage-${radarLeadId}`,
  };
}

test('E1 apply enrich_lead: contatos LITERAIS passam pelo gate e gravam com source ai_extraction', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  const out = await svc.apply({
    stage: 'enrich_lead',
    payload: paidPayload('lead-1'),
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
    payload: paidPayload('lead-2'),
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
    payload: paidPayload('lead-3'),
    result: { telefones: ['(11) 3222-4455'], emails: [], nome_dono: null, sourceText: SOURCE_WITH_CONTACTS },
  };
  const first = await svc.apply(args);
  const second = await svc.apply(args);
  assert.equal(first.written, 1);
  assert.equal(second.written, 0);
  assert.equal(second.skipped, 1, 'segunda aplicação pula o já existente');
  assert.equal(prisma.contacts.length, 1);
});

test('P0 apply: refund revoga a prova e nenhum contato volta a ser gravado', async () => {
  const prisma = createFakePrisma();
  prisma.creditLedgerEntry.findFirst = async ({ where }: any) => ({ id: where.kind === 'refund' ? 'refund-1' : 'debit-1' });
  const out = await buildService(prisma).apply({
    stage: 'enrich_lead',
    payload: paidPayload('lead-refunded'),
    result: { telefones: ['(11) 3222-4455'], sourceText: SOURCE_WITH_CONTACTS },
  });
  assert.equal(out.applied, false);
  assert.equal(out.reason, 'paid_proof_debit_refunded');
  assert.equal(prisma.contacts.length, 0);
});

test('P0 apply: worker nao redireciona resultado para outro lead', async () => {
  const prisma = createFakePrisma();
  const out = await buildService(prisma).apply({
    stage: 'enrich_lead',
    payload: paidPayload('lead-comprado'),
    result: { radarLeadId: 'lead-alheio', telefones: ['(11) 3222-4455'], sourceText: SOURCE_WITH_CONTACTS },
  });
  assert.equal(out.applied, true);
  assert.equal(prisma.contacts[0].radarLeadId, 'lead-comprado');
});

test('E1 apply xray_note: nota + resumo gravam no metadataJson (bloco aiNote), aditivo', async () => {
  const prisma = createFakePrisma({ id: 'lead-4', metadataJson: JSON.stringify({ cnpj: '123', existente: true }) });
  const svc = buildService(prisma);
  const out = await svc.apply({
    stage: 'xray_note',
    payload: paidPayload('lead-4'),
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
  const out = await svc.apply({ stage: 'xray_note', payload: paidPayload('lead-5'), result: { notaIcp: null, resumo: null } });
  assert.equal(out.applied, true);
  assert.equal(out.reason, 'nota_nula_noop');
  const meta = JSON.parse(prisma.leads[0].metadataJson);
  assert.equal(meta.aiNote.notaIcp, 90, 'nota anterior preservada');
});

test('E1 apply xray_note: idempotente — reaplicar sobrescreve o mesmo bloco, não duplica', async () => {
  const prisma = createFakePrisma({ id: 'lead-6', metadataJson: null });
  const svc = buildService(prisma);
  await svc.apply({ stage: 'xray_note', payload: paidPayload('lead-6'), result: { notaIcp: 40, resumo: 'a' } });
  await svc.apply({ stage: 'xray_note', payload: paidPayload('lead-6'), result: { notaIcp: 55, resumo: 'b' } });
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

test('E1 apply: stage desconhecido falha fechado sem alias/noop', async () => {
  const prisma = createFakePrisma();
  const svc = buildService(prisma);
  await assert.rejects(
    () => svc.apply({ stage: 'legacy_stage', payload: {}, result: {} }),
    /RADAR_MISSION_STAGE_BLOCKED:legacy_stage/,
  );
});
