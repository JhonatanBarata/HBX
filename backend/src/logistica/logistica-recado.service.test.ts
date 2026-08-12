import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRecadoService } from './logistica-recado.service';

/**
 * COCKPIT (03/08) — o canal de recado. Os testes cobrem o que MORDE:
 * multi-tenant, o portão (a garantia do clique), broadcast explodido e a
 * diferença entre "chegou no aparelho" e "a pessoa leu".
 */

type Linha = Record<string, any>;

/**
 * APARELHO DO TURNO (08/08): o `where` do pull passou a carregar
 * `OR: [{deviceId: X}, {deviceId: null}]`. O mock precisa entender esse OR,
 * senão o teste passa verde enquanto o banco entrega recado pro celular errado.
 */
function casaOr(where: any, row: Linha): boolean {
  if (!Array.isArray(where?.OR) || !where.OR.length) return true;
  return where.OR.some((clausula: any) => {
    if ('deviceId' in clausula) return (row.deviceId ?? null) === (clausula.deviceId ?? null);
    return false;
  });
}

function harness(
  opts: {
    linhas?: Linha[];
    motoristas?: number[];
    entregasPorDono?: number[];
    /** Aparelhos da empresa (o que a régua do turno enxerga). */
    aparelhos?: Linha[];
    /** Contas (CustomerProfile) — o alvo do anexo tipo 'parada'. */
    contas?: Linha[];
    /** Rotas salvas (LogisticaRotaModelo) — o alvo do anexo tipo 'rota'. */
    rotasSalvas?: Linha[];
  } = {},
) {
  const linhas: Linha[] = opts.linhas ? [...opts.linhas] : [];
  const criados: Linha[] = [];
  const entregasCriadas: Linha[] = [];
  let seq = 0;

  const prisma: any = {
    logisticaRecado: {
      create: async ({ data }: any) => {
        const row = { id: `rec_${++seq}`, createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null, loteId: null, ...data };
        linhas.push(row);
        criados.push(row);
        return row;
      },
      findMany: async ({ where, take }: any) => {
        let saida = linhas.filter((row) => {
          if (where.companyId != null && row.companyId !== where.companyId) return false;
          if (where.motoristaUserId != null && row.motoristaUserId !== where.motoristaUserId) return false;
          if (where.origem != null && row.origem !== where.origem) return false;
          if (where.entregueEm === null && row.entregueEm !== null) return false;
          if (where.entregueEm?.not === null && row.entregueEm === null) return false;
          if (where.ackEm === null && row.ackEm !== null) return false;
          if (where.nivel?.in && !where.nivel.in.includes(row.nivel)) return false;
          if (!casaOr(where, row)) return false;
          return true;
        });
        if (take) saida = saida.slice(0, take);
        return saida;
      },
      findFirst: async ({ where }: any) => linhas.find((row) => {
        if (where.id != null && row.id !== where.id) return false;
        if (where.companyId != null && row.companyId !== where.companyId) return false;
        if (where.motoristaUserId != null && row.motoristaUserId !== where.motoristaUserId) return false;
        if (where.origem != null && row.origem !== where.origem) return false;
        if (where.entregueEm?.not === null && row.entregueEm === null) return false;
        if (where.nivel?.in && !where.nivel.in.includes(row.nivel)) return false;
        return true;
      }) ?? null,
      upsert: async ({ where, create }: any) => {
        const key = where.companyId_motoristaUserId_clientMessageId;
        const existing = linhas.find((row) => row.companyId === key.companyId &&
          row.motoristaUserId === key.motoristaUserId && row.clientMessageId === key.clientMessageId);
        if (existing) return existing;
        return prisma.logisticaRecado.create({ data: create });
      },
      updateMany: async ({ where, data }: any) => {
        let n = 0;
        for (const row of linhas) {
          if (where.companyId != null && row.companyId !== where.companyId) continue;
          if (where.motoristaUserId != null && row.motoristaUserId !== where.motoristaUserId) continue;
          if (where.id?.in && !where.id.in.includes(row.id)) continue;
          if (typeof where.id === 'string' && row.id !== where.id) continue;
          if (where.origem != null && row.origem !== where.origem) continue;
          if (where.entregueEm === null && row.entregueEm !== null) continue;
          if (where.entregueEm?.not === null && row.entregueEm === null) continue;
          if (where.vistoEm === null && row.vistoEm !== null) continue;
          if (where.ackEm === null && row.ackEm !== null) continue;
          if (where.nivel?.in && !where.nivel.in.includes(row.nivel)) continue;
          /* 🔴 O DUBLÊ TEM QUE ENTENDER A CLÁUSULA DA CORRIDA. `decidirAnexo`
             grava com `anexoEstado: 'pendente'` no where — é ela que faz o
             segundo toque não regravar. Dublê que ignora a chave passa verde
             enquanto o banco de verdade recusaria: teste que não sabe o que
             está medindo é pior que teste nenhum. */
          if (where.anexoEstado !== undefined && (row.anexoEstado ?? null) !== where.anexoEstado) continue;
          if (!casaOr(where, row)) continue;
          Object.assign(row, data);
          n++;
        }
        return { count: n };
      },
      groupBy: async ({ where }: any) => {
        const counts = new Map<number, number>();
        linhas.filter((row) => row.companyId === where.companyId && row.origem === where.origem && row.vistoEm === null)
          .forEach((row) => counts.set(row.motoristaUserId, (counts.get(row.motoristaUserId) || 0) + 1));
        return [...counts.entries()].map(([motoristaUserId, count]) => ({ motoristaUserId, _count: { _all: count } }));
      },
    },
    user: {
      findFirst: async ({ where }: any) => {
        const ok = (opts.motoristas ?? [7]).includes(where.id) && where.companyId === 1;
        // `role: ADMIN` = capacidade DRIVER pelo default de
        // `projectOperationalCapabilities` (sem userTeamPolicy no mock, a
        // projeção cai no papel). É a mesma régua de `listarEntregadores`.
        return ok ? { id: where.id, name: `Motorista ${where.id}`, companyId: 1, role: 'ADMIN', isSystemMaster: false } : null;
      },
    },
    entrega: {
      groupBy: async () => (opts.entregasPorDono ?? []).map((id) => ({ entregadorId: id })),
      /* NEGAR NÃO CRIA NADA — e a única forma honesta de provar isso é ter uma
         porta de criação de entrega VIGIADA. Sem este contador, "não criou"
         seria uma afirmação que ninguém mediu. */
      create: async ({ data }: any) => { entregasCriadas.push(data); return { id: `ent_${entregasCriadas.length}` }; },
    },
    mobileDevice: {
      findMany: async ({ where }: any = {}) => {
        const lista = opts.aparelhos ?? [];
        return lista.filter((linha) => {
          if (where?.companyId != null && linha.companyId !== where.companyId) return false;
          if (where?.id?.in && !where.id.in.includes(linha.id)) return false;
          if (where?.userId?.in && !where.userId.in.includes(linha.userId)) return false;
          if (where?.userId != null && typeof where.userId === 'number' && linha.userId !== where.userId) return false;
          if (where?.revokedAt === null && linha.revokedAt) return false;
          if (where?.ocultoEm === null && linha.ocultoEm) return false;
          return true;
        });
      },
      findFirst: async ({ where }: any = {}) =>
        (opts.aparelhos ?? []).find(
          (linha) =>
            (where?.id == null || linha.id === where.id) &&
            (where?.companyId == null || linha.companyId === where.companyId),
        ) ?? null,
    },
    /* ANEXO (12/08) — as duas tabelas que o recado passou a REFERENCIAR. Os
       dois dublês obedecem `companyId` de propósito: é exatamente o filtro que
       impede uma conta de outra empresa de virar parada na rota de alguém. */
    customerProfile: {
      findFirst: async ({ where }: any) =>
        (opts.contas ?? []).find(
          (linha) => linha.id === where?.id && linha.companyId === where?.companyId,
        ) ?? null,
      findMany: async ({ where }: any) =>
        (opts.contas ?? []).filter(
          (linha) =>
            (!where?.id?.in || where.id.in.includes(linha.id)) &&
            (where?.companyId == null || linha.companyId === where.companyId),
        ),
    },
    logisticaRotaModelo: {
      findFirst: async ({ where }: any) =>
        (opts.rotasSalvas ?? []).find(
          (linha) => linha.id === where?.id && linha.companyId === where?.companyId,
        ) ?? null,
      findMany: async ({ where }: any) =>
        (opts.rotasSalvas ?? []).filter(
          (linha) =>
            (!where?.id?.in || where.id.in.includes(linha.id)) &&
            (where?.companyId == null || linha.companyId === where.companyId),
        ),
    },
    $transaction: async (input: any) => typeof input === 'function' ? input(prisma) : Promise.all(input),
  };

  return { service: new LogisticaRecadoService(prisma), linhas, criados, entregasCriadas };
}

test('enviar: recado individual nasce sem loteId e no estado "enviado"', async () => {
  const h = harness();
  const saida = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'Passa na central', nivel: 'normal' });
  assert.equal(saida.length, 1);
  assert.equal(saida[0].loteId, null, 'recado de 1 pessoa não é lote');
  assert.equal(saida[0].estado, 'enviado');
  assert.equal(saida[0].origem, 'escritorio');
});

test('enviar: broadcast EXPLODE em uma linha por pessoa, com o mesmo loteId', async () => {
  const h = harness({ motoristas: [7, 8, 9], entregasPorDono: [7, 8, 9] });
  const saida = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { texto: 'Todos na central às 18h' });
  assert.equal(saida.length, 3, 'uma linha por motorista na rua');
  const lotes = new Set(saida.map((r) => r.loteId));
  assert.equal(lotes.size, 1, 'mesmo disparo = mesmo loteId');
  assert.ok(saida[0].loteId, 'broadcast carimba lote');
});

test('enviar: broadcast sem ninguém na rua RECUSA em vez de mandar pro vazio', async () => {
  const h = harness({ entregasPorDono: [] });
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, { texto: 'oi' }),
    /Ninguém com entrega hoje/,
  );
});

test('enviar: texto vazio é recusado (recado em branco não é recado)', async () => {
  const h = harness();
  await assert.rejects(() => h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: '   ' }), /Escreva o recado/);
});

test('multi-tenant: pessoa de OUTRA empresa nunca recebe recado', async () => {
  const h = harness();
  await assert.rejects(() => h.service.enviar(2, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi' }), /não encontrada/i);
});

test('nível inválido cai em normal — nunca inventa força que o app não sabe tratar', async () => {
  const h = harness();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi', nivel: 'PÂNICO' as any });
  assert.equal(row.nivel, 'normal');
});

test('puxar: não mente ✓✓; repete até o aparelho confirmar recebimento', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', autorNome: 'Dono', texto: 'oi', nivel: 'normal', loteId: null, createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null }],
  });
  const primeira = await h.service.puxar(1, 7);
  assert.equal(primeira.length, 1);
  assert.equal(primeira[0].estado, 'enviado', 'resposta HTTP ainda pode cair no caminho');
  const segunda = await h.service.puxar(1, 7);
  assert.equal(segunda.length, 1, 'sem confirmação, o servidor tenta de novo');
  assert.equal(await h.service.marcarRecebidos(1, 7, ['r1']), 1);
  assert.equal((await h.service.puxar(1, 7)).length, 0, 'só a confirmação encerra a entrega');
});

test('PORTÃO: urgente entregue e sem "Entendi" TRAVA; normal nunca trava', async () => {
  const h = harness({
    linhas: [
      { id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'não entrega', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null },
      { id: 'r2', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'normal', autorNome: 'D', texto: 'fyi', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null },
    ],
  });
  const portao = await h.service.portao(1, 7);
  assert.equal(portao.length, 1, 'só o urgente cobra o clique');
  assert.equal(portao[0].id, 'r1');
});

test('PORTÃO: recado que ainda NÃO chegou no aparelho não pode travar a rua', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'x', loteId: null, createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null }],
  });
  assert.equal((await h.service.portao(1, 7)).length, 0);
});

test('PORTÃO: o "Entendi" libera e retry devolve sucesso sem recontar', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'x', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null }],
  });
  assert.equal(await h.service.confirmar(1, 7, 'r1'), true);
  assert.equal((await h.service.portao(1, 7)).length, 0, 'depois do Entendi o caminho abre');
  const primeiroAck = h.linhas[0].ackEm;
  assert.equal(await h.service.confirmar(1, 7, 'r1'), true, 'retry confirma o mesmo gesto');
  assert.equal(h.linhas[0].ackEm, primeiroAck, 'retry não regrava nem reconta');
});

test('PORTÃO: normal ou ainda não entregue nunca aceita "Entendi"', async () => {
  const h = harness({
    linhas: [
      { id: 'normal', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'normal', createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null },
      { id: 'nao-entregue', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'alarme', createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null },
    ],
  });
  assert.equal(await h.service.confirmar(1, 7, 'normal'), false);
  assert.equal(await h.service.confirmar(1, 7, 'nao-entregue'), false);
});

test('multi-tenant: "Entendi" de outra empresa não altera nada', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente', autorNome: 'D', texto: 'x', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null }],
  });
  assert.equal(await h.service.confirmar(2, 7, 'r1'), false);
  assert.equal(h.linhas[0].ackEm, null);
});

test('responder: a resposta nasce NÃO LIDA para acender o badge da central', async () => {
  const h = harness();
  const row = await h.service.responder(1, 7, 'Cliente não atende');
  assert.equal(row.origem, 'motorista');
  assert.equal(row.vistoEm, null);
  assert.deepEqual(await h.service.naoLidosPorMotorista(1), { 7: 1 });
});

test('abrir o Chat no aparelho marca só mensagens da Central como vistas', async () => {
  const h = harness({
    linhas: [
      { id: 'central', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'normal', createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null },
      { id: 'motorista', companyId: 1, motoristaUserId: 7, origem: 'motorista', nivel: 'normal', createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null },
    ],
  });
  assert.equal(await h.service.marcarVisto(1, 7, ['central', 'motorista']), 1);
  assert.ok(h.linhas.find((row) => row.id === 'central')?.vistoEm);
  assert.equal(h.linhas.find((row) => row.id === 'motorista')?.vistoEm, null, 'a Central ainda não abriu a resposta');
});

test('responder: retry é idempotente e confirma o recado na mesma transação', async () => {
  const h = harness({
    linhas: [{ id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'alarme', autorNome: 'D', texto: 'Responda', loteId: null, createdAt: new Date(), entregueEm: new Date(), vistoEm: null, ackEm: null }],
  });
  const options = { clientMessageId: 'msg_teste_123', recadoId: 'r1' };
  const primeira = await h.service.responder(1, 7, 'Estou indo', undefined, options);
  const retry = await h.service.responder(1, 7, 'Estou indo', undefined, options);
  assert.equal(retry.id, primeira.id, 'retry devolve a mesma mensagem');
  assert.equal(h.linhas.filter((row) => row.origem === 'motorista').length, 1, 'não duplica balão');
  assert.ok(h.linhas[0].ackEm, 'resposta já destrava o recado original');
  assert.ok(h.linhas[0].vistoEm, 'responder também prova leitura');
});

// ── APARELHO DO TURNO (08/08) — o dia em que o celular de teste do dono comeu
// o recado do cliente. company 49: g15 (teste, app aberto) x e22 (o do cliente).
const APARELHOS_DO_DIA = [
  { id: 'g15', companyId: 1, userId: 7, name: 'Motorola moto g15', recebeOperacao: false, principalDesde: null, ultimaTelaAt: new Date(), lastUsedAt: new Date() },
  { id: 'e22', companyId: 1, userId: 7, name: 'Motorola moto e22', recebeOperacao: true, principalDesde: null, ultimaTelaAt: null, lastUsedAt: new Date(Date.now() - 45 * 60_000) },
];

test('APARELHO: o recado nasce endereçado ao celular da operação, não ao de teste', async () => {
  const h = harness({ aparelhos: APARELHOS_DO_DIA });
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'Passa na central', nivel: 'alarme' });
  assert.equal(h.linhas.find((linha) => linha.id === row.id)?.deviceId, 'e22');
});

test('APARELHO: o de teste puxa e volta VAZIO — o recado continua esperando o certo', async () => {
  const h = harness({ aparelhos: APARELHOS_DO_DIA });
  await h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi', nivel: 'alarme' });

  const noTeste = await h.service.puxar(1, 7, 'g15');
  assert.equal(noTeste.length, 0, 'aparelho errado não leva o recado de ninguém');
  assert.equal(await h.service.marcarRecebidos(1, 7, h.linhas.map((l) => l.id), 'g15'), 0, 'nem carimba entrega');

  const noCerto = await h.service.puxar(1, 7, 'e22');
  assert.equal(noCerto.length, 1, 'o celular da operação recebe');
  assert.equal(await h.service.marcarRecebidos(1, 7, [noCerto[0].id], 'e22'), 1);
});

test('APARELHO: recado antigo (sem alvo) continua entrando em qualquer aparelho', async () => {
  const h = harness({
    aparelhos: APARELHOS_DO_DIA,
    linhas: [{ id: 'velho', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'normal', autorNome: 'D', texto: 'de antes', deviceId: null, createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null }],
  });
  assert.equal((await h.service.puxar(1, 7, 'e22')).length, 1, 'compat: nada de backfill');
});

test('APARELHO: escolher na tela um celular que não é da pessoa é recusado', async () => {
  const h = harness({ aparelhos: APARELHOS_DO_DIA });
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi', deviceId: 'de_outro' }),
    /não está disponível/i,
  );
  // …e o aparelho de teste também não pode ser escolhido: ele está FORA da operação.
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi', deviceId: 'g15' }),
    /não está disponível/i,
  );
});

// ── O FREIO DO RECADO PRESO ────────────────────────────────────────────────
// Endereçar cria um jeito novo de sumir: alvo sem bateria/esquecido na base.
const DOIS_DA_EMPRESA = (sinalDoAlvo: Date | null) => [
  { id: 'aparelho1', companyId: 1, userId: 7, name: 'Aparelho 1', recebeOperacao: true, principalDesde: null, ultimaTelaAt: null, lastUsedAt: sinalDoAlvo },
  { id: 'aparelho2', companyId: 1, userId: 7, name: 'Aparelho 2', recebeOperacao: true, principalDesde: null, ultimaTelaAt: null, lastUsedAt: new Date() },
];

function recadoPreso(): Linha[] {
  return [{
    id: 'preso', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'urgente',
    autorNome: 'Central', texto: 'Volta pra base', deviceId: 'aparelho1', loteId: null,
    createdAt: new Date(), entregueEm: null, vistoEm: null, ackEm: null,
  }];
}

test('FREIO: alvo calado há 40 min entrega pro outro aparelho DA OPERAÇÃO (e reendereça)', async () => {
  const h = harness({
    aparelhos: DOIS_DA_EMPRESA(new Date(Date.now() - 40 * 60_000)),
    linhas: recadoPreso(),
  });
  const lista = await h.service.puxar(1, 7, 'aparelho2');
  assert.equal(lista.length, 1, 'recado urgente não pode ficar mudo num celular sem bateria');
  assert.equal(h.linhas[0].deviceId, 'aparelho2', 'quem levou vira o dono — o painel para de apontar o errado');
  assert.equal(await h.service.marcarRecebidos(1, 7, ['preso'], 'aparelho2'), 1, 'e o ✓✓ é dele');
});

test('FREIO: alvo ATIVO segura o recado — o outro aparelho não rouba (o bug de 08/08 não volta)', async () => {
  const h = harness({ aparelhos: DOIS_DA_EMPRESA(new Date()), linhas: recadoPreso() });
  assert.equal((await h.service.puxar(1, 7, 'aparelho2')).length, 0);
  assert.equal(h.linhas[0].deviceId, 'aparelho1', 'nada foi reendereçado');
  assert.equal((await h.service.puxar(1, 7, 'aparelho1')).length, 1, 'o dono do recado continua recebendo');
});

test('FREIO: aparelho FORA da operação não resgata nem o recado esquecido', async () => {
  const aparelhos = DOIS_DA_EMPRESA(new Date(Date.now() - 40 * 60_000));
  aparelhos[1].recebeOperacao = false; // o de teste
  const h = harness({ aparelhos, linhas: recadoPreso() });
  assert.equal((await h.service.puxar(1, 7, 'aparelho2')).length, 0, 'teste não entra na operação nem pela porta dos fundos');
  assert.equal(h.linhas[0].deviceId, 'aparelho1');
});

test('APARELHO: a tela mostra quem recebe (o do turno marcado) sem ninguém adivinhar', async () => {
  const h = harness({ aparelhos: APARELHOS_DO_DIA });
  const lista = await h.service.aparelhosDaPessoa(1, 7);
  assert.equal(lista.length, 2);
  assert.equal(lista.find((item) => item.deviceId === 'e22')?.doTurno, true);
  assert.equal(lista.find((item) => item.deviceId === 'g15')?.doTurno, false);
  assert.equal(lista.find((item) => item.deviceId === 'g15')?.recebeOperacao, false);
});

/* ══════════════════════════════════════════════════════════════════════════
   RECADO COM ROTA/PARADA EMBUTIDA (12/08).

   O que morde aqui é multi-tenant (um id de outra empresa viraria uma parada
   REAL andando na rua) e o LIMBO: a cena do dono termina em "a rota recebida é
   LIMPA — não fica presa em limbo nenhum". A prova disso é que negar não cria
   entrega nenhuma e que o estado vira final na primeira vez.
   ══════════════════════════════════════════════════════════════════════════ */
const CONTA_ESTRELA = {
  id: 'conta_estrela', companyId: 1, name: 'Mercado Estrela',
  endereco: 'R. das Orquídeas', numero: '55', bairro: 'Centro', cidade: 'Rio Claro',
};
const ROTA_QUARTA = {
  id: 'rota_quarta', companyId: 1, nome: 'Quarta Centro',
  paradas: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
};
const comAnexo = (extra: Record<string, any> = {}) =>
  harness({ contas: [CONTA_ESTRELA], rotasSalvas: [ROTA_QUARTA], ...extra });

test('ANEXO: a parada anexada volta com NOME e ENDEREÇO resolvidos (o card decide por eles)', async () => {
  const h = comAnexo();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, {
    paraUserId: 7, texto: 'Passa no Mercado Estrela antes das 11h',
    anexo: { tipo: 'parada', contaId: 'conta_estrela' },
  });
  assert.equal(row.anexo?.tipo, 'parada');
  assert.equal(row.anexo?.nome, 'Mercado Estrela');
  assert.equal(row.anexo?.detalhe, 'R. das Orquídeas, 55', 'é pelo endereço que ele decide se encaixa');
  assert.equal(row.anexo?.estado, 'pendente');
  assert.equal(row.anexo?.contaId, 'conta_estrela');
});

test('ANEXO: a rota salva volta com o nome e a CONTAGEM de paradas', async () => {
  const h = comAnexo();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, {
    paraUserId: 7, texto: 'Faz essa rota hoje', anexo: { tipo: 'rota', rotaModeloId: 'rota_quarta' },
  });
  assert.equal(row.anexo?.tipo, 'rota');
  assert.equal(row.anexo?.nome, 'Quarta Centro');
  assert.equal(row.anexo?.detalhe, '3 paradas');
  assert.equal(row.anexo?.paradas, 3);
});

test('ANEXO multi-tenant: conta de OUTRA empresa é recusada e nada é gravado', async () => {
  const h = harness({ contas: [{ ...CONTA_ESTRELA, companyId: 2 }] });
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, {
      paraUserId: 7, texto: 'oi', anexo: { tipo: 'parada', contaId: 'conta_estrela' },
    }),
    /Cliente não encontrado nesta empresa/,
  );
  assert.equal(h.linhas.length, 0, 'recado com anexo inválido não nasce meio gravado');
});

test('ANEXO multi-tenant: rota salva de OUTRA empresa é recusada', async () => {
  const h = harness({ rotasSalvas: [{ ...ROTA_QUARTA, companyId: 2 }] });
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, {
      paraUserId: 7, texto: 'oi', anexo: { tipo: 'rota', rotaModeloId: 'rota_quarta' },
    }),
    /Rota salva não encontrada nesta empresa/,
  );
  assert.equal(h.linhas.length, 0);
});

test('ANEXO: tipo desconhecido e id faltando são recusados ANTES de escrever', async () => {
  const h = comAnexo();
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi', anexo: { tipo: 'parada' } as any }),
    /Escolha o cliente/,
  );
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'oi', anexo: { tipo: 'bagunca' } as any }),
    /parada ou uma rota salva/,
  );
  assert.equal(h.linhas.length, 0);
});

test('ANEXO: BROADCAST com anexo é recusado — cinco motoristas não encaixam a mesma parada', async () => {
  const h = comAnexo({ motoristas: [7, 8], entregasPorDono: [7, 8] });
  await assert.rejects(
    () => h.service.enviar(1, { id: 9, nome: 'Dono' }, {
      texto: 'todo mundo passa lá', anexo: { tipo: 'parada', contaId: 'conta_estrela' },
    }),
    /para UMA pessoa/,
  );
  assert.equal(h.linhas.length, 0);
});

test('ANEXO: encaixar muda o estado UMA vez; o toque repetido devolve o mesmo sem regravar', async () => {
  const h = comAnexo();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, {
    paraUserId: 7, texto: 'Encaixa aí', anexo: { tipo: 'parada', contaId: 'conta_estrela' },
  });
  const primeira = await h.service.decidirAnexo(1, 7, row.id, 'encaixar');
  assert.equal(primeira.estado, 'encaixada');
  const carimbo = h.linhas[0].vistoEm;

  const retry = await h.service.decidirAnexo(1, 7, row.id, 'encaixar');
  assert.equal(retry.estado, 'encaixada', 'retry de rede é sucesso, não erro');
  assert.equal(h.linhas[0].vistoEm, carimbo, 'e não regrava nada');

  // …e depois de encaixada ninguém a nega por trás: estado final é final.
  const depois = await h.service.decidirAnexo(1, 7, row.id, 'negar');
  assert.equal(depois.estado, 'encaixada');
  assert.equal(h.linhas[0].anexoEstado, 'encaixada');
});

test('ANEXO: negar NÃO cria entrega nenhuma — a rota recebida não fica em limbo', async () => {
  const h = comAnexo();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, {
    paraUserId: 7, texto: 'Passa lá', anexo: { tipo: 'parada', contaId: 'conta_estrela' },
  });
  const saida = await h.service.decidirAnexo(1, 7, row.id, 'negar');
  assert.equal(saida.estado, 'negada');
  assert.equal(h.entregasCriadas.length, 0, 'negar não escreve trabalho em lugar nenhum');
  // …e o recado CONTINUA no fio: o dono quer o histórico de quem negou.
  const fio = await h.service.fio(1, 7);
  assert.equal(fio.length, 1);
  assert.equal(fio[0].anexo?.estado, 'negada');
});

test('ANEXO: decidir DESTRAVA o portão do urgente (negar sem motivo não deixa a rua presa)', async () => {
  const h = comAnexo();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, {
    paraUserId: 7, texto: 'Urgente: passa lá', nivel: 'urgente',
    anexo: { tipo: 'parada', contaId: 'conta_estrela' },
  });
  await h.service.marcarRecebidos(1, 7, [row.id]);
  assert.equal((await h.service.portao(1, 7)).length, 1, 'antes de decidir, o urgente cobra');
  await h.service.decidirAnexo(1, 7, row.id, 'negar');
  assert.equal((await h.service.portao(1, 7)).length, 0, 'decidir é ler — e ler destrava');
});

test('ANEXO multi-tenant: decidir o anexo de outra empresa/pessoa não muda nada', async () => {
  const h = comAnexo();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, {
    paraUserId: 7, texto: 'oi', anexo: { tipo: 'parada', contaId: 'conta_estrela' },
  });
  await assert.rejects(() => h.service.decidirAnexo(2, 7, row.id, 'encaixar'), /não encontrado/i);
  await assert.rejects(() => h.service.decidirAnexo(1, 8, row.id, 'encaixar'), /não encontrado/i);
  assert.equal(h.linhas[0].anexoEstado, 'pendente');
});

test('ANEXO: recado SEM anexo continua exatamente como antes (anexo null, e decidir recusa)', async () => {
  const h = comAnexo();
  const [row] = await h.service.enviar(1, { id: 9, nome: 'Dono' }, { paraUserId: 7, texto: 'só texto' });
  assert.equal(row.anexo, null);
  assert.equal(h.linhas[0].anexoJson, undefined, 'nada de coluna preenchida à toa');
  assert.equal(h.linhas[0].anexoEstado, undefined);
  await assert.rejects(() => h.service.decidirAnexo(1, 7, row.id, 'encaixar'), /não tem rota nem parada/);
});

test('ANEXO: referência que sumiu do cadastro vira card SEM nome, nunca card mudo com botão', async () => {
  const semCadastro = harness({
    contas: [], rotasSalvas: [],
    linhas: [{
      id: 'r1', companyId: 1, motoristaUserId: 7, origem: 'escritorio', nivel: 'normal',
      autorNome: 'Central', texto: 'Passa lá', loteId: null, createdAt: new Date(),
      entregueEm: null, vistoEm: null, ackEm: null,
      anexoJson: { tipo: 'parada', contaId: 'conta_estrela' }, anexoEstado: 'pendente',
    }],
  });
  const orfao = await semCadastro.service.fio(1, 7);
  assert.equal(orfao[0].anexo?.tipo, 'parada');
  assert.equal(orfao[0].anexo?.nome, '');
  assert.equal(orfao[0].anexo?.detalhe, '');
});
