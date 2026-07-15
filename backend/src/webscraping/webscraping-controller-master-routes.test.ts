import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MasterGuard } from '../auth/guards/master.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterWebscrapingController, WebscrapingController } from './webscraping.controller';
import { WebscrapingService } from './webscraping.service';

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

test('history and generic lead-harvest extraction routes are absent from the public controller', () => {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, WebscrapingController);
  const guards = Reflect.getMetadata(GUARDS_METADATA, WebscrapingController) || [];
  const prototype = WebscrapingController.prototype;
  const publicPaths = Object.getOwnPropertyNames(prototype)
    .map((methodName) => Reflect.getMetadata(PATH_METADATA, (prototype as any)[methodName]))
    .filter(Boolean);

  assert.equal(controllerPath, 'webscraping');
  assert.equal(guards.includes(JwtAuthGuard), true);
  assert.equal(publicPaths.includes('history'), false);
  assert.equal(publicPaths.includes('lead-harvest/import'), false);
  assert.equal(publicPaths.includes('lead-harvest/imports/:id'), false);
  assert.equal(publicPaths.includes('radar/pull-preview'), false);
  assert.equal((prototype as any).history, undefined);
  assert.equal((prototype as any).importLeadHarvest, undefined);
  assert.equal((prototype as any).getLeadHarvestImport, undefined);
  assert.equal((prototype as any).radarPullPreview, undefined);
});

test('public RFB filter preview is count-only and never reads a contact sample before debit', async () => {
  const service = new WebscrapingService({} as any) as any;
  let countCalls = 0;
  let sampleQueryCalls = 0;

  service.resolveContext = () => ({ companyId: 7, userId: 9, user: {} });
  service.assertRadarSearchRateAllowed = () => undefined;
  service.cnpjBaseQuery = {
    countBase: async () => {
      countCalls += 1;
      return { available: true, count: 28_000_123 };
    },
    query: async () => {
      sampleQueryCalls += 1;
      return {
        sample: [{ phone: '11999999999', phone2: '1133334444', email: 'vazamento@teste.local' }],
      };
    },
  };

  const result = await service.queryCnpjBaseForUser({ id: 9, companyId: 7 }, { states: ['SP'] });

  assert.equal(countCalls, 1);
  assert.equal(sampleQueryCalls, 0);
  assert.equal(result.count, 28_000_123);
  assert.deepEqual(result.sample, []);
  assert.equal(result.cursorNext, null);
  assert.equal(result.contactsMasked, true);
  assert.equal(JSON.stringify(result).includes('11999999999'), false);
  assert.equal(JSON.stringify(result).includes('vazamento@teste.local'), false);
});
