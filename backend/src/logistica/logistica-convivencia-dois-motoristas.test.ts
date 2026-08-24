import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaController } from './logistica.controller';
import { LogisticaRotaService, resolveDayRange } from './logistica-rota.service';
import { LogisticaService } from './logistica.service';
import { LogisticaRotaCobrancaService } from './logistica-rota-cobranca.service';
import { canonicalRouteDate } from './logistica-route-billing.util';

/**
 * 🔴 CONVIVÊNCIA ADMIN+MOTORISTA (24/08/2026) — empresa com o dono (ADMIN)
 * dirigindo a PRÓPRIA rota e um 2º motorista rodando a dele, no MESMO dia,
 * simultâneas, TRACKED. A regra de produto que estes testes trancam:
 *
 *   Os verbos operacionais de rota (`planejar`, `iniciar`, `encerrar`,
 *   `descartar-montagem`, `limpar-dia`) agem SEMPRE na rota do PRÓPRIO ator —
 *   admin dirigindo = a rota DELE. Gestão da rota de OUTRO motorista vive só
 *   no /logistica/admin-route/* e nos endpoints de atribuição/continuidade
 *   (alvo explícito). Admin continua VENDO tudo (listagens/cockpit).
 *
 * Antes do fix, `whereForActor` devolvia `{}` pro admin e os verbos desciam
 * SEM escopo: o "Encerrar" do dono devolvia pra pendência as entregas ABERTAS
 * DA EMPRESA INTEIRA, carimbava operationalEndedAt em TODAS as rotas vivas e
 * fechava a sessão TRACKED do motorista que estava na rua; o descarte ainda
 * ZERAVA o entregadorId das pendências alheias. Os testes (1)–(7) abaixo são
 * as sete provas pedidas na revisão desta data.
 *
 * Estilo: dublês em memória como os vizinhos (logistica-rota-encerrar/
 * logistica-rota-piso-ordem) — os verbos rodam pelo CONTROLLER de verdade
 * (é nele que o fail-safe de escopo mora) com o LogisticaRotaService real.
 */

const COMPANY = 7;
const ADMIN = 6; // o dono: ADMIN que TAMBÉM dirige
const MOTORISTA = 9; // o 2º motorista, na rua com rota própria
const DIA = '2026-08-24';
const ROUTE_DATE = canonicalRouteDate(DIA);
const { start: DAY_START } = resolveDayRange(DIA);

function atHour(h: number): Date {
  const d = new Date(DAY_START);
  d.setHours(h, 0, 0, 0);
  return d;
}

/** Ator ADMIN — `whereForActor` devolve `{}` (visão da empresa) DE PROPÓSITO. */
const admin = { id: ADMIN, companyId: COMPANY, role: 'ADMIN' };

/** `whereForActor` de verdade em uma linha: admin vê tudo, motorista vê o dele. */
const operacaoReal: any = {
  whereForActor: async (actor: any) => {
    const role = String(actor?.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'USERMASTER') return {};
    return { entregadorId: Number(actor?.id) };
  },
};

// ── banco em memória (Entrega + LogisticaRoute + sessão TRACKED) ─────────────

type EntregaRow = Record<string, any>;
type RouteRow = Record<string, any>;

function entregaDe(overrides: Partial<EntregaRow> & { id: string }): EntregaRow {
  return {
    companyId: COMPANY,
    entregadorId: ADMIN,
    status: 'agendada',
    rotaOrdem: null,
    etaAt: null,
    startedAt: null,
    scheduledAt: atHour(9),
    prioridade: false,
    cobrancaStatus: 'pendente',
    customerProfileId: `cli-${overrides.id}`,
    planoEntregaId: null,
    agendaOcorrenciaKey: null,
    agendaOcorrenciaKeyOrigem: null,
    rotaModeloId: null,
    comprovanteConfirmadoAt: null,
    logisticaRouteStop: null,
    _count: { comprovantes: 0 },
    local: null,
    customerProfile: { status: 'active', name: `Cliente ${overrides.id}`, lat: -23.5, lng: -46.6 },
    ...overrides,
  };
}

function bateScheduled(valor: Date | null, cond: any): boolean {
  if (cond === null) return valor === null;
  if (cond && typeof cond === 'object') {
    if (!valor) return false;
    const t = valor.getTime();
    if (cond.gte && t < new Date(cond.gte).getTime()) return false;
    if (cond.lte && t > new Date(cond.lte).getTime()) return false;
    if (cond.lt && t >= new Date(cond.lt).getTime()) return false;
    return true;
  }
  return true;
}

function bateEntrega(row: EntregaRow, where: any): boolean {
  if (where.companyId != null && row.companyId !== where.companyId) return false;
  // Valor exato, INCLUINDO null (o CAS do planejar compara o dono esperado).
  if ('entregadorId' in where && where.entregadorId !== undefined && row.entregadorId !== where.entregadorId) return false;
  if (typeof where.id === 'string' && row.id !== where.id) return false;
  if (where.id?.in && !where.id.in.includes(row.id)) return false;
  if (typeof where.status === 'string' && row.status !== where.status) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if (where.status?.notIn && where.status.notIn.includes(row.status)) return false;
  if (where.customerProfile?.status && row.customerProfile?.status !== where.customerProfile.status) return false;
  if ('scheduledAt' in where && where.scheduledAt !== undefined && !bateScheduled(row.scheduledAt, where.scheduledAt)) return false;
  if (Array.isArray(where.OR)) {
    const bateBranch = (branch: any) => {
      if ('scheduledAt' in branch && !bateScheduled(row.scheduledAt, branch.scheduledAt)) return false;
      if (branch.status?.in && !branch.status.in.includes(row.status)) return false;
      return true;
    };
    if (!where.OR.some(bateBranch)) return false;
  }
  return true;
}

function bateRoute(row: RouteRow, where: any): boolean {
  if (where.companyId != null && row.companyId !== where.companyId) return false;
  if (where.id !== undefined && row.id !== where.id) return false;
  if (where.entregadorId !== undefined && row.entregadorId !== where.entregadorId) return false;
  if (where.routeDate !== undefined && row.routeDate !== where.routeDate) return false;
  if (typeof where.status === 'string' && row.status !== where.status) return false;
  if (where.status?.in && !where.status.in.includes(row.status)) return false;
  if ('operationalEndedAt' in where && where.operationalEndedAt !== undefined) {
    if (where.operationalEndedAt === null && row.operationalEndedAt !== null) return false;
    if (where.operationalEndedAt?.not === null && row.operationalEndedAt === null) return false;
  }
  return true;
}

function bancoDoDia(seedEntregas: EntregaRow[], seedRoutes: RouteRow[] = [], seedSessoes: any[] = []) {
  const entregas = new Map(seedEntregas.map((r) => [r.id, { ...r }]));
  const routes = new Map(seedRoutes.map((r) => [r.id, { ...r }]));
  const sessoes = new Map(seedSessoes.map((s) => [s.id, { ...s }]));
  const stops: any[] = [];
  const locks: string[] = [];
  let routeSeq = 100;
  let stopSeq = 0;

  const prisma: any = {
    logisticaConfig: { findUnique: async () => ({ velocidadeMediaKmH: 25, tempoParadaMin: 5 }) },
    logisticaAgendaEvento: { create: async () => ({}) },
    logisticaPlanoEntrega: { updateMany: async () => ({ count: 0 }) },
    entrega: {
      findMany: async ({ where }: any) =>
        [...entregas.values()].filter((row) => bateEntrega(row, where)).map((row) => ({ ...row })),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of entregas.values()) {
          if (!bateEntrega(row, where)) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
      aggregate: async ({ where }: any) => {
        const fechadas = [...entregas.values()].filter((row) => bateEntrega(row, where));
        const maior = fechadas.reduce((m, r) => (typeof r.rotaOrdem === 'number' ? Math.max(m, r.rotaOrdem) : m), -1);
        return { _max: { rotaOrdem: maior >= 0 ? maior : null } };
      },
    },
    logisticaRoute: {
      findMany: async ({ where }: any) => [...routes.values()].filter((row) => bateRoute(row, where)).map((r) => ({ ...r })),
      findFirst: async ({ where }: any) => {
        const hit = [...routes.values()].find((row) => bateRoute(row, where));
        return hit ? { ...hit } : null;
      },
      create: async ({ data }: any) => {
        const row = { id: `route-${++routeSeq}`, createdAt: new Date(), operationalEndedAt: null, startedAt: null, ...data };
        routes.set(row.id, row);
        return { ...row };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of routes.values()) {
          if (!bateRoute(row, where)) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
    },
    logisticaTrackingSession: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of sessoes.values()) {
          if (where.companyId != null && row.companyId !== where.companyId) continue;
          if (where.routeId?.in && !where.routeId.in.includes(row.routeId)) continue;
          if (typeof where.status === 'string' && row.status !== where.status) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
    },
    logisticaRouteStop: {
      findMany: async ({ where }: any) => stops.filter((s) => where.deliveryId?.in?.includes(s.deliveryId)),
      aggregate: async ({ where }: any) => ({
        _max: { snapshotOrder: Math.max(-1, ...stops.filter((s) => s.routeId === where.routeId).map((s) => s.snapshotOrder)) },
      }),
      create: async ({ data }: any) => {
        const row = { id: `stop-${++stopSeq}`, billingExempt: false, ...data };
        stops.push(row);
        return row;
      },
      count: async ({ where }: any) => stops.filter((s) => s.routeId === where.routeId
        && (!where.deliveryId?.in || where.deliveryId.in.includes(s.deliveryId))).length,
    },
    $executeRawUnsafe: async (_sql: string, _companyId: number, key: string) => {
      locks.push(key);
      return 0;
    },
    $transaction: async (cb: any) => cb(prisma),
  };

  const cobranca: any = {
    garantirDiaPago: async () => undefined,
    assertAssentoDoDia: async () => undefined,
    garantirPasseDoDia: async () => undefined,
  };
  const tracking: any = {
    ensureSessionForStartedRoute: async () => ({ id: 'sess-nova', status: 'ACTIVE' }),
    discardUnboundSessionAfterRouteFailure: async () => undefined,
    getOperationalRouteMetadata: async (_c: number, driverId: number) => ({
      routeId: `route-de-${driverId}`,
      trackingRequired: true,
      routeStatus: 'ACTIVE',
      trackingSessionId: `sess-de-${driverId}`,
      trackingStatus: 'ACTIVE',
    }),
  };
  const rota = new LogisticaRotaService(prisma, cobranca, tracking);
  (rota as any).logger = { log: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  // Posicional, mesmo padrão de logistica-aviso-admin-motorista.test.ts — os
  // defaults `null` do construtor cobrem o resto (rotaAviso ausente = recado
  // de saída vira no-op, que não é o assunto daqui).
  const controller = new LogisticaController(
    {} as any, // service
    {} as any, // recorrencia
    rota as any, // rota
    {} as any, // config
    {} as any, // recovery
    operacaoReal, // operacao
  );

  return { controller, rota, entregas, routes, sessoes, locks };
}

/** O dia-alvo: admin e motorista, CADA UM com rota viva TRACKED e paradas próprias. */
function diaComDoisMotoristas() {
  return bancoDoDia(
    [
      entregaDe({ id: 'e-admin', entregadorId: ADMIN, status: 'em_rota', rotaOrdem: 0, startedAt: atHour(8) }),
      entregaDe({ id: 'e-mot-1', entregadorId: MOTORISTA, status: 'em_rota', rotaOrdem: 0, startedAt: atHour(8) }),
      entregaDe({ id: 'e-mot-2', entregadorId: MOTORISTA, status: 'agendada', rotaOrdem: 1, etaAt: atHour(11) }),
    ],
    [
      { id: 'r-admin', companyId: COMPANY, entregadorId: ADMIN, routeDate: ROUTE_DATE, status: 'ACTIVE', mode: 'TRACKED', operationalEndedAt: null, createdAt: atHour(7) },
      { id: 'r-mot', companyId: COMPANY, entregadorId: MOTORISTA, routeDate: ROUTE_DATE, status: 'ACTIVE', mode: 'TRACKED', operationalEndedAt: null, createdAt: atHour(7) },
    ],
    [
      { id: 's-admin', companyId: COMPANY, routeId: 'r-admin', status: 'ACTIVE', endedAt: null },
      { id: 's-mot', companyId: COMPANY, routeId: 'r-mot', status: 'ACTIVE', endedAt: null },
    ],
  );
}

// ── (1) R1 — encerrar do admin NÃO toca a rota do motorista ──────────────────
test('(1) encerrar do admin dirige só a PRÓPRIA rota: a do motorista na rua fica de pé', async () => {
  const h = diaComDoisMotoristas();

  await h.controller.encerrarRota({ user: admin }, { date: DIA } as any);

  // A rota do ADMIN encerrou de verdade…
  assert.equal(h.entregas.get('e-admin')!.status, 'agendada', 'a parada do admin volta pra pendência');
  assert.ok(h.routes.get('r-admin')!.operationalEndedAt instanceof Date, 'rota do admin carimbada');
  assert.equal(h.sessoes.get('s-admin')!.status, 'ENDED', 'sessão TRACKED do admin fechada');

  // …e a do MOTORISTA continua exatamente como estava (era o estrago do bug).
  const naRua = h.entregas.get('e-mot-1')!;
  assert.equal(naRua.status, 'em_rota', 'a entrega em rota do motorista NÃO volta pra pendência');
  assert.equal(naRua.rotaOrdem, 0, 'a ordem do motorista não é mexida');
  assert.equal(h.entregas.get('e-mot-2')!.status, 'agendada');
  assert.equal(h.entregas.get('e-mot-2')!.rotaOrdem, 1, 'a agendada planejada do motorista mantém a ordem');
  assert.equal(h.routes.get('r-mot')!.operationalEndedAt, null, 'a rota viva do motorista NÃO ganha operationalEndedAt');
  assert.equal(h.sessoes.get('s-mot')!.status, 'ACTIVE', 'a sessão TRACKED do motorista segue viva');
});

// ── (2) R1 — descartar-montagem do admin preserva o entregadorId alheio ──────
test('(2) descartar-montagem do admin não zera o entregadorId das pendências do motorista', async () => {
  const h = diaComDoisMotoristas();

  await h.controller.descartarMontagem({ user: admin }, { date: DIA } as any);

  // Escopo do admin: a parada DELE (já iniciada, sem chave) vira pendência — e
  // no descarte ela solta o dono DE PROPÓSITO (regra PR29072026, inalterada).
  assert.equal(h.entregas.get('e-admin')!.status, 'agendada');
  assert.equal(h.entregas.get('e-admin')!.entregadorId, null, 'a pendência do PRÓPRIO descarte solta o dono (como sempre)');

  // As do MOTORISTA ficam intocadas: status, ordem e — o ponto do bug — o DONO.
  for (const id of ['e-mot-1', 'e-mot-2']) {
    assert.equal(h.entregas.get(id)!.entregadorId, MOTORISTA, `${id}: entregadorId alheio preservado`);
  }
  assert.equal(h.entregas.get('e-mot-1')!.status, 'em_rota');
  assert.equal(h.entregas.get('e-mot-2')!.rotaOrdem, 1);
  assert.equal(h.routes.get('r-mot')!.operationalEndedAt, null, 'a rota viva do motorista não é encerrada');
});

// ── (3) R2 — planejar do admin não reordena a rota do motorista ──────────────
test('(3) planejar do admin escopa ao ator: rotaOrdem do motorista intocada e lock plan:<atorId>', async () => {
  const h = bancoDoDia([
    entregaDe({ id: 'e-admin', entregadorId: ADMIN, status: 'agendada' }),
    entregaDe({ id: 'e-mot-1', entregadorId: MOTORISTA, status: 'em_rota', rotaOrdem: 0, startedAt: atHour(8) }),
    entregaDe({ id: 'e-mot-2', entregadorId: MOTORISTA, status: 'agendada', rotaOrdem: 1, etaAt: atHour(11) }),
  ]);

  const res = await h.controller.planejarRota({ user: admin }, { date: DIA, ordemManual: ['e-admin'] } as any);

  assert.equal(res.total, 1, 'o plano do admin só tem as paradas DELE');
  assert.deepEqual(res.paradas.map((p: any) => p.id), ['e-admin']);
  assert.equal(typeof h.entregas.get('e-admin')!.rotaOrdem, 'number', 'a parada do admin ganhou ordem');

  // A rota que o motorista está seguindo não mexe um número.
  assert.equal(h.entregas.get('e-mot-1')!.rotaOrdem, 0, 'em_rota do motorista mantém a ordem');
  assert.equal(h.entregas.get('e-mot-2')!.rotaOrdem, 1, 'agendada do motorista mantém a ordem');

  // R2 também é o LOCK: `plan:0` (que não serializava com o do motorista) morreu —
  // o planejar do admin serializa na chave DELE.
  assert.ok(
    h.locks.some((k) => k === `plan:${ADMIN}:date:${ROUTE_DATE}`),
    `o lock de persistência é plan:${ADMIN} (ator), nunca plan:0 — visto: ${h.locks.join(', ')}`,
  );
  assert.ok(!h.locks.some((k) => k.startsWith('plan:0:')), 'plan:0 não existe mais neste caminho');
});

// ── (4) R3 — listRota do admin-motorista num dia com 2 motoristas ────────────
test('(4) listRota: com 2 motoristas no dia, o metadata é o da rota do PRÓPRIO admin-motorista', async () => {
  const linhaBase = (id: string, entregadorId: number) => ({
    id,
    status: 'em_rota',
    quantidade: 1,
    origem: 'avulsa',
    valor: 10,
    scheduledAt: atHour(9),
    arrivedAt: null,
    deliveredAt: null,
    deliveredLat: null,
    deliveredLng: null,
    receiptMethod: null,
    cobrancaStatus: 'pendente',
    notes: null,
    updatedAt: atHour(9),
    entregador: { id: entregadorId, name: `U${entregadorId}`, email: null, username: null },
    comprovanteCodigoHash: null,
    comprovanteConfirmadoAt: null,
    comprovantes: [],
    rotaOrdem: 0,
    prioridade: false,
    etaAt: null,
    localId: null,
    local: null,
    customerProfile: {
      id: `cli-${id}`, name: 'Cliente', endereco: 'Rua A', numero: null, complemento: null,
      bairro: null, cep: null, cidade: 'SP', uf: 'SP', lat: -23.5, lng: -46.6, phone: null,
      observacoes: null, metodoPadrao: null, formaPagamento: 'avulso', limiteFiado: null,
    },
    contato: null,
    product: null,
    itens: [],
  });
  const metadataPedidoPara: number[] = [];
  const prisma: any = {
    entrega: {
      findMany: async () => [linhaBase('e-admin', ADMIN), linhaBase('e-mot', MOTORISTA)],
      groupBy: async () => [],
    },
    financeiroCharge: { groupBy: async () => [] },
    logisticaConfig: { findUnique: async () => ({}) },
  };
  const operacao: any = {
    whereForActor: async () => ({}), // admin: visão da empresa (o GET continua vendo TUDO)
    requisitosFromConfig: () => ({ fotoObrigatoria: false, assinaturaObrigatoria: false, codigoObrigatorio: false }),
  };
  const tracking: any = {
    getOperationalRouteMetadata: async (_c: number, driverId: number) => {
      metadataPedidoPara.push(driverId);
      return {
        routeId: `route-de-${driverId}`,
        trackingRequired: true,
        routeMode: 'TRACKED',
        routeStatus: 'ACTIVE',
        trackingSessionId: `sess-de-${driverId}`,
        trackingStatus: 'ACTIVE',
      };
    },
  };
  const rotaDuble: any = { lerProspectosDoDia: async () => null };
  const service = new LogisticaService(
    prisma, {} as any, rotaDuble, {} as any,
    undefined, undefined, undefined, operacao, tracking,
  );
  (service as any).logger = { log: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

  // ADMIN que DIRIGE (é um dos 2 motoristas do dia): metadata da rota DELE —
  // era exatamente aqui que o payload vinha routeId:null/trackingRequired:false
  // e a ponte do APK rebaixava a telemetria calada.
  const doAdmin = await service.listRota(COMPANY, DIA, { id: ADMIN, companyId: COMPANY, role: 'ADMIN' } as any);
  assert.deepEqual(metadataPedidoPara, [ADMIN], 'o metadata consultado é o do ator, não o de um "motorista único"');
  assert.equal(doAdmin.routeId, `route-de-${ADMIN}`);
  assert.equal(doAdmin.trackingRequired, true, 'o APK do admin-motorista continua mandado a rastrear');
  assert.equal(doAdmin.total, 2, 'a LISTA continua com a empresa inteira — admin segue vendo tudo');

  // ADMIN que só GERE (não roda no dia): comportamento de hoje — sem metadata.
  metadataPedidoPara.length = 0;
  const soGerindo = await service.listRota(COMPANY, DIA, { id: 99, companyId: COMPANY, role: 'ADMIN' } as any);
  assert.deepEqual(metadataPedidoPara, [], 'sem rota própria não há "a rota" a reportar');
  assert.equal(soGerindo.routeId, null);
  assert.equal(soGerindo.trackingRequired, false);
});

// ── (5) R5 — passe do dia em empresa CREDITO: recusa ANTES de debitar ────────
test('(5) garantirPasseDoDia em nível CREDITO recusa com 402 ASSENTOS_ESGOTADOS e NÃO debita', async () => {
  const debitCalls: any[] = [];
  const prisma: any = {
    logisticaConfig: { findUnique: async () => ({ logisticaNivel: 'CREDITO', logisticaAssentos: null }) },
    creditLedgerEntry: { findMany: async () => [] },
    $executeRawUnsafe: async () => 0,
    $transaction: async (cb: any) => cb(prisma),
  };
  const wallet: any = {
    debit: async (...args: any[]) => { debitCalls.push(args); return { debited: 8, partial: false }; },
    refund: async () => ({ refunded: 0 }),
  };
  const actionConfig: any = {
    resolveEffective: async () => ({ mode: 'debit', cost: 8 }),
  };
  const cobranca = new LogisticaRotaCobrancaService(prisma, wallet, actionConfig);

  await assert.rejects(
    cobranca.garantirPasseDoDia(COMPANY, MOTORISTA, DIA, ADMIN),
    (err: any) => {
      assert.equal(err.getStatus(), 402);
      const body = err.getResponse();
      assert.equal(body.code, 'ASSENTOS_ESGOTADOS', 'mesmo shape do gate — a tela do app já traduz');
      assert.equal(body.podeComprarPasse, false, 'em CREDITO não existe passe pra oferecer');
      assert.match(String(body.message), /Conheça os planos/i, 'o recado é conhecer os planos, não comprar');
      return true;
    },
  );
  assert.equal(debitCalls.length, 0, 'era o bug: debitava sem liberar nada (e sem caminho de estorno)');
});

// ── (6) R6 — paraMinhaRota com o teto de assentos estourado → 402 ────────────
test('(6) createEntrega paraMinhaRota do 2º usuário com teto estourado leva 402 e NÃO grava', async () => {
  // Cobrança REAL (portão de assentos de verdade): BASIC = 1 assento, e o dia
  // já tem o MOTORISTA como ocupante.
  const prismaCobranca: any = {
    logisticaConfig: { findUnique: async () => ({ logisticaNivel: 'BASIC', logisticaAssentos: null }) },
    entrega: { findMany: async () => [{ entregadorId: MOTORISTA }] },
    creditLedgerEntry: { findMany: async () => [] },
  };
  const cobranca = new LogisticaRotaCobrancaService(prismaCobranca, {} as any, {} as any);

  const SEGUNDO = 10; // o 2º usuário do dia, que estouraria o teto
  let criada: any = null;
  const prisma: any = {
    customerProfile: { findFirst: async () => ({ id: 'conta-1', precoPadrao: null }) },
    contato: { findFirst: async () => null },
    user: { findFirst: async ({ where }: any) => (where.id === SEGUNDO ? { id: SEGUNDO } : null) },
    entrega: { create: async (args: any) => { criada = args.data; return { id: args.data.id }; } },
  };
  const service = new LogisticaService(
    prisma, {} as any, {} as any, {} as any,
    undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
    cobranca,
  );

  await assert.rejects(
    service.createEntrega(
      COMPANY,
      { customerProfileId: 'conta-1', paraMinhaRota: true } as any,
      { id: SEGUNDO, companyId: COMPANY, role: 'USER' } as any, // usuário comum: sem botão de compra
    ),
    (err: any) => {
      assert.equal(err.getStatus(), 402);
      const body = err.getResponse();
      assert.equal(body.code, 'ASSENTOS_ESGOTADOS');
      assert.equal(body.podeComprarPasse, false, 'LEI DO VENDEDOR: funcionário não vê botão de compra');
      return true;
    },
  );
  assert.equal(criada, null, 'a entrega NÃO nasce — antes ela nascia e o criador virava ocupante (teto morto)');
});

// ── (7) R7 — iniciar do admin com 2 motoristas no dia funciona ───────────────
test('(7) iniciar do admin num dia com 2 motoristas inicia a rota DELE (sem o 400 de motorista único)', async () => {
  const h = bancoDoDia([
    entregaDe({ id: 'e-admin', entregadorId: ADMIN, status: 'agendada' }),
    entregaDe({ id: 'e-mot-1', entregadorId: MOTORISTA, status: 'em_rota', rotaOrdem: 0, startedAt: atHour(8) }),
  ]);

  // Antes do fix: entregadorId descia undefined → resolveSingleDriver achava
  // paradas de 2 donos → 400 "As paradas do dia estão divididas entre 2
  // motoristas" — o admin não conseguia SAIR com a própria rota.
  const res = await h.controller.iniciarRota({ user: admin }, { date: DIA, ordemManual: ['e-admin'] } as any);

  assert.equal(res.total, 1, 'o plano iniciado é só o do admin');
  assert.equal(h.entregas.get('e-admin')!.status, 'em_rota', 'a 1ª parada do admin saiu pra rua');
  const rotaDoAdmin = [...h.routes.values()].find((r) => r.entregadorId === ADMIN);
  assert.ok(rotaDoAdmin, 'nasceu LogisticaRoute pro admin');
  assert.equal(rotaDoAdmin!.status, 'ACTIVE');
  // E o dia do motorista segue intocado.
  assert.equal(h.entregas.get('e-mot-1')!.status, 'em_rota');
  assert.equal(h.entregas.get('e-mot-1')!.rotaOrdem, 0);
});
