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

  assert.equal(controllerPath, 'modules/master/webscraping');
  assert.equal(guards.includes(JwtAuthGuard), true);
  assert.equal(guards.includes(MasterGuard), true);
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.getElasticStatus), 'elastic/status');
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.forceNightFactory), 'elastic/force-night');
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.cancelForcedFactory), 'elastic/cancel-forced');
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.drainMasterEngine), 'engines/:id/drain');
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.stopMasterEngineContainer), 'engines/:id/stop-container');
  assert.equal(Reflect.getMetadata(PATH_METADATA, prototype.getMasterEnrichmentCostSummary), 'enrichment-cost/summary');
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
