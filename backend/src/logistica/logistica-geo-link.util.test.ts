import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coordenadaDaUrl,
  coordenadaValida,
  hostDeMapa,
  lerTextoColado,
  primeiroLink,
} from './logistica-geo-link.util';

// A cena que estes testes protegem (pedido do dono, 31/07): o amigo manda a
// localização no WhatsApp, ele cola no HBX e o app precisa saber PARA ONDE IR.
// Cada formato aqui é um jeito real de compartilhar localização.

test('coordenada fora da faixa (e o 0,0 do "sem localização") não passa', () => {
  assert.equal(coordenadaValida(-22.41, -47.56), true);
  assert.equal(coordenadaValida(91, 0), false);
  assert.equal(coordenadaValida(0, 0), false);
  assert.equal(coordenadaValida('abc', 10), false);
});

test('só host de mapa conhecido é aberto — o resto nem é tentado', () => {
  assert.equal(hostDeMapa('https://maps.app.goo.gl/abc123'), true);
  assert.equal(hostDeMapa('https://www.google.com/maps/place/x'), true);
  // A trava que impede o servidor de virar proxy pra rede interna (SSRF).
  assert.equal(hostDeMapa('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(hostDeMapa('https://maps.app.goo.gl.attacker.com/x'), false);
  assert.equal(hostDeMapa('nao-e-url'), false);
});

test('coordenada sai do próprio link do Maps, sem abrir nada', () => {
  const place = coordenadaDaUrl('https://www.google.com/maps/place/Rio+Claro/@-22.4149,-47.5615,17z');
  assert.equal(place.fonte, 'url');
  assert.ok(Math.abs(Number(place.lat) + 22.4149) < 0.0001);
  assert.ok(Math.abs(Number(place.lng) + 47.5615) < 0.0001);

  const query = coordenadaDaUrl('https://maps.google.com/?q=-22.41490,-47.56150');
  assert.equal(query.fonte, 'url');
  assert.ok(Math.abs(Number(query.lat) + 22.4149) < 0.0001);
});

test('link curto não entrega coordenada sozinho — é por isso que o servidor existe', () => {
  assert.equal(coordenadaDaUrl('https://maps.app.goo.gl/aBcD123').fonte, 'nenhum');
});

test('coordenada colada na mão vale, com ponto ou com vírgula decimal', () => {
  const ponto = lerTextoColado('-22.4149, -47.5615');
  assert.equal(ponto.destino.fonte, 'texto');
  assert.ok(Math.abs(Number(ponto.destino.lat) + 22.4149) < 0.0001);

  const virgula = lerTextoColado('-22,4149, -47,5615');
  assert.ok(Math.abs(Number(virgula.destino.lat) + 22.4149) < 0.0001);
});

test('link no meio da mensagem do WhatsApp é achado', () => {
  const texto = 'Chega logo! https://maps.app.goo.gl/aBcD123 tô te esperando';
  assert.equal(primeiroLink(texto), 'https://maps.app.goo.gl/aBcD123');
  assert.equal(lerTextoColado(texto).link, 'https://maps.app.goo.gl/aBcD123');
});

test('texto sem localização nenhuma não inventa destino', () => {
  const nada = lerTextoColado('bom dia, tudo certo?');
  assert.equal(nada.destino.fonte, 'nenhum');
  assert.equal(nada.destino.lat, null);
});
