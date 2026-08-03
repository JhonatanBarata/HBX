import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaController } from './logistica.controller';
import { LogisticaRotaAvisoService } from './logistica-rota-aviso.service';
import { LogisticaRotaIndicadaService } from './logistica-rota-indicada.service';

/**
 * 🔴 VACINA DA CENA DE 02/08/2026 — "só sumiu tarefa e aí?? completo??"
 *
 * O dono aceitou a missão às 20:53 no celular, a rota montou e parou na
 * Conferência. Às 21:00 ele desistiu: as 3 entregas viraram 'cancelada' no mesmo
 * milissegundo e NENHUM aviso nasceu — `LogisticaRotaAviso` vazia, e a
 * `LogisticaRotaIndicada` ainda dizendo 'aplicada' (o desktop achando que a rota
 * estava com o motorista).
 *
 * Causa: `whereForActor` devolve `{}` pro ADMIN de propósito ("admin preserva
 * visão da empresa inteira"), e as duas redes de aviso liam esse `{}` como "não
 * dá pra saber quem foi". Numa distribuidora pequena o dono é o admin E o
 * motorista — a configuração onde o bug é 100% dos casos.
 *
 * O que estes testes trancam:
 *  1. admin === motorista gera os DOIS avisos (o que faltava);
 *  2. o ESCOPO DE ESCRITA do admin continua sendo a empresa inteira (o fix não
 *     pode ter estreitado o descarte);
 *  3. o fail-closed continua de pé: admin que descarta a rota DE OUTRA PESSOA
 *     não fabrica aviso no nome de ninguém — e isso é MEDIDO com os serviços de
 *     verdade, não prometido em comentário.
 */

const COMPANY = 5;
const DONO = 6; // admin E motorista (a conta do g15)
const OUTRO = 9; // motorista de verdade, que não desistiu de nada
const DIA = '2026-08-02';

/** Ator ADMIN: é o que `whereForActor` deixa sem `entregadorId`. */
const admin = { id: DONO, companyId: COMPANY, role: 'ADMIN' };
/** Ator motorista comum: `whereForActor` recorta por `entregadorId`. */
const motorista = { id: OUTRO, companyId: COMPANY, role: 'USER' };

/** `whereForActor` de verdade em uma linha: admin vê tudo, motorista vê o dele. */
const operacaoReal: any = {
  whereForActor: async (actor: any) => {
    const role = String(actor?.role || '').toUpperCase();
    if (role === 'ADMIN' || role === 'USERMASTER') return {};
    return { entregadorId: Number(actor?.id) };
  },
};

function montarControllerComEspioes() {
  const chamadas = {
    descartarMontagem: [] as Array<number | undefined>,
    encerrarRota: [] as Array<number | undefined>,
    limparDia: [] as Array<number | undefined>,
    desfazerDoMotorista: [] as number[],
    registrarSaida: [] as number[],
  };
  const rota: any = {
    descartarMontagem: async (_c: number, _i: unknown, entregadorId?: number) => {
      chamadas.descartarMontagem.push(entregadorId);
      return { ok: true };
    },
    encerrarRota: async (_c: number, _i: unknown, entregadorId?: number) => {
      chamadas.encerrarRota.push(entregadorId);
      return { ok: true };
    },
    limparDia: async (_c: number, _i: unknown, entregadorId?: number) => {
      chamadas.limparDia.push(entregadorId);
      return { ok: true };
    },
  };
  const rotaIndicada: any = {
    desfazerDoMotorista: async (_c: number, paraUserId: number) => {
      chamadas.desfazerDoMotorista.push(paraUserId);
      return 1;
    },
  };
  const rotaAviso: any = {
    registrarSaida: async (_c: number, entregadorId: number) => {
      chamadas.registrarSaida.push(entregadorId);
      return 'abandonada';
    },
  };
  return { chamadas, controller: montarController({ rota, rotaIndicada, rotaAviso }) };
}

/** Posicional: o controller tem defaults `null` pra tudo depois do `recovery`. */
function montarController(deps: { rota?: any; rotaIndicada?: any; rotaAviso?: any }) {
  return new LogisticaController(
    {} as any, // service
    {} as any, // recorrencia
    (deps.rota ?? {}) as any, // rota
    {} as any, // config
    {} as any, // recovery
    operacaoReal, // operacao
    null as any, // tracking
    null as any, // trackingBonus
    null as any, // occurrences
    null as any, // rotaModelo
    null as any, // leitura
    null as any, // geo
    null as any, // agenda
    null as any, // conferencia
    null as any, // custoPreview
    null as any, // nivelPlano
    null as any, // passeio
    (deps.rotaIndicada ?? null) as any, // rotaIndicada
    (deps.rotaAviso ?? null) as any, // rotaAviso
  );
}

// ── 1. A CENA ────────────────────────────────────────────────────────────────
test('🔴 admin que dirige desiste da rota: os DOIS avisos saem no nome dele', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);

  assert.deepEqual(
    chamadas.desfazerDoMotorista,
    [DONO],
    'a indicação tem que voltar pra "desfeita" — senão o desktop segue dizendo que a rota está com o motorista',
  );
  assert.deepEqual(
    chamadas.registrarSaida,
    [DONO],
    'o recado de saída tem que ser tentado no nome de quem desistiu',
  );
});

test('encerrar e limpar-dia: admin que dirige também vira recado', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.encerrarRota({ user: admin }, { date: DIA } as any);
  await controller.limparDia({ user: admin }, { date: DIA } as any);

  assert.deepEqual(chamadas.registrarSaida, [DONO, DONO]);
});

// ── 2. O QUE O FIX NÃO PODE TER QUEBRADO ─────────────────────────────────────
test('o escopo de escrita do admin continua sendo a empresa inteira', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);
  await controller.encerrarRota({ user: admin }, { date: DIA } as any);
  await controller.limparDia({ user: admin }, { date: DIA } as any);

  assert.deepEqual(chamadas.descartarMontagem, [undefined], 'admin descarta a montagem da empresa toda');
  assert.deepEqual(chamadas.encerrarRota, [undefined]);
  assert.deepEqual(chamadas.limparDia, [undefined]);
});

test('motorista comum: identidade continua vindo do recorte do ator', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.descartarMontagem({ user: motorista }, { date: DIA } as any);

  assert.deepEqual(chamadas.descartarMontagem, [OUTRO], 'motorista só descarta o que é dele');
  assert.deepEqual(chamadas.desfazerDoMotorista, [OUTRO]);
  assert.deepEqual(chamadas.registrarSaida, [OUTRO]);
});

test('ator sem id (chamada interna/legada): sem identidade, nenhum aviso', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.descartarMontagem({ user: { companyId: COMPANY, role: 'ADMIN' } }, { date: DIA } as any);

  assert.deepEqual(chamadas.desfazerDoMotorista, []);
  assert.deepEqual(chamadas.registrarSaida, []);
});

// ── 3. FAIL-CLOSED MEDIDO, com os serviços de VERDADE ────────────────────────
/**
 * O fix passa a mandar o id do admin pras duas redes. A garantia de que isso não
 * fabrica aviso em cima dos outros não é confiança: as duas já são escopadas por
 * esse id. Aqui os serviços reais rodam contra um banco de mentira onde a rota
 * do dia e a indicação viva são de OUTRA pessoa.
 */
test('🔒 admin descartando a rota DE OUTRA PESSOA não gera aviso nenhum', async () => {
  const indicacoes = [
    { id: 'ind-1', companyId: COMPANY, paraUserId: OUTRO, status: 'aplicada' },
  ];
  const avisos: any[] = [];
  const prisma: any = {
    // A rota do dia é do OUTRO, iniciada e com entrega aberta: cenário que
    // GERARIA 'abandonada' se o aviso fosse atribuído à pessoa errada.
    logisticaRoute: {
      findFirst: async ({ where }: any) => (
        where.entregadorId === OUTRO && where.companyId === COMPANY
          ? { startedAt: new Date(2026, 7, 2, 8, 0, 0) }
          : null
      ),
    },
    entrega: {
      findMany: async ({ where }: any) => (
        where.entregadorId === OUTRO
          ? [{ status: 'agendada', rotaModeloId: null }]
          : []
      ),
    },
    user: { findFirst: async () => ({ name: 'Outro Motorista' }) },
    logisticaRotaModelo: { findFirst: async () => null },
    logisticaRotaAviso: {
      create: async ({ data }: any) => { avisos.push(data); return { id: 'a1', ...data }; },
    },
    logisticaRotaIndicada: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of indicacoes) {
          if (row.companyId !== where.companyId) continue;
          if (row.paraUserId !== where.paraUserId) continue;
          if (!(where.status?.in ?? []).includes(row.status)) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
    },
  };
  const avisoService = new LogisticaRotaAvisoService(prisma);
  const indicadaService = new LogisticaRotaIndicadaService(prisma);
  const controller = montarController({
    rota: { descartarMontagem: async () => ({ ok: true }) },
    rotaIndicada: indicadaService,
    rotaAviso: avisoService,
  });

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);

  assert.deepEqual(avisos, [], 'nenhum recado nasce no nome de quem não desistiu');
  assert.equal(indicacoes[0].status, 'aplicada', 'a indicação do outro motorista fica intocada');
});

/**
 * E a mesma máquina, com os MESMOS serviços reais, quando o admin É o motorista:
 * a indicação dele volta pra 'desfeita'. Este par (o de cima mudo, este falando)
 * é a prova de que o fix separa "quem" de "escopo" sem afrouxar nada.
 */
test('🔴 admin === motorista, serviços reais: a indicação dele volta pra "desfeita"', async () => {
  const indicacoes = [
    { id: 'ind-1', companyId: COMPANY, paraUserId: DONO, status: 'aplicada' },
    { id: 'ind-2', companyId: COMPANY, paraUserId: OUTRO, status: 'aplicada' },
  ];
  const prisma: any = {
    logisticaRotaIndicada: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const row of indicacoes) {
          if (row.companyId !== where.companyId) continue;
          if (row.paraUserId !== where.paraUserId) continue;
          if (!(where.status?.in ?? []).includes(row.status)) continue;
          Object.assign(row, data);
          count++;
        }
        return { count };
      },
    },
  };
  const controller = montarController({
    rota: { descartarMontagem: async () => ({ ok: true }) },
    rotaIndicada: new LogisticaRotaIndicadaService(prisma),
  });

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);

  assert.equal(indicacoes[0].status, 'desfeita', 'a rota do dono volta a aparecer como devolvida');
  assert.equal(indicacoes[1].status, 'aplicada', 'e a de mais ninguém é tocada');
});
