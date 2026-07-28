import test from 'node:test';
import assert from 'node:assert/strict';

import { __setCnefeQueryForTests } from '../nucleo/cnefe-resolver.util';
import {
  classificarCampoBasico,
  diagnosticoCampoFaltante,
  sanitizarEndereco,
  type EnderecoImportado,
} from './logistica-importacao-sanitizacao.util';

/**
 * F4 (27/07, PR27072026-ROTA-3-NIVEIS) — prova o WRAPPER da régua verde/vermelho da
 * quarentena de importação. Não reprova o motor CNEFE em si (resolverCuraCnefe/
 * resolverCnefe/resolverCnefeLote já têm cobertura exaustiva em
 * logistica-conferencia.service.test.ts e logistica-cep.util.test.ts — duplicar
 * aqui seria o MESMO teste com outro nome). O que este arquivo prova:
 *   1. a passada BARATA (classificarCampoBasico/diagnosticoCampoFaltante) nunca
 *      toca rede/banco e devolve o motivo CERTO, na ORDEM certa;
 *   2. sanitizarEndereco delega pro motor real e traduz o resultado certo;
 *   3. os CURTO-CIRCUITOS (nunca gasta uma consulta CNEFE à toa) — provados com um
 *      mock que EXPLODE se for chamado.
 */

const ENDERECO_COMPLETO: EnderecoImportado = {
  endereco: 'Rua das Flores', numero: '123', bairro: 'Centro', cidade: 'Rio Claro', uf: 'SP', cep: '13990000',
};

test('diagnosticoCampoFaltante: ordem número → rua → cidade → UF (mesma ordem do sanitizador de rota)', () => {
  assert.equal(diagnosticoCampoFaltante({ ...ENDERECO_COMPLETO, numero: null, endereco: 'Rua sem número' }), 'Falta o número da casa');
  assert.equal(diagnosticoCampoFaltante({ ...ENDERECO_COMPLETO, endereco: null }), 'Falta a rua');
  assert.equal(diagnosticoCampoFaltante({ ...ENDERECO_COMPLETO, cidade: null }), 'Falta a cidade');
  assert.equal(diagnosticoCampoFaltante({ ...ENDERECO_COMPLETO, uf: null }), 'Falta o estado (UF)');
  assert.equal(diagnosticoCampoFaltante(ENDERECO_COMPLETO), null, 'completo não falta nada');
});

test('classificarCampoBasico: sem endereço NEM CEP nenhum vira VERMELHO "Falta endereço"', () => {
  const r = classificarCampoBasico({ endereco: null, numero: null, bairro: null, cidade: null, uf: null, cep: null });
  assert.deepEqual(r, { status: 'VERMELHO', motivo: 'Falta endereço' });
});

test('classificarCampoBasico: campo básico faltando vira VERMELHO com o motivo específico', () => {
  const r = classificarCampoBasico({ ...ENDERECO_COMPLETO, numero: null, endereco: 'Rua tal' });
  assert.equal(r.status, 'VERMELHO');
  assert.equal(r.motivo, 'Falta o número da casa');
});

test('classificarCampoBasico: campos completos vira PENDENTE (candidato a VERDE, aguardando CNEFE)', () => {
  const r = classificarCampoBasico(ENDERECO_COMPLETO);
  assert.deepEqual(r, { status: 'PENDENTE', motivo: null });
});

test('sanitizarEndereco: item já VERMELHO na passada básica NUNCA consulta CNEFE (custo zero)', async () => {
  __setCnefeQueryForTests(async () => { throw new Error('NUNCA deveria consultar CNEFE — item já era VERMELHO na passada barata'); });
  try {
    const r = await sanitizarEndereco({ endereco: null, numero: null, bairro: null, cidade: null, uf: null, cep: null });
    assert.equal(r.status, 'VERMELHO');
    assert.equal(r.motivo, 'Falta endereço');
    assert.equal(r.lat, null);
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('sanitizarEndereco: sem CEP e sem bairro no cadastro — VERMELHO "Falta o bairro" SEM gastar consulta (mesmo guard de resolverCuraCnefe, checado ANTES)', async () => {
  __setCnefeQueryForTests(async () => { throw new Error('NUNCA deveria consultar CNEFE — sem bairro pra desempatar trecho de rua'); });
  try {
    const r = await sanitizarEndereco({ endereco: 'Rua das Flores', numero: '123', bairro: null, cidade: 'Rio Claro', uf: 'SP', cep: null });
    assert.equal(r.status, 'VERMELHO');
    assert.match(r.motivo ?? '', /bairro/i);
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('sanitizarEndereco: CEP+número achados na base CNEFE → VERDE com pino e geoFonte=cnefe', async () => {
  __setCnefeQueryForTests(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    if (sql.includes('cep = $1 AND numero = $2')) {
      const numero = Number(params[1]);
      return [{ logradouro: 'Rua das Flores', numero, lat: -22.41, lng: -47.56, nivel_geo: 1, municipio: 'Rio Claro' }];
    }
    return [];
  });
  try {
    const r = await sanitizarEndereco(ENDERECO_COMPLETO);
    assert.equal(r.status, 'VERDE');
    assert.equal(r.motivo, null);
    assert.equal(r.geoFonte, 'cnefe');
    assert.equal(typeof r.lat, 'number');
    assert.equal(typeof r.lng, 'number');
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('sanitizarEndereco: CEP+número NÃO achados na base → VERMELHO "Endereço não achado na base" (nunca inventa pino)', async () => {
  __setCnefeQueryForTests(async (sql: string) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'carregada' }];
    return []; // base carregada, mas (cep,numero) não existe
  });
  try {
    const r = await sanitizarEndereco(ENDERECO_COMPLETO);
    assert.equal(r.status, 'VERMELHO');
    assert.equal(r.motivo, 'Endereço não achado na base');
    assert.equal(r.lat, null);
    assert.equal(r.lng, null);
  } finally {
    __setCnefeQueryForTests(null);
  }
});

test('sanitizarEndereco: UF da linha SEM carga na base CNEFE → VERMELHO sem pino (fail-closed, nunca chuta)', async () => {
  __setCnefeQueryForTests(async (sql: string) => {
    if (sql.includes('FROM cnefe_uf')) return [{ status: 'pendente' }];
    return [];
  });
  try {
    const r = await sanitizarEndereco(ENDERECO_COMPLETO);
    assert.equal(r.status, 'VERMELHO');
    assert.equal(r.lat, null);
  } finally {
    __setCnefeQueryForTests(null);
  }
});
