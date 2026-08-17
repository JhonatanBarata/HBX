import test from 'node:test';
import assert from 'node:assert/strict';

import { buscaNoGoogle, ehPortalDeCidade, resolveLeadSiteHref } from '../src/lib/lead-site-link.mjs';

// Os DOIS casos que o dono mandou (17/08): portal de cidade que entrou como site do lead.
test('os dois portais reclamados pelo dono são reconhecidos', () => {
  assert.equal(ehPortalDeCidade('https://www.encontrahortolandia.com.br/#google_vignette'), true);
  assert.equal(ehPortalDeCidade('https://www.sitedacidade.com.br/'), true);
});

test('a família inteira do "encontra<cidade>" cai na mesma entrada', () => {
  assert.equal(ehPortalDeCidade('encontracampinas.com.br'), true);
  assert.equal(ehPortalDeCidade('https://encontraindaiatuba.com.br/agua'), true);
});

test('os diretórios que o motor já rejeitava continuam reconhecidos aqui', () => {
  assert.equal(ehPortalDeCidade('https://www.apontador.com.br/local/sp/valinhos/agua.html'), true);
  assert.equal(ehPortalDeCidade('https://www.guiamais.com.br/busca/agua/valinhos-sp'), true);
  assert.equal(ehPortalDeCidade('https://www.solutudo.com.br/empresas/sp/valinhos/agua'), true);
});

// VACINA ANTI-FALSO-POSITIVO: trocar site de verdade por busca do Google é pior do que deixar
// um portal passar — o vendedor perde o site da empresa.
test('site de verdade NÃO vira busca', () => {
  assert.equal(ehPortalDeCidade('https://valinagua.com.br'), false);
  assert.equal(ehPortalDeCidade('www.ferreiragua.com.br'), false);
  assert.equal(ehPortalDeCidade('https://acquarella.ind.br/contato'), false);
  // 'encontro' não é 'encontra' — o prefixo casa a família, não qualquer palavra parecida.
  assert.equal(ehPortalDeCidade('https://encontrodeaguas.com.br'), false);
});

test('site de verdade mantém o próprio endereço, com esquema quando falta', () => {
  assert.equal(
    resolveLeadSiteHref({ website: 'https://valinagua.com.br', name: 'Valinágua', city: 'Valinhos', state: 'SP' }),
    'https://valinagua.com.br',
  );
  assert.equal(
    resolveLeadSiteHref({ website: 'ferreiragua.com.br', name: 'Ferreirágua', city: 'Valinhos', state: 'SP' }),
    'https://ferreiragua.com.br',
  );
});

test('portal de cidade vira a busca do Google por nome + cidade + estado', () => {
  const href = resolveLeadSiteHref({
    website: 'https://www.encontrahortolandia.com.br/#google_vignette',
    name: 'Água Boa Distribuidora',
    city: 'Hortolândia',
    state: 'SP',
  });
  assert.equal(href, 'https://www.google.com/search?q=%C3%81gua%20Boa%20Distribuidora%20Hortol%C3%A2ndia%20SP');
});

test('sem nome pra buscar, o portal volta a ser o próprio link (link ruim > link morto)', () => {
  assert.equal(
    resolveLeadSiteHref({ website: 'https://www.sitedacidade.com.br/', name: '', city: '', state: '' }),
    'https://www.sitedacidade.com.br/',
  );
});

test('sem website não há link nenhum', () => {
  assert.equal(resolveLeadSiteHref({ website: '', name: 'X', city: 'Y', state: 'SP' }), null);
  assert.equal(resolveLeadSiteHref(), null);
});

test('entrada quebrada não derruba a tela', () => {
  assert.equal(ehPortalDeCidade('http://'), false);
  assert.equal(ehPortalDeCidade(null), false);
  assert.equal(buscaNoGoogle(), '');
});
