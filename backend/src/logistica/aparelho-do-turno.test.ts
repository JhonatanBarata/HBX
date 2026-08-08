import test from 'node:test';
import assert from 'node:assert/strict';
import { elegiveisParaOperacao, resolverAparelhoDoTurno, ultimoSinal } from './aparelho-do-turno';

/**
 * O caso REAL que gerou esta régua (08/08, company 49): o aparelho de teste do
 * dono (g15) estava pareado no login do cliente e, por estar com o app aberto,
 * puxava todo recado antes do celular do cliente (e22) — que ficava mudo. Os
 * testes abaixo são esse dia, congelado.
 */

const AGORA = new Date('2026-08-08T06:00:00.000Z');
const minutos = (n: number) => new Date(AGORA.getTime() - n * 60_000);

function aparelho(over: Record<string, any> = {}) {
  return {
    id: over.id || 'dev_1',
    name: over.name ?? null,
    revokedAt: null,
    ocultoEm: null,
    recebeOperacao: true,
    principalDesde: null,
    ultimaTelaAt: null,
    lastUsedAt: null,
    ...over,
  };
}

test('sem aparelho elegível devolve null (recado não se perde, só não tem alvo)', () => {
  assert.equal(resolverAparelhoDoTurno([]), null);
  assert.equal(
    resolverAparelhoDoTurno([aparelho({ revokedAt: minutos(1) })]),
    null,
  );
});

test('aparelho derrubado, escondido ou de teste NUNCA entra na operação', () => {
  const lista = [
    aparelho({ id: 'derrubado', revokedAt: minutos(5), lastUsedAt: minutos(1) }),
    aparelho({ id: 'escondido', ocultoEm: minutos(5), lastUsedAt: minutos(1) }),
    aparelho({ id: 'teste', recebeOperacao: false, lastUsedAt: minutos(1) }),
    aparelho({ id: 'bom', lastUsedAt: minutos(30) }),
  ];
  assert.deepEqual(
    elegiveisParaOperacao(lista).map((item) => item.id),
    ['bom'],
  );
  // O de teste está MUITO mais ativo e mesmo assim perde: é o bug de 08/08.
  assert.equal(resolverAparelhoDoTurno(lista)?.id, 'bom');
});

test('o dia 08/08: aparelho de teste ativo x celular do cliente parado', () => {
  const g15Teste = aparelho({ id: 'g15', recebeOperacao: false, ultimaTelaAt: minutos(1), lastUsedAt: minutos(1) });
  const e22Cliente = aparelho({ id: 'e22', lastUsedAt: minutos(45) });
  assert.equal(resolverAparelhoDoTurno([g15Teste, e22Cliente])?.id, 'e22');
});

test('fixado pelo escritório vence quem está mais ativo', () => {
  const fixado = aparelho({ id: 'fixado', principalDesde: minutos(600), lastUsedAt: minutos(300) });
  const ativo = aparelho({ id: 'ativo', lastUsedAt: minutos(1) });
  assert.equal(resolverAparelhoDoTurno([ativo, fixado])?.id, 'fixado');
});

test('fixar de novo é TROCAR de aparelho: o mais recente vence', () => {
  const ontem = aparelho({ id: 'ontem', principalDesde: minutos(2000) });
  const hoje = aparelho({ id: 'hoje', principalDesde: minutos(10) });
  assert.equal(resolverAparelhoDoTurno([ontem, hoje])?.id, 'hoje');
});

test('sem ninguém fixado, ganha o último sinal — tela ou ponte nativa, o que for mais novo', () => {
  const soPonte = aparelho({ id: 'ponte', lastUsedAt: minutos(2) });
  const soTela = aparelho({ id: 'tela', ultimaTelaAt: minutos(9) });
  assert.equal(resolverAparelhoDoTurno([soTela, soPonte])?.id, 'ponte');

  const telaNova = aparelho({ id: 'telaNova', ultimaTelaAt: minutos(1), lastUsedAt: minutos(120) });
  assert.equal(ultimoSinal(telaNova), minutos(1).getTime());
  assert.equal(resolverAparelhoDoTurno([soPonte, telaNova])?.id, 'telaNova');
});

test('dois aparelhos zerados não podem alternar de alvo a cada disparo', () => {
  const a = aparelho({ id: 'aaa' });
  const b = aparelho({ id: 'bbb' });
  assert.equal(resolverAparelhoDoTurno([a, b])?.id, 'aaa');
  assert.equal(resolverAparelhoDoTurno([b, a])?.id, 'aaa');
});
