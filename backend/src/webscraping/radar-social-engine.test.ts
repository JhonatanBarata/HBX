import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarSocialLookupQueries } from './radar/04-socials/radar-social-query-planner';
import { RadarSocialCandidateScorer } from './radar/04-socials/radar-social-candidate-scorer';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';

test('radar social query planner gera camadas agressivas', () => {
  const queries = buildRadarSocialLookupQueries({
    name: 'Barbearia X',
    legalName: 'Barbearia X Servicos Ltda',
    city: 'Rio Claro',
    state: 'SP',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    website: 'https://barbeariax.com.br',
    address: 'Rua Central, Centro',
    segment: 'barbearias',
  });
  const queryTexts = queries.map((entry) => entry.query);

  assert.equal(queryTexts.includes('"Barbearia X" "Rio Claro" instagram'), true);
  assert.equal(queryTexts.includes('"19999990001" instagram'), true);
  assert.equal(queryTexts.includes('"barbeariax.com.br" instagram'), true);
  assert.equal(queryTexts.includes('site:instagram.com "Barbearia X" "Rio Claro"'), true);
  assert.equal(queryTexts.includes('"Barbearia X" "Rio Claro" "whatsapp"'), true);
});

test('radar social scorer separa confirmado de candidate_review', () => {
  const scorer = new RadarSocialCandidateScorer();
  const lead = {
    name: 'Barbearia X',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
  };

  const confirmed = scorer.score(lead, {
    network: 'instagram',
    url: 'https://www.instagram.com/barbeariaxrioclaro/',
    source: 'test',
    result: {
      name: 'Barbearia X Rio Claro',
      city: 'Rio Claro',
      state: 'SP',
      source: 'hbx_scraping:social_discovery',
    },
    rawText: 'Barbearia X Rio Claro Instagram',
  });
  const review = scorer.score(lead, {
    network: 'instagram',
    url: 'https://www.instagram.com/barbeariaxoficial/',
    source: 'test',
    result: {
      title: 'Barbearia X Rio Claro',
    },
    rawText: 'Barbearia X Rio Claro',
  });

  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.accepted, true);
  assert.equal(review.status, 'candidate_review');
  assert.equal(review.accepted, false);
});

test('google textual provider prepara social sem usar Places', () => {
  const provider = new GoogleSearchProviderService();
  const requests = provider.buildSocialRequests(
    { city: 'Rio Claro', state: 'SP', segment: 'barbearias' },
    [{ network: 'instagram', layer: 'brand_city', query: '"Barbearia X" "Rio Claro" instagram' }],
    { limit: 5, timeoutMs: 3_000 },
  );

  assert.equal(requests.length, 1);
  assert.equal(requests[0].provider, 'google_textual');
  assert.equal(requests[0].usePlacesApi, false);
  assert.equal(requests[0].intent, 'social_enrichment');

  const normalized = provider.normalizeTextualResults([{
    title: 'Barbearia X Rio Claro Instagram',
    sourceUrl: 'https://www.instagram.com/barbeariaxrioclaro/',
    snippet: 'Perfil oficial da Barbearia X',
  }], requests[0]);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].source, 'google_textual');
  assert.equal(normalized[0].sourceUrl, 'https://www.instagram.com/barbeariaxrioclaro/');
  assert.equal(normalized[0].queryText, '"Barbearia X" "Rio Claro" instagram');
});
