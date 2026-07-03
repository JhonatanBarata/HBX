import test from 'node:test';
import assert from 'node:assert/strict';
import { RolesGuard } from './roles.guard';

// RBAC 03/07: USERMASTER (dono do tenant) e SUPERSET de ADMIN — deve passar em
// TODA rota @Admin() (@Roles('ADMIN')) alem das @Roles('USERMASTER'). Antes o
// guard BARRAVA o USERMASTER (return false), trancando o dono fora do gerencial/
// users/modules/team etc.

function makeContext(requiredRoles: string[] | undefined, user: any): any {
  const handler = () => undefined;
  const cls = class {};
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
}

function makeGuard(requiredRoles: string[] | undefined): RolesGuard {
  const reflector: any = {
    getAllAndOverride: () => requiredRoles,
  };
  return new RolesGuard(reflector);
}

test('RolesGuard: USERMASTER passa em rota @Roles("ADMIN") (igual a ADMIN)', () => {
  const guard = makeGuard(['ADMIN']);
  const usermaster = { role: 'USERMASTER', isSystemMaster: false };
  const admin = { role: 'ADMIN', isSystemMaster: false };
  assert.equal(guard.canActivate(makeContext(['ADMIN'], usermaster)), true);
  assert.equal(guard.canActivate(makeContext(['ADMIN'], admin)), true);
});

test('RolesGuard: USERMASTER passa em rota @Roles("USERMASTER")', () => {
  const guard = makeGuard(['USERMASTER']);
  const usermaster = { role: 'USERMASTER', isSystemMaster: false };
  assert.equal(guard.canActivate(makeContext(['USERMASTER'], usermaster)), true);
});

test('RolesGuard: system master passa em rota @Roles("ADMIN")', () => {
  const guard = makeGuard(['ADMIN']);
  const master = { role: 'USERMASTER', isSystemMaster: true };
  assert.equal(guard.canActivate(makeContext(['ADMIN'], master)), true);
});

test('RolesGuard: vendedor (USER) NAO passa em rota @Roles("ADMIN")', () => {
  const guard = makeGuard(['ADMIN']);
  const seller = { role: 'USER', isSystemMaster: false };
  assert.equal(guard.canActivate(makeContext(['ADMIN'], seller)), false);
});

test('RolesGuard: sem @Roles a rota e liberada', () => {
  const guard = makeGuard(undefined);
  const seller = { role: 'USER', isSystemMaster: false };
  assert.equal(guard.canActivate(makeContext(undefined, seller)), true);
});
