// B1 BALCÃO — testes da venda de balcão (node --test, zero rede).
// Cobre: venda feliz com baixa SAIDA_EMISSAO e preço RESOLVIDO NO SERVIDOR,
// agregação de item repetido (lição A1), fallback de preço da logística,
// produto sem preço, travar×avisar do estoque negativo, FIADO (cliente
// obrigatório + charge ONCE/MANUAL + teto limiteFiado), idempotência do clique,
// cancelamento com rito (REVERSA + charge cancelada + trilha) e multi-tenant.
// Também: parser lê cEAN ("SEM GTIN" = null) e preview do XML casa por GTIN.
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BalcaoService } from './balcao.service';
import { EstoqueService } from './estoque.service';
import { parseNfeCompra } from './nfe-compra-parser.util';

// ---------------------------------------------------------------------------
// Fake prisma — arrays em memória com os UNIQUEs que importam (dedup honesto).
// ---------------------------------------------------------------------------

function makePrisma(opts: {
  estoqueAtivo?: boolean;
  estoqueNegativo?: 'avisar' | 'travar';
  produtos?: any[];
  products?: any[]; // logística
  movimentos?: any[];
  clientes?: any[];
  chargesPendentes?: any[];
} = {}) {
  let seq = 1;
  const nextId = (p: string) => `${p}${seq++}`;
  const perfil = {
    companyId: 7,
    estoqueAtivo: opts.estoqueAtivo !== false,
    estoqueNegativo: opts.estoqueNegativo || 'avisar',
    modoEmissaoProduto: 'fechamento',
    razaoSocial: 'AGUA BOA LTDA',
    cnpj: '11222333000181',
    municipioIbge: null,
  };
  const produtos = opts.produtos || [];
  const products = opts.products || [];
  const movimentos: any[] = opts.movimentos || [];
  const vendas: any[] = [];
  const vendaItens: any[] = [];
  const charges: any[] = [...(opts.chargesPendentes || [])];
  const clientes = opts.clientes || [];
  const trilhaRegistros: any[] = [];

  const self: any = {
    _data: { movimentos, vendas, vendaItens, charges, trilhaRegistros },
    fiscalTenantProfile: {
      findUnique: async ({ where }: any) => (where.companyId === 7 ? { ...perfil } : null),
    },
    fiscalMunicipio: { findUnique: async () => null },
    estoqueProduto: {
      findMany: async ({ where }: any) =>
        produtos.filter((p) => p.companyId === where.companyId && (where.ativo === undefined || p.ativo === where.ativo) && (!where.id || where.id.in.includes(p.id))),
    },
    product: {
      findMany: async ({ where }: any) => products.filter((p) => p.companyId === where.companyId && where.id.in.includes(p.id)),
    },
    estoqueMovimento: {
      create: async ({ data }: any) => {
        if (data.refVendaId != null) {
          const dup = movimentos.some(
            (m) => m.companyId === data.companyId && m.tipo === data.tipo && m.refVendaId === data.refVendaId && m.produtoId === data.produtoId,
          );
          if (dup) {
            const err: any = new Error('unique');
            err.code = 'P2002';
            throw err;
          }
        }
        const row = { id: nextId('mov'), createdAt: new Date(), refCargaDia: null, ...data };
        movimentos.push(row);
        return { ...row };
      },
      findFirst: async ({ where }: any) =>
        movimentos.find((m) => m.companyId === where.companyId && m.tipo === where.tipo && m.refChaveNfe === where.refChaveNfe) || null,
      groupBy: async ({ where }: any) => {
        const grupos = new Map<string, any>();
        for (const m of movimentos.filter((m) => m.companyId === where.companyId)) {
          const key = `${m.produtoId}|${m.tipo}|${m.refCargaDia ?? ''}`;
          const g = grupos.get(key) || { produtoId: m.produtoId, tipo: m.tipo, refCargaDia: m.refCargaDia ?? null, _sum: { quantidade: 0 } };
          g._sum.quantidade += Number(m.quantidade) || 0;
          grupos.set(key, g);
        }
        return [...grupos.values()];
      },
    },
    balcaoVenda: {
      create: async ({ data }: any) => {
        if (data.idempotencyKey) {
          const dup = vendas.some((v) => v.companyId === data.companyId && v.idempotencyKey === data.idempotencyKey);
          if (dup) {
            const err: any = new Error('unique');
            err.code = 'P2002';
            throw err;
          }
        }
        const row = { id: nextId('venda'), status: 'CONCLUIDA', createdAt: new Date(), financeChargeId: null, canceladaEm: null, motivoCancelamento: null, ...data };
        vendas.push(row);
        return { ...row };
      },
      findFirst: async ({ where }: any) => {
        const v = vendas.find((v) => v.companyId === where.companyId && (!where.id || v.id === where.id) && (!where.idempotencyKey || v.idempotencyKey === where.idempotencyKey));
        return v ? { ...v, itens: vendaItens.filter((i) => i.vendaId === v.id) } : null;
      },
      findUnique: async ({ where }: any) => {
        const v = vendas.find((v) => v.id === where.id);
        return v ? { ...v, itens: vendaItens.filter((i) => i.vendaId === v.id) } : null;
      },
      findMany: async ({ where, take }: any) =>
        vendas.filter((v) => v.companyId === where.companyId).slice(0, take).map((v) => ({ ...v, itens: vendaItens.filter((i) => i.vendaId === v.id) })),
      update: async ({ where, data }: any) => {
        const v = vendas.find((v) => v.id === where.id);
        Object.assign(v, data);
        return { ...v, itens: vendaItens.filter((i) => i.vendaId === v.id) };
      },
      updateMany: async ({ where, data }: any) => {
        const alvo = vendas.filter((v) => v.id === where.id && v.companyId === where.companyId && v.status === where.status);
        for (const v of alvo) Object.assign(v, data);
        return { count: alvo.length };
      },
      aggregate: async ({ where }: any) => {
        const rows = vendas.filter((v) => v.companyId === where.companyId && v.status === where.status && new Date(v.createdAt) >= where.createdAt.gte);
        return { _sum: { totalCents: rows.reduce((s, v) => s + v.totalCents, 0) }, _count: { _all: rows.length } };
      },
    },
    balcaoVendaItem: {
      createMany: async ({ data }: any) => {
        for (const d of data) vendaItens.push({ id: nextId('item'), ...d });
        return { count: data.length };
      },
    },
    financeiroCharge: {
      create: async ({ data }: any) => {
        const row = { id: nextId('charge'), paidAt: null, ...data };
        charges.push(row);
        return { ...row };
      },
      findFirst: async ({ where }: any) => charges.find((c) => c.id === where.id && c.companyId === where.companyId) || null,
      update: async ({ where, data }: any) => {
        const c = charges.find((c) => c.id === where.id);
        Object.assign(c, data);
        return { ...c };
      },
      aggregate: async ({ where }: any) => {
        const rows = charges.filter((c) => c.companyId === where.companyId && c.customerProfileId === where.customerProfileId && c.status === where.status);
        return { _sum: { amount: rows.reduce((s, c) => s + (Number(c.amount) || 0), 0) } };
      },
    },
    customerProfile: {
      findFirst: async ({ where }: any) => clientes.find((c) => c.id === where.id && c.companyId === where.companyId) || null,
      findMany: async ({ where }: any) => clientes.filter((c) => c.companyId === where.companyId),
    },
    $transaction: async (cb: any) => cb(self),
  };
  return self;
}

function makeService(prisma: any, trilha?: any) {
  const estoque = new EstoqueService(prisma);
  return new BalcaoService(prisma, estoque, trilha);
}

const GALAO = { id: 'p1', companyId: 7, nome: 'Galão 20L', unidade: 'galão', ativo: true, gtin: '7891234567895', precoBalcaoCents: 1500, logisticaProductId: null };
const AGUA_500 = { id: 'p2', companyId: 7, nome: 'Água 500ml', unidade: 'un', ativo: true, gtin: null, precoBalcaoCents: null, logisticaProductId: 44 };

function comEstoque(produtoId: string, qtd: number) {
  return { id: `seed-${produtoId}`, companyId: 7, produtoId, tipo: 'ENTRADA_MANUAL', quantidade: qtd, refCargaDia: null };
}

// ---------------------------------------------------------------------------
// VENDA
// ---------------------------------------------------------------------------

test('venda feliz: preço do servidor, baixa SAIDA_EMISSAO por produto e item repetido AGREGA', async () => {
  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 10)] });
  const service = makeService(prisma);
  const r = await service.criarVenda(7, 42, {
    itens: [{ produtoId: 'p1', quantidade: 2 }, { produtoId: 'p1', quantidade: 1 }],
    pagamento: 'DINHEIRO',
  });
  assert.equal(r.venda.status, 'CONCLUIDA');
  assert.equal(r.venda.totalCents, 4500); // 3 × R$15 — preço do SERVIDOR
  assert.equal(r.venda.itens.length, 1); // agregado
  assert.equal(r.venda.itens[0].quantidade, 3);
  assert.equal(r.venda.itens[0].produtoNome, 'Galão 20L');
  const baixas = prisma._data.movimentos.filter((m: any) => m.tipo === 'SAIDA_EMISSAO');
  assert.equal(baixas.length, 1);
  assert.equal(baixas[0].quantidade, 3);
  assert.equal(baixas[0].refVendaId, r.venda.id);
  assert.equal(r.aviso, null);
});

test('preço: fallback pro Product da logística (priceCents e price*100); sem nenhum recusa', async () => {
  const prisma = makePrisma({
    produtos: [AGUA_500],
    products: [{ id: 44, companyId: 7, price: 2.5, priceCents: null }],
    movimentos: [comEstoque('p2', 5)],
  });
  const service = makeService(prisma);
  const r = await service.criarVenda(7, 42, { itens: [{ produtoId: 'p2', quantidade: 2 }], pagamento: 'PIX' });
  assert.equal(r.venda.totalCents, 500); // 2 × R$2,50 do Product

  const semPreco = makeService(makePrisma({ produtos: [{ ...AGUA_500, logisticaProductId: null }], movimentos: [comEstoque('p2', 5)] }));
  await assert.rejects(() => semPreco.criarVenda(7, 42, { itens: [{ produtoId: 'p2', quantidade: 1 }], pagamento: 'PIX' }), /sem preço/i);
});

test('estoque negativo: travar RECUSA antes de gravar; avisar vende COM aviso', async () => {
  const trava = makeService(makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 1)], estoqueNegativo: 'travar' }));
  await assert.rejects(() => trava.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 5 }], pagamento: 'DINHEIRO' }), /TRAVAR/);

  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 1)], estoqueNegativo: 'avisar' });
  const avisa = makeService(prisma);
  const r = await avisa.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 5 }], pagamento: 'DINHEIRO' });
  assert.match(String(r.aviso), /NEGATIVO/);
  assert.equal(prisma._data.movimentos.filter((m: any) => m.tipo === 'SAIDA_EMISSAO').length, 1);
});

test('B4: RESERVADO com a rota TRAVA SEMPRE (mesmo no modo avisar) — a loja não vende o que está com o entregador', async () => {
  // físico 10, TUDO reservado na gaveta da rota → disponível 0. A cena do dono:
  // "existem 10 galões reservados, a loja tenta faturar +1 → trava e dá
  // problema no caixa" — independe do estoqueNegativo (que é pra falta FÍSICA).
  const reservaRota = { id: 'seed-reserva', companyId: 7, produtoId: 'p1', tipo: 'RESERVA', quantidade: 10, refCargaDia: '2026-08-05' };
  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 10), reservaRota], estoqueNegativo: 'avisar' });
  const service = makeService(prisma);
  await assert.rejects(
    () => service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'DINHEIRO' }),
    /reservado com a rota/i,
  );
  assert.equal(prisma._data.movimentos.filter((m: any) => m.tipo === 'SAIDA_EMISSAO').length, 0, 'travou ANTES de gravar');

  // reserva PARCIAL: 4 reservados de 10 → disponível 6; vender 6 passa, 7 trava.
  const parcial = makePrisma({
    produtos: [GALAO],
    movimentos: [comEstoque('p1', 10), { ...reservaRota, quantidade: 4 }],
    estoqueNegativo: 'avisar',
  });
  const svc2 = makeService(parcial);
  const ok = await svc2.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 6 }], pagamento: 'DINHEIRO' });
  assert.equal(ok.venda.status, 'CONCLUIDA');
  await assert.rejects(
    () => svc2.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'DINHEIRO' }),
    /reservado com a rota/i,
  );
});

test('FIADO: exige cliente; cria charge ONCE/MANUAL pending linkada; teto limiteFiado morde', async () => {
  const cliente = { id: 'c1', companyId: 7, name: 'Dona Maria', limiteFiado: 100 };
  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 10)], clientes: [cliente] });
  const service = makeService(prisma);

  await assert.rejects(() => service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'FIADO' }), /cliente/i);

  const r = await service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 2 }], pagamento: 'FIADO', clienteId: 'c1' });
  assert.ok(r.venda.financeChargeId);
  const charge = prisma._data.charges.find((c: any) => c.id === r.venda.financeChargeId);
  assert.equal(charge.amount, 30);
  assert.equal(charge.status, 'pending');
  assert.equal(charge.lifecycle, 'in_progress');
  assert.equal(charge.billingCycle, 'ONCE');
  assert.equal(charge.sourceModule, 'balcao_venda');
  assert.equal(charge.customerProfileId, 'c1');

  // Teto: R$30 já em aberto + venda de R$75 estoura o limite de R$100.
  await assert.rejects(
    () => service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 5 }], pagamento: 'FIADO', clienteId: 'c1' }),
    /Teto de fiado/i,
  );
});

test('idempotência do clique: mesma chave devolve a MESMA venda, sem 2ª baixa', async () => {
  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 10)] });
  const service = makeService(prisma);
  const a = await service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'PIX', idempotencyKey: 'k1' });
  const b = await service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'PIX', idempotencyKey: 'k1' });
  assert.equal(a.venda.id, b.venda.id);
  assert.equal(b.repetida, true);
  assert.equal(prisma._data.movimentos.filter((m: any) => m.tipo === 'SAIDA_EMISSAO').length, 1);
});

test('gate: sem modo HBX Gestão Fiscal (estoque desligado) o balcão recusa tudo', async () => {
  const service = makeService(makePrisma({ estoqueAtivo: false, produtos: [GALAO] }));
  await assert.rejects(() => service.listarProdutos(7), /Gestão Fiscal/);
  await assert.rejects(() => service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'PIX' }), /Gestão Fiscal/);
});

// ---------------------------------------------------------------------------
// CANCELAMENTO (rito)
// ---------------------------------------------------------------------------

test('cancelar: motivo obrigatório; REVERSA por item; charge do fiado cancela; trilha registra; 2ª vez recusa', async () => {
  const cliente = { id: 'c1', companyId: 7, name: 'Dona Maria', limiteFiado: null };
  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 10)], clientes: [cliente] });
  const trilha = { registros: [] as any[], registrar: async (r: any) => { trilha.registros.push(r); } };
  const service = makeService(prisma, trilha);
  const { venda } = await service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 2 }], pagamento: 'FIADO', clienteId: 'c1' });

  await assert.rejects(() => service.cancelarVenda(7, 42, venda.id, 'ab'), /mínimo 5/);

  const cancelada = await service.cancelarVenda(7, 42, venda.id, 'cliente desistiu');
  assert.equal(cancelada.status, 'CANCELADA');
  assert.equal(cancelada.motivoCancelamento, 'cliente desistiu');
  const reversas = prisma._data.movimentos.filter((m: any) => m.tipo === 'REVERSA_CANCELAMENTO');
  assert.equal(reversas.length, 1);
  assert.equal(reversas[0].quantidade, 2);
  const charge = prisma._data.charges[0];
  assert.equal(charge.status, 'cancelled');
  assert.equal(trilha.registros[0].operacao, 'CANCELAR_VENDA_BALCAO');
  assert.equal(trilha.registros[0].aprovadoPor, '42');

  await assert.rejects(() => service.cancelarVenda(7, 42, venda.id, 'de novo tentar'), /já está cancelada/i);
});

test('cancelar fiado JÁ PAGO recusa (estorno é rito do financeiro)', async () => {
  const cliente = { id: 'c1', companyId: 7, name: 'Dona Maria', limiteFiado: null };
  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 10)], clientes: [cliente] });
  const service = makeService(prisma);
  const { venda } = await service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'FIADO', clienteId: 'c1' });
  const charge = prisma._data.charges[0];
  charge.paidAt = new Date();
  charge.status = 'approved';
  await assert.rejects(() => service.cancelarVenda(7, 42, venda.id, 'quero cancelar'), /já foi PAGA/i);
  assert.equal(prisma._data.vendas[0].status, 'CONCLUIDA');
});

test('multi-tenant: venda de outra empresa é invisível pro cancelamento', async () => {
  const prisma = makePrisma({ produtos: [GALAO], movimentos: [comEstoque('p1', 10)] });
  const service = makeService(prisma);
  const { venda } = await service.criarVenda(7, 42, { itens: [{ produtoId: 'p1', quantidade: 1 }], pagamento: 'PIX' });
  // Empresa 8 nem tem perfil no fake → gate; e mesmo com gate, a venda não é dela.
  await assert.rejects(() => service.cancelarVenda(8, 1, venda.id, 'tentativa alheia'));
  assert.equal(prisma._data.vendas[0].status, 'CONCLUIDA');
});

// ---------------------------------------------------------------------------
// PARSER cEAN + PREVIEW por GTIN
// ---------------------------------------------------------------------------

const XML_COMPRA = `<nfeProc><NFe><infNFe Id="NFe12345678901234567890123456789012345678901234">
<emit><xNome>FORNECEDOR AGUA SA</xNome><CNPJ>99888777000166</CNPJ></emit>
<det nItem="1"><prod><cProd>A1</cProd><cEAN>7891234567895</cEAN><xProd>GALAO 20 LITROS</xProd><NCM>22011000</NCM><uCom>UN</uCom><qCom>50</qCom><vUnCom>8.00</vUnCom></prod></det>
<det nItem="2"><prod><cProd>A2</cProd><cEAN>SEM GTIN</cEAN><xProd>VASILHAME AVULSO</xProd><NCM>39233000</NCM><uCom>UN</uCom><qCom>10</qCom><vUnCom>15.00</vUnCom></prod></det>
</infNFe></NFe></nfeProc>`;

test('parser: cEAN vira string de dígitos; "SEM GTIN" literal vira null', () => {
  const parsed = parseNfeCompra(XML_COMPRA);
  assert.equal(parsed.itens[0].cEAN, '7891234567895');
  assert.equal(parsed.itens[1].cEAN, null);
});

test('preview do XML: GTIN igual casa PRIMEIRO (antes de NCM/nome)', async () => {
  // Produto com NCM DIFERENTE do item e nome nada a ver — só o GTIN casa.
  const prisma = makePrisma({
    produtos: [{ id: 'p9', companyId: 7, nome: 'Cesta básica', ncm: '99999999', ativo: true, gtin: '7891234567895', logisticaProductId: null }],
  });
  const estoque = new EstoqueService(prisma);
  const preview = await estoque.previewEntradaXml(7, XML_COMPRA);
  assert.equal(preview.itens[0].sugestaoProdutoId, 'p9'); // pelo GTIN
  assert.equal(preview.itens[1].sugestaoProdutoId, null); // SEM GTIN e nada casa
});
