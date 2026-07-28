import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarWebEnrichmentService } from './radar-web-enrichment.service';

// REGRESSÃO 28/07 ("sociais errando quase tudo"): o probe direto de Instagram montava
// instagram.com/<slug-do-nome> e aceitava com o teste /ProfilePage/ — que o shell de
// login do Instagram devolve pra QUALQUER slug, existente ou não. O snippet ainda era
// fabricado com nome/cidade/segmento do lead, então o matcher validava a própria fabricação
// (@podemosaguasdaprataspmunicpalsp, @energisarc, @joseaugustojunqueiraoutrozac).

const lead = { name: 'Anny Fotografia Fotógrafa Infantil', city: 'Aguaí', state: 'SP' } as any;
const input = { city: 'Aguaí', state: 'SP', segment: 'fotografia' } as any;

function fetcherReturning(html: string) {
  return (async () => ({ ok: true, text: async () => html })) as unknown as typeof fetch;
}

test('probe instagram: login-wall generico (ProfilePage no bundle, titulo "Instagram") NAO vira perfil', async () => {
  const service = new RadarWebEnrichmentService();
  const html = '<html><head><title>Instagram</title></head><body>{"ProfilePage":true} login</body></html>';
  const candidate = await (service as any).probeInstagramProfile(fetcherReturning(html), lead, input, 'annyfotografiaaguai', 1000);
  assert.equal(candidate, null);
});

test('probe instagram: titulo real sem a identidade do lead NAO vira perfil', async () => {
  const service = new RadarWebEnrichmentService();
  const html = '<html><head><title>Portal Zacarias (@portalzacarias.oficial) • Instagram</title></head><body>ProfilePage</body></html>';
  const candidate = await (service as any).probeInstagramProfile(fetcherReturning(html), lead, input, 'portalzacarias.oficial', 1000);
  assert.equal(candidate, null);
});

test('probe instagram: titulo real com a identidade vira candidato com snippet HONESTO (sem dados do lead)', async () => {
  const service = new RadarWebEnrichmentService();
  const html = '<html><head><title>Anny Fotografia (@annyfotografia) • Instagram photos</title></head><body>ProfilePage</body></html>';
  const candidate = await (service as any).probeInstagramProfile(fetcherReturning(html), lead, input, 'annyfotografia', 1000);
  assert.ok(candidate, 'perfil real com titulo compativel e aceito');
  assert.equal(candidate.probeValidated, true);
  // O snippet nao pode conter a CIDADE injetada do lead — era essa evidencia fabricada que
  // fazia o matchesLead rio abaixo validar qualquer slug (a pagina de perfil nao fala cidade).
  assert.ok(!candidate.snippet.includes('Aguaí'));
  assert.ok(candidate.snippet.includes('direct_probe'));
  assert.ok(candidate.snippet.includes('Anny Fotografia (@annyfotografia)'));
});
