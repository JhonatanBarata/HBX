'use strict';

const { extractEmailsFromText, normalizeUrl } = require('../extractors/email.extractor');
const { fetchPublicPage } = require('./site-crawl.provider');

async function runDirectoryProbeProvider(job, context = {}) {
  const maxDirectoryUrls = Math.max(0, Math.min(5000, Number(job.maxDirectoryUrls || 300) || 300));
  const directoryUrls = Array.isArray(job.directoryUrls) ? job.directoryUrls.map(normalizeUrl).filter(Boolean).slice(0, maxDirectoryUrls) : [];
  const emails = [];
  const warnings = [];
  const stats = {
    provider: 'directory_probe',
    pagesVisited: 0,
    emailsFound: 0,
  };

  for (const url of directoryUrls) {
    if (context.isCanceled && context.isCanceled()) break;
    const page = await fetchPublicPage(url, context.signal, context.fetcher);
    if (!page.ok) continue;
    stats.pagesVisited += 1;
    const found = extractEmailsFromText(page.html, {
      sourceUrl: page.url,
      website: page.url,
      provider: 'directory_probe',
    }).map((email) => ({
      ...email,
      status: email.status === 'public_found' ? 'probable' : email.status,
      confidence: Math.min(email.confidence, 60),
      evidence: {
        ...email.evidence,
        directoryProbe: true,
      },
    }));
    emails.push(...found);
    stats.emailsFound += found.length;
  }

  if (!directoryUrls.length) warnings.push('directory_probe requer directoryUrls explicitas no MVP.');
  return { provider: 'directory_probe', leads: [], emails, stats, warnings };
}

module.exports = {
  runDirectoryProbeProvider,
};
