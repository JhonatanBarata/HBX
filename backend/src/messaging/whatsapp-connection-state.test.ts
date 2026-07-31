import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMotorStateByCompany,
  buildMotorStateByCompanyUser,
  parseMotorInstanceKey,
  readMotorInstanceName,
} from './whatsapp-connection-state';

// INCIDENTE 31/07 — "recebo mensagem, mas nao envio" (400 em todo POST .../message).
// O motor (Evolution v2) devolve o nome da instancia em `name` no item raiz. O leitor
// so olhava `instance.instanceName`/`instanceName` (formato v1), entao TODA instancia
// virava nome vazio, o mapa saia VAZIO, e o gate do chip morto lia mapa vazio como
// "nenhum chip vivo nesta empresa" — recusando o envio de TODOS os tenants com o chip
// `open` o tempo todo. Payload abaixo copiado do /instance/fetchInstances de producao.
const MOTOR_PAYLOAD_V2 = [
  { id: '580220c9', name: 'company-34-user-44', connectionStatus: 'close', number: '5519933005153' },
  { id: 'a1', name: 'company-1', connectionStatus: 'open', number: '5519999999999' },
  { id: 'b2', name: 'company-5-user-6', connectionStatus: 'open', number: '5519998888888' },
  { id: 'c3', name: 'company-39-user-49', connectionStatus: 'close', number: '5519997777777' },
];

test('readMotorInstanceName le as 3 grafias do motor (v2 `name` inclusive)', () => {
  assert.equal(readMotorInstanceName({ name: 'company-5-user-6' }), 'company-5-user-6');
  assert.equal(readMotorInstanceName({ instanceName: 'company-5' }), 'company-5');
  assert.equal(readMotorInstanceName({ instance: { instanceName: 'company-7' } }), 'company-7');
  assert.equal(readMotorInstanceName({ id: 'sem-nome' }), '');
  assert.equal(readMotorInstanceName(null), '');
});

test('parseMotorInstanceKey separa empresa e vendedor', () => {
  assert.deepEqual(parseMotorInstanceKey('company-5-user-6'), { companyId: 5, userId: 6 });
  assert.deepEqual(parseMotorInstanceKey('company-1'), { companyId: 1, userId: null });
  assert.equal(parseMotorInstanceKey(''), null);
  assert.equal(parseMotorInstanceKey('outra-coisa'), null);
});

// O teste que teria evitado o apagao: payload REAL de producao -> empresa 5 viva.
test('buildMotorStateByCompany enxerga o payload real do motor (regressao 31/07)', () => {
  const byCompany = buildMotorStateByCompany(MOTOR_PAYLOAD_V2);

  assert.ok(byCompany.size > 0, 'mapa vazio = gate cego: recusaria o envio de todo mundo');
  assert.equal(byCompany.get(5), 'open');
  assert.equal(byCompany.get(1), 'open');
  assert.equal(byCompany.get(34), 'close');
  assert.equal(byCompany.get(39), 'close');
});

test('buildMotorStateByCompany: `open` de qualquer vendedor vence o `close` do resto', () => {
  const byCompany = buildMotorStateByCompany([
    { name: 'company-5-user-6', connectionStatus: 'close' },
    { name: 'company-5-user-9', connectionStatus: 'open' },
    { name: 'company-5', connectionStatus: 'close' },
  ]);
  assert.equal(byCompany.get(5), 'open');
});

test('buildMotorStateByCompanyUser mantem a granularidade por vendedor', () => {
  const byUser = buildMotorStateByCompanyUser(MOTOR_PAYLOAD_V2);
  assert.equal(byUser.get('5:6'), 'open');
  assert.equal(byUser.get('34:44'), 'close');
  // instancia sem `-user-N` nao decora vendedor nenhum.
  assert.equal(byUser.get('1:0'), undefined);
});
