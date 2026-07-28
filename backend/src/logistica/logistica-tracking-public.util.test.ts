import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computePublicDeliveryStatus,
  computeRouteProgress,
  firstNameOnly,
  formatEtaMinutos,
  isTrackingPublicConfigured,
  signDeliveryTrackingToken,
  verifyDeliveryTrackingToken,
} from './logistica-tracking-public.util';

const SECRET = 'unit-test-secret-32-bytes-minimo-ok';
const DELIVERY_ID = 'ckabc123def456ghi789jkl0';

// ── token assinado ───────────────────────────────────────────────────────────
test('signDeliveryTrackingToken + verifyDeliveryTrackingToken: round-trip válido', () => {
  const token = signDeliveryTrackingToken(DELIVERY_ID, SECRET);
  assert.ok(token, 'token deveria ser gerado');
  assert.equal(verifyDeliveryTrackingToken(token as string, SECRET), DELIVERY_ID);
});

test('signDeliveryTrackingToken: sem segredo configurado = fail-closed (null)', () => {
  assert.equal(signDeliveryTrackingToken(DELIVERY_ID, ''), null);
  assert.equal(isTrackingPublicConfigured.length, 0); // smoke: função existe e é 0-arity
});

test('signDeliveryTrackingToken: deliveryId com caractere inválido = null', () => {
  assert.equal(signDeliveryTrackingToken('id-com-hifen-e-ponto.x', SECRET), null);
  assert.equal(signDeliveryTrackingToken('', SECRET), null);
});

test('verifyDeliveryTrackingToken: token adulterado (assinatura trocada) = null', () => {
  const token = signDeliveryTrackingToken(DELIVERY_ID, SECRET) as string;
  const [id] = token.split('.');
  const adulterado = `${id}.assinaturaFalsaXXXXXXX`;
  assert.equal(verifyDeliveryTrackingToken(adulterado, SECRET), null);
});

test('verifyDeliveryTrackingToken: deliveryId trocado mas assinatura de outro id = null (não forja)', () => {
  const tokenA = signDeliveryTrackingToken(DELIVERY_ID, SECRET) as string;
  const [, assinaturaA] = tokenA.split('.');
  const outroId = 'ckoutraentregaxyz9876543';
  const forjado = `${outroId}.${assinaturaA}`;
  assert.equal(verifyDeliveryTrackingToken(forjado, SECRET), null);
});

test('verifyDeliveryTrackingToken: segredo diferente do que assinou = null', () => {
  const token = signDeliveryTrackingToken(DELIVERY_ID, SECRET) as string;
  assert.equal(verifyDeliveryTrackingToken(token, 'outro-secret-completamente-diferente'), null);
});

test('verifyDeliveryTrackingToken: mal formado (sem ponto / vazio) = null', () => {
  assert.equal(verifyDeliveryTrackingToken('semponto', SECRET), null);
  assert.equal(verifyDeliveryTrackingToken('', SECRET), null);
  assert.equal(verifyDeliveryTrackingToken('.semid', SECRET), null);
  assert.equal(verifyDeliveryTrackingToken('idsemassinatura.', SECRET), null);
});

test('verifyDeliveryTrackingToken: sem segredo configurado = null (fail-closed), mesmo com token válido', () => {
  const token = signDeliveryTrackingToken(DELIVERY_ID, SECRET) as string;
  assert.equal(verifyDeliveryTrackingToken(token, ''), null);
});

// ── ETA fino ─────────────────────────────────────────────────────────────────
test('formatEtaMinutos: sem etaAt = null', () => {
  assert.equal(formatEtaMinutos(null), null);
  assert.equal(formatEtaMinutos(undefined), null);
});

test('formatEtaMinutos: data inválida = null', () => {
  assert.equal(formatEtaMinutos('não-é-uma-data'), null);
});

test('formatEtaMinutos: ETA no passado ou <= 1min = "chegando"', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');
  assert.equal(formatEtaMinutos(new Date('2026-07-27T11:55:00.000Z'), now), 'chegando');
  assert.equal(formatEtaMinutos(new Date('2026-07-27T12:00:30.000Z'), now), 'chegando');
});

test('formatEtaMinutos: minutos simples', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');
  assert.equal(formatEtaMinutos(new Date('2026-07-27T12:08:00.000Z'), now), '8 min');
  assert.equal(formatEtaMinutos(new Date('2026-07-27T12:45:00.000Z'), now), '45 min');
});

test('formatEtaMinutos: horas + minutos', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');
  assert.equal(formatEtaMinutos(new Date('2026-07-27T13:05:00.000Z'), now), '1h 5min');
  assert.equal(formatEtaMinutos(new Date('2026-07-27T14:00:00.000Z'), now), '2h');
});

test('formatEtaMinutos: determinística (mesma entrada = mesma saída)', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');
  const eta = new Date('2026-07-27T12:20:00.000Z');
  assert.equal(formatEtaMinutos(eta, now), formatEtaMinutos(eta, now));
});

// ── status público (4 estágios) ──────────────────────────────────────────────
test('computePublicDeliveryStatus: cancelada sempre vence (mesmo com avisoChegandoAt)', () => {
  assert.equal(
    computePublicDeliveryStatus({ status: 'cancelada', avisoChegandoAt: new Date(), routeActive: true }),
    'CANCELADA',
  );
});

test('computePublicDeliveryStatus: entregue vence sinais intermediários', () => {
  assert.equal(
    computePublicDeliveryStatus({ status: 'entregue', avisoChegandoAt: new Date(), routeActive: true }),
    'ENTREGUE',
  );
});

test('computePublicDeliveryStatus: avisoChegandoAt setado = CHEGANDO', () => {
  assert.equal(
    computePublicDeliveryStatus({ status: 'em_rota', avisoChegandoAt: new Date(), routeActive: true }),
    'CHEGANDO',
  );
});

test('computePublicDeliveryStatus: em_rota sem aviso = A_CAMINHO', () => {
  assert.equal(
    computePublicDeliveryStatus({ status: 'em_rota', avisoChegandoAt: null, routeActive: true }),
    'A_CAMINHO',
  );
});

test('computePublicDeliveryStatus: agendada dentro de rota ativa = A_CAMINHO', () => {
  assert.equal(
    computePublicDeliveryStatus({ status: 'agendada', avisoChegandoAt: null, routeActive: true }),
    'A_CAMINHO',
  );
});

test('computePublicDeliveryStatus: agendada sem rota ativa = AGENDADA (na fila)', () => {
  assert.equal(
    computePublicDeliveryStatus({ status: 'agendada', avisoChegandoAt: null, routeActive: false }),
    'AGENDADA',
  );
});

// ── progresso da rota ─────────────────────────────────────────────────────────
test('computeRouteProgress: conta concluídas sobre o total', () => {
  assert.deepEqual(
    computeRouteProgress(['entregue', 'entregue', 'agendada', 'em_rota', 'cancelada']),
    { concluidas: 2, total: 5 },
  );
});

test('computeRouteProgress: lista vazia = 0/0', () => {
  assert.deepEqual(computeRouteProgress([]), { concluidas: 0, total: 0 });
});

// ── primeiro nome ─────────────────────────────────────────────────────────────
test('firstNameOnly: extrai só o primeiro nome', () => {
  assert.equal(firstNameOnly('Maria da Silva Santos'), 'Maria');
  assert.equal(firstNameOnly('  João  '), 'João');
});

test('firstNameOnly: null/vazio = null', () => {
  assert.equal(firstNameOnly(null), null);
  assert.equal(firstNameOnly(''), null);
  assert.equal(firstNameOnly('   '), null);
});
