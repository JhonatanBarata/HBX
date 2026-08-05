import test from 'node:test';
import assert from 'node:assert/strict';
import { PulsoAppService } from './pulso-app.service';

/**
 * PULSO DO APP (PR04082026-PULSO-DO-APP, 04/08).
 *
 * Os testes cobrem exatamente o que MORDE nesta frente:
 *  - troca de tela grava 1 linha de trilha;
 *  - tela REPETIDA não grava (5s de poll viraria lixão);
 *  - tela inválida é ignorada em SILÊNCIO, sem erro;
 *  - APK velho (sem o campo) segue funcionando;
 *  - banco caindo não derruba o poll (o recado é operação, o pulso é enfeite).
 */

type Aparelho = {
  id: string;
  companyId: number;
  userId: number;
  revokedAt: Date | null;
  ultimaTela: string | null;
  ultimaTelaAt: Date | null;
  appVersion?: string | null;
};

type Trilha = { companyId: number; deviceId: string; userId: number; tela: string; at: Date };

function harness(opts: { aparelhos?: Aparelho[]; explodir?: boolean } = {}) {
  const aparelhos: Aparelho[] = opts.aparelhos ?? [
    { id: 'dev-1', companyId: 1, userId: 7, revokedAt: null, ultimaTela: null, ultimaTelaAt: null, appVersion: '117' },
  ];
  const trilha: Trilha[] = [];
  const apagados: Trilha[] = [];

  function casa(row: Aparelho, where: any): boolean {
    if (where.id != null && row.id !== where.id) return false;
    if (where.companyId != null && row.companyId !== where.companyId) return false;
    if (where.revokedAt === null && row.revokedAt !== null) return false;
    if (Array.isArray(where.OR)) {
      const algum = where.OR.some((clausula: any) => {
        if ('ultimaTela' in clausula) {
          const alvo = clausula.ultimaTela;
          if (alvo === null) return row.ultimaTela === null;
          if (alvo && typeof alvo === 'object' && 'not' in alvo) {
            return row.ultimaTela !== null && row.ultimaTela !== alvo.not;
          }
          return row.ultimaTela === alvo;
        }
        return false;
      });
      if (!algum) return false;
    }
    return true;
  }

  const prisma: any = {
    mobileDevice: {
      updateMany: async ({ where, data }: any) => {
        if (opts.explodir) throw new Error('banco fora do ar');
        let count = 0;
        for (const row of aparelhos) {
          if (!casa(row, where)) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
      findMany: async ({ where, take }: any) => {
        let saida = aparelhos.filter((row) => (where?.revokedAt === null ? row.revokedAt === null : true));
        saida = [...saida].sort((a, b) => (b.ultimaTelaAt?.getTime() ?? -1) - (a.ultimaTelaAt?.getTime() ?? -1));
        if (take) saida = saida.slice(0, take);
        return saida.map((row) => ({
          ...row,
          company: { name: `Empresa ${row.companyId}` },
          user: { name: `Pessoa ${row.userId}`, username: null, email: null },
        }));
      },
    },
    mobileTelaTrilha: {
      create: async ({ data }: any) => {
        if (opts.explodir) throw new Error('banco fora do ar');
        trilha.push({ ...data, at: data.at ?? new Date() });
        return data;
      },
      findMany: async ({ where, take }: any) => {
        let saida = trilha.filter((row) => {
          if (where.deviceId != null && row.deviceId !== where.deviceId) return false;
          if (where.at?.gte && row.at < where.at.gte) return false;
          if (where.at?.lte && row.at > where.at.lte) return false;
          return true;
        });
        saida = [...saida].sort((a, b) => a.at.getTime() - b.at.getTime());
        if (take) saida = saida.slice(0, take);
        return saida;
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (let i = trilha.length - 1; i >= 0; i--) {
          if (where.at?.lt && trilha[i].at < where.at.lt) {
            apagados.push(trilha.splice(i, 1)[0]);
            count++;
          }
        }
        return { count };
      },
    },
  };

  return { service: new PulsoAppService(prisma), aparelhos, trilha, apagados };
}

/** O usuário como o JwtStrategy entrega para um token de APK pareado. */
const USER_APK = { id: 7, companyId: 1, sessionId: 'mobile:dev-1' };

test('troca de tela: grava a tela no aparelho E abre 1 linha na trilha', async () => {
  const h = harness();
  const r = await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota');
  assert.equal(r, 'gravado');
  assert.equal(h.aparelhos[0].ultimaTela, 'rota');
  assert.ok(h.aparelhos[0].ultimaTelaAt, 'o carimbo de hora é do servidor');
  assert.equal(h.trilha.length, 1);
  assert.deepEqual(
    { tela: h.trilha[0].tela, companyId: h.trilha[0].companyId, userId: h.trilha[0].userId },
    { tela: 'rota', companyId: 1, userId: 7 },
  );
});

test('tela REPETIDA no poll de 5s NÃO abre linha nova — só reCARIMBA a hora', async () => {
  const h = harness();
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota');
  const primeiroCarimbo = h.aparelhos[0].ultimaTelaAt;
  await new Promise((r) => setTimeout(r, 5));
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota');
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota');

  assert.equal(h.trilha.length, 1, 'trilha é 1 linha por TROCA, nunca por poll');
  assert.notEqual(
    h.aparelhos[0].ultimaTelaAt?.getTime(),
    primeiroCarimbo?.getTime(),
    'a hora continua andando — é ela que acende o 🟢 do painel',
  );
});

test('ida e volta entre telas grava as duas trocas, na ordem', async () => {
  const h = harness();
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota');
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'clientes');
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'clientes');
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota');
  assert.deepEqual(h.trilha.map((t) => t.tela), ['rota', 'clientes', 'rota']);
});

test('APK VELHO (sem o campo tela) segue normal: nada gravado, nada quebrado', async () => {
  const h = harness();
  assert.equal(await h.service.registrarDoPoll(USER_APK, 1, 7, undefined), 'ignorado');
  assert.equal(h.trilha.length, 0);
  assert.equal(h.aparelhos[0].ultimaTela, null);
  assert.equal(h.aparelhos[0].ultimaTelaAt, null, 'sem tela não há pulso a carimbar');
});

test('tela INVÁLIDA é ignorada em silêncio (nunca 400 no poll da rota)', async () => {
  const h = harness();
  const lixo: unknown[] = [
    '   ',
    'tela com espaço',
    'a'.repeat(41),
    'drop/table',
    'acentuação',
    42,
    null,
    { tela: 'rota' },
    ['rota'],
  ];
  for (const valor of lixo) {
    assert.equal(await h.service.registrarDoPoll(USER_APK, 1, 7, valor), 'ignorado', String(valor));
  }
  assert.equal(h.trilha.length, 0);
  assert.equal(h.aparelhos[0].ultimaTela, null);
});

test('sanitizarTela: aceita o vocabulário do app e normaliza a caixa', () => {
  const { service } = harness();
  assert.equal(service.sanitizarTela('rota'), 'rota');
  assert.equal(service.sanitizarTela('cliente:ficha'), 'cliente:ficha');
  assert.equal(service.sanitizarTela('cliente-ficha'), 'cliente-ficha');
  assert.equal(service.sanitizarTela('  Chegada  '), 'chegada', 'Rota e rota são a MESMA tela');
  assert.equal(service.sanitizarTela('a'.repeat(40)), 'a'.repeat(40), '40 é o tamanho da coluna');
  assert.equal(service.sanitizarTela('a'.repeat(41)), null);
});

test('sessão WEB comum (sem aparelho) não gera pulso — pulso é de APARELHO', async () => {
  const h = harness();
  const web = { id: 7, companyId: 1, sessionId: 'b0a1c2d3-web' };
  assert.equal(await h.service.registrarDoPoll(web, 1, 7, 'rota'), 'ignorado');
  assert.equal(h.trilha.length, 0);
});

test('deviceId NUNCA vem do corpo: só o sessionId mobile: do JWT vale', () => {
  const { service } = harness();
  assert.equal(service.resolveDeviceIdDaSessao({ sessionId: 'mobile:dev-1' }), 'dev-1');
  assert.equal(service.resolveDeviceIdDaSessao({ sessionId: 'ops-control' }), null);
  assert.equal(service.resolveDeviceIdDaSessao({ sessionId: 'imp:9' }), null);
  assert.equal(service.resolveDeviceIdDaSessao({ sessionId: 'mobile:' }), null);
  assert.equal(service.resolveDeviceIdDaSessao(null), null);
});

test('banco fora do ar NÃO derruba o poll (recado é operação, pulso é enfeite)', async () => {
  const h = harness({ explodir: true });
  assert.equal(await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota'), 'ignorado');
});

test('aparelho REVOGADO não recebe pulso nem abre trilha', async () => {
  const h = harness({
    aparelhos: [
      { id: 'dev-1', companyId: 1, userId: 7, revokedAt: new Date(), ultimaTela: null, ultimaTelaAt: null },
    ],
  });
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'rota');
  assert.equal(h.trilha.length, 0);
  assert.equal(h.aparelhos[0].ultimaTela, null);
});

test('multi-tenant: aparelho de OUTRA empresa não é tocado pelo poll', async () => {
  const h = harness();
  await h.service.registrarDoPoll(USER_APK, 2, 7, 'rota');
  assert.equal(h.trilha.length, 0);
  assert.equal(h.aparelhos[0].ultimaTela, null);
});

test('faxina lazy: só entra depois de 50 trocas e guarda hoje + D-1', async () => {
  const h = harness();
  const anteontem = new Date();
  anteontem.setDate(anteontem.getDate() - 2);
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  h.trilha.push({ companyId: 1, deviceId: 'dev-1', userId: 7, tela: 'velha', at: anteontem });
  h.trilha.push({ companyId: 1, deviceId: 'dev-1', userId: 7, tela: 'ontem', at: ontem });

  // 49 trocas: ainda NÃO faxina (a linha velha continua lá).
  for (let i = 0; i < 49; i++) {
    await h.service.registrarDoPoll(USER_APK, 1, 7, i % 2 === 0 ? 'rota' : 'clientes');
  }
  assert.ok(h.trilha.some((t) => t.tela === 'velha'), 'faxina não roda a cada poll');

  // A 50ª dispara a faxina.
  await h.service.registrarDoPoll(USER_APK, 1, 7, 'chegada');
  assert.equal(h.trilha.some((t) => t.tela === 'velha'), false, 'anteontem sai');
  assert.ok(h.trilha.some((t) => t.tela === 'ontem'), 'D-1 fica');
});

test('painel master: aberto AGORA é < 15s e nunca vem do relógio do aparelho', async () => {
  const agora = new Date('2026-08-04T21:02:00.000Z');
  const h = harness({
    aparelhos: [
      { id: 'dev-1', companyId: 1, userId: 7, revokedAt: null, ultimaTela: 'clientes', ultimaTelaAt: new Date(agora.getTime() - 5_000), appVersion: '117' },
      { id: 'dev-2', companyId: 2, userId: 8, revokedAt: null, ultimaTela: 'rota', ultimaTelaAt: new Date(agora.getTime() - 60_000), appVersion: '116' },
      { id: 'dev-3', companyId: 3, userId: 9, revokedAt: null, ultimaTela: null, ultimaTelaAt: null, appVersion: null },
    ],
  });

  const linhas = await h.service.listarAparelhos(agora);
  assert.deepEqual(linhas.map((l) => l.deviceId), ['dev-1', 'dev-2', 'dev-3'], 'mais recente primeiro');
  assert.equal(linhas[0].abertoAgora, true);
  assert.equal(linhas[1].abertoAgora, false, 'fora do app — nunca "offline"');
  assert.equal(linhas[2].abertoAgora, false);
  assert.equal(linhas[2].ultimaTelaAt, null, 'aparelho que nunca pulsou não inventa hora');
  assert.equal(linhas[0].companyName, 'Empresa 1');
  assert.equal(linhas[0].userName, 'Pessoa 7');
  assert.equal(linhas[0].appVersion, '117');
});

test('trilha do dia: só o aparelho pedido, do mais antigo pro mais novo', async () => {
  const h = harness();
  const hoje = new Date();
  hoje.setHours(9, 0, 0, 0);
  h.trilha.push({ companyId: 1, deviceId: 'dev-2', userId: 8, tela: 'financeiro', at: hoje });
  h.trilha.push({ companyId: 1, deviceId: 'dev-1', userId: 7, tela: 'clientes', at: new Date(hoje.getTime() + 60_000) });
  h.trilha.push({ companyId: 1, deviceId: 'dev-1', userId: 7, tela: 'rota', at: hoje });

  const pontos = await h.service.trilhaDoDia('dev-1');
  assert.deepEqual(pontos.map((p) => p.tela), ['rota', 'clientes']);
  assert.equal(typeof pontos[0].at, 'string', 'o painel recebe ISO, não Date');
  assert.deepEqual(await h.service.trilhaDoDia('  '), [], 'sem aparelho, sem trilha');
});

test('trilha do dia: data torta cai em HOJE em vez de estourar', async () => {
  const h = harness();
  const hoje = new Date();
  hoje.setHours(10, 0, 0, 0);
  h.trilha.push({ companyId: 1, deviceId: 'dev-1', userId: 7, tela: 'rota', at: hoje });
  assert.equal((await h.service.trilhaDoDia('dev-1', 'ontem de manhã')).length, 1);
  assert.equal((await h.service.trilhaDoDia('dev-1', '')).length, 1);
});
