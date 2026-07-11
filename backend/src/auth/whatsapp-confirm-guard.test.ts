import test from 'node:test';
import assert from 'node:assert/strict';
import { WhatsappConfirmGuard } from './whatsapp-confirm-guard';

// Relógio controlado: o guard usa cfg.now() em tudo, então avançamos o tempo à mão.
function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

test('guard: primeiro envio é permitido; registerAttempt liga o cooldown', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 60_000 });

  assert.equal(g.evaluate('11999990000').allowed, true);
  g.registerAttempt('11999990000');

  const blocked = g.evaluate('11999990000');
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) {
    assert.equal(blocked.reason, 'COOLDOWN');
    assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);
  }
});

test('guard: cooldown libera depois de 60s', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 60_000 });
  g.registerAttempt('11999990000');

  clock.advance(59_000);
  assert.equal(g.evaluate('11999990000').allowed, false);

  clock.advance(1_500); // passou dos 60s
  assert.equal(g.evaluate('11999990000').allowed, true);
});

test('guard: cooldown é POR TELEFONE (outro número não é afetado)', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 60_000 });
  g.registerAttempt('11999990000');
  assert.equal(g.evaluate('11888880000').allowed, true);
});

test('guard: teto por telefone/hora bloqueia o excedente', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 0, phoneHourlyCap: 3 });
  const phone = '11999990000';
  for (let i = 0; i < 3; i++) {
    assert.equal(g.evaluate(phone).allowed, true, `envio ${i} deveria passar`);
    g.registerAttempt(phone);
  }
  const capped = g.evaluate(phone);
  assert.equal(capped.allowed, false);
  if (!capped.allowed) assert.equal(capped.reason, 'PHONE_HOURLY_CAP');

  // Passada 1h da 1ª tentativa, a janela deslizante libera de novo.
  clock.advance(60 * 60 * 1000 + 1);
  assert.equal(g.evaluate(phone).allowed, true);
});

test('guard: DISJUNTOR abre com N falhas consecutivas e corta TODO envio (sem loop)', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 0, breakerThreshold: 3, breakerCooldownMs: 5 * 60_000 });

  // 3 falhas consecutivas (números diferentes pra isolar do cooldown/telefone).
  for (let i = 0; i < 3; i++) {
    const phone = `1199999000${i}`;
    assert.equal(g.evaluate(phone).allowed, true);
    g.registerAttempt(phone);
    g.registerFailure();
  }
  assert.equal(g.circuitOpen, true);

  // Com o disjuntor aberto, QUALQUER número é cortado — não tenta enviar.
  const blocked = g.evaluate('11777770000');
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.reason, 'CIRCUIT_OPEN');
});

test('guard: um SUCESSO zera o contador do disjuntor (não acumula falhas antigas)', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 0, breakerThreshold: 3 });
  g.registerAttempt('11999990001'); g.registerFailure();
  g.registerAttempt('11999990002'); g.registerFailure();
  g.registerAttempt('11999990003'); g.registerSuccess(); // zera
  g.registerAttempt('11999990004'); g.registerFailure();
  // Só 1 falha desde o sucesso → disjuntor segue FECHADO.
  assert.equal(g.circuitOpen, false);
});

test('guard: disjuntor reabre o canal depois do cooldown do breaker', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 0, breakerThreshold: 1, breakerCooldownMs: 60_000 });
  g.registerAttempt('11999990000'); g.registerFailure();
  assert.equal(g.circuitOpen, true);
  clock.advance(60_001);
  assert.equal(g.circuitOpen, false);
  assert.equal(g.evaluate('11999990000').allowed, true);
});

test('guard: teto GLOBAL/hora protege contra ataque distribuído por muitos números', () => {
  const clock = fakeClock();
  const g = new WhatsappConfirmGuard({ now: clock.now, cooldownMs: 0, phoneHourlyCap: 1000, globalHourlyCap: 3 });
  for (let i = 0; i < 3; i++) {
    const phone = `1190000000${i}`;
    assert.equal(g.evaluate(phone).allowed, true);
    g.registerAttempt(phone);
  }
  const blocked = g.evaluate('11555550000');
  assert.equal(blocked.allowed, false);
  if (!blocked.allowed) assert.equal(blocked.reason, 'GLOBAL_HOURLY_CAP');
});
