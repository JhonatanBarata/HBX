import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVendasLeadIntelligence } from './vendas-lead-enrichment';

test('Radar sem contactAccessGranted não vaza snapshot 3x3 nem dados RFB', () => {
  const intelligence = buildVendasLeadIntelligence({
    radarOrigin: true,
    contactAccessGranted: false,
    lead: {
      name: 'Empresa sigilosa',
      phone: '11999999999',
      email: 'um@segredo.com',
      contactSnapshotJson: JSON.stringify({
        phones: [{ value: '11999999999' }, { value: '1133333333' }, { value: '11888888888' }],
        emails: [{ value: 'um@segredo.com' }, { value: 'dois@segredo.com' }, { value: 'tres@segredo.com' }],
      }),
      metadataJson: JSON.stringify({ cnpj: '12345678000190', ownerName: 'Pessoa Sigilosa' }),
    },
  });

  assert.deepEqual(intelligence.phones, []);
  assert.deepEqual(intelligence.emails, []);
  assert.deepEqual(intelligence.phoneContacts, []);
  assert.deepEqual(intelligence.emailContacts, []);
  assert.equal(intelligence.cnpj, null);
  assert.equal(intelligence.ownerName, null);
});

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

test('vendas intelligence le smart_free com email provavel e plano de acao', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Clinica Smart Free',
      phone: '19999999999',
      website: 'https://clinicasmartfree.com.br',
      enrichmentJson: JSON.stringify({
        version: 'radar-card-v2',
        level: 'smart_free',
        cost: { totalBrl: 0, providersUsed: ['hbx', 'domain_guess'], cacheHit: false },
        contact: {
          email: 'contato@clinicasmartfree.com.br',
          emailStatus: 'probable',
          emailConfidence: 58,
          emailSource: 'inferred',
        },
        salesFit: {
          score: 71,
          painType: 'site_fraco',
          painPitch: 'Presença digital existe, mas precisa virar fila comercial.',
        },
        actionPlan: {
          recommendedChannel: 'email',
          firstMessage: 'Olá, tudo bem?',
          nextStep: 'abordar_por_email',
        },
        sourceConfidence: { enrichment: 80 },
      }),
    },
  });

  assert.equal(intelligence.email, 'contato@clinicasmartfree.com.br');
  assert.equal(intelligence.emailStatus, 'probable');
  assert.equal(intelligence.emailSource, 'inferred');
  assert.equal(intelligence.recommendedChannel, 'email');
  assert.equal(intelligence.painType, 'site_fraco');
  assert.equal(intelligence.confidence.email, 58);
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

test('vendas intelligence exposes possible social candidates from Radar timeline', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Studio Beleza',
      phone: '(19) 99999-0001',
      city: 'Rio Claro',
      segment: 'beleza',
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({
            socialStatus: 'candidate_review',
            possibleSocialCandidates: [{
              network: 'instagram',
              url: 'https://instagram.com/studiobelezaperto',
              status: 'possible',
              confidence: 68,
            }],
          }),
        },
      ],
    },
  });

  assert.equal(intelligence.socialStatus, 'candidate_review');
  assert.equal(intelligence.possibleSocialCandidates[0].status, 'possible');
  assert.equal(intelligence.leadReasonTags.includes('rede_social_possivel'), true);
  assert.ok((intelligence.opportunityScore || 0) >= 68);
});

test('vendas intelligence prioriza evento Radar mais recente', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Studio Beleza',
      phone: '(19) 99999-0001',
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
          description: JSON.stringify({ socialStatus: 'missing' }),
        },
        {
          sourceType: 'radar_enrichment',
          createdAt: new Date('2026-06-01T11:00:00.000Z'),
          description: JSON.stringify({
            instagramUrl: 'https://instagram.com/studiobeleza',
            socialStatus: 'partial',
          }),
        },
      ],
    },
  });

  assert.equal(intelligence.instagramUrl, 'https://instagram.com/studiobeleza');
  assert.equal(intelligence.socialStatus, 'partial');
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
  assert.equal(intelligence.visibilityTier, 'eligible');
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

test('vendas intelligence preserva telefone 1/2 da RFB, telefone 3 do motor e tres emails sem exigir WhatsApp', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Empresa Multi Contato',
      phone: '1133334444',
      email: 'rfb@empresa.com.br',
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({
            enrichment: {
              cnpj: '12345678000190',
              phoneContacts: [
                { value: '1133334444', valueNormalized: '1133334444', source: 'rfb_primary', rank: 1, confidence: 100, whatsappStatus: 'not_confirmed' },
                { value: '1155556666', valueNormalized: '1155556666', source: 'rfb_secondary', rank: 2, confidence: 100, whatsappStatus: 'unverified' },
                { value: '11988887777', valueNormalized: '11988887777', source: 'website_crawl', rank: 3, confidence: 82, whatsappStatus: 'confirmed' },
              ],
              emailContacts: [
                { value: 'rfb@empresa.com.br', source: 'rfb_email', rank: 1, confidence: 100 },
                { value: 'comercial@empresa.com.br', source: 'website_crawl', rank: 2, confidence: 85 },
                { value: 'vendas@empresa.com.br', source: 'hbx_engine', rank: 3, confidence: 75 },
              ],
              phones: ['1133334444', '1155556666', '11988887777'],
              emails: ['rfb@empresa.com.br', 'comercial@empresa.com.br', 'vendas@empresa.com.br'],
              phonesWhatsapp: { '1133334444': false, '11988887777': true },
            },
          }),
        },
      ],
    },
  });

  assert.equal(intelligence.cnpj, '12345678000190');
  assert.deepEqual(intelligence.phones, ['1133334444', '1155556666', '11988887777']);
  assert.deepEqual(intelligence.emails, ['rfb@empresa.com.br', 'comercial@empresa.com.br', 'vendas@empresa.com.br']);
  assert.equal(intelligence.phoneContacts[1].source, 'rfb_secondary');
  assert.equal(intelligence.phoneContacts[2].source, 'website_crawl');
  assert.equal(intelligence.phoneContacts[0].whatsappStatus, 'not_confirmed');
  assert.equal(intelligence.phoneContacts[2].whatsappStatus, 'confirmed');
  assert.equal(intelligence.phonesWhatsapp['1155556666'], false);
});

test('vendas intelligence preserva somente fontes canônicas sem promover fonte ausente ou desconhecida', () => {
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      timelineEvents: [
        {
          sourceType: 'radar_enrichment',
          description: JSON.stringify({
            enrichment: {
              phoneContacts: [
                { value: '1133334444', source: 'rfb_primary', rank: 3 },
                { value: '1155556666', source: 'rfb_secondary', rank: 1 },
                { value: '11988887777', source: null, rank: 2 },
              ],
              emailContacts: [
                { value: 'um@empresa.com.br', source: 'rfb_email', rank: 2 },
                { value: 'dois@empresa.com.br', source: 'unknown', rank: 1 },
                { value: 'tres@empresa.com.br', source: 'website_crawl', rank: 3 },
              ],
            },
          }),
        },
      ],
    },
  });

  assert.equal(intelligence.phoneContacts.find((contact: any) => contact.valueNormalized === '1133334444')?.source, 'rfb_primary');
  assert.equal(intelligence.phoneContacts.find((contact: any) => contact.valueNormalized === '1155556666')?.source, 'rfb_secondary');
  assert.equal(intelligence.phoneContacts.find((contact: any) => contact.valueNormalized === '11988887777')?.source, 'unknown');
  assert.equal(intelligence.emailContacts.find((contact: any) => contact.value === 'um@empresa.com.br')?.source, 'rfb_email');
  assert.equal(intelligence.emailContacts.find((contact: any) => contact.value === 'dois@empresa.com.br')?.source, 'unknown');
  assert.equal(intelligence.emailContacts.find((contact: any) => contact.value === 'tres@empresa.com.br')?.source, 'website_crawl');
});

test('vendas intelligence preserva o cadastro oficial RFB completo sem rawJson', () => {
  const rfbOfficial = {
    source: 'rfb',
    cnpj: '12345678000190',
    razaoSocial: 'EMPRESA OFICIAL LTDA',
    nomeFantasia: 'Empresa Oficial',
    situacao: '02',
    cnae: '6201501',
    cnaeDescription: 'Desenvolvimento de programas de computador',
    secondaryCnaes: [{ code: '6202300', description: 'Desenvolvimento e licenciamento' }],
    porte: '03',
    matrizFilial: '1',
    openedAt: '2019-03-04T00:00:00.000Z',
    address: 'Rua Um, 10',
    city: 'Campinas',
    state: 'SP',
    website: 'https://empresaoficial.com.br',
    ownerName: 'Pessoa Administradora',
    ownerQualification: 'Sócio-Administrador',
    capitalSocial: '250000.00',
    naturezaJuridica: '2062',
    simples: true,
    mei: false,
    regimeTributario: 'lucro_presumido',
    shareCounts: { phone: 1, email: 2 },
  };
  const intelligence = buildVendasLeadIntelligence({
    lead: {
      name: 'Empresa Oficial',
      phone: '11999990000',
      enrichmentJson: JSON.stringify({
        ...rfbOfficial,
        companySituation: rfbOfficial.situacao,
        officialAddress: rfbOfficial.address,
        officialCity: rfbOfficial.city,
        officialState: rfbOfficial.state,
        officialWebsite: rfbOfficial.website,
        rfbOfficial,
      }),
    },
  });

  assert.equal(intelligence.nomeFantasia, 'Empresa Oficial');
  assert.equal(intelligence.cnaeDescription, rfbOfficial.cnaeDescription);
  assert.deepEqual(intelligence.secondaryCnaes, rfbOfficial.secondaryCnaes);
  assert.equal(intelligence.ownerQualification, 'Sócio-Administrador');
  assert.equal(intelligence.openedAt, rfbOfficial.openedAt);
  assert.equal(intelligence.capitalSocial, '250000.00');
  assert.equal(intelligence.simples, true);
  assert.equal(intelligence.mei, false);
  assert.equal(intelligence.regimeTributario, 'lucro_presumido');
  assert.deepEqual(intelligence.shareCounts, { phone: 1, email: 2 });
  assert.deepEqual(intelligence.rfbOfficial, rfbOfficial);
  assert.equal(Object.prototype.hasOwnProperty.call(intelligence.rfbOfficial, 'rawJson'), false);
});
