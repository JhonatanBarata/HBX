import test from 'node:test';
import assert from 'node:assert/strict';

import { decidirGeoFonteCadastro, gpsAccuracyDentroDoLimite, GPS_ACCURACY_LIMITE_METROS } from './logistica-geo-fonte.util';

// TETO DE PRECISÃO DO GPS DE CADASTRO (25/07) — `geoFonte='gps_cadastro'` é gravado
// hoje SEM checar a precisão do fix, e é fonte INTOCÁVEL (a autocorreção por entrega
// confirmada nunca reescreve). Um fix ruim de 300m capturado dentro de um galpão virava
// permanente. `decidirGeoFonteCadastro` fecha o furo: quem decide é o BACKEND, nunca o
// cliente — um chamador batendo direto na API não pode se autodeclarar preciso.

test('accuracy 10m (bem preciso) → gps_cadastro', () => {
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', 10), 'gps_cadastro');
});

test('accuracy EXATAMENTE 60m → gps_cadastro (limite inclusivo, igual gpsDeOuro)', () => {
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', 60), 'gps_cadastro');
  assert.equal(gpsAccuracyDentroDoLimite(60), true);
});

test('accuracy 61m (1m acima do teto) → gps_impreciso', () => {
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', 61), 'gps_impreciso');
  assert.equal(gpsAccuracyDentroDoLimite(61), false);
});

test('accuracy ausente/undefined → gps_impreciso (app antigo sem o contrato novo)', () => {
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', undefined), 'gps_impreciso');
  assert.equal(decidirGeoFonteCadastro(true, undefined, undefined), 'gps_impreciso');
});

test('accuracy NaN → gps_impreciso (não confunde NaN com precisão válida)', () => {
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', NaN), 'gps_impreciso');
});

test('accuracy como STRING (lixo/tipo errado) → gps_impreciso', () => {
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', '10' as unknown), 'gps_impreciso');
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', 'muito preciso, confia' as unknown), 'gps_impreciso');
});

test('FAIL-CLOSED: a decisão NÃO depende do geoFonte que o cliente mandou — só do gpsAccuracy real', () => {
  // Cliente alega 'gps_cadastro' sem prova de precisão → backend REBAIXA pra impreciso.
  assert.equal(decidirGeoFonteCadastro(true, 'gps_cadastro', 200), 'gps_impreciso');
  // Cliente não alega NADA (nem manda geoFonte) mas o gpsAccuracy É bom → backend
  // CONCEDE gps_cadastro mesmo assim (quem decide é a precisão real, não a alegação).
  assert.equal(decidirGeoFonteCadastro(true, null, 15), 'gps_cadastro');
  assert.equal(decidirGeoFonteCadastro(true, undefined, 15), 'gps_cadastro');
  // Cliente manda qualquer string solta que não é 'geocode' → mesma regra do accuracy.
  assert.equal(decidirGeoFonteCadastro(true, 'lixo-qualquer', 15), 'gps_cadastro');
  assert.equal(decidirGeoFonteCadastro(true, 'lixo-qualquer', 200), 'gps_impreciso');
});

test('geoFonte=geocode passa direto (não é alegação de GPS preciso; accuracy não se aplica)', () => {
  assert.equal(decidirGeoFonteCadastro(true, 'geocode', undefined), 'geocode');
  assert.equal(decidirGeoFonteCadastro(true, 'geocode', 999), 'geocode');
});

test('hasCoord=false → null, mesmo com accuracy boa e geoFonte alegado (nada a decidir sem pino)', () => {
  assert.equal(decidirGeoFonteCadastro(false, 'gps_cadastro', 5), null);
  assert.equal(decidirGeoFonteCadastro(false, 'geocode', undefined), null);
});

test('GPS_ACCURACY_LIMITE_METROS é 60 — mesma constante do "GPS de ouro" (gpsDeOuro)', () => {
  assert.equal(GPS_ACCURACY_LIMITE_METROS, 60);
});
