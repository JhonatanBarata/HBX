import test from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  LogisticaVasilhameService,
  aplicarMovimento,
  sinalDoTipo,
} from './logistica-vasilhame.service';

/**
 * VASILHAME (17/08) — o que estes testes protegem:
 *   1. a aritmética do casco (pura, sem banco);
 *   2. saldo e extrato nascendo JUNTOS, na mesma transação;
 *   3. a recusa de baixar mais casco do que o cliente tem (nunca clampar calado);
 *   4. multi-tenant: empresa nenhuma enxerga nem move o casco da outra.
 */

function buildHarness(input: {
  produtos?: any[];
  clientes?: any[];
  saldos?: any[];
  vinculos?: any[];
  entregas?: any[];
} = {}) {
  const produtos = input.produtos || [
    { id: 10, companyId: 1, name: 'Água 20L', unidade: 'galão 20L', possuiVasilhame: true, vasilhamePrecoCents: 3500 },
    { id: 11, companyId: 1, name: 'Água 500ml', unidade: 'caixa', possuiVasilhame: false, vasilhamePrecoCents: null },
    { id: 20, companyId: 2, name: 'Gás P13', unidade: 'botijão', possuiVasilhame: true, vasilhamePrecoCents: 12000 },
  ];
  const clientes = input.clientes || [
    { id: 'cli-1', companyId: 1, name: 'Padaria do Zé', phone: '19999990000' },
    { id: 'cli-2', companyId: 2, name: 'Bar da outra empresa', phone: '19888880000' },
  ];
  const saldos: any[] = input.saldos ? [...input.saldos] : [];
  const vinculos: any[] = input.vinculos ? [...input.vinculos] : [];
  const entregas: any[] = input.entregas ? [...input.entregas] : [];
  const movimentos: any[] = [];

  const acharProduto = (id: number) => produtos.find((p) => p.id === id) || null;

  const chaveIgual = (row: any, where: any) =>
    row.companyId === where.companyId &&
    row.customerProfileId === where.customerProfileId &&
    row.productId === where.productId;

  const prisma: any = {
    customerProfile: {
      findFirst: async ({ where }: any) =>
        clientes.find((c) => c.id === where.id && c.companyId === where.companyId) || null,
    },
    product: {
      findFirst: async ({ where }: any) =>
        produtos.find((p) => p.id === where.id && p.companyId === where.companyId) || null,
    },
    clienteProduto: {
      findMany: async ({ where }: any) =>
        vinculos
          .filter(
            (v) =>
              v.companyId === where.companyId &&
              v.customerProfileId === where.customerProfileId &&
              (where.ativo === undefined || v.ativo === where.ativo),
          )
          .filter((v) => {
            const produto = acharProduto(v.productId);
            return where.product?.possuiVasilhame ? Boolean(produto?.possuiVasilhame) : true;
          })
          .map((v) => ({ productId: v.productId, product: acharProduto(v.productId) })),
    },
    vasilhameSaldo: {
      findMany: async ({ where }: any) =>
        saldos
          .filter((s) => s.companyId === where.companyId)
          .filter((s) => (where.customerProfileId ? s.customerProfileId === where.customerProfileId : true))
          .filter((s) => (where.qtd?.gt !== undefined ? s.qtd > where.qtd.gt : true))
          .map((s) => ({
            ...s,
            product: acharProduto(s.productId),
            customerProfile: clientes.find((c) => c.id === s.customerProfileId) || null,
          })),
      findUnique: async ({ where }: any) => {
        const chave = where.companyId_customerProfileId_productId;
        return saldos.find((s) => chaveIgual(s, chave)) || null;
      },
      upsert: async ({ where, create, update }: any) => {
        const chave = where.companyId_customerProfileId_productId;
        const index = saldos.findIndex((s) => chaveIgual(s, chave));
        if (index === -1) {
          saldos.push({ ...create });
          return create;
        }
        saldos[index] = { ...saldos[index], ...update };
        return saldos[index];
      },
    },
    // A entrega vem com os itens já resolvidos (o serviço só LÊ daqui).
    entrega: {
      findFirst: async ({ where }: any) => {
        const row = entregas.find((e) => e.id === where.id && e.companyId === where.companyId);
        if (!row) return null;
        return {
          ...row,
          itens: (row.itens || []).map((it: any) => ({
            ...it,
            product: acharProduto(it.productId),
          })),
        };
      },
    },
    vasilhameMovimento: {
      create: async ({ data }: any) => {
        const row = { id: `mov-${movimentos.length + 1}`, ...data, createdAt: new Date(2026, 7, 17) };
        movimentos.push(row);
        return row;
      },
      findMany: async ({ where, take }: any) =>
        movimentos
          .filter((m) => m.companyId === where.companyId)
          .filter((m) => (where.customerProfileId ? m.customerProfileId === where.customerProfileId : true))
          .filter((m) => (where.entregaId !== undefined ? m.entregaId === where.entregaId : true))
          .filter((m) => (where.productId?.in ? where.productId.in.includes(m.productId) : true))
          .slice(0, take || 50)
          .map((m) => ({ ...m, product: acharProduto(m.productId) })),
    },
    $transaction: async (arg: any) => (Array.isArray(arg) ? Promise.all(arg) : arg(prisma)),
  };

  return { prisma, saldos, movimentos, entregas, service: new LogisticaVasilhameService(prisma) };
}

/** entrega 'entregue' da empresa 1 pro cli-1, com os itens que o teste pedir */
function entregaEntregue(itens: any[], extra: any = {}) {
  return { id: 'ent-1', companyId: 1, status: 'entregue', customerProfileId: 'cli-1', itens, ...extra };
}

// ── 1. Aritmética pura ───────────────────────────────────────────────────────

test('sinal mora no TIPO: injeção e ajuste somam, devolução e perda tiram', () => {
  assert.equal(sinalDoTipo('INJECAO'), 1);
  assert.equal(sinalDoTipo('AJUSTE'), 1);
  assert.equal(sinalDoTipo('DEVOLUCAO'), -1);
  assert.equal(sinalDoTipo('PERDA'), -1);
});

test('aplicarMovimento soma e subtrai a partir do saldo atual', () => {
  assert.equal(aplicarMovimento(0, 'INJECAO', 3), 3);
  assert.equal(aplicarMovimento(3, 'DEVOLUCAO', 1), 2);
  assert.equal(aplicarMovimento(2, 'PERDA', 2), 0);
});

test('aplicarMovimento ignora quantidade inválida em vez de corromper o saldo', () => {
  assert.equal(aplicarMovimento(5, 'INJECAO', 0), 5);
  assert.equal(aplicarMovimento(5, 'INJECAO', -3), 5);
  assert.equal(aplicarMovimento(5, 'DEVOLUCAO', Number.NaN), 5);
});

// ── 2. Saldo e extrato nascem juntos ─────────────────────────────────────────

test('injetar grava saldo E movimento na mesma transação', async () => {
  const { service, saldos, movimentos } = buildHarness();

  const res = await service.registrarMovimento(1, {
    customerProfileId: 'cli-1',
    productId: 10,
    tipo: 'INJECAO',
    qtd: 3,
    userId: 7,
  });

  assert.equal(res.saldo, 3);
  assert.equal(saldos.length, 1);
  assert.equal(saldos[0].qtd, 3);
  assert.equal(movimentos.length, 1);
  assert.equal(movimentos[0].qtd, 3, 'movimento gravado já assinado');
  assert.equal(movimentos[0].saldoDepois, 3);
  assert.equal(movimentos[0].userId, 7, 'extrato sabe quem fez');
});

test('devolução grava quantidade NEGATIVA no extrato e baixa o saldo', async () => {
  const { service, saldos, movimentos } = buildHarness({
    saldos: [{ companyId: 1, customerProfileId: 'cli-1', productId: 10, qtd: 5 }],
  });

  const res = await service.registrarMovimento(1, {
    customerProfileId: 'cli-1',
    productId: 10,
    tipo: 'DEVOLUCAO',
    qtd: 2,
  });

  assert.equal(res.saldo, 3);
  assert.equal(saldos[0].qtd, 3);
  assert.equal(movimentos[0].qtd, -2);
  assert.equal(movimentos[0].saldoDepois, 3);
});

// ── 3. Nunca clampar calado ──────────────────────────────────────────────────

test('devolver mais do que o cliente tem é RECUSADO — saldo e extrato ficam intactos', async () => {
  const { service, saldos, movimentos } = buildHarness({
    saldos: [{ companyId: 1, customerProfileId: 'cli-1', productId: 10, qtd: 1 }],
  });

  await assert.rejects(
    () => service.registrarMovimento(1, { customerProfileId: 'cli-1', productId: 10, tipo: 'DEVOLUCAO', qtd: 10 }),
    BadRequestException,
  );
  assert.equal(saldos[0].qtd, 1, 'saldo não pode encolher por erro de digitação');
  assert.equal(movimentos.length, 0, 'movimento recusado não entra no extrato');
});

test('produto sem vasilhame não movimenta casco', async () => {
  const { service } = buildHarness();
  await assert.rejects(
    () => service.registrarMovimento(1, { customerProfileId: 'cli-1', productId: 11, tipo: 'INJECAO', qtd: 1 }),
    BadRequestException,
  );
});

test('tipo desconhecido e quantidade zero são recusados', async () => {
  const { service } = buildHarness();
  await assert.rejects(
    () => service.registrarMovimento(1, { customerProfileId: 'cli-1', productId: 10, tipo: 'SUMIU', qtd: 1 }),
    BadRequestException,
  );
  await assert.rejects(
    () => service.registrarMovimento(1, { customerProfileId: 'cli-1', productId: 10, tipo: 'INJECAO', qtd: 0 }),
    BadRequestException,
  );
});

// ── 4. Multi-tenant ──────────────────────────────────────────────────────────

test('empresa não move casco de cliente de outra empresa', async () => {
  const { service } = buildHarness();
  await assert.rejects(
    () => service.registrarMovimento(1, { customerProfileId: 'cli-2', productId: 10, tipo: 'INJECAO', qtd: 1 }),
    NotFoundException,
  );
});

test('empresa não move casco com produto de outra empresa', async () => {
  const { service } = buildHarness();
  await assert.rejects(
    () => service.registrarMovimento(1, { customerProfileId: 'cli-1', productId: 20, tipo: 'INJECAO', qtd: 1 }),
    NotFoundException,
  );
});

test('saldo do cliente não vaza entre empresas', async () => {
  const { service } = buildHarness({
    saldos: [{ companyId: 2, customerProfileId: 'cli-2', productId: 20, qtd: 9 }],
  });
  await assert.rejects(() => service.saldoDoCliente(1, 'cli-2'), NotFoundException);
});

// ── 5. A tela ────────────────────────────────────────────────────────────────

test('saldo do cliente devolve qtd, valor por linha e total em centavos', async () => {
  const { service } = buildHarness({
    saldos: [{ companyId: 1, customerProfileId: 'cli-1', productId: 10, qtd: 6 }],
  });

  const res = await service.saldoDoCliente(1, 'cli-1');

  assert.equal(res.linhas.length, 1);
  assert.equal(res.linhas[0].qtd, 6);
  assert.equal(res.linhas[0].precoCents, 3500);
  assert.equal(res.linhas[0].totalCents, 21000, '6 × R$35,00 = R$210,00');
  assert.equal(res.totalQtd, 6);
  assert.equal(res.totalCents, 21000);
});

test('produto com casco vinculado mas zerado aparece na lista (o dono precisa de onde clicar)', async () => {
  const { service } = buildHarness({
    vinculos: [{ companyId: 1, customerProfileId: 'cli-1', productId: 10, ativo: true }],
  });

  const res = await service.saldoDoCliente(1, 'cli-1');

  assert.equal(res.linhas.length, 1);
  assert.equal(res.linhas[0].qtd, 0);
  assert.equal(res.totalCents, 0);
});

test('cliente sem casco nenhum devolve lista vazia e total zero', async () => {
  const { service } = buildHarness();
  const res = await service.saldoDoCliente(1, 'cli-1');
  assert.deepEqual(res.linhas, []);
  assert.equal(res.totalQtd, 0);
  assert.equal(res.totalCents, 0);
});

test('patrimônio na rua soma a empresa inteira e ranqueia por valor', async () => {
  const { service } = buildHarness({
    clientes: [
      { id: 'cli-1', companyId: 1, name: 'Padaria do Zé' },
      { id: 'cli-3', companyId: 1, name: 'Mercado da esquina' },
      { id: 'cli-2', companyId: 2, name: 'Outra empresa' },
    ],
    saldos: [
      { companyId: 1, customerProfileId: 'cli-1', productId: 10, qtd: 2 },
      { companyId: 1, customerProfileId: 'cli-3', productId: 10, qtd: 8 },
      { companyId: 2, customerProfileId: 'cli-2', productId: 20, qtd: 50 },
    ],
  });

  const res = await service.patrimonioNaRua(1);

  assert.equal(res.totalQtd, 10, 'só a empresa 1');
  assert.equal(res.totalCents, 35000, '10 × R$35,00');
  assert.equal(res.clientesComCasco, 2);
  assert.equal(res.clientes[0].nome, 'Mercado da esquina', 'quem está com mais dinheiro vem primeiro');
  assert.equal(res.clientes[0].totalCents, 28000);
});

// ── 6. ONDA 2: a entrega move o saldo sozinha ────────────────────────────────

test('entrega confirmada injeta o líquido (entregou 3, voltaram 2 → +1) com o entregaId no extrato', async () => {
  const { service, saldos, movimentos } = buildHarness({
    entregas: [entregaEntregue([{ productId: 10, qtdPrevista: 3, qtdEntregue: 3, vasilhameRetornado: 2 }])],
  });

  const res = await service.moverPorEntrega(1, 'ent-1', 9);

  assert.equal(res.movidos, 1);
  assert.deepEqual(res.avisos, []);
  assert.equal(saldos[0].qtd, 1);
  assert.equal(movimentos[0].tipo, 'INJECAO');
  assert.equal(movimentos[0].qtd, 1);
  assert.equal(movimentos[0].entregaId, 'ent-1', 'o movimento aponta pra entrega que o gerou');
  assert.equal(movimentos[0].userId, 9);
});

test('recolher MAIS do que saiu vira DEVOLUCAO (o cliente devolveu casco velho)', async () => {
  const { service, saldos, movimentos } = buildHarness({
    saldos: [{ companyId: 1, customerProfileId: 'cli-1', productId: 10, qtd: 5 }],
    entregas: [entregaEntregue([{ productId: 10, qtdPrevista: 2, qtdEntregue: 2, vasilhameRetornado: 4 }])],
  });

  await service.moverPorEntrega(1, 'ent-1');

  assert.equal(saldos[0].qtd, 3, '5 + 2 − 4');
  assert.equal(movimentos[0].tipo, 'DEVOLUCAO');
  assert.equal(movimentos[0].qtd, -2);
});

test('IDEMPOTÊNCIA: o outbox reenviando o mesmo desfecho não dobra o casco', async () => {
  const { service, saldos, movimentos } = buildHarness({
    entregas: [entregaEntregue([{ productId: 10, qtdPrevista: 2, qtdEntregue: 2, vasilhameRetornado: 0 }])],
  });

  const primeira = await service.moverPorEntrega(1, 'ent-1');
  const segunda = await service.moverPorEntrega(1, 'ent-1');
  const terceira = await service.moverPorEntrega(1, 'ent-1');

  assert.equal(primeira.movidos, 1);
  assert.equal(segunda.movidos, 0, 'replay não move nada');
  assert.equal(terceira.movidos, 0);
  assert.equal(saldos[0].qtd, 2, 'confirmar 3× deixa o MESMO saldo');
  assert.equal(movimentos.length, 1, 'e um extrato só');
});

test('reabrir e corrigir os vazios lança só o DELTA, com o rastro da correção', async () => {
  const { service, saldos, movimentos, entregas } = buildHarness({
    entregas: [entregaEntregue([{ productId: 10, qtdPrevista: 3, qtdEntregue: 3, vasilhameRetornado: 0 }])],
  });

  await service.moverPorEntrega(1, 'ent-1');
  assert.equal(saldos[0].qtd, 3);

  // reabriu, o motorista lembrou que recolheu 2, reconfirmou
  entregas[0].itens[0].vasilhameRetornado = 2;
  const res = await service.moverPorEntrega(1, 'ent-1');

  assert.equal(res.movidos, 1);
  assert.equal(saldos[0].qtd, 1, 'saldo converge pro líquido novo, não soma de novo');
  assert.equal(movimentos.length, 2);
  assert.equal(movimentos[1].tipo, 'DEVOLUCAO');
  assert.equal(movimentos[1].qtd, -2);
  assert.match(String(movimentos[1].motivo), /Correção da entrega: 3 → 1/);
});

test('vasilhameRetornado AUSENTE não move nada — ausente é "não falaram de casco", não zero', async () => {
  const { service, saldos, movimentos } = buildHarness({
    entregas: [entregaEntregue([{ productId: 10, qtdPrevista: 4, qtdEntregue: 4, vasilhameRetornado: null }])],
  });

  const res = await service.moverPorEntrega(1, 'ent-1');

  assert.equal(res.movidos, 0);
  assert.equal(saldos.length, 0, 'APK velho não inventa patrimônio');
  assert.equal(movimentos.length, 0);
});

test('produto SEM vasilhame é ignorado, mesmo com o campo preenchido', async () => {
  const { service, movimentos } = buildHarness({
    entregas: [entregaEntregue([{ productId: 11, qtdPrevista: 2, qtdEntregue: 2, vasilhameRetornado: 0 }])],
  });

  const res = await service.moverPorEntrega(1, 'ent-1');

  assert.equal(res.movidos, 0);
  assert.equal(movimentos.length, 0);
});

test('dois itens do MESMO produto viram UM movimento (o saldo é por conta+produto)', async () => {
  const { service, saldos, movimentos } = buildHarness({
    entregas: [
      entregaEntregue([
        { productId: 10, qtdPrevista: 2, qtdEntregue: 2, vasilhameRetornado: 1 },
        { productId: 10, qtdPrevista: 3, qtdEntregue: 3, vasilhameRetornado: 0 },
      ]),
    ],
  });

  await service.moverPorEntrega(1, 'ent-1');

  assert.equal(movimentos.length, 1, 'um produto, um movimento');
  assert.equal(saldos[0].qtd, 4, '(2−1) + (3−0)');
});

test('stepper não mexido usa a QUANTIDADE PREVISTA (mesma fórmula do resto do módulo)', async () => {
  const { service, saldos } = buildHarness({
    entregas: [entregaEntregue([{ productId: 10, qtdPrevista: 2, qtdEntregue: null, vasilhameRetornado: 0 }])],
  });

  await service.moverPorEntrega(1, 'ent-1');

  assert.equal(saldos[0].qtd, 2);
});

test('entrega que NÃO está entregue não move patrimônio', async () => {
  const { service, movimentos } = buildHarness({
    entregas: [
      entregaEntregue([{ productId: 10, qtdPrevista: 2, qtdEntregue: 2, vasilhameRetornado: 0 }], {
        status: 'cancelada',
      }),
    ],
  });

  assert.deepEqual(await service.moverPorEntrega(1, 'ent-1'), { movidos: 0, avisos: [] });
  assert.equal(movimentos.length, 0);
});

test('entrega de outra empresa é invisível — casco não atravessa tenant', async () => {
  const { service, movimentos } = buildHarness({
    entregas: [entregaEntregue([{ productId: 10, qtdPrevista: 2, qtdEntregue: 2, vasilhameRetornado: 0 }])],
  });

  assert.deepEqual(await service.moverPorEntrega(2, 'ent-1'), { movidos: 0, avisos: [] });
  assert.equal(movimentos.length, 0);
});

test('devolução que estouraria o saldo vira AVISO — a rua nunca trava por casco', async () => {
  const { service, saldos, movimentos } = buildHarness({
    entregas: [
      entregaEntregue([
        // saldo 0 e o motorista recolheu 3 a mais do que entregou: líquido −3.
        { productId: 10, qtdPrevista: 1, qtdEntregue: 1, vasilhameRetornado: 4 },
      ]),
    ],
  });

  const res = await service.moverPorEntrega(1, 'ent-1');

  assert.equal(res.movidos, 0);
  assert.equal(res.avisos.length, 1);
  assert.match(res.avisos[0], /Água 20L/);
  assert.equal(saldos.length, 0, 'nada de saldo negativo');
  assert.equal(movimentos.length, 0);
});

test('um produto que falha não impede o outro de mover', async () => {
  const { service, movimentos } = buildHarness({
    produtos: [
      { id: 10, companyId: 1, name: 'Água 20L', unidade: 'galão 20L', possuiVasilhame: true, vasilhamePrecoCents: 3500 },
      { id: 12, companyId: 1, name: 'Gás P13', unidade: 'botijão', possuiVasilhame: true, vasilhamePrecoCents: 12000 },
    ],
    entregas: [
      entregaEntregue([
        { productId: 10, qtdPrevista: 1, qtdEntregue: 1, vasilhameRetornado: 9 }, // estoura
        { productId: 12, qtdPrevista: 2, qtdEntregue: 2, vasilhameRetornado: 0 }, // passa
      ]),
    ],
  });

  const res = await service.moverPorEntrega(1, 'ent-1');

  assert.equal(res.movidos, 1);
  assert.equal(res.avisos.length, 1);
  assert.equal(movimentos.length, 1);
  assert.equal(movimentos[0].productId, 12);
});

test('extrato do cliente devolve o histórico com o nome do produto', async () => {
  const { service } = buildHarness();

  await service.registrarMovimento(1, { customerProfileId: 'cli-1', productId: 10, tipo: 'INJECAO', qtd: 4 });
  await service.registrarMovimento(1, {
    customerProfileId: 'cli-1',
    productId: 10,
    tipo: 'DEVOLUCAO',
    qtd: 1,
    motivo: 'trocou na porta',
  });

  const extrato = await service.extratoDoCliente(1, 'cli-1');

  assert.equal(extrato.length, 2);
  assert.equal(extrato[0].produtoNome, 'Água 20L');
  assert.equal(extrato[1].motivo, 'trocou na porta');
});
