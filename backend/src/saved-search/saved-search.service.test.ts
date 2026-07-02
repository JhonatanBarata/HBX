import test from 'node:test';
import assert from 'node:assert/strict';

import { SavedSearchService } from './saved-search.service';

// sanitizeFiltro e toRadarInput sao puros (nao tocam prisma/webscraping): da pra
// instanciar com deps nulas e exercitar via `as any`. Guardam o contrato do que
// uma pesquisa salva persiste e do que vira input do Radar no /run.
function makeService() {
  return new SavedSearchService(null as any, null as any) as any;
}

test('sanitizeFiltro mantem so as chaves conhecidas de filtro do Radar', () => {
  const svc = makeService();
  const out = svc.sanitizeFiltro({
    city: 'São Paulo',
    state: 'SP',
    segment: 'Arquitetos',
    alcance: '25',
    quantos: 10,
    requiredChannels: ['whatsapp'],
    lixo: 'descartar',
    __proto__: { hack: true },
  });
  assert.equal(out.city, 'São Paulo');
  assert.equal(out.state, 'SP');
  assert.equal(out.segment, 'Arquitetos');
  assert.equal(out.alcance, '25');
  assert.equal(out.quantos, 10);
  assert.deepEqual(out.requiredChannels, ['whatsapp']);
  assert.equal('lixo' in out, false, 'chave desconhecida e descartada');
  assert.equal('hack' in out, false, 'nao herda chave de proto');
});

test('sanitizeFiltro ignora vazios/nulos', () => {
  const svc = makeService();
  const out = svc.sanitizeFiltro({ city: '', state: null, segment: undefined, quantos: 5 });
  assert.equal('city' in out, false);
  assert.equal('state' in out, false);
  assert.equal('segment' in out, false);
  assert.equal(out.quantos, 5);
});

test('sanitizeFiltro devolve objeto vazio para entrada nao-objeto', () => {
  const svc = makeService();
  assert.deepEqual(svc.sanitizeFiltro(null), {});
  assert.deepEqual(svc.sanitizeFiltro('x'), {});
  assert.deepEqual(svc.sanitizeFiltro(undefined), {});
});

test('toRadarInput traduz alcance->radiusKm e quantos->limit', () => {
  const svc = makeService();
  const input = svc.toRadarInput({ city: 'Fortaleza', state: 'CE', segment: 'Dentistas', alcance: '50', quantos: 20 });
  assert.equal(input.radiusKm, 50);
  assert.equal(input.limit, 20);
  assert.equal('alcance' in input, false, 'alcance nao vaza para o input do Radar');
  assert.equal('quantos' in input, false, 'quantos nao vaza para o input do Radar');
  assert.equal(input.city, 'Fortaleza');
  assert.equal(input.segment, 'Dentistas');
});

test('toRadarInput sem alcance/quantos nao inventa campos', () => {
  const svc = makeService();
  const input = svc.toRadarInput({ city: 'Recife', segment: 'Bares' });
  assert.equal('radiusKm' in input, false);
  assert.equal('limit' in input, false);
  assert.equal(input.city, 'Recife');
});
