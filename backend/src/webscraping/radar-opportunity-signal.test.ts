import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RadarOpportunitySignalService } from './radar/03-enrichment/radar-opportunity-signal.service';
import { RadarScoreEnrichmentService } from './radar/03-enrichment/radar-score-enrichment.service';

const host = {
  parseMaybeJsonObject(value: unknown) {
    if (!value) return {};
    if (typeof value === 'object') return value as Record<string, any>;
    try {
      return JSON.parse(String(value));
    } catch {
      return {};
    }
  },
  inferWebsiteStatus(value: string | null | undefined) {
    if (!value) return 'none' as const;
    if (/facebook|instagram|linktr|bio\.link/i.test(value)) return 'social_only' as const;
    if (/wixsite|blogspot|wordpress|catalogo|guiamais/i.test(value)) return 'weak' as const;
    return 'present' as const;
  },
  isLikelyValidBrPhone(value: string | null | undefined) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 10 || digits.length === 11;
  },
  isLikelyWhatsapp(value: string | null | undefined) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length === 11 && digits[2] === '9';
  },
};

const input = {
  segment: 'barbearias',
  city: 'Rio Claro',
  state: 'SP',
} as any;

test('opportunity signal engine gera motivo canal acao e pitch sem bloquear delivery', () => {
  const service = new RadarOpportunitySignalService();
  const result = service.analyze({
    name: 'Barbearia Centro',
    phone: '(19) 3333-4444',
    phoneDigits: '1933334444',
    website: 'https://barbeariacentro.com.br',
    instagramUrl: 'https://instagram.com/barbeariacentro',
    socialStatus: 'found',
    websiteIntelligence: {
      hasContactForm: false,
      hasBudgetIntent: true,
      hasChatWidget: false,
      opportunitySignals: ['site_com_link_orcamento'],
    },
  } as any, input, host);

  assert.equal(result.recommendedChannel, 'instagram');
  assert.equal(result.opportunitySignals.includes('instagram_sem_whatsapp_claro'), true);
  assert.equal(result.opportunitySignals.includes('website_crawl_form_orcamento'), true);
  assert.match(result.opportunityReason, /rede social/i);
  assert.equal(result.nextBestAction, 'abordar_instagram_com_link_de_atendimento');
  assert.equal(result.opportunityScore > 50, true);
});

test('opportunity signal engine detecta empresa multi-fonte com poucos canais', () => {
  const service = new RadarOpportunitySignalService();
  const result = service.analyze({
    name: 'Oficina Centro',
    phone: '',
    phoneDigits: '',
    website: 'https://oficinacentro.com.br',
    sourceEvidence: {
      hbx_engine: { website: 'https://oficinacentro.com.br' },
      google_textual: { placeId: 'g:1' },
      cnpj_public: { cnpj: '12345678000190' },
    },
  } as any, { ...input, segment: 'oficinas' }, host);

  assert.equal(result.opportunitySignals.includes('multi_fonte_empresa_poucos_canais'), true);
  assert.equal(result.opportunitySignals.includes('google_website_sem_social'), true);
  assert.equal(result.recommendedChannel, 'review');
  assert.match(result.pitchHint, /site|evidencia/i);
});

test('score enrichment usa opportunity signal engine quando ha evidencias complementares', () => {
  const service = new RadarScoreEnrichmentService(new RadarOpportunitySignalService());
  const lead = {
    name: 'Clinica Centro',
    phone: '(19) 99999-0001',
    phoneDigits: '19999990001',
    website: 'https://clinicacentro.com.br',
    opportunitySignals: ['site_sem_whatsapp_claro', 'site_sem_formulario'],
    websiteIntelligence: { hasContactForm: false, hasBudgetIntent: false, hasChatWidget: false },
  } as any;

  const score = service.buildOpportunityScore(lead, null, host);
  const reason = service.buildOpportunityReason(lead, { ...input, segment: 'clinicas' }, host);
  const signals = service.buildOpportunitySignal(lead, { ...input, segment: 'clinicas' }, host);

  assert.equal(score, signals.opportunityScore);
  assert.match(reason, /site/i);
  assert.equal(signals.recommendedChannel, 'whatsapp');
});

test('opportunity signal service nao chama Vendas nem altera importedCount', () => {
  const source = readFileSync(join(process.cwd(), 'src/webscraping/radar/03-enrichment/radar-opportunity-signal.service.ts'), 'utf8');

  assert.equal(/vendasLead|vendasLeadTimelineEvent|VendasService|importedCount|deliveryStatus/.test(source), false);
});
