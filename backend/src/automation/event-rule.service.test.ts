import test from 'node:test';
import assert from 'node:assert/strict';

import { EventRuleService, type EventRuleRow } from './event-rule.service';

// S08 (MOTOR-ÚNICO) — testes do motor genérico de regras. Estilo de mock
// copiado dos vizinhos da pasta (node:test + mocks manuais, prisma fake com
// `findMany` filtrando o `where` recebido — o mesmo espírito de
// cadencia-gatilho.service.test.ts, sem framework novo).

function makeRule(overrides: Partial<EventRuleRow> = {}): EventRuleRow {
  return {
    id: overrides.id || 'rule-1',
    companyId: overrides.companyId ?? 7,
    nome: overrides.nome || 'Regra de teste',
    evento: overrides.evento || 'lead_respondeu_whatsapp',
    acoesJson: overrides.acoesJson || '[]',
    ativo: overrides.ativo ?? true,
    lastFiredAt: overrides.lastFiredAt ?? null,
    fireCount: overrides.fireCount ?? 0,
  };
}

function makeService(rows: EventRuleRow[]) {
  const findManyCalls: any[] = [];
  const prisma: any = {
    cadenciaGatilho: {
      findMany: async ({ where }: any) => {
        findManyCalls.push(where);
        // Simula o filtro que o banco real faria — testa que o
        // EventRuleService manda companyId/evento/ativo corretos no `where`
        // (isolamento de tenant depende disso).
        return rows.filter(
          (r) => r.companyId === where.companyId && r.evento === where.evento && r.ativo === where.ativo,
        );
      },
    },
  };
  const svc = new EventRuleService(prisma as any);
  return { svc, findManyCalls };
}

test('regra ativa dispara acao (handler chamado com companyId/regra/payload corretos)', async () => {
  const rule = makeRule();
  const { svc } = makeService([rule]);
  const calls: any[] = [];
  svc.registerActionHandler('lead_respondeu_whatsapp', async (companyId, r, payload) => {
    calls.push({ companyId, ruleId: r.id, payload });
  });

  await svc.emit(7, 'lead_respondeu_whatsapp', { fromPhone: '5511988887777' });

  assert.equal(calls.length, 1, 'handler deve disparar exatamente 1 vez pra 1 regra ativa');
  assert.equal(calls[0].companyId, 7);
  assert.equal(calls[0].ruleId, 'rule-1');
  assert.equal(calls[0].payload.fromPhone, '5511988887777');
});

test('regra de outra empresa nao dispara (isolamento de tenant)', async () => {
  const ruleOutraEmpresa = makeRule({ id: 'rule-outra', companyId: 99 });
  const { svc } = makeService([ruleOutraEmpresa]);
  const calls: string[] = [];
  svc.registerActionHandler('lead_respondeu_whatsapp', async () => {
    calls.push('fired');
  });

  await svc.emit(7, 'lead_respondeu_whatsapp', {});

  assert.equal(calls.length, 0, 'regra cadastrada pra outra empresa jamais pode disparar');
});

test('erro numa regra nao bloqueia a proxima (isolamento por regra)', async () => {
  const ruleA = makeRule({ id: 'rule-a' });
  const ruleB = makeRule({ id: 'rule-b' });
  const { svc } = makeService([ruleA, ruleB]);
  const fired: string[] = [];
  svc.registerActionHandler('lead_respondeu_whatsapp', async (_companyId, rule) => {
    fired.push(rule.id);
    if (rule.id === 'rule-a') throw new Error('boom');
  });

  await assert.doesNotReject(svc.emit(7, 'lead_respondeu_whatsapp', {}), 'emit nunca deve lancar');

  assert.deepEqual(fired.sort(), ['rule-a', 'rule-b'], 'as DUAS regras devem ser tentadas, mesmo com a primeira falhando');
});

test('evento sem regra ativa e no-op barato (handler nao roda)', async () => {
  const { svc } = makeService([]); // nenhuma regra cadastrada nesta empresa/evento
  const calls: string[] = [];
  svc.registerActionHandler('lead_respondeu_whatsapp', async () => {
    calls.push('fired');
  });

  await svc.emit(7, 'lead_respondeu_whatsapp', {});

  assert.equal(calls.length, 0);
});

test('evento sem handler registrado e no-op barato (nem busca regra)', async () => {
  const { svc, findManyCalls } = makeService([makeRule()]);
  // Nenhum registerActionHandler chamado pra este evento.

  await svc.emit(7, 'evento_sem_produtor', {});

  assert.equal(findManyCalls.length, 0, 'sem handler registrado, nem a query de regras deve rodar');
});
