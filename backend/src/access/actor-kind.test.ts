import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveActorKind,
  isGerenteActor,
  isBillingOwnerActor,
  isAdminTierActor,
  type ActorKind,
} from './actor-kind';

// ---------------------------------------------------------------------------
// Bateria de usuários sintéticos (cobre role × canViewBilling × isSystemMaster,
// mais os casos de borda: USERMASTER sem flag = anti-spoof, role sujo/vazio,
// role minúsculo/com espaço, canViewBilling null/undefined).
// ---------------------------------------------------------------------------
const BATTERY: Array<{ label: string; user: any }> = [
  { label: 'master puro', user: { role: 'USERMASTER', isSystemMaster: true, canViewBilling: true } },
  { label: 'master com flag e role USER', user: { role: 'USER', isSystemMaster: true } },
  { label: 'master com canViewBilling false (flag manda)', user: { role: 'ADMIN', isSystemMaster: true, canViewBilling: false } },
  { label: 'dono (ADMIN billing true)', user: { role: 'ADMIN', isSystemMaster: false, canViewBilling: true } },
  { label: 'dono (ADMIN canViewBilling undefined)', user: { role: 'ADMIN', isSystemMaster: false } },
  { label: 'dono (ADMIN canViewBilling null)', user: { role: 'ADMIN', isSystemMaster: false, canViewBilling: null } },
  { label: 'gerente (ADMIN billing false)', user: { role: 'ADMIN', isSystemMaster: false, canViewBilling: false } },
  { label: 'vendedor (USER)', user: { role: 'USER', isSystemMaster: false } },
  { label: 'vendedor (user minúsculo/espaço)', user: { role: ' user ', isSystemMaster: false } },
  { label: 'USERMASTER sem flag = dono (fix c9289db8; anti-spoof só bloqueia master)', user: { role: 'USERMASTER', isSystemMaster: false } },
  { label: 'USERMASTER sem flag com canViewBilling false = gerente', user: { role: 'USERMASTER', isSystemMaster: false, canViewBilling: false } },
  { label: 'role vazio', user: { role: '', isSystemMaster: false } },
  { label: 'role desconhecido', user: { role: 'GUEST', isSystemMaster: false } },
  { label: 'role null', user: { role: null, isSystemMaster: false } },
  { label: 'user objeto vazio', user: {} },
  { label: 'user null', user: null },
  { label: 'admin minúsculo', user: { role: 'admin', isSystemMaster: false, canViewBilling: true } },
  { label: 'gerente admin minúsculo billing false', user: { role: 'admin', isSystemMaster: false, canViewBilling: false } },
];

// ---------------------------------------------------------------------------
// Réplicas EXATAS dos 3 derivadores ANTES da migração (copiadas do código do
// dia — team-policy.service.ts:462, inbox.service.ts:232, profile.controller.ts:522).
// A caracterização prova que o resolver reproduz cada um deles bit a bit.
// ---------------------------------------------------------------------------

// Réplicas alinhadas ao código do master PÓS fix USERMASTER (c9289db8): o dono
// loga como role USERMASTER e é tratado como ADMIN em toda a hierarquia
// (team-policy 475/542/561, inbox, profile). USERMASTER === ADMIN aqui também.

// team-policy.service.ts isGerente
function legacyIsGerente(requester: any): boolean {
  const role = String(requester?.role || '').trim().toUpperCase();
  return !requester?.isSystemMaster && (role === 'ADMIN' || role === 'USERMASTER') && requester?.canViewBilling === false;
}

// inbox.service.ts isGerenteUser
function legacyIsGerenteUser(user: any): boolean {
  const role = String(user?.role || '').trim().toUpperCase();
  return !user?.isSystemMaster && (role === 'ADMIN' || role === 'USERMASTER') && user?.canViewBilling === false;
}

// profile.controller.ts resolveUserKind
function legacyResolveUserKind(user: any): 'system_master' | 'admin' | 'manager' | 'seller' | 'user' {
  const role = String(user?.role || '').trim().toUpperCase();
  if (user?.isSystemMaster) return 'system_master';
  if (role === 'ADMIN' || role === 'USERMASTER') return (user as any)?.canViewBilling === false ? 'manager' : 'admin';
  if (role === 'USER') return 'seller';
  return 'user';
}

// Mapeia o vocabulário novo (PT) para o vocabulário do resolveUserKind (EN).
function actorKindToUserKind(kind: ActorKind): 'system_master' | 'admin' | 'manager' | 'seller' | 'user' {
  switch (kind) {
    case 'master': return 'system_master';
    case 'dono': return 'admin';
    case 'gerente': return 'manager';
    case 'vendedor': return 'seller';
    default: return 'user';
  }
}

test('caracterização: resolveActorKind reproduz team-policy.isGerente para toda a bateria', () => {
  for (const { label, user } of BATTERY) {
    assert.equal(
      isGerenteActor(user),
      legacyIsGerente(user),
      `isGerente divergiu em "${label}"`,
    );
  }
});

test('caracterização: resolveActorKind reproduz inbox.isGerenteUser para toda a bateria', () => {
  for (const { label, user } of BATTERY) {
    assert.equal(
      isGerenteActor(user),
      legacyIsGerenteUser(user),
      `isGerenteUser divergiu em "${label}"`,
    );
  }
});

test('caracterização: resolveActorKind reproduz profile.resolveUserKind para toda a bateria', () => {
  for (const { label, user } of BATTERY) {
    assert.equal(
      actorKindToUserKind(resolveActorKind(user)),
      legacyResolveUserKind(user),
      `resolveUserKind divergiu em "${label}"`,
    );
  }
});

test('resolveActorKind: master é avaliado PRIMEIRO (anti-spoof) e ignora role/billing', () => {
  assert.equal(resolveActorKind({ role: 'USER', isSystemMaster: true }), 'master');
  assert.equal(resolveActorKind({ role: 'ADMIN', isSystemMaster: true, canViewBilling: false }), 'master');
  // USERMASTER sem a flag NUNCA é master (role de string não promove) — mas É dono
  // do tenant (fix c9289db8): tratado como ADMIN para acesso/cobrança/funil.
  assert.equal(resolveActorKind({ role: 'USERMASTER', isSystemMaster: false }), 'dono');
  assert.equal(resolveActorKind({ role: 'USERMASTER', isSystemMaster: false, canViewBilling: false }), 'gerente');
});

test('resolveActorKind: dono vs gerente separa por canViewBilling', () => {
  assert.equal(resolveActorKind({ role: 'ADMIN', canViewBilling: true }), 'dono');
  assert.equal(resolveActorKind({ role: 'ADMIN' }), 'dono'); // undefined !== false
  assert.equal(resolveActorKind({ role: 'ADMIN', canViewBilling: null }), 'dono'); // null !== false
  assert.equal(resolveActorKind({ role: 'ADMIN', canViewBilling: false }), 'gerente');
});

test('resolveActorKind: vendedor e user', () => {
  assert.equal(resolveActorKind({ role: 'USER' }), 'vendedor');
  assert.equal(resolveActorKind({ role: 'GUEST' }), 'user');
  assert.equal(resolveActorKind({}), 'user');
  assert.equal(resolveActorKind(null), 'user');
});

test('atalhos: isBillingOwnerActor = master|dono; isAdminTierActor = master|dono|gerente', () => {
  const master = { role: 'USERMASTER', isSystemMaster: true };
  const dono = { role: 'ADMIN', canViewBilling: true };
  const gerente = { role: 'ADMIN', canViewBilling: false };
  const vendedor = { role: 'USER' };

  assert.equal(isBillingOwnerActor(master), true);
  assert.equal(isBillingOwnerActor(dono), true);
  assert.equal(isBillingOwnerActor(gerente), false);
  assert.equal(isBillingOwnerActor(vendedor), false);

  assert.equal(isAdminTierActor(master), true);
  assert.equal(isAdminTierActor(dono), true);
  assert.equal(isAdminTierActor(gerente), true);
  assert.equal(isAdminTierActor(vendedor), false);
});
