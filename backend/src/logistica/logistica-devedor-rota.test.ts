// PR27072026 F2 (27/07) — PARADA AMARELA DE DEVEDOR: testes de
// LogisticaService#resolverDevedorNaRota, a fonte ÚNICA usada por listRota
// (chip "só cobrar") e por LogisticaAdminRouteService#prepare (filtro EXCLUIR
// da montagem). Mesmo molde de logistica-config-nivel.test.ts (prisma fake em
// memória, node:test) — arquivo isolado de propósito (zero edição no gigante
// logistica.service.test.ts, que outro worker também toca).
import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaService } from './logistica.service';

function buildPrisma(opts: {
  moduloFinanceiroAtivo?: boolean;
  devedorNaRota?: string;
  logisticaNivel?: string;
  clientes?: Array<{ id: string; limiteFiado: number | null }>;
  pendentes?: Array<{ customerProfileId: string; _sum: { amount: number } }>;
  aguardando?: Array<{ customerProfileId: string; _sum: { valor: number } }>;
  onConfigRead?: () => void;
  onSaldoQuery?: () => void;
  configThrows?: boolean;
}) {
  const {
    moduloFinanceiroAtivo = true,
    devedorNaRota = 'COBRANCA',
    logisticaNivel = 'ADVANCED',
    clientes = [],
    pendentes = [],
    aguardando = [],
    onConfigRead,
    onSaldoQuery,
    configThrows = false,
  } = opts;

  return {
    logisticaConfig: {
      findUnique: async () => {
        onConfigRead?.();
        if (configThrows) throw new Error('boom');
        return { moduloFinanceiroAtivo, devedorNaRota, logisticaNivel };
      },
    },
    customerProfile: {
      findMany: async () => {
        onSaldoQuery?.();
        return clientes;
      },
    },
    financeiroCharge: {
      groupBy: async () => {
        onSaldoQuery?.();
        return pendentes;
      },
    },
    entrega: {
      groupBy: async () => {
        onSaldoQuery?.();
        return aguardando;
      },
      // Sem update/updateMany DE PROPÓSITO: resolverDevedorNaRota é 100% leitura —
      // se algum caminho tentasse cancelar/gravar a Entrega, o teste quebraria
      // com "not a function" em vez de passar calado.
    },
  } as any;
}

function service(prisma: any) {
  return new LogisticaService(prisma, {} as any, {} as any, {} as any);
}

// ── básico ────────────────────────────────────────────────────────────────

test('sem companyId ou sem clienteIds: devolve Map vazio sem consultar nada', async () => {
  let leu = false;
  const prisma = buildPrisma({ onConfigRead: () => { leu = true; } });
  const svc = service(prisma);
  assert.deepEqual(await svc.resolverDevedorNaRota(0, ['a']), new Map());
  assert.deepEqual(await svc.resolverDevedorNaRota(1, []), new Map());
  assert.equal(leu, false, 'nem chega a ler a config sem trabalho a fazer');
});

// ── gates (fail-safe = NORMAL sem gastar a query de saldo) ──────────────────

// ⚰️ 24/08/2026 — os gates de moduloFinanceiroAtivo (financeiro é sempre
// ligado) e de nível BASIC (plano difere só por assentos) MORRERAM: a régua
// vale pra todo tenant. Este teste é o freio contra o gate voltar.
test('sem gates: linha antiga com financeiro OFF/BASIC gravados ainda resolve a régua normalmente', async () => {
  const prisma = buildPrisma({
    moduloFinanceiroAtivo: false, // sobra do banco pré-drop — não decide nada
    logisticaNivel: 'BASIC', // idem
    devedorNaRota: 'COBRANCA',
    clientes: [{ id: 'conta-1', limiteFiado: null }],
    pendentes: [{ customerProfileId: 'conta-1', _sum: { amount: 100 } }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.deepEqual(res.get('conta-1'), {
    devedor: true,
    modo: 'COBRANCA',
    saldoAberto: 100,
    motivo: 'R$ 100,00 em aberto',
  });
});

test('devedorNaRota=NORMAL: todos NORMAL mesmo com saldo positivo e nível Advanced', async () => {
  let consultouSaldo = false;
  const prisma = buildPrisma({
    devedorNaRota: 'NORMAL',
    clientes: [{ id: 'conta-1', limiteFiado: null }],
    pendentes: [{ customerProfileId: 'conta-1', _sum: { amount: 100 } }],
    onSaldoQuery: () => { consultouSaldo = true; },
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.deepEqual(res.get('conta-1'), { devedor: false, modo: 'NORMAL', saldoAberto: 0, motivo: null });
  assert.equal(consultouSaldo, false, 'NORMAL é "ignora o débito" — nem soma saldo');
});

test('config ilegível (erro na leitura): fail-safe NORMAL pra todos', async () => {
  const prisma = buildPrisma({ configThrows: true });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.deepEqual(res.get('conta-1'), { devedor: false, modo: 'NORMAL', saldoAberto: 0, motivo: null });
});

// ── fórmula do devedor: saldoAberto > 0 E (limiteFiado nulo OU saldoAberto > limite) ──

test('COBRANCA + limiteFiado nulo + saldo > 0 → devedor, motivo com o valor em R$', async () => {
  const prisma = buildPrisma({
    clientes: [{ id: 'conta-1', limiteFiado: null }],
    pendentes: [{ customerProfileId: 'conta-1', _sum: { amount: 42.5 } }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.deepEqual(res.get('conta-1'), {
    devedor: true,
    modo: 'COBRANCA',
    saldoAberto: 42.5,
    motivo: 'R$ 42,50 em aberto',
  });
});

test('COBRANCA + saldo dentro do limite (saldo <= limiteFiado) → NÃO é devedor', async () => {
  const prisma = buildPrisma({
    clientes: [{ id: 'conta-1', limiteFiado: 100 }],
    pendentes: [{ customerProfileId: 'conta-1', _sum: { amount: 100 } }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.deepEqual(res.get('conta-1'), { devedor: false, modo: 'NORMAL', saldoAberto: 0, motivo: null });
});

test('COBRANCA + saldo estoura o limite (saldo > limiteFiado) → devedor', async () => {
  const prisma = buildPrisma({
    clientes: [{ id: 'conta-1', limiteFiado: 100 }],
    pendentes: [{ customerProfileId: 'conta-1', _sum: { amount: 100.01 } }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.equal(res.get('conta-1')?.devedor, true);
  assert.equal(res.get('conta-1')?.modo, 'COBRANCA');
});

test('saldo zerado (em dia): fica NORMAL mesmo com o tenant em EXCLUIR', async () => {
  const prisma = buildPrisma({
    devedorNaRota: 'EXCLUIR',
    clientes: [{ id: 'conta-1', limiteFiado: null }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.deepEqual(res.get('conta-1'), { devedor: false, modo: 'NORMAL', saldoAberto: 0, motivo: null });
});

// ── modo EXCLUIR: marca pro filtro do chamador, mas NUNCA escreve nada ───────

test('EXCLUIR + devedor: modo EXCLUIR sem motivo textual (não vira chip, só filtro)', async () => {
  const prisma = buildPrisma({
    devedorNaRota: 'EXCLUIR',
    clientes: [{ id: 'conta-1', limiteFiado: null }],
    pendentes: [{ customerProfileId: 'conta-1', _sum: { amount: 30 } }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.deepEqual(res.get('conta-1'), { devedor: true, modo: 'EXCLUIR', saldoAberto: 30, motivo: null });
  // Prova estrutural do "nunca cancela nada": o fake prisma acima nem define
  // entrega.update/updateMany — se o serviço tivesse tentado escrever, o teste
  // já teria explodido em vez de chegar até aqui.
});

test('saldo em aguardando_fechamento também conta (mesma fonte única de saldoAbertoPorClientes)', async () => {
  const prisma = buildPrisma({
    clientes: [{ id: 'conta-1', limiteFiado: null }],
    aguardando: [{ customerProfileId: 'conta-1', _sum: { valor: 15 } }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['conta-1']);
  assert.equal(res.get('conta-1')?.devedor, true);
  assert.equal(res.get('conta-1')?.saldoAberto, 15);
});

// ── múltiplos clientes: cada um resolve independente ─────────────────────────

test('mistura: devedor com COBRANCA, cliente em dia fica NORMAL, no MESMO lote', async () => {
  const prisma = buildPrisma({
    clientes: [
      { id: 'devedor', limiteFiado: null },
      { id: 'em-dia', limiteFiado: null },
    ],
    pendentes: [{ customerProfileId: 'devedor', _sum: { amount: 20 } }],
  });
  const svc = service(prisma);
  const res = await svc.resolverDevedorNaRota(1, ['devedor', 'em-dia']);
  assert.equal(res.get('devedor')?.devedor, true);
  assert.equal(res.get('em-dia')?.devedor, false);
});
