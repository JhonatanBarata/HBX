import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../frontend/src/app/vendas/page.client.tsx', import.meta.url), 'utf8');

test('Vendas LeadCardView renderiza icones de canais do lead', () => {
  assert.match(source, /function buildLeadChannelAssets\(lead: LeadItem\)/);
  assert.match(source, /lead\.phone \? buildCallUrl\(lead\.phone\)/);
  assert.match(source, /buildWhatsAppUrl\(lead\.phone, lead\.name\)/);
  assert.match(source, /normalizeExternalUrl\(lead\.leadIntelligence\?\.instagramUrl\)/);
  assert.match(source, /normalizeExternalUrl\(lead\.leadIntelligence\?\.facebookUrl\)/);
  assert.match(source, /lead\.email \|\| lead\.leadIntelligence\?\.email/);
  assert.match(source, /normalizeExternalUrl\(lead\.website\)/);
  assert.match(source, /<MobileChannelIconAsset channel=\{asset\.channel\} \/>/);
});
