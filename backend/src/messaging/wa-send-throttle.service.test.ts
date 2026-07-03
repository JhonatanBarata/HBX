import test from 'node:test';
import assert from 'node:assert/strict';

import { WaSendThrottleService } from './wa-send-throttle.service';

/**
 * Aceite do FREIO DE ENVIO POR CHIP (GATEWAY-WA S3): flag OFF = passa tudo; teto por minuto
 * respeitado (estouro reagenda, nunca descarta); isenção por inbound-24h; curva de warm-up.
 * Nível unitário — prisma falso só serve o findFirst do inbound.
 */

function makePrisma(opts: { hasRecentInbound?: boolean } = {}) {
  return {
    companyMessage: {
      async findFirst() {
        return opts.hasRecentInbound ? { id: 999 } : null;
      },
    },
    whatsAppConnectionSession: {
      async findUnique() {
        return null;
      },
    },
  } as any;
}

function resetEnv() {
  delete process.env.HBX_WA_SEND_THROTTLE_ENABLED;
  delete process.env.HBX_WA_SEND_MAX_PER_MINUTE;
  delete process.env.HBX_WA_SEND_MAX_PER_HOUR;
  delete process.env.HBX_WA_SEND_MIN_SPACING_MS;
  delete process.env.HBX_WA_SEND_JITTER_MS;
  delete process.env.HBX_WA_SEND_WARMUP_DAYS;
  delete process.env.HBX_WA_SEND_WARMUP_FLOOR_PCT;
  delete process.env.HBX_WA_SEND_INBOUND_EXEMPT_HOURS;
  delete process.env.HBX_WA_SEND_RESCHEDULE_MS;
}

test('flag OFF (default): evaluate sempre libera, comportamento atual', async () => {
  resetEnv();
  WaSendThrottleService._resetForTest();
  const svc = new WaSendThrottleService(makePrisma());
  for (let i = 0; i < 50; i += 1) {
    const decision = await svc.evaluate({ companyId: 1, sessionId: 's1', conversationId: 10 });
    assert.equal(decision.allow, true);
    assert.equal(decision.allow && decision.reason, 'disabled');
  }
});

test('teto por minuto: chip maduro solta N e SEGURA o excedente (reagenda, não descarta)', async () => {
  resetEnv();
  WaSendThrottleService._resetForTest();
  process.env.HBX_WA_SEND_THROTTLE_ENABLED = 'true';
  process.env.HBX_WA_SEND_MAX_PER_MINUTE = '3';
  process.env.HBX_WA_SEND_MAX_PER_HOUR = '1000';
  process.env.HBX_WA_SEND_MIN_SPACING_MS = '0'; // isolar o teto por minuto do espaçamento
  process.env.HBX_WA_SEND_JITTER_MS = '0';
  // Sessão madura (connectedAt bem antigo) → teto cheio.
  const connectedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const svc = new WaSendThrottleService(makePrisma());

  const decisions = [] as boolean[];
  for (let i = 0; i < 5; i += 1) {
    const d = await svc.evaluate({ companyId: 1, sessionId: 'chip-A', connectedAt, conversationId: null });
    decisions.push(d.allow);
  }
  const allowed = decisions.filter(Boolean).length;
  const held = decisions.filter((v) => !v).length;
  assert.equal(allowed, 3, 'deveria liberar exatamente o teto (3) no minuto');
  assert.equal(held, 2, 'os 2 excedentes deveriam ser segurados');

  // Segurados viram reagendamento com retryAfterMs > 0 (nunca descarte).
  const extra = await svc.evaluate({ companyId: 1, sessionId: 'chip-A', connectedAt, conversationId: null });
  assert.equal(extra.allow, false);
  assert.ok(!extra.allow && extra.retryAfterMs > 0, 'segurar deve devolver retryAfterMs futuro');

  const stats = svc.getStats();
  assert.equal(stats.enabled, true);
  assert.ok(stats.heldTotal >= 3);
  const chip = stats.perChip.find((c) => c.key === 'session:chip-A');
  assert.ok(chip, 'chip deveria aparecer no snapshot');
  assert.equal(chip?.lastMinute, 3);
});

test('isenção inbound-24h: conversa quente passa direto, sem consumir cota do teto', async () => {
  resetEnv();
  WaSendThrottleService._resetForTest();
  process.env.HBX_WA_SEND_THROTTLE_ENABLED = 'true';
  process.env.HBX_WA_SEND_MAX_PER_MINUTE = '1';
  process.env.HBX_WA_SEND_MIN_SPACING_MS = '0';
  process.env.HBX_WA_SEND_JITTER_MS = '0';
  const connectedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const svc = new WaSendThrottleService(makePrisma({ hasRecentInbound: true }));

  // Teto=1, mas todas passam porque a conversa tem inbound recente (isenta).
  for (let i = 0; i < 10; i += 1) {
    const d = await svc.evaluate({ companyId: 1, sessionId: 'chip-hot', connectedAt, conversationId: 42 });
    assert.equal(d.allow, true);
    assert.equal(d.allow && d.reason, 'inbound_exempt');
  }
  // Nenhuma consumiu cota do chip (não entrou no contador por-minuto).
  const stats = svc.getStats();
  const chip = stats.perChip.find((c) => c.key === 'session:chip-hot');
  assert.equal(chip, undefined, 'envio isento não deveria registrar cota do chip');
});

test('warm-up: chip novo tem teto MENOR que chip maduro', async () => {
  resetEnv();
  WaSendThrottleService._resetForTest();
  process.env.HBX_WA_SEND_THROTTLE_ENABLED = 'true';
  process.env.HBX_WA_SEND_MAX_PER_MINUTE = '10';
  process.env.HBX_WA_SEND_MAX_PER_HOUR = '10000';
  process.env.HBX_WA_SEND_MIN_SPACING_MS = '0';
  process.env.HBX_WA_SEND_JITTER_MS = '0';
  process.env.HBX_WA_SEND_WARMUP_DAYS = '14';
  process.env.HBX_WA_SEND_WARMUP_FLOOR_PCT = '10'; // dia 0 = 10% de 10 = 1

  const svc = new WaSendThrottleService(makePrisma());
  const brandNew = new Date(); // conectou agora → piso do warm-up

  let newAllowed = 0;
  for (let i = 0; i < 10; i += 1) {
    const d = await svc.evaluate({ companyId: 2, sessionId: 'chip-new', connectedAt: brandNew, conversationId: null });
    if (d.allow) newAllowed += 1;
  }

  const mature = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  let matureAllowed = 0;
  for (let i = 0; i < 10; i += 1) {
    const d = await svc.evaluate({ companyId: 3, sessionId: 'chip-old', connectedAt: mature, conversationId: null });
    if (d.allow) matureAllowed += 1;
  }

  assert.ok(newAllowed < matureAllowed, `chip novo (${newAllowed}) deveria soltar menos que o maduro (${matureAllowed})`);
  assert.equal(matureAllowed, 10, 'chip maduro deveria soltar o teto cheio');
  assert.ok(newAllowed <= 2, `chip novo deveria ficar perto do piso (soltou ${newAllowed})`);
});

test('espaçamento mínimo: 2º envio imediato do mesmo chip é segurado', async () => {
  resetEnv();
  WaSendThrottleService._resetForTest();
  process.env.HBX_WA_SEND_THROTTLE_ENABLED = 'true';
  process.env.HBX_WA_SEND_MAX_PER_MINUTE = '100';
  process.env.HBX_WA_SEND_MIN_SPACING_MS = '5000';
  process.env.HBX_WA_SEND_JITTER_MS = '0';
  const connectedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const svc = new WaSendThrottleService(makePrisma());

  const first = await svc.evaluate({ companyId: 1, sessionId: 'chip-sp', connectedAt, conversationId: null });
  assert.equal(first.allow, true);
  const second = await svc.evaluate({ companyId: 1, sessionId: 'chip-sp', connectedAt, conversationId: null });
  assert.equal(second.allow, false);
  assert.equal(!second.allow && second.reason, 'min_spacing');
});
