'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runDirectoryProbeProvider } = require('../providers/directory-probe.provider');
const { runSocialProbeProvider } = require('../providers/social-probe.provider');
const { configurePacing, extractConfirmedWhatsappNumbers, runSiteCrawlProvider } = require('../providers/site-crawl.provider');

const resolvePublic = async () => [{ address: '93.184.216.34', family: 4 }];

function response(html) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'text/html; charset=utf-8' },
    text: async () => html,
  };
}

test('social-only e diretório preservam evidência de terceiro sem promover site oficial', async () => {
  configurePacing({ minDelayMs: 0, maxDelayMs: 0, blockBackoffMs: 0 });
  const context = {
    resolveHostname: resolvePublic,
    fetcher: async () => response('<html><body>Empresa Real contato@empresa.test</body></html>'),
  };
  const directory = await runDirectoryProbeProvider({
    directoryUrls: ['https://guiamais.com.br/empresa-real'],
    maxDirectoryUrls: 1,
  }, context);
  assert.equal(directory.emails[0].email, 'contato@empresa.test');
  assert.equal(directory.emails[0].confidence <= 60, true);
  assert.equal(directory.evidence[0].pageType, 'directory');
  assert.equal(directory.leads.length, 0);

  configurePacing({ minDelayMs: 0, maxDelayMs: 0, blockBackoffMs: 0 });
  const social = await runSocialProbeProvider({
    socialUrls: ['https://instagram.com/empresa-real'],
    maxSocialUrls: 1,
  }, context);
  assert.equal(social.emails[0].email, 'contato@empresa.test');
  assert.equal(social.emails[0].confidence <= 50, true);
  assert.equal(social.evidence[0].pageType, 'social');
  assert.equal(social.leads.length, 0);
});

test('somente link oficial do WhatsApp vira confirmação determinística', async () => {
  assert.deepEqual(
    extractConfirmedWhatsappNumbers('<a href="https://wa.me/5551999991234">WhatsApp</a>'),
    ['51999991234'],
  );
  assert.deepEqual(extractConfirmedWhatsappNumbers('WhatsApp (51) 99999-1234'), []);

  configurePacing({ minDelayMs: 0, maxDelayMs: 0, blockBackoffMs: 0 });
  const crawled = await runSiteCrawlProvider({
    candidates: [{ name: 'Empresa Real', website: 'https://empresa.example' }],
    maxPagesPerSite: 1,
    maxDiscoveredLinks: 0,
  }, {
    resolveHostname: resolvePublic,
    fetcher: async () => response('<html><body><a href="https://wa.me/5551999991234">Fale no WhatsApp</a></body></html>'),
  });
  const whatsapp = crawled.leads[0].contacts.find((contact) => contact.kind === 'whatsapp');
  assert.deepEqual(whatsapp, {
    kind: 'whatsapp',
    value: '51999991234',
    valueNormalized: '51999991234',
    sourceUrl: 'https://empresa.example/',
    evidenceId: crawled.evidence[0].id,
    confidence: 100,
    officialDomainMatch: true,
    whatsappConfirmed: true,
    verification: 'official_whatsapp_link',
  });
});
