import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarWebEnrichmentService } from './radar-web-enrichment.service';

// Sprint 2 MOTOR-RFB-FILA: descoberta LOCAL de CNPJ por nome+cidade (base do dump da RFB)
// ANTES do Brave. Regra dura: só devolve CNPJ quando o match é INEQUÍVOCO — CNPJ errado
// envenena o lead; ambiguidade devolve null (chamador cai pro Brave).

const CNPJ_MATRIZ = '11222333000181';
const CNPJ_FILIAL = '11222333000262';
const CNPJ_OUTRA = '64711048000190';

function prismaMock(rows: Array<Record<string, any>>, calls: any[] = []) {
  return {
    cnpjPublicCompany: {
      findMany: async (args: any) => {
        calls.push(args);
        return rows;
      },
    },
  };
}

function service() {
  return new RadarWebEnrichmentService();
}

test('discoverCnpjByName local: hit único na cidade devolve o CNPJ sem Brave', async () => {
  const prisma = prismaMock([
    { cnpj: CNPJ_MATRIZ, nomeFantasia: 'PIZZARIA DO ZE', razaoSocial: 'JOSE DA SILVA PIZZARIA LTDA' },
  ]);
  const found = await service().discoverCnpjByName(
    null as any,
    { name: 'Pizzaria do Zé', city: 'Fortaleza', state: 'CE' },
    prisma,
  );
  assert.equal(found, CNPJ_MATRIZ);
});

test('discoverCnpjByName local: matriz e filiais da MESMA empresa não são ambiguidade', async () => {
  const prisma = prismaMock([
    { cnpj: CNPJ_MATRIZ, nomeFantasia: 'PIZZARIA DO ZE', razaoSocial: 'JOSE DA SILVA PIZZARIA LTDA' },
    { cnpj: CNPJ_FILIAL, nomeFantasia: 'PIZZARIA DO ZE', razaoSocial: 'JOSE DA SILVA PIZZARIA LTDA' },
  ]);
  const found = await service().discoverCnpjByName(
    null as any,
    { name: 'Pizzaria do Zé', city: 'Fortaleza', state: null },
    prisma,
  );
  // orderBy cnpj asc no SELECT → matriz (…0001…) vem primeiro
  assert.equal(found, CNPJ_MATRIZ);
});

test('discoverCnpjByName local: empresas DIFERENTES contendo o nome = ambíguo = null', async () => {
  const prisma = prismaMock([
    { cnpj: CNPJ_MATRIZ, nomeFantasia: 'MERCADINHO SAO JOSE CENTRO', razaoSocial: 'A LTDA' },
    { cnpj: CNPJ_OUTRA, nomeFantasia: 'MERCADINHO SAO JOSE DA PRAIA', razaoSocial: 'B LTDA' },
  ]);
  const found = await service().discoverCnpjByName(
    null as any,
    { name: 'Mercadinho São José', city: 'Fortaleza', state: 'CE' },
    prisma,
  );
  assert.equal(found, null);
});

test('discoverCnpjByName local: fantasia EXATA única desempata múltiplas empresas', async () => {
  const prisma = prismaMock([
    { cnpj: CNPJ_OUTRA, nomeFantasia: 'MERCADINHO SAO JOSE DA PRAIA', razaoSocial: 'B LTDA' },
    { cnpj: CNPJ_MATRIZ, nomeFantasia: 'MERCADINHO SAO JOSE', razaoSocial: 'A LTDA' },
  ]);
  const found = await service().discoverCnpjByName(
    null as any,
    { name: 'Mercadinho São José', city: 'Fortaleza', state: 'CE' },
    prisma,
  );
  assert.equal(found, CNPJ_MATRIZ);
});

test('discoverCnpjByName local: nome curto demais nem consulta o banco', async () => {
  const calls: any[] = [];
  const prisma = prismaMock([{ cnpj: CNPJ_MATRIZ, nomeFantasia: 'ACAI', razaoSocial: 'ACAI LTDA' }], calls);
  const found = await service().discoverCnpjByName(
    null as any,
    { name: 'Açaí', city: 'Fortaleza', state: 'CE' },
    prisma,
  );
  assert.equal(found, null);
  assert.equal(calls.length, 0);
});

test('discoverCnpjByName local: sem cidade não afirma identidade (null)', async () => {
  const calls: any[] = [];
  const prisma = prismaMock([{ cnpj: CNPJ_MATRIZ, nomeFantasia: 'PIZZARIA DO ZE', razaoSocial: 'X' }], calls);
  const found = await service().discoverCnpjByName(
    null as any,
    { name: 'Pizzaria do Zé', city: '', state: 'CE' },
    prisma,
  );
  assert.equal(found, null);
  assert.equal(calls.length, 0);
});

test('discoverCnpjByName local: filtra situacao ativa e cidade normalizada na query', async () => {
  const calls: any[] = [];
  const prisma = prismaMock([
    { cnpj: CNPJ_MATRIZ, nomeFantasia: 'PIZZARIA DO ZE', razaoSocial: 'X LTDA' },
  ], calls);
  await service().discoverCnpjByName(
    null as any,
    { name: 'Pizzaria do Zé', city: 'São Gonçalo do Amarante', state: 'ce' },
    prisma,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.normalizedCity, 'sao goncalo do amarante');
  assert.equal(calls[0].where.state, 'CE');
  assert.equal(calls[0].where.situacao, 'ativa');
  assert.equal(calls[0].where.searchText.contains, 'pizzaria do ze');
});

test('discoverCnpjByName: sem base local e sem BRAVE_SEARCH_API_KEY devolve null sem quebrar', async () => {
  const previous = process.env.BRAVE_SEARCH_API_KEY;
  delete process.env.BRAVE_SEARCH_API_KEY;
  try {
    const found = await service().discoverCnpjByName(
      null as any,
      { name: 'Pizzaria do Zé', city: 'Fortaleza', state: 'CE' },
      undefined,
    );
    assert.equal(found, null);
  } finally {
    if (previous !== undefined) process.env.BRAVE_SEARCH_API_KEY = previous;
  }
});
