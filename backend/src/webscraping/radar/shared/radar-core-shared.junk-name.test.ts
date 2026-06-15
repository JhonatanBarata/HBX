import test from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeNonBusinessName, isRealisticBrPhone } from './radar-core-shared';

test('looksLikeNonBusinessName BARRA lixo de scraping (titulo de pagina / portal global / estrangeiro)', () => {
  const junk = [
    'Paramount Plus: Price, plans, and how to subscribe',
    '8 deaths that have rocked the NASCAR world this year',
    '30 Best Things to Do in Vancouver: Top Attractions',
    'Official Site of the National Hockey League',
    'Powerball Numbers for August 2, 2025 | Draw Results',
    'Protect your family in minutes',
    'Facts & Events That Happened Today In History',
    'On This Day',
    'IBEXエアラインズ',
    'Microsoft Tech Community | Home',
  ];
  for (const name of junk) {
    assert.equal(looksLikeNonBusinessName(name), true, `deveria BARRAR: ${name}`);
  }
});

test('looksLikeNonBusinessName NAO barra empresa brasileira real', () => {
  const real = [
    'Ótica Acará',
    'Pizzaria do João',
    'Centro de Formação de Condutores Silvana Abaeté',
    'Auto Escola Bom Jesus',
    'Top Móveis e Decorações',
    'Pet Shop Amigo Fiel',
    'Restaurante e Lanchonete Sabor Caseiro',
    'Farmácia Drogaria São Paulo Abaeté',
    'TOTI Madeiras e Materiais de Construção',
    'New Style Cabeleireiros',
    'Mercado Bom Preço',
    'Clínica Veterinária PetVida',
  ];
  for (const name of real) {
    assert.equal(looksLikeNonBusinessName(name), false, `NAO deveria barrar: ${name}`);
  }
});

test('isRealisticBrPhone ACEITA telefone BR que existe', () => {
  const real = [
    '11987654321',      // celular SP
    '5531988887777',    // celular MG com 55
    '(31) 3333-4444',   // fixo MG
    '6235551234',       // fixo DF
    '4733221100',       // fixo SC
  ];
  for (const phone of real) {
    assert.equal(isRealisticBrPhone(phone), true, `deveria ACEITAR: ${phone}`);
  }
});

test('isRealisticBrPhone BARRA telefone que nao existe', () => {
  for (const phone of ['11111111111', '99999999999', '00000000000', '2099999999', '11199999999', '999999999', '12345']) {
    assert.equal(isRealisticBrPhone(phone), false, `deveria BARRAR: ${phone}`);
  }
  // fixo valido (DDD 11, assinante comeca com 2) deve ACEITAR
  assert.equal(isRealisticBrPhone('1122223333'), true);
});
