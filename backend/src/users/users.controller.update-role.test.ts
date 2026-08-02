import test from 'node:test';
import assert from 'node:assert/strict';

import { UsersController } from './users.controller';

// S8/T2 — canViewBilling so editavel por dono/master (access/actor-kind.ts).
// updateRole (PATCH /users/:id/role) e acessivel por @Admin() — ou seja,
// TAMBEM por GERENTE (ADMIN com canViewBilling=false). Sem freio, promover
// USER->ADMIN por essa rota herdava o default do schema (canViewBilling=true),
// virando "dono" na hora (auto-promocao pra ver dinheiro). Cobre:
//  1) gerente promove USER->ADMIN -> canViewBilling forcado a false.
//  2) dono promove USER->ADMIN -> canViewBilling forcado a false (regra do
//     dono: ele so cunha GERENTE por este fluxo tambem — canViewBilling=true
//     exige o fluxo do MASTER).
//  3) master promove USER->ADMIN -> podendo conceder billing, mas aqui so
//     verificamos que o freio NAO se aplica (nao forca false) quando o
//     chamador e master.

function buildController(usersServiceOverrides: Record<string, any> = {}) {
  const usersService = {
    assertCompanyUserManagementAccess: async () => undefined,
    findById: async (_id: number) => ({ id: 7, companyId: 1, isSystemMaster: false, role: 'USER' }),
    updateById: async (_id: number, data: any) => ({ id: 7, username: 'vendedor', email: 'v@cliente.test', role: data.role, ...data }),
    ...usersServiceOverrides,
  };
  // Demais dependencias nao sao tocadas por updateRole — objetos vazios bastam.
  // (2º arg = CompanyInviteService, MODO PUXAR 02/08 — updateRole nao toca.)
  const controller = new UsersController(
    usersService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { controller, usersService };
}

test('gerente promove USER->ADMIN via /users/:id/role -> canViewBilling forcado a false', async () => {
  const capturedUpdates: any[] = [];
  const { controller } = buildController({
    updateById: async (_id: number, data: any) => {
      capturedUpdates.push(data);
      return { id: 7, username: 'vendedor', email: 'v@cliente.test', role: data.role };
    },
  });

  const req = {
    user: { id: 22, role: 'ADMIN', isSystemMaster: false, canViewBilling: false, companyId: 1 },
    companyId: 1,
  };

  await controller.updateRole(req, 7, { role: 'ADMIN' } as any);

  assert.equal(capturedUpdates.length, 1);
  assert.equal(capturedUpdates[0].role, 'ADMIN');
  assert.equal(capturedUpdates[0].canViewBilling, false);
});

// Regua ja estabelecida em users.controller.ts:1324 (PR13062026007 P5,
// superficie createCompanyUser): "o Dono so cunha GERENTE (ADMIN sem ver $).
// Admin COM cobranca (canViewBilling=true) so o Master cria, por outro
// fluxo." updateRole promove USER->ADMIN com o MESMO efeito de "cunhar um
// admin" — por consistencia com a regua ja codificada, o dono TAMBEM e
// forcado a false aqui (billing=true exige o fluxo do Master, sempre).
test('dono promove USER->ADMIN via /users/:id/role -> canViewBilling tambem forcado a false (mesma regua do createCompanyUser)', async () => {
  const capturedUpdates: any[] = [];
  const { controller } = buildController({
    updateById: async (_id: number, data: any) => {
      capturedUpdates.push(data);
      return { id: 7, username: 'vendedor', email: 'v@cliente.test', role: data.role };
    },
  });

  const req = {
    user: { id: 5, role: 'ADMIN', isSystemMaster: false, canViewBilling: true, companyId: 1 },
    companyId: 1,
  };

  await controller.updateRole(req, 7, { role: 'ADMIN' } as any);

  assert.equal(capturedUpdates[0].canViewBilling, false);
});

test('master promove USER->ADMIN via /users/:id/role -> NAO forca canViewBilling (pode conceder billing)', async () => {
  const capturedUpdates: any[] = [];
  const { controller } = buildController({
    updateById: async (_id: number, data: any) => {
      capturedUpdates.push(data);
      return { id: 7, username: 'vendedor', email: 'v@cliente.test', role: data.role };
    },
  });

  const req = {
    user: { id: 1, role: 'USERMASTER', isSystemMaster: true, canViewBilling: true, companyId: 1 },
    companyId: 1,
  };

  await controller.updateRole(req, 7, { role: 'ADMIN' } as any);

  assert.equal(Object.prototype.hasOwnProperty.call(capturedUpdates[0], 'canViewBilling'), false);
});

test('demote ADMIN->USER via /users/:id/role nao mexe em canViewBilling', async () => {
  const capturedUpdates: any[] = [];
  const { controller } = buildController({
    findById: async (_id: number) => ({ id: 7, companyId: 1, isSystemMaster: false, role: 'ADMIN' }),
    updateById: async (_id: number, data: any) => {
      capturedUpdates.push(data);
      return { id: 7, username: 'gerente', email: 'g@cliente.test', role: data.role };
    },
  });

  const req = {
    user: { id: 22, role: 'ADMIN', isSystemMaster: false, canViewBilling: false, companyId: 1 },
    companyId: 1,
  };

  await controller.updateRole(req, 7, { role: 'USER' } as any);

  assert.equal(Object.prototype.hasOwnProperty.call(capturedUpdates[0], 'canViewBilling'), false);
});
