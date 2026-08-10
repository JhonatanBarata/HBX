import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRotaService, resolveDayRange, saoPauloMidnight } from './logistica-rota.service';

/**
 * F0 (27/07) — `descartarMontagem` continua sendo o "desfazer de quem NÃO
 * ACEITOU" (toque no chip do dia, saiu sem confirmar): devolve o plano pra
 * DATA DE ORIGEM da chave e solta a ocorrência pra poder ser gerada de novo —
 * comportamento herdado do fix 27/07 (`88c131f5`), que este teste tranca
 * contra regressão agora que o resto do módulo mudou de significado
 * (`proximaData` só anda no desfecho — ver logistica-avancar-plano-desfecho.test.ts).
 * O que NÃO muda: descarte continua sendo "volta pro lugar", nunca "avança".
 */

const DATE = '2026-07-27';
const { start: DAY_START } = resolveDayRange(DATE);

function atHour(h: number): Date {
  const d = new Date(DAY_START);
  d.setHours(h, 0, 0, 0);
  return d;
}

type EntregaRow = {
  id: string;
  companyId: number;
  entregadorId: number | null;
  status: string;
  startedAt: Date | null;
  scheduledAt: Date | null;
  customerProfileId: string;
  planoEntregaId: string | null;
  agendaOcorrenciaKey: string | null;
  rotaModeloId: string | null;
  comprovanteConfirmadoAt: Date | null;
  cobrancaStatus: string | null;
  comprovantesCount: number;
  rotaOrdem: number | null;
  etaAt: Date | null;
};

type PlanoRow = { id: string; companyId: number; proximaData: Date | null };
type RouteRow = { id: string; companyId: number; entregadorId: number; routeDate: string; status: string; operationalEndedAt: Date | null };

function seedRow(overrides: Partial<EntregaRow> & { id: string }): EntregaRow {
  return {
    companyId: 7,
    entregadorId: 42,
    status: 'agendada',
    startedAt: null,
    scheduledAt: atHour(9),
    customerProfileId: 'cliente-1',
    planoEntregaId: null,
    agendaOcorrenciaKey: null,
    rotaModeloId: null,
    comprovanteConfirmadoAt: null,
    cobrancaStatus: 'pendente',
    comprovantesCount: 0,
    rotaOrdem: null,
    etaAt: null,
    ...overrides,
  };
}

function buildHarness(seed: EntregaRow[], routeSeed: RouteRow[] = [], planoSeed: PlanoRow[] = []) {
  const store = new Map<string, EntregaRow>(seed.map((row) => [row.id, { ...row }]));
  const routeStore = new Map<string, RouteRow>(routeSeed.map((row) => [row.id, { ...row }]));
  const planoStore = new Map<string, PlanoRow>(planoSeed.map((row) => [row.id, { ...row }]));
  const eventos: any[] = [];

  function matchesAbertas(row: EntregaRow, where: any): boolean {
    if (row.companyId !== where.companyId) return false;
    if (where.entregadorId != null && row.entregadorId !== where.entregadorId) return false;
    if (!where.status.in.includes(row.status)) return false;
    const dentroDoDia = row.scheduledAt != null
      && row.scheduledAt.getTime() >= where.OR[0].scheduledAt.gte.getTime()
      && row.scheduledAt.getTime() <= where.OR[0].scheduledAt.lte.getTime();
    const semData = row.scheduledAt === null;
    return dentroDoDia || semData;
  }

  function buildTx() {
    return {
      entrega: {
        findMany: async ({ where }: any) =>
          [...store.values()]
            .filter((row) => matchesAbertas(row, where))
            .map((row) => ({
              id: row.id,
              status: row.status,
              startedAt: row.startedAt,
              cobrancaStatus: row.cobrancaStatus,
              customerProfileId: row.customerProfileId,
              planoEntregaId: row.planoEntregaId,
              agendaOcorrenciaKey: row.agendaOcorrenciaKey,
              rotaModeloId: row.rotaModeloId,
              comprovanteConfirmadoAt: row.comprovanteConfirmadoAt,
              logisticaRouteStop: null, // nenhuma parada congelada nas fixtures deste arquivo
              _count: { comprovantes: row.comprovantesCount },
            })),
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of store.values()) {
            if (row.companyId !== where.companyId) continue;
            /* O Prisma aceita `id: 'x'` E `id: { in: [...] }` — este dublê só
               entendia a 2ª forma e quebrava quando o carimbo da ocorrência
               (F2.1, 10/08) passou a atualizar UMA linha por vez. Dublê mais
               estreito que o de verdade reprova código legítimo. */
            const alvoId = where.id?.in ?? where.id;
            const bateId = Array.isArray(alvoId) ? alvoId.includes(row.id) : alvoId === row.id;
            if (!bateId) continue;
            const statusOk = typeof where.status === 'string'
              ? row.status === where.status
              : where.status?.in
                ? where.status.in.includes(row.status)
                : true;
            if (!statusOk) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
      logisticaPlanoEntrega: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of planoStore.values()) {
            if (where.companyId != null && row.companyId !== where.companyId) continue;
            if (where.id?.in && !where.id.in.includes(row.id)) continue;
            if (where.proximaData?.gt) {
              if (!row.proximaData) continue;
              if (row.proximaData.getTime() <= new Date(where.proximaData.gt).getTime()) continue;
            }
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
      logisticaRoute: {
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of routeStore.values()) {
            if (where.companyId != null && row.companyId !== where.companyId) continue;
            if (where.entregadorId != null && row.entregadorId !== where.entregadorId) continue;
            if (where.routeDate != null && row.routeDate !== where.routeDate) continue;
            if (where.status?.in && !where.status.in.includes(row.status)) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
    };
  }

  // Evento vai pro prisma RAIZ (pós-commit) — o tx NÃO tem logisticaAgendaEvento
  // de propósito: se o descarte voltar a gravar pela tx, o teste quebra.
  const prisma: any = {
    $transaction: async (callback: (tx: any) => Promise<any>) => callback(buildTx()),
    logisticaAgendaEvento: {
      create: async ({ data }: any) => {
        eventos.push(data);
        return { id: `ev-${eventos.length}` };
      },
    },
  };

  return { service: new LogisticaRotaService(prisma, {} as any), store, routeStore, planoStore, eventos };
}

test('descartarMontagem: devolve o plano pra DATA DE ORIGEM da ocorrência e solta a chave (comportamento herdado, sem regressão)', async () => {
  const SEXTA_ORIGEM = '2026-07-31';
  const proximaSemanaAntesDoDescarte = new Date(saoPauloMidnight(SEXTA_ORIGEM));
  proximaSemanaAntesDoDescarte.setDate(proximaSemanaAntesDoDescarte.getDate() + 7); // generateDay NÃO faz mais isso, mas simula um estado legado/importado

  const h = buildHarness(
    [
      seedRow({
        id: 'd-tocada-sem-aceitar',
        status: 'agendada',
        planoEntregaId: 'plano-1',
        customerProfileId: 'cliente-1',
        agendaOcorrenciaKey: `agenda:plano-1:${SEXTA_ORIGEM}`,
      }),
    ],
    [],
    [{ id: 'plano-1', companyId: 7, proximaData: proximaSemanaAntesDoDescarte }],
  );

  const resultado = await h.service.descartarMontagem(7, { date: DATE }, 42);

  assert.equal(resultado.resumo.descartadas, 1);
  assert.equal(resultado.resumo.planosLiberados, 1);
  assert.equal(resultado.resumo.pendentes, 0);

  const entrega = h.store.get('d-tocada-sem-aceitar')!;
  assert.equal(entrega.status, 'cancelada');
  assert.equal(entrega.agendaOcorrenciaKey, null, 'chave solta — generateDay pode gerar de novo');
  assert.equal(entrega.planoEntregaId, 'plano-1', 'vínculo histórico com o plano não some');

  const plano = h.planoStore.get('plano-1')!;
  assert.deepEqual(plano.proximaData, saoPauloMidnight(SEXTA_ORIGEM), 'volta pra ORIGEM da chave, não avança');

  assert.equal(h.eventos.length, 1, 'extrato: grava OCORRENCIA_DEVOLVIDA');
  assert.equal(h.eventos[0].tipo, 'OCORRENCIA_DEVOLVIDA');
  assert.equal(h.eventos[0].origem, 'descarte');
  assert.equal(h.eventos[0].customerProfileId, 'cliente-1');
  assert.equal(h.eventos[0].paraTexto, '31/07');
});

test('descartarMontagem: entrega avulsa (sem chave, sem rotaModeloId) só perde a ordem — nunca é descartada', async () => {
  const h = buildHarness([
    seedRow({
      id: 'd-avulsa',
      status: 'agendada',
      planoEntregaId: null,
      agendaOcorrenciaKey: null,
      rotaModeloId: null,
      rotaOrdem: 2,
    }),
  ]);

  const resultado = await h.service.descartarMontagem(7, { date: DATE }, 42);

  assert.equal(resultado.resumo.descartadas, 0);
  assert.equal(resultado.resumo.pendentes, 1);
  const entrega = h.store.get('d-avulsa')!;
  assert.equal(entrega.status, 'agendada', 'trabalho de gente não some porque a montagem foi fechada');
  assert.equal(entrega.rotaOrdem, null, 'perde só a ordem');
  assert.equal(h.eventos.length, 0);
});

test('descartarMontagem: idempotente — 2ª chamada não acha mais nada aberto com chave', async () => {
  const h = buildHarness(
    [
      seedRow({
        id: 'd1',
        status: 'agendada',
        planoEntregaId: 'plano-1',
        agendaOcorrenciaKey: `agenda:plano-1:${DATE}`,
      }),
    ],
    [],
    [{ id: 'plano-1', companyId: 7, proximaData: null }],
  );

  const primeira = await h.service.descartarMontagem(7, { date: DATE }, 42);
  assert.equal(primeira.resumo.descartadas, 1);

  const segunda = await h.service.descartarMontagem(7, { date: DATE }, 42);
  assert.equal(segunda.resumo.descartadas, 0);
  assert.equal(segunda.resumo.planosLiberados, 0);
});

// ══════════════════════════════════════════════════════════════════════════════
// 🔴 VACINA PR29072026 — bug do dono (29/07): ele indicou rota, a pessoa aceitou
// e CANCELOU; a entrega revertida continuava COLADA no motorista que desistiu.
// Ele então materializou entregas pelo desktop e o dia ficou com paradas de DOIS
// motoristas — estado que o `resolveSingleDriver` bloqueia. Medido em produção:
// ele travado, sem saber por quê. Descartar = "eu não aceitei isso": a parada
// volta pra fila SEM dono.
// ══════════════════════════════════════════════════════════════════════════════
test('descartar SOLTA o motorista da pendência (a parada volta pra fila sem dono)', async () => {
  const h = buildHarness([
    // Tem comprovante ⇒ NÃO é descartável ⇒ cai no ramo de pendência, que é
    // exatamente o ramo que segurava o motorista.
    seedRow({ id: 'd1', status: 'agendada', comprovantesCount: 1, entregadorId: 42 }),
  ]);

  const res = await h.service.descartarMontagem(7, { date: DATE }, 42);

  assert.equal(res.resumo.pendentes, 1, 'a entrega tinha que virar pendência');
  const row = h.store.get('d1') as any;
  assert.equal(row.status, 'agendada');
  assert.equal(row.entregadorId, null, 'pendência de DESCARTE não pode ficar com dono');
  assert.equal(row.rotaOrdem, null);
});

test('descartar não inventa dono novo: quem já era pendência segue sem motorista', async () => {
  const h = buildHarness([
    seedRow({ id: 'd1', status: 'em_rota', startedAt: atHour(8), entregadorId: 42 }),
  ]);

  await h.service.descartarMontagem(7, { date: DATE }, 42);

  const row = h.store.get('d1') as any;
  assert.equal(row.entregadorId, null);
  assert.equal(row.startedAt, null, 'descartar zera o startedAt junto com a ordem');
});
