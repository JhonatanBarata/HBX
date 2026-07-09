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
// F1: entregaItem.findMany (recálculo do valor pelo stepper) — itens injetáveis.
// F2: product/clienteProduto (preço do SERVIDOR) + entregaItem.create/count (produto
// novo na chegada) — `opts.products`/`opts.clienteProdutos` são o "catálogo" injetável.
function buildPrismaMock(
  entrega: any,
  conta: any,
  entregaItens: any[] = [],
  opts: { products?: any[]; clienteProdutos?: any[]; contatos?: any[] } = {},
) {
  // BUGFIX (09/07) — BUG 1b: `contatos` é a "tabela" injetável usada pelo fallback
  // defense-in-depth do dispararWhatsappEntregue (resolvePrincipalContato) quando a
  // Entrega chega sem contatoId. Default [] preserva o comportamento anterior dos
  // testes já existentes (contato.findFirst devolve null → cai no phone da conta).
  const contatos = opts.contatos ?? [];
  const chargesCreated: any[] = [];
  const entregaUpdates: any[] = [];
  const masterEvents: any[] = [];
  // B1 — updates do CustomerProfile fora da tx (realimentação de coordenada).
  const customerProfileUpdates: any[] = [];
  // F2 — EntregaItem.create observável (id do produto novo + preço RESOLVIDO pelo mock).
  const entregaItemCreates: any[] = [];
  const products = opts.products ?? [];
  const clienteProdutos = opts.clienteProdutos ?? [];
  const prisma: any = {
    entrega: {
      findFirst: async () => entrega,
      update: async (args: any) => {
        entregaUpdates.push(args.data);
        if (args.data?.cobrancaStatus) entrega.cobrancaStatus = args.data.cobrancaStatus;
        if (args.data?.status) entrega.status = args.data.status;
        if (args.data?.whatsappStatus !== undefined) entrega.whatsappStatus = args.data.whatsappStatus;
        if (args.data?.cobrancaOutcome !== undefined) entrega.cobrancaOutcome = args.data.cobrancaOutcome;
        if (args.data?.avisoReenviado !== undefined) entrega.avisoReenviado = args.data.avisoReenviado;
        // M8 — a idempotencyKey (unique) reflete no "banco": grava e simula a corrida
        // de unique (P2002) se OUTRA key já ocupa a coluna nesta entrega.
        if (args.data?.idempotencyKey !== undefined && args.data.idempotencyKey !== null) {
          if (entrega.idempotencyKey && entrega.idempotencyKey !== args.data.idempotencyKey) {
            const err: any = new Error('Unique constraint failed');
            err.code = 'P2002';
            throw err;
          }
          entrega.idempotencyKey = args.data.idempotencyKey;
        }
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
    // F1 — updateMany reflete a qtd nos itens injetados; findMany alimenta o
    // recálculo do valor (Σ qtdEntregue×valorUnit) do confirmar.
    entregaItem: {
      updateMany: async (args: any) => {
        const alvo = entregaItens.find((it) => it.id === args?.where?.id);
        if (alvo && args?.data?.qtdEntregue !== undefined) alvo.qtdEntregue = args.data.qtdEntregue;
        return { count: alvo ? 1 : 0 };
      },
      findMany: async () => entregaItens,
      // F2 — cria o item novo (o serviço já resolveu o preço ANTES de chamar create;
      // o mock só grava). Reflete em `entregaItens` — a MESMA "tabela" que findMany/
      // count leem — pra o recompute de valor enxergar o item recém-criado, como no
      // Prisma real dentro de uma transação interativa (read-your-writes).
      create: async (args: any) => {
        const row = { id: `item-novo-${entregaItemCreates.length + 1}`, ...args.data };
        entregaItemCreates.push(row);
        entregaItens.push(row);
        return row;
      },
      count: async () => entregaItens.length,
    },
    // F2 — catálogo (Product) company-scoped: a regra de ouro do preço.
    product: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        return products.find((p) => p.id === where.id && p.companyId === where.companyId) ?? null;
      },
    },
    // F2 — ClienteProduto.precoAcordado (quando existe) VENCE o catálogo.
    clienteProduto: {
      findFirst: async (args: any) => {
        const where = args?.where || {};
        return (
          clienteProdutos.find(
            (cp) =>
              cp.companyId === where.companyId &&
              cp.customerProfileId === where.customerProfileId &&
              cp.productId === where.productId,
          ) ?? null
        );
      },
    },
    customerProfile: {
      findFirst: async () => conta,
      // B1 — realimentação de coordenada (fora da tx). Reflete lat/lng/geoFonte
      // no MESMO objeto `conta` (pra um 2º confirmar ver o geoFonte atualizado).
      update: async (args: any) => {
        customerProfileUpdates.push(args.data);
        if (args.data?.lat !== undefined) conta.lat = args.data.lat;
        if (args.data?.lng !== undefined) conta.lng = args.data.lng;
        if (args.data?.geoFonte !== undefined) conta.geoFonte = args.data.geoFonte;
        return { id: conta.id, ...args.data };
      },
    },
    contato: {
      // Reflete tanto o lookup DIRETO por id (`entrega.contatoId` já resolvido)
      // quanto a resolução do PRINCIPAL/mais-recente (fallback BUG 1b) — o mesmo
      // shape de argumentos que resolvePrincipalContato/dispararWhatsappEntregue usam.
      findFirst: async (args: any) => {
        const w = args?.where || {};
        if (w.id) return contatos.find((c) => c.id === w.id && c.companyId === w.companyId) ?? null;
        const candidatos = contatos.filter(
          (c) =>
            c.companyId === w.companyId &&
            c.customerProfileId === w.customerProfileId &&
            (w.isPrincipal === undefined || c.isPrincipal === w.isPrincipal),
        );
        if (candidatos.length === 0) return null;
        if (args?.orderBy?.updatedAt === 'desc') {
          return [...candidatos].sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))[0];
        }
        return candidatos[0];
      },
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
  return { chargesCreated, entregaUpdates, masterEvents, customerProfileUpdates, entregaItemCreates, prisma };
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

// ── BUGFIX (09/07, incidente Josefino) — BUG 2: E.164 BR antes de enfileirar ──
// O caso real em prod: CustomerProfile.phone gravado como dígitos crus SEM o país
// ("19996015804") saía pro Webwhats como "+19996015804" (sem 55) → Bad Request.
test('confirmarEntrega: telefone da conta SEM 55 (dígitos crus) → normaliza para +55 antes de enfileirar', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega({ contatoId: null }),
    // Igual ao caso Josefino: phone/phoneNormalized SEM o 55 (11 dígitos crus).
    { id: 'conta-1', name: 'Dona Maria', phone: '19996015804', phoneNormalized: '19996015804', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.to, '+5519996015804', 'ganha o 55 (era +19996015804, recusado pelo Webwhats)');
  assert.equal(calls[0].payload.contactId, '+5519996015804');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('confirmarEntrega: telefone JÁ com 55 não duplica o DDI', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega({ contatoId: null }),
    { id: 'conta-1', name: 'Dona Maria', phone: '5519997024884', phoneNormalized: '5519997024884', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.to, '+5519997024884');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── BUGFIX (09/07) — BUG 1b: defense-in-depth quando a Entrega chega sem contatoId ─
// Entrega LEGADA (contatoId=null, dado de antes do fix do BUG 1) — em vez de cair
// direto no telefone (possivelmente desatualizado) da CONTA, primeiro tenta o
// Contato PRINCIPAL da conta. É o caso Josefino: CustomerProfile.phone tinha o
// número VELHO; o Contato principal tinha o número CERTO editado pelo dono.
test('confirmarEntrega: entrega sem contatoId → usa o Contato PRINCIPAL, não o telefone (talvez velho) da conta', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega({ contatoId: null }),
    {
      id: 'conta-1',
      name: 'Josefino',
      phone: '19996015804', // número VELHO da conta (o bug mandava pra cá)
      phoneNormalized: '19996015804',
      formaPagamento: 'avulso',
      contabilizar: true,
      avisarEntrega: true,
    },
    [],
    {
      contatos: [
        {
          id: 'contato-principal',
          companyId: 1,
          customerProfileId: 'conta-1',
          isPrincipal: true,
          nome: 'Josefino (WhatsApp certo)',
          whatsapp: '19997024884', // número CERTO editado pelo dono
          phone: null,
          updatedAt: new Date('2026-07-01'),
        },
      ],
    },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.to, '+5519997024884', 'usa o WhatsApp do contato principal (certo), normalizado');
});

test('confirmarEntrega: sem contatoId E sem NENHUM contato cadastrado → cai no telefone da conta (último recurso)', async () => {
  const { prisma } = buildPrismaMock(
    buildEntrega({ contatoId: null }),
    { id: 'conta-1', name: 'Dona Maria', phone: '19996015804', phoneNormalized: '19996015804', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
    [],
    { contatos: [] },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  process.env.HBX_LOGISTICA_ENABLED = '1';
  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });
  delete process.env.HBX_LOGISTICA_ENABLED;

  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.to, '+5519996015804', 'sem contato nenhum, cai no telefone da conta (normalizado)');
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

// ── B1 — realimentação de coordenada (GPS de ouro da porta real) ─────────────
test('B1 confirmar com GPS preciso: cliente geocode → atualiza lat/lng + geoFonte=gps_entrega', async () => {
  const conta = {
    id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999',
    formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true, geoFonte: 'geocode', lat: -4.0, lng: -38.0,
  };
  const { prisma, customerProfileUpdates } = buildPrismaMock(buildEntrega(), conta);
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, accuracy: 25 });

  assert.equal(customerProfileUpdates.length, 1, 'GPS preciso (accuracy<=60) em cliente geocode deve realimentar');
  assert.equal(customerProfileUpdates[0].lat, -4.9);
  assert.equal(customerProfileUpdates[0].lng, -38.3);
  assert.equal(customerProfileUpdates[0].geoFonte, 'gps_entrega');
});

test('B1 confirmar com GPS preciso: cliente gps_cadastro NUNCA é sobrescrito', async () => {
  const conta = {
    id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999',
    formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true, geoFonte: 'gps_cadastro', lat: -4.1, lng: -38.1,
  };
  const { prisma, customerProfileUpdates } = buildPrismaMock(buildEntrega(), conta);
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, accuracy: 10 });

  assert.equal(customerProfileUpdates.length, 0, 'geoFonte=gps_cadastro é decisão humana intocável — nunca sobrescreve');
  assert.equal(conta.lat, -4.1, 'coordenada do cadastro preservada');
  assert.equal(conta.lng, -38.1);
});

test('B1 confirmar sem accuracy (ou accuracy > 60m) → NÃO realimenta a coordenada', async () => {
  const conta = {
    id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999',
    formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true, geoFonte: 'geocode',
  };
  const { prisma, customerProfileUpdates } = buildPrismaMock(buildEntrega(), conta);
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 }); // sem accuracy
  assert.equal(customerProfileUpdates.length, 0, 'sem accuracy = GPS não confiável o bastante');

  const conta2 = { ...conta, id: 'conta-1' };
  const { prisma: prisma2, customerProfileUpdates: updates2 } = buildPrismaMock(buildEntrega(), conta2);
  const service2 = new LogisticaService(prisma2, conversations, rota, config);
  await service2.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, accuracy: 120 }); // impreciso
  assert.equal(updates2.length, 0, 'accuracy > 60m não realimenta (impreciso demais)');
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

// ══════════════════════════════════════════════════════════════════════════════
// LOGÍSTICA-MOBILE M6 — financeiro na tela: PAGO NA HORA + resumo do dia + editor.
//   (a) aberto + receiptMethod pix → charge nasce QUITADO (approved/paid/paidAt).
//   (b) pendura → pending com dueDate (fiado; NUNCA pago na hora, mesmo com pix).
//   (c) resumo-dia soma entregues/recebidoHoje/aReceber (só charges da logística).
//   (d) confirmar 2× com pix → 1 charge só (idempotente por entregaId, não paga 2×).
//   NADA dispara MP: paymentMethod='MANUAL' sempre; a baixa é MANUAL/local.
// ══════════════════════════════════════════════════════════════════════════════

// ── M6 (a) — aberto + pix → charge PAGO NA HORA (approved/paid/paidAt) ────────
test('M6 (a): aberto + receiptMethod pix → charge nasce QUITADO (approved/paid), MANUAL', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix' });

  assert.equal(chargesCreated.length, 1, 'deve lançar 1 charge');
  assert.equal(chargesCreated[0].paymentMethod, 'MANUAL', 'MANUAL — nada dispara MP');
  assert.equal(chargesCreated[0].status, 'approved', 'pago na hora → status approved');
  assert.equal(chargesCreated[0].lifecycle, 'paid', 'pago na hora → lifecycle paid');
  assert.ok(chargesCreated[0].paidAt instanceof Date, 'pago na hora → paidAt setado');
  assert.equal(res?.cobrancaLancada, true);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── M6 (b) — pendura → pending com dueDate (fiado; pix NÃO quita) ─────────────
test('M6 (b): pendura → charge pending com dueDate (fiado, NÃO paga na hora nem com pix)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Seu Zé', formaPagamento: 'pendura', contabilizar: true, diaFechamento: 10, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  // Mesmo mandando pix, pendura é fiado por definição → NÃO quita.
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix' });

  assert.equal(chargesCreated.length, 1, 'pendura lança 1 charge (fiado)');
  assert.equal(chargesCreated[0].status, 'pending', 'pendura → pending (fiado)');
  assert.equal(chargesCreated[0].lifecycle, 'in_progress', 'pendura → in_progress');
  assert.equal(chargesCreated[0].paidAt, null, 'pendura → sem paidAt');
  assert.ok(chargesCreated[0].dueDate instanceof Date, 'pendura tem dueDate (regra do cliente)');
  assert.equal(res?.cobrancaLancada, true);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── M6 (c) — resumo do dia soma certo (só charges da logística) ──────────────
test('M6 (c): resumo-dia soma entregues, recebidoHoje (paid) e aReceber (pending)', async () => {
  // Mock focado no resumoDia: entrega.count + 2 findMany de charge (paidAt / pending).
  const prisma = {
    entrega: {
      count: async (args: any) => {
        // só conta 'entregue' com deliveredAt no range (o serviço já monta o where).
        assert.equal(args?.where?.status, 'entregue');
        assert.ok(args?.where?.deliveredAt?.gte instanceof Date);
        return 3;
      },
    },
    financeiroCharge: {
      findMany: async (args: any) => {
        const w = args?.where || {};
        // Recebido: filtra por paidAt (charges quitados no dia).
        if (w.paidAt) {
          assert.ok(Array.isArray(w.sourceModule?.in), 'filtra por sourceModule logistica_*');
          return [{ amount: 20 }, { amount: 15.5 }];
        }
        // A receber: status pending + dueDate no dia.
        if (w.status === 'pending' && w.dueDate) {
          return [{ amount: 40 }, { amount: 10 }];
        }
        return [];
      },
    },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.resumoDia(1, '2026-07-05');

  assert.equal(res.entregues, 3, 'entregues = count de entregas concluídas no dia');
  assert.equal(res.recebidoHoje, 35.5, 'recebidoHoje = soma dos charges pagos (20 + 15.5)');
  assert.equal(res.aReceber, 50, 'aReceber = soma dos charges pending do dia (40 + 10)');
  // date é o dia resolvido (mesma rotina do listRota, arredondado ao fuso local).
  assert.match(res.date, /^\d{4}-\d{2}-\d{2}$/, 'date é ISO YYYY-MM-DD');
});

// ── M6 (d) — confirmar 2× com pix → 1 charge só (não paga 2×) ────────────────
test('M6 (d): confirmar 2× com pix NÃO paga 2× (idempotente por entregaId)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const entrega = buildEntrega();
  const { prisma, chargesCreated } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix' });
  assert.equal(chargesCreated.length, 1, '1ª confirmação = 1 charge pago');
  assert.equal(chargesCreated[0].status, 'approved');

  // Força a corrida: status reaberto + cobrancaStatus revertido. A guarda dura por
  // entregaId (findFirst) impede o 2º charge → NÃO paga 2×.
  entrega.status = 'em_rota';
  entrega.cobrancaStatus = 'pendente';
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix' });

  assert.equal(chargesCreated.length, 1, 'confirmar 2× = 1 charge só (não paga 2×)');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── M6 (e) — editor da forma de pagamento grava os 2 eixos (company-scoped) ───
test('M6 (e): updateFinanceiroCliente grava forma/metodo/contabilizar/diaFechamento', async () => {
  let updateArgs: any = null;
  const prisma = {
    customerProfile: {
      findFirst: async () => ({ id: 'conta-1' }),
      update: async (args: any) => {
        updateArgs = args;
        return {
          id: 'conta-1',
          formaPagamento: args.data.formaPagamento ?? 'aberto',
          metodoPadrao: args.data.metodoPadrao ?? null,
          contabilizar: args.data.contabilizar ?? true,
          diaFechamento: args.data.diaFechamento ?? null,
        };
      },
    },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.updateFinanceiroCliente(1, 'conta-1', {
    formaPagamento: 'mensal',
    contabilizar: false,
    diaFechamento: 10,
  });

  assert.ok(res, 'retorna o DTO do cliente');
  assert.equal(res?.formaPagamento, 'mensal');
  assert.equal(res?.contabilizar, false);
  assert.equal(res?.diaFechamento, 10);
  // mensal → modeloCobranca legado coerente = 'mensal'.
  assert.equal(updateArgs?.data?.modeloCobranca, 'mensal', 'reconcilia o modeloCobranca do N6');
});

test('M6 (e bis): forma inválida → 400; cliente de outra empresa → null', async () => {
  const prisma = {
    customerProfile: { findFirst: async () => ({ id: 'conta-1' }), update: async () => ({}) },
  } as any;
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  await assert.rejects(() => service.updateFinanceiroCliente(1, 'conta-1', { formaPagamento: 'xxx' }), /inválida/i);

  const prismaVazio = { customerProfile: { findFirst: async () => null } } as any;
  const service2 = new LogisticaService(prismaVazio, {} as any, {} as any, {} as any);
  const res = await service2.updateFinanceiroCliente(1, 'conta-de-outra-empresa', { contabilizar: true });
  assert.equal(res, null, 'cliente fora da empresa → null');
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGÍSTICA-MOBILE M8 — offline-first: idempotência DURA por idempotencyKey.
//   Reenviar a MESMA confirmação (mesma key, típico da fila offline drenando após
//   reconectar) NÃO dispara efeito 2× — WhatsApp 1×, charge 1×, resultado igual.
// ══════════════════════════════════════════════════════════════════════════════

// ── M8 (a) — confirmar 2× com a MESMA key → efeito 1× (WhatsApp + charge) ─────
test('M8 (a): confirmar 2× com a MESMA idempotencyKey → WhatsApp 1x + charge 1x (replay)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const entrega = buildEntrega();
  const { prisma, chargesCreated } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const KEY = 'idem-key-abc-123';

  // 1ª confirmação (rede voltou, fila drena) — grava a key + dispara os efeitos 1x.
  const r1 = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix', idempotencyKey: KEY });
  assert.equal(r1?.status, 'entregue');
  assert.equal(r1?.whatsappSent, true);
  assert.equal(r1?.cobrancaLancada, true);
  assert.equal(calls.length, 1, '1ª confirmação: WhatsApp 1x');
  assert.equal(chargesCreated.length, 1, '1ª confirmação: 1 charge');

  // 2ª confirmação com a MESMA key (a fila reenviou o mesmo item) — REPLAY: zero efeito
  // novo. Mesmo forçando a "corrida" (reabre status/cobrança), a key barra a re-execução.
  entrega.status = 'em_rota';
  entrega.cobrancaStatus = 'pendente';
  const r2 = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix', idempotencyKey: KEY });

  assert.equal(r2?.replayed, true, '2ª confirmação com a mesma key = replay');
  assert.equal(calls.length, 1, 'replay: WhatsApp NÃO é chamado de novo (efeito 1x)');
  assert.equal(chargesCreated.length, 1, 'replay: nenhum charge novo (não paga 2x)');
  // Resultado idêntico ao original (desfecho da 1ª confirmação, sem re-executar).
  assert.equal(r2?.status, 'entregue');
  assert.equal(r2?.whatsappSent, true, 'replay devolve o desfecho original do WhatsApp');
  assert.equal(r2?.cobrancaLancada, true, 'replay devolve o desfecho original da cobrança');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── M8 (b) — keys DIFERENTES na mesma entrega não colidem no replay ───────────
// (confirmações distintas com keys distintas seguem a idempotência por status/entregaId
//  já existente — a 1ª grava a key, a 2ª com key nova cai no jaEntregue e não duplica).
test('M8 (b): sem key → comportamento clássico (idempotência por status), não quebra', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const entrega = buildEntrega();
  const { prisma, chargesCreated } = buildPrismaMock(
    entrega,
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  // Sem idempotencyKey: a 1ª confirma normalmente; a 2ª é barrada pelo jaEntregue.
  const r1 = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix' });
  assert.equal(r1?.replayed, undefined, 'sem key não marca replay');
  assert.equal(calls.length, 1);
  assert.equal(chargesCreated.length, 1);

  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix' });
  assert.equal(calls.length, 1, 'sem key, 2ª confirmação já-entregue não redispara WhatsApp');
  assert.equal(chargesCreated.length, 1, 'sem key, 2ª confirmação não duplica charge');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── F1 (07/07) — o VALOR da cobrança acompanha o stepper ──────────────────────
test('F1: stepper mudou a qtd → charge nasce do valor RECALCULADO (Σ qtd×valorUnit)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  // Prevista: 2× R$10 = R$20 (valor da entrega). Entregou 3 → cobrança = R$30.
  const itens = [{ id: 'item-1', qtdPrevista: 2, qtdEntregue: null, valorUnit: 10 }];
  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega({ valor: 20 }),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
    itens,
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -4.9,
    lng: -38.3,
    itens: [{ id: 'item-1', qtdEntregue: 3 }],
  });

  assert.equal(res?.status, 'entregue');
  assert.equal(chargesCreated.length, 1, '1 charge criado');
  assert.equal(chargesCreated[0].amount, 30, 'o charge usa o valor ENTREGUE (3×10), não o previsto (20)');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── F1 — sem itens no payload (entrega legada) → valor previsto intocado ──────
test('F1: payload SEM itens → não recalcula (valor escalar de sempre)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega({ valor: 20 }),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  assert.equal(chargesCreated.length, 1);
  assert.equal(chargesCreated[0].amount, 20, 'sem stepper, o valor previsto vale');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ══════════════════════════════════════════════════════════════════════════════
// F2 (08/07) — adicionar/trocar produto NA folha de chegada.
//   REGRA DE OURO: o preço vem SEMPRE do servidor — catálogo (Product company-
//   scoped) ou ClienteProduto.precoAcordado quando existir (vence o catálogo). O
//   payload do cliente só carrega productId+qtd (o DTO nem aceita campo de preço).
//   Idempotência preservada: o item novo nasce DENTRO da tx guardada da 1ª
//   confirmação — reenvio pela MESMA idempotencyKey (replay) NUNCA duplica.
// ══════════════════════════════════════════════════════════════════════════════

test('F2: novoItem cria EntregaItem com o preço do CATÁLOGO (servidor) e o charge soma existente+novo', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  // Existente: 2×R$10 = R$20 (igual ao valor previsto da entrega). Novo produto do
  // catálogo: R$15 (priceCents=1500) — o cliente NUNCA manda esse preço, só productId+qtd.
  const itens = [{ id: 'item-1', qtdPrevista: 2, qtdEntregue: null, valorUnit: 10 }];
  const { prisma, chargesCreated, entregaItemCreates } = buildPrismaMock(
    buildEntrega({ valor: 20 }),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
    itens,
    { products: [{ id: 501, companyId: 1, price: 12, priceCents: 1500 }] },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -4.9,
    lng: -38.3,
    itens: [{ id: 'item-1', qtdEntregue: 2 }],
    novosItens: [{ productId: 501, qtdEntregue: 1 }],
  });

  assert.equal(res?.status, 'entregue');
  assert.equal(entregaItemCreates.length, 1, 'cria exatamente 1 EntregaItem novo');
  assert.equal(entregaItemCreates[0].productId, 501);
  assert.equal(entregaItemCreates[0].qtdEntregue, 1);
  assert.equal(entregaItemCreates[0].valorUnit, 15, 'preço vem do CATÁLOGO (priceCents/100), nunca do cliente');
  assert.equal(chargesCreated.length, 1, '1 charge criado');
  assert.equal(chargesCreated[0].amount, 35, 'charge soma existente(2×10=20) + novo(1×15=15) = 35');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('F2: add avulso usa o preço de CATÁLOGO (não o precoAcordado); entrega legada (sem item antes) SOMA ao valor escalar', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  // Entrega "avulsa" legada: valor escalar R$20, NENHUM EntregaItem ainda (agendada
  // fora da recorrência M2). Ganha 1 produto novo agora: catálogo R$15. O cliente até
  // tem um precoAcordado R$9 pra esse produto, mas ele vale p/ o item PLANEJADO/
  // recorrente — um add AVULSO na chegada usa o CATÁLOGO, o MESMO preço que o front
  // mostra no QR Pix do ato (cobrança registrada == o que o cliente paga no QR).
  const { prisma, chargesCreated, entregaItemCreates } = buildPrismaMock(
    buildEntrega({ valor: 20 }),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
    [],
    {
      products: [{ id: 501, companyId: 1, price: 15, priceCents: 1500 }],
      clienteProdutos: [{ companyId: 1, customerProfileId: 'conta-1', productId: 501, precoAcordado: 9 }],
    },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -4.9,
    lng: -38.3,
    novosItens: [{ productId: 501, qtdEntregue: 2 }],
  });

  assert.equal(res?.status, 'entregue');
  assert.equal(entregaItemCreates.length, 1);
  assert.equal(entregaItemCreates[0].valorUnit, 15, 'add avulso usa o CATÁLOGO (15), ignora o precoAcordado (9)');
  assert.equal(chargesCreated.length, 1);
  // Legada (0 EntregaItem antes desta chamada) → SOMA ao valor escalar que já existia:
  // 20 (legado) + 2×15 (novo) = 50 — NÃO substitui pelo valor do item isolado (30).
  assert.equal(chargesCreated[0].amount, 50, 'entrega sem item prévio: valor SOMA ao legado, não substitui');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('F2: novoItem de produto de OUTRA empresa é ignorado (company-scoped) — não cria, não quebra', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated, entregaItemCreates } = buildPrismaMock(
    buildEntrega({ valor: 20 }),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
    [],
    { products: [{ id: 999, companyId: 2, price: 50, priceCents: null }] }, // empresa 2, confirmar roda na empresa 1
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -4.9,
    lng: -38.3,
    novosItens: [{ productId: 999, qtdEntregue: 1 }],
  });

  assert.equal(res?.status, 'entregue');
  assert.equal(entregaItemCreates.length, 0, 'produto de outro tenant não vira EntregaItem');
  assert.equal(chargesCreated.length, 1);
  assert.equal(chargesCreated[0].amount, 20, 'nada novo entrou: valor legado intocado');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── F2 idempotência — a MESMA prova do M8, agora para o item novo ─────────────
test('F2 idempotência: reenvio com a MESMA idempotencyKey NÃO duplica o item novo (replay)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const itens = [{ id: 'item-1', qtdPrevista: 2, qtdEntregue: null, valorUnit: 10 }];
  const entrega = buildEntrega({ valor: 20 });
  const { prisma, chargesCreated, entregaItemCreates } = buildPrismaMock(
    entrega,
    {
      id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999',
      formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true,
    },
    itens,
    { products: [{ id: 501, companyId: 1, price: 15, priceCents: null }] },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const KEY = 'idem-f2-key-1';
  const payload = {
    lat: -4.9,
    lng: -38.3,
    itens: [{ id: 'item-1', qtdEntregue: 2 }],
    novosItens: [{ productId: 501, qtdEntregue: 1 }],
    idempotencyKey: KEY,
  };

  const r1 = await service.confirmarEntrega(1, 'entrega-1', payload);
  assert.equal(r1?.status, 'entregue');
  assert.equal(entregaItemCreates.length, 1, '1ª confirmação: cria o item novo 1x');
  assert.equal(chargesCreated.length, 1);
  assert.equal(chargesCreated[0].amount, 35, '2×10 (existente) + 1×15 (novo)');

  // Reenvio da fila offline: MESMA key (típico do drain do M8, forçando a "corrida"
  // reabrindo status/cobrança). O replay é decidido pela key ANTES da tx — o item
  // novo NUNCA nasce 2x, nem o charge duplica.
  entrega.status = 'em_rota';
  entrega.cobrancaStatus = 'pendente';
  const r2 = await service.confirmarEntrega(1, 'entrega-1', payload);

  assert.equal(r2?.replayed, true, '2ª confirmação com a mesma key = replay');
  assert.equal(calls.length, 1, 'replay: WhatsApp não dispara de novo');
  assert.equal(entregaItemCreates.length, 1, 'replay: o item novo NÃO duplica');
  assert.equal(chargesCreated.length, 1, 'replay: nenhum charge novo');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});
