import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MasterGuard } from '../auth/guards/master.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterWebscrapingController, WebscrapingController } from './webscraping.controller';

test('master elastic and engine lifecycle routes stay behind MasterGuard', () => {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, MasterWebscrapingController);
  const guards = Reflect.getMetadata(GUARDS_METADATA, MasterWebscrapingController) || [];
  const prototype = MasterWebscrapingController.prototype;

  assert.equal(controllerPath, 'modules/owner/radar');
  assert.equal(guards.includes(JwtAuthGuard), true);
  assert.equal(guards.includes(MasterGuard), true);
  // F0 (02/07): rota de fábrica (elastic/cancel-forced) removida; a elástica de motores fica.
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.stopAllEngines), 'elastic/stop-all');
});

test('lead harvest official routes stay under webscraping guards', () => {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, WebscrapingController);
  const guards = Reflect.getMetadata(GUARDS_METADATA, WebscrapingController) || [];
  const prototype = WebscrapingController.prototype;

  assert.equal(controllerPath, 'webscraping');
  assert.equal(guards.includes(JwtAuthGuard), true);
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.importLeadHarvest), 'lead-harvest/import');
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.getLeadHarvestImport), 'lead-harvest/imports/:id');
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.enrichmentCostSummary), 'enrichment-cost/summary');
});

test('send-to-vendas ignora debitOnImport do cliente e repassa somente opcoes publicas permitidas', async () => {
  const calls: any[] = [];
  const service = {
    importRadarLeadToVendasForUser: async (...args: any[]) => {
      calls.push(args);
      return { ok: true };
    },
  };
  const controller = new WebscrapingController(
    service as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const user = { id: 9, companyId: 7 };

  await controller.radarLeadSendToVendas(
    { user },
    'radar-1',
    {
      skipWhatsappValidation: true,
      debitOnImport: false,
      assignedUserId: 999,
      companyId: 999,
    } as any,
  );

  assert.deepEqual(calls, [[
    user,
    'radar-1',
    {
      skipWhatsappValidation: false,
      debitOnImport: true,
    },
  ]]);
});
