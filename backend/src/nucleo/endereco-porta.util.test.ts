import test from 'node:test';
import assert from 'node:assert/strict';

import { mesmaPorta } from './endereco-porta.util';

// 🔴 28/07 (dono, na Rota rápida do APK) — "nem compara se já existe o endereço?".
// A régua é FAIL-CLOSED: falso "já existe" manda a entrega pro cliente errado e some
// com um endereço da rota. Os casos abaixo são os jeitos reais de errar na base do
// dono (Rio Claro/company 48): rua numerada, cadastro legado composto, CEP de cidade
// inteira e cadastro sem cidade.

test('mesma porta: mesmo CEP + mesmo número', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '1354', cidade: 'Rio Claro', cep: '13504683' },
      { endereco: 'Rua 8', numero: '1354', cidade: 'Rio Claro', cep: '13504-683' },
    ),
    true,
  );
});

test('mesma porta: legado COMPOSTO (número dentro do texto, coluna vazia)', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 3a', numero: '1354', cidade: 'Rio Claro', cep: '' },
      { endereco: 'Rua 3a, 1354 - Jd. Ypê', numero: null, cidade: 'Rio Claro', cep: null },
    ),
    true,
  );
});

test('mesma porta: numeral por extenso ≡ dígito (IBGE × cadastro)', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '601', cidade: 'Rio Claro' },
      { endereco: 'RUA OITO', numero: '601', cidade: 'RIO CLARO' },
    ),
    true,
  );
});

test('mesma porta: endereço legado que começa pelo BAIRRO', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua M22', numero: '601', cidade: 'Rio Claro' },
      { endereco: 'Jd. Ipanema, Rua M 22, nº 601', numero: null, cidade: 'Rio Claro' },
    ),
    true,
  );
});

test('porta DIFERENTE: número diferente na mesma rua', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '1354', cidade: 'Rio Claro', cep: '13504683' },
      { endereco: 'Rua 8', numero: '1356', cidade: 'Rio Claro', cep: '13504683' },
    ),
    false,
  );
});

test('porta DIFERENTE: "Rua 8" não é "Rua 80"', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '601', cidade: 'Rio Claro' },
      { endereco: 'Rua 80', numero: '601', cidade: 'Rio Claro' },
    ),
    false,
  );
});

test('porta DIFERENTE: mesma rua e número em OUTRA cidade', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '601', cidade: 'Rio Claro' },
      { endereco: 'Rua 8', numero: '601', cidade: 'Araras' },
    ),
    false,
  );
});

test('sem número não decide nada (nem com rua e cidade iguais)', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '', cidade: 'Rio Claro' },
      { endereco: 'Rua 8', numero: null, cidade: 'Rio Claro' },
    ),
    false,
  );
});

test('CEP genérico de cidade não fecha porta sozinho', () => {
  assert.equal(
    mesmaPorta(
      { endereco: '', numero: '601', cep: '13500000' },
      { endereco: '', numero: '601', cep: '13500-000' },
    ),
    false,
  );
});

test('sem texto de via dos dois lados, CEP específico + número fecham', () => {
  assert.equal(
    mesmaPorta(
      { endereco: '', numero: '601', cep: '13504683' },
      { endereco: '', numero: '601', cep: '13504683' },
    ),
    true,
  );
});

test('sem cidade e sem CEP: não decide (fail-closed)', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '601' },
      { endereco: 'Rua 8', numero: '601' },
    ),
    false,
  );
});

// ── UNIDADE / CONDOMÍNIO (06/08, ordem do dono) ────────────────────────────────
// "Os clientes podem ter o mesmo CEP (morar no mesmo condomínio); o que difere um do
// outro é o número. E se repetir, tem que dar o erro e perguntar se é apartamento."

test('apartamentos DIFERENTES no mesmo número não são a mesma porta', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Avenida 96', numero: '405', complemento: 'Apto 32', cidade: 'Rio Claro' },
      { endereco: 'Avenida 96', numero: '405', complemento: 'Apto 45', cidade: 'Rio Claro' },
    ),
    false,
  );
});

test('mesma unidade escrita de outro jeito ("Apto 32" ≡ "AP. 32") continua sendo a mesma porta', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Avenida 96', numero: '405', complemento: 'Apto 32', cidade: 'Rio Claro' },
      { endereco: 'Avenida 96', numero: '405', complemento: 'ap. 32', cidade: 'Rio Claro' },
    ),
    true,
  );
});

test('unidade em branco de um lado NÃO prova unidade diferente — segue mesma porta (é o caso que o dono quer ver perguntado)', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Avenida 96', numero: '405', complemento: 'Apto 32', cidade: 'Rio Claro' },
      { endereco: 'Avenida 96', numero: '405', complemento: null, cidade: 'Rio Claro' },
    ),
    true,
  );
});

test('unidade sem número ("Fundos" vs "Casa 2") também separa', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '601', complemento: 'Fundos', cidade: 'Rio Claro' },
      { endereco: 'Rua 8', numero: '601', complemento: 'Casa 2', cidade: 'Rio Claro' },
    ),
    false,
  );
});

test('unidade NUNCA salva número diferente: apto igual em casas diferentes segue porta diferente', () => {
  assert.equal(
    mesmaPorta(
      { endereco: 'Rua 8', numero: '601', complemento: 'Apto 32', cidade: 'Rio Claro' },
      { endereco: 'Rua 8', numero: '607', complemento: 'Apto 32', cidade: 'Rio Claro' },
    ),
    false,
  );
});
