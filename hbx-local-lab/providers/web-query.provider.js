'use strict';

const { compactText } = require('../extractors/email.extractor');
const { collectSeedCandidates } = require('./site-crawl.provider');

function buildDiscoveryQueries(job) {
  const city = compactText(job.city, 120);
  const state = compactText(job.state, 2).toUpperCase();
  const segment = compactText(job.segment, 180);
  const base = [segment, city, state].filter(Boolean).join(' ');
  if (!base) return [];
  return [
    `${base} site oficial contato email`,
    `${base} contato comercial`,
    `${base} atendimento`,
  ];
}

async function runWebQueryProvider(job) {
  const candidates = collectSeedCandidates(job);
  return {
    provider: 'web_query',
    leads: candidates.map((candidate, index) => ({
      externalId: `web-query:${index + 1}:${candidate.website}`,
      name: candidate.name || `Candidato ${index + 1}`,
      city: candidate.city || job.city || null,
      state: candidate.state || job.state || null,
      segment: candidate.segment || job.segment || null,
      website: candidate.website,
      phone: candidate.phone || null,
      whatsapp: candidate.whatsapp || null,
      sourceUrl: candidate.sourceUrl || candidate.website,
      sourceProvider: 'web_query',
      sourceMode: 'local_lab',
      sourceRisk: 'experimental',
      evidence: {
        method: 'seed_candidate',
        queries: buildDiscoveryQueries(job),
      },
      raw: {},
    })),
    emails: [],
    stats: {
      provider: 'web_query',
      queriesBuilt: buildDiscoveryQueries(job).length,
      candidates: candidates.length,
    },
    warnings: candidates.length ? [] : ['web_query nao executa buscador sensivel no MVP; informe seedUrls/candidates para descoberta.'],
  };
}

module.exports = {
  buildDiscoveryQueries,
  runWebQueryProvider,
};
