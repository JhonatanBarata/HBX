import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WhatsAppConnectionProjectionService,
  ProjectionSessionView,
} from './whatsapp-connection-projection.service';

// WEBWHATS-ARQ3 Sprint 3 — testes da fonte única do estado de conexão.
//
// Estes testes cobrem o LEITOR PURO (derive/isLive) que os consumidores usam no lugar do
// `status === 'active'` cru, e o WRITER ÚNICO (stampProjection). O foco é a família de bugs
// "Conectado fantasma": sessão que ficou 'active' no banco mas cujo socket morreu NÃO pode mais
// ser lida como viva.

const NOW = new Date('2026-07-04T12:00:00.000Z').getTime();
const secsAgo = (s: number) => new Date(NOW - s * 1000);

function view(overrides: Partial<ProjectionSessionView>): ProjectionSessionView {
  return {
    status: 'active',
    connectedAt: secsAgo(3600),
    lastReconciledAt: secsAgo(10),
    motorState: 'open',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CARACTERIZAÇÃO — o comportamento LEGADO (antes desta camada) era:
//   "conectado" === (session existe && status === 'active').
// Estes testes documentam que a PROJEÇÃO mantém esse resultado quando a verdade concorda
// (active + fresco + motor open), mas DIVERGE (corrige) quando o legado mentia.
// ---------------------------------------------------------------------------

test('caracterização: active + carimbo fresco + motor open → vivo (concorda com o legado)', () => {
  const d = WhatsAppConnectionProjectionService.derive(view({}), NOW);
  assert.equal(d.live, true);
  assert.equal(d.motorState, 'open');
  assert.equal(d.stale, false);
  assert.equal(d.seenAgoSeconds, 10);
});

test('FANTASMA: active no banco mas motorState close → NÃO vivo (legado mentia "Conectado")', () => {
  // Este é o "Conectado fantasma": o socket morreu, o evento chegou e carimbou close, mas a
  // linha ainda está 'active' (a demoção de status pode ter corrido em outro caminho). A
  // projeção mata a mentira: motor close SEMPRE vence.
  const d = WhatsAppConnectionProjectionService.derive(
    view({ status: 'active', motorState: 'close', lastReconciledAt: secsAgo(5) }),
    NOW,
  );
  assert.equal(d.live, false);
  assert.equal(d.motorState, 'close');
});

test('FANTASMA: active no banco mas carimbo VELHO (> janela) → NÃO vivo', () => {
  // Nenhuma confirmação do motor há muito tempo → não afirmamos vivo (é o fantasma silencioso).
  const d = WhatsAppConnectionProjectionService.derive(
    view({ status: 'active', motorState: 'open', lastReconciledAt: secsAgo(10_000) }),
    NOW,
  );
  assert.equal(d.live, false);
  assert.equal(d.stale, true);
  assert.equal(d.seenAgoSeconds, 10_000);
});

test('retrocompat: active SEM carimbo (pré-migração) → mantém vivo mas marca stale', () => {
  // Sessões que existiam antes da migração ainda não têm lastReconciledAt. Não regride o
  // comportamento existente (segue vivo), mas sinaliza stale para o front mostrar "visto há —".
  const d = WhatsAppConnectionProjectionService.derive(
    view({ status: 'active', motorState: null, lastReconciledAt: null }),
    NOW,
  );
  assert.equal(d.live, true);
  assert.equal(d.stale, true);
  assert.equal(d.seenAgoSeconds, null);
});

test('sessão disconnected → nunca viva, independente de carimbo', () => {
  const d = WhatsAppConnectionProjectionService.derive(
    view({ status: 'disconnected', motorState: 'open', lastReconciledAt: secsAgo(1) }),
    NOW,
  );
  assert.equal(d.live, false);
});

test('sessão null → não viva e stale', () => {
  const d = WhatsAppConnectionProjectionService.derive(null, NOW);
  assert.equal(d.live, false);
  assert.equal(d.stale, true);
  assert.equal(d.seenAgoSeconds, null);
});

test('isLive é atalho consistente com derive().live', () => {
  const s = view({ motorState: 'connecting' });
  assert.equal(
    WhatsAppConnectionProjectionService.isLive(s, NOW),
    WhatsAppConnectionProjectionService.derive(s, NOW).live,
  );
});

test('normalizeMotorState traduz vocabulário motor↔app para o conjunto fixo', () => {
  const N = WhatsAppConnectionProjectionService.normalizeMotorState;
  assert.equal(N('open'), 'open');
  assert.equal(N('connected'), 'open');
  assert.equal(N('close'), 'close');
  assert.equal(N('disconnected'), 'close');
  assert.equal(N('offline'), 'close');
  assert.equal(N('connecting'), 'connecting');
  assert.equal(N('reconnecting'), 'connecting');
  assert.equal(N('waiting_qr'), 'connecting');
  assert.equal(N(''), 'unknown');
  assert.equal(N(null), 'unknown');
  assert.equal(N('banana'), 'unknown');
});

test('freshnessWindowSeconds respeita env com piso/teto', () => {
  const prev = process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
  try {
    delete process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
    assert.equal(WhatsAppConnectionProjectionService.freshnessWindowSeconds(), 180);
    process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = '5'; // abaixo do piso
    assert.equal(WhatsAppConnectionProjectionService.freshnessWindowSeconds(), 30);
    process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = '999999'; // acima do teto
    assert.equal(WhatsAppConnectionProjectionService.freshnessWindowSeconds(), 3600);
    process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = '90';
    assert.equal(WhatsAppConnectionProjectionService.freshnessWindowSeconds(), 90);
  } finally {
    if (prev === undefined) delete process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS;
    else process.env.HBX_WA_PROJECTION_FRESHNESS_SECONDS = prev;
  }
});

// ---------------------------------------------------------------------------
// WRITER ÚNICO — stampProjection
// ---------------------------------------------------------------------------

function bareService(updateImpl: (args: any) => Promise<any>) {
  const svc = Object.create(WhatsAppConnectionProjectionService.prototype) as any;
  const calls: any[] = [];
  svc.logger = { warn() {}, log() {}, error() {} };
  svc.prisma = {
    whatsAppConnectionSession: {
      update: async (args: any) => {
        calls.push(args);
        return updateImpl(args);
      },
    },
  };
  return { svc, calls };
}

test('stampProjection carimba lastReconciledAt + motorState normalizado na sessão certa', async () => {
  const { svc, calls } = bareService(async () => ({}));
  const at = new Date('2026-07-04T12:00:00.000Z');
  await svc.stampProjection('sess-1', 'connected', { at });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].where, { id: 'sess-1' });
  assert.equal(calls[0].data.motorState, 'open'); // 'connected' normaliza para 'open'
  assert.equal(calls[0].data.lastReconciledAt, at);
  // sem bump por padrão → connectedAt não é tocado
  assert.equal('connectedAt' in calls[0].data, false);
});

test('stampProjection com bumpConnectedAtOnOpen re-bumpa connectedAt SÓ quando motor open (mata "data velha")', async () => {
  const { svc, calls } = bareService(async () => ({}));
  const at = new Date('2026-07-04T12:00:00.000Z');
  await svc.stampProjection('sess-1', 'open', { at, bumpConnectedAtOnOpen: true });
  assert.equal(calls[0].data.connectedAt, at);

  // close com bump ligado → NÃO bumpa (só faz sentido em open).
  const { svc: svc2, calls: calls2 } = bareService(async () => ({}));
  await svc2.stampProjection('sess-2', 'close', { at, bumpConnectedAtOnOpen: true });
  assert.equal('connectedAt' in calls2[0].data, false);
  assert.equal(calls2[0].data.motorState, 'close');
});

test('stampProjection é no-op silencioso sem id', async () => {
  const { svc, calls } = bareService(async () => ({}));
  await svc.stampProjection('', 'open');
  await svc.stampProjection(undefined as any, 'open');
  assert.equal(calls.length, 0);
});

test('stampProjection nunca crasha se o update do banco falhar (best-effort)', async () => {
  const { svc } = bareService(async () => {
    throw new Error('db down');
  });
  await assert.doesNotReject(() => svc.stampProjection('sess-1', 'open'));
});
