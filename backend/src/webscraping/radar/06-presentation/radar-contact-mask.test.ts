import assert from 'node:assert/strict';
import test from 'node:test';
import { RadarCorePresentationMixin } from './radar-core-presentation.mixin';

function presenter() {
  const instance: any = new (RadarCorePresentationMixin as any)();
  instance.resolveRadarLeadStatus = () => 'clean';
  instance.extractDdd = () => '19';
  instance.isRadarProtectedStatus = () => false;
  instance.extractRadarLeadWhatsappStatus = () => 'confirmed';
  instance.extractLeadQualityV2FromObject = () => null;
  instance.extractLeadQualityFromObject = () => null;
  instance.parseMaybeJsonObject = (value: any) => {
    if (!value) return {};
    if (typeof value === 'object') return value;
    return JSON.parse(value);
  };
  instance.isBlockedLeadOfficialWebsite = () => false;
  instance.buildRadarLeadPeople = (meta: any) => Array.isArray(meta?.people) ? meta.people : [];
  instance.resolveRadarLeadEnrichmentStatus = () => 'completed';
  instance.buildRadarLeadSourceChain = () => null;
  instance.buildRadarLeadEnrichedBy = () => ({});
  instance.resolveFreshCompanyState = () => ({});
  instance.attachDeliveryClassification = (lead: any) => lead;
  return instance;
}

const row = {
  id: 'lead-1',
  name: 'Empresa Teste',
  phone: '(19) 99999-1111',
  phoneDigits: '19999991111',
  email: 'vendas@empresa.com.br',
  website: 'https://empresa-teste.example',
  instagramUrl: 'https://instagram.com/empresateste',
  facebookUrl: 'https://facebook.com/empresateste',
  googleMapsUrl: 'https://maps.google.com/empresa-sentinela',
  sourceUrl: 'https://empresa-teste.example/contato-sentinela',
  possibleSocialCandidates: ['https://instagram.com/candidato-sentinela'],
  confirmedSocialCandidates: ['https://facebook.com/confirmado-sentinela'],
  evidenceJson: JSON.stringify({
    extractedFields: { phones: ['19988887777'], emails: ['evidence-sentinela@empresa.com.br'] },
    contactUrl: 'https://empresa-teste.example/evidence-sentinela',
  }),
  enrichmentJson: JSON.stringify({
    extractedFields: { phones: ['19977776666'], emails: ['enrichment-sentinela@empresa.com.br'] },
  }),
  metadataJson: JSON.stringify({
    targetType: 'pj',
    emails: ['vendas@empresa.com.br', 'contato@empresa.com.br'],
    phones: ['19999991111', '1933334444'],
    phonesWhatsapp: { '19999991111': true },
    ownerName: 'Pessoa Sentinela',
    ownerNames: ['Pessoa Sentinela'],
    ownerPhone: '19966665555',
    ownerInstagram: 'https://instagram.com/dono-sentinela',
    ownerFacebook: 'https://facebook.com/dono-sentinela',
    ownerSocialCandidates: ['https://instagram.com/owner-candidate-sentinela'],
    people: [{ name: 'Pessoa Sentinela', role: 'Sócio', phoneDigits: '19966665555' }],
  }),
  events: [],
  companyStates: [],
};

test('vitrine mascara todos os contatos 1-3 e preserva somente sinais de presenca', () => {
  const lead = presenter().buildRadarLeadPublic(row, { includeSmartFields: true, maskContact: true });
  assert.equal(lead.phone, '');
  assert.equal(lead.email, null);
  assert.deepEqual(lead.emails, []);
  assert.deepEqual(lead.phones, []);
  assert.deepEqual(lead.phonesWhatsapp, {});
  assert.equal(lead.hasPhone, true);
  assert.equal(lead.hasEmail, true);
  assert.deepEqual(lead.channelPresence, {
    whatsapp: true,
    telefone: true,
    email: true,
    instagram: true,
    facebook: true,
    site: true,
  });
  assert.equal(lead.website, null);
  assert.equal(lead.instagramUrl, null);
  assert.equal(lead.facebookUrl, null);
  assert.equal(lead.ownerName, null);
  assert.deepEqual(lead.ownerNames, []);
  assert.equal(lead.ownerPhone, null);
  assert.deepEqual(lead.people, []);
  assert.equal(lead.enrichmentJson, null);
  assert.equal(lead.evidenceJson, null);
  assert.equal(lead.sourceUrl, null);
  assert.equal(lead.googleMapsUrl, null);

  const serialized = JSON.stringify(lead);
  for (const secret of [
    '19999991111',
    'vendas@empresa.com.br',
    'empresa-teste.example',
    'instagram.com/empresateste',
    'facebook.com/empresateste',
    'Pessoa Sentinela',
    'evidence-sentinela',
    'enrichment-sentinela',
    'candidato-sentinela',
    'confirmado-sentinela',
    'dono-sentinela',
    'owner-candidate-sentinela',
  ]) {
    assert.equal(serialized.includes(secret), false, secret);
  }
});

test('apos aquisicao presenter propaga no maximo 3 contatos conhecidos', () => {
  const lead = presenter().buildRadarLeadPublic(row, { includeSmartFields: true, maskContact: false });
  assert.deepEqual(lead.emails, ['vendas@empresa.com.br', 'contato@empresa.com.br']);
  assert.deepEqual(lead.phones, ['19999991111', '1933334444']);
  assert.equal(lead.website, 'https://empresa-teste.example');
  assert.equal(lead.instagramUrl, 'https://instagram.com/empresateste');
  assert.equal(lead.ownerName, 'Pessoa Sentinela');
  assert.equal(lead.people[0].name, 'Pessoa Sentinela');
  assert.equal(lead.evidenceJson.extractedFields.emails[0], 'evidence-sentinela@empresa.com.br');
});
