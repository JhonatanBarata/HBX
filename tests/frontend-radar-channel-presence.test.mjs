import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const helperSource = readFileSync(
  new URL('../frontend/src/lib/radar-channel-presence.ts', import.meta.url),
  'utf8',
);
const leadsSource = readFileSync(
  new URL('../frontend/src/app/(app)/leads/page.client.tsx', import.meta.url),
  'utf8',
);
const detailSource = readFileSync(
  new URL('../frontend/src/components/hbx/detalhes-negocio.tsx', import.meta.url),
  'utf8',
);
const { resolveRadarChannelPresence } = await import(
  new URL('../frontend/src/lib/radar-channel-presence.ts', import.meta.url).href
);

test('contrato de presença não carrega valores reveláveis', () => {
  assert.match(helperSource, /export type ChannelPresence/);
  assert.match(helperSource, /Readonly<Record<RadarChannel, boolean>>/);
  assert.doesNotMatch(helperSource, /phone:\s*string/);
  assert.doesNotMatch(helperSource, /email:\s*string/);
});

test('normalizador cria os seis sinais sem revelar os valores', () => {
  assert.deepEqual(
    resolveRadarChannelPresence({
      hasWhatsapp: true,
      hasPhone: true,
      hasEmail: true,
      instagramUrl: 'https://instagram.com/empresa',
      facebookUrl: 'https://facebook.com/empresa',
      website: 'https://empresa.test',
    }),
    {
      whatsapp: true,
      telefone: true,
      email: true,
      instagram: true,
      facebook: true,
      site: true,
    },
  );
});

test('presença explícita prevalece sobre fallback legado', () => {
  const presence = resolveRadarChannelPresence({
    hasPhone: true,
    website: 'https://valor-mascarado.test',
    channelPresence: { telefone: false, site: false, email: true },
  });

  assert.equal(presence.telefone, false);
  assert.equal(presence.site, false);
  assert.equal(presence.email, true);
});

test('mapper mantém presença disponível quando valores estão mascarados', () => {
  assert.match(leadsSource, /channelPresence: resolveRadarChannelPresence\(lead\)/);
  assert.match(leadsSource, /phone: revealed \? lead\.phone : null/);
  assert.match(leadsSource, /website: revealed \? \(lead\.website \?\? null\) : null/);
});

test('lista e detalhe consomem o mesmo contrato sanitizado', () => {
  assert.match(leadsSource, /const channelPresence = resolveRadarChannelPresence\(row\)/);
  assert.match(leadsSource, /RADAR_CHANNEL_ORDER\.filter\(canal => channelPresence\[canal\]\)/);
  assert.match(detailSource, /const presence = n\.channelPresence\?\.\[canal\]/);
  assert.match(detailSource, /return presence \? "active" : "missing"/);
  assert.match(detailSource, /canalState === "active" && Boolean\(n\.phone\)/);
});
