import test from 'node:test';
import assert from 'node:assert/strict';
import { LeadHarvestNormalizerService } from './lead-harvest-normalizer.service';

test('LeadHarvest normaliza e-mail valido com evidencia e sem credenciais', () => {
  const service = new LeadHarvestNormalizerService();

  const result = service.normalizeEmailCandidate({
    externalId: 'email-1',
    email: 'Contato@ClinicaReal.com.br',
    website: 'https://www.clinic real.com.br',
    sourceUrl: 'https://clinicareal.com.br/contato?token=secreto',
    provider: 'website_crawl_light',
    confidence: 87.6,
    status: 'public_found',
    sourceMode: 'local_lab',
    evidence: {
      mailto: 'mailto:contato@clinicareal.com.br',
      apiToken: 'nao pode sair',
      nested: {
        secret: 'nao pode sair',
        selector: 'footer',
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.email, 'contato@clinicareal.com.br');
  assert.equal(result.value.domain, 'clinicareal.com.br');
  assert.equal(result.value.confidence, 88);
  assert.equal(result.value.sourceMode, 'local_lab');
  assert.equal(result.value.sourceUrl, 'https://clinicareal.com.br/contato');
  assert.equal(result.value.evidence?.mailto, 'mailto:contato@clinicareal.com.br');
  assert.equal('apiToken' in (result.value.evidence || {}), false);
  assert.equal('secret' in ((result.value.evidence?.nested || {}) as Record<string, any>), false);
});

test('LeadHarvest rejeita e-mail invalido', () => {
  const service = new LeadHarvestNormalizerService();

  const result = service.normalizeEmailCandidate({
    externalId: 'email-invalid',
    email: 'nao-e-email',
    sourceUrl: 'https://empresa.com.br/contato',
    provider: 'website_crawl_light',
    confidence: 80,
    evidence: { text: 'Contato comercial' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'invalid_email'), true);
});

test('LeadHarvest bloqueia e-mail de dominio ruim', () => {
  const service = new LeadHarvestNormalizerService();

  const result = service.normalizeEmailCandidate({
    externalId: 'email-blocked',
    email: 'loja@instagram.com',
    sourceUrl: 'https://instagram.com/loja',
    provider: 'local_lab_probe',
    confidence: 70,
    evidence: { page: 'profile' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'blocked_domain'), true);
});

test('LeadHarvest suporta batch com e-mail provavel e card completo importado do lab', () => {
  const service = new LeadHarvestNormalizerService();

  const result = service.normalizeBatch({
    batchId: 'batch-lab-1',
    sourceMode: 'local_lab',
    sourceName: 'Local Email Lab',
    createdAt: '2026-06-08T12:00:00.000Z',
    city: 'Rio Claro',
    state: 'sp',
    segment: 'barbearias',
    targetEmails: 5,
    providers: ['local_lab_probe'],
    leads: [{
      externalId: 'lead-1',
      name: 'Barbearia Central',
      city: 'Rio Claro',
      state: 'sp',
      segment: 'barbearias',
      phone: '+55 (19) 99999-0001',
      whatsapp: '55 19 99999-0001',
      website: 'barbeariacentral.com.br',
      email: 'agenda@barbeariacentral.com.br',
      emailStatus: 'found_on_site',
      sourceUrl: 'https://barbeariacentral.com.br/contato',
      sourceProvider: 'local_lab_probe',
      evidence: { source: 'pagina contato' },
      raw: { password: 'nao pode sair', htmlTitle: 'Contato' },
    }],
    emails: [{
      externalId: 'email-1',
      email: 'agenda@barbeariacentral.com.br',
      sourceUrl: 'https://barbeariacentral.com.br/contato',
      provider: 'local_lab_probe',
      status: 'probable',
      confidence: 44,
      evidence: { pattern: 'agenda@dominio' },
    }],
    stats: { visited: 3, found: 1 },
  }, {
    persistedImport: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.sourceMode, 'imported_lab');
  assert.equal(result.value.providers.includes('local_lab_probe'), true);
  assert.equal(result.value.leads.length, 1);
  assert.equal(result.value.emails.length, 1);
  assert.equal(result.value.leads[0].sourceMode, 'imported_lab');
  assert.equal(result.value.leads[0].sourceRisk, 'experimental');
  assert.equal(result.value.leads[0].phone, '19999990001');
  assert.equal(result.value.leads[0].whatsapp, '19999990001');
  assert.equal(result.value.leads[0].state, 'SP');
  assert.equal(result.value.leads[0].raw?.htmlTitle, 'Contato');
  assert.equal('password' in (result.value.leads[0].raw || {}), false);
  assert.equal(result.value.emails[0].status, 'probable');
  assert.equal(result.value.stats?.visited, 3);
});

test('LeadHarvest exige sourceUrl, provider e evidencia para e-mail aceito', () => {
  const service = new LeadHarvestNormalizerService();

  const result = service.normalizeEmailCandidate({
    externalId: 'email-sem-evidencia',
    email: 'comercial@empresa.com.br',
    confidence: 90,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'missing_source_url'), true);
  assert.equal(result.errors.some((error) => error.code === 'missing_provider'), true);
  assert.equal(result.errors.some((error) => error.code === 'missing_evidence'), true);
});
