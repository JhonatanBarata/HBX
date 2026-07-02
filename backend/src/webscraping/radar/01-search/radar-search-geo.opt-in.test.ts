import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarSearchGeoService } from './radar-search-geo.service';
import { RadarSharedNormalizerService } from '../shared/radar-shared-normalizer.service';

// P1 (02/07 — docs/PLANEJAMENTOS/PR02072026/W1-cutover-ordem-fixa.md), tarefa 6: "vizinha
// opt-in — expansão para cidades vizinhas SÓ com opt-in explícito no request (default: não
// expande)". radiusKm já era opcional e normalizeRadiusKm(undefined) já devolvia 0 — este
// teste TRAVA esse contrato (regressão): sem o campo no request, nenhuma cidade vizinha entra.

const RADAR_REGION_MAX_RADIUS_KM = 100;

function host() {
  const normalizer = new RadarSharedNormalizerService();
  return {
    normalizeCoordinate: (value: unknown) => normalizer.normalizeCoordinate(value),
    normalizeRadiusKm: (value: unknown) => normalizer.normalizeRadiusKm(value, RADAR_REGION_MAX_RADIUS_KM),
  };
}

test('resolveRegionalCities sem radiusKm no request (opt-in ausente): nao expande pra vizinhas', () => {
  const geo = new RadarSearchGeoService();
  const cities = geo.resolveRegionalCities({
    city: 'Fortaleza',
    state: 'CE',
    radiusKm: undefined as any,
  }, host());

  assert.deepEqual(cities, [], 'sem opt-in explicito, resolveRegionalCities deve devolver vazio (radiusKm normaliza pra 0)');
});

test('resolveRegionalCities com radiusKm=0 explicito: tambem nao expande', () => {
  const geo = new RadarSearchGeoService();
  const cities = geo.resolveRegionalCities({
    city: 'Fortaleza',
    state: 'CE',
    radiusKm: 0,
  }, host());

  assert.deepEqual(cities, []);
});

test('resolveRegionalCities com opt-in explicito (radiusKm>0): expande pra vizinhas dentro do raio', () => {
  const geo = new RadarSearchGeoService();
  const cities = geo.resolveRegionalCities({
    city: 'Fortaleza',
    state: 'CE',
    radiusKm: 25,
  }, host());

  assert.ok(cities.length >= 1, 'com opt-in explicito (radiusKm>0), a cidade-sede pelo menos deve aparecer');
  assert.equal(cities[0].city, 'Fortaleza');
  assert.equal(cities[0].distanceKm, 0);
});

test('normalizeRadiusKm: input ausente/invalido sempre normaliza pra 0 (nunca inventa raio)', () => {
  const normalizer = new RadarSharedNormalizerService();
  assert.equal(normalizer.normalizeRadiusKm(undefined, RADAR_REGION_MAX_RADIUS_KM), 0);
  assert.equal(normalizer.normalizeRadiusKm(null, RADAR_REGION_MAX_RADIUS_KM), 0);
  assert.equal(normalizer.normalizeRadiusKm('', RADAR_REGION_MAX_RADIUS_KM), 0);
  assert.equal(normalizer.normalizeRadiusKm('nao-numero', RADAR_REGION_MAX_RADIUS_KM), 0);
});
