import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __setCnefeQueryForTests,
  escolherPinoPorta,
  viasCompativeisCnefe,
  type CnefeRow,
} from './cnefe-resolver.util';
import { mesmaPorta } from './endereco-porta.util';
import { resolveServerGeo } from './nucleo-geo.util';
import { forcaGeoFonte, geoFonteDaPorta } from '../logistica/logistica-geo-fonte.util';

/**
 * F4 do PR12082026 — O CADASTRO HERDANDO A LEI DO CEP.
 *
 * A cena: no painel da parada avulsa (APK) a pessoa escolhe uma rua do Censo e
 * digita o número. O app manda pro `POST /nucleo/contas` o CEP e o endereço — e
 * NÃO manda o pino, de propósito: com CEP na mão quem resolve a coordenada é o
 * SERVIDOR, que consulta o CNEFE e grava a procedência certa (`geoFonte`). Se o
 * app mandasse o pino junto, o servidor carimbaria a conta como ponto marcado à
 * mão (`gps_impreciso`) — mentira sobre um pino que é do Censo.
 *
 * Só que esse caminho tinha DOIS buracos, e os dois são a mesma lei do dono:
 * "pino errado é pior que pino vazio" e "precisão fraca não pode se disfarçar de
 * porta".
 *
 *  1. 🔴 A AVENIDA COM NOME PERDIA O PINO. O Censo escreve "AVENIDA BRASIL"; o
 *     painel (e o cadastro do dono) escrevem "Av Brasil". A régua de via
 *     (`viasCompativeisCnefe`) só sabia igualar tipo abreviado quando a rua era
 *     NUMERADA — "Av 84" ≡ "AVENIDA OITENTA E QUATRO" passava pelo par
 *     tipo+número. Com NOME não havia par nenhum: "av brasil" ≠ "avenida
 *     brasil", o candidato era descartado e a conta nascia SEM PINO com o pino
 *     do Censo ali do lado. O mesmo veto derrubava calado o aviso de PORTA
 *     REPETIDA (`mesmaPorta` usa esta régua): duas contas na mesma porta, sem
 *     ninguém perguntar nada.
 *
 *  2. 🔴 O PINO DO VIZINHO SE VESTIA DE PORTA. `resolverCnefe` devolve
 *     `precisao: 'porta'` (a casa) OU `'rua'` (o vizinho de numeração — até 200
 *     números de distância e 400 m de dispersão). O `resolveServerGeo` carimbava
 *     as DUAS como `geoFonte: 'cnefe'` — que na escada da procedência é a PORTA
 *     provada (força 3, `geoFonteDaPorta` = true): pino intocável pela cura, e
 *     contado como "provado" no fechamento do dia. O ponto do vizinho acerta a
 *     RUA, não a casa — o nome disso na escada é `cnefe_cep` (força 2). Enquanto
 *     mentia de porta, ele impedia a própria cura que o corrigiria.
 */

function linha(partial: Partial<CnefeRow>): CnefeRow {
  return {
    logradouro: 'AVENIDA BRASIL',
    numero: 100,
    lat: -22.4154,
    lng: -47.567,
    nivel_geo: 1,
    municipio: 'Rio Claro',
    ...partial,
  };
}

// ── 1. A VIA É A MESMA ESCRITA DOS DOIS JEITOS ───────────────────────────────

test('via: avenida com NOME — "Av Brasil" é a mesma "AVENIDA BRASIL"', () => {
  assert.equal(viasCompativeisCnefe('Av Brasil', 'AVENIDA BRASIL'), true);
  assert.equal(viasCompativeisCnefe('Av. Visconde de Rio Claro', 'AVENIDA VISCONDE DE RIO CLARO'), true);
  assert.equal(viasCompativeisCnefe('Estr do Bosque', 'ESTRADA DO BOSQUE'), true);
  assert.equal(viasCompativeisCnefe('Pça da República', 'PRACA DA REPUBLICA'), true);
  assert.equal(viasCompativeisCnefe('R São João', 'RUA SAO JOAO'), true);
});

test('via: o tipo continua SEPARANDO ruas diferentes (nada afrouxou)', () => {
  // tipo diferente = via diferente, por mais que o nome bata
  assert.equal(viasCompativeisCnefe('Rua Brasil', 'AVENIDA BRASIL'), false);
  assert.equal(viasCompativeisCnefe('Travessa 8', 'RUA OITO'), false);
  // nome diferente segue diferente
  assert.equal(viasCompativeisCnefe('Av Brasil', 'AVENIDA BRASILIA'), false);
  assert.equal(viasCompativeisCnefe('Rua 8', 'RUA OITENTA'), false);
  // e a via numerada que já passava não pode regredir
  assert.equal(viasCompativeisCnefe('Av 84', 'AVENIDA OITENTA E QUATRO'), true);
});

test('o pino da AVENIDA COM NOME não morre no cadastro', () => {
  const pino = escolherPinoPorta(
    [linha({}), linha({ lat: -22.4155, lng: -47.5671 })],
    { cep: '13500123', numero: '100', endereco: 'Av Brasil' },
  );
  assert.ok(pino, 'o Censo tem a porta e o cadastro pediu a MESMA via: não pode voltar null');
  assert.equal(pino!.precisao, 'porta');
});

// ── 2. O VIZINHO NÃO É A PORTA ───────────────────────────────────────────────

test('resolveServerGeo: porta EXATA do Censo grava `cnefe` (a porta provada)', async () => {
  __setCnefeQueryForTests(async (sql) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    if (sql.includes('numero = $2')) return [linha({ logradouro: 'RUA OITO', numero: 1181 })];
    return [];
  });
  try {
    const geo = await resolveServerGeo({ cep: '13500123', numero: '1181', endereco: 'Rua 8', uf: 'SP' });
    assert.ok(geo);
    assert.equal(geo!.geoFonte, 'cnefe');
    assert.equal(geoFonteDaPorta(geo!.geoFonte), true, 'a porta exata É porta provada');
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('resolveServerGeo: pino do VIZINHO grava `cnefe_cep` — nunca `cnefe`', async () => {
  __setCnefeQueryForTests(async (sql) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    // a casa pedida não existe no Censo; o vizinho de numeração existe
    if (sql.includes('numero = $2')) return [];
    return [linha({ logradouro: 'RUA OITO', numero: 1175 })];
  });
  try {
    const geo = await resolveServerGeo({ cep: '13500123', numero: '1181', endereco: 'Rua 8', uf: 'SP' });
    assert.ok(geo, 'o vizinho continua valendo como PONTO — o que muda é o nome dele');
    assert.equal(
      geo!.geoFonte,
      'cnefe_cep',
      'o ponto do vizinho acerta a RUA, não a casa: na escada isso é cnefe_cep',
    );
    assert.equal(geoFonteDaPorta(geo!.geoFonte), false, 'vizinho NÃO conta como porta provada');
    assert.ok(
      forcaGeoFonte(geo!.geoFonte) < forcaGeoFonte('cnefe'),
      'e por isso a cura pela porta do Censo PODE trocá-lo depois',
    );
  } finally {
    __setCnefeQueryForTests(null);
  }
});

// ── 3. A GUARDA DA PORTA REPETIDA DISPARA NO CAMINHO NOVO ────────────────────

test('porta repetida: a MESMA avenida escrita dos dois jeitos dispara o aviso', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Av Brasil', numero: '100', cidade: 'Rio Claro', cep: '13500123' },
      { endereco: 'AVENIDA BRASIL', numero: '100', cidade: 'Rio Claro', cep: '13500123' },
    ),
    true,
  );
  // e o vizinho de porta continua sendo OUTRA porta (fail-closed intacto)
  assert.equal(
    mesmaPorta(
      { endereco: 'Av Brasil', numero: '100', cidade: 'Rio Claro', cep: '13500123' },
      { endereco: 'AVENIDA BRASIL', numero: '102', cidade: 'Rio Claro', cep: '13500123' },
    ),
    false,
  );
});
