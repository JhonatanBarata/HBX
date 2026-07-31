// S5 LEAD-CENTRICO (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/05-agenda-slots.md) —
// testes do serviço de slots de disparo. Cobre o aceite do sprint: (1) slot respeita
// janela/teto/intervalo, (2) fora da janela -> próximo dia útil no horário configurado,
// (3) 2 agendamentos concorrentes no mesmo slot não furam o teto.

import test from 'node:test';
import assert from 'node:assert/strict';

import { findNextFreeSlot, AgendaDisparoService, type VendasComercialConfigDto } from './agenda-disparo.service';
import { getBusinessDateParts, isBusinessDay } from './business-hours.util';

const BASE_CONFIG: VendasComercialConfigDto = {
  workingHoursStart: '08:00',
  workingHoursEnd: '18:00',
  dailyLimitPerSender: 10,
  intervalMinutes: 15,
  intervalVarianceMinutes: 15,
  maxAttemptsPerLead: 1,
  typingSeconds: 8,
  typingVarianceSeconds: 12,
};

// Próxima segunda-feira às 10:00 (horário local America/Sao_Paulo) — ponto de partida
// determinístico que cai DENTRO da janela padrão, pra testes que não querem testar o
// clamp de janela em si.
function nextMondayAt(hour: number, minute: number): Date {
  const now = new Date();
  const cursor = new Date(now);
  cursor.setUTCHours(13, minute, 0, 0); // 13:00 UTC ~= 10:00 America/Sao_Paulo (UTC-3)
  cursor.setUTCHours(cursor.getUTCHours() + (hour - 10));
  for (let i = 0; i < 8; i += 1) {
    const parts = getBusinessDateParts(cursor);
    if (parts.weekday === 1) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor;
}

// ================================================================
// Algoritmo puro
// ================================================================

test('findNextFreeSlot: dentro da janela e sem conflito -> devolve o proprio horario pedido', () => {
  const desired = nextMondayAt(10, 0);
  const res = findNextFreeSlot(desired, BASE_CONFIG, [], desired);
  assert.equal(res.conflito, false);
  assert.equal(res.motivoConflito, null);
  assert.equal(res.slot.getTime(), desired.getTime());
});

test('findNextFreeSlot: fora da janela (antes do horario de abertura) -> mesmo dia util, no horario de inicio', () => {
  const desired = nextMondayAt(6, 0); // 06:00, antes das 08:00
  const res = findNextFreeSlot(desired, BASE_CONFIG, [], desired);
  assert.equal(res.conflito, true);
  assert.equal(res.motivoConflito, 'fora_da_janela');
  const parts = getBusinessDateParts(res.slot);
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 0);
  assert.equal(isBusinessDay(res.slot), true);
});

test('findNextFreeSlot: fim de semana -> proximo dia util no horario configurado (nao so "amanha")', () => {
  // Sabado: pega a proxima segunda e recua 2 dias.
  const monday = nextMondayAt(9, 0);
  const saturday = new Date(monday.getTime() - 2 * 24 * 60 * 60 * 1000);
  const res = findNextFreeSlot(saturday, BASE_CONFIG, [], saturday);
  assert.equal(res.conflito, true);
  assert.equal(res.motivoConflito, 'fora_da_janela');
  assert.equal(isBusinessDay(res.slot), true);
  const parts = getBusinessDateParts(res.slot);
  assert.equal(parts.hour, 8, 'cai no horario de INICIO configurado, nao "sabado + hora crua"');
});

test('findNextFreeSlot: depois do horario de fechamento -> proximo dia util no horario de inicio', () => {
  const desired = nextMondayAt(19, 0); // 19:00, depois das 18:00
  const res = findNextFreeSlot(desired, BASE_CONFIG, [], desired);
  assert.equal(res.conflito, true);
  assert.equal(res.motivoConflito, 'fora_da_janela');
  const parts = getBusinessDateParts(res.slot);
  assert.equal(parts.hour, 8);
  assert.ok(res.slot.getTime() > desired.getTime());
});

test('findNextFreeSlot: respeita intervalo minimo — slot ocupado pula pro proximo intervalo livre', () => {
  const desired = nextMondayAt(8, 0);
  const occupied = [desired]; // exatamente o slot pedido ja esta ocupado
  const res = findNextFreeSlot(desired, BASE_CONFIG, occupied, desired);
  assert.equal(res.conflito, true);
  assert.equal(res.motivoConflito, 'intervalo_minimo');
  const diffMinutes = Math.round((res.slot.getTime() - desired.getTime()) / 60000);
  assert.equal(diffMinutes, BASE_CONFIG.intervalMinutes, '08:00 ocupado -> proximo livre e exatamente +intervalMinutes');
});

test('findNextFreeSlot: teto do dia atingido -> nao fura, pula pro proximo dia util', () => {
  const config: VendasComercialConfigDto = { ...BASE_CONFIG, dailyLimitPerSender: 2 };
  const desired = nextMondayAt(8, 0);
  // 2 ocupados hoje (bate o teto) em horarios que nao colidem por intervalo com o pedido.
  const occupied = [nextMondayAt(9, 0), nextMondayAt(10, 0)];
  const res = findNextFreeSlot(desired, config, occupied, desired);
  assert.equal(res.conflito, true);
  assert.equal(res.motivoConflito, 'teto_do_dia');
  const desiredParts = getBusinessDateParts(desired);
  const slotParts = getBusinessDateParts(res.slot);
  assert.notEqual(slotParts.day, desiredParts.day, 'teto do dia -> o slot tem que cair em outro dia');
  assert.equal(slotParts.hour, 8, 'reinicia no horario de abertura do dia seguinte');
});

test('findNextFreeSlot: nunca oferece slot no passado (desiredAt antes de "now")', () => {
  const now = nextMondayAt(12, 0);
  const desiredNoPassado = new Date(now.getTime() - 60 * 60 * 1000); // 1h atras
  const res = findNextFreeSlot(desiredNoPassado, BASE_CONFIG, [], now);
  assert.ok(res.slot.getTime() >= now.getTime());
});

// ================================================================
// Serviço (fake Prisma) — config + reserva + concorrência
// ================================================================

function makeFakePrisma(initialInscricoes: any[] = [], initialConfig: any = null) {
  const inscricoes = initialInscricoes.map((i) => ({ ...i }));
  let configRow: any = initialConfig;
  return {
    inscricoes,
    prisma: {
      vendasComercialConfig: {
        findUnique: async ({ where }: any) => (configRow && configRow.companyId === where.companyId ? configRow : null),
        upsert: async ({ where, create, update }: any) => {
          if (configRow && configRow.companyId === where.companyId) {
            configRow = { ...configRow, ...update };
          } else {
            configRow = { ...create };
          }
          return configRow;
        },
      },
      cadenciaInscricao: {
        findMany: async ({ where, select }: any) => {
          const rows = inscricoes.filter((row) => {
            if (where.companyId !== undefined && row.companyId !== where.companyId) return false;
            if (where.status !== undefined && row.status !== where.status) return false;
            if (where.id?.not !== undefined && row.id === where.id.not) return false;
            if (where.nextStepAt?.gte && row.nextStepAt.getTime() < where.nextStepAt.gte.getTime()) return false;
            if (where.nextStepAt?.lte && row.nextStepAt.getTime() > where.nextStepAt.lte.getTime()) return false;
            return true;
          });
          if (select?.nextStepAt) return rows.map((r) => ({ nextStepAt: r.nextStepAt }));
          return rows;
        },
        updateMany: async ({ where, data }: any) => {
          let count = 0;
          for (const row of inscricoes) {
            if (where.id && row.id !== where.id) continue;
            if (where.status && row.status !== where.status) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      },
    },
  };
}

test('AgendaDisparoService.getConfig: sem linha no banco -> defaults (08:00-18:00, 10/dia, 15min)', async () => {
  const { prisma } = makeFakePrisma([], null);
  const svc = new AgendaDisparoService(prisma as any);
  const config = await svc.getConfig(7);
  // CASA DO RISCO (31/07/2026): defaults dos 4 campos novos = nível MÉDIO.
  assert.deepEqual(config, {
    workingHoursStart: '08:00',
    workingHoursEnd: '18:00',
    dailyLimitPerSender: 10,
    intervalMinutes: 15,
    intervalVarianceMinutes: 15,
    maxAttemptsPerLead: 1,
    typingSeconds: 8,
    typingVarianceSeconds: 12,
  });
});

test('AgendaDisparoService.saveConfig: atualizacao parcial preserva os campos nao enviados', async () => {
  const { prisma } = makeFakePrisma([], { companyId: 7, workingHoursStart: '09:00', workingHoursEnd: '17:00', dailyLimitPerSender: 5, intervalMinutes: 20 });
  const svc = new AgendaDisparoService(prisma as any);
  const saved = await svc.saveConfig(7, { dailyLimitPerSender: 8 });
  assert.equal(saved.dailyLimitPerSender, 8);
  assert.equal(saved.workingHoursStart, '09:00', 'campo nao enviado continua o que ja estava salvo');
  assert.equal(saved.workingHoursEnd, '17:00');
  assert.equal(saved.intervalMinutes, 20);
});

// ---------------------------------------------------------------- CATÁLOGO (30/07)

test('catálogo: save→get roundtrip com a forma da UI (sem chave) fica PRONTO e ganha chave derivada', async () => {
  const { prisma } = makeFakePrisma([], null);
  const svc = new AgendaDisparoService(prisma as any);
  const saved = await svc.saveCatalogo(7, {
    oQueVendemos: 'Sistema de rota para entregadores',
    capacidades: [{ ganho: 'Entrega no mesmo dia', resolve: ['atraso'] }],
    paraQuem: ['Distribuidoras'],
    ancoraDePreco: null,
  });
  assert.equal(saved.pronto, true);
  assert.deepEqual(saved.lacunas, []);
  const lido = await svc.getCatalogo(7);
  assert.equal(lido.pronto, true);
  assert.equal(lido.catalogo?.capacidades[0].chave, 'entrega_no_mesmo_dia');
});

test('catálogo: null (ou tudo vazio) grava NULL — o estado que PROÍBE a IA de afirmar produto', async () => {
  const { prisma } = makeFakePrisma([], { companyId: 7, workingHoursStart: '08:00', workingHoursEnd: '18:00', dailyLimitPerSender: 10, intervalMinutes: 15, catalogoJson: '{"oQueVendemos":"algo","capacidades":[{"chave":"a","ganho":"b"}]}' });
  const svc = new AgendaDisparoService(prisma as any);
  const limpo = await svc.saveCatalogo(7, null);
  assert.equal(limpo.catalogo, null);
  assert.equal(limpo.pronto, false);
  assert.equal(limpo.lacunas.length, 2, 'as duas lacunas voltam a ser cobradas');
  const lido = await svc.getCatalogo(7);
  assert.equal(lido.catalogo, null, 'não sobra string órfã fingindo catálogo');
});

test('catálogo: salvar horário/teto NÃO apaga o catálogo (e vice-versa)', async () => {
  const { prisma } = makeFakePrisma([], null);
  const svc = new AgendaDisparoService(prisma as any);
  await svc.saveCatalogo(7, { oQueVendemos: 'x', capacidades: [{ ganho: 'y' }] });
  await svc.saveConfig(7, { dailyLimitPerSender: 3 });
  const catalogo = await svc.getCatalogo(7);
  assert.equal(catalogo.pronto, true, 'saveConfig passou por cima do catalogoJson');
  const config = await svc.getConfig(7);
  assert.equal(config.dailyLimitPerSender, 3, 'saveCatalogo não pode ter mexido no teto');
});

test('catálogo: JSON podre no banco não derruba — vira "sem catálogo"', async () => {
  const { prisma } = makeFakePrisma([], { companyId: 7, catalogoJson: '{quebrado' });
  const svc = new AgendaDisparoService(prisma as any);
  const lido = await svc.getCatalogo(7);
  assert.equal(lido.catalogo, null);
  assert.equal(lido.pronto, false);
});

test('AgendaDisparoService.reservarProximoDiaUtil: cap tecnico estourado -> agenda pro proximo dia util NO HORARIO configurado (nunca so +24h cru)', async () => {
  const { prisma, inscricoes } = makeFakePrisma(
    [{ id: 'i1', companyId: 7, status: 'ativa', nextStepAt: new Date() }],
    { companyId: 7, workingHoursStart: '08:30', workingHoursEnd: '18:00', dailyLimitPerSender: 10, intervalMinutes: 15 },
  );
  const svc = new AgendaDisparoService(prisma as any);
  // "from" de madrugada (23:50) — +24h cru cairia as 23:50 do dia seguinte, fora da janela.
  const from = nextMondayAt(23, 50);
  const slot = await svc.reservarProximoDiaUtil({ companyId: 7, inscricaoId: 'i1', from, extraData: { lastError: 'whats_daily_cap_deferred' } });
  const parts = getBusinessDateParts(slot);
  assert.equal(parts.hour, 8);
  assert.equal(parts.minute, 30, 'usa workingHoursStart configurado (08:30), nao o default 08:00');
  assert.equal(isBusinessDay(slot), true);
  assert.equal(inscricoes[0].nextStepAt.getTime(), slot.getTime());
  assert.equal(inscricoes[0].lastError, 'whats_daily_cap_deferred');
});

test('AgendaDisparoService.reservarProximoSlot: 2 chamadas concorrentes na MESMA empresa/teto=1 nao ficam no mesmo dia (nao fura o teto)', async () => {
  const { prisma, inscricoes } = makeFakePrisma(
    [
      { id: 'iA', companyId: 7, status: 'ativa', nextStepAt: new Date(Date.now() - 100000) },
      { id: 'iB', companyId: 7, status: 'ativa', nextStepAt: new Date(Date.now() - 100000) },
    ],
    { companyId: 7, workingHoursStart: '08:00', workingHoursEnd: '18:00', dailyLimitPerSender: 1, intervalMinutes: 15 },
  );
  const svc = new AgendaDisparoService(prisma as any);
  const desiredAt = nextMondayAt(9, 0);
  const now = new Date(desiredAt.getTime() - 60 * 60 * 1000);

  // Disparadas "ao mesmo tempo" (Promise.all) — o mutex interno do service serializa
  // a leitura+escrita, entao a 2a chamada tem que enxergar a reserva da 1a.
  const [resA, resB] = await Promise.all([
    svc.reservarProximoSlot({ companyId: 7, inscricaoId: 'iA', desiredAt, now }),
    svc.reservarProximoSlot({ companyId: 7, inscricaoId: 'iB', desiredAt, now }),
  ]);

  assert.equal(inscricoes.find((i) => i.id === 'iA')!.nextStepAt.getTime(), resA.slot.getTime());
  assert.equal(inscricoes.find((i) => i.id === 'iB')!.nextStepAt.getTime(), resB.slot.getTime());

  const dayA = getBusinessDateParts(resA.slot).day;
  const dayB = getBusinessDateParts(resB.slot).day;
  assert.notEqual(dayA, dayB, 'teto=1/dia -> as 2 reservas concorrentes tem que cair em dias DIFERENTES, nunca no mesmo dia');
  assert.equal(resB.conflito, true);
  assert.equal(resB.motivoConflito, 'teto_do_dia');
});

test('AgendaDisparoService.proximoSlotLivre (GET, sem side-effect): nao escreve nada no banco', async () => {
  const { prisma, inscricoes } = makeFakePrisma(
    [{ id: 'i1', companyId: 7, status: 'ativa', nextStepAt: nextMondayAt(9, 0) }],
    { companyId: 7, workingHoursStart: '08:00', workingHoursEnd: '18:00', dailyLimitPerSender: 10, intervalMinutes: 15 },
  );
  const svc = new AgendaDisparoService(prisma as any);
  const before = inscricoes[0].nextStepAt.getTime();
  const res = await svc.proximoSlotLivre(7, { desiredAt: nextMondayAt(9, 0) });
  assert.equal(inscricoes[0].nextStepAt.getTime(), before, 'GET/preview nunca grava');
  assert.ok(res.slot instanceof Date);
});
