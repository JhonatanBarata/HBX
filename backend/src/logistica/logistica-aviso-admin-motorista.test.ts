import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaController } from './logistica.controller';
import { LogisticaRotaAvisoService } from './logistica-rota-aviso.service';

/**
 * 🔴 VACINA DA CENA DE 02/08/2026 — "só sumiu tarefa e aí?? completo??"
 *
 * O dono aceitou a missão às 20:53 no celular, a rota montou e parou na
 * Conferência. Às 21:00 ele desistiu: as 3 entregas viraram 'cancelada' no mesmo
 * milissegundo e NENHUM aviso nasceu — `LogisticaRotaAviso` vazia.
 *
 * Causa: `whereForActor` devolve `{}` pro ADMIN de propósito ("admin preserva
 * visão da empresa inteira"), e a rede de aviso lia esse `{}` como "não dá pra
 * saber quem foi". Numa distribuidora pequena o dono é o admin E o motorista —
 * a configuração onde o bug é 100% dos casos.
 *
 * 09/08 (F4, PR09082026-ROTA-SEIS-VERBOS): eram DUAS redes de aviso; a segunda,
 * a devolução da `LogisticaRotaIndicada`, foi ENTERRADA junto com a Rota
 * Indicada (4 usos na vida). A LEI que sobrevive é a mesma e vale inteira pra
 * rede que ficou: quem desiste é o AUTENTICADO, o escopo de escrita é o do ator.
 *
 * O que estes testes trancam:
 *  1. admin === motorista gera o aviso (o que faltava);
 *  2. o ESCOPO DE ESCRITA do admin continua sendo a empresa inteira (o fix não
 *     pode ter estreitado o descarte);
 *  3. o fail-closed continua de pé: admin que descarta a rota DE OUTRA PESSOA
 *     não fabrica aviso no nome de ninguém — e isso é MEDIDO com o serviço de
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
  const rotaAviso: any = {
    registrarSaida: async (_c: number, entregadorId: number) => {
      chamadas.registrarSaida.push(entregadorId);
      return 'abandonada';
    },
  };
  return { chamadas, controller: montarController({ rota, rotaAviso }) };
}

/** Posicional: o controller tem defaults `null` pra tudo depois do `recovery`. */
function montarController(deps: { rota?: any; rotaAviso?: any }) {
  return new LogisticaController(
    {} as any, // service
    {} as any, // recorrencia
    (deps.rota ?? {}) as any, // rota
    {} as any, // config
    {} as any, // recovery
    operacaoReal, // operacao
    null as any, // cobranca
    null as any, // tracking
    null as any, // trackingBonus
    null as any, // rotaModelo
    null as any, // geo
    null as any, // agenda
    null as any, // conferencia
    null as any, // custoPreview
    null as any, // nivelPlano
    null as any, // passeio
    (deps.rotaAviso ?? null) as any, // rotaAviso
  );
}

// ── 1. A CENA ────────────────────────────────────────────────────────────────
test('🔴 admin que dirige desiste da rota: o aviso sai no nome dele', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);

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
// 24/08/2026 — CONVIVÊNCIA admin+motorista: os TRÊS verbos escopam ao próprio
// ator SEMPRE (antes descartar/encerrar do admin desciam `undefined` e o
// serviço varria a empresa inteira — a rota do motorista na rua ia junto).
test('descartar/encerrar/limpar-dia do admin ficam presos ao próprio usuário', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);
  await controller.encerrarRota({ user: admin }, { date: DIA } as any);
  await controller.limparDia({ user: admin }, { date: DIA } as any);

  assert.deepEqual(chamadas.descartarMontagem, [DONO]);
  assert.deepEqual(chamadas.encerrarRota, [DONO]);
  assert.deepEqual(chamadas.limparDia, [DONO]);
});

test('motorista comum: identidade continua vindo do recorte do ator', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await controller.descartarMontagem({ user: motorista }, { date: DIA } as any);

  assert.deepEqual(chamadas.descartarMontagem, [OUTRO], 'motorista só descarta o que é dele');
  assert.deepEqual(chamadas.registrarSaida, [OUTRO]);
});

// 24/08/2026 — sem id não existe mais "descartar da empresa": o fail-safe de
// escopo (mesmo do limpar-dia) exige o ator identificado e recusa ANTES de
// tocar em qualquer coisa. Continua sem aviso: nada rodou.
test('ator sem id (chamada interna/legada): recusado antes de agir, nenhum aviso', async () => {
  const { controller, chamadas } = montarControllerComEspioes();

  await assert.rejects(
    () => controller.descartarMontagem({ user: { companyId: COMPANY, role: 'ADMIN' } }, { date: DIA } as any),
    /Usuário não identificado/,
  );

  assert.deepEqual(chamadas.descartarMontagem, [], 'o serviço nunca chega a ser chamado');
  assert.deepEqual(chamadas.registrarSaida, []);
});

// ── 3. FAIL-CLOSED MEDIDO, com o serviço de VERDADE ──────────────────────────
/**
 * O fix passa a mandar o id do admin pra rede de aviso. A garantia de que isso
 * não fabrica aviso em cima dos outros não é confiança: `registrarSaida` já é
 * escopado por esse id. Aqui o serviço real roda contra um banco de mentira onde
 * a rota do dia é de OUTRA pessoa.
 */
function prismaComRotaDe(dono: number, avisos: any[]) {
  return {
    // Rota iniciada com entrega aberta: o cenário que GERARIA 'abandonada' se o
    // aviso fosse atribuído à pessoa errada.
    logisticaRoute: {
      findFirst: async ({ where }: any) => (
        where.entregadorId === dono && where.companyId === COMPANY
          ? { startedAt: new Date(2026, 7, 2, 8, 0, 0) }
          : null
      ),
    },
    entrega: {
      findMany: async ({ where }: any) => (
        where.entregadorId === dono
          ? [{ status: 'agendada', rotaModeloId: null }]
          : []
      ),
    },
    user: { findFirst: async () => ({ name: 'Motorista' }) },
    logisticaRotaModelo: { findFirst: async () => null },
    logisticaRotaAviso: {
      create: async ({ data }: any) => { avisos.push(data); return { id: 'a1', ...data }; },
    },
  } as any;
}

test('🔒 admin descartando a rota DE OUTRA PESSOA não gera aviso nenhum', async () => {
  const avisos: any[] = [];
  const controller = montarController({
    rota: { descartarMontagem: async () => ({ ok: true }) },
    rotaAviso: new LogisticaRotaAvisoService(prismaComRotaDe(OUTRO, avisos)),
  });

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);

  assert.deepEqual(avisos, [], 'nenhum recado nasce no nome de quem não desistiu');
});

/**
 * E a mesma máquina, com o MESMO serviço real, quando o admin É o motorista: o
 * recado nasce. Este par (o de cima mudo, este falando) é a prova de que o fix
 * separa "quem" de "escopo" sem afrouxar nada.
 */
test('🔴 admin === motorista, serviço real: o recado de abandono nasce no nome dele', async () => {
  const avisos: any[] = [];
  const controller = montarController({
    rota: { descartarMontagem: async () => ({ ok: true }) },
    rotaAviso: new LogisticaRotaAvisoService(prismaComRotaDe(DONO, avisos)),
  });

  await controller.descartarMontagem({ user: admin }, { date: DIA } as any);

  assert.equal(avisos.length, 1, 'quem saiu pra rua e largou vira recado');
  assert.equal(avisos[0].tipo, 'abandonada', '0 entregues com parada aberta = abandonada');
  assert.equal(avisos[0].motoristaUserId, DONO);
});
