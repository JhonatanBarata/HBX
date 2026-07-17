'use strict';

const { extractEmailsFromText, normalizeUrl } = require('../extractors/email.extractor');
const { fetchPublicPage } = require('./site-crawl.provider');
const { buildCompactEvidence } = require('../extractors/evidence.extractor');

async function runSocialProbeProvider(job, context = {}) {
  const maxSocialUrls = Math.max(0, Math.min(5000, Number(job.maxSocialUrls || 300) || 300));
  const socialUrls = Array.isArray(job.socialUrls) ? job.socialUrls.map(normalizeUrl).filter(Boolean).slice(0, maxSocialUrls) : [];
  const emails = [];
  const evidence = [];
  const stats = {
    provider: 'social_probe',
    pagesVisited: 0,
    emailsFound: 0,
  };
  const warnings = [];

  for (const url of socialUrls) {
    if (context.isCanceled && context.isCanceled()) break;
    const page = await fetchPublicPage(url, context.signal, context.fetcher);
    if (!page.ok) continue;
    const compactEvidence = buildCompactEvidence(page, 'social_probe');
    if (compactEvidence) evidence.push(compactEvidence);
    stats.pagesVisited += 1;
    const found = extractEmailsFromText(page.html, {
      sourceUrl: page.url,
      website: page.url,
      provider: 'social_probe',
      evidence: compactEvidence,
    }).map((email) => ({
      ...email,
      status: 'probable',
      confidence: Math.min(email.confidence, 50),
      evidence: {
        ...email.evidence,
        socialProbe: true,
      },
    }));
    emails.push(...found);
    stats.emailsFound += found.length;
  }

  if (!socialUrls.length) warnings.push('social_probe requer socialUrls publicas explicitas no MVP.');
  return { provider: 'social_probe', leads: [], emails, evidence, stats, warnings };
}

module.exports = {
  runSocialProbeProvider,
};
