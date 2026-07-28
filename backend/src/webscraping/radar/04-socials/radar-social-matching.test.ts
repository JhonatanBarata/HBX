import test from 'node:test';
import assert from 'node:assert/strict';
import { socialProfileLooksCompatibleWithLead } from './radar-social-matching';

// Casos REAIS da regressão de 28/07 (VPS, "sociais errando quase tudo"): a porta de identidade
// tinha um bypass que confiava cegamente no carimbo do motor (found/82) e contava o nome da
// CIDADE como token de marca — portal local e perfil de terceiro passavam.

test('porta: perfil de portal local NAO passa nem com carimbo found/82 do motor (bypass morto)', () => {
  const row = {
    name: 'Zacarias Gás e Água Mineral',
    city: 'Zacarias',
    source: 'hbx_scraping:free_pj',
    socialStatus: 'found',
    socialConfidence: 82,
  };
  assert.equal(socialProfileLooksCompatibleWithLead(row, 'https://instagram.com/portalzacarias.oficial'), false);
});

test('porta: perfil de OUTRA empresa/entidade nao passa', () => {
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Informática & Eletrônicos', city: 'Aguaí' }, 'https://instagram.com/miraodistribuidora'),
    false,
  );
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Encanto da Villa', city: 'Águas de Lindóia' }, 'https://instagram.com/recanto_da_serra_pousada'),
    false,
  );
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Wikipédia, a enciclopédia livre', city: 'Zacarias' }, 'https://instagram.com/press'),
    false,
  );
});

test('porta: perfil legitimo continua passando (marca no handle)', () => {
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Maguacamp', city: 'Sorocaba' }, 'https://instagram.com/maguacamp_sorocaba'),
    true,
  );
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Anny Fotografia Fotógrafa Infantil', city: 'Aguaí' }, 'https://instagram.com/annyfotografia'),
    true,
  );
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Rommac Distribuidora', city: 'Águas da Prata' }, 'https://facebook.com/RommacDistribuidora'),
    true,
  );
});

test('porta: nome com a cidade DENTRO segue casando pela frase completa do nome', () => {
  // A cidade sai dos tokens soltos de identidade, mas o nome inteiro (na ordem) continua
  // valendo — handle real que usa o nome completo, cidade inclusa, nao pode ser rejeitado.
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Disk Aguaí Água Mineral', city: 'Aguaí' }, 'https://instagram.com/diskaguaiaguamineral'),
    true,
  );
});

test('porta: nome que e SO cidade+categoria nao tem identidade pra confirmar handle', () => {
  // Sobrando so token de cidade/categoria, nao ha marca — sem identidade, nao se confirma
  // social nenhum (melhor vazio que perfil de terceiro).
  assert.equal(
    socialProfileLooksCompatibleWithLead({ name: 'Águas de Lindóia', city: 'Águas de Lindóia' }, 'https://instagram.com/aguasdelindoia'),
    false,
  );
});
