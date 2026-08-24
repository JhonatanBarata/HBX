import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRotaContinuidadeService } from './logistica-rota-continuidade.service';
import { LogisticaRotaService } from './logistica-rota.service';
import { LogisticaTrackingService } from './logistica-tracking.service';
import { canonicalRouteDate } from './logistica-route-billing.util';

/**
 * 🔴 A SESSÃO DE GPS RENASCIA MORTA — A CENA INTEIRA (16/08, LOTE 1.6).
 *
 * Os dois testes de unidade deste lote (um no cancelar, outro no tracking)
 * provam cada metade da cura sozinha. Este arquivo prova a CENA que o motorista
 * vive, com os TRÊS serviços de verdade em cima de UM banco em memória:
 *
 *   1. manhã cumprida (as 2 paradas entregues) e NINGUÉM tocou "Encerrar" —
 *      a `LogisticaRoute` segue ACTIVE, `operationalEndedAt` NULO, e a
 *      `LogisticaTrackingSession` dela segue ACTIVE;
 *   2. o rascunho da tarde (encaixe com `rotaOrdem`, sem stop) é CANCELADO —
 *      o ramo `draft:` fecha a sessão órfã (cura do lote 1.5);
 *   3. o motorista abre a Montagem, encaixa outra entrega e toca INICIAR.
 *
 * ANTES desta cura o passo 3 saía VERDE mentindo: `claimLogisticaRoute`
 * reaproveitava a MESMA `LogisticaRoute` (ACTIVE, sem carimbo) e
 * `ensureSessionForStartedRoute` devolvia a sessão ENDED sem olhar o status —
 * então a rota da tarde nascia com rastreamento MORTO. Todo ponto de GPS
 * voltava `SESSION_ENDED`, código que não tem UMA linha de tratamento no app:
 * o motorista dirige a tarde inteira sem trilha nenhuma, num recurso que a
 * empresa PAGA.
 *
 * O que este teste mede no fim é o que o APP lê (`getOperationalRouteMetadata`):
 * `trackingStatus === 'ACTIVE'`. Nada de olhar variável interna.
 */

const EMPRESA = 7;
const MOTORISTA = 9;
const HOJE = canonicalRouteDate();
const AS_12H = new Date(`${HOJE}T15:00:00.000Z`); // meio-dia em São Paulo

type Rota = {
  id: string; companyId: number; entregadorId: number; routeDate: string;
  mode: string; status: string; startedAt: Date | null; completedAt: Date | null;
  operationalEndedAt: Date | null; createdAt: Date;
};
type Stop = { id: string; companyId: number; routeId: string; deliveryId: string; snapshotOrder: number; billingExempt: boolean };
type Sessao = {
  id: string; companyId: number; routeId: string; entregadorId: number;
  status: string; startedAt: Date; endedAt: Date | null; deviceId: string | null; hasValidPositions: boolean;
};
type Entrega = {
  id: string; companyId: number; entregadorId: number; status: string;
  rotaOrdem: number | null; etaAt: Date | null; scheduledAt: Date; startedAt: Date | null;
  arrivedAt: Date | null; createdAt: Date;
  local: null; customerProfile: { name: string; lat: number; lng: number; status: string };
};

const ABERTOS = ['agendada', 'em_rota'];
const aberta = (status: string) => ABERTOS.includes(String(status));

/** O "Postgres mínimo": ele EXPLODE no `where` que não entende, em vez de
 *  devolver tudo. Dublê permissivo é como um filtro novo entra calado e a
 *  bancada certifica o contrário do que o banco faria (lei do lote 1.4). */
function bancada() {
  const rotas: Rota[] = [];
  const stops: Stop[] = [];
  const sessoes: Sessao[] = [];
  const entregas: Entrega[] = [];
  let seqRota = 0;
  let seqStop = 0;
  let seqSessao = 0;

  const stopsDaRota = (routeId: string) => stops.filter((s) => s.routeId === routeId);
  const entregaPorId = (id: string) => entregas.find((e) => e.id === id) || null;

  const rotaCasa = (rota: Rota, where: any): boolean => Object.keys(where || {}).every((chave) => {
    const valor = where[chave];
    if (chave === 'companyId') return rota.companyId === valor;
    if (chave === 'entregadorId') return rota.entregadorId === valor;
    if (chave === 'routeDate') return rota.routeDate === valor;
    if (chave === 'mode') return rota.mode === valor;
    if (chave === 'id') return Array.isArray(valor?.in) ? valor.in.includes(rota.id) : rota.id === valor;
    if (chave === 'status') return Array.isArray(valor?.in) ? valor.in.includes(rota.status) : rota.status === valor;
    if (chave === 'operationalEndedAt') {
      if (valor === null) return rota.operationalEndedAt === null;
      if (valor && 'not' in valor && valor.not === null) return rota.operationalEndedAt !== null;
      throw new Error(`dublê: filtro de operationalEndedAt não entendido: ${JSON.stringify(valor)}`);
    }
    if (chave === 'stops') {
      const none = valor?.none;
      if (!none) throw new Error('dublê: só entendo `stops: { none: ... }`');
      const lista = none?.delivery?.status?.in;
      if (!Array.isArray(lista)) throw new Error('dublê: `stops.none` sem lista de status');
      return !stopsDaRota(rota.id).some((s) => {
        const e = entregaPorId(s.deliveryId);
        return !!e && lista.includes(e.status);
      });
    }
    if (chave === 'OR') {
      if (!Array.isArray(valor) || !valor.length) throw new Error('dublê: OR precisa de ramos');
      return valor.some((ramo: any) => rotaCasa(rota, ramo));
    }
    throw new Error(`dublê: campo desconhecido no where da rota: ${chave}`);
  });

  const vestirRota = (rota: Rota, select: any) => {
    const saida: any = {};
    const campos = Object.keys(select || {});
    if (!campos.length) return { ...rota };
    campos.forEach((campo) => {
      if (campo === 'trackingSession') {
        const s = sessoes.find((x) => x.routeId === rota.id) || null;
        saida.trackingSession = s ? { id: s.id, status: s.status } : null;
        return;
      }
      saida[campo] = (rota as any)[campo];
    });
    return saida;
  };

  const prisma: any = {
    logisticaConfig: {
      findUnique: async (args: any) => {
        const campos = Object.keys(args?.select || {});
        if (campos.includes('velocidadeMediaKmH')) return { velocidadeMediaKmH: 25, tempoParadaMin: 5 };
        // 24/08/2026 — rastreio hard-on: as colunas de gate morreram; a config
        // devolvida aqui é a linha "limpa" pós-drop (nada de trackingAtivo).
        return {};
      },
    },
    logisticaRoute: {
      findFirst: async (args: any) => {
        const achadas = rotas.filter((r) => rotaCasa(r, args?.where || {}));
        achadas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const alvo = achadas[0];
        return alvo ? vestirRota(alvo, args?.select) : null;
      },
      findMany: async (args: any) => rotas
        .filter((r) => rotaCasa(r, args?.where || {}))
        .map((r) => vestirRota(r, args?.select)),
      updateMany: async (args: any) => {
        let count = 0;
        rotas.forEach((r) => {
          if (!rotaCasa(r, args?.where || {})) return;
          Object.assign(r, args.data);
          count += 1;
        });
        return { count };
      },
      create: async (args: any) => {
        const row: Rota = {
          id: `route-${++seqRota}`, startedAt: null, completedAt: null,
          operationalEndedAt: null, createdAt: new Date(), ...args.data,
        };
        rotas.push(row);
        return { ...row };
      },
    },
    logisticaTrackingSession: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        const row = sessoes.find((s) => (where.companyId == null || s.companyId === where.companyId)
          && (!where.id || s.id === where.id)
          && (!where.routeId || s.routeId === where.routeId));
        return row ? { ...row } : null;
      },
      create: async (args: any) => {
        // @@unique([routeId, companyId]) — UMA sessão por rota, sempre.
        if (sessoes.some((s) => s.routeId === args.data.routeId && s.companyId === args.data.companyId)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row: Sessao = {
          id: `session-${++seqSessao}`, endedAt: null, deviceId: null, hasValidPositions: false, ...args.data,
        };
        sessoes.push(row);
        return { ...row };
      },
      updateMany: async (args: any) => {
        const where = args?.where || {};
        const lista = Array.isArray(where.routeId?.in) ? where.routeId.in : [where.routeId];
        let count = 0;
        sessoes.forEach((s) => {
          if (where.companyId != null && s.companyId !== where.companyId) return;
          if (where.routeId !== undefined && !lista.includes(s.routeId)) return;
          if (where.status && s.status !== where.status) return;
          Object.assign(s, args.data);
          count += 1;
        });
        return { count };
      },
    },
    logisticaRouteStop: {
      findMany: async (args: any) => {
        const ids = args?.where?.deliveryId?.in || [];
        return stops.filter((s) => ids.includes(s.deliveryId)).map((s) => ({ ...s }));
      },
      aggregate: async (args: any) => ({
        _max: {
          snapshotOrder: Math.max(-1, ...stopsDaRota(args.where.routeId).map((s) => s.snapshotOrder)),
        },
      }),
      create: async (args: any) => {
        const row: Stop = { id: `stop-${++seqStop}`, billingExempt: false, ...args.data };
        stops.push(row);
        return { ...row };
      },
      count: async (args: any) => stops.filter((s) => s.routeId === args.where.routeId
        && (!args.where.deliveryId?.in || args.where.deliveryId.in.includes(s.deliveryId))).length,
      updateMany: async (args: any) => {
        let count = 0;
        stops.forEach((s) => {
          if (args.where.deliveryId && s.deliveryId !== args.where.deliveryId) return;
          if (args.where.routeId && s.routeId !== args.where.routeId) return;
          Object.assign(s, args.data);
          count += 1;
        });
        return { count };
      },
    },
    entrega: {
      findMany: async (args: any) => {
        const where = args?.where || {};
        // O `resolve` do ramo `draft:` (continuidade) é o único que manda `AND`.
        const doDraft = Array.isArray(where.AND);
        return entregas
          .filter((e) => e.companyId === where.companyId)
          .filter((e) => !where.entregadorId || e.entregadorId === where.entregadorId)
          .filter((e) => aberta(e.status))
          .filter((e) => {
            if (!doDraft) return true;
            // rascunho = tem ordem/começo E não está presa em stop de rota viva
            const temMarca = e.rotaOrdem !== null || e.startedAt !== null;
            const stop = stops.find((s) => s.deliveryId === e.id);
            const rota = stop ? rotas.find((r) => r.id === stop.routeId) : null;
            const solta = !stop || (!!rota && rota.operationalEndedAt !== null);
            return temMarca && solta;
          })
          .sort((a, b) => (a.rotaOrdem ?? 999) - (b.rotaOrdem ?? 999))
          .map((e) => ({ ...e, entregador: { name: 'André' } }));
      },
      aggregate: async (args: any) => {
        const fechadas = entregas.filter((e) => e.companyId === args.where.companyId
          && (!args.where.entregadorId || e.entregadorId === args.where.entregadorId)
          && !aberta(e.status));
        const ordens = fechadas.map((e) => e.rotaOrdem).filter((n): n is number => typeof n === 'number');
        return { _max: { rotaOrdem: ordens.length ? Math.max(...ordens) : null } };
      },
      updateMany: async (args: any) => {
        const where = args?.where || {};
        let count = 0;
        entregas.forEach((e) => {
          if (where.companyId != null && e.companyId !== where.companyId) return;
          if (where.id && e.id !== where.id) return;
          if (where.entregadorId != null && e.entregadorId !== where.entregadorId) return;
          if (where.status?.in && !where.status.in.includes(e.status)) return;
          Object.assign(e, args.data);
          count += 1;
        });
        return { count };
      },
    },
    $executeRawUnsafe: async () => 1,
    $transaction: async (cb: any) => cb(prisma),
  };

  return { prisma, rotas, stops, sessoes, entregas, seed: { seqRota } };
}

function cliente(nome: string, lat: number, lng: number) {
  return { name: nome, lat, lng, status: 'active' };
}

test('LOTE 1.6 · CENA INTEIRA: manhã cumprida sem Encerrar → cancelam o rascunho da tarde → Iniciar de novo nasce com rota E sessão NOVAS e ACTIVE', async () => {
  // 24/08/2026 — a env HBX_LOGISTICA_TRACKING_ENABLED morreu (hard-on): o
  // teste roda SEM setá-la, e é prova de que nada mais depende dela.
  const antes = process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
  try {
    const b = bancada();

    // ── 1. A MANHÃ CUMPRIDA, SEM "ENCERRAR" ────────────────────────────────
    const rotaDaManha: Rota = {
      id: 'route-manha', companyId: EMPRESA, entregadorId: MOTORISTA, routeDate: HOJE,
      mode: 'TRACKED', status: 'ACTIVE', startedAt: new Date(Date.now() - 3 * 3600_000),
      completedAt: null, operationalEndedAt: null,
      // relógio de PARENTESCO: a rota da manhã tem que ser mais VELHA que a que
      // o Iniciar vai criar agora — é por `createdAt desc` que o app pergunta
      // qual é a rota do dia (`getOperationalRouteMetadata`).
      createdAt: new Date(Date.now() - 4 * 3600_000),
    };
    b.rotas.push(rotaDaManha);
    ['m1', 'm2'].forEach((id, i) => {
      b.entregas.push({
        id, companyId: EMPRESA, entregadorId: MOTORISTA, status: 'entregue', rotaOrdem: i,
        etaAt: null, scheduledAt: AS_12H, startedAt: null, arrivedAt: AS_12H, createdAt: AS_12H,
        local: null, customerProfile: cliente(`Manhã ${i}`, -22.40 - i / 100, -47.55 - i / 100),
      });
      b.stops.push({ id: `stop-m${i}`, companyId: EMPRESA, routeId: 'route-manha', deliveryId: id, snapshotOrder: i, billingExempt: false });
    });
    b.sessoes.push({
      id: 'session-manha', companyId: EMPRESA, routeId: 'route-manha', entregadorId: MOTORISTA,
      status: 'ACTIVE', startedAt: rotaDaManha.startedAt as Date, endedAt: null, deviceId: 'device-1', hasValidPositions: true,
    });
    // O encaixe da tarde: ordem gravada pelo `planejar`, sem stop (stop só nasce
    // no Iniciar) — é ele que forma o rascunho `draft:` do dia.
    b.entregas.push({
      id: 'tarde-1', companyId: EMPRESA, entregadorId: MOTORISTA, status: 'agendada', rotaOrdem: 2,
      etaAt: null, scheduledAt: AS_12H, startedAt: null, arrivedAt: null, createdAt: AS_12H,
      local: null, customerProfile: cliente('Tarde 1', -22.42, -47.57),
    });

    // ── 2. CANCELAR O RASCUNHO DA TARDE (ramo `draft:`) ────────────────────
    const rotaServiceParaCancelar: any = {
      limparDia: async (_companyId: number, input: any) => {
        input.deliveryIds.forEach((id: string) => {
          const e = b.entregas.find((x) => x.id === id);
          if (e) Object.assign(e, { status: 'cancelada', rotaOrdem: null, etaAt: null, startedAt: null });
        });
        return { ok: true, resumo: { canceladas: input.deliveryIds.length } };
      },
    };
    const continuidade = new LogisticaRotaContinuidadeService(
      b.prisma, {} as any, rotaServiceParaCancelar, {} as any,
      { assertCapacidade: async () => undefined } as any,
    );
    const motorista = { id: MOTORISTA, companyId: EMPRESA, role: 'DRIVER' };
    const cancelado = await continuidade.cancelar(motorista as any, `draft:${MOTORISTA}:${HOJE}`);
    assert.equal(cancelado.resumo.canceladas, 1, 'o rascunho da tarde foi cancelado de verdade');
    assert.equal(
      b.sessoes.find((s) => s.routeId === 'route-manha')?.status, 'ENDED',
      'a sessão órfã da manhã fecha (cura do lote 1.5, intocada)',
    );
    assert.ok(
      rotaDaManha.operationalEndedAt instanceof Date,
      'LOTE 1.6: a rota da manhã fica CARIMBADA — sem isso o próximo Iniciar reaproveita esta MESMA linha e herda a sessão ENDED',
    );

    // ── 3. MONTAGEM + INICIAR DE NOVO ─────────────────────────────────────
    b.entregas.push({
      id: 'tarde-2', companyId: EMPRESA, entregadorId: MOTORISTA, status: 'agendada', rotaOrdem: null,
      etaAt: null, scheduledAt: AS_12H, startedAt: null, arrivedAt: null, createdAt: AS_12H,
      local: null, customerProfile: cliente('Tarde 2', -22.43, -47.58),
    });
    const tracking = new LogisticaTrackingService(b.prisma, {} as any);
    const cobranca: any = {
      garantirDiaPago: async () => undefined,
      assertAssentoDoDia: async () => undefined,
      garantirPasseDoDia: async () => undefined,
    };
    const rota = new LogisticaRotaService(b.prisma, cobranca, tracking);

    const resultado = await rota.iniciarRota(EMPRESA, { date: HOJE }, MOTORISTA);

    const rotaNova = b.rotas.find((r) => r.id !== 'route-manha');
    assert.ok(rotaNova, 'o Iniciar tem que NASCER numa linha nova — reaproveitar a da manhã é o defeito');
    assert.equal(rotaNova?.status, 'ACTIVE');
    assert.equal(rotaNova?.operationalEndedAt, null);
    const sessaoNova = b.sessoes.find((s) => s.routeId === rotaNova?.id);
    assert.ok(sessaoNova, 'a rota nova tem sessão própria');
    assert.equal(
      sessaoNova?.status, 'ACTIVE',
      'EFEITO medido: o turno da tarde nasce RASTREANDO — sem isto todo ponto volta SESSION_ENDED e ninguém no app trata esse código',
    );
    assert.notEqual(sessaoNova?.id, 'session-manha', 'a sessão da manhã (ENDED, com aparelho e trilha da saída anterior) não é reciclada');
    assert.equal(
      b.sessoes.find((s) => s.id === 'session-manha')?.status, 'ENDED',
      'e ela continua encerrada — nada de ressuscitar sessão pra fingir que o GPS está vivo',
    );

    // O que o APP lê no fim do Iniciar (é este payload que arma o rastreamento).
    assert.equal((resultado as any).routeId, rotaNova?.id);
    assert.equal((resultado as any).trackingRequired, true);
    assert.equal(
      (resultado as any).trackingStatus, 'ACTIVE',
      'o app recebe uma sessão VIVA — este é o campo que separa "rastreando" de "rastreamento morto e calado"',
    );
    assert.equal((resultado as any).trackingSessionId, sessaoNova?.id);
  } finally {
    if (antes === undefined) delete process.env.HBX_LOGISTICA_TRACKING_ENABLED;
    else process.env.HBX_LOGISTICA_TRACKING_ENABLED = antes;
  }
});
