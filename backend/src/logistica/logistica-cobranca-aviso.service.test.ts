import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaCobrancaAvisoService } from './logistica-cobranca-aviso.service';

// ============================================================================
// S2 COBRANÇA-WHATS — prova o FREIO da cobrança por WhatsApp (feature DORMENTE):
//   1. flag global OFF (default) → tick é no-op TOTAL (nem lê o banco);
//   2. toggle do tenant OFF → pula a empresa (zero envio);
//   3. idempotência dura — 2 ticks no mesmo dia NÃO duplicam o aviso;
//   4. opt-out do cliente (avisarCobranca=false) e sem telefone → silêncio;
//   5. teto diário por empresa → para a varredura ao atingir;
//   + lançamento: mensagem curta com valor/referência/Pix pelo caminho blindado
//     (senderType 'system'); falha de envio NÃO marca como enviado (claim some).
// ============================================================================

const FLAG = 'HBX_COBRANCA_WHATS_ENABLED';
const TETO = 'HBX_COBRANCA_WHATS_TETO_DIA';

// Mock Prisma mínimo: só o que o serviço toca. "Tabelas" injetáveis em memória;
// logisticaCobrancaAviso impõe o unique (chargeId, tipo) com P2002, como o banco.
function buildDb(opts: { charges?: any[]; clientes?: Record<string, any>; cfgs?: Record<number, any> } = {}) {
  const avisos: any[] = [];
  const chaves = new Set<string>();
  let consultouCharges = false;
  const prisma: any = {
    financeiroCharge: {
      findMany: async (args: any) => {
        consultouCharges = true;
        const w = args?.where || {};
        return (opts.charges ?? [])
          .filter((c) => {
            if (w.status && c.status !== w.status) return false;
            const prefix = w.sourceModule?.startsWith;
            if (prefix && !String(c.sourceModule || '').startsWith(prefix)) return false;
            if (w.customerProfileId?.not === null && c.customerProfileId == null) return false;
            if (w.dueDate) {
              const due = c.dueDate instanceof Date ? c.dueDate : new Date(c.dueDate);
              if (w.dueDate.gte && due < w.dueDate.gte) return false;
              if (w.dueDate.lte && due > w.dueDate.lte) return false;
            }
            return true;
          })
          .map((c) => ({
            id: c.id,
            companyId: c.companyId,
            amount: c.amount,
            description: c.description,
            customerProfileId: c.customerProfileId,
          }));
      },
      findFirst: async (args: any) => {
        consultouCharges = true;
        const w = args?.where || {};
        const c = (opts.charges ?? []).find(
          (x) => x.id === w.id && x.companyId === w.companyId && (!w.status || x.status === w.status),
        );
        if (!c || c.customerProfileId == null) return null;
        return {
          id: c.id,
          companyId: c.companyId,
          amount: c.amount,
          description: c.description,
          customerProfileId: c.customerProfileId,
        };
      },
    },
    logisticaConfig: {
      findUnique: async (args: any) => (opts.cfgs ?? {})[args?.where?.companyId] ?? null,
    },
    customerProfile: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        const cli = (opts.clientes ?? {})[w.id];
        return cli && cli.companyId === w.companyId ? cli : null;
      },
    },
    logisticaCobrancaAviso: {
      create: async (args: any) => {
        const k = `${args.data.chargeId}:${args.data.tipo}`;
        if (chaves.has(k)) {
          const err: any = new Error('Unique constraint failed');
          err.code = 'P2002';
          throw err;
        }
        chaves.add(k);
        const row = { id: `aviso-${avisos.length + 1}`, ...args.data };
        avisos.push(row);
        return row;
      },
      delete: async (args: any) => {
        const w = args?.where?.chargeId_tipo || {};
        chaves.delete(`${w.chargeId}:${w.tipo}`);
        const idx = avisos.findIndex((a) => a.chargeId === w.chargeId && a.tipo === w.tipo);
        if (idx >= 0) avisos.splice(idx, 1);
        return {};
      },
    },
  };
  return { prisma, avisos, consultouCharges: () => consultouCharges };
}

function buildConversations(opts: { fail?: boolean } = {}) {
  const calls: Array<{ companyId: number; payload: any }> = [];
  const svc: any = {
    queueOutboundForCompany: async (companyId: number, payload: any) => {
      if (opts.fail) throw new Error('WhatsApp Evolution nao configurado para esta empresa.');
      calls.push({ companyId, payload });
      return { id: calls.length };
    },
  };
  return { calls, svc };
}

function chargeHoje(overrides: Record<string, any> = {}) {
  return {
    id: 'charge-1',
    companyId: 1,
    amount: 20,
    description: 'Entrega — Dona Maria',
    status: 'pending',
    lifecycle: 'in_progress',
    sourceModule: 'logistica_entrega',
    customerProfileId: 'conta-1',
    dueDate: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function clienteOk(overrides: Record<string, any> = {}) {
  return {
    id: 'conta-1',
    companyId: 1,
    name: 'Dona Maria',
    phoneNormalized: '5511999990000',
    avisarCobranca: true,
    ...overrides,
  };
}

const CFG_ON = { cobrancaWhatsAtiva: true, pixChave: 'dono@pix.com', pixNome: 'Deposito Agua', pixCidade: 'Rio Claro' };

function comFlag<T>(valor: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[FLAG];
  if (valor === undefined) delete process.env[FLAG];
  else process.env[FLAG] = valor;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });
}

// ── 1. flag global OFF (default) → tick e lançamento são no-op TOTAL ──────────
test('S2 (1): flag OFF → tick no-op (nem lê o banco) e lançamento pulado', async () => {
  await comFlag(undefined, async () => {
    const db = buildDb({ charges: [chargeHoje()], clientes: { 'conta-1': clienteOk() }, cfgs: { 1: CFG_ON } });
    const conv = buildConversations();
    const service = new LogisticaCobrancaAvisoService(db.prisma, conv.svc);

    const r = await service.tick();
    assert.deepEqual(r, { enviados: 0, pulados: 0, falhas: 0 }, 'tick devolve zeros');
    assert.equal(db.consultouCharges(), false, 'flag OFF: NENHUMA leitura de charges');
    assert.equal(conv.calls.length, 0, 'flag OFF: nenhum envio');

    const l = await service.avisarLancamento(1, 'charge-1');
    assert.equal(l.status, 'pulado');
    assert.equal(l.motivo, 'flag_off');
    assert.equal(conv.calls.length, 0, 'lançamento com flag OFF: nenhum envio');
  });
});

// ── 2. toggle do tenant OFF → pula a empresa inteira ──────────────────────────
test('S2 (2): flag ON mas cobrancaWhatsAtiva=false → pula a empresa (zero envio)', async () => {
  await comFlag('1', async () => {
    const db = buildDb({
      charges: [chargeHoje()],
      clientes: { 'conta-1': clienteOk() },
      cfgs: { 1: { ...CFG_ON, cobrancaWhatsAtiva: false } },
    });
    const conv = buildConversations();
    const service = new LogisticaCobrancaAvisoService(db.prisma, conv.svc);

    const r = await service.tick();
    assert.equal(r.enviados, 0, 'tenant OFF: nada enviado');
    assert.equal(r.pulados, 1, 'charge da empresa pulado');
    assert.equal(conv.calls.length, 0);
    assert.equal(db.avisos.length, 0, 'tenant OFF: nem claim de idempotência é criado');

    // Config AUSENTE (empresa nunca configurou) também é fail-closed.
    const db2 = buildDb({ charges: [chargeHoje()], clientes: { 'conta-1': clienteOk() }, cfgs: {} });
    const conv2 = buildConversations();
    const service2 = new LogisticaCobrancaAvisoService(db2.prisma, conv2.svc);
    const r2 = await service2.tick();
    assert.equal(r2.enviados, 0, 'sem config: fail-closed');
    assert.equal(conv2.calls.length, 0);
  });
});

// ── 3. idempotência dura — 2 ticks no mesmo dia = 1 aviso só ──────────────────
test('S2 (3): 2 ticks não duplicam o lembrete (unique chargeId+tipo)', async () => {
  await comFlag('1', async () => {
    const db = buildDb({ charges: [chargeHoje()], clientes: { 'conta-1': clienteOk() }, cfgs: { 1: CFG_ON } });
    const conv = buildConversations();
    const service = new LogisticaCobrancaAvisoService(db.prisma, conv.svc);

    const r1 = await service.tick();
    assert.equal(r1.enviados, 1, '1º tick envia');
    const r2 = await service.tick();
    assert.equal(r2.enviados, 0, '2º tick não reenvia');
    assert.equal(r2.pulados, 1, '2º tick pula (já avisado)');
    assert.equal(conv.calls.length, 1, 'no total, UMA mensagem');
    assert.equal(db.avisos.length, 1, 'UMA marca persistida');

    // Restart do container = outra instância, MESMO banco → também não reenvia.
    const serviceNovo = new LogisticaCobrancaAvisoService(db.prisma, conv.svc);
    const r3 = await serviceNovo.tick();
    assert.equal(r3.enviados, 0, 'restart não reenvia (idempotência está no banco)');
    assert.equal(conv.calls.length, 1);
  });
});

// ── 4. opt-out do cliente + sem telefone → silêncio (sem claim, sem envio) ────
test('S2 (4): avisarCobranca=false OU sem phoneNormalized → não envia', async () => {
  await comFlag('1', async () => {
    // (a) opt-out explícito
    const dbA = buildDb({
      charges: [chargeHoje()],
      clientes: { 'conta-1': clienteOk({ avisarCobranca: false }) },
      cfgs: { 1: CFG_ON },
    });
    const convA = buildConversations();
    const rA = await new LogisticaCobrancaAvisoService(dbA.prisma, convA.svc).tick();
    assert.equal(rA.enviados, 0, 'opt-out: nada enviado');
    assert.equal(convA.calls.length, 0);
    assert.equal(dbA.avisos.length, 0, 'opt-out: nem claim (pode reativar depois)');

    // (b) sem telefone (phoneNormalized null)
    const dbB = buildDb({
      charges: [chargeHoje()],
      clientes: { 'conta-1': clienteOk({ phoneNormalized: null }) },
      cfgs: { 1: CFG_ON },
    });
    const convB = buildConversations();
    const rB = await new LogisticaCobrancaAvisoService(dbB.prisma, convB.svc).tick();
    assert.equal(rB.enviados, 0, 'sem telefone: nada enviado');
    assert.equal(convB.calls.length, 0);
    assert.equal(dbB.avisos.length, 0);
  });
});

// ── 5. teto diário por empresa → para a varredura ao atingir ──────────────────
test('S2 (5): teto diário da empresa corta a varredura (2 de 3 saem com teto=2)', async () => {
  const prevTeto = process.env[TETO];
  process.env[TETO] = '2';
  try {
    await comFlag('1', async () => {
      const db = buildDb({
        charges: [
          chargeHoje({ id: 'charge-1' }),
          chargeHoje({ id: 'charge-2', description: 'Entrega — Seu José', customerProfileId: 'conta-2' }),
          chargeHoje({ id: 'charge-3', description: 'Fatura mensal — Dona Maria (jul/2026)', sourceModule: 'logistica_fechamento' }),
        ],
        clientes: {
          'conta-1': clienteOk(),
          'conta-2': clienteOk({ id: 'conta-2', name: 'Seu José', phoneNormalized: '5511988880000' }),
        },
        cfgs: { 1: CFG_ON },
      });
      const conv = buildConversations();
      const service = new LogisticaCobrancaAvisoService(db.prisma, conv.svc);

      const r = await service.tick();
      assert.equal(r.enviados, 2, 'teto=2: só 2 avisos saem');
      assert.equal(r.pulados, 1, 'o 3º é pulado (teto_dia)');
      assert.equal(conv.calls.length, 2, 'tráfego DURO em 2 mensagens/dia');
    });
  } finally {
    if (prevTeto === undefined) delete process.env[TETO];
    else process.env[TETO] = prevTeto;
  }
});

// ── extra: lançamento — mensagem curta + caminho blindado (senderType system) ──
test('S2 (extra): avisarLancamento envia valor + referência + Pix copia-e-cola via caminho blindado', async () => {
  await comFlag('1', async () => {
    const db = buildDb({ charges: [chargeHoje()], clientes: { 'conta-1': clienteOk() }, cfgs: { 1: CFG_ON } });
    const conv = buildConversations();
    const service = new LogisticaCobrancaAvisoService(db.prisma, conv.svc);

    const r = await service.avisarLancamento(1, 'charge-1');
    assert.equal(r.status, 'enviado');
    assert.equal(conv.calls.length, 1);

    const { companyId, payload } = conv.calls[0];
    assert.equal(companyId, 1);
    assert.equal(payload.senderType, 'system', 'senderType system (gate anti-bot do queueOutbound)');
    assert.equal(payload.sourceModule, 'logistica_cobranca');
    assert.equal(payload.messageType, 'text');
    assert.equal(payload.to, '+5511999990000', 'telefone E.164 do cliente (normalizeBrPhoneE164)');
    assert.ok(payload.body.includes('R$ 20,00'), 'valor no formato BR');
    assert.ok(payload.body.includes('Entrega — Dona Maria'), 'referência = description do charge');
    assert.ok(payload.body.includes('Pix copia e cola'), 'bloco do Pix presente');
    assert.ok(payload.body.includes('000201'), 'payload EMV do BR Code embutido');
    assert.ok(payload.body.includes('dono@pix.com'), 'chave Pix do tenant no código');

    // 2ª chamada do MESMO charge (ex.: retry do chamador) → idempotente.
    const r2 = await service.avisarLancamento(1, 'charge-1');
    assert.equal(r2.status, 'pulado');
    assert.equal(r2.motivo, 'ja_avisado');
    assert.equal(conv.calls.length, 1, 'nenhuma duplicata');

    // O lembrete de VENCIMENTO do mesmo charge continua elegível (tipo separado).
    const r3 = await service.tick();
    assert.equal(r3.enviados, 1, 'vencimento é outro tipo — 1 lembrete sai');
    assert.equal(conv.calls.length, 2);
  });
});

// ── extra: sem chip/envio falhou → NÃO marca como enviado (retry no próximo tick) ─
test('S2 (extra): falha de envio desfaz o claim — próximo tick pode tentar de novo', async () => {
  await comFlag('1', async () => {
    const db = buildDb({ charges: [chargeHoje()], clientes: { 'conta-1': clienteOk() }, cfgs: { 1: CFG_ON } });
    const convRuim = buildConversations({ fail: true });
    const service = new LogisticaCobrancaAvisoService(db.prisma, convRuim.svc);

    const r = await service.tick();
    assert.equal(r.falhas, 1, 'envio falhou (ex.: sem chip operacional)');
    assert.equal(db.avisos.length, 0, 'NÃO ficou marcado como enviado');

    // Chip voltou: o mesmo banco, conversas boas → o lembrete sai agora.
    const convBoa = buildConversations();
    const service2 = new LogisticaCobrancaAvisoService(db.prisma, convBoa.svc);
    const r2 = await service2.tick();
    assert.equal(r2.enviados, 1, 'próximo tick envia');
    assert.equal(db.avisos.length, 1);
  });
});

// ── extra: charge vencendo OUTRO dia não entra no lembrete de hoje ─────────────
test('S2 (extra): lembrete só pega dueDate = HOJE (amanhã/ontem ficam de fora)', async () => {
  await comFlag('1', async () => {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const db = buildDb({
      charges: [
        chargeHoje({ id: 'charge-amanha', dueDate: amanha }),
        // ontem = papel do hbx-recovery (régua de vencido NÃO é daqui).
        chargeHoje({ id: 'charge-ontem', dueDate: ontem }),
      ],
      clientes: { 'conta-1': clienteOk() },
      cfgs: { 1: CFG_ON },
    });
    const conv = buildConversations();
    const r = await new LogisticaCobrancaAvisoService(db.prisma, conv.svc).tick();
    assert.equal(r.enviados, 0, 'nenhum charge vence hoje → nada sai');
    assert.equal(conv.calls.length, 0);
  });
});
