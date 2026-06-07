import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MasterGuard } from '../auth/guards/master.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MasterWebscrapingController } from './webscraping.controller';

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
});
