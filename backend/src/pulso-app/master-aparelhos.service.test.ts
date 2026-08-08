import test from 'node:test';
import assert from 'node:assert/strict';
import { MasterAparelhosService } from './master-aparelhos.service';

/**
 * PAINEL DO CLIENTE — aparelhos por empresa (PR05082026-VER-TELA, 05/08).
 *
 * O que morde nesta frente:
 *  - a lista é DA EMPRESA (aparelho de outra empresa nunca aparece na ficha);
 *  - aparelho derrubado/removido some da lista, mas a LINHA fica;
 *  - "aberto agora" é do relógio do SERVIDOR (< 15s), nunca do aparelho;
 *  - derrubar sobe a tokenVersion (é o que mata a sessão no jwt.strategy);
 *  - aparelho inexistente vira 404, não 500 nem "ok" mentiroso.
 */

type Aparelho = {
  id: string;
  companyId: number;
  userId: number;
  name: string | null;
  createdAt: Date;
  appVersion: string | null;
  ultimaTela: string | null;
  ultimaTelaAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  ocultoEm: Date | null;
  tokenVersion: number;
  webTicketHash?: string | null;
};

const PAREADO = new Date('2026-07-17T12:00:00.000Z');

function aparelho(over: Partial<Aparelho> & { id: string; companyId: number }): Aparelho {
  return {
    userId: 7,
    name: 'moto e13',
    createdAt: PAREADO,
    appVersion: '149',
    ultimaTela: null,
    ultimaTelaAt: null,
    lastUsedAt: null,
    revokedAt: null,
    ocultoEm: null,
    tokenVersion: 3,
    webTicketHash: 'ticket',
    ...over,
  };
}

function harness(linhas: Aparelho[]) {
  const casa = (row: Aparelho, where: any): boolean => {
    if (where?.id != null && row.id !== where.id) return false;
    if (where?.companyId != null && row.companyId !== where.companyId) return false;
    if (where?.revokedAt === null && row.revokedAt !== null) return false;
    if (where?.ocultoEm === null && row.ocultoEm !== null) return false;
    return true;
  };

  const prisma: any = {
    mobileDevice: {
      findMany: async ({ where, take }: any) => {
        let saida = linhas.filter((row) => casa(row, where));
        saida = [...saida].sort((a, b) => (b.ultimaTelaAt?.getTime() ?? -1) - (a.ultimaTelaAt?.getTime() ?? -1));
        if (take) saida = saida.slice(0, take);
        return saida.map((row) => ({ ...row, user: { name: `Pessoa ${row.userId}`, username: null, email: null } }));
      },
      findUnique: async ({ where }: any) => linhas.find((row) => row.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of linhas) {
          if (!casa(row, where)) continue;
          for (const [chave, valor] of Object.entries(data as Record<string, any>)) {
            if (valor && typeof valor === 'object' && 'increment' in valor) {
              (row as any)[chave] = Number((row as any)[chave] || 0) + Number(valor.increment);
            } else {
              (row as any)[chave] = valor;
            }
          }
          count++;
        }
        return { count };
      },
    },
  };

  return { linhas, service: new MasterAparelhosService(prisma) };
}

test('lista é DA EMPRESA: aparelho de outro tenant nunca entra na ficha', async () => {
  const agora = new Date('2026-08-05T12:00:00.000Z');
  const h = harness([
    aparelho({ id: 'e13', companyId: 41, name: 'moto e13', ultimaTela: 'caderneta', ultimaTelaAt: new Date(agora.getTime() - 5_000) }),
    aparelho({ id: 'g15', companyId: 41, name: 'moto g15', userId: 9, ultimaTela: 'rota', ultimaTelaAt: new Date(agora.getTime() - 60_000) }),
    aparelho({ id: 'outra', companyId: 48, name: 'celular do dono' }),
  ]);

  const lista = await h.service.listar(41, agora);
  assert.deepEqual(lista.map((l) => l.deviceId), ['e13', 'g15'], 'mais recente primeiro, só da 41');
  assert.equal(lista[0].abertoAgora, true);
  assert.equal(lista[1].abertoAgora, false, 'fora do app — nunca "offline"');
  assert.equal(lista[0].deviceName, 'moto e13', 'o NOME é o que separa o celular real do de teste');
  assert.equal(lista[0].pareadoEm, PAREADO.toISOString());
  assert.equal(lista[0].userName, 'Pessoa 7');
  assert.equal(lista[0].appVersion, '149');
});

test('aparelho que nunca pulsou não inventa hora nem presença', async () => {
  const h = harness([aparelho({ id: 'novo', companyId: 41, appVersion: null })]);
  const [linha] = await h.service.listar(41);
  assert.equal(linha.ultimaTelaAt, null);
  assert.equal(linha.ultimaTela, null);
  assert.equal(linha.abertoAgora, false);
  assert.equal(linha.appVersion, null);
  assert.equal(linha.situacao, 'fora_do_app', 'sem pulso E sem heartbeat: aí sim é fora do app');
});

/**
 * 🔴 O CASO moto e22 (08/08). Aparelho ligado, falando com o servidor, e o painel
 * escrevia "fora do app" porque o APK dele não manda o pulso de tela — que morreu
 * na fusão de 07/08. O dono viu e disse: "fala que está offline! e não está".
 *
 * Ausência de dado tem NOME PRÓPRIO. Nunca vira afirmação.
 */
test('nunca pulsou mas FALOU agora: é "não sei", nunca "fora do app"', async () => {
  const agora = new Date('2026-08-08T05:30:00.000Z');
  const h = harness([
    aparelho({ id: 'e22', companyId: 49, name: 'moto e22', lastUsedAt: new Date(agora.getTime() - 60_000) }),
  ]);
  const [linha] = await h.service.listar(49, agora);
  assert.equal(linha.situacao, 'sem_pulso');
  assert.equal(linha.abertoAgora, false, 'heartbeat NUNCA promove a "está no app": ele não prova tela aberta');
  assert.equal(linha.falouEm, new Date(agora.getTime() - 60_000).toISOString());
});

test('heartbeat velho não segura "não sei": celular desligado é fora do app', async () => {
  const agora = new Date('2026-08-08T05:30:00.000Z');
  const h = harness([
    aparelho({ id: 'e22', companyId: 49, lastUsedAt: new Date(agora.getTime() - 30 * 60_000) }),
  ]);
  const [linha] = await h.service.listar(49, agora);
  assert.equal(linha.situacao, 'fora_do_app');
});

test('pulso fresco MANDA: heartbeat não muda quem está no app', async () => {
  const agora = new Date('2026-08-08T05:30:00.000Z');
  const h = harness([
    aparelho({
      id: 'g15', companyId: 49, ultimaTela: 'rota',
      ultimaTelaAt: new Date(agora.getTime() - 5_000),
      lastUsedAt: new Date(agora.getTime() - 5_000),
    }),
    // Pulsou um dia, hoje não: tem dado, e o dado diz que ele saiu. Heartbeat
    // fresco (sync nativo com o app FECHADO) não pode reabrir o app na tela.
    aparelho({
      id: 'velho', companyId: 49, ultimaTela: 'rota',
      ultimaTelaAt: new Date(agora.getTime() - 10 * 60_000),
      lastUsedAt: new Date(agora.getTime() - 10_000),
    }),
  ]);
  const lista = await h.service.listar(49, agora);
  assert.equal(lista.find((l) => l.deviceId === 'g15')?.situacao, 'no_app');
  assert.equal(lista.find((l) => l.deviceId === 'velho')?.situacao, 'fora_do_app');
});

test('derrubado e removido somem da lista; a LINHA continua no banco', async () => {
  const h = harness([
    aparelho({ id: 'vivo', companyId: 41 }),
    aparelho({ id: 'derrubado', companyId: 41, revokedAt: new Date() }),
    aparelho({ id: 'removido', companyId: 41, revokedAt: new Date(), ocultoEm: new Date() }),
  ]);
  assert.deepEqual((await h.service.listar(41)).map((l) => l.deviceId), ['vivo']);
  assert.equal(h.linhas.length, 3, 'nada foi apagado — a vaga é do celular, pra sempre');
});

test('derrubar: revoga, sobe a tokenVersion e devolve o NOME (a tela confirma por nome)', async () => {
  const h = harness([aparelho({ id: 'e13', companyId: 41, name: 'moto e13' })]);
  const saida = await h.service.derrubar('e13');
  assert.equal(saida.deviceName, 'moto e13');
  const linha = h.linhas[0];
  assert.ok(linha.revokedAt, 'sessão revogada');
  assert.equal(linha.ocultoEm, null, 'derrubar NÃO esconde — o aparelho continua na ficha');
  assert.equal(linha.tokenVersion, 4, 'tokenVersion++ é o que mata a sessão no jwt.strategy');
  assert.equal(linha.webTicketHash, null);
});

test('remover: derruba E esconde da lista', async () => {
  const h = harness([aparelho({ id: 'fantasma', companyId: 41, name: null })]);
  const saida = await h.service.remover('fantasma');
  assert.equal(saida.deviceName, null, 'aparelho sem nome não vira string "null" na tela');
  assert.ok(h.linhas[0].revokedAt);
  assert.ok(h.linhas[0].ocultoEm);
  assert.equal((await h.service.listar(41)).length, 0);
});

test('aparelho inexistente vira 404 e empresa torta vira 400 — nunca "ok" mentiroso', async () => {
  const h = harness([aparelho({ id: 'e13', companyId: 41 })]);
  await assert.rejects(() => h.service.derrubar('nao-existe'), /não encontrado/i);
  await assert.rejects(() => h.service.remover('   '), /inválido/i);
  await assert.rejects(() => h.service.listar('abc'), /inválida/i);
  await assert.rejects(() => h.service.listar(0), /inválida/i);
});

test('escrita é escopada por empresa: o where do updateMany leva companyId', async () => {
  const wheres: any[] = [];
  const prisma: any = {
    mobileDevice: {
      findUnique: async () => ({ id: 'e13', companyId: 41, name: 'moto e13' }),
      updateMany: async ({ where }: any) => { wheres.push(where); return { count: 1 }; },
      findMany: async () => [],
    },
  };
  const service = new MasterAparelhosService(prisma);
  await service.derrubar('e13');
  await service.remover('e13');
  assert.equal(wheres.length, 2);
  for (const where of wheres) {
    assert.equal(where.companyId, 41, 'sem companyId no where o tenant-guard reprova');
    assert.equal(where.id, 'e13');
  }
});
