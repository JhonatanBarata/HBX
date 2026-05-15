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
