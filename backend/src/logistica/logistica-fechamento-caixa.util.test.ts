import test from 'node:test';
import assert from 'node:assert/strict';

import { encerrarDiasAnteriores } from './logistica-fechamento-caixa.util';

/**
 * F0 (27/07) — "FECHAMENTO DE CAIXA": rota/entrega de dia passado que ninguém
 * encerrou se fecha SOZINHA, lazy, no início de prepare/start/materializeForRoute.
 *
 * Caso obrigatório (item F.4 do contrato desta frente): fechamento de dia
 * anterior CANCELA a pendurada, LIBERA a chave, NÃO MEXE em `proximaData` (o
 * cursor só anda no desfecho — ver avancarPlanoNoDesfecho) e GRAVA
 * CANCELADA_FECHAMENTO no extrato.
 *
 * TRIPWIRE deliberado: `tx.logisticaPlanoEntrega` NÃO é mockado. Se
 * `encerrarDiasAnteriores` algum dia tocar o plano, o teste quebra com
 * "Cannot read properties of undefined" — a prova mais forte possível de
 * "NÃO mexe no plano".
 */

const HOJE = '2026-07-27'; // segunda — mesma data do plano-mestre PR27072026
const SEXTA_ANTERIOR = '2026-07-24';

function saoPauloMidnight(dayISO: string): Date {
  return new Date(`${dayISO}T00:00:00-03:00`);
}

type RouteRow = { id: string; companyId: number; routeDate: string; status: string; operationalEndedAt: Date | null };
type EntregaRow = {
  id: string;
  companyId: number;
  customerProfileId: string;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  comprovanteConfirmadoAt: Date | null;
  comprovantesCount: number;
  agendaOcorrenciaKey: string | null;
  rotaModeloId: string | null;
  cobrancaStatus: string | null;
  stop?: { route: { status: string; operationalEndedAt: Date | null; routeDate: string } | null } | null;
};

function buildHarness(routes: RouteRow[], entregas: EntregaRow[]) {
  const routeStore = new Map(routes.map((r) => [r.id, { ...r }]));
  const entregaStore = new Map(entregas.map((e) => [e.id, { ...e }]));
  const eventos: any[] = [];

  function matchesPresa(row: EntregaRow, where: any): boolean {
    if (row.companyId !== where.companyId) return false;
    if (row.status !== 'agendada') return false;
    if (!row.scheduledAt || row.scheduledAt.getTime() >= new Date(where.scheduledAt.lt).getTime()) return false;
    if (row.startedAt != null) return false;
    if (row.comprovanteConfirmadoAt != null) return false;
    if ((row.comprovantesCount ?? 0) > 0) return false;
    if (!row.agendaOcorrenciaKey && !row.rotaModeloId) return false;
    if (!(row.cobrancaStatus === 'pendente' || row.cobrancaStatus == null)) return false;
    if (row.stop) {
      const rt = row.stop.route;
      const morta =
        !rt ||
        rt.operationalEndedAt != null ||
        ['COMPLETED', 'FAILED', 'REFUNDING'].includes(rt.status) ||
        (rt.routeDate != null && rt.routeDate < HOJE);
      if (!morta) return false;
    }
    return true;
  }

  const tx: any = {
    logisticaRoute: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of routeStore.values()) {
          if (row.companyId !== where.companyId) continue;
          if (row.routeDate >= where.routeDate.lt) continue;
          if (row.operationalEndedAt != null) continue;
          if (!where.status.in.includes(row.status)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    entrega: {
      findMany: async ({ where }: any) =>
        [...entregaStore.values()]
          .filter((row) => matchesPresa(row, where))
          .map((row) => ({ id: row.id, customerProfileId: row.customerProfileId, scheduledAt: row.scheduledAt })),
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of entregaStore.values()) {
          if (row.companyId !== where.companyId) continue;
          if (!where.id.in.includes(row.id)) continue;
          if (row.status !== 'agendada') continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
  };

  // Evento vai pro prisma RAIZ (pós-commit) — o tx NÃO tem logisticaAgendaEvento
  // de propósito: se o fechamento voltar a gravar pela tx, o teste quebra.
  const prisma: any = {
    $transaction: async (cb: (tx: any) => Promise<any>) => cb(tx),
    logisticaAgendaEvento: {
      create: async ({ data }: any) => {
        eventos.push(data);
        return { id: `ev-${eventos.length}` };
      },
    },
  };
  return { prisma, routeStore, entregaStore, eventos };
}

test('encerrarDiasAnteriores: fecha a rota de dia passado e devolve a pendurada, SEM mexer no plano', async () => {
  const h = buildHarness(
    [{ id: 'rota-sexta', companyId: 7, routeDate: SEXTA_ANTERIOR, status: 'ACTIVE', operationalEndedAt: null }],
    [
      {
        id: 'entrega-presa',
        companyId: 7,
        customerProfileId: 'cliente-1',
        status: 'agendada',
        scheduledAt: new Date(`${SEXTA_ANTERIOR}T09:00:00-03:00`),
        startedAt: null,
        comprovanteConfirmadoAt: null,
        comprovantesCount: 0,
        agendaOcorrenciaKey: `agenda:plano-1:${SEXTA_ANTERIOR}`,
        rotaModeloId: null,
        cobrancaStatus: 'pendente',
      },
    ],
  );

  const resumo = await encerrarDiasAnteriores(h.prisma, 7, HOJE);

  assert.equal(resumo.rotasEncerradas, 1);
  const rota = h.routeStore.get('rota-sexta')!;
  assert.ok(rota.operationalEndedAt instanceof Date, 'rota marcada como encerrada operacionalmente');
  assert.equal(rota.status, 'ACTIVE', 'status comercial NUNCA muda — só o campo operacional decoupled');

  assert.equal(resumo.entregasCanceladas, 1);
  const entrega = h.entregaStore.get('entrega-presa')!;
  assert.equal(entrega.status, 'cancelada');
  assert.equal(entrega.agendaOcorrenciaKey, null, 'chave solta — generateDay pode gerar a próxima');

  assert.equal(h.eventos.length, 1, 'grava CANCELADA_FECHAMENTO no extrato');
  assert.equal(h.eventos[0].tipo, 'CANCELADA_FECHAMENTO');
  assert.equal(h.eventos[0].origem, 'fechamento');
  assert.equal(h.eventos[0].customerProfileId, 'cliente-1');
  assert.equal(h.eventos[0].entregaId, 'entrega-presa');
  assert.equal(h.eventos[0].paraTexto, '24/07');
});

test('encerrarDiasAnteriores: entrega já iniciada (saiu pra rua) NÃO é cancelada — critério de segurança do descartarMontagem', async () => {
  const h = buildHarness(
    [],
    [
      {
        id: 'entrega-em-rua',
        companyId: 7,
        customerProfileId: 'cliente-2',
        status: 'agendada',
        scheduledAt: new Date(`${SEXTA_ANTERIOR}T09:00:00-03:00`),
        startedAt: new Date(`${SEXTA_ANTERIOR}T09:05:00-03:00`),
        comprovanteConfirmadoAt: null,
        comprovantesCount: 0,
        agendaOcorrenciaKey: `agenda:plano-2:${SEXTA_ANTERIOR}`,
        rotaModeloId: null,
        cobrancaStatus: 'pendente',
      },
    ],
  );

  const resumo = await encerrarDiasAnteriores(h.prisma, 7, HOJE);

  assert.equal(resumo.entregasCanceladas, 0);
  assert.equal(h.entregaStore.get('entrega-em-rua')!.status, 'agendada', 'já começada — intocada');
  assert.equal(h.eventos.length, 0);
});

test('encerrarDiasAnteriores: idempotente — 2ª chamada não acha mais nada, sem erro', async () => {
  const h = buildHarness(
    [{ id: 'rota-sexta', companyId: 7, routeDate: SEXTA_ANTERIOR, status: 'ACTIVE', operationalEndedAt: null }],
    [
      {
        id: 'entrega-presa',
        companyId: 7,
        customerProfileId: 'cliente-1',
        status: 'agendada',
        scheduledAt: new Date(`${SEXTA_ANTERIOR}T09:00:00-03:00`),
        startedAt: null,
        comprovanteConfirmadoAt: null,
        comprovantesCount: 0,
        agendaOcorrenciaKey: `agenda:plano-1:${SEXTA_ANTERIOR}`,
        rotaModeloId: null,
        cobrancaStatus: 'pendente',
      },
    ],
  );

  await encerrarDiasAnteriores(h.prisma, 7, HOJE);
  const segunda = await encerrarDiasAnteriores(h.prisma, 7, HOJE);

  assert.deepEqual(segunda, { rotasEncerradas: 0, entregasCanceladas: 0 });
});
