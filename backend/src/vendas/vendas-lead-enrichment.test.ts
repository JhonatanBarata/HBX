import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVendasLeadIntelligence } from './vendas-lead-enrichment';

test('vendas intelligence preserves enriched Radar data from timeline metadata', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Clinica Exemplo',
      phone: '19999999999',
      email: 'contato@clinicaexemplo.com.br',
      website: 'https://clinicaexemplo.com.br',
      shortNote: 'WhatsApp confirmado + sem site: boa oportunidade.',
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({
            emailStatus: 'probable',
            recommendedChannel: 'email',
            painType: 'sem_site',
            painPitch: 'Organizar contatos e retornos.',
            opportunityReason: 'E-mail provável + sem site: boa oportunidade para abordagem inicial por e-mail.',
            enrichment: {
              sourceConfidence: { email: 55, enrichment: 72 },
            },
          }),
        },
      ],
    },
    whatsappAvailability: { status: 'unknown' },
  });

  assert.equal(intelligence.emailStatus, 'probable');
  assert.equal(intelligence.nextBestAction, 'email');
  assert.equal(intelligence.recommendedChannel, 'email');
  assert.equal(intelligence.painType, 'sem_site');
  assert.match(intelligence.opportunityReason, /E-mail provável/);
});

test('vendas intelligence blocks protected Radar recommendation', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Lead Bloqueado',
      phone: '19999999999',
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({ recommendedChannel: 'discard', painType: 'sem_site' }),
        },
      ],
    },
    whatsappAvailability: { status: 'available' },
  });

  assert.equal(intelligence.nextBestAction, 'discard');
  assert.equal(intelligence.contactQuality, 'blocked');
});

test('vendas intelligence treats queued import with preserved enrichment as completed', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'R K Charcutaria Artesanal',
      phone: '19999999999',
      city: 'Araras',
      state: 'SP',
      segment: 'restaurantes',
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({
            enrichmentStatus: 'queued',
            visibilityTier: 'review_backup',
            recommendedChannel: 'call',
            painType: 'sem_site',
            enrichmentScore: 7,
            enrichment: {
              version: 'radar-card-v1',
              signals: {
                emailStatus: 'missing',
                socialStatus: 'missing',
                recommendedChannel: 'call',
                painType: 'sem_site',
              },
              qualityV2: {
                decision: 'review',
                finalRankScore: 45,
              },
            },
          }),
        },
      ],
    },
    whatsappAvailability: { status: 'unknown' },
  });

  assert.equal(intelligence.enrichmentStatus, 'completed');
  assert.equal(intelligence.visibilityTier, 'review_backup');
  assert.equal(intelligence.recommendedChannel, 'call');
});

test('vendas intelligence scores Instagram and Facebook as commercial signals', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Loja Social',
      phone: '19999999999',
      website: null,
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({
            instagramUrl: 'https://instagram.com/lojasocial',
            facebookUrl: 'https://facebook.com/lojasocial',
            socialStatus: 'found',
            socialConfidence: 88,
          }),
        },
      ],
    },
    whatsappAvailability: { status: 'unknown' },
  });

  assert.equal(intelligence.primarySocial, 'both');
  assert.equal(intelligence.instagramUrl, 'https://instagram.com/lojasocial');
  assert.equal(intelligence.facebookUrl, 'https://facebook.com/lojasocial');
  assert.ok((intelligence.opportunityScore || 0) <= 99);
  assert.ok(intelligence.leadReasonTags.includes('instagram_encontrado'));
  assert.ok(intelligence.leadReasonTags.includes('facebook_encontrado'));
  assert.ok(intelligence.leadReasonTags.includes('rede_social_confirmada'));
  assert.ok(intelligence.leadReasonTags.includes('rede_social_sem_site'));
  assert.match(intelligence.opportunityReason, /Instagram e Facebook/);
});

test('vendas intelligence resolves primarySocial for a single social network', () => {
  const instagram = buildVendasLeadIntelligence({
    lead: {
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({ instagramUrl: 'instagram.com/empresa' }),
        },
      ],
    },
  });
  const facebook = buildVendasLeadIntelligence({
    lead: {
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({ facebookUrl: 'facebook.com/empresa' }),
        },
      ],
    },
  });

  assert.equal(instagram.primarySocial, 'instagram');
  assert.equal(facebook.primarySocial, 'facebook');
});
