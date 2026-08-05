import test from 'node:test';
import assert from 'node:assert/strict';
import { EspelhoAppService, ESPELHO_TTL_MS } from './espelho-app.service';

/**
 * VER TELA — o espelho do app (PR05082026-VER-TELA V2, 05/08).
 *
 * O que morde nesta frente:
 *  - a janela de 60s é a ÚNICA autorização: fora dela, quadro é recusado;
 *  - aparelho de outra empresa nunca grava no espelho de ninguém;
 *  - quadro sem css NÃO apaga o css já guardado (senão o painel pisca);
 *  - o servidor só pede o css quando a VERSÃO do app mudou;
 *  - html gigante é RECUSADO, nunca cortado (html cortado vira sopa na tela);
 *  - banco caindo devolve "desligado", nunca derruba o poll da rota.
 */

type Device = { id: string; companyId: number; espelhoAte: Date | null; appVersion: string | null };
type Quadro = {
  deviceId: string;
  companyId: number;
  tela: string;
  html: string;
  tema?: string | null;
  bodyClass?: string | null;
  css?: string | null;
  cssVersao?: string | null;
  at: Date;
};

function harness(devices: Device[], quadros: Quadro[] = [], opts: { explodir?: boolean } = {}) {
  const prisma: any = {
    mobileDevice: {
      findUnique: async ({ where }: any) => {
        if (opts.explodir) throw new Error('banco fora do ar');
        return devices.find((d) => d.id === where.id) ?? null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const d of devices) {
          if (d.id !== where.id) continue;
          if (where.companyId != null && d.companyId !== where.companyId) continue;
          Object.assign(d, data);
          count++;
        }
        return { count };
      },
    },
    mobileEspelhoQuadro: {
      findUnique: async ({ where }: any) => quadros.find((q) => q.deviceId === where.deviceId) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const atual = quadros.find((q) => q.deviceId === where.deviceId);
        if (atual) Object.assign(atual, update);
        else quadros.push({ ...create });
        return atual ?? quadros[quadros.length - 1];
      },
    },
  };
  return { devices, quadros, service: new EspelhoAppService(prisma) };
}

const AGORA = () => new Date();
const DAQUI_A_POUCO = () => new Date(Date.now() + 30_000);
const JA_ERA = () => new Date(Date.now() - 1_000);

test('abrir: a janela nasce com 60s de vida e é escopada pela empresa do aparelho', async () => {
  const h = harness([{ id: 'e13', companyId: 41, espelhoAte: null, appVersion: '150' }]);
  const antes = Date.now();
  const saida = await h.service.abrir('e13');
  const ate = new Date(saida.ate).getTime();
  assert.ok(ate >= antes + ESPELHO_TTL_MS - 500 && ate <= Date.now() + ESPELHO_TTL_MS + 500);
  assert.ok(h.devices[0].espelhoAte, 'a janela ficou gravada no aparelho');
});

test('quadro só entra com a JANELA ABERTA — expirada, o app é recusado', async () => {
  const h = harness([{ id: 'e13', companyId: 41, espelhoAte: JA_ERA(), appVersion: '150' }]);
  assert.deepEqual(await h.service.gravarQuadro(41, 'e13', { tela: 'rota', html: '<div>oi</div>' }), { ok: false });
  assert.equal(h.quadros.length, 0);

  h.devices[0].espelhoAte = DAQUI_A_POUCO();
  assert.deepEqual(await h.service.gravarQuadro(41, 'e13', { tela: 'rota', html: '<div>oi</div>' }), { ok: true });
  assert.equal(h.quadros.length, 1);
  assert.equal(h.quadros[0].tela, 'rota');
});

test('empresa do JWT tem que bater com a do aparelho (nada atravessa tenant)', async () => {
  const h = harness([{ id: 'e13', companyId: 41, espelhoAte: DAQUI_A_POUCO(), appVersion: '150' }]);
  assert.deepEqual(await h.service.gravarQuadro(48, 'e13', { tela: 'rota', html: '<div>x</div>' }), { ok: false });
  assert.equal(h.quadros.length, 0);
});

test('quadro sem css NÃO apaga o css já guardado', async () => {
  const h = harness(
    [{ id: 'e13', companyId: 41, espelhoAte: DAQUI_A_POUCO(), appVersion: '150' }],
  );
  await h.service.gravarQuadro(41, 'e13', { tela: 'rota', html: '<div>1</div>', css: '.a{}' });
  await h.service.gravarQuadro(41, 'e13', { tela: 'clientes', html: '<div>2</div>' });
  assert.equal(h.quadros[0].css, '.a{}', 'o css sobreviveu ao quadro seguinte');
  assert.equal(h.quadros[0].cssVersao, '150');
  assert.equal(h.quadros[0].html, '<div>2</div>', 'mas a tela é a nova');
});

test('o css é pedido de novo quando a VERSÃO do app muda', async () => {
  const h = harness(
    [{ id: 'e13', companyId: 41, espelhoAte: DAQUI_A_POUCO(), appVersion: '150' }],
    [{ deviceId: 'e13', companyId: 41, tela: 'rota', html: '<b/>', css: '.a{}', cssVersao: '150', at: AGORA() }],
  );
  assert.deepEqual(await h.service.estado('e13'), { ativo: true, precisaCss: false });
  h.devices[0].appVersion = '151';
  assert.deepEqual(await h.service.estado('e13'), { ativo: true, precisaCss: true }, 'APK novo, CSS novo');
});

test('estado: janela fechada = desligado, e sem aparelho também', async () => {
  const h = harness([{ id: 'e13', companyId: 41, espelhoAte: JA_ERA(), appVersion: '150' }]);
  assert.deepEqual(await h.service.estado('e13'), { ativo: false, precisaCss: false });
  assert.deepEqual(await h.service.estado('nao-existe'), { ativo: false, precisaCss: false });
  assert.deepEqual(await h.service.estado(''), { ativo: false, precisaCss: false });
});

test('banco fora do ar NÃO derruba o poll: estado devolve desligado', async () => {
  const h = harness([{ id: 'e13', companyId: 41, espelhoAte: DAQUI_A_POUCO(), appVersion: '150' }], [], { explodir: true });
  assert.deepEqual(await h.service.estado('e13'), { ativo: false, precisaCss: false });
});

test('html gigante é RECUSADO inteiro (cortado no meio de uma tag vira sopa)', async () => {
  const h = harness([{ id: 'e13', companyId: 41, espelhoAte: DAQUI_A_POUCO(), appVersion: '150' }]);
  const gigante = '<div>'.repeat(90_000);
  assert.deepEqual(await h.service.gravarQuadro(41, 'e13', { tela: 'rota', html: gigante }), { ok: false });
  assert.equal(h.quadros.length, 0);
  assert.deepEqual(await h.service.gravarQuadro(41, 'e13', { tela: 'rota', html: '' }), { ok: false }, 'quadro vazio não é quadro');
});

test('quadro do master: devolve tema/bodyClass e diz se a janela ainda vale', async () => {
  const h = harness(
    [{ id: 'e13', companyId: 41, espelhoAte: DAQUI_A_POUCO(), appVersion: '150' }],
    [{ deviceId: 'e13', companyId: 41, tela: 'caderneta', html: '<main/>', tema: 'dark', bodyClass: 'keyboard-open', css: '.a{}', cssVersao: '150', at: AGORA() }],
  );
  const q = await h.service.quadro('e13');
  assert.equal(q.ativo, true);
  assert.equal(q.tema, 'dark');
  assert.equal(q.bodyClass, 'keyboard-open');
  assert.equal(q.tela, 'caderneta');
  assert.equal(typeof q.at, 'string', 'o painel recebe ISO, não Date');

  h.devices[0].espelhoAte = JA_ERA();
  assert.equal((await h.service.quadro('e13')).ativo, false);
});

test('aparelho inexistente vira 404 no master (e id vazio, 400)', async () => {
  const h = harness([]);
  await assert.rejects(() => h.service.abrir('nao-existe'), /não encontrado/i);
  await assert.rejects(() => h.service.quadro('  '), /inválido/i);
});
