import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaRecoveryService } from './logistica-recovery.service';

// LOGÍSTICA-MOBILE M7 — prova o RECOVERY OPT-IN:
//   (a) charge vencida + moduloRecoveryAtivo=true → 1 entrada no funil (createCustomer
//       chamado 1×; DebtCase nasce dentro do Recovery). IDEMPOTENTE: a 2ª varredura
//       vê o HbxRecoveryCustomer já criado e NÃO chama o funil de novo.
//   (b) moduloRecoveryAtivo=false (default) → NADA acontece (funil nunca chamado,
//       nem lê charges).
//   (c) charge NÃO vencida (dueDate >= corte) → ignorada (funil não chamado).
//
// O funil hbx-recovery é MOCKADO (só conta as chamadas de createCustomer) — este
// sprint NÃO reimplementa cadência/envio; só prova que injeta pelo ponto de entrada.

const HOJE = new Date('2026-07-10T12:00:00.000Z');
const ONTEM = new Date('2026-07-09T12:00:00.000Z'); // vencida
const AMANHA = new Date('2026-07-11T12:00:00.000Z'); // NÃO vencida

// Prisma mock: só o que varrer() toca. `recoveryCustomers` é o "banco" que dá a
// idempotência (findFirst por customerProfileId).
function buildPrismaMock(opts: {
  moduloRecoveryAtivo: boolean;
  charges: any[];
  recoveryCustomers?: any[];
  conta?: any;
}) {
  const recoveryCustomers: any[] = [...(opts.recoveryCustomers ?? [])];
  const conta = opts.conta ?? { name: 'Cliente Água', phone: '5585999990000', phoneNormalized: '5585999990000' };
  const chargeReads: any[] = [];
  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => ({ moduloRecoveryAtivo: opts.moduloRecoveryAtivo }),
      findMany: async () => (opts.moduloRecoveryAtivo ? [{ companyId: 1 }] : []),
    },
    financeiroCharge: {
      findMany: async (args: any) => {
        chargeReads.push(args);
        // Aplica o filtro dueDate < corte que o serviço passa (prova o (c)).
        const corte = args?.where?.dueDate?.lt as Date | undefined;
        return opts.charges.filter((c) => {
          if (!c.customerProfileId) return false;
          if (c.status !== 'pending') return false;
          if (corte && !(c.dueDate && c.dueDate.getTime() < corte.getTime())) return false;
          return true;
        });
      },
    },
    hbxRecoveryCustomer: {
      findFirst: async (args: any) => {
        const pid = args?.where?.customerProfileId;
        return recoveryCustomers.find((r) => r.customerProfileId === pid) || null;
      },
    },
    customerProfile: {
      findFirst: async () => conta,
    },
  };
  return { prisma, recoveryCustomers, chargeReads };
}

// Funil hbx-recovery MOCK: conta createCustomer e simula o efeito (grava um
// HbxRecoveryCustomer no "banco" do prisma, pra idempotência da 2ª varredura).
function buildRecoveryMock(recoveryCustomers: any[]) {
  const calls: any[] = [];
  return {
    calls,
    recovery: {
      createCustomer: async (user: any, dto: any) => {
        calls.push({ user, dto });
        recoveryCustomers.push({ id: `rec-${calls.length}`, customerProfileId: 'conta-1' });
        return { id: `rec-${calls.length}` };
      },
    } as any,
  };
}

test('(a) charge vencida + moduloRecoveryAtivo=true → injeta 1× no funil; 2ª varredura NÃO duplica', async () => {
  const { prisma, recoveryCustomers } = buildPrismaMock({
    moduloRecoveryAtivo: true,
    charges: [
      { id: 'ch-1', customerProfileId: 'conta-1', amount: 50, dueDate: ONTEM, status: 'pending', entregaId: 'e1' },
      { id: 'ch-2', customerProfileId: 'conta-1', amount: 30, dueDate: ONTEM, status: 'pending', entregaId: 'e2' },
    ],
  });
  const { calls, recovery } = buildRecoveryMock(recoveryCustomers);
  const svc = new LogisticaRecoveryService(prisma, recovery);

  const r1 = await svc.varrer(1, '2026-07-10');
  assert.equal(r1.ativo, true);
  assert.equal(r1.clientesVencidos, 1, '2 charges do mesmo cliente = 1 cliente');
  assert.equal(r1.injetados, 1, 'injeta 1 caso no funil');
  assert.equal(calls.length, 1, 'createCustomer chamado exatamente 1×');
  // Agrega o aberto vencido do cliente (50 + 30 = 80).
  assert.equal(calls[0].dto.openAmount, 80);
  assert.equal(calls[0].user.companyId, 1);

  // 2ª varredura no MESMO estado: o cliente já está no funil → não chama de novo.
  const r2 = await svc.varrer(1, '2026-07-10');
  assert.equal(r2.injetados, 0, 'idempotente: 0 caso novo');
  assert.equal(r2.jaNoFunil, 1);
  assert.equal(calls.length, 1, 'createCustomer NÃO é chamado 2×');
});

test('(b) moduloRecoveryAtivo=false → NADA acontece (funil nunca chamado)', async () => {
  const { prisma, recoveryCustomers } = buildPrismaMock({
    moduloRecoveryAtivo: false,
    charges: [{ id: 'ch-1', customerProfileId: 'conta-1', amount: 99, dueDate: ONTEM, status: 'pending' }],
  });
  const { calls, recovery } = buildRecoveryMock(recoveryCustomers);
  const svc = new LogisticaRecoveryService(prisma, recovery);

  const r = await svc.varrer(1, '2026-07-10');
  assert.equal(r.ativo, false, 'opt-in OFF');
  assert.equal(r.injetados, 0);
  assert.equal(r.clientesVencidos, 0);
  assert.equal(calls.length, 0, 'funil NÃO chamado (fail-closed)');
});

test('(c) charge NÃO vencida (dueDate >= corte) → ignorada (funil não chamado)', async () => {
  const { prisma, recoveryCustomers } = buildPrismaMock({
    moduloRecoveryAtivo: true,
    charges: [{ id: 'ch-1', customerProfileId: 'conta-1', amount: 40, dueDate: AMANHA, status: 'pending' }],
  });
  const { calls, recovery } = buildRecoveryMock(recoveryCustomers);
  const svc = new LogisticaRecoveryService(prisma, recovery);

  const r = await svc.varrer(1, '2026-07-10');
  assert.equal(r.ativo, true);
  assert.equal(r.clientesVencidos, 0, 'charge de amanhã não conta como vencida');
  assert.equal(r.injetados, 0);
  assert.equal(calls.length, 0, 'funil NÃO chamado p/ charge não vencida');
});

test('cliente sem telefone utilizável → pula (não injeta, não falha)', async () => {
  const { prisma, recoveryCustomers } = buildPrismaMock({
    moduloRecoveryAtivo: true,
    charges: [{ id: 'ch-1', customerProfileId: 'conta-1', amount: 40, dueDate: ONTEM, status: 'pending' }],
    conta: { name: 'Sem Fone', phone: '', phoneNormalized: '' },
  });
  const { calls, recovery } = buildRecoveryMock(recoveryCustomers);
  const svc = new LogisticaRecoveryService(prisma, recovery);

  const r = await svc.varrer(1, '2026-07-10');
  assert.equal(r.injetados, 0);
  assert.equal(r.semTelefone, 1);
  assert.equal(calls.length, 0, 'sem telefone = funil não chamado');
});

void HOJE; // documenta o dia-base dos fixtures (corte usa a data passada em varrer()).
