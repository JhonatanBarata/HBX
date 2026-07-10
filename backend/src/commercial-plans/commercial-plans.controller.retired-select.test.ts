import test from 'node:test';
import assert from 'node:assert/strict';
import { GoneException } from '@nestjs/common';

import { CommercialPlansController, RETIRED_SELECT_PLAN_MESSAGE } from './commercial-plans.controller';

// MASTER-REFAB S7 (10/07): "Signup/checkout self-service de PLANO" (item 1 do sprint) —
// POST /commercial-plans/select bloqueia escrita nova. Stub `{}` no lugar de
// CommercialPlansService: se o handler ainda chamasse `selectPlanForUser`, o teste quebraria
// com "is not a function" — prova que a escrita não alcança mais o service.
test('POST commercial-plans/select bloqueia escrita nova (410) sem tocar o service', () => {
  const controller = new CommercialPlansController({} as any);
  assert.throws(() => controller.selectPlan(), (err: unknown) => {
    assert.ok(err instanceof GoneException);
    assert.equal((err as GoneException).getStatus(), 410);
    assert.equal((err as GoneException).message, RETIRED_SELECT_PLAN_MESSAGE);
    return true;
  });
});
