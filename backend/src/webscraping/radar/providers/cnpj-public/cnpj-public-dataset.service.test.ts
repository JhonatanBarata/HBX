import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjPublicDatasetService } from './cnpj-public-dataset.service';

function makeMockPrisma(rows: any[]) {
  return {
    cnpjPublicCompany: {
      findMany: async () => rows,
    },
  };
}

const baseNormalized = { city: 'Goiânia', state: 'GO', segment: 'pizzaria' } as any;

// R1 (calibracao round-3, 01/07): linha do dataset local pode ter sido gravada com celular
// legado (10 digitos, 3o digito 6-9) antes deste fix — a leitura normaliza na FONTE (norma
// Anatel), senao `isRealisticBrPhone` mata o card rio abaixo.
test('fetchRecords: normaliza celular legado 10 digitos (3o digito 6-9) gravado na linha', async () => {
  const service = new CnpjPublicDatasetService();
  const prisma = makeMockPrisma([
    { cnpj: '11222333000181', nomeFantasia: 'Pizzaria Legado', phone: '6292617022' },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: baseNormalized });
  assert.equal(records[0]?.phone, '62992617022');
});

test('fetchRecords: fixo legado (3o digito 2-5) gravado na linha fica intocado', async () => {
  const service = new CnpjPublicDatasetService();
  const prisma = makeMockPrisma([
    { cnpj: '11222333000181', nomeFantasia: 'Padaria Fixo', phone: '6232810912' },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: baseNormalized });
  assert.equal(records[0]?.phone, '6232810912');
});

test('fetchRecords: 11 digitos (ja moderno) gravado na linha fica intocado', async () => {
  const service = new CnpjPublicDatasetService();
  const prisma = makeMockPrisma([
    { cnpj: '11222333000181', nomeFantasia: 'Pizzaria Moderna', phone: '62992617022' },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: baseNormalized });
  assert.equal(records[0]?.phone, '62992617022');
});

test('fetchRecords: linha sem phone continua null', async () => {
  const service = new CnpjPublicDatasetService();
  const prisma = makeMockPrisma([
    { cnpj: '11222333000181', nomeFantasia: 'Sem Fone', phone: null },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: baseNormalized });
  assert.equal(records[0]?.phone, null);
});
