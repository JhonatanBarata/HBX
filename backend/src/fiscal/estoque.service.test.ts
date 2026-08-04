// FISCAL F3 — teste do MOTOR do estoque (node --test, zero rede, prisma fake).
// A alma: saldo 100% DERIVADO da trilha (nunca coluna); 3 estados fecham a
// matemática (físico/reservado/disponível/faturado); dedup duro na entrada XML
// e na baixa por entrega; inventário lança a DIFERENÇA; gates com voz.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EstoqueService } from './estoque.service';
import { parseNfeCompra } from './nfe-compra-parser.util';
import { montarZipStore } from './zip-store.util';

// ---------------------------------------------------------------------------
// Prisma fake — trilha em memória com os uniques que importam (P2002 real).
// ---------------------------------------------------------------------------

function makePrisma(opts: { estoqueAtivo?: boolean; estoqueNegativo?: string } = {}) {
  const produtos: any[] = [];
  const movimentos: any[] = [];
  const comprasXml: any[] = [];
  let seq = 1;
  const nextId = () => `e${seq++}`;
  const matches = (row: any, where: Record<string, any>) =>
    Object.entries(where || {}).every(([k, v]) => {
      if (v && typeof v === 'object' && 'in' in v) return (v as any).in.includes(row[k]);
      if (v && typeof v === 'object' && 'not' in v) return row[k] !== (v as any).not;
      return row[k] === v;
    });

  return {
    _data: { produtos, movimentos, comprasXml },
    fiscalTenantProfile: {
      findUnique: async () => ({
        estoqueAtivo: opts.estoqueAtivo !== false,
        estoqueNegativo: opts.estoqueNegativo || 'avisar',
      }),
    },
    estoqueProduto: {
      findFirst: async ({ where }: any) => produtos.find((p) => matches(p, where)) || null,
      findMany: async ({ where }: any) => produtos.filter((p) => matches(p, where || {})),
      create: async ({ data }: any) => {
        const row = { id: nextId(), ativo: true, unidade: null, ncm: null, cest: null, cfopSaida: null, csosn: null, logisticaProductId: null, createdAt: new Date(), updatedAt: new Date(), ...data };
        produtos.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = produtos.find((p) => p.id === where.id);
        Object.assign(row, data);
        return { ...row };
      },
    },
    estoqueMovimento: {
      create: async ({ data }: any) => {
        for (const chave of [['refChaveNfe'], ['refEntregaId']] as const) {
          const campo = chave[0];
          if (data[campo] != null) {
            const dup = movimentos.find(
              (m) => m.companyId === data.companyId && m.tipo === data.tipo && m[campo] === data[campo] && m.produtoId === data.produtoId,
            );
            if (dup) {
              const err: any = new Error('unique');
              err.code = 'P2002';
              throw err;
            }
          }
        }
        const row = { id: nextId(), refDocumentoId: null, refEntregaId: null, refChaveNfe: null, refCargaDia: null, motivo: null, createdAt: new Date(), ...data };
        movimentos.push(row);
        return { ...row };
      },
      findMany: async ({ where }: any) => movimentos.filter((m) => matches(m, where || {})),
      findFirst: async ({ where }: any) => movimentos.find((m) => matches(m, where || {})) || null,
      groupBy: async ({ where }: any) => {
        const rows = movimentos.filter((m) => matches(m, where || {}));
        const grupos = new Map<string, number>();
        for (const r of rows) {
          const k = `${r.produtoId}|${r.tipo}`;
          grupos.set(k, (grupos.get(k) ?? 0) + r.quantidade);
        }
        return Array.from(grupos.entries()).map(([k, soma]) => {
          const [produtoId, tipo] = k.split('|');
          return { produtoId, tipo, _sum: { quantidade: soma } };
        });
      },
      aggregate: async ({ where }: any) => {
        const rows = movimentos.filter((m) => {
          if (!matches(m, { companyId: where.companyId, produtoId: where.produtoId, tipo: where.tipo })) return false;
          if (where.createdAt) {
            const t = new Date(m.createdAt).getTime();
            if (where.createdAt.gte && t < new Date(where.createdAt.gte).getTime()) return false;
            if (where.createdAt.lte && t > new Date(where.createdAt.lte).getTime()) return false;
          }
          return true;
        });
        return { _sum: { quantidade: rows.reduce((s, r) => s + r.quantidade, 0) } };
      },
    },
    fiscalCompraXml: {
      upsert: async ({ where, create }: any) => {
        const found = comprasXml.find(
          (c) => c.companyId === where.companyId_chaveAcesso.companyId && c.chaveAcesso === where.companyId_chaveAcesso.chaveAcesso,
        );
        if (found) return { ...found };
        const row = { id: nextId(), createdAt: new Date(), ...create };
        comprasXml.push(row);
        return { ...row };
      },
      findMany: async ({ where }: any) => comprasXml.filter((c) => matches(c, where || {})),
    },
    product: {
      findFirst: async ({ where }: any) => (where.id === 77 && where.companyId === 7 ? { id: 77 } : null),
      findMany: async () => [{ id: 77, name: 'Galão 20L', unidade: 'galão' }],
    },
    entrega: {
      findFirst: async ({ where }: any) =>
        where.id === 'ent1' && where.companyId === 7
          ? { id: 'ent1', productId: 77, quantidade: 2, itens: [] }
          : null,
    },
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
  };
}

const XML_COMPRA = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${'1'.repeat(44)}"><emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedora ABC</xNome></emit><det nItem="1"><prod><cProd>P1</cProd><xProd>Galao 20L retornavel</xProd><NCM>22011000</NCM><uCom>UN</uCom><qCom>100.0000</qCom><vUnCom>8.5000</vUnCom></prod></det><det nItem="2"><prod><cProd>P2</cProd><xProd>Tampa lacre</xProd><NCM>39235000</NCM><uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>30.0000</vUnCom></prod></det></infNFe></NFe></nfeProc>`;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

test('parser da NF-e de compra: chave, emitente e itens; arquivo torto explica', () => {
  const parsed = parseNfeCompra(XML_COMPRA);
  assert.equal(parsed.chaveAcesso, '1'.repeat(44));
  assert.equal(parsed.emitenteNome, 'Fornecedora ABC');
  assert.equal(parsed.itens.length, 2);
  assert.equal(parsed.itens[0].quantidade, 100);
  assert.equal(parsed.itens[0].valorUnit, 8.5);
  assert.throws(() => parseNfeCompra('<html>não é nota</html>'), /não parece ser um XML de NF-e/);
});

// ---------------------------------------------------------------------------
// Saldos derivados — a matemática dos 3 estados
// ---------------------------------------------------------------------------

test('saldo deriva da trilha: entrada, reserva, baixa e liberação fecham os 3 estados', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão 20L', logisticaProductId: 77 });

  await svc.entradaManual(7, { produtoId: p.id, quantidade: 100 });
  let saldo = (await svc.saldos(7)).get(p.id)!;
  assert.deepEqual(saldo, { fisico: 100, reservado: 0, disponivel: 100, faturado: 0 });

  // Carga do caminhão reserva 10.
  await svc.reservarCargaDia(7, '2026-08-05', [{ logisticaProductId: 77, quantidade: 10 }]);
  saldo = (await svc.saldos(7)).get(p.id)!;
  assert.deepEqual(saldo, { fisico: 100, reservado: 10, disponivel: 90, faturado: 0 });

  // Entrega confirmada baixa 2 (consome a reserva; físico cai).
  const baixa = await svc.baixaPorEntrega(7, 'ent1');
  assert.equal(baixa.baixados, 1);
  saldo = (await svc.saldos(7)).get(p.id)!;
  assert.deepEqual(saldo, { fisico: 98, reservado: 8, disponivel: 90, faturado: 2 });

  // Fim do dia: conferência libera o que sobrou reservado (8) — sem fantasma.
  await svc.liberarCargaDia(7, '2026-08-05', '2026-08-05');
  saldo = (await svc.saldos(7)).get(p.id)!;
  assert.deepEqual(saldo, { fisico: 98, reservado: 0, disponivel: 98, faturado: 2 });
});

test('baixa por entrega é dedup por entrega+produto (reconfirmar não baixa 2×); estoque OFF = no-op', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão', logisticaProductId: 77 });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 5 });

  assert.equal((await svc.baixaPorEntrega(7, 'ent1')).baixados, 1);
  assert.equal((await svc.baixaPorEntrega(7, 'ent1')).baixados, 0, 'reconfirmação não duplica');
  assert.equal((await svc.saldos(7)).get(p.id)!.fisico, 3);

  const prismaOff = makePrisma({ estoqueAtivo: false });
  const svcOff = new EstoqueService(prismaOff as any);
  assert.deepEqual(await svcOff.baixaPorEntrega(7, 'ent1'), { baixados: 0, avisos: [] });
  assert.equal(prismaOff._data.movimentos.length, 0);
});

test('baixa que deixa negativo AVISA (rua nunca trava)', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão', logisticaProductId: 77 });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 1 });
  const r = await svc.baixaPorEntrega(7, 'ent1'); // baixa 2 com físico 1
  assert.equal(r.baixados, 1);
  assert.match(String(r.avisos[0] || ''), /NEGATIVO/i);
});

// ---------------------------------------------------------------------------
// Inventário, perda, ajuste — rastro obrigatório
// ---------------------------------------------------------------------------

test('inventário lança a DIFERENÇA da contagem; contagem batida não lança nada', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão' });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 50 });

  const r1 = await svc.inventario(7, { produtoId: p.id, contagem: 47 });
  assert.equal(r1.lancado, true);
  assert.equal(r1.diferenca, -3);
  assert.equal((await svc.saldos(7)).get(p.id)!.fisico, 47);

  const r2 = await svc.inventario(7, { produtoId: p.id, contagem: 47 });
  assert.equal(r2.lancado, false);
});

test('perda e ajuste EXIGEM motivo; quantidade negativa fora deles é recusada', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão' });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 10 });

  await assert.rejects(() => svc.perda(7, { produtoId: p.id, quantidade: 2, motivo: '' }), /Motivo/i);
  await svc.perda(7, { produtoId: p.id, quantidade: 2, motivo: 'Garrafão estourou na descarga' });
  assert.equal((await svc.saldos(7)).get(p.id)!.fisico, 8);

  await assert.rejects(() => svc.entradaManual(7, { produtoId: p.id, quantidade: -5 }), /positiva/i);
  await svc.ajuste(7, { produtoId: p.id, quantidade: -1, motivo: 'Acerto de contagem antiga' });
  assert.equal((await svc.saldos(7)).get(p.id)!.fisico, 7);
});

// ---------------------------------------------------------------------------
// Entrada por XML — conferência + dedup + malote guardado
// ---------------------------------------------------------------------------

test('entrada XML: preview sugere por NCM/nome; confirmar lança, guarda o XML e NÃO duplica', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const galao = await svc.criarProduto(7, { nome: 'Galão 20L', ncm: '22011000' });

  const preview = await svc.previewEntradaXml(7, XML_COMPRA);
  assert.equal(preview.jaLancada, false);
  assert.equal(preview.itens[0].sugestaoProdutoId, galao.id, 'NCM igual sugere o produto');

  const r = await svc.confirmarEntradaXml(7, XML_COMPRA, [
    { cProd: 'P1', produtoId: galao.id },
    { cProd: 'P2', novoProduto: { nome: 'Tampa lacre', unidade: 'CX' } },
  ]);
  assert.equal(r.lancados, 2);
  assert.equal(prisma._data.comprasXml.length, 1, 'XML da compra fica GUARDADO (malote)');

  const r2 = await svc.confirmarEntradaXml(7, XML_COMPRA, [{ cProd: 'P1', produtoId: galao.id }, { cProd: 'P2', ignorar: true }]);
  assert.equal(r2.lancados, 0);
  assert.equal(r2.duplicados, 1, 'mesma chave+produto não entra 2×');

  assert.equal((await svc.saldos(7)).get(galao.id)!.fisico, 100);
});

test('item sem destino no confirmar explica em vez de engolir', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  await assert.rejects(
    () => svc.confirmarEntradaXml(7, XML_COMPRA, [{ cProd: 'P1' }]),
    /sem destino/i,
  );
});

// ---------------------------------------------------------------------------
// Gate de emissão (negativo avisar × travar) + zip do malote
// ---------------------------------------------------------------------------

test("verificarDisponibilidade: 'avisar' deixa passar com aviso; 'travar' recusa", async () => {
  const prismaAvisa = makePrisma();
  const svcAvisa = new EstoqueService(prismaAvisa as any);
  const p = await svcAvisa.criarProduto(7, { nome: 'Galão' });
  await svcAvisa.entradaManual(7, { produtoId: p.id, quantidade: 1 });
  const r = await svcAvisa.verificarDisponibilidade(7, p.id, 5);
  assert.equal(r.ok, true);
  assert.match(String(r.aviso), /insuficiente/i);

  const prismaTrava = makePrisma({ estoqueNegativo: 'travar' });
  const svcTrava = new EstoqueService(prismaTrava as any);
  const p2 = await svcTrava.criarProduto(7, { nome: 'Galão' });
  await assert.rejects(() => svcTrava.verificarDisponibilidade(7, p2.id, 5), /TRAVAR/i);
});

test('zip do malote é PKZIP válido (assinaturas + EOCD)', () => {
  const zip = montarZipStore([
    { nome: 'vendas.csv', conteudo: 'a;b\r\n1;2' },
    { nome: 'vendas/nfse-1-1.xml', conteudo: '<xml/>' },
  ]);
  assert.equal(zip.readUInt32LE(0), 0x04034b50, 'local header');
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50, 'EOCD');
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 2, '2 entradas no diretório central');
});
