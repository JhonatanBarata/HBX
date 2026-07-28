import assert from 'node:assert/strict';
import test from 'node:test';

import { LogisticaTrackingPublicService } from './logistica-tracking-public.service';
import { signDeliveryTrackingToken, verifyDeliveryTrackingToken } from './logistica-tracking-public.util';

// ============================================================================
// F3 FULL-POLIDO — prova o gate FULL + token opaco do link "acompanhe sua
// entrega" (endpoint público) e o resolver de link (endpoint admin):
//   1. sem segredo configurado → sempre null (fail-closed técnico);
//   2. token inválido/adulterado → null (controller responde 404 genérico);
//   3. entrega existe mas nível < FULL → status estático, `live` é null;
//   4. nível FULL + rota TRACKED ACTIVE + sessão ACTIVE → `live` preenchido;
//   5. rota ATIVA em andamento continua visível mesmo com downgrade (nível
//      lido no MOMENTO da consulta — não há cache do nível em que a rota nasceu);
//   6. getShareLink/listShareLinksForRoute são company-scoped.
// ============================================================================

const SECRET = 'test-secret-para-o-link-publico-32b';
const ENV_KEY = 'HBX_LOGISTICA_TRACKING_LINK_SECRET';

// `fn` é async e alguns métodos do service só leem a env DEPOIS do primeiro
// `await` interno (ex.: getShareLink lê a secret depois do `findFirst`) — o
// `finally` PRECISA esperar `fn()` terminar de verdade (await), senão a env é
// restaurada cedo demais (ainda dentro do mesmo microtask do `try`) e qualquer
// leitura pós-await do corpo do teste vê o valor errado. Bug já pego 1x aqui:
// sem o `await fn()`, getShareLink/listShareLinksForRoute falhavam mesmo com
// segredo "configurado" porque a leitura real acontecia depois do reset.
async function withSecret<T>(fn: () => Promise<T> | T): Promise<T> {
  const previous = process.env[ENV_KEY];
  process.env[ENV_KEY] = SECRET;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  }
}

async function withoutSecret<T>(fn: () => Promise<T> | T): Promise<T> {
  const previous = process.env[ENV_KEY];
  delete process.env[ENV_KEY];
  try {
    return await fn();
  } finally {
    if (previous !== undefined) process.env[ENV_KEY] = previous;
  }
}

function buildConfig(nivel: 'BASIC' | 'ADVANCED' | 'FULL') {
  return { getNivel: async (_companyId: number) => ({ nivel }) } as any;
}

function buildPrisma(opts: { entrega?: any | null; routeStops?: any[] }) {
  return {
    entrega: {
      findFirst: async (args: any) => {
        const entrega = opts.entrega;
        if (!entrega) return null;
        if (args.where.id !== entrega.id) return null;
        if (args.where.companyId != null && args.where.companyId !== entrega.companyId) return null;
        return entrega;
      },
    },
    logisticaRouteStop: {
      findMany: async (args: any) => {
        const w = args?.where || {};
        return (opts.routeStops || []).filter((s) => s.companyId === w.companyId && s.routeId === w.routeId);
      },
    },
  } as any;
}

const BASE_ENTREGA = {
  id: 'ckentregaid0123456789ab',
  companyId: 7,
  status: 'em_rota',
  scheduledAt: new Date('2026-07-27T10:00:00.000Z'),
  deliveredAt: null,
  etaAt: new Date('2026-07-27T12:08:00.000Z'),
  avisoChegandoAt: null,
  customerProfile: { name: 'Maria da Silva' },
  company: { name: 'Água Boa LTDA' },
  logisticaRouteStop: null as any,
};

// ── fail-closed sem segredo ──────────────────────────────────────────────────
test('getStatusByToken: sem segredo configurado = null mesmo com entrega existente', async () => {
  await withoutSecret(async () => {
    const prisma = buildPrisma({ entrega: BASE_ENTREGA });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const token = 'qualquer.coisa';
    assert.equal(await service.getStatusByToken(token), null);
  });
});

test('getShareLink: sem segredo configurado = null (fail-closed)', async () => {
  await withoutSecret(async () => {
    const prisma = buildPrisma({ entrega: BASE_ENTREGA });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    assert.equal(await service.getShareLink(7, BASE_ENTREGA.id), null);
  });
});

// ── token inválido ────────────────────────────────────────────────────────────
test('getStatusByToken: token adulterado = null (não vaza qual foi)', async () => {
  await withSecret(async () => {
    const prisma = buildPrisma({ entrega: BASE_ENTREGA });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const token = signDeliveryTrackingToken(BASE_ENTREGA.id, SECRET) as string;
    const adulterado = token.slice(0, -2) + 'zz';
    assert.equal(await service.getStatusByToken(adulterado), null);
  });
});

test('getStatusByToken: token válido mas entrega não existe mais = null', async () => {
  await withSecret(async () => {
    const prisma = buildPrisma({ entrega: null });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const token = signDeliveryTrackingToken('ckoutraentregainexistente', SECRET) as string;
    assert.equal(await service.getStatusByToken(token), null);
  });
});

// ── gate de nível ─────────────────────────────────────────────────────────────
test('getStatusByToken: nível ADVANCED (< FULL) = status estático, live null, full=false', async () => {
  await withSecret(async () => {
    const entrega = {
      ...BASE_ENTREGA,
      logisticaRouteStop: {
        route: {
          mode: 'TRACKED',
          status: 'ACTIVE',
          trackingSession: { status: 'ACTIVE', lastPointAt: new Date() },
          stops: [{ delivery: { status: 'entregue' } }, { delivery: { status: 'em_rota' } }],
        },
      },
    };
    const prisma = buildPrisma({ entrega });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('ADVANCED'));
    const token = signDeliveryTrackingToken(entrega.id, SECRET) as string;
    const res = await service.getStatusByToken(token);
    assert.ok(res);
    assert.equal(res?.full, false);
    assert.equal(res?.live, null, 'ao vivo é exclusivo do nível FULL, mesmo com rota TRACKED ACTIVE de verdade');
    assert.equal(res?.empresaNome, 'Água Boa LTDA');
    assert.equal(res?.clienteNome, 'Maria');
  });
});

test('getStatusByToken: nível FULL + rota TRACKED ACTIVE + sessão ACTIVE = live preenchido', async () => {
  await withSecret(async () => {
    const now = new Date();
    const lastPointAt = new Date(now.getTime() - 20_000); // 20s atrás
    const entrega = {
      ...BASE_ENTREGA,
      etaAt: new Date(now.getTime() + 8 * 60_000),
      logisticaRouteStop: {
        route: {
          mode: 'TRACKED',
          status: 'ACTIVE',
          trackingSession: { status: 'ACTIVE', lastPointAt },
          stops: [
            { delivery: { status: 'entregue' } },
            { delivery: { status: 'entregue' } },
            { delivery: { status: 'em_rota' } },
            { delivery: { status: 'agendada' } },
          ],
        },
      },
    };
    const prisma = buildPrisma({ entrega });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const token = signDeliveryTrackingToken(entrega.id, SECRET) as string;
    const res = await service.getStatusByToken(token);
    assert.ok(res);
    assert.equal(res?.full, true);
    assert.ok(res?.live, 'live deveria vir preenchido');
    assert.equal(res?.live?.etaLabel, '8 min');
    assert.deepEqual(res?.live?.progresso, { concluidas: 2, total: 4 });
    assert.ok((res?.live?.atualizadoHaSegundos ?? -1) >= 19 && (res?.live?.atualizadoHaSegundos ?? -1) <= 21);
  });
});

test('getStatusByToken: nível FULL mas rota ainda não é TRACKED/ACTIVE = live null (estático)', async () => {
  await withSecret(async () => {
    const entrega = {
      ...BASE_ENTREGA,
      status: 'agendada',
      logisticaRouteStop: {
        route: { mode: 'ESSENTIAL', status: 'ACTIVE', trackingSession: null, stops: [] },
      },
    };
    const prisma = buildPrisma({ entrega });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const token = signDeliveryTrackingToken(entrega.id, SECRET) as string;
    const res = await service.getStatusByToken(token);
    assert.equal(res?.live, null);
    assert.equal(res?.status, 'A_CAMINHO', 'agendada dentro de rota ACTIVE conta como a caminho');
  });
});

// ── mapeamento de status (integração com o service, não só a função pura) ────
test('getStatusByToken: entrega sem nenhuma rota = AGENDADA (na fila)', async () => {
  await withSecret(async () => {
    const entrega = { ...BASE_ENTREGA, status: 'agendada', logisticaRouteStop: null };
    const prisma = buildPrisma({ entrega });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const token = signDeliveryTrackingToken(entrega.id, SECRET) as string;
    const res = await service.getStatusByToken(token);
    assert.equal(res?.status, 'AGENDADA');
  });
});

test('getStatusByToken: entregue = ENTREGUE mesmo com rota TRACKED ainda ACTIVE', async () => {
  await withSecret(async () => {
    const entrega = {
      ...BASE_ENTREGA,
      status: 'entregue',
      deliveredAt: new Date('2026-07-27T12:10:00.000Z'),
      logisticaRouteStop: {
        route: { mode: 'TRACKED', status: 'ACTIVE', trackingSession: { status: 'ACTIVE', lastPointAt: new Date() }, stops: [] },
      },
    };
    const prisma = buildPrisma({ entrega });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const token = signDeliveryTrackingToken(entrega.id, SECRET) as string;
    const res = await service.getStatusByToken(token);
    assert.equal(res?.status, 'ENTREGUE');
    assert.equal(res?.entregueEm, '2026-07-27T12:10:00.000Z');
  });
});

// ── admin: getShareLink / listShareLinksForRoute são company-scoped ─────────
test('getShareLink: entrega de OUTRA empresa = null (nunca gera link fora do escopo)', async () => {
  await withSecret(async () => {
    const prisma = buildPrisma({ entrega: BASE_ENTREGA }); // companyId 7
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    assert.equal(await service.getShareLink(999, BASE_ENTREGA.id), null);
  });
});

test('getShareLink: entrega da própria empresa = token válido round-trips pro deliveryId', async () => {
  await withSecret(async () => {
    const prisma = buildPrisma({ entrega: BASE_ENTREGA });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const link = await service.getShareLink(7, BASE_ENTREGA.id);
    assert.ok(link);
    assert.equal(verifyDeliveryTrackingToken(link!.token, SECRET), BASE_ENTREGA.id);
    assert.ok(link!.url.endsWith(`/acompanhar/${link!.token}`));
  });
});

test('listShareLinksForRoute: só devolve as paradas da rota pedida, desta empresa', async () => {
  await withSecret(async () => {
    // IDs no formato cuid de verdade (alfanumérico, sem hífen) — o token
    // assinado recusa deliveryId fora desse formato (ver DELIVERY_ID_RE no
    // util), então um fixture com hífen faria buildShareLink devolver null
    // silenciosamente e a lista sair vazia (bug já pego 1x aqui).
    const routeStops = [
      {
        companyId: 7,
        routeId: 'route-A',
        delivery: { id: 'ckdelivery1aaaaaaaaaaaaa', status: 'entregue', customerProfile: { name: 'Cliente Um' } },
      },
      {
        companyId: 7,
        routeId: 'route-A',
        delivery: { id: 'ckdelivery2bbbbbbbbbbbbb', status: 'agendada', customerProfile: { name: 'Cliente Dois' } },
      },
      {
        companyId: 7,
        routeId: 'route-B', // outra rota — não deve aparecer
        delivery: { id: 'ckdelivery3ccccccccccccc', status: 'agendada', customerProfile: { name: 'Cliente Três' } },
      },
    ];
    const prisma = buildPrisma({ routeStops });
    const service = new LogisticaTrackingPublicService(prisma, buildConfig('FULL'));
    const links = await service.listShareLinksForRoute(7, 'route-A');
    assert.equal(links.length, 2);
    assert.deepEqual(
      links.map((l) => l.deliveryId).sort(),
      ['ckdelivery1aaaaaaaaaaaaa', 'ckdelivery2bbbbbbbbbbbbb'],
    );
    assert.ok(links.every((l) => verifyDeliveryTrackingToken(l.token, SECRET)));
  });
});
