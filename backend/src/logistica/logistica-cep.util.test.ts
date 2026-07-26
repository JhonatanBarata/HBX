import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compararCepComEndereco,
  conferirCepsEmLote,
  enderecoSemNumero,
  limparCacheCep,
  normalizarCep,
} from './logistica-cep.util';

/**
 * 26/07 (ordem do dono) — prova a checagem CEP × ENDEREÇO, que é o ÚNICO aviso NOVO que
 * o motorista passa a ver ("CEP e endereço não batem, obrigatório corrigir"). Por ser um
 * BLOQUEIO na cara dele, a regra é fail-OPEN: só acusa com PROVA; qualquer dúvida (CEP
 * ausente, CEP inexistente, ViaCEP fora do ar) é SILÊNCIO.
 *
 * ZERO REDE: `fetch` global é trocado por um dublê em todos os casos que chegam a
 * consultar — a suíte nunca pode bater no viacep.com.br de verdade. `limparCacheCep()`
 * roda antes de cada caso (o cache é de MÓDULO, vaza entre testes se ninguém limpar).
 */

interface ChamadaFetch {
  url: string;
}

/** Troca o `fetch` global por um dublê, roda o caso e restaura SEMPRE (finally). */
async function comFetchFake(
  responder: (cep: string) => { ok: boolean; payload?: unknown } | 'erro_de_rede',
  caso: (chamadas: ChamadaFetch[]) => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  const chamadas: ChamadaFetch[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    chamadas.push({ url });
    const cep = url.replace(/\D+/g, '').slice(-8);
    const resposta = responder(cep);
    if (resposta === 'erro_de_rede') throw new Error('ECONNRESET (dublê)');
    return { ok: resposta.ok, json: async () => resposta.payload } as any;
  }) as any;
  try {
    await caso(chamadas);
  } finally {
    globalThis.fetch = original;
  }
}

test.beforeEach(() => limparCacheCep());

// ── normalizarCep ────────────────────────────────────────────────────────────────
test('normalizarCep: 8 dígitos ou null (nunca "quase certo")', () => {
  assert.equal(normalizarCep('13990-000'), '13990000');
  assert.equal(normalizarCep(' 13.990-000 '), '13990000');
  assert.equal(normalizarCep('1399000'), null, '7 dígitos não é CEP');
  assert.equal(normalizarCep('139900000'), null, '9 dígitos não é CEP');
  assert.equal(normalizarCep(null), null);
  assert.equal(normalizarCep(''), null);
});

// ── enderecoSemNumero (26/07, "tem q conferir se tem número tbm") ────────────────
test('sem número: campo vazio, s/n, sn, s.n. e "-" são todos AUSENTE (nenhum tem dígito)', () => {
  for (const numero of ['', '   ', 's/n', 'S/N', 'sn', 's.n.', '-', '--', null, undefined]) {
    assert.equal(
      enderecoSemNumero({ numero, endereco: 'Rua das Flores', cidade: 'Campinas', uf: 'SP' }),
      true,
      `numero=${JSON.stringify(numero)} deveria contar como SEM número`,
    );
  }
});

test('com número na coluna própria → não acusa (inclusive "123-A" e "s/n 45")', () => {
  for (const numero of ['123', '0', '123-A', 'km 12', 's/n 45']) {
    assert.equal(enderecoSemNumero({ numero, endereco: 'Rua das Flores', cidade: 'Campinas' }), false, numero);
  }
});

test('LEGADO: numero=null mas o número está no texto composto `endereco` → NÃO acusa', () => {
  // A coluna `numero` é nova (dupla escrita); a base antiga tem tudo dentro de `endereco`.
  // Olhar só `numero` acusaria a base legada inteira — o alarme-que-toca-em-tudo de novo.
  assert.equal(enderecoSemNumero({ numero: null, endereco: 'Rua das Flores, 123 - Centro', cidade: 'Campinas' }), false);
  assert.equal(enderecoSemNumero({ numero: null, endereco: 'Rua das Flores - Centro', cidade: 'Campinas' }), true);
});

test('cadastro SEM endereço nenhum não acusa "sem número" (fail-open: o problema dele é outro)', () => {
  assert.equal(enderecoSemNumero({}), false);
  assert.equal(enderecoSemNumero({ numero: null, endereco: null, cidade: null, cep: null }), false);
});

test('só o CEP preenchido já conta como endereço existente → sem número acusa', () => {
  assert.equal(enderecoSemNumero({ cep: '13990000' }), true);
});

// ── compararCepComEndereco: as 3 provas de divergência ───────────────────────────
test('UF diferente → nao_bate (impossível ser o mesmo lugar)', () => {
  const veredito = compararCepComEndereco(
    { cep: '13990-000', logradouro: 'Rua das Flores', localidade: 'Espírito Santo do Pinhal', uf: 'SP' },
    { cep: '13990000', endereco: 'Rua das Flores', cidade: 'Espírito Santo do Pinhal', uf: 'MG' },
  );
  assert.equal(veredito, 'nao_bate');
});

test('cidade diferente → nao_bate (o caso clássico do CEP copiado de outro cliente)', () => {
  const veredito = compararCepComEndereco(
    { cep: '13990-000', logradouro: 'Rua das Flores', localidade: 'Espírito Santo do Pinhal', uf: 'SP' },
    { cep: '13990000', endereco: 'Rua das Flores', cidade: 'Campinas', uf: 'SP' },
  );
  assert.equal(veredito, 'nao_bate');
});

test('via incompatível COM logradouro presente no CEP → nao_bate', () => {
  const veredito = compararCepComEndereco(
    { cep: '13990-000', logradouro: 'Rua das Flores', localidade: 'Campinas', uf: 'SP' },
    { cep: '13990000', endereco: 'Avenida Brasil, 1200', cidade: 'Campinas', uf: 'SP' },
  );
  assert.equal(veredito, 'nao_bate');
});

test('logradouro vazio (CEP geral de cidade) + cidade igual → bate (CEP geral não prova nada sobre a rua)', () => {
  const veredito = compararCepComEndereco(
    { cep: '13990-000', logradouro: '', bairro: '', localidade: 'Espírito Santo do Pinhal', uf: 'SP' },
    { cep: '13990000', endereco: 'Rua Qualquer, 1', cidade: 'Espírito Santo do Pinhal', uf: 'SP' },
  );
  assert.equal(veredito, 'bate');
});

test('cidade igual só variando acento/caixa → bate (normalização, não é divergência)', () => {
  const veredito = compararCepComEndereco(
    { cep: '13990-000', logradouro: '', localidade: 'ESPÍRITO SANTO DO PINHAL', uf: 'SP' },
    { cep: '13990000', endereco: '', cidade: 'espirito santo do pinhal', uf: 'sp' },
  );
  assert.equal(veredito, 'bate');
});

test('número da casa junto na rua não desmente o CEP ("Rua das Flores, 123" ⊃ "Rua das Flores")', () => {
  const veredito = compararCepComEndereco(
    { cep: '13990-000', logradouro: 'Rua das Flores', localidade: 'Campinas', uf: 'SP' },
    { cep: '13990000', endereco: 'Rua das Flores, 123', cidade: 'Campinas', uf: 'SP' },
  );
  assert.equal(veredito, 'bate');
});

test('bairro divergente NÃO acusa (ruído conhecido do ViaCEP, não prova endereço errado)', () => {
  const veredito = compararCepComEndereco(
    { cep: '13990-000', logradouro: 'Rua das Flores', bairro: 'Centro', localidade: 'Campinas', uf: 'SP' },
    { cep: '13990000', endereco: 'Rua das Flores', bairro: 'Vila Nova', cidade: 'Campinas', uf: 'SP' },
  );
  assert.equal(veredito, 'bate');
});

test('payload null (ViaCEP fora do ar / CEP inexistente) → indeterminado, NUNCA nao_bate', () => {
  assert.equal(
    compararCepComEndereco(null, { cep: '13990000', endereco: 'Rua X', cidade: 'Campinas', uf: 'SP' }),
    'indeterminado',
  );
});

test('nada comparável dos dois lados → indeterminado (não inventa um "bate")', () => {
  assert.equal(compararCepComEndereco({ cep: '13990-000' }, { cep: '13990000' }), 'indeterminado');
});

// ── conferirCepsEmLote: rede, dedupe, cache, kill-switch ─────────────────────────
const CADASTRO_OK = { cep: '13990000', endereco: 'Rua das Flores, 10', cidade: 'Campinas', uf: 'SP' };
const PAYLOAD_OK = { cep: '13990-000', logradouro: 'Rua das Flores', localidade: 'Campinas', uf: 'SP' };

test('CEP sem 8 dígitos NÃO consulta (nem gasta ViaCEP) e sai indeterminado', async () => {
  await comFetchFake(
    () => ({ ok: true, payload: PAYLOAD_OK }),
    async (chamadas) => {
      const vereditos = await conferirCepsEmLote([
        { ...CADASTRO_OK, cep: '1399000' },
        { ...CADASTRO_OK, cep: null },
        { ...CADASTRO_OK, cep: 'sem cep' },
      ]);
      assert.deepEqual(vereditos, ['indeterminado', 'indeterminado', 'indeterminado']);
      assert.equal(chamadas.length, 0, 'nenhuma consulta pode sair pra CEP inválido');
    },
  );
});

test('cadastro sem NADA comparável (só CEP) não consulta — o ViaCEP responderia pra nada', async () => {
  await comFetchFake(
    () => ({ ok: true, payload: PAYLOAD_OK }),
    async (chamadas) => {
      const vereditos = await conferirCepsEmLote([{ cep: '13990000' }]);
      assert.deepEqual(vereditos, ['indeterminado']);
      assert.equal(chamadas.length, 0);
    },
  );
});

test('lote: dedupe por CEP (3 paradas, 1 consulta) e veredito na MESMA ordem da entrada', async () => {
  await comFetchFake(
    (cep) => ({ ok: true, payload: cep === '13990000' ? PAYLOAD_OK : { ...PAYLOAD_OK, uf: 'MG' } }),
    async (chamadas) => {
      const vereditos = await conferirCepsEmLote([
        CADASTRO_OK,
        { ...CADASTRO_OK, endereco: 'Rua das Flores, 20' },
        { cep: '99999999', endereco: 'Rua das Flores', cidade: 'Campinas', uf: 'SP' }, // UF do CEP = MG
        CADASTRO_OK,
      ]);
      assert.deepEqual(vereditos, ['bate', 'bate', 'nao_bate', 'bate']);
      assert.equal(chamadas.length, 2, '4 paradas, 2 CEPs distintos → 2 consultas');
    },
  );
});

test('cache: rodar a MESMA rota de novo não consulta o ViaCEP outra vez', async () => {
  await comFetchFake(
    () => ({ ok: true, payload: PAYLOAD_OK }),
    async (chamadas) => {
      await conferirCepsEmLote([CADASTRO_OK]);
      const segunda = await conferirCepsEmLote([CADASTRO_OK]);
      assert.deepEqual(segunda, ['bate']);
      assert.equal(chamadas.length, 1, 'a 2ª conferência sai do cache de módulo');
    },
  );
});

test('ViaCEP fora do ar (throw) → indeterminado e NÃO entra no cache (o CEP pode estar certo)', async () => {
  await comFetchFake(
    () => 'erro_de_rede',
    async (chamadas) => {
      assert.deepEqual(await conferirCepsEmLote([CADASTRO_OK]), ['indeterminado']);
      assert.deepEqual(await conferirCepsEmLote([CADASTRO_OK]), ['indeterminado']);
      assert.equal(chamadas.length, 2, 'falha de rede não pode virar veredito cacheado');
    },
  );
});

test('HTTP != 200 → indeterminado (silêncio), nunca acusa', async () => {
  await comFetchFake(
    () => ({ ok: false }),
    async () => {
      assert.deepEqual(await conferirCepsEmLote([CADASTRO_OK]), ['indeterminado']);
    },
  );
});

test('CEP inexistente (ViaCEP responde erro:true) → indeterminado, não é prova de endereço errado', async () => {
  await comFetchFake(
    () => ({ ok: true, payload: { erro: true } }),
    async () => {
      assert.deepEqual(await conferirCepsEmLote([CADASTRO_OK]), ['indeterminado']);
    },
  );
});

test('kill-switch HBX_CEP_CONFERENCIA_ENABLED=0 → nenhuma consulta, tudo indeterminado', async () => {
  const anterior = process.env.HBX_CEP_CONFERENCIA_ENABLED;
  process.env.HBX_CEP_CONFERENCIA_ENABLED = '0';
  try {
    await comFetchFake(
      () => ({ ok: true, payload: PAYLOAD_OK }),
      async (chamadas) => {
        assert.deepEqual(await conferirCepsEmLote([CADASTRO_OK]), ['indeterminado']);
        assert.equal(chamadas.length, 0);
      },
    );
  } finally {
    if (anterior === undefined) delete process.env.HBX_CEP_CONFERENCIA_ENABLED;
    else process.env.HBX_CEP_CONFERENCIA_ENABLED = anterior;
  }
});

test('flag AUSENTE = LIGADA (feature entregue desligada, pro dono, é bug)', async () => {
  const anterior = process.env.HBX_CEP_CONFERENCIA_ENABLED;
  delete process.env.HBX_CEP_CONFERENCIA_ENABLED;
  try {
    await comFetchFake(
      () => ({ ok: true, payload: { ...PAYLOAD_OK, uf: 'MG' } }),
      async (chamadas) => {
        assert.deepEqual(await conferirCepsEmLote([CADASTRO_OK]), ['nao_bate']);
        assert.equal(chamadas.length, 1);
      },
    );
  } finally {
    if (anterior !== undefined) process.env.HBX_CEP_CONFERENCIA_ENABLED = anterior;
  }
});

test('lote vazio → lista vazia, sem consulta', async () => {
  await comFetchFake(
    () => ({ ok: true, payload: PAYLOAD_OK }),
    async (chamadas) => {
      assert.deepEqual(await conferirCepsEmLote([]), []);
      assert.equal(chamadas.length, 0);
    },
  );
});
