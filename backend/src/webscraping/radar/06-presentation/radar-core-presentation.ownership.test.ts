import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCorePresentationMixin } from './radar-core-presentation.mixin';

function presenter() {
  const instance = new RadarCorePresentationMixin() as any;
  instance.extractLeadQualityV2FromObject = () => null;
  instance.extractLeadQualityFromObject = () => null;
  instance.parseMaybeJsonObject = (value: any) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    try {
      const parsed = JSON.parse(String(value || '{}'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  instance.attachDeliveryClassification = (lead: any) => lead;
  return instance;
}

function ownedLead() {
  return {
    id: 'radar-cross-tenant',
    placeId: 'hbx:pj:19999991111',
    ownerCompanyId: 22,
    claimedAt: new Date('2026-07-14T12:00:00.000Z'),
    status: 'in_attendance',
    name: 'Empresa Teste',
    city: 'Campinas',
    state: 'SP',
    segment: 'comercio',
    phone: '(19) 99999-1111',
    phoneDigits: '19999991111',
    email: 'contato@empresa.test',
    emailStatus: 'confirmed',
    emailSource: 'rfb_email',
    sourceUrl: 'https://origem.test/lead/19999991111',
    googleMapsUrl: 'https://maps.google.test/?query=19999991111',
    enrichmentJson: JSON.stringify({ emailCandidate: 'vazamento@empresa.test' }),
    evidenceJson: JSON.stringify({ phone: '19999991111' }),
    metadataJson: JSON.stringify({
      ownerName: 'Pessoa Sócia',
      ownerPhone: '19988887777',
      ownerInstagram: 'https://instagram.com/pessoa',
      ownerFacebook: 'https://facebook.com/pessoa',
      phones: ['19999991111', '1933332222'],
      emails: ['contato@empresa.test', 'financeiro@empresa.test'],
    }),
    contacts: [
      { kind: 'phone', value: '(19) 99999-1111', valueNormalized: '19999991111', source: 'rfb_primary', rank: 1, confidence: 100 },
      { kind: 'phone', value: '1933332222', valueNormalized: '1933332222', source: 'rfb_secondary', rank: 2, confidence: 100 },
      { kind: 'email', value: 'contato@empresa.test', valueNormalized: 'contato@empresa.test', source: 'rfb_email', rank: 1, confidence: 100 },
      { kind: 'email', value: 'financeiro@empresa.test', valueNormalized: 'financeiro@empresa.test', source: 'rfb_email', rank: 2, confidence: 100 },
    ],
    companyStates: [{
      companyId: 22,
      status: 'in_attendance',
      paidClaimOperationId: 'claim-op-1',
      claimUsageKey: 'claim:test',
      acquiredAt: new Date('2026-07-14T12:00:00.000Z'),
    }],
    events: [{ id: 'event-1', eventType: 'note', note: 'Ligar 19999991111', createdAt: new Date() }],
  };
}

test('presenter falha fechado e nunca revela contato de lead pertencente a outro tenant', () => {
  const item = presenter().buildRadarLeadPublic(ownedLead(), {
    viewerCompanyId: 11,
    ownershipEnabled: true,
  });

  // Até o fato de outro tenant possuir o card é detalhe individual: a projeção
  // pública pré-débito volta ao placeholder neutro.
  assert.equal(item.ownershipStatus, 'available');
  assert.equal(item.ownerCompanyId, null);
  assert.equal(item.phone, '');
  assert.equal(item.phoneDigits, '');
  assert.equal(item.email, null);
  assert.equal(item.ownerPhone, null);
  assert.equal(item.ownerInstagram, null);
  assert.equal(item.enrichmentJson, null);
  assert.equal(item.evidenceJson, null);
  assert.deepEqual(item.phones, []);
  assert.deepEqual(item.emails, []);
  assert.deepEqual(item.phoneContacts, []);
  assert.deepEqual(item.emailContacts, []);
  assert.deepEqual(item.phonesWhatsapp, {});
  assert.equal(item.placeId, null);
  assert.equal(item.sourceUrl, null);
  assert.equal(item.googleMapsUrl, null);
  assert.equal(item.ddd, '');
  assert.deepEqual(item.people, []);
  assert.deepEqual(item.historySummary, []);
  const serialized = JSON.stringify(item);
  assert.equal(serialized.includes('19999991111'), false);
  assert.equal(serialized.includes('contato@empresa.test'), false);
});

test('presenter revela contatos somente quando ownerCompanyId casa com viewerCompanyId', () => {
  const item = presenter().buildRadarLeadPublic(ownedLead(), {
    viewerCompanyId: 22,
    ownershipEnabled: true,
    contactAccessGranted: true,
  });

  assert.equal(item.ownershipStatus, 'mine');
  assert.equal(item.phoneDigits, '19999991111');
  assert.equal(item.email, 'contato@empresa.test');
  assert.equal(item.placeId, 'hbx:pj:19999991111');
  assert.equal(item.sourceUrl, 'https://origem.test/lead/19999991111');
  assert.deepEqual(item.phones, ['(19) 99999-1111', '1933332222']);
  assert.deepEqual(item.emails, ['contato@empresa.test', 'financeiro@empresa.test']);
  assert.equal(item.phoneContacts.length, 2);
  assert.equal(item.emailContacts.length, 2);
});

test('GET de detalhe elimina também eventos com PII enquanto o lead não pertence ao tenant', async () => {
  const instance = presenter();
  instance.resolveContext = () => ({ companyId: 11, userId: 101 });
  instance.supportsRadarPersistence = async () => true;
  instance.supportsRadarOwnershipPersistence = async () => true;
  instance.fetchRadarLeadEnrichmentQueueStatusMap = async () => new Map();
  instance.prisma = {
    radarLeadPool: {
      findUnique: async () => ({ ...ownedLead(), companyStates: [] }),
    },
  };

  const response = await instance.getRadarLeadForUser({}, 'radar-cross-tenant');
  const serialized = JSON.stringify(response);

  assert.deepEqual(response.events, []);
  assert.equal(response.item.phoneDigits, '');
  assert.equal(serialized.includes('19999991111'), false);
  assert.equal(serialized.includes('contato@empresa.test'), false);
  assert.equal(serialized.includes('origem.test'), false);
});

test('GET de detalhe libera histórico e contatos somente ao tenant que comprou', async () => {
  const instance = presenter();
  instance.resolveContext = () => ({ companyId: 22, userId: 202 });
  instance.supportsRadarPersistence = async () => true;
  instance.supportsRadarOwnershipPersistence = async () => true;
  instance.fetchRadarLeadEnrichmentQueueStatusMap = async () => new Map();
  instance.prisma = {
    radarLeadPool: {
      findUnique: async () => ownedLead(),
    },
    creditLedgerEntry: {
      findMany: async () => [{ kind: 'debit', usageKey: 'enforce:lead_delivery:claim:test' }],
    },
    radarLeadProcessRun: {
      findMany: async () => [{
        id: 'claim-op-1',
        companyId: 22,
        radarLeadId: 'radar-cross-tenant',
        mode: 'claim',
        status: 'completed',
      }],
    },
  };

  const response = await instance.getRadarLeadForUser({}, 'radar-cross-tenant');

  assert.equal(response.item.phoneDigits, '19999991111');
  assert.equal(response.events.length, 1);
  assert.equal(response.events[0].note, 'Ligar 19999991111');
});

test('débito isolado não libera o lead sem a mesma saga claim ativa', async () => {
  const instance = presenter();
  instance.prisma = {
    creditLedgerEntry: {
      findMany: async () => [{ kind: 'debit', usageKey: 'enforce:lead_delivery:claim:test' }],
    },
    radarLeadProcessRun: {
      findMany: async () => [{
        id: 'claim-op-1',
        companyId: 22,
        radarLeadId: 'outro-lead',
        mode: 'claim',
        status: 'completed',
      }],
    },
  };

  const access = await instance.resolveRadarPaidAccessMap(22, [ownedLead()]);
  assert.equal(access.get('radar-cross-tenant'), false);
});

test('contato com kind whatsapp permanece não verificado sem confirmação explícita', () => {
  const lead = ownedLead();
  lead.contacts.push({
    kind: 'whatsapp',
    value: '19977776666',
    valueNormalized: '19977776666',
    source: 'website_crawl',
    rank: 3,
    confidence: 90,
  } as any);

  const item = presenter().buildRadarLeadPublic(lead, {
    viewerCompanyId: 22,
    ownershipEnabled: true,
    contactAccessGranted: true,
  });

  const contact = item.phoneContacts.find((entry: any) => entry.valueNormalized === '19977776666');
  assert.equal(contact?.whatsappStatus, 'unverified');
  assert.equal(item.phonesWhatsapp['19977776666'], false);
});

test('phonesWhatsapp=true confirma o número explicitamente', () => {
  const lead = ownedLead();
  lead.metadataJson = JSON.stringify({
    ...JSON.parse(lead.metadataJson),
    phones: ['19999991111', '1933332222', '19977776666'],
    phonesWhatsapp: { '19977776666': true },
  });
  lead.contacts.push({
    kind: 'whatsapp',
    value: '19977776666',
    valueNormalized: '19977776666',
    source: 'website_crawl',
    rank: 3,
    confidence: 90,
  } as any);

  const item = presenter().buildRadarLeadPublic(lead, {
    viewerCompanyId: 22,
    ownershipEnabled: true,
    contactAccessGranted: true,
  });

  const contact = item.phoneContacts.find((entry: any) => entry.valueNormalized === '19977776666');
  assert.equal(contact?.whatsappStatus, 'confirmed');
  assert.equal(item.phonesWhatsapp['19977776666'], true);
});

test('presenter entrega cadastro oficial RFB completo somente ao tenant dono', () => {
  const lead = ownedLead();
  const rfbOfficial = {
    source: 'rfb',
    cnpj: '12345678000190',
    razaoSocial: 'EMPRESA TESTE LTDA',
    nomeFantasia: 'Empresa Teste',
    situacao: '02',
    cnae: '6201501',
    cnaeDescription: 'Desenvolvimento de software',
    secondaryCnaes: [{ code: '6202300', description: 'Licenciamento de software' }],
    porte: '03',
    matrizFilial: '1',
    openedAt: '2020-01-02T00:00:00.000Z',
    address: 'Rua Oficial, 100',
    city: 'Campinas',
    state: 'SP',
    website: 'https://empresa.test',
    ownerName: 'Pessoa Sócia',
    ownerQualification: 'Sócio-Administrador',
    capitalSocial: '100000.00',
    naturezaJuridica: '2062',
    simples: true,
    mei: false,
    regimeTributario: 'lucro_presumido',
    shareCounts: { phone: 1, email: 1 },
  };
  lead.metadataJson = JSON.stringify({
    ...JSON.parse(lead.metadataJson),
    ...rfbOfficial,
    companySituation: rfbOfficial.situacao,
    secondaryCnaes: rfbOfficial.secondaryCnaes,
    rfbOfficial,
  });

  const owned = presenter().buildRadarLeadPublic(lead, {
    viewerCompanyId: 22,
    ownershipEnabled: true,
    contactAccessGranted: true,
  });
  const foreign = presenter().buildRadarLeadPublic(lead, { viewerCompanyId: 11, ownershipEnabled: true });

  assert.deepEqual(owned.rfbOfficial, rfbOfficial);
  assert.deepEqual(owned.secondaryCnaes, rfbOfficial.secondaryCnaes);
  assert.equal(owned.ownerQualification, 'Sócio-Administrador');
  assert.equal(owned.regimeTributario, 'lucro_presumido');
  assert.equal(Object.prototype.hasOwnProperty.call(owned.rfbOfficial, 'rawJson'), false);
  assert.equal(foreign.rfbOfficial, null);
});
