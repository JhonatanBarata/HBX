import test from 'node:test';
import assert from 'node:assert/strict';
import { CreditMeterService } from './credit-meter.service';
import {
  applyCreditActionOverrides,
  clearCreditActionOverrides,
  getCreditActionDefinition,
  listCreditActionDefinitions,
} from './credit-action-catalog';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

// PR11072026 W1 — garante que nenhum teste deste arquivo vaza overlay pro próximo (o
// overlay é estado em módulo, compartilhado por todos os testes rodados no mesmo processo).
test.afterEach(() => {
  clearCreditActionOverrides();
});

// PARIDADE DE INVARIANTE (revisão 11/07): mesmo que uma linha CreditActionConfig com
// mode='debit' pra whatsapp_auto_send entre FORA do set do service (escrita direta no banco),
// o merge do overlay tem que dropar o debit — whatsapp automação NUNCA cobra (decisão do dono).
test('overlay NUNCA aplica mode=debit em whatsapp_auto_send (defesa em profundidade)', () => {
  applyCreditActionOverrides([{ actionKey: 'whatsapp_auto_send', override: { mode: 'debit', cost: 2 } }]);
  const def = getCreditActionDefinition('whatsapp_auto_send');
  assert.equal(def?.mode, 'track', 'debit foi ignorado, mode segue o base track');
  assert.equal(def?.cost, 2, 'o cost do override ainda vale — só o mode debit é barrado');
});

// CRÉDITO UNIVERSAL (PR10072026) — CreditMeterService: roteamento por modo do catálogo
// (free = nada; track = escritor de shadow do S2; debit = wallet.debit pós-fato SEM lançar),
// idempotência delegada por refId→usageKey, e o plug de medição do AiGatewayService.
// Fakes finos no lugar de CreditsService/CreditWalletService — o meter é camada de roteamento,
// a mecânica de dinheiro tem os testes próprios (credit-wallet.service.test.ts).

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const saved: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    saved[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function makeFakes() {
  const shadowCalls: any[] = [];
  const debitCalls: any[] = [];
  const credits = {
    recordShadowDebit: async (companyId: number, userId: number | null, input: any) => {
      shadowCalls.push({ companyId, userId, ...input });
    },
  } as any;
  const wallet = {
    debit: async (companyId: number, amount: number, opts: any) => {
      debitCalls.push({ companyId, amount, ...opts });
      return { debited: amount, requested: amount, partial: false, balanceAfter: 10 };
    },
  } as any;
  return { credits, wallet, shadowCalls, debitCalls };
}

test('catálogo: logística legada fica track e os dois modos novos têm custo fixo', () => {
  assert.equal(getCreditActionDefinition('lead_delivery')?.mode, 'debit');
  assert.equal(getCreditActionDefinition('whatsapp_auto_send')?.mode, 'track');
  assert.equal(getCreditActionDefinition('ai_realtime')?.mode, 'track');
  assert.equal(getCreditActionDefinition('ai_batch')?.mode, 'track');
  assert.equal(getCreditActionDefinition('logistica_delivery')?.mode, 'track');
  assert.deepEqual(getCreditActionDefinition('logistica_essential_block'), {
    key: 'logistica_essential_block', mode: 'debit', cost: 1,
    label: 'Bloco iniciado de até 5 entregas (Rota Essencial)',
  });
  assert.equal(getCreditActionDefinition('logistica_tracked_delivery')?.mode, 'debit');
  assert.equal(getCreditActionDefinition('logistica_tracked_delivery')?.cost, 2);
  // ação fora do catálogo nunca vira preço inventado
  assert.equal(getCreditActionDefinition('acao_inventada'), null);
  assert.equal(listCreditActionDefinitions().length, 7);
});

test('overlay injetado direto nunca muda modo/custo das ações fixas de logística', () => {
  applyCreditActionOverrides([
    { actionKey: 'logistica_delivery', override: { mode: 'debit', cost: 99 } },
    { actionKey: 'logistica_essential_block', override: { mode: 'free', cost: 99 } },
    { actionKey: 'logistica_tracked_delivery', override: { mode: 'free', cost: 99 } },
  ]);
  assert.equal(getCreditActionDefinition('logistica_delivery')?.mode, 'track');
  assert.equal(getCreditActionDefinition('logistica_essential_block')?.cost, 1);
  assert.equal(getCreditActionDefinition('logistica_tracked_delivery')?.cost, 2);
});

test('meter: flag mestra OFF = no-op absoluto (nem track, nem debit)', async () => {
  await withEnv({ HBX_CREDITS_ENABLED: undefined }, async () => {
    const { credits, wallet, shadowCalls, debitCalls } = makeFakes();
    const meter = new CreditMeterService(credits, wallet);
    await meter.meter({ companyId: 1, actionKey: 'whatsapp_auto_send', refId: 'wa:1' });
    assert.equal(shadowCalls.length, 0);
    assert.equal(debitCalls.length, 0);
  });
});

test('meter: track roteia pro escritor de shadow com actionKey/ref/units; nunca toca o wallet', async () => {
  await withEnv({ HBX_CREDITS_ENABLED: 'true' }, async () => {
    const { credits, wallet, shadowCalls, debitCalls } = makeFakes();
    const meter = new CreditMeterService(credits, wallet);
    await meter.meter({ companyId: 7, actionKey: 'whatsapp_auto_send', refId: 'wa:123', userId: 44 });
    assert.equal(shadowCalls.length, 1);
    assert.deepEqual(shadowCalls[0], { companyId: 7, userId: 44, leadId: 'wa:123', actionKey: 'whatsapp_auto_send', units: 1 });
    assert.equal(debitCalls.length, 0, 'track NUNCA debita (decisão do dono: WhatsApp não se cobra)');
  });
});

test('meter: ação desconhecida ou inválida = no-op (sem lançar)', async () => {
  await withEnv({ HBX_CREDITS_ENABLED: 'true' }, async () => {
    const { credits, wallet, shadowCalls, debitCalls } = makeFakes();
    const meter = new CreditMeterService(credits, wallet);
    await meter.meter({ companyId: 1, actionKey: 'acao_inventada', refId: 'x' });
    await meter.meter({ companyId: 0, actionKey: 'ai_realtime', refId: 'x' });
    await meter.meter({ companyId: 1, actionKey: 'ai_realtime', refId: '' });
    assert.equal(shadowCalls.length, 0);
    assert.equal(debitCalls.length, 0);
  });
});

test('meter: lead_delivery é RECUSADO (lead debita SÓ pelo caminho assert — nunca 2º débito)', async () => {
  await withEnv({ HBX_CREDITS_ENABLED: 'true' }, async () => {
    const { credits, wallet, shadowCalls, debitCalls } = makeFakes();
    const meter = new CreditMeterService(credits, wallet);
    await meter.meter({ companyId: 3, actionKey: 'lead_delivery', refId: 'abc' });
    assert.equal(debitCalls.length, 0, 'meter NUNCA debita lead (fura gate R1/god-mode/namespace)');
    assert.equal(shadowCalls.length, 0);
  });
});

test('meter: erro interno é engolido (best-effort absoluto)', async () => {
  await withEnv({ HBX_CREDITS_ENABLED: 'true' }, async () => {
    const explosive = { recordShadowDebit: async () => { throw new Error('banco fora'); } } as any;
    const { wallet } = makeFakes();
    const meter = new CreditMeterService(explosive, wallet);
    await assert.doesNotReject(meter.meter({ companyId: 1, actionKey: 'ai_realtime', refId: 'r1' }));
  });
});

test('gateway: run() com usage emite evento pro listener (companyId válido) e usa default por faixa', async () => {
  await withEnv({ HBX_AI_GATEWAY_ENABLED: 'false' }, async () => {
    const events: any[] = [];
    AiGatewayService.setUsageListener((usage) => events.push(usage));
    try {
      await AiGatewayService.run('realtime', 1000, async () => 'ok', { companyId: 9 });
      await AiGatewayService.run('batch', 1000, async () => 'ok', { companyId: 9 });
      // sem contexto ou sem empresa → NÃO emite (nunca inventa dono)
      await AiGatewayService.run('realtime', 1000, async () => 'ok');
      await AiGatewayService.run('realtime', 1000, async () => 'ok', { companyId: 0 });
      // fetch RESOLVE em HTTP 500 (Response.ok=false) → NÃO é uso (revisão 10/07)
      await AiGatewayService.run('realtime', 1000, async () => ({ ok: false, status: 500 }), { companyId: 9 });
      assert.equal(events.length, 2);
      assert.equal(events[0].actionKey, 'ai_realtime');
      assert.equal(events[1].actionKey, 'ai_batch');
      assert.equal(events[0].companyId, 9);
      assert.ok(events[0].refId && events[0].refId !== events[1].refId, 'refId único por chamada');
    } finally {
      AiGatewayService.setUsageListener(null);
    }
  });
});

// PR11072026 W1 — resolvedor: overlay do catálogo (mode/cost) aplicado ANTES do roteamento
// do meter. Confirma que o merge base+override em credit-action-catalog.ts chega vivo até
// aqui (o meter não muda; só o que getCreditActionDefinition devolve muda).
test('resolvedor: override mode="free" faz o meter não medir a ação (nem track nem debit)', async () => {
  await withEnv({ HBX_CREDITS_ENABLED: 'true' }, async () => {
    applyCreditActionOverrides([{ actionKey: 'ai_realtime', override: { mode: 'free' } }]);
    const { credits, wallet, shadowCalls, debitCalls } = makeFakes();
    const meter = new CreditMeterService(credits, wallet);
    await meter.meter({ companyId: 1, actionKey: 'ai_realtime', refId: 'r1' });
    assert.equal(shadowCalls.length, 0);
    assert.equal(debitCalls.length, 0);
  });
});

test('resolvedor: override cost=3 multiplica o track (units * cost)', async () => {
  await withEnv({ HBX_CREDITS_ENABLED: 'true' }, async () => {
    applyCreditActionOverrides([{ actionKey: 'whatsapp_auto_send', override: { cost: 3 } }]);
    const { credits, wallet, shadowCalls, debitCalls } = makeFakes();
    const meter = new CreditMeterService(credits, wallet);
    await meter.meter({ companyId: 7, actionKey: 'whatsapp_auto_send', refId: 'wa:1' });
    assert.equal(shadowCalls.length, 1);
    assert.equal(shadowCalls[0].units, 3, 'amount = units(1) * cost override(3)');
    assert.equal(debitCalls.length, 0, 'override de cost não muda o modo — continua track');
  });
});

test('gateway: erro do fn NÃO emite uso (uso = sucesso) e listener explosivo não derruba a chamada', async () => {
  await withEnv({ HBX_AI_GATEWAY_ENABLED: 'false' }, async () => {
    const events: any[] = [];
    AiGatewayService.setUsageListener(() => { events.push(1); throw new Error('listener podre'); });
    try {
      await assert.rejects(
        AiGatewayService.run('realtime', 1000, async () => { throw new Error('ollama fora'); }, { companyId: 9 }),
        /ollama fora/,
      );
      assert.equal(events.length, 0, 'erro não é uso');
      const ok = await AiGatewayService.run('realtime', 1000, async () => 'ok', { companyId: 9 });
      assert.equal(ok.ok, true, 'listener que lança não pode afetar a chamada');
      assert.equal(events.length, 1);
    } finally {
      AiGatewayService.setUsageListener(null);
    }
  });
});
