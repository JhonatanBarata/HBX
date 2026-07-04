import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { NotFoundException } from '@nestjs/common';

import { NucleoController } from './nucleo.controller';
import { LogisticaController } from '../logistica/logistica.controller';

// NÚCLEO-CRM R5 (05/07) — CROSS-TENANT DURO nos endpoints id-scoped.
//
// Regra da borda: um id de OUTRA empresa (ou inexistente) responde 404 —
// NUNCA 403 (que vazaria a EXISTÊNCIA do registro alheio). O serviço já devolve
// `null` p/ id fora do tenant (provado em nucleo-r3.test.ts p/ merge/soft-delete);
// aqui provamos que o CONTROLLER mapeia esse `null` → NotFoundException (404) em
// TODOS os endpoints id-scoped novos, incluindo getEmpresa (era 403, virou 404).
//
// companyId sai SEMPRE do JWT (req.user.companyId) — o body/param nunca o injeta.

const req = { user: { id: 1, companyId: 7 } } as any;

// Serviço que finge "id de outro tenant" devolvendo null em TODO método de leitura/escrita.
function nullService(): any {
  return new Proxy(
    {},
    {
      get() {
        return async () => null;
      },
    },
  );
}

async function expect404(fn: () => Promise<unknown>, msg: string) {
  await assert.rejects(
    fn,
    (e: unknown) => e instanceof NotFoundException,
    msg,
  );
}

// ── NUCLEO — endpoints id-scoped → 404 p/ tenant errado ───────────────────────
test('R5 nucleo: id de outro tenant → 404 (não 403) em todos os endpoints id-scoped', async () => {
  const c = new NucleoController(nullService());

  // getEmpresa era ForbiddenException (403) — a correção R5 é 404 (não vazar existência).
  await expect404(() => c.getEmpresa(req, 'alheio'), 'getEmpresa → 404');
  await expect404(() => c.updateConta(req, 'alheio', {} as any), 'updateConta → 404');
  await expect404(() => c.addContato(req, { customerProfileId: 'alheio', nome: 'X' } as any), 'addContato → 404');
  await expect404(() => c.updateContato(req, 'alheio', {} as any), 'updateContato → 404');
  await expect404(() => c.mergeConta(req, 'alheio', { into: 'x' } as any), 'mergeConta → 404');
  await expect404(() => c.deleteConta(req, 'alheio', undefined), 'deleteConta → 404');
  await expect404(() => c.deleteContato(req, 'alheio', undefined), 'deleteContato → 404');
});

// ── LOGISTICA — endpoints id-scoped → 404 p/ tenant errado ────────────────────
test('R5 logistica: id de outro tenant → 404 em todos os endpoints id-scoped', async () => {
  const svc = nullService();
  const c = new LogisticaController(svc, svc, svc, svc, svc);

  await expect404(() => c.confirmar(req, 'alheio', {} as any), 'confirmar → 404');
  await expect404(() => c.cancelar(req, 'alheio', {} as any), 'cancelar → 404');
  await expect404(() => c.reenviarAviso(req, 'alheio'), 'reenviarAviso → 404');
  await expect404(() => c.deleteEntrega(req, 'alheio', undefined), 'deleteEntrega → 404');
  await expect404(() => c.extrato(req, 'alheio'), 'extrato → 404');
  await expect404(() => c.updateFinanceiroCliente(req, 'alheio', {} as any), 'updateFinanceiroCliente → 404');
  await expect404(() => c.updateClienteProduto(req, 'alheio', {} as any), 'updateClienteProduto → 404');
  await expect404(() => c.getAvisarCliente(req, 'alheio'), 'getAvisarCliente → 404');
  await expect404(() => c.setAvisarCliente(req, 'alheio', { avisar: true } as any), 'setAvisarCliente → 404');
});
