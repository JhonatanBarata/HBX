import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadarEnrichmentJobPipelineService } from './radar/03-enrichment/radar-enrichment-job-pipeline.service';
import { RadarWebEnrichmentJobService } from './radar/03-enrichment/radar-web-enrichment-job.service';
import {
  hasPoorRadarWebEnrichmentFields,
  rankRadarWebEnrichmentCandidates,
} from './radar/03-enrichment/radar-web-enrichment-priority';
import { RadarSocialResultWriterService } from './radar/04-socials/radar-social-result-writer.service';

test('enrichment job pipeline cria jobs canonicos com stage source trace e status', () => {
  const pipeline = new RadarEnrichmentJobPipelineService();
  const jobs = pipeline.buildJobs({ now: '2026-05-31T10:00:00.000Z' });

  assert.deepEqual(jobs.map((job) => job.type), [
    'radar_web_enrichment',
    'social_lookup',
    'email_enrichment',
    'whatsapp_check',
    'website_crawl_light',
    'cnpj_enrichment',
    'opportunity_signal',
    'post_delivery_update',
  ]);
  assert.equal(jobs.every((job) => job.status === 'queued'), true);
  assert.equal(jobs.every((job) => Boolean(job.traceId && job.stage && job.source)), true);
});

test('enrichment job pipeline normaliza nomes legados para jobs oficiais', () => {
  const pipeline = new RadarEnrichmentJobPipelineService();

  assert.equal(pipeline.normalizeJobType('social'), 'social_lookup');
  assert.equal(pipeline.normalizeJobType('web_enrichment'), 'radar_web_enrichment');
  assert.equal(pipeline.normalizeJobType('site'), 'website_crawl_light');
  assert.equal(pipeline.normalizeJobType('email'), 'email_enrichment');
  assert.equal(pipeline.normalizeJobType('whatsapp'), 'whatsapp_check');
  assert.equal(pipeline.normalizeJobType('score_update'), 'opportunity_signal');
});

test('enrichment job pipeline marca erro parcial retryable sem alterar delivery', () => {
  const pipeline = new RadarEnrichmentJobPipelineService();
  const raw = {
    deliveryStatus: 'delivered',
    asyncEnrichmentJobs: pipeline.buildJobs({ now: '2026-05-31T10:00:00.000Z' }),
  };
  const next = pipeline.withJobStatus(raw, {
    type: 'social_lookup',
    status: 'partial_error',
    error: new Error('timeout social'),
    now: '2026-05-31T10:03:00.000Z',
  }) as any;
  const job = next.asyncEnrichmentJobs.find((item: any) => item.type === 'social_lookup');

  assert.equal(next.deliveryStatus, 'delivered');
  assert.equal(job.status, 'partial_error');
  assert.equal(job.retryable, true);
  assert.equal(job.lastError, 'timeout social');
  assert.equal(next.enrichmentJobSummary.partialError, 1);
});

test('social writer registra lifecycle do social_lookup no rawJson', async () => {
  const writes: any[] = [];
  const runs = {
    updateRunItemRawJson: async (_leadId: string, raw: Record<string, any>) => {
      writes.push(raw);
      return raw;
    },
  } as any;
  const writer = new RadarSocialResultWriterService(runs, new RadarEnrichmentJobPipelineService());

  await writer.markSearching('lead-1', {}, { deliveryStatus: 'delivered' }, ['Barbearia Rio Claro Instagram']);
  await writer.writeResult(
    { companyId: 1, userId: 2, user: {} } as any,
    'lead-1',
    {},
    { name: 'Barbearia Centro', phone: '(19) 99999-0001' },
    writes.at(-1),
    {
      status: 'found',
      confidence: 88,
      instagramUrl: 'https://instagram.com/barbeariacentro',
      facebookUrl: null,
      queries: [],
      candidates: [],
      acceptedCandidates: [],
      rejectedCandidates: [],
      reason: 'social confirmado',
    } as any,
  );

  assert.equal(writes[0].asyncEnrichmentJobs.find((job: any) => job.type === 'social_lookup').status, 'running');
  assert.equal(writes[1].asyncEnrichmentJobs.find((job: any) => job.type === 'social_lookup').status, 'completed');
  assert.equal(writes[1].deliveryStatus, 'delivered');
});

test('web enrichment priority foca card com telefone e sem social site email', () => {
  const ranked = rankRadarWebEnrichmentCandidates([
    {
      id: 'baixo',
      name: 'Salao',
      phoneDigits: '19999990002',
      website: 'https://salao.com.br',
      email: 'contato@salao.com.br',
      instagramUrl: 'https://instagram.com/salao',
      source: 'hbx',
      score: 70,
    },
    {
      id: 'alto',
      name: 'Studio Beleza Central',
      phoneDigits: '19999990001',
      socialStatus: 'pending',
      source: 'hbx',
      score: 82,
    },
    {
      id: 'sem-telefone',
      name: 'Studio Sem Telefone',
      phoneDigits: '',
      source: 'hbx',
      score: 90,
    },
  ]);

  assert.equal(hasPoorRadarWebEnrichmentFields({ phoneDigits: '19999990001', name: 'Studio X' }), true);
  assert.equal(hasPoorRadarWebEnrichmentFields({ phoneDigits: '', name: 'Studio X' }), false);
  assert.deepEqual(ranked.map((item) => item.id), ['alto']);
  assert.equal(ranked[0].reasons.includes('sem_social'), true);
  assert.equal(ranked[0].reasons.includes('sem_site_oficial'), true);
  assert.equal(ranked[0].reasons.includes('sem_email'), true);
});

test('web enrichment job enriquece run item entregue sem alterar delivery', async () => {
  const writes: any[] = [];
  const runs = {
    loadRunItem: async () => ({
      id: 'lead-1',
      status: 'found',
      companyId: 1,
      placeId: 'hbx:pj:19999990001',
      name: 'Barbearia X',
      phone: '(19) 99999-0001',
      phoneDigits: '19999990001',
      city: 'Rio Claro',
      state: 'SP',
      segment: 'barbearias',
      rawJson: JSON.stringify({
        leadStatus: 'qualified',
        deliveryStatus: 'delivered',
        socialStatus: 'pending',
      }),
    }),
    updateRunItemRawJson: async (_leadId: string, raw: Record<string, any>) => {
      writes.push(raw);
      return raw;
    },
  } as any;
  const job = new RadarWebEnrichmentJobService(runs, undefined, new RadarEnrichmentJobPipelineService());

  await job.runForSavedLead(
    { companyId: 1, userId: 2, user: {} } as any,
    'lead-1',
    {
      city: 'Rio Claro',
      state: 'SP',
      segment: 'barbearias',
      quantity: 1,
      engine: 'hbx',
      targetType: 'pj',
    } as any,
    null,
    {
      searchHbxEngine: async (_input: any, _existing: string[], _engineUrl: string | undefined, options: any) => ({
        status: 'ok',
        message: 'ok',
        httpStatus: 200,
        rawErrorMessage: null,
        urlsDiscovered: 0,
        pagesFetched: 0,
        rejectedCount: 0,
        duplicateCount: 0,
        diagnostics: null,
        results: [{
          name: 'Barbearia X Rio Claro',
          phone: '',
          phoneDigits: '',
          website: 'https://barbeariax.com.br',
          instagramUrl: 'https://instagram.com/barbeariaxrioclaro',
          socialStatus: 'found',
          socialConfidence: 84,
          source: 'hbx_scraping:free_pj',
          sourceUrl: options.queryText,
        }],
      }),
    } as any,
  );

  const updated = writes.at(-1);
  assert.equal(updated.deliveryStatus, 'delivered');
  assert.equal(updated.website, 'https://barbeariax.com.br');
  assert.equal(updated.instagramUrl, 'https://instagram.com/barbeariaxrioclaro');
  assert.equal(updated.socialStatus, 'found');
  assert.equal(updated.asyncEnrichmentJobs.find((item: any) => item.type === 'radar_web_enrichment').status, 'completed');
  assert.equal('importedCount' in updated, false);
});

test('enrichment job pipeline nao chama Vendas nem altera importedCount', () => {
  const service = readFileSync(join(process.cwd(), 'src/webscraping/radar/03-enrichment/radar-enrichment-job-pipeline.service.ts'), 'utf8');
  const webJob = readFileSync(join(process.cwd(), 'src/webscraping/radar/03-enrichment/radar-web-enrichment-job.service.ts'), 'utf8');
  const writer = readFileSync(join(process.cwd(), 'src/webscraping/radar/04-socials/radar-social-result-writer.service.ts'), 'utf8');

  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(service), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(webJob), false);
  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount/.test(writer), false);
});
