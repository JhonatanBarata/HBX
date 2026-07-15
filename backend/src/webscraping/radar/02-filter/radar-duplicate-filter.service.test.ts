import assert from 'node:assert/strict';
import test from 'node:test';
import { RadarDuplicateFilterService } from './radar-duplicate-filter.service';

function contact(overrides: Record<string, any>) {
  return {
    placeId: '', name: 'Empresa', phone: '', phoneDigits: '', rating: null, reviews: null,
    address: 'Rua Um, 10', website: null, ...overrides,
  } as any;
}

test('dedupe usa CNPJ como identidade forte e nunca mescla CNPJs diferentes', () => {
  const service = new RadarDuplicateFilterService();
  const results = service.mergeDedupedContacts([
    contact({ cnpj: '11.222.333/0001-81', phone: '(11) 99999-0000', website: 'empresa.test' }),
    contact({ cnpj: '12.345.678/0001-95', phone: '(11) 99999-0000', website: 'empresa.test' }),
  ]);
  assert.equal(results.length, 2);
  assert.notEqual(results[0].cnpj, results[1].cnpj);
});

test('mesma entidade agrega até três telefones, emails e redes sem perder evidência', () => {
  const service = new RadarDuplicateFilterService();
  const [result] = service.mergeDedupedContacts([
    contact({
      cnpj: '11.222.333/0001-81', phone: '(11) 99999-0001', email: 'um@empresa.test',
      instagramUrl: 'https://instagram.com/empresa', evidenceJson: { source: 'rfb', confidence: 80 },
      sourceEvidence: [{ source: 'rfb' }],
    }),
    contact({
      cnpj: '11222333000181', phone: '(11) 99999-0002', emails: ['dois@empresa.test', 'tres@empresa.test', 'quatro@empresa.test'],
      facebookUrl: 'https://facebook.com/empresa', evidenceJson: { source: 'web', page: '/contato' },
      sourceEvidence: [{ source: 'web' }],
    }),
  ]);
  assert.deepEqual(result.phones, ['(11) 99999-0001', '(11) 99999-0002']);
  assert.deepEqual(result.emails, ['um@empresa.test', 'dois@empresa.test', 'tres@empresa.test']);
  assert.equal(result.facebookUrl, 'https://facebook.com/empresa');
  const evidence = result.evidenceJson as Record<string, any>;
  assert.equal(evidence.page, '/contato');
  assert.deepEqual(evidence.evidenceAlternatives.source, ['rfb', 'web']);
  assert.deepEqual(result.sourceEvidence, [{ source: 'rfb' }, { source: 'web' }]);
});

test('registro sem CNPJ ainda pode doar contato para entidade com CNPJ por chave fraca', () => {
  const service = new RadarDuplicateFilterService();
  const [result] = service.mergeDedupedContacts([
    contact({ cnpj: '11.222.333/0001-81', phone: '(11) 99999-0001' }),
    contact({ name: 'Empresa', address: 'Rua Um, 10', email: 'contato@empresa.test' }),
  ]);
  assert.equal(result.email, 'contato@empresa.test');
  assert.equal(result.cnpj, '11.222.333/0001-81');
});

test('telefone compartilhado não funde entidade fiscal com empresa de outro nome', () => {
  const service = new RadarDuplicateFilterService();
  const results = service.mergeDedupedContacts([
    contact({ name: 'Holding Alfa', cnpj: '11.222.333/0001-81', phone: '(11) 99999-0001' }),
    contact({ name: 'Loja Beta', phone: '+55 11 99999-0001', email: 'beta@empresa.test' }),
  ]);
  assert.equal(results.length, 2);
});

test('sem CNPJ, nomes diferentes não fundem só por telefone e site compartilhados', () => {
  const service = new RadarDuplicateFilterService();
  const results = service.mergeDedupedContacts([
    contact({ name: 'Clínica Alfa', phone: '(11) 99999-0001', website: 'grupo.test' }),
    contact({ name: 'Clínica Beta', phone: '+55 11 99999-0001', website: 'https://grupo.test' }),
  ]);
  assert.equal(results.length, 2);
});

test('rede sem CNPJ mantém filiais separadas quando só o site é compartilhado', () => {
  const service = new RadarDuplicateFilterService();
  const results = service.mergeDedupedContacts([
    contact({ name: 'Rede Alfa', phone: '(11) 99999-0001', address: 'Rua Um, 10', website: 'redealfa.test' }),
    contact({ name: 'Rede Alfa', phone: '(11) 99999-0002', address: 'Rua Dois, 20', website: 'https://redealfa.test' }),
  ]);
  assert.equal(results.length, 2);
});

test('filial com CNPJ não cola outra filial sem CNPJ só por mesmo nome e site', () => {
  const service = new RadarDuplicateFilterService();
  const results = service.mergeDedupedContacts([
    contact({
      name: 'Rede Alfa', cnpj: '11.222.333/0001-81', phone: '(11) 99999-0001',
      address: 'Rua Um, 10', website: 'redealfa.test',
    }),
    contact({
      name: 'Rede Alfa', phone: '(11) 99999-0002', address: 'Rua Dois, 20',
      website: 'https://redealfa.test',
    }),
  ]);
  assert.equal(results.length, 2);
});

test('sem CNPJ, mesmo nome e telefone canônico continuam deduplicando empresa real', () => {
  const service = new RadarDuplicateFilterService();
  const results = service.mergeDedupedContacts([
    contact({ name: 'Empresa Alfa', phone: '(11) 99999-0001', address: 'Rua Um, 10' }),
    contact({ name: 'Empresa Alfa', phone: '+55 11 99999-0001', address: 'Rua Dois, 20', email: 'contato@alfa.test' }),
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].email, 'contato@alfa.test');
});

test('placeId idêntico continua sendo identidade forte mesmo com variação de nome', () => {
  const service = new RadarDuplicateFilterService();
  const results = service.mergeDedupedContacts([
    contact({ placeId: 'ChIJ-empresa-1', name: 'Empresa Alfa Ltda', phone: '(11) 99999-0001' }),
    contact({ placeId: 'ChIJ-empresa-1', name: 'Empresa Alfa', email: 'contato@alfa.test' }),
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].email, 'contato@alfa.test');
});

test('telefone canônico e mesmo nome permitem doação segura para CNPJ conhecido', () => {
  const service = new RadarDuplicateFilterService();
  const [result] = service.mergeDedupedContacts([
    contact({ name: 'Empresa Alfa', cnpj: '11.222.333/0001-81', phone: '(11) 99999-0001' }),
    contact({ name: 'Empresa Alfa', phone: '+55 11 99999-0001', email: 'contato@alfa.test' }),
  ]);
  assert.equal(result.email, 'contato@alfa.test');
  assert.deepEqual(result.phones, ['(11) 99999-0001']);
});

test('chaves de CNPJ preservam sinais auxiliares com namespace sem colisão entre empresas', () => {
  const service = new RadarDuplicateFilterService();
  const leftKeys = service.buildContactDedupeKeys(contact({ cnpj: '11.222.333/0001-81', phone: '(11) 99999-0001' }));
  const rightKeys = service.buildContactDedupeKeys(contact({ cnpj: '12.345.678/0001-95', phone: '+55 11 99999-0001' }));
  assert.ok(leftKeys.includes('cnpj:11222333000181'));
  assert.ok(leftKeys.some((key) => key.includes(':phone:11999990001')));
  assert.equal(leftKeys.some((key) => rightKeys.includes(key)), false);
});

test('CNPJ inválido não vira identidade forte nem cola empresas distintas', () => {
  const service = new RadarDuplicateFilterService();
  const invalidKeys = service.buildContactDedupeKeys(contact({
    name: 'Empresa Alfa', cnpj: '11.111.111/0001-11', phone: '(11) 99999-0001', website: 'grupo.test',
  }));
  assert.equal(invalidKeys.some((key) => key.startsWith('cnpj:')), false);

  const results = service.mergeDedupedContacts([
    contact({ name: 'Empresa Alfa', cnpj: '11.111.111/0001-11', phone: '(11) 99999-0001', website: 'grupo.test' }),
    contact({ name: 'Empresa Beta', cnpj: '11.111.111/0001-11', phone: '+55 11 99999-0001', website: 'https://grupo.test' }),
  ]);
  assert.equal(results.length, 2);
});

test('ordenação usa finalRankScore V2 antes do opportunityScore legado', () => {
  const service = new RadarDuplicateFilterService();
  const ordered = service.sortContacts([
    contact({ name: 'Legado Alto', opportunityScore: 95, qualityV2: { finalRankScore: 20 } }),
    contact({ name: 'V2 Alto', opportunityScore: 30, qualityV2: { finalRankScore: 80 } }),
  ], {
    extractLeadQualityV2FromObject: (value: any) => value.qualityV2 || null,
    buildOpportunityScore: () => 0,
  });
  assert.equal(ordered[0].name, 'V2 Alto');
});
