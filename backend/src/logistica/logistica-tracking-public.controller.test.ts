import assert from 'node:assert/strict';
import test from 'node:test';
import { NotFoundException } from '@nestjs/common';

import { LogisticaTrackingPublicController } from './logistica-tracking-public.controller';

// Prova o contrato REAL que o cliente final bate: token inválido/adulterado/
// entrega sumida → 404 GENÉRICO (NotFoundException), nunca vaza qual dos três
// casos foi. Token válido → devolve o payload do service tal qual.

test('status: service devolve null (token inválido/entrega sumida) = NotFoundException genérica', async () => {
  const service = { getStatusByToken: async (_token: string) => null } as any;
  const controller = new LogisticaTrackingPublicController(service);
  await assert.rejects(() => controller.status('token-qualquer'), (err: unknown) => {
    assert.ok(err instanceof NotFoundException);
    return true;
  });
});

test('status: service devolve payload = controller repassa sem alterar', async () => {
  const payload = {
    empresaNome: 'Água Boa LTDA',
    clienteNome: 'Maria',
    status: 'A_CAMINHO' as const,
    agendadaEm: null,
    entregueEm: null,
    full: false,
    live: null,
  };
  const service = { getStatusByToken: async (_token: string) => payload } as any;
  const controller = new LogisticaTrackingPublicController(service);
  const res = await controller.status('token-valido');
  assert.deepEqual(res, payload);
});
