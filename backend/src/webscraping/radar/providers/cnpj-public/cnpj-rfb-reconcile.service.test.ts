import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjRfbReconcileService } from './cnpj-rfb-reconcile.service';

// F3 REFUNDAÇÃO (28/07) — regressão dos casos REAIS: "EDR Imobiliária" e "Galmare Planejados"
// saíram na vitrine como "distribuidora de água" (o card herdava o texto DIGITADO na busca).
// A reconciliação ancora o candidato web na RFB local e a categoria passa a ser FATO (CNAE)
// ou "não confirmado" com categoria vazia — nunca o carimbo da busca.

type Row = Record<string, unknown>;

function fakePrisma(handler: (args: Record<string, any>) => Row[] | Promise<Row[]>) {
  return {
    cnpjPublicCompany: {
      // O mock devolve linhas parciais de propósito (cada teste monta só os campos
      // que interessam); o cast mantém o build ESTRITO do backend verde sem afrouxar
      // o tipo real de RfbRow no serviço.
      findMany: async (args: Record<string, any>) => (await handler(args)) as never[],
    },
  };
}

const EDR_ROW: Row = {
  cnpj: '11222333000181',
  razaoSocial: 'EDR NEGOCIOS IMOBILIARIOS LTDA',
  nomeFantasia: 'EDR IMOBILIARIA',
  cnae: '6821801',
  cnaeDescription: 'Corretagem na compra e venda e avaliacao de imoveis',
  normalizedCity: 'zacarias',
  state: 'SP',
  searchText: 'edr imobiliaria edr negocios imobiliarios ltda corretagem na compra e venda e avaliacao de imoveis',
  situacao: 'ativa',
  phoneShareCount: 1,
};

test('F3: "EDR Imobiliária" pesquisada como "distribuidora de agua" — match por TELEFONE herda o CNAE real', async () => {
  const service = new CnpjRfbReconcileService();
  const prisma = fakePrisma((args) => {
    if (args?.where?.phoneDigits === '18999990001') return [EDR_ROW];
    return [];
  });
  const candidate: Record<string, unknown> = {
    name: 'EDR Imobiliária',
    phoneDigits: '18999990001',
    segment: 'distribuidora de agua',
  };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'matched');
  assert.equal(outcome.matchedBy, 'phone');
  service.applyOutcomeToCandidate(candidate, outcome);
  assert.equal(candidate.businessCategory, 'Corretagem na compra e venda e avaliacao de imoveis');
  assert.equal(candidate.businessCategoryStatus, 'cnae');
  assert.equal(candidate.cnpj, '11222333000181');
  // O carimbo da busca NUNCA vira categoria.
  assert.notEqual(candidate.businessCategory, 'distribuidora de agua');
});

test('F3: "Galmare Planejados" — match por NOME+CIDADE (tokens do nome, cidade indexada)', async () => {
  const service = new CnpjRfbReconcileService();
  const row: Row = {
    cnpj: '22333444000155',
    razaoSocial: 'GALMARE MOVEIS PLANEJADOS LTDA',
    nomeFantasia: 'GALMARE PLANEJADOS',
    cnae: '3101200',
    cnaeDescription: 'Fabricacao de moveis com predominancia de madeira',
    normalizedCity: 'zacarias',
    state: 'SP',
    searchText: 'galmare planejados galmare moveis planejados ltda fabricacao de moveis com predominancia de madeira',
    situacao: 'ativa',
    phoneShareCount: 0,
  };
  const prisma = fakePrisma((args) => {
    if (args?.where?.phoneDigits) return [];
    if (args?.where?.normalizedCity === 'zacarias') return [row];
    return [];
  });
  const candidate: Record<string, unknown> = { name: 'Galmare Planejados', phoneDigits: '' };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'matched');
  assert.equal(outcome.matchedBy, 'name_city');
  service.applyOutcomeToCandidate(candidate, outcome);
  assert.equal(candidate.businessCategory, 'Fabricacao de moveis com predominancia de madeira');
  assert.equal(candidate.businessCategoryStatus, 'cnae');
});

test('F3: padaria real com CNAE de padaria PASSA com a categoria real', async () => {
  const service = new CnpjRfbReconcileService();
  const row: Row = {
    cnpj: '33444555000166',
    razaoSocial: 'PADARIA SAO JOAO DE ZACARIAS LTDA',
    nomeFantasia: 'PADARIA SAO JOAO',
    cnae: '1091102',
    cnaeDescription: 'Fabricacao de produtos de padaria e confeitaria com predominancia de producao propria',
    normalizedCity: 'zacarias',
    state: 'SP',
    searchText: 'padaria sao joao padaria sao joao de zacarias ltda fabricacao de produtos de padaria e confeitaria',
    situacao: 'ativa',
    phoneShareCount: 1,
  };
  const prisma = fakePrisma((args) => (args?.where?.phoneDigits === '18333310001' ? [row] : []));
  const candidate: Record<string, unknown> = { name: 'Padaria São João', phoneDigits: '18333310001' };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'matched');
  service.applyOutcomeToCandidate(candidate, outcome);
  assert.match(String(candidate.businessCategory), /padaria e confeitaria/);
  assert.equal(candidate.businessCategoryStatus, 'cnae');
});

test('F3: sem match INEQUIVOCO (2 CNPJs basicos diferentes) = unmatched, card "nao confirmado" com categoria VAZIA', async () => {
  const service = new CnpjRfbReconcileService();
  const prisma = fakePrisma((args) => {
    if (args?.where?.normalizedCity === 'zacarias') {
      return [
        { ...EDR_ROW, cnpj: '11222333000181', searchText: 'imobiliaria central zacarias imoveis' },
        { ...EDR_ROW, cnpj: '99888777000122', searchText: 'imobiliaria nova zacarias imoveis' },
      ];
    }
    return [];
  });
  const candidate: Record<string, unknown> = { name: 'Imobiliária', segment: 'distribuidora de agua' };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'unmatched');
  service.applyOutcomeToCandidate(candidate, outcome);
  assert.equal(candidate.businessCategory, null);
  assert.equal(candidate.businessCategoryStatus, 'unconfirmed');
});

test('F3: categoria OBSERVADA pelo motor (Maps) sobrevive quando nao ha match RFB — fato observado nao e carimbo', async () => {
  const service = new CnpjRfbReconcileService();
  const prisma = fakePrisma(() => []);
  const candidate: Record<string, unknown> = {
    name: 'Igreja Presbiteriana Central',
    category: 'Igreja',
    segment: 'distribuidora de agua',
  };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'unmatched');
  service.applyOutcomeToCandidate(candidate, outcome);
  assert.equal(candidate.businessCategory, 'Igreja');
  assert.equal(candidate.businessCategoryStatus, 'observed');
});

test('F3: telefone de contador (phoneShareCount alto) NAO e prova de identidade', async () => {
  const service = new CnpjRfbReconcileService();
  const prisma = fakePrisma((args) => (
    args?.where?.phoneDigits === '18999990001' ? [{ ...EDR_ROW, phoneShareCount: 37 }] : []
  ));
  const candidate: Record<string, unknown> = { name: 'Empresa Qualquer Sem Par', phoneDigits: '18999990001' };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'unmatched');
});

test('F3: consulta que EXPLODE degrada gracioso (unavailable) e nunca derruba a entrega', async () => {
  const service = new CnpjRfbReconcileService();
  const prisma = fakePrisma(() => {
    throw new Error('pool esgotado');
  });
  const candidate: Record<string, unknown> = { name: 'Empresa Qualquer', phoneDigits: '18999990001' };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'unavailable');
  service.applyOutcomeToCandidate(candidate, outcome);
  assert.equal(candidate.businessCategory, null);
  assert.equal(candidate.businessCategoryStatus, 'unconfirmed');
});

test('F3: candidato que JA tem CNPJ e pulado (skipped) — o fato ja existe, L4 resolve o CNAE', async () => {
  const service = new CnpjRfbReconcileService();
  const prisma = fakePrisma(() => {
    throw new Error('nao deveria consultar');
  });
  const candidate: Record<string, unknown> = { name: 'Empresa Com CNPJ', cnpj: '11.222.333/0001-81' };
  const outcome = await service.reconcileWebCandidate({ prisma, candidate, city: 'Zacarias', state: 'SP' });
  assert.equal(outcome.status, 'skipped');
});

test('F3: getCityDddHints amostra a RFB da cidade e devolve o DDD dominante (sem count(*))', async () => {
  const service = new CnpjRfbReconcileService();
  let sawTake = 0;
  const prisma = fakePrisma((args) => {
    sawTake = Number(args?.take) || 0;
    assert.equal(args?.where?.normalizedCity, 'zacarias');
    return [
      { phoneDigits: '18333310001' },
      { phoneDigits: '18999990002' },
      { phoneDigits: '18333310003' },
      { phoneDigits: '11999990004' }, // um fora (escritório em SP) não muda o dominante
    ];
  });
  const hints = await service.getCityDddHints({ prisma, city: 'Zacarias', state: 'SP' });
  assert.ok(Array.isArray(hints));
  assert.ok((hints as string[]).includes('18'));
  assert.ok(sawTake > 0 && sawTake <= 100, 'amostra tem take baixo');
  // Cache: segunda chamada não consulta de novo (o handler falharia o assert de cidade).
  const cachedHints = await service.getCityDddHints({ prisma: fakePrisma(() => { throw new Error('cache furou'); }), city: 'Zacarias', state: 'SP' });
  assert.deepEqual(cachedHints, hints);
});

test('F3: getCityDddHints degrada gracioso em erro (null = nao verificavel)', async () => {
  const service = new CnpjRfbReconcileService();
  const prisma = fakePrisma(() => {
    throw new Error('timeout');
  });
  const hints = await service.getCityDddHints({ prisma, city: 'Cidade Sem Amostra', state: 'SP' });
  assert.equal(hints, null);
});
