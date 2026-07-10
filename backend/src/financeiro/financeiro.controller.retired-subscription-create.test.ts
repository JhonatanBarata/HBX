import test from 'node:test';
import assert from 'node:assert/strict';
import { GoneException } from '@nestjs/common';

import { FinanceiroController, RETIRED_SUBSCRIPTION_CREATE_MESSAGE } from './financeiro.controller';

// P0.2 (PR10072026 W1, padrão S7): POST /financeiro/subscription/create aposentado —
// zero chamadores no front atual (checkout-panel virou recarga de créditos) e zero uso
// enterprise/master. Stub `{}` no lugar de FinanceiroService: se o handler ainda chamasse
// `createSubscriptionForUser`, o teste quebraria com "is not a function" — prova que a
// escrita não alcança mais o service. Recorrência MP existente segue viva por webhook +
// subscription/sync (rotas intactas).
test('POST financeiro/subscription/create bloqueia escrita nova (410) sem tocar o service', () => {
  const controller = new FinanceiroController({} as any);
  assert.throws(() => controller.createSubscription(), (err: unknown) => {
    assert.ok(err instanceof GoneException);
    assert.equal((err as GoneException).getStatus(), 410);
    assert.equal((err as GoneException).message, RETIRED_SUBSCRIPTION_CREATE_MESSAGE);
    return true;
  });
});
