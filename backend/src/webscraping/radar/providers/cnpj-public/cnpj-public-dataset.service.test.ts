import test from 'node:test';
import assert from 'node:assert/strict';
import { CnpjPublicDatasetService } from './cnpj-public-dataset.service';

// Mock fiel ao SELECT em 2 camadas do fetchRecords: a query primária (COM contato) e a de
// fill (sem contato, marcada por `NOT` no where) leem subconjuntos disjuntos da base — sem
// isso o mock devolveria a base inteira nas duas e duplicaria linhas.
function makeMockPrisma(rows: any[]) {
  const hasContact = (r: any) => Boolean(
    (r.phone && String(r.phone).trim()) || (r.email && String(r.email).trim()),
  );
  return {
    cnpjPublicCompany: {
      findMany: async (args: any = {}) => {
        const isFill = JSON.stringify(args?.where || {}).includes('"NOT"');
        return rows.filter((r) => (isFill ? !hasContact(r) : hasContact(r)));
      },
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
    { cnpj: '11222333000181', nomeFantasia: 'Pizzaria Fixo', phone: '6232810912' },
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
    { cnpj: '11222333000181', nomeFantasia: 'Pizzaria Sem Fone', phone: null },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: baseNormalized });
  assert.equal(records[0]?.phone, null);
});

// REGRESSÃO do furo 04/07 (VPS: 37.922 restaurantes SP, 97,6% com telefone, mas o
// `orderBy: updatedAt desc` num campo idêntico pra base inteira empurrava a minoria SEM
// contato pro topo → 199/200 sem fone → accepted=0). O SELECT agora prioriza quem TEM
// canal de contato utilizável; sem-contato só entram pra completar o take.
test('fetchRecords: prioriza registros COM contato antes dos sem contato', async () => {
  const service = new CnpjPublicDatasetService();
  const prisma = makeMockPrisma([
    { cnpj: '11222333000181', nomeFantasia: 'Pizzaria Sem Fone A', phone: '', email: '' },
    { cnpj: '11222333000182', nomeFantasia: 'Pizzaria Com Fone', phone: '62992617022' },
    { cnpj: '11222333000183', nomeFantasia: 'Pizzaria Sem Fone B', phone: null, email: null },
    { cnpj: '11222333000184', nomeFantasia: 'Pizzaria So Email', phone: '', email: 'contato@x.com.br' },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: baseNormalized });
  assert.equal(records.length, 4, 'nenhum registro perdido nem duplicado');
  // Os 2 com contato (fone/email) vêm antes dos 2 sem contato.
  assert.deepEqual(
    records.slice(0, 2).map((r) => r?.nomeFantasia).sort(),
    ['Pizzaria Com Fone', 'Pizzaria So Email'],
  );
  assert.deepEqual(
    records.slice(2).map((r) => r?.nomeFantasia).sort(),
    ['Pizzaria Sem Fone A', 'Pizzaria Sem Fone B'],
  );
});

test('fetchRecords: erro do delegate nao vira base vazia silenciosa', async () => {
  const service = new CnpjPublicDatasetService();
  const prisma = {
    cnpjPublicCompany: {
      findMany: async () => { throw new Error('coluna ausente'); },
    },
  };
  await assert.rejects(
    () => service.fetchRecords({ prisma, normalized: baseNormalized }),
    /Falha ao consultar CnpjPublicCompany: coluna ausente/,
  );
});

// REGRESSÃO 28/07 ("distribuidora de agua" em Aguas de Lindoia/Aguai/Zacarias trouxe igreja,
// academia, partido e piscicultor): o filtro fino do fetchRecords aplica a lei única de
// radar-segment-match.util — todas as palavras, palavra inteira, cidade pedida fora do texto.
test('fetchRecords: lixo de cidade-com-agua-no-nome e CNAE "agua doce" nao passam', async () => {
  const service = new CnpjPublicDatasetService();
  const aguasDeLindoia = { city: 'Águas de Lindóia', state: 'SP', segment: 'distribuidora de agua' } as any;
  const prisma = makeMockPrisma([
    { cnpj: '11222333000181', razaoSocial: 'IGREJA PRESBITERIANA DE AGUAS DE LINDOIA', phone: '1936000001', searchText: 'igreja presbiteriana de aguas de lindoia 9491000 atividades de organizacoes religiosas' },
    { cnpj: '11222333000182', razaoSocial: 'ACADEMIA CHAMPIONS AGUAI', phone: '1936000002', searchText: 'academia champions aguai 9313100 atividades de condicionamento fisico' },
    { cnpj: '11222333000183', razaoSocial: 'JOSE ROBERTO MARIN', phone: '1936000003', searchText: 'jose roberto marin 0322101 criacao de peixes em agua doce' },
    { cnpj: '11222333000184', razaoSocial: 'JF FOGACA DISTRIBUIDORA DE PESCADO LTDA', phone: '1936000004', searchText: 'jf fogaca distribuidora de pescado ltda 4634603 comercio atacadista de pescados' },
    { cnpj: '11222333000185', razaoSocial: 'MR DISTRIBUIDORA DE AGUA MINERAL', phone: '1936000005', searchText: 'mr distribuidora de agua mineral 4635402 comercio atacadista de agua mineral' },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: aguasDeLindoia });
  assert.deepEqual(records.map((r) => r.razaoSocial), ['MR DISTRIBUIDORA DE AGUA MINERAL']);
});

// ── LOTE 1 (17/08 — PR17082026-FAXINA-DA-BUSCA-RFB-PRIMEIRO): a porta da Receita ────────────
// A1 medido em Valinhos: o WHERE exigia 'distribuidora' E 'agua' no texto, mas o CNAE onde a
// distribuidora de água mora é 4723-7/00 "Comércio varejista de bebidas" — descrição que não
// tem nenhuma das duas palavras. O mapa curado segmento→CNAE entra como OR ADICIONAL, e o
// sinal textual das entradas amplas viaja DENTRO do SQL: o `take` corta antes do filtro fino,
// então 4723700 cru traria todo bar/adega da cidade e expulsaria as distribuidoras reais.

/** Igual ao makeMockPrisma, mas guarda o `where` de cada findMany pra o teste inspecionar. */
function makeMockPrismaCapturandoWhere(rows: any[]) {
  const wheres: any[] = [];
  const hasContact = (r: any) => Boolean(
    (r.phone && String(r.phone).trim()) || (r.email && String(r.email).trim()),
  );
  return {
    wheres,
    prisma: {
      cnpjPublicCompany: {
        findMany: async (args: any = {}) => {
          wheres.push(args?.where);
          const isFill = JSON.stringify(args?.where || {}).includes('"NOT"');
          return rows.filter((r) => (isFill ? !hasContact(r) : hasContact(r)));
        },
      },
    },
  };
}

test('LOTE 1 — WHERE ganha o OR do mapa curado, com o sinal textual DENTRO do SQL', async () => {
  const service = new CnpjPublicDatasetService();
  const captura = makeMockPrismaCapturandoWhere([]);
  await service.fetchRecords({
    prisma: captura.prisma,
    normalized: { city: 'Valinhos', state: 'SP', segment: 'distribuidoras de água' } as any,
  });
  // O where da consulta principal é { AND: [ <where do segmento>, { OR: <tem contato> } ] }.
  const ors: any[] = captura.wheres[0]?.AND?.[0]?.OR || [];
  const serializado = JSON.stringify(ors);
  assert.match(serializado, /"startsWith":"4635401"/, 'atacado de agua mineral entra no WHERE');
  assert.match(serializado, /"startsWith":"3600602"/, 'distribuicao por caminhoes entra no WHERE');
  // 4723700 e 4784900 são amplos: só entram acompanhados do sinal 'agua' no MESMO AND.
  // (o match textual do segmento também é um `AND`, por isso o filtro olha o cnae do 1º termo)
  const comSinal = ors.filter((item) => Array.isArray(item?.AND) && item.AND[0]?.cnae?.startsWith);
  const codigosComSinal = comSinal.map((item) => item.AND[0]?.cnae?.startsWith).sort();
  assert.deepEqual(codigosComSinal, ['4723700', '4784900']);
  assert.match(JSON.stringify(comSinal), /"searchText":\{"contains":"agua"\}/);
});

test('LOTE 1 — filtro fino da memoria da passe-livre a quem entrou pelo CNAE do mapa', async () => {
  const service = new CnpjPublicDatasetService();
  const valinhos = { city: 'Valinhos', state: 'SP', segment: 'distribuidoras de água' } as any;
  const prisma = makeMockPrisma([
    // Nome não diz 'distribuidora': hoje o segmentMatcher matava depois do SELECT.
    { cnpj: '11222333000343', razaoSocial: 'ACQUARELLA COMERCIO DE AGUAS LTDA', cnae: '4723700', phone: '1999990001', searchText: 'acquarella comercio de aguas ltda 4723700 comercio varejista de bebidas' },
    // Mesmo CNAE amplo, SEM sinal de água: continua fora (senão vira todo bar da cidade).
    { cnpj: '11222333000424', razaoSocial: 'ADEGA DO JOAO LTDA', cnae: '4723700', phone: '1999990002', searchText: 'adega do joao ltda 4723700 comercio varejista de bebidas' },
    // Nome MUDO + CNAE exclusivo de água: o código já É o pedido, não precisa de texto.
    { cnpj: '11222333000505', razaoSocial: 'VEGAS LTDA', cnae: '4635401', phone: '1999990003', searchText: 'vegas ltda 4635401 comercio atacadista de agua mineral' },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: valinhos });
  assert.deepEqual(
    records.map((r) => r.razaoSocial).sort(),
    ['ACQUARELLA COMERCIO DE AGUAS LTDA', 'VEGAS LTDA'],
  );
});

// ── DRENAGEM (17/08 — LOTE 2): a página tem de dizer DE QUAL FASE ela veio ──────────────────
// A fonte re-ancora o cursor quando o provider para no meio da página (meta batida). Pra
// re-ancorar ela precisa saber em que fase estava lendo — e não pode DEDUZIR isso do
// `nextCursor`, porque o nextCursor de uma página curta já vem com a fase VIRADA. Sem este
// campo, a re-âncora cairia na fase 2 e o rabo da fase 1 sumia igual ao defeito original.
test('DRENAGEM — fetchRecordsPage diz de qual fase a pagina veio (nao se deduz do nextCursor)', async () => {
  const service = new CnpjPublicDatasetService();
  const prisma = makeMockPrisma([
    { cnpj: '11222333000181', nomeFantasia: 'Pizzaria Com Fone', phone: '6292617022' },
    { cnpj: '11222333000262', nomeFantasia: 'Pizzaria Sem Fone', phone: null, email: null },
  ]);

  const primeira = await service.fetchRecordsPage({ prisma, normalized: baseNormalized });
  assert.equal(primeira.phase, 'with_contact', 'sem cursor, a leitura comeca por quem TEM contato');
  // Página curta: o nextCursor já aponta pra fase 2 — mas a página LIDA foi a 1.
  assert.deepEqual(primeira.nextCursor, { phase: 'without_contact', cnpj: null });

  const segunda = await service.fetchRecordsPage({
    prisma,
    normalized: baseNormalized,
    cursor: { phase: 'without_contact', cnpj: null },
  });
  assert.equal(segunda.phase, 'without_contact');
  assert.equal(segunda.exhausted, true, 'fase 2 curta e o fim da drenagem');
});

test('fetchRecords: codigo CNAE explicito no segmento nao passa pelo filtro textual', async () => {
  const service = new CnpjPublicDatasetService();
  const porCnae = { city: 'Águas de Lindóia', state: 'SP', segment: '4635' } as any;
  const prisma = makeMockPrisma([
    { cnpj: '11222333000186', razaoSocial: 'ATACADO SEM NOME DE AGUA', cnae: '4635402', phone: '1936000006', searchText: 'atacado sem nome de agua 4635402 comercio atacadista de agua mineral' },
  ]);
  const records = await service.fetchRecords({ prisma, normalized: porCnae });
  assert.equal(records.length, 1, 'match por prefixo de CNAE nao exige palavra do texto');
});
