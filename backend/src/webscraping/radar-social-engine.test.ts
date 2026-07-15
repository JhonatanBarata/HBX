import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRadarSocialLookupQueries } from './radar/04-socials/radar-social-query-planner';
import { RadarSocialCandidateExtractor } from './radar/04-socials/radar-social-candidate-extractor';
import { RadarSocialCandidateScorer } from './radar/04-socials/radar-social-candidate-scorer';
import { RadarSocialOrchestratorService } from './radar/04-socials/radar-social-orchestrator.service';
import { GoogleSearchProviderService } from './radar/providers/google-search/google-search-provider.service';

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

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

  assert.equal(queryTexts[0], '"Barbearia X" "Rio Claro" "SP" instagram');
  assert.equal(queries[0]?.layer, 'full_name_city_state');
  assert.equal(queryTexts.includes('"Barbearia X" "Rio Claro" instagram'), true);
  assert.equal(queryTexts.includes('"Barbearia X" "Rio Claro, SP" instagram'), true);
  assert.equal(queryTexts.includes('"Barbearia X" "Rio Claro" "barbearias" instagram'), true);
  assert.equal(queryTexts.includes('"19999990001" instagram'), true);
  assert.equal(queryTexts.includes('"barbeariax.com.br" instagram'), true);
  assert.equal(queryTexts.includes('site:instagram.com "barbeariax.com.br"'), true);
  assert.equal(queryTexts.includes('site:instagram.com "Barbearia X" "Rio Claro"'), true);
  assert.equal(queryTexts.includes('"Barbearia X" "Rio Claro" "whatsapp"'), true);
});

test('radar social query planner adiciona variantes de segmento para beleza', () => {
  const queries = buildRadarSocialLookupQueries({
    name: 'Studio Bella Hair',
    city: 'Rio Claro',
    state: 'SP',
    phoneDigits: '19999990001',
    segment: 'salão de beleza',
  });
  const queryTexts = queries.map((entry) => entry.query);

  assert.equal(queryTexts[0], '"Studio Bella Hair" "Rio Claro" "SP" instagram');
  assert.equal(queryTexts.includes('"Studio Bella Hair" "Rio Claro" "salão de beleza" instagram'), true);
  assert.equal(queryTexts.includes('"Studio Bella Hair" "Rio Claro" "cabeleireiro" instagram'), true);
  assert.equal(queryTexts.includes('site:instagram.com "Studio Bella Hair" "Rio Claro" "salão de beleza"'), true);
  assert.equal(queryTexts.includes('"Studio Bella Hair" "Rio Claro" "agenda" instagram'), true);
});

test('radar social extractor le evidenceJson signals e texto com links sociais', () => {
  const extractor = new RadarSocialCandidateExtractor();
  const host = {
    searchHbxEngine: async () => ({ results: [] }),
    normalizeRadarSocialUrl: (value: unknown, network: 'instagram' | 'facebook') => {
      const raw = String(value || '').trim();
      const pattern = network === 'instagram' ? /instagram\.com\/([A-Za-z0-9._-]+)/i : /facebook\.com\/([A-Za-z0-9._-]+)/i;
      const match = raw.match(pattern);
      return match ? `https://${network}.com/${match[1]}` : null;
    },
    pickRadarSocialUrl: (item: any, network: 'instagram' | 'facebook') => {
      const raw = String(item?.value || item?.sourceUrl || '').trim();
      return host.normalizeRadarSocialUrl(raw, network);
    },
  };
  const candidates = extractor.extract({
    title: 'Barbearia X Rio Claro',
    evidenceJson: {
      websiteCrawlLight: {
        pages: [{ url: 'https://barbeariax.com.br' }],
      },
      extractedFields: {
        contactLinks: ['https://instagram.com/barbeariaxrioclaro'],
      },
    },
    signals: {
      socialText: 'Perfil oficial https://instagram.com/barbeariaxrioclaro',
    },
  }, 'instagram', host);

  assert.equal(candidates.some((candidate) => candidate.url === 'https://instagram.com/barbeariaxrioclaro'), true);
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

test('radar social scorer rejeita cidade conflitante e pagina generica', () => {
  const scorer = new RadarSocialCandidateScorer();
  const lead = {
    name: 'Barbearia X',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'barbearias',
  };
  const generic = scorer.score(lead, {
    network: 'instagram',
    url: 'https://instagram.com/explore/',
    source: 'test',
    result: {},
    rawText: '',
  });
  const conflict = scorer.score(lead, {
    network: 'facebook',
    url: 'https://facebook.com/barbeariaxoficial',
    source: 'test',
    result: {
      title: 'Barbearia X Campinas',
      city: 'Campinas',
      state: 'SP',
    },
    rawText: 'Barbearia X Campinas',
  });

  assert.equal(generic.accepted, false);
  assert.equal(generic.reason, 'pagina_generica');
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.reason.includes('cidade_conflitante'), true);
});

test('radar social scorer aceita handle compacto com marca e cidade sem aceitar generico', () => {
  const scorer = new RadarSocialCandidateScorer();
  const compactBrandCity = scorer.score({
    name: 'Studio Bella Hair',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'salão de beleza',
  }, {
    network: 'instagram',
    url: 'https://instagram.com/studiobellarioclaro',
    source: 'test',
    result: {
      title: '@studiobellarioclaro',
    },
    rawText: '@studiobellarioclaro',
  });
  const genericSegmentCity = scorer.score({
    name: 'Salao Beleza',
    city: 'Rio Claro',
    state: 'SP',
    segment: 'salão de beleza',
  }, {
    network: 'instagram',
    url: 'https://instagram.com/salaobelezarioclaro',
    source: 'test',
    result: {
      title: '@salaobelezarioclaro',
    },
    rawText: '@salaobelezarioclaro',
  });

  assert.equal(compactBrandCity.status, 'confirmed');
  assert.equal(compactBrandCity.accepted, true);
  assert.equal(genericSegmentCity.accepted, false);
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

test('radar social limita queries com clamp seguro e preserva prioridade do planner', async () => {
  const previousMaxQueries = process.env.HBX_RADAR_SOCIAL_LOOKUP_MAX_QUERIES;
  const previousBudgetMs = process.env.HBX_RADAR_SOCIAL_LOOKUP_BUDGET_MS;
  process.env.HBX_RADAR_SOCIAL_LOOKUP_MAX_QUERIES = '999';
  process.env.HBX_RADAR_SOCIAL_LOOKUP_BUDGET_MS = '999999';
  try {
    const lead = {
      name: 'Barbearia X',
      legalName: 'Barbearia X Servicos Ltda',
      city: 'Rio Claro',
      state: 'SP',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      website: 'https://barbeariax.com.br',
      instagramUrl: 'https://instagram.com/barbeariaxrioclaro',
      address: 'Rua Central, Centro',
      segment: 'barbearias',
    };
    const expectedQueries = buildRadarSocialLookupQueries(lead)
      .filter((entry) => entry.network === 'facebook')
      .slice(0, 12)
      .map((entry) => entry.query);
    const attempted: string[] = [];
    let writtenResult: any = null;
    const orchestrator = new RadarSocialOrchestratorService({
      loadRunItem: async () => ({
        ...lead,
        id: 'lead-1',
        status: 'found',
        rawJson: JSON.stringify(lead),
      }),
    } as any, undefined, new GoogleSearchProviderService());

    await orchestrator.runForSavedLead({
      context: { companyId: 1, userId: 2, user: {} } as any,
      leadId: 'lead-1',
      normalizedInput: {
        city: 'Rio Claro',
        state: 'SP',
        segment: 'barbearias',
        quantity: 1,
        engine: 'hbx',
        targetType: 'pj',
      } as any,
      host: {
        searchHbxEngine: async (_input: any, _existing: any[], _engineUrl: string | undefined, options: any) => {
          attempted.push(options.queryText);
          return { results: [] };
        },
        normalizeRadarSocialUrl: (value: unknown, network: 'instagram' | 'facebook') => (
          network === 'instagram' && value ? String(value) : null
        ),
        pickRadarSocialUrl: () => null,
      },
      timeoutMs: 15_000,
      writer: {
        markSearching: async () => undefined,
        markSkipped: async () => undefined,
        writeResult: async (_context: any, _leadId: string, _item: any, _base: any, _raw: any, result: any) => {
          writtenResult = result;
        },
      } as any,
    });

    assert.deepEqual(attempted, expectedQueries);
    assert.equal(attempted.length, 12);
    assert.equal(writtenResult.status, 'partial');
  } finally {
    restoreEnv('HBX_RADAR_SOCIAL_LOOKUP_MAX_QUERIES', previousMaxQueries);
    restoreEnv('HBX_RADAR_SOCIAL_LOOKUP_BUDGET_MS', previousBudgetMs);
  }
});

test('radar social encerra no deadline como missing sem transformar orçamento em erro retryable', async () => {
  const previousMaxQueries = process.env.HBX_RADAR_SOCIAL_LOOKUP_MAX_QUERIES;
  const previousBudgetMs = process.env.HBX_RADAR_SOCIAL_LOOKUP_BUDGET_MS;
  process.env.HBX_RADAR_SOCIAL_LOOKUP_MAX_QUERIES = '12';
  process.env.HBX_RADAR_SOCIAL_LOOKUP_BUDGET_MS = '1500';
  try {
    const timeouts: number[] = [];
    let writtenResult: any = null;
    const orchestrator = new RadarSocialOrchestratorService({
      loadRunItem: async () => ({
        id: 'lead-1',
        status: 'found',
        name: 'Barbearia X',
        city: 'Rio Claro',
        state: 'SP',
        segment: 'barbearias',
        rawJson: '{}',
      }),
    } as any, undefined, new GoogleSearchProviderService());
    const startedAt = Date.now();

    const result = await orchestrator.runForSavedLead({
      context: { companyId: 1, userId: 2, user: {} } as any,
      leadId: 'lead-1',
      normalizedInput: {
        city: 'Rio Claro',
        state: 'SP',
        segment: 'barbearias',
        quantity: 1,
        engine: 'hbx',
        targetType: 'pj',
      } as any,
      host: {
        searchHbxEngine: async (_input: any, _existing: any[], _engineUrl: string | undefined, options: any) => {
          timeouts.push(options.timeoutMs);
          return new Promise<{ results: any[] }>(() => undefined);
        },
        normalizeRadarSocialUrl: () => null,
        pickRadarSocialUrl: () => null,
      },
      timeoutMs: 15_000,
      writer: {
        markSearching: async () => undefined,
        markSkipped: async () => undefined,
        writeResult: async (_context: any, _leadId: string, _item: any, _base: any, _raw: any, next: any) => {
          writtenResult = next;
        },
      } as any,
    });

    assert.equal(Date.now() - startedAt < 3_000, true);
    assert.equal(timeouts.length, 1);
    assert.equal(timeouts[0] >= 1_000 && timeouts[0] <= 1_500, true);
    assert.equal(result.status, 'missing');
    assert.equal(writtenResult.status, 'missing');
    assert.equal(writtenResult.reason, 'orcamento_social_esgotado_sem_resultado_confirmado');
  } finally {
    restoreEnv('HBX_RADAR_SOCIAL_LOOKUP_MAX_QUERIES', previousMaxQueries);
    restoreEnv('HBX_RADAR_SOCIAL_LOOKUP_BUDGET_MS', previousBudgetMs);
  }
});
