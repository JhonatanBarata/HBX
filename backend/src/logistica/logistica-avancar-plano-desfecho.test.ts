import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaService } from './logistica.service';

/**
 * F0 (27/07) — CURSOR NO DESFECHO: `avancarPlanoNoDesfecho` (privado, chamado
 * de dentro da transação núcleo de `confirmarEntrega`/`cancelarEntrega`) é o
 * ÚNICO lugar onde `LogisticaPlanoEntrega.proximaData` anda agora. Acessado
 * via cast `(service as any)` — mesmo padrão de teste de método interno já
 * usado no módulo (ver `logistica-agenda-fuso.test.ts`, `__fusoInternals`).
 *
 * Regra-mãe do dono (27/07): "Registrou entrega? Beleza. Não registrou? Volta
 * tudo pro seu lugar." Estes testes travam os dois ângulos mais perigosos:
 *   2) avança a partir da DATA DE ORIGEM da chave, NUNCA do dia da execução
 *      (entrega adiantada de sexta executada numa segunda avança pra sexta
 *      SEGUINTE, não pra segunda seguinte).
 *   3) dois desfechos da MESMA ocorrência avançam o plano 1 vez só
 *      (idempotência via `proximaData <= dataOrigem OR proximaData IS NULL`).
 */

const SEXTA = 5;
const SEXTA_31_07 = '2026-07-31';
const SEXTA_SEGUINTE_07_08 = '2026-08-07';

function saoPauloMidnight(dayISO: string): Date {
  return new Date(`${dayISO}T00:00:00-03:00`);
}

function buildHarness(planoSeed: { id: string; companyId: number; diaSemana: number; frequencia: string; intervaloDias: number | null; proximaData: Date | null }) {
  const planoStore = new Map([[planoSeed.id, { ...planoSeed }]]);
  const eventos: any[] = [];

  const tx: any = {
    logisticaPlanoEntrega: {
      findFirst: async ({ where }: any) => {
        const row = planoStore.get(where.id);
        if (!row || row.companyId !== where.companyId) return null;
        return { diaSemana: row.diaSemana, frequencia: row.frequencia, intervaloDias: row.intervaloDias };
      },
      updateMany: async ({ where, data }: any) => {
        const row = planoStore.get(where.id);
        if (!row || row.companyId !== where.companyId) return { count: 0 };
        const branchNull = where.OR.some((b: any) => b.proximaData === null);
        const branchLte = where.OR.find((b: any) => b.proximaData && b.proximaData.lte);
        const passaNull = row.proximaData == null && branchNull;
        const passaLte = branchLte && row.proximaData != null && row.proximaData.getTime() <= new Date(branchLte.proximaData.lte).getTime();
        if (!passaNull && !passaLte) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    logisticaAgendaEvento: {
      create: async ({ data }: any) => {
        eventos.push(data);
        return { id: `ev-${eventos.length}` };
      },
    },
  };

  // prisma/conversations/rota/config não são usados por avancarPlanoNoDesfecho
  // (ele recebe o `tx` como parâmetro) — objetos vazios bastam.
  const service = new LogisticaService({} as any, {} as any, {} as any, {} as any);
  return { service, tx, planoStore, eventos };
}

test('avancarPlanoNoDesfecho: avança a partir da DATA DA CHAVE, não do dia da execução (caso adiantado)', async () => {
  // A ocorrência é de SEXTA 31/07 (está na chave) — o cenário real seria uma
  // entrega adiantada e confirmada numa segunda-feira, mas a função nem recebe
  // o dia de execução: só a chave importa. É exatamente isso que o teste prova.
  const h = buildHarness({
    id: 'plano-1',
    companyId: 7,
    diaSemana: SEXTA,
    frequencia: 'SEMANAL',
    intervaloDias: null,
    proximaData: saoPauloMidnight(SEXTA_31_07),
  });

  await (h.service as any).avancarPlanoNoDesfecho(h.tx, 7, {
    planoEntregaId: 'plano-1',
    agendaOcorrenciaKey: `agenda:plano-1:${SEXTA_31_07}`,
    customerProfileId: 'cliente-1',
    entregaId: 'entrega-1',
    actorUserId: 42,
  });

  const plano = h.planoStore.get('plano-1')!;
  assert.deepEqual(
    plano.proximaData,
    saoPauloMidnight(SEXTA_SEGUINTE_07_08),
    'avança pra SEXTA seguinte (31/07 + 7), nunca pro dia em que foi executada',
  );

  assert.equal(h.eventos.length, 1, 'grava PLANO_AVANCADO no extrato');
  assert.equal(h.eventos[0].tipo, 'PLANO_AVANCADO');
  assert.equal(h.eventos[0].origem, 'desfecho');
  assert.equal(h.eventos[0].deTexto, '31/07');
  assert.equal(h.eventos[0].paraTexto, '07/08');
  assert.equal(h.eventos[0].customerProfileId, 'cliente-1');
  assert.equal(h.eventos[0].entregaId, 'entrega-1');
  assert.equal(h.eventos[0].actorUserId, 42);
});

test('avancarPlanoNoDesfecho: dois desfechos da MESMA ocorrência avançam o plano 1 vez só', async () => {
  const h = buildHarness({
    id: 'plano-1',
    companyId: 7,
    diaSemana: SEXTA,
    frequencia: 'SEMANAL',
    intervaloDias: null,
    proximaData: saoPauloMidnight(SEXTA_31_07),
  });
  const input = {
    planoEntregaId: 'plano-1',
    agendaOcorrenciaKey: `agenda:plano-1:${SEXTA_31_07}`,
    customerProfileId: 'cliente-1',
    entregaId: 'entrega-1',
    actorUserId: 42,
  };

  await (h.service as any).avancarPlanoNoDesfecho(h.tx, 7, input);
  const depoisDaPrimeira = h.planoStore.get('plano-1')!.proximaData;
  assert.deepEqual(depoisDaPrimeira, saoPauloMidnight(SEXTA_SEGUINTE_07_08));
  assert.equal(h.eventos.length, 1);

  // 2ª chamada — simula corrida (confirmar duplicado) ou reabertura+reconfirmação.
  await (h.service as any).avancarPlanoNoDesfecho(h.tx, 7, input);

  assert.deepEqual(
    h.planoStore.get('plano-1')!.proximaData,
    saoPauloMidnight(SEXTA_SEGUINTE_07_08),
    'proximaData NÃO anda de novo — já passou da origem',
  );
  assert.equal(h.eventos.length, 1, '2º desfecho não grava evento — nada avançou de verdade');
});
