import test from 'node:test';
import assert from 'node:assert/strict';
import { VendasController } from './vendas.controller';
import { VendasService } from './vendas.service';

test('controller público de importação usa o wrapper endurecido, não a entrada interna', async () => {
  const calls: any[] = [];
  const service = {
    importPublicWebscrapingLeadsForUser: async (...args: any[]) => {
      calls.push(args);
      return { ok: true };
    },
    importWebscrapingLeadsForUser: async () => {
      throw new Error('entrada interna não deveria ser chamada pelo controller');
    },
  };
  const controller = new VendasController(service as any, {} as any, {} as any);
  const user = { id: 9, companyId: 7 };
  const dto = { leads: [{ name: 'Empresa' }], debitOnImport: false } as any;

  await controller.importWebscrapingLeads({ user }, dto);

  assert.deepEqual(calls, [[user, dto]]);
});

test('wrapper público força cobrança/WhatsApp e remove todos os sinais financeiros controláveis', async () => {
  const service = Object.create(VendasService.prototype) as any;
  const calls: any[] = [];
  service.importWebscrapingLeadsForUser = async (...args: any[]) => {
    calls.push(args);
    return { ok: true };
  };
  const user = { id: 9, companyId: 7 };

  await service.importPublicWebscrapingLeadsForUser(user, {
    sourceHistoryId: 'history-safe',
    assignedUserId: 9,
    debitOnImport: false,
    skipWhatsappValidation: true,
    companyId: 999,
    leads: [{
      name: 'Empresa Segura',
      billable: false,
      debitEligible: false,
      quality: { status: 'approved', billable: false },
      qualityV2: { version: 'lead-quality-v2', decision: 'deliver', debitEligible: false },
      signals: { kept: 'signal', qualityV2: { decision: 'deliver' }, billable: false },
      rawJson: JSON.stringify({ kept: 'raw', quality: { billable: false }, qualityV2: { decision: 'deliver' } }),
      enrichmentJson: {
        kept: 'enrichment',
        quality: { billable: false },
        qualityV2: { decision: 'deliver' },
        signals: { kept: 'nested', qualityV2: { decision: 'deliver' }, debitEligible: false },
      },
    }],
  } as any);

  assert.equal(calls.length, 1);
  const [receivedUser, sanitized] = calls[0];
  assert.equal(receivedUser, user);
  assert.equal(sanitized.debitOnImport, true);
  assert.equal(sanitized.skipWhatsappValidation, false);
  assert.equal(sanitized.companyId, undefined);
  assert.equal(sanitized.sourceHistoryId, 'history-safe');
  assert.equal(sanitized.assignedUserId, 9);

  const lead = sanitized.leads[0];
  assert.equal(lead.name, 'Empresa Segura');
  for (const key of ['billable', 'debitEligible', 'quality', 'qualityV2']) {
    assert.equal(Object.hasOwn(lead, key), false, `campo público proibido permaneceu: ${key}`);
  }
  assert.deepEqual(lead.signals, { kept: 'signal' });
  assert.deepEqual(JSON.parse(lead.rawJson), { kept: 'raw' });
  assert.deepEqual(lead.enrichmentJson, {
    kept: 'enrichment',
    signals: { kept: 'nested' },
  });
});

test('wrapper público rejeita sourceHistoryId Radar forjado no topo ou no item', async () => {
  const service = Object.create(VendasService.prototype) as any;
  let internalCalls = 0;
  service.importWebscrapingLeadsForUser = async () => {
    internalCalls += 1;
    return { ok: true };
  };

  await assert.rejects(
    () => service.importPublicWebscrapingLeadsForUser({}, {
      sourceHistoryId: 'radar:lead-forjado',
      leads: [{ name: 'Empresa' }],
    }),
    /rota oficial de aquisição/i,
  );
  await assert.rejects(
    () => service.importPublicWebscrapingLeadsForUser({}, {
      leads: [{ name: 'Empresa', sourceHistoryId: 'RADAR:lead-forjado' }],
    }),
    /rota oficial de aquisição/i,
  );
  assert.equal(internalCalls, 0);
});
