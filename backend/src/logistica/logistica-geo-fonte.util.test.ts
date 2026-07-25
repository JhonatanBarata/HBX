import test from 'node:test';
import assert from 'node:assert/strict';

import { resolverCoordenadaMultilocal } from './logistica-geo-fonte.util';

// Incidente 25/07 (empresa 41): o backfill do freio do geocode deixou ~824
// LocalEntrega com lat/lng = null de propósito (pendência honesta). O bug que este
// util corrige: `r.local ? r.local.lat : r.customerProfile.lat` testava só a
// EXISTÊNCIA do objeto `local`, não se ele TINHA coordenada — cliente com
// LocalEntrega sem pino e perfil com pino BOM perdia o pino bom. E o jeito ingênuo
// de consertar (`local?.lat ?? perfil?.lat` campo a campo) cria um bug PIOR: mistura
// a lat de uma fonte com a lng de outra, gerando um pino no meio do nada — o mesmo
// "pino que mentia" que o freio do geocode matou.

test('(a) local com lat+lng válidos → usa o local', () => {
  const local = { lat: -22.1, lng: -47.5, geoFonte: 'gps_cadastro' };
  const perfil = { lat: -22.9, lng: -47.9, geoFonte: 'geocode' };

  const resultado = resolverCoordenadaMultilocal(local, perfil);

  assert.deepEqual(resultado, { lat: -22.1, lng: -47.5, geoFonte: 'gps_cadastro' });
});

test('(b) local existe mas SEM coordenada + perfil com pino bom → usa o PERFIL (o bug original)', () => {
  const local = { lat: null, lng: null, geoFonte: null }; // 1 dos 824 do backfill
  const perfil = { lat: -22.9, lng: -47.9, geoFonte: 'geocode' };

  const resultado = resolverCoordenadaMultilocal(local, perfil);

  assert.deepEqual(resultado, { lat: -22.9, lng: -47.9, geoFonte: 'geocode' });
});

test('(c) local com lat mas SEM lng → não mistura fontes, cai inteiro pro perfil', () => {
  const local = { lat: -22.1, lng: null, geoFonte: 'gps_cadastro' };
  const perfil = { lat: -22.9, lng: -47.9, geoFonte: 'geocode' };

  const resultado = resolverCoordenadaMultilocal(local, perfil);

  assert.deepEqual(resultado, { lat: -22.9, lng: -47.9, geoFonte: 'geocode' });
  // Nunca a lat do local combinada com a lng do perfil (pino no meio do nada).
  assert.notEqual(resultado.lat, -22.1);
});

test('(c-bis) local com lng mas SEM lat → não mistura fontes, cai inteiro pro perfil', () => {
  const local = { lat: null, lng: -47.5, geoFonte: 'gps_cadastro' };
  const perfil = { lat: -22.9, lng: -47.9, geoFonte: 'geocode' };

  const resultado = resolverCoordenadaMultilocal(local, perfil);

  assert.deepEqual(resultado, { lat: -22.9, lng: -47.9, geoFonte: 'geocode' });
  assert.notEqual(resultado.lng, -47.5);
});

test('(d) nada em lugar nenhum → null nos dois eixos e geoFonte null', () => {
  const local = { lat: null, lng: null };
  const perfil = { lat: null, lng: null };

  const resultado = resolverCoordenadaMultilocal(local, perfil);

  assert.deepEqual(resultado, { lat: null, lng: null, geoFonte: null });
});

test('local ausente (null) + perfil com pino → usa o perfil (fluxo legado sem MULTILOCAL)', () => {
  const resultado = resolverCoordenadaMultilocal(null, { lat: -22.9, lng: -47.9, geoFonte: 'geocode' });

  assert.deepEqual(resultado, { lat: -22.9, lng: -47.9, geoFonte: 'geocode' });
});

test('local e perfil ausentes (null/undefined) → tudo null, sem lançar', () => {
  assert.deepEqual(resolverCoordenadaMultilocal(null, null), { lat: null, lng: null, geoFonte: null });
  assert.deepEqual(resolverCoordenadaMultilocal(undefined, undefined), { lat: null, lng: null, geoFonte: null });
});

test('NaN não conta como coordenada válida (evita Number("lixo") virar pino)', () => {
  const local = { lat: NaN, lng: -47.5 };
  const perfil = { lat: -22.9, lng: -47.9, geoFonte: 'geocode' };

  const resultado = resolverCoordenadaMultilocal(local, perfil);

  assert.deepEqual(resultado, { lat: -22.9, lng: -47.9, geoFonte: 'geocode' });
});
