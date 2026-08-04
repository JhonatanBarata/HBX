// FISCAL F3 — teste do MOTOR do estoque (node --test, zero rede, prisma fake).
// A alma: saldo 100% DERIVADO da trilha; reservado fecha POR REF de carga
// (gavetas — revisão adversarial A2); entrada por XML agrega itens do mesmo
// produto (A1); dedup duro com P2002 REAL no fake; correção de entrega vira
// AJUSTE com rastro (M3); redeclaração reconcilia pro alvo (M6, idempotente);
// re-lançamento de chave exige gesto explícito (M7).
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { EstoqueService } from './estoque.service';
import { parseNfeCompra } from './nfe-compra-parser.util';
import { montarZipStore } from './zip-store.util';

// ---------------------------------------------------------------------------
// Prisma fake — trilha em memória com os uniques que importam (P2002 real).
// ---------------------------------------------------------------------------

function makePrisma(opts: {
  estoqueAtivo?: boolean;
  estoqueNegativo?: string;
  cargaAberta?: { dataISO: string; entregadorId: number | null } | null;
} = {}) {
  const produtos: any[] = [];
  const movimentos: any[] = [];
  const comprasXml: any[] = [];
  const estado = {
    cargaAberta: opts.cargaAberta === undefined ? null : opts.cargaAberta,
    entregaQtd: 2,
  };
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
    _estado: estado,
    fiscalTenantProfile: {
      findUnique: async () => ({
        estoqueAtivo: opts.estoqueAtivo !== false,
        estoqueNegativo: opts.estoqueNegativo || 'avisar',
      }),
    },
    logisticaCargaDia: {
      findFirst: async () => (estado.cargaAberta ? { ...estado.cargaAberta } : null),
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
        for (const campo of ['refChaveNfe', 'refEntregaId'] as const) {
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
        const grupos = new Map<string, { produtoId: string; tipo: string; refCargaDia: string | null; soma: number }>();
        for (const r of rows) {
          const k = `${r.produtoId}|${r.tipo}|${r.refCargaDia ?? ''}`;
          const g = grupos.get(k) || { produtoId: r.produtoId, tipo: r.tipo, refCargaDia: r.refCargaDia ?? null, soma: 0 };
          g.soma += r.quantidade;
          grupos.set(k, g);
        }
        return Array.from(grupos.values()).map((g) => ({
          produtoId: g.produtoId,
          tipo: g.tipo,
          refCargaDia: g.refCargaDia,
          _sum: { quantidade: g.soma },
        }));
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
          ? { id: 'ent1', productId: 77, quantidade: estado.entregaQtd, itens: [] }
          : null,
    },
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
  };
}

const XML_COMPRA = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${'1'.repeat(44)}"><emit><CNPJ>11222333000181</CNPJ><xNome>Fornecedora ABC</xNome></emit><det nItem="1"><prod><cProd>P1</cProd><xProd>Galao 20L retornavel</xProd><NCM>22011000</NCM><uCom>UN</uCom><qCom>100.0000</qCom><vUnCom>8.5000</vUnCom></prod></det><det nItem="2"><prod><cProd>P2</cProd><xProd>Tampa lacre</xProd><NCM>39235000</NCM><uCom>CX</uCom><qCom>2.0000</qCom><vUnCom>30.0000</vUnCom></prod></det></infNFe></NFe></nfeProc>`;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

test('parser: chave, emitente e itens; aspas simples/namespace/entidade tratados; lote e arquivo torto explicam', () => {
  const parsed = parseNfeCompra(XML_COMPRA);
  assert.equal(parsed.chaveAcesso, '1'.repeat(44));
  assert.equal(parsed.itens.length, 2);
  assert.equal(parsed.itens[0].quantidade, 100);

  // Fora do canônico (lacuna do verificador): aspas simples + prefixo de namespace + entidade.
  const xmlTorto = `<nfe:nfeProc xmlns:nfe="x"><nfe:NFe><nfe:infNFe Id='NFe${'2'.repeat(44)}'><nfe:emit><nfe:xNome>AGUA &amp; CIA</nfe:xNome></nfe:emit><nfe:det><nfe:prod><nfe:cProd>A</nfe:cProd><nfe:xProd>Galao</nfe:xProd><nfe:qCom>5</nfe:qCom></nfe:prod></nfe:det></nfe:infNFe></nfe:NFe></nfe:nfeProc>`;
  const torto = parseNfeCompra(xmlTorto);
  assert.equal(torto.chaveAcesso, '2'.repeat(44));
  assert.equal(torto.emitenteNome, 'AGUA & CIA');
  assert.equal(torto.itens[0].quantidade, 5);

  assert.throws(() => parseNfeCompra('<html>não é nota</html>'), /não parece ser um XML de NF-e/);
  const lote = XML_COMPRA.replace('</nfeProc>', '') + `<NFe><infNFe Id="NFe${'3'.repeat(44)}"></infNFe></NFe></nfeProc>`;
  assert.throws(() => parseNfeCompra(lote), /lote/i);
});

// ---------------------------------------------------------------------------
// Saldos — as gavetas por ref (A2)
// ---------------------------------------------------------------------------

test('cena completa: entrada → reserva → baixa carimbada na carga → liberação fecham os 3 estados', async () => {
  const prisma = makePrisma({ cargaAberta: { dataISO: '2026-08-05', entregadorId: null } });
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão 20L', logisticaProductId: 77 });

  await svc.entradaManual(7, { produtoId: p.id, quantidade: 100 });
  assert.deepEqual((await svc.saldos(7)).get(p.id), { fisico: 100, reservado: 0, disponivel: 100, faturado: 0 });

  await svc.reservarCargaDia(7, '2026-08-05', [{ logisticaProductId: 77, quantidade: 10 }]);
  assert.deepEqual((await svc.saldos(7)).get(p.id), { fisico: 100, reservado: 10, disponivel: 90, faturado: 0 });

  const baixa = await svc.baixaPorEntrega(7, 'ent1'); // 2, carimbada na ref da carga aberta
  assert.equal(baixa.baixados, 1);
  assert.deepEqual((await svc.saldos(7)).get(p.id), { fisico: 98, reservado: 8, disponivel: 90, faturado: 2 });

  await svc.liberarCargaDia(7, '2026-08-05');
  assert.deepEqual((await svc.saldos(7)).get(p.id), { fisico: 98, reservado: 0, disponivel: 98, faturado: 2 });
});

test('A2: baixa SEM carga aberta mexe só no físico — não corrói a reserva de carga nenhuma', async () => {
  const prisma = makePrisma({ cargaAberta: null });
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão', logisticaProductId: 77 });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 100 });
  await svc.reservarCargaDia(7, '2026-08-05', [{ logisticaProductId: 77, quantidade: 10 }]);

  await svc.baixaPorEntrega(7, 'ent1'); // avulsa, sem ref
  assert.deepEqual((await svc.saldos(7)).get(p.id), { fisico: 98, reservado: 10, disponivel: 88, faturado: 2 });

  // Fecha a gaveta: baixa sem ref NÃO desconta da carga — libera os 10 inteiros.
  await svc.liberarCargaDia(7, '2026-08-05');
  assert.deepEqual((await svc.saldos(7)).get(p.id), { fisico: 98, reservado: 0, disponivel: 98, faturado: 2 });
});

test('A2: duas cargas (refs distintas) fecham cada uma a SUA gaveta, sem dupla subtração', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão', logisticaProductId: 77 });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 100 });

  await svc.reservarCargaDia(7, '2026-08-05:1', [{ logisticaProductId: 77, quantidade: 10 }]);
  await svc.reservarCargaDia(7, '2026-08-05:2', [{ logisticaProductId: 77, quantidade: 7 }]);
  assert.equal((await svc.saldos(7)).get(p.id)!.reservado, 17);

  await svc.liberarCargaDia(7, '2026-08-05:1');
  assert.equal((await svc.saldos(7)).get(p.id)!.reservado, 7, 'só a gaveta 1 fechou');
  await svc.liberarCargaDia(7, '2026-08-05:2');
  assert.equal((await svc.saldos(7)).get(p.id)!.reservado, 0);
});

// ---------------------------------------------------------------------------
// Baixa por entrega — dedup, correção (M3), negativo avisa
// ---------------------------------------------------------------------------

test('reconfirmação idêntica não duplica; com quantidade CORRIGIDA lança AJUSTE com rastro (M3)', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão', logisticaProductId: 77 });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 10 });

  assert.equal((await svc.baixaPorEntrega(7, 'ent1')).baixados, 1); // baixa 2
  assert.equal((await svc.baixaPorEntrega(7, 'ent1')).baixados, 0, 'idêntica não duplica');
  assert.equal((await svc.saldos(7)).get(p.id)!.fisico, 8);

  prisma._estado.entregaQtd = 3; // reabriu, corrigiu 2→3, reconfirmou
  const r = await svc.baixaPorEntrega(7, 'ent1');
  assert.equal(r.baixados, 1, 'correção gera movimento compensatório');
  assert.equal((await svc.saldos(7)).get(p.id)!.fisico, 7, 'físico reflete os 3 entregues');
  const ajuste = prisma._data.movimentos.find((m: any) => m.tipo === 'AJUSTE');
  assert.match(String(ajuste?.motivo), /Correção da entrega ent1/);

  const prismaOff = makePrisma({ estoqueAtivo: false });
  const svcOff = new EstoqueService(prismaOff as any);
  assert.deepEqual(await svcOff.baixaPorEntrega(7, 'ent1'), { baixados: 0, avisos: [] });
});

test('baixa que deixa negativo AVISA (rua nunca trava)', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão', logisticaProductId: 77 });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 1 });
  const r = await svc.baixaPorEntrega(7, 'ent1');
  assert.equal(r.baixados, 1);
  assert.match(String(r.avisos[0] || ''), /NEGATIVO/i);
});

// ---------------------------------------------------------------------------
// Redeclaração da carga (M6) — reconcilia pro alvo, idempotente
// ---------------------------------------------------------------------------

test('M6: redeclarar reconcilia pro alvo (produto removido é liberado); repetir a mesma lista é no-op', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const p = await svc.criarProduto(7, { nome: 'Galão', logisticaProductId: 77 });
  await svc.entradaManual(7, { produtoId: p.id, quantidade: 100 });

  await svc.reservarCargaDia(7, '2026-08-05', [{ logisticaProductId: 77, quantidade: 10 }]);
  assert.equal((await svc.saldos(7)).get(p.id)!.reservado, 10);

  // Redeclara com quantidade menor → delta libera 4.
  await svc.reservarCargaDia(7, '2026-08-05', [{ logisticaProductId: 77, quantidade: 6 }]);
  assert.equal((await svc.saldos(7)).get(p.id)!.reservado, 6);

  // Mesma lista de novo (duplo clique) → delta zero, nada lançado.
  const antes = prisma._data.movimentos.length;
  await svc.reservarCargaDia(7, '2026-08-05', [{ logisticaProductId: 77, quantidade: 6 }]);
  assert.equal(prisma._data.movimentos.length, antes, 'idempotente');

  // Produto REMOVIDO da redeclaração → reserva liberada (lista vazia).
  await svc.reservarCargaDia(7, '2026-08-05', []);
  assert.equal((await svc.saldos(7)).get(p.id)!.reservado, 0);
});

// ---------------------------------------------------------------------------
// Inventário, perda, ajuste
// ---------------------------------------------------------------------------

test('inventário lança a DIFERENÇA (com arredondamento B4); contagem batida não lança', async () => {
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

  // B4: resíduo binário de Float não vira movimento de lixo.
  await svc.ajuste(7, { produtoId: p.id, quantidade: 0.1, motivo: 'fração' });
  await svc.ajuste(7, { produtoId: p.id, quantidade: 0.2, motivo: 'fração' });
  const r3 = await svc.inventario(7, { produtoId: p.id, contagem: 47.3 });
  assert.equal(r3.lancado, false, '0.1+0.2 não pode virar diferença fantasma');
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
});

// ---------------------------------------------------------------------------
// Entrada por XML — A1 (agrega), M7 (gesto explícito), malote guardado
// ---------------------------------------------------------------------------

test('A1: dois itens do XML no MESMO produto SOMAM (nada some como "duplicado")', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const galao = await svc.criarProduto(7, { nome: 'Galão 20L' });
  const r = await svc.confirmarEntradaXml(7, XML_COMPRA, [
    { cProd: 'P1', produtoId: galao.id },
    { cProd: 'P2', produtoId: galao.id }, // lote B do mesmo produto
  ]);
  assert.equal(r.lancados, 1, 'um movimento agregado');
  assert.equal(r.duplicados, 0, 'NADA cai como duplicado');
  assert.equal((await svc.saldos(7)).get(galao.id)!.fisico, 102, '100 + 2 somados');
});

test('preview sugere por NCM; confirmar lança, guarda o XML; re-lançar exige gesto explícito (M7)', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  const galao = await svc.criarProduto(7, { nome: 'Galão 20L', ncm: '22011000' });

  const preview = await svc.previewEntradaXml(7, XML_COMPRA);
  assert.equal(preview.jaLancada, false);
  assert.equal(preview.itens[0].sugestaoProdutoId, galao.id);

  const r = await svc.confirmarEntradaXml(7, XML_COMPRA, [
    { cProd: 'P1', produtoId: galao.id },
    { cProd: 'P2', novoProduto: { nome: 'Tampa lacre', unidade: 'CX' } },
  ]);
  assert.equal(r.lancados, 2);
  assert.equal(prisma._data.comprasXml.length, 1, 'XML da compra GUARDADO (malote)');

  // Sem o gesto explícito, chave já lançada é RECUSADA (não silenciada).
  await assert.rejects(
    () => svc.confirmarEntradaXml(7, XML_COMPRA, [{ cProd: 'P1', produtoId: galao.id }, { cProd: 'P2', ignorar: true }]),
    /já teve entrada lançada/i,
  );
  // Com o gesto, o UNIQUE segura o produto repetido como duplicado.
  const r2 = await svc.confirmarEntradaXml(
    7,
    XML_COMPRA,
    [{ cProd: 'P1', produtoId: galao.id }, { cProd: 'P2', ignorar: true }],
    { permitirRelancamento: true },
  );
  assert.equal(r2.lancados, 0);
  assert.equal(r2.duplicados, 1);
  assert.equal((await svc.saldos(7)).get(galao.id)!.fisico, 100);
});

test('item sem destino no confirmar explica em vez de engolir', async () => {
  const prisma = makePrisma();
  const svc = new EstoqueService(prisma as any);
  await assert.rejects(() => svc.confirmarEntradaXml(7, XML_COMPRA, [{ cProd: 'P1' }]), /sem destino/i);
});

// ---------------------------------------------------------------------------
// Gate de emissão + zip do malote
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
