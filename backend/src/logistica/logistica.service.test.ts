import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaService } from './logistica.service';

// NÚCLEO-CRM N6 — prova o FREIO de segurança do módulo Logística:
//   Com HBX_LOGISTICA_ENABLED OFF (default), confirmar entrega SÓ muda status/GPS
//   e NÃO chama o disparo de WhatsApp (queueOutboundForCompany) NEM cria cobrança.
//   Com a flag ON, confirmar chama o WhatsApp blindado + lança a cobrança.
// Isso trava o incidente do dono: nenhum toque em chip sem a flag explícita.
//
// NÚCLEO-CRM R2 — prova o FINANCEIRO DE VERDADE (charge linkada + fechar-mês + extrato):
//   idempotência da cobrança por entrega, contabilizar=false → 0 charge, mensal →
//   aguardando_fechamento, fechar-mês agrupa N entregas em 1 charge (2× não duplica),
//   extrato lista os charges do cliente. NADA toca MercadoPago (MANUAL/pending).

function buildEntrega(overrides: Record<string, any> = {}) {
  return {
    id: 'entrega-1',
    status: 'em_rota',
    customerProfileId: 'conta-1',
    contatoId: null,
    valor: 20,
    cobrancaStatus: 'pendente',
    ...overrides,
  };
}

// Prisma mock mínimo: só o que confirmarEntrega/lancarCobranca tocam.
// R2: financeiroCharge.findFirst (idempotência por entregaId) + um "banco" de charges.
// R4: entrega.updateMany (claim do teto do reenvio) + masterEvent (trilha de falha).
function buildPrismaMock(entrega: any, conta: any) {
  const chargesCreated: any[] = [];
  const entregaUpdates: any[] = [];
  const masterEvents: any[] = [];
  const prisma: any = {
    entrega: {
      findFirst: async () => entrega,
      update: async (args: any) => {
        entregaUpdates.push(args.data);
        if (args.data?.cobrancaStatus) entrega.cobrancaStatus = args.data.cobrancaStatus;
        if (args.data?.status) entrega.status = args.data.status;
        if (args.data?.whatsappStatus !== undefined) entrega.whatsappStatus = args.data.whatsappStatus;
        if (args.data?.avisoReenviado !== undefined) entrega.avisoReenviado = args.data.avisoReenviado;
        return { id: entrega.id, ...args.data };
      },
      // R4 — claim atômico do teto do reenvio: só passa false→true 1 vez.
      updateMany: async (args: any) => {
        const wantsReenvio = args?.data?.avisoReenviado === true;
        const guardFalse = args?.where?.avisoReenviado === false;
        if (wantsReenvio && guardFalse) {
          if (entrega.avisoReenviado === true) return { count: 0 }; // já reenviado
          entrega.avisoReenviado = true;
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    // M4/R3 — quantidades por item (dentro da tx do confirmar). No-op observável.
    entregaItem: {
      updateMany: async () => ({ count: 1 }),
    },
    customerProfile: {
      findFirst: async () => conta,
    },
    contato: {
      findFirst: async () => null,
    },
    financeiroCharge: {
      // idempotência dura: já existe charge desta entrega?
      findFirst: async (args: any) => {
        const entregaId = args?.where?.entregaId;
        return chargesCreated.find((c) => c.entregaId === entregaId) || null;
      },
      create: async (args: any) => {
        chargesCreated.push(args.data);
        return { id: `charge-${chargesCreated.length}`, ...args.data };
      },
    },
    // R4 — trilha do cockpit master (emitMasterEvent). Sem dedupKey batendo, sempre insere.
    masterEvent: {
      findFirst: async (args: any) => {
        const key = args?.where?.dedupKey;
        const hits = masterEvents.filter((e) => e.dedupKey === key);
        return hits.length ? hits[hits.length - 1] : null;
      },
      create: async (args: any) => {
        masterEvents.push(args.data);
        return { id: args.data?.id, ...args.data };
      },
    },
    // R3 — transação interativa do confirmar: roda o callback com o MESMO prisma (o
    // mock não isola de verdade, mas prova que o serviço passa por $transaction).
    $transaction: async (fn: any) => fn(prisma),
  };
  return { chargesCreated, entregaUpdates, masterEvents, prisma };
}

// LogisticaRotaService stub: o re-ETA pós-ação (M3) é aditivo/best-effort e não
// faz parte do que este teste do FREIO N6 prova. No-op observável (conta chamadas).
function buildRotaStub() {
  const calls: any[] = [];
  return {
    calls,
    rota: {
      recalcularEtaRestantes: async (companyId: number) => {
        calls.push({ companyId });
        return { recalculadas: 0 };
      },
    } as any,
  };
}

// ConversationsService mock: conta as chamadas do caminho blindado.
function buildConversationsMock() {
  const calls: any[] = [];
  return {
    calls,
    conversations: {
      queueOutboundForCompany: async (companyId: number, payload: any) => {
        calls.push({ companyId, payload });
        return { queued: true };
      },
    } as any,
  };
}

// M5 — LogisticaConfigService mock: resolverAviso decide o 2-níveis de aviso.
// habilitado padrão = true (avisa), template null (usa a msg fixa de fallback).
function buildConfigMock(over: { habilitado?: boolean; template?: string | null } = {}) {
  const calls: any[] = [];
  return {
    calls,
    config: {
      resolverAviso: async (companyId: number, avisarCliente: boolean | null | undefined) => {
        calls.push({ companyId, avisarCliente });
        return { habilitado: over.habilitado ?? true, template: over.template ?? null };
      },
    } as any,
  };
}

test('confirmarEntrega: flag OFF → NÃO chama WhatsApp e NÃO cria cobrança (só status/GPS)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  delete process.env.HBX_LOGISTICA_ENABLED; // default OFF

  const { prisma, chargesCreated, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.status, 'entregue');
  assert.equal(res?.effectsEnabled, false);
  assert.equal(res?.whatsappSent, false);
  assert.equal(res?.cobrancaLancada, false);
  // O disparo de WhatsApp NÃO foi chamado.
  assert.equal(calls.length, 0, 'queueOutboundForCompany não deve ser chamado com a flag OFF');
  // Nenhuma cobrança criada.
  assert.equal(chargesCreated.length, 0, 'nenhum FinanceiroCharge deve ser criado com a flag OFF');
  // O status/GPS FORAM gravados (o efeito seguro sempre roda).
  const statusUpdate = entregaUpdates.find((u) => u.status === 'entregue');
  assert.ok(statusUpdate, 'o status entregue deve ser gravado mesmo com a flag OFF');
  assert.equal(statusUpdate.deliveredLat, -4.9);
  assert.equal(statusUpdate.deliveredLng, -38.3);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('confirmarEntrega: flag ON (avulso) → WhatsApp blindado 1x + 1 charge LINKADO (MANUAL/pending)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.effectsEnabled, true);
  // Exatamente UMA chamada ao caminho blindado (nada de loop).
  assert.equal(calls.length, 1, 'deve chamar queueOutboundForCompany exatamente 1 vez');
  assert.equal(calls[0].companyId, 1);
  assert.equal(calls[0].payload.sourceModule, 'logistica_entrega');
  assert.equal(res?.whatsappSent, true);
  // Cobrança lançada (avulso, valor > 0) — LINKADA e MANUAL/pending (NÃO dispara MP).
  assert.equal(chargesCreated.length, 1, 'deve lançar 1 FinanceiroCharge');
  assert.equal(chargesCreated[0].paymentMethod, 'MANUAL');
  assert.equal(chargesCreated[0].status, 'pending');
  assert.equal(chargesCreated[0].billingCycle, 'ONCE');
  assert.equal(chargesCreated[0].customerProfileId, 'conta-1', 'charge linkada ao cliente');
  assert.equal(chargesCreated[0].entregaId, 'entrega-1', 'charge linkada à entrega');
  assert.equal(chargesCreated[0].sourceModule, 'logistica_entrega');
  assert.ok(chargesCreated[0].dueDate instanceof Date, 'avulso tem dueDate = hoje');
  assert.equal(res?.cobrancaLancada, true);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// M5 — o 2-níveis de aviso é FREIO do WhatsApp: com a flag ON, se resolverAviso
// devolver habilitado=false (avisoWhatsEnabled global OFF OU cliente.avisarEntrega
// OFF), o disparo NÃO chama queueOutboundForCompany. A cobrança segue independente.
test('confirmarEntrega: flag ON mas aviso OFF (global/cliente) → NÃO chama WhatsApp', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: false },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock({ habilitado: false }); // cliente e/ou global desligou

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.effectsEnabled, true);
  // O disparo de WhatsApp NÃO foi chamado — o freio do aviso venceu a flag ON.
  assert.equal(calls.length, 0, 'aviso OFF → queueOutboundForCompany NÃO deve ser chamado');
  assert.equal(res?.whatsappSent, false);
  // A cobrança é independente do aviso — segue lançando (avulso, valor > 0).
  assert.equal(chargesCreated.length, 1, 'a cobrança não depende do aviso');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── R2 (a) — idempotência: confirmar 2× a MESMA entrega = 1 charge ────────────
test('R2 idempotência: confirmar 2× a mesma entrega gera 1 charge (não duplica)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const entrega = buildEntrega();
  const { prisma, chargesCreated } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });
  // 1º confirm → 1 charge + entrega já 'lancada'. 2º confirm: jaEntregue barra os
  // efeitos. Mas mesmo forçando a CORRIDA (status volta a 'pendente' e a entrega
  // ainda não está 'entregue'), a guarda dura por entregaId (findFirst) impede a
  // duplicata. Simulamos os dois: reset de status + reset de jaEntregue.
  assert.equal(chargesCreated.length, 1, '1ª confirmação = 1 charge');
  entrega.status = 'em_rota'; // finge que uma corrida reabriu a entrega
  entrega.cobrancaStatus = 'pendente'; // e reverteu o status da cobrança
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(chargesCreated.length, 1, 'confirmar 2× = exatamente 1 charge (dedupe por entregaId)');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── R2 (b) — contabilizar=false → 0 charge, entrega 'nao_contabilizado' ───────
test('R2 contabilizar=false: NÃO cria charge, marca nao_contabilizado', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const entrega = buildEntrega();
  const { prisma, chargesCreated, entregaUpdates } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Zé', formaPagamento: 'avulso', contabilizar: false, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(chargesCreated.length, 0, 'contabilizar=false → 0 charge');
  assert.equal(res?.cobrancaLancada, false);
  const marcada = entregaUpdates.find((u) => u.cobrancaStatus === 'nao_contabilizado');
  assert.ok(marcada, 'entrega marcada nao_contabilizado');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── R2 (c) — mensal → entrega 'aguardando_fechamento', 0 charge na entrega ────
test('R2 mensal: NÃO lança por entrega, marca aguardando_fechamento (0 charge)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const entrega = buildEntrega();
  const { prisma, chargesCreated, entregaUpdates } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Mercadinho', formaPagamento: 'mensal', contabilizar: true, diaFechamento: 10, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(chargesCreated.length, 0, 'mensal → 0 charge na entrega (fecha no fim do mês)');
  assert.equal(res?.cobrancaLancada, false);
  const marcada = entregaUpdates.find((u) => u.cobrancaStatus === 'aguardando_fechamento');
  assert.ok(marcada, 'entrega marcada aguardando_fechamento');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── R2 (d) — fechar-mês agrupa N entregas em 1 charge; 2× não duplica ─────────
// Mock de banco em memória p/ fecharMes: customerProfile.findMany + entrega.findMany/
// updateMany + $transaction(financeiroCharge.create + entrega.updateMany).
function buildFecharMesPrisma(cliente: any, entregas: any[]) {
  const chargesCreated: any[] = [];
  const tx = {
    financeiroCharge: {
      create: async (args: any) => {
        chargesCreated.push(args.data);
        return { id: `charge-${chargesCreated.length}`, ...args.data };
      },
    },
    entrega: {
      updateMany: async (args: any) => {
        const ids: string[] = args?.where?.id?.in || [];
        const alvoStatus = args?.where?.cobrancaStatus;
        let count = 0;
        for (const e of entregas) {
          if (ids.includes(e.id) && (!alvoStatus || e.cobrancaStatus === alvoStatus)) {
            e.cobrancaStatus = args.data.cobrancaStatus;
            count += 1;
          }
        }
        return { count };
      },
    },
  };
  return {
    chargesCreated,
    prisma: {
      customerProfile: {
        findMany: async () => [cliente],
      },
      entrega: {
        findMany: async (args: any) => {
          const status = args?.where?.cobrancaStatus;
          return entregas.filter((e) => (status ? e.cobrancaStatus === status : true)).map((e) => ({ id: e.id, valor: e.valor }));
        },
      },
      financeiroCharge: {
        findMany: async () => chargesCreated,
      },
      $transaction: async (fn: any) => fn(tx),
    } as any,
  };
}

test('R2 fechar-mês: agrupa N entregas em 1 charge e roda 2× sem duplicar', async () => {
  const entregas = [
    { id: 'e1', valor: 20, cobrancaStatus: 'aguardando_fechamento' },
    { id: 'e2', valor: 15, cobrancaStatus: 'aguardando_fechamento' },
    { id: 'e3', valor: 5, cobrancaStatus: 'aguardando_fechamento' },
  ];
  const cliente = { id: 'conta-1', name: 'Mercadinho', diaFechamento: 10 };
  const { prisma, chargesCreated } = buildFecharMesPrisma(cliente, entregas);

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const r1 = await service.fecharMes(1, { clienteId: 'conta-1', mesRef: '2026-07' });

  assert.equal(chargesCreated.length, 1, '3 entregas → 1 charge');
  assert.equal(chargesCreated[0].amount, 40, 'soma 20+15+5');
  assert.equal(chargesCreated[0].paymentMethod, 'MANUAL');
  assert.equal(chargesCreated[0].status, 'pending');
  assert.equal(chargesCreated[0].billingCycle, 'MONTHLY');
  assert.equal(chargesCreated[0].customerProfileId, 'conta-1');
  assert.equal(chargesCreated[0].sourceModule, 'logistica_fechamento');
  assert.equal(r1.chargesCriados, 1);
  assert.equal(r1.faturas[0].entregas, 3);
  // as entregas viraram 'faturada'
  assert.ok(entregas.every((e) => e.cobrancaStatus === 'faturada'), 'entregas viram faturada');

  // 2ª rodada: nada mais 'aguardando_fechamento' → 0 charges novos (idempotente).
  const r2 = await service.fecharMes(1, { clienteId: 'conta-1', mesRef: '2026-07' });
  assert.equal(chargesCreated.length, 1, 'rodar 2× NÃO duplica o charge');
  assert.equal(r2.chargesCriados, 0);
});

// ── R2 (e) — extrato retorna os charges do cliente ───────────────────────────
test('R2 extrato: lista os charges linkados ao cliente (company-scoped)', async () => {
  const charges = [
    { id: 'c1', amount: 40, currency: 'BRL', description: 'Fatura mensal — X', status: 'pending', lifecycle: 'in_progress', dueDate: new Date('2026-07-10T12:00:00Z'), sourceModule: 'logistica_fechamento', entregaId: null, createdAt: new Date(), paidAt: null },
    { id: 'c2', amount: 20, currency: 'BRL', description: 'Entrega — X', status: 'pending', lifecycle: 'in_progress', dueDate: new Date(), sourceModule: 'logistica_entrega', entregaId: 'e9', createdAt: new Date(), paidAt: null },
  ];
  const prisma = {
    customerProfile: {
      findFirst: async () => ({ id: 'conta-1', name: 'Cliente X' }),
    },
    financeiroCharge: {
      findMany: async () => charges,
    },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.extratoCliente(1, 'conta-1');

  assert.ok(res, 'extrato retorna resultado');
  assert.equal(res?.clienteId, 'conta-1');
  assert.equal(res?.total, 2);
  assert.equal(res?.charges.length, 2);
  assert.equal(res?.charges[0].id, 'c1');
  assert.equal(res?.charges[1].entregaId, 'e9');
});

test('R2 extrato: cliente de outra empresa → null (company-scoped)', async () => {
  const prisma = {
    customerProfile: { findFirst: async () => null },
    financeiroCharge: { findMany: async () => [] },
  } as any;
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.extratoCliente(1, 'conta-de-outra-empresa');
  assert.equal(res, null, 'cliente fora da empresa → null');
});

// ── R4 (a) — confirmar com aviso OFF → whatsappStatus='pulado' PERSISTIDO ─────
test('R4 (a): flag ON, aviso OFF → persiste whatsappStatus=pulado (aviso_off), sem enviar', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: false },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock({ habilitado: false }); // aviso desligado

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.whatsappSent, false);
  assert.equal(calls.length, 0, 'aviso OFF → NÃO envia');
  // O desfecho foi PERSISTIDO na entrega (não só logado).
  const persist = entregaUpdates.find((u) => u.whatsappStatus !== undefined);
  assert.ok(persist, 'whatsappStatus deve ser gravado');
  assert.equal(persist.whatsappStatus, 'pulado');
  assert.equal(persist.whatsappMotivo, 'aviso_off');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── R4 (b) — confirmar com envio OK → whatsappStatus='enviado' PERSISTIDO ─────
test('R4 (b): flag ON, envio OK → persiste whatsappStatus=enviado + cobrancaOutcome', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.whatsappSent, true);
  assert.equal(calls.length, 1, 'envia 1x pelo caminho blindado');
  const persist = entregaUpdates.find((u) => u.whatsappStatus !== undefined);
  assert.ok(persist, 'whatsappStatus deve ser gravado');
  assert.equal(persist.whatsappStatus, 'enviado');
  assert.equal(persist.whatsappMotivo, null);
  assert.equal(persist.cobrancaOutcome, 'lancada', 'cobrancaOutcome espelha o desfecho da cobrança');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── R4 (c) — reenviar 1× funciona; 2× é BARRADO pelo teto (não re-envia) ──────
test('R4 (c): reenviar 1x envia pelo caminho blindado; 2x é barrado (teto 1)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const entrega = buildEntrega({ status: 'entregue', avisoReenviado: false });
  const { prisma } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);

  // 1º reenvio → dispara 1x pelo caminho blindado.
  const r1 = await service.reenviarAviso(1, 'entrega-1');
  assert.equal(r1?.reenviado, true);
  assert.equal(r1?.whatsappStatus, 'enviado');
  assert.equal(calls.length, 1, '1º reenvio envia exatamente 1x');

  // 2º reenvio → BARRADO pelo teto: NÃO chama queueOutbound de novo.
  await assert.rejects(
    () => service.reenviarAviso(1, 'entrega-1'),
    /já foi reenviado/i,
    '2º reenvio deve ser barrado pelo teto de 1',
  );
  assert.equal(calls.length, 1, 'teto 1: queueOutboundForCompany NÃO é chamado de novo');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('R4 (c bis): reenviar só entrega já entregue; não-entregue = 400', async () => {
  const entrega = buildEntrega({ status: 'em_rota', avisoReenviado: false });
  const { prisma } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Dona Maria', avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await assert.rejects(() => service.reenviarAviso(1, 'entrega-1'), /concluída/i);
  assert.equal(calls.length, 0, 'entrega não concluída → não dispara nada');
});

// ── R4 (d) — falha de efeito emite MasterEvent 1× ────────────────────────────
test('R4 (d): whatsapp falha → emite 1 MasterEvent logistica.efeito_falhou', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, masterEvents } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  // Conversations que EXPLODE → o disparo do WhatsApp falha (catch → status 'falhou').
  const conversations = {
    queueOutboundForCompany: async () => {
      throw new Error('motor offline');
    },
  } as any;
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(res?.whatsappSent, false, 'whatsapp falhou');
  assert.equal(masterEvents.length, 1, 'exatamente 1 MasterEvent de falha');
  assert.equal(masterEvents[0].type, 'logistica.efeito_falhou');
  assert.equal(masterEvents[0].severity, 'attention');
  assert.equal(masterEvents[0].companyId, 1);
  assert.equal(masterEvents[0].dedupKey, 'logistica.efeito_falhou:entrega-1');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});
