import test from 'node:test';
import assert from 'node:assert/strict';

import { exigirEnderecoFechado } from './nucleo-cadastro.service';

/**
 * REGRA DE ENTRADA (06/08, ordem do dono): "cliente não serão mais aceitos cadastros
 * sem CEP e número. se tiver só CEP até ok, aceite SN".
 */

function passa(cadastro: any, isCliente = true) {
  exigirEnderecoFechado(cadastro, isCliente);
  return true;
}
function barra(cadastro: any, isCliente = true) {
  assert.throws(() => exigirEnderecoFechado(cadastro, isCliente));
  return true;
}

test('cliente com CEP + número entra', () => {
  assert.ok(passa({ cep: '13504-726', numero: '197', endereco: 'Avenida 74' }));
});

test('número dentro do texto composto (legado) conta como número', () => {
  assert.ok(passa({ cep: '13504726', numero: null, endereco: 'Rua 17, 135 - Jd. Santa Maria' }));
});

test('SN é resposta VÁLIDA — casa sem número existe', () => {
  assert.ok(passa({ cep: '13505-540', numero: 'SN', endereco: 'Av. M47' }));
  assert.ok(passa({ cep: '13505-540', numero: 's/n', endereco: 'Av. M47' }));
  // O jeito que o dono já escreve à mão na base dele:
  assert.ok(passa({ cep: '13504-712', numero: null, endereco: 'Jd. Santa Maria, Rua 16 — sem número' }));
});

test('sem CEP não entra, por mais completo que esteja o resto', () => {
  assert.ok(barra({ cep: null, numero: '1280', endereco: 'Jacutinga, 1280 - Parque universitário' }));
  assert.ok(barra({ cep: '1350', numero: '1280', endereco: 'Jacutinga' }));
});

test('CEP sem número e sem SO declarado não entra — campo em branco não diz nada', () => {
  assert.ok(barra({ cep: '13504-689', numero: null, endereco: 'Avenida 96 BV' }));
  assert.ok(barra({ cep: '13504-689', numero: '   ', endereco: 'Avenida 96 BV' }));
});

test('a regra é da LOGÍSTICA: lead/fornecedor (isCliente=false) segue entrando sem endereço', () => {
  assert.ok(passa({ cep: null, numero: null, endereco: null }, false));
});
