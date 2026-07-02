import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import { WebscrapingService } from './webscraping.service';

/**
 * OWNERV2 (02/07) — streamAllDatabaseCardsCsv: stream do banco inteiro (RadarLeadPool) em csv.gz
 * com memória constante (keyset por id, gzip com backpressure). Aqui a gente prova:
 *  - o CSV descompactado tem BOM + cabeçalho + 1 linha por lead;
 *  - a paginação por keyset varre TODAS as páginas (não para na 1ª);
 *  - o escape de ";" e aspas não quebra a linha;
 *  - os headers de download (gzip + attachment) são setados.
 */

// Response fake compatível com o que o método usa: setHeader + é um Writable (o gzip.pipe(res)).
function createFakeResponse() {
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  const headers: Record<string, string> = {};
  const res: any = sink;
  res.headersSent = false;
  res.setHeader = (k: string, v: string) => { headers[k.toLowerCase()] = v; };
  res.__headers = headers;
  // gzip.pipe(res) chama res.end() no fim → o Writable emite 'finish'. Só aí os bytes estão todos.
  res.__done = new Promise<void>((resolve) => sink.on('finish', () => resolve()));
  res.__collect = () => Buffer.concat(chunks);
  return res;
}

// Prisma fake com keyset por id: findMany({ where:{id:{gt}}, take }) fatia o dataset em ordem.
function createPrismaWithRows(rows: Array<Record<string, any>>) {
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    radarLeadPool: {
      findMany: async ({ where, take }: any) => {
        const after = where?.id?.gt;
        let start = 0;
        if (after != null) {
          const idx = sorted.findIndex((r) => String(r.id) === String(after));
          start = idx >= 0 ? idx + 1 : 0;
        }
        return sorted.slice(start, start + take);
      },
    },
  };
}

function buildService(prisma: any): WebscrapingService {
  const svc = Object.create(WebscrapingService.prototype) as WebscrapingService;
  (svc as any).internalPrisma = prisma;
  return svc;
}

test('export-all: gzip descompacta em CSV com cabeçalho + todas as linhas (keyset varre tudo)', async () => {
  // 2.500 linhas força >2 páginas (PAGE=1000) — prova que a paginação não para cedo.
  const rows = Array.from({ length: 2500 }, (_, i) => ({
    id: `id${String(i).padStart(5, '0')}`,
    name: i === 0 ? 'Bar; do "Zé"' : `Lead ${i}`, // vírgula-e-ponto + aspas na 1ª linha
    phone: `1199999${String(i).padStart(4, '0')}`,
    city: 'Fortaleza',
    state: 'CE',
    opportunityScore: i % 100,
    reviews: 0,
    firstSeenAt: new Date('2026-07-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-07-02T00:00:00.000Z'),
  }));

  const svc = buildService(createPrismaWithRows(rows));
  const res = createFakeResponse();

  await svc.streamAllDatabaseCardsCsv(res as any);
  await res.__done;

  // headers de download
  assert.equal(res.__headers['content-type'], 'application/gzip');
  assert.match(res.__headers['content-disposition'], /attachment; filename="hbx-leads-\d{4}-\d{2}-\d{2}\.csv\.gz"/);

  const gz = res.__collect();
  assert.ok(gz.length > 0, 'stream gzip veio vazio');
  const csv = gunzipSync(gz).toString('utf8');

  // BOM + cabeçalho
  assert.ok(csv.startsWith('﻿'), 'faltou BOM UTF-8');
  const lines = csv.replace(/^﻿/, '').split('\r\n').filter((l) => l.length > 0);
  const header = lines[0].split(';');
  assert.ok(header.includes('id') && header.includes('name') && header.includes('phone'), 'cabeçalho incompleto');

  // 1 cabeçalho + 2.500 linhas de dados
  assert.equal(lines.length, 2501, `esperado 2501 linhas, veio ${lines.length}`);

  // escape: "Bar; do "Zé"" vira "Bar; do ""Zé""" entre aspas — não quebra em 2 colunas
  const first = lines[1];
  assert.ok(first.includes('"Bar; do ""Zé"""'), `escape do CSV falhou: ${first.slice(0, 60)}`);

  // última linha (id24999... na verdade id02499) presente — keyset chegou ao fim
  assert.ok(csv.includes('Lead 2499'), 'última página não foi varrida (keyset parou cedo)');
});

test('export-all: banco vazio ainda produz gzip válido só com cabeçalho', async () => {
  const svc = buildService(createPrismaWithRows([]));
  const res = createFakeResponse();
  await svc.streamAllDatabaseCardsCsv(res as any);
  await res.__done;
  const csv = gunzipSync(res.__collect()).toString('utf8').replace(/^﻿/, '');
  const lines = csv.split('\r\n').filter((l) => l.length > 0);
  assert.equal(lines.length, 1, 'vazio deveria ter só o cabeçalho');
  assert.ok(lines[0].startsWith('id;name;'), 'cabeçalho errado no dump vazio');
});
