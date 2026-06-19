import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTrialPhoneAvailableTx, ensureTrialDocumentAvailableTx, reserveTrialUsageTx } from './trial-usage';

function buildTx(opts: {
  phoneRow?: any;
  docRow?: any;
  companyExists?: boolean;
} = {}) {
  const creates: any[] = [];
  const updates: any[] = [];
  const tx = {
    trialPhoneUsage: {
      findUnique: async () => opts.phoneRow ?? null,
      findFirst: async () => opts.docRow ?? null,
      create: async (args: any) => { creates.push(args.data); return { id: 99, ...args.data }; },
      update: async (args: any) => { updates.push(args); return { id: args.where.id, ...args.data }; },
    },
    company: {
      findUnique: async () => (opts.companyExists === false ? null : { id: 1 }),
    },
  };
  return { tx, creates, updates };
}

test('ensureTrialPhoneAvailableTx: sem registro → null (livre)', async () => {
  const { tx } = buildTx({ phoneRow: null });
  assert.equal(await ensureTrialPhoneAvailableTx(tx, 7, '5519999990000', 'activate'), null);
});

test('ensureTrialPhoneAvailableTx: mesma empresa → devolve registro (não bloqueia)', async () => {
  const { tx } = buildTx({ phoneRow: { id: 3, companyId: 7 } });
  const r = await ensureTrialPhoneAvailableTx(tx, 7, '5519999990000', 'activate');
  assert.equal(r.id, 3);
});

test('ensureTrialPhoneAvailableTx: OUTRA empresa viva → 409 TRIAL_PHONE_ALREADY_USED', async () => {
  const { tx } = buildTx({ phoneRow: { id: 3, companyId: 42 }, companyExists: true });
  await assert.rejects(
    () => ensureTrialPhoneAvailableTx(tx, 7, '5519999990000', 'activate'),
    (err: any) => { assert.equal(err.getResponse().code, 'TRIAL_PHONE_ALREADY_USED'); return true; },
  );
});

test('ensureTrialPhoneAvailableTx: outra empresa APAGADA → libera (devolve registro)', async () => {
  const { tx } = buildTx({ phoneRow: { id: 3, companyId: 42 }, companyExists: false });
  const r = await ensureTrialPhoneAvailableTx(tx, 7, '5519999990000', 'activate');
  assert.equal(r.id, 3);
});

test('ensureTrialDocumentAvailableTx: CPF de OUTRA empresa viva → 409', async () => {
  const { tx } = buildTx({ docRow: { companyId: 42 }, companyExists: true });
  await assert.rejects(
    () => ensureTrialDocumentAvailableTx(tx, 7, '52998224725'),
    (err: any) => { assert.equal(err.getResponse().code, 'TRIAL_TAX_DOCUMENT_ALREADY_USED'); return true; },
  );
});

test('ensureTrialDocumentAvailableTx: sem CPF → no-op', async () => {
  const { tx } = buildTx({});
  assert.equal(await ensureTrialDocumentAvailableTx(tx, 7, null), undefined);
});

test('reserveTrialUsageTx: telefone novo → cria registro com a empresa', async () => {
  const { tx, creates } = buildTx({ phoneRow: null });
  await reserveTrialUsageTx(tx, {
    companyId: 7,
    phoneNormalized: '5519999990000',
    taxDocumentNormalized: '52998224725',
    contactName: 'Dono',
    selectedPlanKey: 'hbx_padrao',
    source: 'checkout_trial',
    mode: 'activate',
  });
  assert.equal(creates.length, 1);
  assert.equal(creates[0].phoneNormalized, '5519999990000');
  assert.equal(creates[0].companyId, 7);
  assert.equal(creates[0].taxDocumentNormalized, '52998224725');
});

test('reserveTrialUsageTx: telefone da MESMA empresa → atualiza (idempotente)', async () => {
  const { tx, updates, creates } = buildTx({ phoneRow: { id: 3, companyId: 7 } });
  await reserveTrialUsageTx(tx, {
    companyId: 7,
    phoneNormalized: '5519999990000',
    source: 'checkout_trial',
  });
  assert.equal(creates.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].where.id, 3);
});
