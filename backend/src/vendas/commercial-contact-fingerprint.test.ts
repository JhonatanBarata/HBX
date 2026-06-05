import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadFingerprints, normalizeCommercialWebsiteDomain } from './commercial-contact-fingerprint';

test('buildLeadFingerprints creates stable commercial contact keys', () => {
  const fingerprints = buildLeadFingerprints({
    companyId: 10,
    normalizedPhone: '5511999999999',
    googlePlaceId: 'ChIJ-ABC',
    websiteDomain: 'LojaExemplo.com.br',
    normalizedName: 'Loja Exemplo',
    city: 'São Paulo',
    state: 'SP',
  });

  assert.deepEqual(fingerprints, [
    'phone:10:5511999999999',
    'place:10:chij-abc',
    'domain:10:lojaexemplo.com.br',
    'name-city:10:loja exemplo:sao paulo:sp',
  ]);
});

test('buildLeadFingerprints ignores empty company and removes duplicated keys', () => {
  assert.deepEqual(buildLeadFingerprints({ companyId: '', normalizedPhone: '5511' }), []);
  assert.deepEqual(buildLeadFingerprints({
    companyId: 1,
    websiteDomain: 'www.exemplo.com',
  }), ['domain:1:www.exemplo.com']);
});

test('normalizeCommercialWebsiteDomain extracts host from URLs and raw domains', () => {
  assert.equal(normalizeCommercialWebsiteDomain('https://www.exemplo.com.br/cardapio'), 'exemplo.com.br');
  assert.equal(normalizeCommercialWebsiteDomain('www.exemplo.com.br/path'), 'exemplo.com.br');
  assert.equal(normalizeCommercialWebsiteDomain(''), null);
});
