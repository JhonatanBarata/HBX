import test from 'node:test';
import assert from 'node:assert/strict';
import { RadarSearchRateLimiterService } from './search-rate-limit.service';

// GUARDRAILS S3 (10/07) — throttle da busca grátis do radar (queryCnpjBaseForUser, "Buscar
// empresas"). Janela deslizante em memória por empresa; envs <=0 desligam a janela.

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) prev[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(prev)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('checkAndConsume: estoura a janela por MINUTO -> recusa a partir do limite', () => {
  RadarSearchRateLimiterService.resetForTest();
  withEnv({ HBX_SEARCH_RATE_PER_MIN: '2', HBX_SEARCH_RATE_PER_HOUR: '1000' }, () => {
    const companyId = 501;
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    // 3a busca no mesmo minuto -> estourou o teto de 2/min.
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, false);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, false);
  });
});

test('checkAndConsume: janela NOVA (minuto seguinte) libera de novo', (t) => {
  RadarSearchRateLimiterService.resetForTest();
  t.mock.timers.enable({ apis: ['Date'] });
  withEnv({ HBX_SEARCH_RATE_PER_MIN: '2', HBX_SEARCH_RATE_PER_HOUR: '1000' }, () => {
    const companyId = 502;
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, false);

    // Avança 61s -> as 2 buscas anteriores saem da janela de 1min -> libera de novo.
    t.mock.timers.tick(61_000);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
  });
});

test('checkAndConsume: teto por HORA bloqueia mesmo sem estourar o minuto', () => {
  RadarSearchRateLimiterService.resetForTest();
  withEnv({ HBX_SEARCH_RATE_PER_MIN: '1000', HBX_SEARCH_RATE_PER_HOUR: '3' }, () => {
    const companyId = 503;
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, false);
  });
});

test('checkAndConsume: empresas DIFERENTES têm janelas independentes', () => {
  RadarSearchRateLimiterService.resetForTest();
  withEnv({ HBX_SEARCH_RATE_PER_MIN: '1', HBX_SEARCH_RATE_PER_HOUR: '1000' }, () => {
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(601).allowed, true);
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(601).allowed, false);
    // Empresa 602 nunca buscou -> própria janela, livre.
    assert.equal(RadarSearchRateLimiterService.checkAndConsume(602).allowed, true);
  });
});

test('checkAndConsume: <=0 nas duas envs desliga o throttle inteiro (escape hatch)', () => {
  RadarSearchRateLimiterService.resetForTest();
  withEnv({ HBX_SEARCH_RATE_PER_MIN: '0', HBX_SEARCH_RATE_PER_HOUR: '0' }, () => {
    const companyId = 701;
    for (let i = 0; i < 50; i += 1) {
      assert.equal(RadarSearchRateLimiterService.checkAndConsume(companyId).allowed, true);
    }
  });
});

test('perMinuteLimit/perHourLimit: defaults de código são 30/min e 400/hora', () => {
  withEnv({ HBX_SEARCH_RATE_PER_MIN: undefined, HBX_SEARCH_RATE_PER_HOUR: undefined }, () => {
    assert.equal(RadarSearchRateLimiterService.perMinuteLimit(), 30);
    assert.equal(RadarSearchRateLimiterService.perHourLimit(), 400);
  });
});
