import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NUCLEO_INGESTAO_FLAG,
  extractCnpjFromRadarLead,
  materializeNucleoFromRadarLead,
  nucleoIngestaoEnabled,
  type NucleoIngestaoDeps,
} from './nucleo-ingestao';

// ── Fakes ──────────────────────────────────────────────────────────────────
function buildCadastroSpy() {
  const calls = {
    upsertConta: [] as any[],
    upsertContato: [] as any[],
  };
  const cadastro: NucleoIngestaoDeps['cadastro'] = {
    upsertContaFromCnpj: async (input: any) => {
      calls.upsertConta.push(input);
      return 'conta-1';
    },
    upsertContatoPrincipal: async (input: any) => {
      calls.upsertContato.push(input);
      return 'contato-1';
    },
  };
  return { cadastro, calls };
}

function withEnv(name: string, value: string | undefined, run: () => Promise<void>) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

const RADAR_ROW_WITH_CNPJ = {
  sourceUrl: 'internal://cnpj-base/12345678000199',
  name: 'Padaria do Zé',
  city: 'Fortaleza',
  state: 'CE',
};

// ── Extração do CNPJ ─────────────────────────────────────────────────────────
test('extractCnpjFromRadarLead: pega o CNPJ do sourceUrl internal://cnpj-base/<cnpj>', () => {
  assert.equal(extractCnpjFromRadarLead(RADAR_ROW_WITH_CNPJ), '12345678000199');
});

test('extractCnpjFromRadarLead: pega do evidenceJson quando não há sourceUrl', () => {
  assert.equal(
    extractCnpjFromRadarLead({ evidenceJson: JSON.stringify({ evidence: { cnpj: '98765432000155' } }) }),
    '98765432000155',
  );
});

test('extractCnpjFromRadarLead: lead web (sem CNPJ) devolve string vazia', () => {
  assert.equal(extractCnpjFromRadarLead({ sourceUrl: 'https://maps.google.com/x', name: 'Loja' }), '');
});

// ── FLAG OFF (default) — NÃO chama upsert ────────────────────────────────────
test('flag OFF (ausente): pull NÃO materializa Conta — upsertContaFromCnpj não é chamado', async () => {
  await withEnv(NUCLEO_INGESTAO_FLAG, undefined, async () => {
    assert.equal(nucleoIngestaoEnabled(), false);
    const { cadastro, calls } = buildCadastroSpy();
    const out = await materializeNucleoFromRadarLead({ cadastro }, 7, RADAR_ROW_WITH_CNPJ);
    assert.equal(out.status, 'skipped');
    assert.equal(out.reason, 'flag_off');
    assert.equal(calls.upsertConta.length, 0, 'upsertContaFromCnpj NÃO pode ser chamado com a flag OFF');
    assert.equal(calls.upsertContato.length, 0);
  });
});

test('flag explicitamente "false": também não chama upsert', async () => {
  await withEnv(NUCLEO_INGESTAO_FLAG, 'false', async () => {
    const { cadastro, calls } = buildCadastroSpy();
    const out = await materializeNucleoFromRadarLead({ cadastro }, 7, RADAR_ROW_WITH_CNPJ);
    assert.equal(out.status, 'skipped');
    assert.equal(calls.upsertConta.length, 0);
  });
});

// ── FLAG ON — chama upsertContaFromCnpj 1× ───────────────────────────────────
test('flag ON: pull materializa Conta — upsertContaFromCnpj chamado EXATAMENTE 1×', async () => {
  await withEnv(NUCLEO_INGESTAO_FLAG, 'true', async () => {
    assert.equal(nucleoIngestaoEnabled(), true);
    const { cadastro, calls } = buildCadastroSpy();
    const out = await materializeNucleoFromRadarLead({ cadastro }, 7, RADAR_ROW_WITH_CNPJ);
    assert.equal(out.status, 'materialized');
    assert.equal(calls.upsertConta.length, 1, 'upsertContaFromCnpj deve ser chamado 1×');
    const contaInput = calls.upsertConta[0];
    assert.equal(contaInput.companyId, 7);
    assert.equal(contaInput.cnpj, '12345678000199');
    assert.equal(contaInput.isLead, true);
    assert.equal(contaInput.origin, 'radar');
    // Sem base RFB (loadCnpjPublic ausente) e sem ownerName → não cria Contato (não inventa dono).
    assert.equal(calls.upsertContato.length, 0);
  });
});

test('flag ON + base RFB com ownerName: cria Conta(1×) e Contato(dono, 1×) com source cnpj_socio', async () => {
  await withEnv(NUCLEO_INGESTAO_FLAG, 'true', async () => {
    const { cadastro, calls } = buildCadastroSpy();
    const deps: NucleoIngestaoDeps = {
      cadastro,
      loadCnpjPublic: async (cnpj: string) => ({
        cnpj,
        razaoSocial: 'ZE PADARIA LTDA',
        nomeFantasia: 'Padaria do Zé',
        ownerName: 'José da Silva',
        ownerQualification: 'Sócio-Administrador',
        address: 'Rua A, 100',
        city: 'Fortaleza',
        state: 'CE',
      }),
    };
    const out = await materializeNucleoFromRadarLead(deps, 7, RADAR_ROW_WITH_CNPJ);
    assert.equal(out.status, 'materialized');
    assert.equal(calls.upsertConta.length, 1);
    assert.equal(calls.upsertConta[0].nome, 'Padaria do Zé'); // nome do lugar → Conta
    assert.equal(calls.upsertContato.length, 1);
    assert.equal(calls.upsertContato[0].nome, 'José da Silva'); // nome do dono → Contato
    assert.equal(calls.upsertContato[0].cargo, 'Sócio-Administrador');
    assert.equal(calls.upsertContato[0].source, 'cnpj_socio');
    assert.equal(calls.upsertContato[0].customerProfileId, 'conta-1');
  });
});

test('flag ON + lead SEM cnpj (web): não chama upsert (skip no_cnpj)', async () => {
  await withEnv(NUCLEO_INGESTAO_FLAG, 'true', async () => {
    const { cadastro, calls } = buildCadastroSpy();
    const out = await materializeNucleoFromRadarLead({ cadastro }, 7, { sourceUrl: 'https://x.com', name: 'Web' });
    assert.equal(out.status, 'skipped');
    assert.equal(out.reason, 'no_cnpj');
    assert.equal(calls.upsertConta.length, 0);
  });
});

test('NUNCA lança: se upsertContaFromCnpj estourar, devolve status error (não propaga)', async () => {
  const cadastro: NucleoIngestaoDeps['cadastro'] = {
    upsertContaFromCnpj: async () => {
      throw new Error('boom');
    },
    upsertContatoPrincipal: async () => 'x',
  };
  const out = await materializeNucleoFromRadarLead({ cadastro, enabled: true }, 7, RADAR_ROW_WITH_CNPJ);
  assert.equal(out.status, 'error');
});

// ── Idempotência de contrato: puxar 2× chama o upsert 2× (que dedup no banco) ──
test('puxar o mesmo lead 2× chama upsertContaFromCnpj 2× (dedup é no serviço, por cnpj)', async () => {
  const { cadastro, calls } = buildCadastroSpy();
  const deps: NucleoIngestaoDeps = { cadastro, enabled: true };
  await materializeNucleoFromRadarLead(deps, 7, RADAR_ROW_WITH_CNPJ);
  await materializeNucleoFromRadarLead(deps, 7, RADAR_ROW_WITH_CNPJ);
  assert.equal(calls.upsertConta.length, 2);
  assert.equal(calls.upsertConta[0].cnpj, calls.upsertConta[1].cnpj);
});
