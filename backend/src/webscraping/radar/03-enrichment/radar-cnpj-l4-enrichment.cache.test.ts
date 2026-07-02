import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarCnpjL4EnrichmentService, type CnpjL4Result } from './radar-cnpj-l4-enrichment.service';

/**
 * Furo comprovado 01/07 (docs/PLANEJAMENTOS/PR01072026/30-motor-receita.md): `cacheIntoLocal`
 * gravava a linha SEM phone/city/state/normalizedCity/searchText -> linha invisível pro
 * `CnpjPublicDatasetService.fetchRecords` (filtra por normalizedCity/searchText). Estes testes
 * cobrem o upsert via `lookup()` (fluxo público que aciona `cacheIntoLocal` internamente quando
 * o dataset local está vazio e a BrasilAPI responde).
 */

function makeMockPrisma(opts: { existingRow?: any; brasilApiResult?: any } = {}) {
  const created: any[] = [];
  const updated: any[] = [];
  let existing = opts.existingRow || null;

  return {
    cnpjPublicCompany: {
      findUnique: async ({ where }: any) => {
        if (where.cnpj === existing?.cnpj) return existing;
        return null;
      },
      create: async ({ data }: any) => {
        created.push(data);
        existing = { ...data };
        return data;
      },
      update: async ({ where, data }: any) => {
        updated.push(data);
        existing = { ...existing, ...data };
        return existing;
      },
    },
    __inspect: () => ({ created, updated, existing: () => existing }),
  };
}

function stubBrasilApiFetch(payload: Record<string, any>) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  });
}

test('cacheIntoLocal (via lookup): grava normalizedCity/searchText/phone corretos quando dataset local esta vazio', async () => {
  const originalFetch = globalThis.fetch;
  (globalThis as any).fetch = stubBrasilApiFetch({
    razao_social: 'Barbearia Exemplo Ltda',
    nome_fantasia: 'Barbearia Exemplo',
    cnae_fiscal: 9602501,
    cnae_fiscal_descricao: 'Cabeleireiros, manicure e pedicure',
    descricao_situacao_cadastral: 'ATIVA',
    municipio: 'Goiânia',
    uf: 'go',
    porte: 'ME',
    descricao_identificador_matriz_filial: 'MATRIZ',
    ddd_telefone_1: '62999998888',
    qsa: [{ nome_socio: 'Fulano de Tal', qualificacao_socio: 'Sócio-Administrador' }],
  });

  const prisma = makeMockPrisma();
  const service = new RadarCnpjL4EnrichmentService();
  const cnpj = '11222333000181';
  const result = await service.lookup(prisma, cnpj);

  assert.ok(result?.found);
  assert.equal(result?.nomeFantasia, 'Barbearia Exemplo');
  assert.equal(result?.city, 'Goiânia');
  assert.equal(result?.state, 'GO');
  assert.equal(result?.porte, 'ME');
  assert.equal(result?.matrizFilial, 'MATRIZ');

  const { created } = (prisma as any).__inspect();
  assert.equal(created.length, 1, 'deve ter criado a linha no dataset local');
  const row = created[0];
  assert.equal(row.cnpj, cnpj);
  assert.equal(row.phone, '62999998888');
  assert.equal(row.phoneDigits, '62999998888');
  assert.equal(row.city, 'Goiânia');
  assert.equal(row.state, 'GO');
  // normalizedCity: minusculo, sem acento
  assert.equal(row.normalizedCity, 'goiania');
  // searchText: fantasia + razao + cnae + cnaeDescription normalizados
  assert.ok(row.searchText.includes('barbearia exemplo'));
  assert.ok(row.searchText.includes('cabeleireiros'));
  assert.equal(row.porte, 'ME');
  assert.equal(row.matrizFilial, 'MATRIZ');

  (globalThis as any).fetch = originalFetch;
});

test('cacheIntoLocal (via lookup): update PREENCHE campos vazios sem sobrescrever nao-nulos existentes', async () => {
  const originalFetch = globalThis.fetch;
  // CNPJ distinto do teste anterior: `brasilApiCache` eh um Map ESTATICO compartilhado entre
  // instancias do service (mesmo processo de teste) -- reusar o mesmo CNPJ faria este teste
  // ler o cache do teste anterior em vez de bater no fetch stub novo.
  const cnpj = '64711048000190';
  // Linha existente já tem razaoSocial preenchida (valor "correto" que não deve ser sobrescrito)
  // mas falta ownerNames (rawJson vazio) -> lookup() vai na BrasilAPI pra completar o sócio,
  // e cacheIntoLocal deve then preencher phone/city/normalizedCity/searchText que estavam vazios.
  const existingRow = {
    cnpj,
    razaoSocial: 'Nome Ja Existente Ltda',
    nomeFantasia: null,
    cnae: null,
    cnaeDescription: null,
    situacao: 'ativa',
    address: null,
    email: null,
    phone: null,
    phoneDigits: null,
    city: null,
    state: null,
    normalizedCity: '',
    searchText: '',
    porte: null,
    matrizFilial: null,
    rawJson: null,
  };

  (globalThis as any).fetch = stubBrasilApiFetch({
    razao_social: 'Nome Vindo Da BrasilAPI Ltda', // NAO deve sobrescrever o existente
    nome_fantasia: 'Fantasia Nova',
    municipio: 'Fortaleza',
    uf: 'CE',
    ddd_telefone_1: '85988887777',
    qsa: [{ nome_socio: 'Ciclana', qualificacao_socio: 'Titular' }],
  });

  const prisma = makeMockPrisma({ existingRow });
  const service = new RadarCnpjL4EnrichmentService();
  const result = await service.lookup(prisma, cnpj);

  assert.ok(result?.found);
  // ownerNames veio da API (dataset local não tinha)
  assert.deepEqual(result?.ownerNames, ['Ciclana']);

  const { updated, existing } = (prisma as any).__inspect();
  assert.ok(updated.length >= 1, 'deve ter chamado update para preencher os campos vazios');
  const finalRow = existing();
  // razaoSocial NAO foi sobrescrita (já tinha valor)
  assert.equal(finalRow.razaoSocial, 'Nome Ja Existente Ltda');
  // campos vazios foram preenchidos
  assert.equal(finalRow.nomeFantasia, 'Fantasia Nova');
  assert.equal(finalRow.city, 'Fortaleza');
  assert.equal(finalRow.state, 'CE');
  assert.equal(finalRow.phone, '85988887777');
  assert.equal(finalRow.normalizedCity, 'fortaleza');
  assert.ok(finalRow.searchText.length > 0);

  (globalThis as any).fetch = originalFetch;
});

// R1 (calibracao round-3, 01/07): BrasilAPI pode devolver celular legado (10 digitos,
// 3o digito 6-9, cadastro anterior ao nono-digito) — `_fetchBrasilApi` deve normalizar
// na FONTE (norma Anatel), senao `isRealisticBrPhone` mata o card rio abaixo.
test('_fetchBrasilApi (via lookup): normaliza celular legado 10 digitos vindo da BrasilAPI', async () => {
  const originalFetch = globalThis.fetch;
  const cnpj = '45723174000110';
  (globalThis as any).fetch = stubBrasilApiFetch({
    razao_social: 'Pizzaria Legado Ltda',
    nome_fantasia: 'Pizzaria Legado',
    municipio: 'Goiânia',
    uf: 'GO',
    ddd_telefone_1: '6292617022', // 10 digitos, 3o digito '9' -> celular legado
    qsa: [{ nome_socio: 'Fulano', qualificacao_socio: 'Titular' }],
  });

  const prisma = makeMockPrisma();
  const service = new RadarCnpjL4EnrichmentService();
  const result = await service.lookup(prisma, cnpj);

  assert.ok(result?.found);
  assert.equal(result?.phone, '62992617022');

  const { created } = (prisma as any).__inspect();
  assert.equal(created[0]?.phone, '62992617022');
  assert.equal(created[0]?.phoneDigits, '62992617022');

  (globalThis as any).fetch = originalFetch;
});

test('_fetchBrasilApi (via lookup): fixo legado (3o digito 2-5) nao e alterado', async () => {
  const originalFetch = globalThis.fetch;
  const cnpj = '78219654000102';
  (globalThis as any).fetch = stubBrasilApiFetch({
    razao_social: 'Padaria Fixo Ltda',
    nome_fantasia: 'Padaria Fixo',
    municipio: 'Fortaleza',
    uf: 'CE',
    ddd_telefone_1: '6232810912', // fixo, 3o digito '3' -> intocado
    qsa: [{ nome_socio: 'Beltrano', qualificacao_socio: 'Titular' }],
  });

  const prisma = makeMockPrisma();
  const service = new RadarCnpjL4EnrichmentService();
  const result = await service.lookup(prisma, cnpj);

  assert.ok(result?.found);
  assert.equal(result?.phone, '6232810912');

  (globalThis as any).fetch = originalFetch;
});

test('cacheIntoLocal: nao grava quando faltam cnpj/razaoSocial (guard best-effort)', async () => {
  const prisma = makeMockPrisma();
  const service = new RadarCnpjL4EnrichmentService();
  // Acessa o método privado via cast pra testar o guard isoladamente.
  const asAny = service as any;
  const incomplete: Partial<CnpjL4Result> = { found: true, cnpj: null, razaoSocial: null };
  await asAny.cacheIntoLocal(prisma, incomplete);
  const { created, updated } = (prisma as any).__inspect();
  assert.equal(created.length, 0);
  assert.equal(updated.length, 0);
});
