import assert from 'node:assert/strict';
import test from 'node:test';
import { RadarRunPresenterService } from './radar-run-presenter.service';

// ── 29/07: a busca AO VIVO fala a mesma língua da vitrine ────────────────────────────────────
// Busca real "advocacia" em Rio Claro/SP. Dois defeitos medidos no card ao vivo:
//  (1) BORGES OLIVEIRA (Receita) tinha telefone E e-mail salvos e o card dizia "sem contato" —
//      o item ao vivo não emitia `channelPresence`/`hasPhone` e o front assume `false`;
//  (2) o mesmo item devolvia phone/phoneDigits/email CRUS, sem máscara — o contato vazava
//      antes de puxar/pagar, enquanto a prateleira mascarava ("revela no Puxar").

function host(): any {
  return {
    parseMaybeJsonObject: (value: any) => {
      if (!value) return {};
      if (typeof value === 'object') return value;
      try { return JSON.parse(value); } catch { return {}; }
    },
    extractLeadQualityV2FromObject: () => null,
    extractLeadQualityFromObject: () => null,
    buildRunInputFromRow: () => ({ requiredChannels: [], preferredChannels: [], channelMatchMode: 'prefer', salesProfile: null }),
    normalizeSearchRunStatus: (status: unknown) => String(status || 'completed'),
    normalizeRunItemStatus: (status: unknown) => String(status || 'found'),
    normalizeRadarChannels: () => [],
    normalizeChannelMatchMode: () => 'prefer',
    isRunItemQualityDeliverable: () => true,
    attachDeliveryClassification: (item: any) => item,
    stripListPremiumFields: (item: any) => item,
    normalizeRadiusKm: () => 0,
    getHbxRunBatchLimit: () => 20,
    getHbxRunMaxAttempts: () => 10,
    buildSearchRunInsufficientMessage: () => 'insuficiente',
    buildRadarNeighborSegments: () => [],
    buildExpansionSuggestionHeadline: () => '',
    buildExpansionWidenReachLabel: () => null,
    buildExpansionWidenSegmentLabel: () => null,
    resolveRadarRunOperationalState: () => ({ state: 'parado', reason: null, message: null }),
  };
}

// Payload real do run (Receita traz fone + e-mail; o card dizia "sem contato").
const borgesRun = {
  id: 'run-advocacia',
  engine: 'hbx',
  targetType: 'pj',
  status: 'completed',
  city: 'Rio Claro',
  state: 'SP',
  segment: 'advocacia',
  targetQuantity: 100,
  foundCount: 1,
  attemptCount: 1,
  items: [{
    status: 'found',
    placeId: 'cnpj_public:64795876000154',
    name: 'BORGES OLIVEIRA SOCIEDADE INDIVIDUAL DE ADVOCACIA',
    phone: '19997516677',
    phoneDigits: '19997516677',
    city: 'RIO CLARO',
    state: 'SP',
    source: 'cnpj_public',
    rawJson: JSON.stringify({
      email: 'borges-advocacia@hotmail.com',
      businessCategory: 'Serviços advocatícios',
      website: null,
      instagramUrl: null,
      facebookUrl: null,
    }),
  }],
};

test('run ao vivo: card COM telefone/e-mail anuncia presenca (fim do "sem contato" mentiroso)', () => {
  const response: any = new RadarRunPresenterService().buildSearchRunResponse(borgesRun, undefined, host());
  const card = response.results[0];
  assert.equal(card.hasPhone, true, 'telefone existe no dado — a vitrine tem de anunciar');
  assert.equal(card.hasEmail, true);
  assert.equal(card.channelPresence.telefone, true);
  assert.equal(card.channelPresence.email, true);
  assert.equal(card.channelPresence.site, false);
  assert.equal(card.channelPresence.instagram, false);
});

test('run ao vivo: contato vai MASCARADO (nao vaza antes do Puxar)', () => {
  const response: any = new RadarRunPresenterService().buildSearchRunResponse(borgesRun, undefined, host());
  const card = response.results[0];
  assert.equal(card.phone, '');
  assert.equal(card.phoneDigits, '');
  assert.equal(card.email, null);
  const serialized = JSON.stringify(card);
  assert.ok(!serialized.includes('19997516677'), 'telefone cru nao pode aparecer no payload ao vivo');
  assert.ok(!serialized.includes('borges-advocacia@hotmail.com'), 'e-mail cru nao pode aparecer no payload ao vivo');
});

test('run ao vivo: card SEM nenhum canal continua honestamente "sem contato"', () => {
  const semCanal = {
    ...borgesRun,
    items: [{
      ...borgesRun.items[0],
      phone: '',
      phoneDigits: '',
      rawJson: JSON.stringify({ email: null, website: null, instagramUrl: null, facebookUrl: null }),
    }],
  };
  const response: any = new RadarRunPresenterService().buildSearchRunResponse(semCanal, undefined, host());
  const card = response.results[0];
  assert.equal(card.hasPhone, false);
  assert.equal(card.hasEmail, false);
  assert.equal(card.channelPresence.telefone, false);
});
