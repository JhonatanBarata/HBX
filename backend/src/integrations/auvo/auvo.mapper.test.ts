import test from 'node:test';
import assert from 'node:assert/strict';

import { AuvoMapper } from './auvo.mapper';

test('toExternalRecord supports plausible pt-BR dates, nested date objects, and local hour preservation', () => {
  const mapper = new AuvoMapper();

  const result = mapper.toExternalRecord({
    taskID: 321,
    orientation: 'Visita local',
    status: 'pendente',
    startDate: '29/03/2026 08:15:00',
    endDate: { value: '29-03-2026 09:45:00' },
    updatedAt: { timestamp: 1774771200 },
    customer: { description: 'Cliente pt-BR' },
    userTo: { name: 'Tecnico local' },
  });

  assert.equal(result.externalId, '321');
  assert.equal(result.status, 'PENDING');
  assert.equal(result.customerName, 'Cliente pt-BR');
  assert.equal(result.technicianName, 'Tecnico local');
  assert.ok(result.scheduledStart instanceof Date);
  assert.equal(result.scheduledStart?.getFullYear(), 2026);
  assert.equal(result.scheduledStart?.getMonth(), 2);
  assert.equal(result.scheduledStart?.getDate(), 29);
  assert.equal(result.scheduledStart?.getHours(), 8);
  assert.ok(result.scheduledEnd instanceof Date);
  assert.equal(result.scheduledEnd?.getHours(), 9);
  assert.ok(result.sourceUpdatedAt instanceof Date);
});

test('toExternalRecord canonicalizes core statuses conservatively and keeps safe fallback', () => {
  const mapper = new AuvoMapper();

  assert.equal(mapper.toExternalRecord({ externalId: '1', status: 'open' }).status, 'OPEN');
  assert.equal(mapper.toExternalRecord({ externalId: '2', status: 'Pendente' }).status, 'PENDING');
  assert.equal(mapper.toExternalRecord({ externalId: '3', status: 'em andamento' }).status, 'IN_PROGRESS');
  assert.equal(mapper.toExternalRecord({ externalId: '4', status: 'concluido' }).status, 'DONE');
  assert.equal(mapper.toExternalRecord({ externalId: '5', status: 'cancelado' }).status, 'CANCELED');
  assert.equal(mapper.toExternalRecord({ externalId: '6', status: 'Agendado' }).status, 'SCHEDULED');
  assert.equal(mapper.toExternalRecord({ externalId: '7', status: 'custom_status' }).status, 'CUSTOM_STATUS');
});