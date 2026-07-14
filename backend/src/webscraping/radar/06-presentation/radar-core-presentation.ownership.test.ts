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
      { kind: 'phone', value: '1933332222', valueNormalized: '1933332222', source: 'rfb_secondary', rank: 2, confidence: 100 },
      { kind: 'email', value: 'financeiro@empresa.test', valueNormalized: 'financeiro@empresa.test', source: 'rfb_email', rank: 2, confidence: 100 },
    ],
    companyStates: [],
    events: [],
  };
}

test('presenter falha fechado e nunca revela contato de lead pertencente a outro tenant', () => {
  const item = presenter().buildRadarLeadPublic(ownedLead(), {
    viewerCompanyId: 11,
    ownershipEnabled: true,
  });

  assert.equal(item.ownershipStatus, 'owned_by_other');
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
  assert.equal(item.people[0].phoneDigits, null);
  assert.equal(item.people[0].email, null);
});

test('presenter revela contatos somente quando ownerCompanyId casa com viewerCompanyId', () => {
  const item = presenter().buildRadarLeadPublic(ownedLead(), {
    viewerCompanyId: 22,
    ownershipEnabled: true,
  });

  assert.equal(item.ownershipStatus, 'mine');
  assert.equal(item.phoneDigits, '19999991111');
  assert.equal(item.email, 'contato@empresa.test');
  assert.deepEqual(item.phones, ['(19) 99999-1111', '1933332222']);
  assert.deepEqual(item.emails, ['contato@empresa.test', 'financeiro@empresa.test']);
  assert.equal(item.phoneContacts.length, 2);
  assert.equal(item.emailContacts.length, 2);
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
  });

  const contact = item.phoneContacts.find((entry: any) => entry.valueNormalized === '19977776666');
  assert.equal(contact?.whatsappStatus, 'confirmed');
  assert.equal(item.phonesWhatsapp['19977776666'], true);
});
