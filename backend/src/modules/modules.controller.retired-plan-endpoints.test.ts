import test from 'node:test';
import assert from 'node:assert/strict';
import { GoneException } from '@nestjs/common';

import { ModulesController, RETIRED_PLAN_ENDPOINT_MESSAGE } from './modules.controller';

// MASTER-REFAB S7 (10/07): plano/trial/plan-taste/cortesia (endpoint master) e o editor de
// módulos-por-plano (PlanModuleConfig) foram aposentados — zero chamador no front (grep
// confirmado antes da retirada). Prova de "escrita nova bloqueada": cada handler retirado
// deve devolver 410 Gone, SEM tocar `ModulesService` (stub `{}` — se algum handler ainda
// chamasse o service, isto quebraria com "is not a function").
const controller = new ModulesController({} as any);

test('PUT company/:id/plan bloqueia escrita nova (410)', () => {
  assert.throws(() => controller.setCompanyPlan(), (err: unknown) => {
    assert.ok(err instanceof GoneException);
    assert.equal((err as GoneException).getStatus(), 410);
    assert.equal((err as GoneException).message, RETIRED_PLAN_ENDPOINT_MESSAGE);
    return true;
  });
});

test('POST company/:id/plan-taste bloqueia escrita nova (410)', () => {
  assert.throws(() => controller.grantPlanTaste(), GoneException);
});

test('DELETE company/:id/plan-taste bloqueia escrita nova (410)', () => {
  assert.throws(() => controller.revokePlanTaste(), GoneException);
});

test('POST company/:id/trial bloqueia escrita nova (410) — trial morto em definitivo', () => {
  assert.throws(() => controller.grantTrial(), GoneException);
});

test('PUT company/:id/courtesy bloqueia escrita nova (410) — UI já morreu no S6', () => {
  assert.throws(() => controller.setCompanyCourtesy(), GoneException);
});

test('GET master/plan/:key/modules descontinuado (410) — PlanModuleConfig morreu como fonte no S4', () => {
  assert.throws(() => controller.getMasterPlanModules(), GoneException);
});

test('PUT master/plan/:key/modules descontinuado (410)', () => {
  assert.throws(() => controller.setMasterPlanModules(), GoneException);
});
