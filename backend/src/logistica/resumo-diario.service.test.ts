import test from 'node:test';
import assert from 'node:assert/strict';

import { ResumoDiarioService } from './resumo-diario.service';

// ============================================================================
// S3 RESUMO-DIÁRIO — prova o FREIO do resumo do dono no WhatsApp (DORMENTE):
//   1. flag global OFF (default) → tick é no-op TOTAL (nem lê o banco);
//   2. toggle do tenant OFF → empresa nem entra na varredura (zero envio);
//   3. telefone NÃO verificado (ou ausente) → pula em silêncio;
//   4. idempotência por dia — 2 ticks (e restart), 1 envio só;
//   5. hora-alvo respeitada — tick ANTES da hora não envia;
//   + retry limitado: falha não marca enviado, retenta 1x no MESMO dia e
//     desiste (teto 2 tentativas/dia em memória);
//   + conteúdo: caminho blindado (senderType system), R$ SÓ com o módulo
//     financeiro do tenant ativo.
// ============================================================================

const FLAG = 'HBX_RESUMO_DIARIO_ENABLED';

// Relógio LOCAL fixo (11/jul/2026): a hora-alvo default é 7h.
const AS_6H30 = new Date(2026, 6, 11, 6, 30);
const AS_7H30 = new Date(2026, 6, 11, 7, 30);
const AS_7H50 = new Date(2026, 6, 11, 7, 50);
const AS_8H10 = new Date(2026, 6, 11, 8, 10);
const AMANHA_7H30 = new Date(2026, 6, 12, 7, 30);

// Mock Prisma mínimo: só o que o serviço toca. `cfgs` é o "banco" mutável —
// o update do ultimoEnvio persiste nele (o 2º tick relê como o Postgres releria).
function buildDb(
  opts: {
    cfgs?: Array<Record<string, any>>;
    companies?: Record<number, any>;
    naRotaHoje?: number;
  } = {},
) {
  const cfgs = (opts.cfgs ?? []).map((c) => ({ ...c }));
  let consultouConfigs = false;
  let leuCompany = 0;
  const prisma: any = {
    logisticaConfig: {
      findMany: async (args: any) => {
        consultouConfigs = true;
        const w = args?.where || {};
        return cfgs
          .filter((c) => (w.resumoDiarioAtivo === undefined ? true : !!c.resumoDiarioAtivo === !!w.resumoDiarioAtivo))
          .map((c) => ({
            companyId: c.companyId,
            resumoDiarioHora: c.resumoDiarioHora,
            resumoDiarioUltimoEnvio: c.resumoDiarioUltimoEnvio ?? null,
            moduloFinanceiroAtivo: !!c.moduloFinanceiroAtivo,
          }));
      },
      update: async (args: any) => {
        const cfg = cfgs.find((c) => c.companyId === args?.where?.companyId);
        if (!cfg) throw new Error('config não encontrada');
        Object.assign(cfg, args?.data || {});
        return { ...cfg };
      },
    },
    company: {
      findUnique: async (args: any) => {
        leuCompany += 1;
        return (opts.companies ?? {})[args?.where?.id] ?? null;
      },
    },
    entrega: {
      count: async () => opts.naRotaHoje ?? 0,
    },
  };
  return { prisma, cfgs, consultouConfigs: () => consultouConfigs, leuCompany: () => leuCompany };
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

// Mock do LogisticaService: só os 2 métodos EXISTENTES que o resumo reusa.
function buildLogistica(
  opts: { entreguesOntem?: number; recebidoOntem?: number; devedores?: number[] } = {},
) {
  const resumoDiaCalls: Array<{ companyId: number; date?: string }> = [];
  const svc: any = {
    resumoDia: async (companyId: number, date?: string) => {
      resumoDiaCalls.push({ companyId, date });
      return {
        date: date ?? '',
        entregues: opts.entreguesOntem ?? 0,
        recebidoHoje: opts.recebidoOntem ?? 0,
        aReceber: 0,
      };
    },
    saldosFinanceiro: async () => ({
      moduloFinanceiroAtivo: true,
      clientes: (opts.devedores ?? []).map((saldoAberto, i) => ({
        customerProfileId: `cli-${i}`,
        nome: `Cliente ${i}`,
        saldoAberto,
        aguardandoFechamento: 0,
      })),
    }),
  };
  return { svc, resumoDiaCalls };
}

function cfgOn(overrides: Record<string, any> = {}) {
  return {
    companyId: 1,
    resumoDiarioAtivo: true,
    resumoDiarioHora: 7,
    resumoDiarioUltimoEnvio: null,
    moduloFinanceiroAtivo: true,
    ...overrides,
  };
}

function companyVerificada(overrides: Record<string, any> = {}) {
  return {
    contactPhone: '5511999990000',
    contactPhoneVerifiedAt: new Date(2026, 5, 1),
    ...overrides,
  };
}

function comFlag<T>(valor: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[FLAG];
  if (valor === undefined) delete process.env[FLAG];
  else process.env[FLAG] = valor;
  return fn().finally(() => {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  });
}

function servico(db: any, conv: any, log: any) {
  return new ResumoDiarioService(db.prisma, conv.svc, log.svc);
}

// ── 1. flag global OFF (default) → tick é no-op TOTAL ─────────────────────────
test('S3 (1): flag OFF → tick no-op (nem lê o banco), zero envio', async () => {
  await comFlag(undefined, async () => {
    const db = buildDb({ cfgs: [cfgOn()], companies: { 1: companyVerificada() }, naRotaHoje: 8 });
    const conv = buildConversations();
    const service = servico(db, conv, buildLogistica());

    const r = await service.tick(AS_7H30);
    assert.deepEqual(r, { enviados: 0, pulados: 0, falhas: 0 }, 'tick devolve zeros');
    assert.equal(db.consultouConfigs(), false, 'flag OFF: NENHUMA leitura de config');
    assert.equal(conv.calls.length, 0, 'flag OFF: nenhum envio');
  });
});

// ── 2. toggle do tenant OFF → empresa nem entra na varredura ──────────────────
test('S3 (2): flag ON mas resumoDiarioAtivo=false → pula a empresa (zero envio)', async () => {
  await comFlag('1', async () => {
    const db = buildDb({
      cfgs: [cfgOn({ resumoDiarioAtivo: false })],
      companies: { 1: companyVerificada() },
    });
    const conv = buildConversations();
    const service = servico(db, conv, buildLogistica());

    const r = await service.tick(AS_7H30);
    assert.deepEqual(r, { enviados: 0, pulados: 0, falhas: 0 }, 'tenant OFF: varredura vazia');
    assert.equal(db.leuCompany(), 0, 'tenant OFF: nem o telefone da empresa é lido');
    assert.equal(conv.calls.length, 0);
  });
});

// ── 3. telefone não-verificado (ou ausente) → pula em silêncio ────────────────
test('S3 (3): contactPhone sem contactPhoneVerifiedAt → pula (sem envio, sem marca)', async () => {
  await comFlag('1', async () => {
    // (a) telefone digitado mas NUNCA verificado por OTP.
    const dbA = buildDb({
      cfgs: [cfgOn()],
      companies: { 1: companyVerificada({ contactPhoneVerifiedAt: null }) },
    });
    const convA = buildConversations();
    const rA = await servico(dbA, convA, buildLogistica()).tick(AS_7H30);
    assert.equal(rA.pulados, 1, 'não-verificado: pulado');
    assert.equal(rA.enviados, 0);
    assert.equal(convA.calls.length, 0, 'não-verificado: NENHUM envio');
    assert.equal(dbA.cfgs[0].resumoDiarioUltimoEnvio, null, 'não marca envio');

    // (b) cadastro sem telefone nenhum (verificação órfã não salva).
    const dbB = buildDb({
      cfgs: [cfgOn()],
      companies: { 1: companyVerificada({ contactPhone: null }) },
    });
    const convB = buildConversations();
    const rB = await servico(dbB, convB, buildLogistica()).tick(AS_7H30);
    assert.equal(rB.pulados, 1, 'sem telefone: pulado');
    assert.equal(convB.calls.length, 0);
  });
});

// ── 4. idempotência por dia — 2 ticks (e restart), 1 envio só ─────────────────
test('S3 (4): 2 ticks no mesmo dia = 1 envio; restart não reenvia; amanhã envia de novo', async () => {
  await comFlag('1', async () => {
    const db = buildDb({ cfgs: [cfgOn()], companies: { 1: companyVerificada() }, naRotaHoje: 8 });
    const conv = buildConversations();
    const service = servico(db, conv, buildLogistica({ entreguesOntem: 12, recebidoOntem: 340, devedores: [1000, 250] }));

    const r1 = await service.tick(AS_7H30);
    assert.equal(r1.enviados, 1, '1º tick envia');
    assert.ok(db.cfgs[0].resumoDiarioUltimoEnvio instanceof Date, 'marca persistida no banco');

    const r2 = await service.tick(AS_7H50);
    assert.equal(r2.enviados, 0, '2º tick do dia não reenvia');
    assert.equal(r2.pulados, 1);
    assert.equal(conv.calls.length, 1, 'no total, UMA mensagem no dia');

    // Restart do container = instância NOVA, MESMO banco → também não reenvia.
    const serviceNovo = servico(db, conv, buildLogistica());
    const r3 = await serviceNovo.tick(AS_8H10);
    assert.equal(r3.enviados, 0, 'restart não reenvia (marca está no banco)');
    assert.equal(conv.calls.length, 1);

    // Virou o dia → a marca de ontem não trava o resumo de amanhã.
    const r4 = await serviceNovo.tick(AMANHA_7H30);
    assert.equal(r4.enviados, 1, 'dia seguinte envia de novo');
    assert.equal(conv.calls.length, 2);
  });
});

// ── 5. hora-alvo respeitada — tick antes da hora não envia ────────────────────
test('S3 (5): tick antes da hora-alvo não envia; depois da hora envia', async () => {
  await comFlag('1', async () => {
    const db = buildDb({ cfgs: [cfgOn({ resumoDiarioHora: 7 })], companies: { 1: companyVerificada() } });
    const conv = buildConversations();
    const service = servico(db, conv, buildLogistica());

    const antes = await service.tick(AS_6H30);
    assert.equal(antes.enviados, 0, '6h30 < 7h: não envia');
    assert.equal(antes.pulados, 1);
    assert.equal(db.leuCompany(), 0, 'antes da hora nem lê a empresa');
    assert.equal(conv.calls.length, 0);

    const depois = await service.tick(AS_7H30);
    assert.equal(depois.enviados, 1, '7h30 >= 7h: envia');
    assert.equal(conv.calls.length, 1);
  });
});

// ── extra: falha de envio não marca; retry 1x no MESMO dia; 2 falhas = desiste ─
test('S3 (extra): falha não grava a marca, retenta no tick seguinte e desiste na 3ª', async () => {
  await comFlag('1', async () => {
    // (a) 1ª tentativa falha (ex.: sem chip) → sem marca; chip volta → 2ª envia.
    const db = buildDb({ cfgs: [cfgOn()], companies: { 1: companyVerificada() } });
    const convRuim = buildConversations({ fail: true });
    const service = servico(db, convRuim, buildLogistica());

    const r1 = await service.tick(AS_7H30);
    assert.equal(r1.falhas, 1, 'envio falhou');
    assert.equal(db.cfgs[0].resumoDiarioUltimoEnvio, null, 'falha NÃO marca como enviado');

    const rRetry = await service.tick(AS_7H50);
    assert.equal(rRetry.falhas, 1, '2ª tentativa (retry do mesmo dia) falha de novo');

    const r3 = await service.tick(AS_8H10);
    assert.equal(r3.falhas, 0, '3ª vez nem tenta (teto 2 tentativas/dia)');
    assert.equal(r3.pulados, 1, 'desistiu até amanhã');
    assert.equal(db.cfgs[0].resumoDiarioUltimoEnvio, null, 'continua sem marca (amanhã tenta)');

    // (b) chip volta (conversa BOA), MESMO banco: o retry do dia envia — aqui em
    // instância nova (restart zera o contador; quem impede duplicata é a marca,
    // e marca não existe porque nada saiu).
    const convBoa = buildConversations();
    const service2 = new ResumoDiarioService(db.prisma, convBoa.svc, buildLogistica().svc);
    const rOk = await service2.tick(AS_7H50);
    assert.equal(rOk.enviados, 1, 'com o chip de pé, o envio do dia sai');
    assert.ok(db.cfgs[0].resumoDiarioUltimoEnvio instanceof Date, 'agora sim, marca gravada');
  });
});

// ── extra: conteúdo + caminho blindado ─────────────────────────────────────────
test('S3 (extra): mensagem curta com R$ (financeiro ON) via senderType system', async () => {
  await comFlag('1', async () => {
    const db = buildDb({ cfgs: [cfgOn()], companies: { 1: companyVerificada() }, naRotaHoje: 8 });
    const conv = buildConversations();
    const log = buildLogistica({ entreguesOntem: 12, recebidoOntem: 340, devedores: [1000, 150, 100] });
    const service = servico(db, conv, log);

    const r = await service.tick(AS_7H30);
    assert.equal(r.enviados, 1);

    const { companyId, payload } = conv.calls[0];
    assert.equal(companyId, 1);
    assert.equal(payload.senderType, 'system', 'senderType system (gate anti-bot do queueOutbound)');
    assert.equal(payload.sourceModule, 'resumo_diario');
    assert.equal(payload.messageType, 'text');
    assert.equal(payload.to, '+5511999990000', 'telefone E.164 do DONO (normalizeBrPhoneE164)');

    const body: string = payload.body;
    assert.ok(body.startsWith('Bom dia!'), 'saudação por horário (7h30 = bom dia)');
    assert.ok(body.includes('8 entregas na rota'), 'entregas de hoje (agendada/em_rota)');
    assert.ok(body.includes('12 entregues'), 'entregues de ontem (resumoDia existente)');
    assert.ok(body.includes('R$ 340,00 recebidos'), 'recebido ontem no formato BR');
    assert.ok(body.includes('Em aberto: R$ 1250,00 (3 clientes)'), 'total devido + nº de clientes');
    assert.ok(body.split('\n').length <= 6, 'mensagem curta (3-6 linhas)');

    // resumoDia foi chamado com a data de ONTEM (10/07), não a de hoje.
    assert.equal(log.resumoDiaCalls.length, 1);
    assert.equal(log.resumoDiaCalls[0].date, '2026-07-10');
  });
});

test('S3 (extra): financeiro do tenant OFF → NENHUM R$ na mensagem (só contagens)', async () => {
  await comFlag('1', async () => {
    const db = buildDb({
      cfgs: [cfgOn({ moduloFinanceiroAtivo: false })],
      companies: { 1: companyVerificada() },
      naRotaHoje: 5,
    });
    const conv = buildConversations();
    const service = servico(db, conv, buildLogistica({ entreguesOntem: 4, recebidoOntem: 999, devedores: [500] }));

    const r = await service.tick(AS_7H30);
    assert.equal(r.enviados, 1);
    const body: string = conv.calls[0].payload.body;
    assert.ok(body.includes('5 entregas na rota'), 'contagem de hoje presente');
    assert.ok(body.includes('4 entregues'), 'contagem de ontem presente');
    assert.ok(!body.includes('R$'), 'financeiro OFF: nenhum valor na mensagem');
    assert.ok(!body.includes('Em aberto'), 'financeiro OFF: sem bloco de dívida');
  });
});
