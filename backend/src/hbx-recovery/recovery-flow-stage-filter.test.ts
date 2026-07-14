import assert from 'node:assert/strict';
import test from 'node:test';
import { HbxRecoveryService } from './hbx-recovery.service';

test('régua Recovery exclui linhas internas legadas antes de criar ou listar etapas', () => {
  const where = (HbxRecoveryService.prototype as any).recoveryFlowStageWhere.call({}, 5);
  assert.equal(where.companyId, 5);
  assert.equal(where.NOT?.channel?.startsWith, '__');
  assert.ok(where.channel?.notIn?.includes('__HBX_RECOVERY_BOT_CONFIG__'));
  assert.ok(where.channel?.notIn?.includes('HBX_RECOVERY_META_TEMPLATES'));
});
