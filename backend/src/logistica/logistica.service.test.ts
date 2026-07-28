import test from 'node:test';
import assert from 'node:assert/strict';

import { LogisticaService, resolveDayRange } from './logistica.service';

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

// PR18072026 W1 (coordenador) — `metodoPadrao` SAIU deste set: agora é exposto
// intencionalmente ao ator sem billing quando moduloFinanceiroAtivoConfig (o
// botão [Pago] da folha de chegada precisa dele como receiptMethod). O gate
// correto virou a checagem POSITIVA em cada teste (ver 'listRota: vendedor...'
// abaixo), não mais ausência total. `debitoAtual`/`valorHoje` são as OUTRAS
// duas exposições aditivas do mesmo pacote — nunca estiveram neste set.
const COMMERCIAL_ROUTE_KEYS = new Set([
  'valor',
  'valorUnit',
  'cobrancaStatus',
  'formaPagamento',
  'saldoAberto',
  'limiteFiado',
  'moduloFinanceiroAtivo',
  'pix',
  'pixChave',
  'pixNome',
  'pixCidade',
  'routeMode',
]);

function assertNoCommercialRouteKeys(value: unknown, path = 'response'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCommercialRouteKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    assert.equal(COMMERCIAL_ROUTE_KEYS.has(key), false, `chave comercial ${path}.${key} deve estar ausente`);
    assertNoCommercialRouteKeys(nested, `${path}.${key}`);
  }
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
  opts: { products?: any[]; clienteProdutos?: any[]; contatos?: any[]; locais?: any[]; charges?: any[] } = {},
) {
  // BUGFIX (09/07) — BUG 1b: `contatos` é a "tabela" injetável usada pelo fallback
  // defense-in-depth do dispararWhatsappEntregue (resolvePrincipalContato) quando a
  // Entrega chega sem contatoId. Default [] preserva o comportamento anterior dos
  // testes já existentes (contato.findFirst devolve null → cai no phone da conta).
  const contatos = opts.contatos ?? [];
  const locais = opts.locais ?? [];
  const localEntregaUpdates: any[] = [];
  // 28/07 — `opts.charges` semeia cobranças JÁ existentes (cenário da entrega
  // reaberta: o charge nasceu no 1º confirmar e o 2º só corrige o valor).
  const chargesCreated: any[] = [...(opts.charges ?? [])];
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
      // AVISO-CHEGANDO — claim idempotente (avisoChegandoAt null→now), também
      // guardado por status (só agendada/em_rota "ganha" o claim).
      updateMany: async (args: any) => {
        const data = args?.data || {};
        const where = args?.where || {};
        const wantsReenvio = data.avisoReenviado === true;
        const guardFalse = where.avisoReenviado === false;
        if (wantsReenvio && guardFalse) {
          if (entrega.avisoReenviado === true) return { count: 0 }; // já reenviado
          entrega.avisoReenviado = true;
          return { count: 1 };
        }
        if (data.avisoChegandoAt !== undefined && where.avisoChegandoAt === null) {
          const statusPermitido: string[] = where.status?.in ?? [];
          const statusOk = statusPermitido.length === 0 || statusPermitido.includes(entrega.status);
          if (entrega.avisoChegandoAt != null || !statusOk) return { count: 0 }; // já avisado/entrega fechada
          entrega.avisoChegandoAt = data.avisoChegandoAt;
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
        // 22/07 — preço de HOJE editado na chegada. O mock espelha o Prisma real:
        // o recompute do valor (findMany logo abaixo) precisa enxergar o preço novo.
        if (alvo && args?.data?.valorUnit !== undefined) alvo.valorUnit = args.data.valorUnit;
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
    // FIX 25/07 — LocalEntrega: é ELE que o mapa/rota/card leem (`local ?? perfil`),
    // então a realimentação do GPS de ouro tem que chegar aqui. `opts.locais` default []
    // preserva os testes antigos (sem local → só o perfil converge, como antes).
    localEntrega: {
      findFirst: async (args: any) => {
        const w = args?.where || {};
        return (
          locais.find(
            (l) =>
              (w.id === undefined || l.id === w.id) &&
              l.companyId === w.companyId &&
              (w.customerProfileId === undefined || l.customerProfileId === w.customerProfileId) &&
              (w.ativo === undefined || l.ativo === w.ativo) &&
              (w.isPrincipal === undefined || l.isPrincipal === w.isPrincipal),
          ) ?? null
        );
      },
      update: async (args: any) => {
        localEntregaUpdates.push({ id: args?.where?.id, ...args.data });
        const alvo = locais.find((l) => l.id === args?.where?.id);
        if (alvo) Object.assign(alvo, args.data);
        return { id: args?.where?.id, ...args.data };
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
      // 28/07 — ajuste do valor da cobrança de uma entrega REABERTA
      // (sincronizarCobrancaReaberta). Espelha os filtros que importam do WHERE
      // real: entregaId + status + paidAt null + amount diferente do novo.
      updateMany: async (args: any) => {
        const w = args?.where || {};
        const alvos = chargesCreated.filter((c) => {
          if (c.entregaId !== w.entregaId) return false;
          if (w.status !== undefined && c.status !== w.status) return false;
          if (w.paidAt === null && c.paidAt != null) return false;
          if (w.amount?.not !== undefined && c.amount === w.amount.not) return false;
          return true;
        });
        for (const alvo of alvos) Object.assign(alvo, args.data);
        return { count: alvos.length };
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
  return {
    chargesCreated,
    entregaUpdates,
    masterEvents,
    customerProfileUpdates,
    localEntregaUpdates,
    entregaItemCreates,
    prisma,
  };
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
// AVISO-CHEGANDO — resolverAvisoChegando é o MESMO padrão, mas com override
// PRÓPRIO (chegandoHabilitado/chegandoTemplate) e default OFF (feature opt-in;
// os testes do "chegando" passam chegandoHabilitado:true explicitamente).
function buildConfigMock(
  over: {
    habilitado?: boolean;
    template?: string | null;
    chegandoHabilitado?: boolean;
    chegandoTemplate?: string | null;
  } = {},
) {
  const calls: any[] = [];
  const chegandoCalls: any[] = [];
  return {
    calls,
    chegandoCalls,
    config: {
      resolverAviso: async (companyId: number, avisarCliente: boolean | null | undefined) => {
        calls.push({ companyId, avisarCliente });
        return { habilitado: over.habilitado ?? true, template: over.template ?? null };
      },
      // Faithful ao merge REAL (globalOk && clienteOk): permite os testes (c)
      // config-OFF e (d) cliente-opt-out ficarem DISTINTOS de verdade (não só
      // 2 nomes pro mesmo booleano canned).
      resolverAvisoChegando: async (companyId: number, avisarCliente: boolean | null | undefined) => {
        chegandoCalls.push({ companyId, avisarCliente });
        const clienteOk = avisarCliente !== false;
        const globalOk = over.chegandoHabilitado ?? false;
        return { habilitado: globalOk && clienteOk, template: over.chegandoTemplate ?? null };
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

test('confirmarEntrega consulta cobertura Essencial antes da transação', async () => {
  const { prisma, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();
  const calls: any[] = [];
  const routeBilling = {
    assertEssentialDeliveryCovered: async (companyId: number, deliveryId: string) => {
      calls.push({ companyId, deliveryId });
      throw new Error('rota sem cobertura');
    },
  } as any;
  const service = new LogisticaService(
    prisma, conversations, rota, config,
    undefined, undefined, undefined, undefined, routeBilling,
  );
  await assert.rejects(
    service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 }),
    /rota sem cobertura/,
  );
  assert.deepEqual(calls, [{ companyId: 1, deliveryId: 'entrega-1' }]);
  assert.equal(entregaUpdates.length, 0, 'gate bloqueia antes do status/GPS');
});

// ── L4-A (18/07) — createEntrega (POST /logistica/entregas) sempre marca a
// Entrega como 'avulsa' (nunca recorrência: essa vem só de gerarDia/materialize).
test('createEntrega: marca origem=avulsa na criação manual', async () => {
  let createdData: any = null;
  const prisma: any = {
    customerProfile: {
      findFirst: async () => ({ id: 'conta-1', precoPadrao: null }),
    },
    contato: {
      findFirst: async () => null,
    },
    entrega: {
      create: async (args: any) => {
        createdData = args.data;
        return { id: args.data.id };
      },
    },
  };
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);

  const res = await service.createEntrega(7, { customerProfileId: 'conta-1' } as any);

  assert.ok(res.id, 'devolve o id da entrega criada');
  assert.ok(createdData, 'entrega.create deve ter sido chamado');
  assert.equal(createdData.origem, 'avulsa');
  assert.equal(createdData.companyId, 7);
  assert.equal(createdData.status, 'agendada');
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

// ── AVISO-CHEGANDO (11/07) — "tô chegando" a ~500m, MESMO caminho blindado ───
// Espelha os testes do WhatsApp-entregue: trava tripla (flag + config + cliente)
// + idempotência RACE-SAFE por claim (avisoChegandoAt). MESMO caminho blindado
// (queueOutboundForCompany) — nunca API crua/socket/loop.

test('avisarChegando: as 3 travas ON → envia via queue (caminho blindado)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config, chegandoCalls } = buildConfigMock({ chegandoHabilitado: true });

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.avisarChegando(1, 'entrega-1');

  assert.equal(res.status, 'enviado');
  assert.equal(calls.length, 1, 'deve chamar queueOutboundForCompany exatamente 1 vez');
  assert.equal(calls[0].companyId, 1);
  assert.equal(calls[0].payload.sourceModule, 'logistica_chegando');
  assert.equal(calls[0].payload.variables.event, 'chegando');
  assert.equal(calls[0].payload.to, '+5588999999999');
  assert.equal(chegandoCalls.length, 1, 'resolverAvisoChegando foi consultado');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('avisarChegando: flag HBX_LOGISTICA_ENABLED OFF → NO-OP silencioso (nem consulta o config)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  delete process.env.HBX_LOGISTICA_ENABLED; // default OFF

  const { prisma } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config, chegandoCalls } = buildConfigMock({ chegandoHabilitado: true }); // mesmo com config ON…

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.avisarChegando(1, 'entrega-1');

  assert.equal(res.status, 'pulado');
  assert.equal(res.motivo, 'flag_off');
  assert.equal(calls.length, 0, 'queueOutboundForCompany NÃO deve ser chamado com a flag OFF');
  // Trava 1 é barata (sem I/O) e checa ANTES de tudo: nem chega a consultar o config.
  assert.equal(chegandoCalls.length, 0, 'resolverAvisoChegando não deve ser consultado com a flag OFF');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('avisarChegando: flag ON mas config.avisoChegandoEnabled OFF → NO-OP', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega(),
    // cliente QUER receber — quem bloqueia aqui é o toggle global do admin.
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock({ chegandoHabilitado: false }); // admin não ligou o "chegando"

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.avisarChegando(1, 'entrega-1');

  assert.equal(res.status, 'pulado');
  assert.equal(res.motivo, 'aviso_off');
  assert.equal(calls.length, 0, 'config OFF → queueOutboundForCompany NÃO deve ser chamado');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('avisarChegando: flag+config ON mas cliente opt-out (avisarEntrega=false) → NO-OP', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega(),
    // admin LIGOU o "chegando" — quem bloqueia aqui é o opt-out do cliente
    // (MESMO campo do aviso "entregue": quem não quer um, não quer o outro).
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', avisarEntrega: false },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock({ chegandoHabilitado: true });

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.avisarChegando(1, 'entrega-1');

  assert.equal(res.status, 'pulado');
  assert.equal(res.motivo, 'aviso_off');
  assert.equal(calls.length, 0, 'cliente opt-out → queueOutboundForCompany NÃO deve ser chamado');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('avisarChegando: idempotente — 2ª chamada NÃO reenfileira (claim race-safe, count 0)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock({ chegandoHabilitado: true });

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res1 = await service.avisarChegando(1, 'entrega-1');
  const res2 = await service.avisarChegando(1, 'entrega-1'); // 2ª chamada (ex.: 2 crossings do anel)

  assert.equal(res1.status, 'enviado');
  assert.equal(res2.status, 'pulado');
  assert.equal(res2.motivo, 'ja_avisado');
  // O CLAIM (updateMany WHERE avisoChegandoAt IS NULL) garante 1 SÓ envio mesmo
  // sob 2 chamadas — a 2ª nunca chega a enfileirar (teste do freio de chip banido).
  assert.equal(calls.length, 1, 'a 2ª chamada NÃO deve reenfileirar — teto de 1 aviso por entrega');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('avisarChegando: entrega já ENTREGUE (fora de agendada/em_rota) → claim perde, NO-OP', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega({ status: 'entregue' }),
    { id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999', avisarEntrega: true },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock({ chegandoHabilitado: true });

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.avisarChegando(1, 'entrega-1');

  assert.equal(res.status, 'pulado');
  assert.equal(res.motivo, 'ja_avisado');
  assert.equal(calls.length, 0, 'entrega fora de agendada/em_rota → claim não passa, sem WhatsApp');

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

// ── FIX 25/07 — o GPS de ouro tem que corrigir QUEM O MAPA LÊ ────────────────
// Incidente empresa 41 ("Terra Hydra Mary"): a realimentação era um OU exclusivo
// (`entrega.localId ? local : perfil`). As 3 entregas confirmadas da conta tinham
// localId=null → só o PERFIL convergia, e o LOCAL (que é quem o mapa/rota/card leem,
// `local ?? perfil`) ficava com o palpite do geocode pra sempre: 2.991 m de erro.
test('FIX 25/07: entrega SEM localId realimenta TAMBÉM o local principal (era o bug do mapa)', async () => {
  const conta = {
    id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999',
    formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true, geoFonte: 'geocode', lat: -4.0, lng: -38.0,
  };
  const local = {
    id: 'local-1', companyId: 1, customerProfileId: 'conta-1', isPrincipal: true, ativo: true,
    geoFonte: 'geocode', lat: -4.0, lng: -38.0,
  };
  const { prisma, customerProfileUpdates, localEntregaUpdates } = buildPrismaMock(
    buildEntrega({ localId: null }), conta, [], { locais: [local] },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, accuracy: 25 });

  assert.equal(localEntregaUpdates.length, 1, 'o LOCAL PRINCIPAL tem que receber a porta real');
  assert.equal(localEntregaUpdates[0].lat, -4.9);
  assert.equal(localEntregaUpdates[0].lng, -38.3);
  assert.equal(localEntregaUpdates[0].geoFonte, 'gps_entrega');
  assert.equal(customerProfileUpdates.length, 1, 'o perfil (endereço da conta) também converge');
  assert.equal(customerProfileUpdates[0].geoFonte, 'gps_entrega');
});

test('FIX 25/07: entrega em local SECUNDÁRIO ("Loja") NÃO reescreve o endereço da conta', async () => {
  const conta = {
    id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999',
    formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true, geoFonte: 'geocode', lat: -4.0, lng: -38.0,
  };
  const locais = [
    { id: 'local-casa', companyId: 1, customerProfileId: 'conta-1', isPrincipal: true, ativo: true, geoFonte: 'geocode', lat: -4.0, lng: -38.0 },
    { id: 'local-loja', companyId: 1, customerProfileId: 'conta-1', isPrincipal: false, ativo: true, geoFonte: 'geocode', lat: -4.5, lng: -38.5 },
  ];
  const { prisma, customerProfileUpdates, localEntregaUpdates } = buildPrismaMock(
    buildEntrega({ localId: 'local-loja' }), conta, [], { locais },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, accuracy: 15 });

  assert.equal(localEntregaUpdates.length, 1, 'só o local da entrega converge');
  assert.equal(localEntregaUpdates[0].id, 'local-loja');
  assert.equal(customerProfileUpdates.length, 0, 'GPS da Loja NUNCA vira o endereço da conta');
  assert.equal(locais[0].lat, -4.0, 'o local principal (Casa) fica intacto');
});

test('FIX 25/07: local com gps_cadastro (decisão humana) segue intocável', async () => {
  const conta = {
    id: 'conta-1', name: 'Dona Maria', phone: '5588999999999', phoneNormalized: '5588999999999',
    formaPagamento: 'avulso', contabilizar: true, avisarEntrega: true, geoFonte: 'geocode', lat: -4.0, lng: -38.0,
  };
  const local = {
    id: 'local-1', companyId: 1, customerProfileId: 'conta-1', isPrincipal: true, ativo: true,
    geoFonte: 'gps_cadastro', lat: -4.2, lng: -38.2,
  };
  const { prisma, localEntregaUpdates } = buildPrismaMock(
    buildEntrega({ localId: 'local-1' }), conta, [], { locais: [local] },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, accuracy: 10 });

  assert.equal(localEntregaUpdates.length, 0, '"Usar este local" é decisão humana — nunca sobrescreve');
  assert.equal(local.lat, -4.2);
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
    // M4: financeiro do tenant ON → extrato mostra os valores.
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
    financeiroCharge: {
      findMany: async () => charges,
    },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.extratoCliente(1, 'conta-1');

  assert.ok(res, 'extrato retorna resultado');
  assert.equal(res?.clienteId, 'conta-1');
  assert.equal(res?.moduloFinanceiroAtivo, true);
  assert.equal(res?.total, 2);
  assert.equal(res?.charges.length, 2);
  assert.equal(res?.charges[0].id, 'c1');
  assert.equal(res?.charges[1].entregaId, 'e9');
});

// ── R2 (e2) — M4: financeiro OFF → FAIL-CLOSED (sem valores, forma mantida) ───
test('R2 extrato: moduloFinanceiroAtivo OFF → charges vazio + saldos null (dinheiro não aparece)', async () => {
  let chargesConsultados = false;
  const prisma = {
    customerProfile: {
      findFirst: async () => ({ id: 'conta-1', name: 'Cliente X' }),
    },
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: false }) },
    financeiroCharge: {
      findMany: async () => {
        chargesConsultados = true;
        return [];
      },
    },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.extratoCliente(1, 'conta-1');

  assert.ok(res, 'extrato retorna resultado (forma mantida)');
  assert.equal(res?.clienteId, 'conta-1', 'identidade do cliente permanece');
  assert.equal(res?.nome, 'Cliente X', 'nome permanece (não é valor)');
  assert.equal(res?.moduloFinanceiroAtivo, false);
  assert.equal(res?.total, 0);
  assert.deepEqual(res?.charges, [], 'nenhuma cobrança com valor vaza');
  assert.equal(res?.saldoAberto, null, 'saldoAberto omitido (null)');
  assert.equal(res?.aguardandoFechamento, null, 'aguardandoFechamento omitido (null)');
  assert.equal(chargesConsultados, false, 'FAIL-CLOSED: nem consulta os charges com OFF');
});

test('R2 extrato: cliente de outra empresa → null (company-scoped)', async () => {
  const prisma = {
    customerProfile: { findFirst: async () => null },
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
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
//   (f) FIX (11/07) — BUG real em prod: na_hora sem receiptMethod do front (front NUNCA
//       manda pro costumeiro) deriva o metodoPadrao da CONTA e quita igual; 'aberto' sem
//       método segue pending (inalterado); front SEMPRE ganha quando manda um método.
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

// ── M6 (f) — BUG REAL 11/07: na_hora sem receiptMethod do front deriva da CONTA ──
// CAUSA: confirmarEntrega só lia gps.receiptMethod (SOMENTE o que o front manda), e o
// front por design NUNCA manda pro cliente costumeiro (formaPagamento≠'aberto' — chips
// somem na folha de chegada, ver CustomerProfile no schema). Resultado em prod: cliente
// na_hora+dinheiro tinha a entrega confirmada com receiptMethod/recebidoNaHora NULL e o
// charge nascia 'pending' — dinheiro recebido em mãos virava "dívida" no financeiro.
// FIX: quando o front não manda nada, deriva de CustomerProfile.metodoPadrao SE
// formaPagamento==='na_hora'. O front continua GANHANDO quando manda (f-c).
test('M6 (f-a): na_hora + metodoPadrao dinheiro, front SEM receiptMethod → deriva da conta (quita + recebidoNaHora)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'na_hora', metodoPadrao: 'dinheiro', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  // Front NÃO manda receiptMethod — é exatamente o que acontece hoje pro costumeiro
  // (chips somem na folha de chegada quando formaPagamento≠'aberto').
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  const statusUpdate = entregaUpdates.find((u) => u.status === 'entregue');
  assert.equal(statusUpdate?.receiptMethod, 'dinheiro', 'receiptMethod efetivo = metodoPadrao da conta (na_hora)');
  assert.equal(statusUpdate?.recebidoNaHora, true, 'recebidoNaHora = true (pago no ato, não fica dívida)');

  assert.equal(chargesCreated.length, 1, 'deve lançar 1 charge');
  assert.equal(chargesCreated[0].status, 'approved', 'na_hora+dinheiro (derivado) → charge nasce QUITADO');
  assert.equal(chargesCreated[0].lifecycle, 'paid');
  assert.ok(chargesCreated[0].paidAt instanceof Date, 'paidAt setado (pago na hora)');
  assert.equal(res?.cobrancaLancada, true);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── M6 (f-b) — 'aberto' sem receiptMethod segue INALTERADO (NULL/pending) ────────
// Sem metodoPadrao pra derivar (schema: metodoPadrao é "só para na_hora"), então
// 'aberto'/'pendura'/'mensal' sem escolha do motorista continuam como sempre foram:
// nada quita sozinho.
test('M6 (f-b): aberto sem receiptMethod do front → segue NULL/pending (comportamento inalterado)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3 });

  const statusUpdate = entregaUpdates.find((u) => u.status === 'entregue');
  assert.equal(statusUpdate?.receiptMethod, undefined, 'sem método (aberto sem metodoPadrao): receiptMethod não setado');
  assert.equal(statusUpdate?.recebidoNaHora, undefined, 'recebidoNaHora não setado');

  assert.equal(chargesCreated.length, 1, 'ainda lança 1 charge (aberto com valor > 0)');
  assert.equal(chargesCreated[0].status, 'pending', 'sem método imediato → pending (comportamento de sempre)');
  assert.equal(chargesCreated[0].lifecycle, 'in_progress');
  assert.equal(chargesCreated[0].paidAt, null);
  assert.equal(res?.cobrancaLancada, true, 'lança a cobrança normalmente, só não quita');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── M6 (f-c) — na_hora·dinheiro, mas o front MANDA 'pix' → o front GANHA ─────────
// A derivação da conta só entra na AUSÊNCIA; o front nunca é sobrescrito.
test('M6 (f-c): na_hora com metodoPadrao dinheiro, front manda pix → pix GANHA (front nunca é sobrescrito)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated, entregaUpdates } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'na_hora', metodoPadrao: 'dinheiro', contabilizar: true, avisarEntrega: true },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -4.9, lng: -38.3, receiptMethod: 'pix' });

  const statusUpdate = entregaUpdates.find((u) => u.status === 'entregue');
  assert.equal(statusUpdate?.receiptMethod, 'pix', 'front manda pix → pix GANHA (não usa o metodoPadrao dinheiro da conta)');
  assert.equal(statusUpdate?.recebidoNaHora, true);

  assert.equal(chargesCreated.length, 1);
  assert.equal(chargesCreated[0].status, 'approved', 'na_hora + pix do front → quitado também');
  assert.equal(res?.cobrancaLancada, true);

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

// ══════════════════════════════════════════════════════════════════════════════
// PR10072026 W2 — Financeiro do cliente (fase 1): baixa manual do fiado (quitar),
// saldos em aberto por cliente e histórico de entregas.
//   quitar: pending→approved/paid/paidAt (o MESMO shape do pago-na-hora do M6);
//   idempotente (2ª chamada devolve o estado, não re-quita); cross-tenant OU
//   sourceModule fora de logistica_* → null (controller vira 404, sem vazar).
//   saldos: moduloFinanceiroAtivo OFF = FAIL-CLOSED (lista vazia, zero consulta
//   de valores). histórico: item sintético p/ entrega legada sem EntregaItem.
// ══════════════════════════════════════════════════════════════════════════════

// Prisma mock focado no quitar: 1 charge em memória; findFirst respeita
// companyId + sourceModule.startsWith; updateMany é o claim atômico (guarda de
// status no WHERE — só transiciona se o status ainda bate).
function buildQuitarPrisma(charge: any) {
  const updates: any[] = [];
  return {
    updates,
    prisma: {
      financeiroCharge: {
        findFirst: async (args: any) => {
          const w = args?.where || {};
          if (w.id !== charge.id || w.companyId !== charge.companyId) return null;
          const prefix = w.sourceModule?.startsWith;
          if (prefix && !String(charge.sourceModule || '').startsWith(prefix)) return null;
          return { ...charge };
        },
        updateMany: async (args: any) => {
          const w = args?.where || {};
          if (w.id === charge.id && w.companyId === charge.companyId && charge.status === w.status) {
            updates.push(args.data);
            charge.status = args.data.status;
            charge.lifecycle = args.data.lifecycle;
            charge.paidAt = args.data.paidAt;
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
    } as any,
  };
}

test('W2 quitar: charge pending da logística → approved/paid/paidAt (baixa manual)', async () => {
  const charge = {
    id: 'ch-1', companyId: 1, status: 'pending', lifecycle: 'in_progress',
    amount: 35, paidAt: null, sourceModule: 'logistica_entrega',
  };
  const { prisma, updates } = buildQuitarPrisma(charge);
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);

  const res = await service.quitarCharge(1, 'ch-1', { userId: 7 });

  assert.ok(res, 'quitar devolve resultado');
  assert.equal(res?.status, 'approved', 'pending → approved (mesmo shape do pago-na-hora M6)');
  assert.ok(res?.paidAt, 'paidAt setado');
  assert.equal(res?.alreadyPaid, false);
  assert.equal(updates.length, 1, 'exatamente 1 update');
  assert.equal(updates[0].lifecycle, 'paid');
  assert.ok(updates[0].paidAt instanceof Date);
  assert.equal(charge.status, 'approved', 'o "banco" reflete a baixa');
});

test('W2 quitar idempotente: 2ª chamada devolve o estado atual SEM re-quitar (paidAt preservado)', async () => {
  const charge = {
    id: 'ch-1', companyId: 1, status: 'pending', lifecycle: 'in_progress',
    amount: 20, paidAt: null, sourceModule: 'logistica_fechamento',
  };
  const { prisma, updates } = buildQuitarPrisma(charge);
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);

  const r1 = await service.quitarCharge(1, 'ch-1');
  const r2 = await service.quitarCharge(1, 'ch-1');

  assert.equal(updates.length, 1, '2ª chamada NÃO gera update novo');
  assert.equal(r2?.status, 'approved');
  assert.equal(r2?.alreadyPaid, true, '2ª chamada sinaliza já-paga');
  assert.equal(r2?.paidAt, r1?.paidAt, 'paidAt original preservado (não re-quita)');
});

test('W2 quitar cross-tenant/origem: outra empresa OU sourceModule fora de logistica_* → null (404)', async () => {
  // Outra empresa: o findFirst company-scoped não acha → null.
  const deOutraEmpresa = {
    id: 'ch-1', companyId: 2, status: 'pending', lifecycle: 'in_progress',
    amount: 10, paidAt: null, sourceModule: 'logistica_entrega',
  };
  const { prisma: p1, updates: u1 } = buildQuitarPrisma(deOutraEmpresa);
  const s1 = new LogisticaService(p1, {} as any, {} as any, {} as any);
  assert.equal(await s1.quitarCharge(1, 'ch-1'), null, 'charge de outra empresa → null (não vaza)');
  assert.equal(u1.length, 0, 'nada é tocado');

  // Origem fora da logística (ex.: assinatura HBX, sourceModule null) → null.
  const assinaturaHbx = {
    id: 'ch-2', companyId: 1, status: 'pending', lifecycle: 'in_progress',
    amount: 199, paidAt: null, sourceModule: null,
  };
  const { prisma: p2, updates: u2 } = buildQuitarPrisma(assinaturaHbx);
  const s2 = new LogisticaService(p2, {} as any, {} as any, {} as any);
  assert.equal(await s2.quitarCharge(1, 'ch-2'), null, 'charge fora de logistica_* → null (assinatura intocável)');
  assert.equal(u2.length, 0, 'a assinatura HBX nunca é quitada por aqui');
});

test('W2 quitar não-quitável: charge cancelled → devolve o estado atual sem mutar', async () => {
  const charge = {
    id: 'ch-3', companyId: 1, status: 'cancelled', lifecycle: 'cancelled',
    amount: 15, paidAt: null, sourceModule: 'logistica_entrega',
  };
  const { prisma, updates } = buildQuitarPrisma(charge);
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);

  const res = await service.quitarCharge(1, 'ch-3');
  assert.equal(res?.status, 'cancelled', 'devolve o estado atual');
  assert.equal(res?.alreadyPaid, false);
  assert.equal(updates.length, 0, 'cancelled não vira pago');
});

// ── W2 saldos — gate fail-closed + fonte única ────────────────────────────────
test('W2 saldos: moduloFinanceiroAtivo OFF → FAIL-CLOSED (lista vazia, zero consulta de valores)', async () => {
  let consultouValores = false;
  const prisma = {
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: false }) },
    financeiroCharge: {
      findMany: async () => { consultouValores = true; return []; },
      groupBy: async () => { consultouValores = true; return []; },
    },
    entrega: {
      findMany: async () => { consultouValores = true; return []; },
      groupBy: async () => { consultouValores = true; return []; },
    },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.saldosFinanceiro(1);

  assert.equal(res.moduloFinanceiroAtivo, false);
  assert.deepEqual(res.clientes, [], 'OFF → nenhum cliente listado');
  assert.equal(consultouValores, false, 'OFF → nem consulta charges/entregas (fail-closed de verdade)');
});

test('W2 saldos: módulo ON → lista só quem deve (>0), com nome, pela fonte única', async () => {
  const prisma = {
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
    financeiroCharge: {
      // candidatos com charge pending da logística
      findMany: async () => [{ customerProfileId: 'conta-1' }],
      // fonte única (saldoAbertoPorClientes): Σ pending por cliente
      groupBy: async () => [{ customerProfileId: 'conta-1', _sum: { amount: 42.5 } }],
    },
    entrega: {
      // candidatos aguardando fechamento
      findMany: async () => [{ customerProfileId: 'conta-2' }],
      groupBy: async () => [{ customerProfileId: 'conta-2', _sum: { valor: 30 } }],
    },
    customerProfile: {
      findMany: async () => [
        { id: 'conta-1', name: 'Dona Maria' },
        { id: 'conta-2', name: 'Mercadinho' },
      ],
    },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.saldosFinanceiro(1);

  assert.equal(res.moduloFinanceiroAtivo, true);
  assert.equal(res.clientes.length, 2);
  // ordenado por saldoAberto desc: conta-1 (42.5) antes de conta-2 (30).
  assert.equal(res.clientes[0].customerProfileId, 'conta-1');
  assert.equal(res.clientes[0].nome, 'Dona Maria');
  assert.equal(res.clientes[0].saldoAberto, 42.5);
  assert.equal(res.clientes[0].aguardandoFechamento, 0);
  assert.equal(res.clientes[1].customerProfileId, 'conta-2');
  assert.equal(res.clientes[1].saldoAberto, 30, 'saldoAberto = pendente + aguardando (semântica do extrato)');
  assert.equal(res.clientes[1].aguardandoFechamento, 30);
});

// ── W2 histórico — item sintético p/ entrega legada + cursor ──────────────────
test('W2 histórico: entrega legada sem EntregaItem → 1 item sintético; com itens usa qtdEntregue ?? qtdPrevista', async () => {
  const rows = [
    {
      id: 'e2',
      status: 'entregue',
      quantidade: 1,
      valor: 35,
      scheduledAt: new Date('2026-07-09T09:00:00Z'),
      deliveredAt: new Date('2026-07-09T10:30:00Z'),
      receiptMethod: 'pix',
      cobrancaStatus: 'lancada',
      whatsappStatus: 'enviado',
      whatsappMotivo: null,
      createdAt: new Date('2026-07-09T08:00:00Z'),
      product: null,
      itens: [
        { qtdPrevista: 2, qtdEntregue: 3, valorUnit: 10, product: { name: 'Galão 20L' } },
        { qtdPrevista: 1, qtdEntregue: null, valorUnit: 5, product: { name: 'Água com gás' } },
      ],
    },
    {
      // LEGADA (N6): single-produto, sem EntregaItem → item sintético de
      // productId/quantidade/valor (valorUnit = valor/quantidade).
      id: 'e1',
      status: 'entregue',
      quantidade: 2,
      valor: 20,
      scheduledAt: new Date('2026-07-08T09:00:00Z'),
      deliveredAt: new Date('2026-07-08T11:00:00Z'),
      receiptMethod: null,
      cobrancaStatus: 'lancada',
      whatsappStatus: 'pulado',
      whatsappMotivo: 'sem_telefone',
      createdAt: new Date('2026-07-08T08:00:00Z'),
      product: { name: 'Galão 20L' },
      itens: [],
    },
  ];
  const prisma = {
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
    customerProfile: { findFirst: async () => ({ id: 'conta-1', name: 'Dona Maria' }) },
    entrega: { findMany: async () => rows },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.historicoEntregasCliente(1, 'conta-1', { limit: 30 });

  assert.ok(res, 'histórico retorna resultado');
  assert.equal(res?.items.length, 2);
  assert.equal(res?.nextCursor, null, 'página menor que o limit → sem próxima página');
  // desc por deliveredAt: e2 (09/07) antes de e1 (08/07).
  assert.equal(res?.items[0].id, 'e2');
  assert.equal(res?.items[0].receiptMethod, 'pix');
  assert.equal(res?.items[0].itens.length, 2);
  assert.equal(res?.items[0].itens[0].produtoNome, 'Galão 20L');
  assert.equal(res?.items[0].itens[0].qtd, 3, 'qtd = qtdEntregue quando existe');
  assert.equal(res?.items[0].itens[1].qtd, 1, 'qtd = qtdPrevista quando qtdEntregue é null');
  // item sintético da legada: nome do produto + quantidade + valorUnit = valor/qtd.
  assert.equal(res?.items[1].id, 'e1');
  assert.equal(res?.items[1].itens.length, 1, 'legada ganha 1 item sintético');
  assert.equal(res?.items[1].itens[0].produtoNome, 'Galão 20L');
  assert.equal(res?.items[1].itens[0].qtd, 2);
  assert.equal(res?.items[1].itens[0].valorUnit, 10, 'valorUnit sintético = valor(20)/quantidade(2)');
  assert.equal(res?.items[1].whatsappStatus, 'pulado');
  assert.equal(res?.items[1].whatsappMotivo, 'sem_telefone');
});

test('W2 histórico: cliente de outra empresa → null (404, sem vazar); página cheia → nextCursor', async () => {
  const prismaVazio = { customerProfile: { findFirst: async () => null } } as any;
  const s1 = new LogisticaService(prismaVazio, {} as any, {} as any, {} as any);
  assert.equal(await s1.historicoEntregasCliente(1, 'conta-de-outra-empresa'), null);

  // Página CHEIA (rows.length === limit) → nextCursor = id da última linha do banco.
  const mkRow = (id: string, dia: number) => ({
    id,
    status: 'entregue',
    quantidade: 1,
    valor: 10,
    scheduledAt: new Date(`2026-07-0${dia}T09:00:00Z`),
    deliveredAt: new Date(`2026-07-0${dia}T10:00:00Z`),
    receiptMethod: null,
    cobrancaStatus: 'lancada',
    whatsappStatus: null,
    whatsappMotivo: null,
    createdAt: new Date(`2026-07-0${dia}T08:00:00Z`),
    product: { name: 'Galão 20L' },
    itens: [],
  });
  let capturedArgs: any = null;
  const prisma = {
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
    customerProfile: { findFirst: async () => ({ id: 'conta-1', name: 'Dona Maria' }) },
    entrega: {
      findMany: async (args: any) => {
        capturedArgs = args;
        return [mkRow('e9', 9), mkRow('e8', 8)];
      },
    },
  } as any;
  const s2 = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await s2.historicoEntregasCliente(1, 'conta-1', { limit: 2, cursor: 'e10' });

  assert.equal(capturedArgs?.take, 2, 'limit vira take');
  assert.deepEqual(capturedArgs?.cursor, { id: 'e10' }, 'cursor por id');
  assert.equal(capturedArgs?.skip, 1, 'skip 1 = não repete a linha do cursor');
  assert.equal(res?.items.length, 2);
  assert.equal(res?.nextCursor, 'e8', 'página cheia → nextCursor = última linha da ordem do banco');
});

test('W2 histórico: limit é clampado (0/negativo → default 30; acima de 100 → 100)', async () => {
  const captured: number[] = [];
  const prisma = {
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: true }) },
    customerProfile: { findFirst: async () => ({ id: 'conta-1', name: 'X' }) },
    entrega: {
      findMany: async (args: any) => {
        captured.push(args.take);
        return [];
      },
    },
  } as any;
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  await service.historicoEntregasCliente(1, 'conta-1', { limit: 0 });
  await service.historicoEntregasCliente(1, 'conta-1', { limit: 500 });
  await service.historicoEntregasCliente(1, 'conta-1', {});
  assert.deepEqual(captured, [30, 100, 30], 'clamp: default 30, teto 100');
});

// ── W2 histórico — gate M4: financeiro OFF esconde o dinheiro (mas não o resto) ──
test('W2 histórico: moduloFinanceiroAtivo OFF → valor/valorUnit/cobrancaStatus null; data/itens/whatsapp ficam', async () => {
  const rows = [
    {
      id: 'e1', status: 'entregue', quantidade: 2, valor: 20,
      scheduledAt: new Date('2026-07-08T09:00:00Z'),
      deliveredAt: new Date('2026-07-08T11:00:00Z'),
      receiptMethod: 'pix', cobrancaStatus: 'lancada',
      whatsappStatus: 'enviado', whatsappMotivo: null,
      createdAt: new Date('2026-07-08T08:00:00Z'),
      product: { name: 'Galão 20L' },
      itens: [{ qtdPrevista: 2, qtdEntregue: 2, valorUnit: 10, product: { name: 'Galão 20L' } }],
    },
  ];
  const prisma = {
    logisticaConfig: { findUnique: async () => ({ moduloFinanceiroAtivo: false }) },
    customerProfile: { findFirst: async () => ({ id: 'conta-1', name: 'Dona Maria' }) },
    entrega: { findMany: async () => rows },
  } as any;

  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any);
  const res = await service.historicoEntregasCliente(1, 'conta-1', {});
  const it = res?.items[0];

  // Dinheiro some (regra M4).
  assert.equal(it?.valor, null, 'valor null com financeiro OFF');
  assert.equal(it?.cobrancaStatus, null, 'cobrancaStatus null com financeiro OFF');
  assert.equal(it?.itens[0].valorUnit, null, 'valorUnit null com financeiro OFF');
  // O resto do histórico ("o que/quando/hora/msg") continua vivo.
  assert.equal(it?.status, 'entregue');
  assert.ok(it?.deliveredAt, 'data/hora da entrega preservada');
  assert.equal(it?.itens[0].produtoNome, 'Galão 20L', 'nome do produto preservado');
  assert.equal(it?.itens[0].qtd, 2, 'quantidade preservada');
  assert.equal(it?.whatsappStatus, 'enviado', 'desfecho do WhatsApp preservado');
});

// ── BUG 5 (11/07) — resolveDayRange trata data de calendário IMPOSSÍVEL como HOJE ──
// Antes, "?date=2026-02-30" (30 de fevereiro) fazia overflow silencioso do JS Date
// e caía no dia 02/mar, INCONSISTENTE com "?date=abc"/"?date=2026-13-45" (que já
// caíam pra hoje via NaN). Com o round-trip, os 3 casos convergem pro mesmo
// fallback: hoje.
test('resolveDayRange: data impossível (2026-02-30) cai pra HOJE, igual a lixo/mês inválido', () => {
  // Referência de "hoje" = a própria resolveDayRange sem date (evita flakiness de
  // fuso: reconstruir "hoje" via new Date().toISOString() direto pode divergir
  // perto da virada de dia em fuso negativo como Brasília -3).
  const hojeISO = resolveDayRange(undefined).dayISO;
  assert.equal(resolveDayRange('2026-02-30').dayISO, hojeISO, '30 de fevereiro não existe → hoje');
  assert.equal(resolveDayRange('2026-13-45').dayISO, hojeISO, 'mês 13 já caía pra hoje (NaN)');
  assert.equal(resolveDayRange('abc').dayISO, hojeISO, 'lixo já caía pra hoje (NaN)');
});

test('resolveDayRange: "YYYY-MM-DD" válido resolve pro próprio dia (fuso local)', () => {
  assert.equal(resolveDayRange('2026-07-11').dayISO, '2026-07-11');
});

function buildRotaPrivacyMock(moduloFinanceiroAtivo: boolean) {
  const queries: {
    entrega?: any;
    config?: any;
    saldo: number;
    trackingIncludeCommercialMode: boolean[];
  } = { saldo: 0, trackingIncludeCommercialMode: [] };
  const row = {
    id: 'entrega-rota-1',
    status: 'em_rota',
    quantidade: 2,
    // L4-A (18/07) — origem é operacional (não comercial): visível a QUALQUER
    // ator, inclusive sem billingAudience (ver os 2 testes de listRota abaixo).
    origem: 'recorrente',
    valor: 42,
    scheduledAt: new Date('2026-07-13T12:00:00Z'),
    deliveredAt: null,
    deliveredLat: null,
    deliveredLng: null,
    cobrancaStatus: 'pendente',
    notes: null,
    updatedAt: new Date('2026-07-13T12:05:00Z'),
    entregador: { id: 42, name: 'Motorista', email: 'motorista@hbx.test', username: 'motorista' },
    comprovanteCodigoHash: null,
    comprovanteConfirmadoAt: null,
    comprovantes: [],
    rotaOrdem: 1,
    etaAt: new Date('2026-07-13T12:30:00Z'),
    localId: null,
    local: null,
    customerProfile: {
      id: 'cliente-1',
      name: 'Cliente',
      endereco: 'Rua A',
      cidade: 'São Paulo',
      uf: 'SP',
      lat: -23.5,
      lng: -46.6,
      phone: '11999999999',
      // PR18072026 W1 — observação operacional (visível a QUALQUER ator, não
      // gateada por billingAudience — diferente de formaPagamento/saldo/etc).
      observacoes: 'Deixa na portaria, cachorro bravo.',
      formaPagamento: 'aberto',
      metodoPadrao: 'pix',
      limiteFiado: 100,
    },
    contato: null,
    product: { id: 10, name: 'Galão', unidade: 'un' },
    itens: [
      {
        id: 'item-1',
        qtdPrevista: 2,
        qtdEntregue: null,
        valorUnit: 21,
        product: { id: 10, name: 'Galão', unidade: 'un' },
      },
    ],
  };
  const prisma: any = {
    entrega: {
      findMany: async (args: any) => {
        queries.entrega = args;
        return [row];
      },
      groupBy: async () => {
        queries.saldo += 1;
        return [];
      },
    },
    financeiroCharge: {
      groupBy: async () => {
        queries.saldo += 1;
        return [];
      },
    },
    logisticaConfig: {
      findUnique: async (args: any) => {
        queries.config = args;
        // O mock devolve os campos mesmo quando não selecionados para provar que a
        // serialização continua fail-closed diante de um adapter permissivo.
        return {
          moduloFinanceiroAtivo,
          pixChave: 'chave-pix-secreta',
          pixNome: 'Empresa',
          pixCidade: 'SAO PAULO',
          avisoChegandoEnabled: false,
          avisoChegandoDistanciaM: 500,
          comprovanteFotoObrigatoria: false,
          comprovanteAssinaturaObrigatoria: false,
          comprovanteCodigoObrigatorio: false,
        };
      },
    },
  };
  const operacao: any = {
    whereForActor: async () => ({}),
    requisitosFromConfig: () => ({
      fotoObrigatoria: false,
      assinaturaObrigatoria: false,
      codigoObrigatorio: false,
    }),
  };
  const tracking: any = {
    // Retorna routeMode até quando não solicitado para provar que a serialização
    // HTTP do motorista continua fail-closed diante de um adapter permissivo.
    getOperationalRouteMetadata: async (
      _companyId: number,
      _driverId: number,
      _routeDate: string,
      includeCommercialMode: boolean,
    ) => {
      queries.trackingIncludeCommercialMode.push(includeCommercialMode);
      return {
        routeId: 'route-1',
        trackingRequired: true,
        routeMode: 'TRACKED',
        routeStatus: 'ACTIVE',
        trackingSessionId: 'session-1',
        trackingStatus: 'ACTIVE',
      };
    },
  };
  const service = new LogisticaService(
    prisma,
    {} as any,
    {} as any,
    {} as any,
    undefined,
    undefined,
    undefined,
    operacao,
    undefined,
    tracking,
  );
  return { service, queries };
}

test('listRota: vendedor, motorista e gerente não recebem nem consultam dados comerciais', async () => {
  const atores = [
    { nome: 'vendedor', actor: { id: 11, companyId: 7, role: 'USER', canViewBilling: false } },
    { nome: 'motorista', actor: { id: 42, companyId: 7, role: 'USER', canViewBilling: false } },
    { nome: 'gerente', actor: { id: 3, companyId: 7, role: 'ADMIN', canViewBilling: false } },
  ];

  for (const { nome, actor } of atores) {
    const { service, queries } = buildRotaPrivacyMock(true);
    const result = await service.listRota(7, '2026-07-13', actor);

    assertNoCommercialRouteKeys(result, nome);
    // PR18072026 W1 — observacoes é OPERACIONAL (instrução de entrega), não
    // comercial: continua visível pro entregador/vendedor/gerente sem billing.
    assert.equal(result.items[0].cliente.observacoes, 'Deixa na portaria, cachorro bravo.', `${nome}: observacoes deve continuar visível`);
    // L4-A (18/07) — origem também é operacional: visível sem billingAudience.
    assert.equal(result.items[0].origem, 'recorrente', `${nome}: origem deve continuar visível`);
    assert.equal(result.trackingRequired, true, `${nome}: sinal operacional deve permanecer disponível`);
    assert.deepEqual(queries.trackingIncludeCommercialMode, [false]);

    // PR18072026 W1 (coordenador) — as TRÊS exposições aditivas (metodoPadrao/
    // debitoAtual/valorHoje) são gateadas por moduloFinanceiroAtivoConfig (o
    // valor REAL da config), NÃO por billingAudience — o entregador comum (sem
    // cobrança) recebe as três mesmo sendo vendedor/motorista/gerente.
    assert.equal(result.items[0].cliente.metodoPadrao, 'pix', `${nome}: metodoPadrao deve ser exposto (botão [Pago])`);
    assert.equal(result.items[0].cliente.debitoAtual, 0, `${nome}: debitoAtual deve ser exposto (mesma fonte canônica de saldoAberto)`);
    assert.equal(result.items[0].valorHoje, 42, `${nome}: valorHoje deve ser exposto (2×21 dos itens da entrega atual)`);
    // A consulta de saldo AGORA roda (debitoAtual precisa dela) mesmo sem billingAudience.
    assert.equal(queries.saldo, 2, `${nome}: consulta de saldo roda p/ alimentar debitoAtual`);

    const entregaSelect = queries.entrega.select;
    // `valor`/`itens.valorUnit`/`customerProfile.metodoPadrao` agora são
    // selecionados p/ QUALQUER ator (o SERVIDOR precisa deles pra computar
    // valorHoje/metodoPadrao/debitoAtual) — a OUTPUT de `valor`/`valorUnit` cru
    // continua billing-only (ver o resto deste teste: sem 'valor'/'valorUnit'
    // no objeto, só o agregado seguro valorHoje).
    assert.equal('valor' in entregaSelect, true, `${nome}: Entrega.valor É selecionado (uso interno p/ valorHoje)`);
    assert.equal('cobrancaStatus' in entregaSelect, false, `${nome}: cobrança não deve ser selecionada`);
    assert.equal('formaPagamento' in entregaSelect.customerProfile.select, false);
    assert.equal('metodoPadrao' in entregaSelect.customerProfile.select, true, `${nome}: metodoPadrao É selecionado (uso p/ output aditivo)`);
    assert.equal('limiteFiado' in entregaSelect.customerProfile.select, false);
    assert.equal('valorUnit' in entregaSelect.itens.select, true, `${nome}: valorUnit É selecionado (uso interno p/ valorHoje)`);

    const configSelect = queries.config.select;
    assert.equal('moduloFinanceiroAtivo' in configSelect, true, `${nome}: moduloFinanceiroAtivo (o TOGGLE) É lido p/ QUALQUER ator`);
    assert.equal('pixChave' in configSelect, false, `${nome}: pixChave (dado sensível de verdade) continua ausente`);
    assert.equal('pixNome' in configSelect, false);
    assert.equal('pixCidade' in configSelect, false);
  }
});

test('listRota: dono mantém a visão comercial necessária à administração', async () => {
  const { service, queries } = buildRotaPrivacyMock(false);
  const result = await service.listRota(7, '2026-07-13', {
    id: 1,
    companyId: 7,
    role: 'ADMIN',
    canViewBilling: true,
  });
  const item = result.items[0];

  assert.equal(result.moduloFinanceiroAtivo, false);
  assert.equal(result.trackingRequired, true);
  assert.equal(result.routeMode, 'TRACKED');
  assert.deepEqual(queries.trackingIncludeCommercialMode, [true]);
  assert.equal(result.pix, null);
  assert.equal(item.valor, 42);
  assert.equal(item.cobrancaStatus, 'pendente');
  assert.equal(item.cliente.formaPagamento, 'aberto');
  assert.equal(item.cliente.metodoPadrao, 'pix', 'billingAudience continua vendo metodoPadrao pelo bloco ORIGINAL');
  assert.equal(item.cliente.saldoAberto, 0);
  // PR18072026 W1 (coordenador) — este teste usa buildRotaPrivacyMock(false):
  // moduloFinanceiroAtivoConfig (o TOGGLE real da empresa) é FALSE aqui. As TRÊS
  // exposições aditivas (metodoPadrao-standalone/debitoAtual/valorHoje) ficam
  // AUSENTES (undefined) — "OFF = dinheiro não aparece em lugar nenhum", mesmo
  // pro dono. metodoPadrao='pix' acima vem do bloco billingAudience ORIGINAL,
  // que não depende do toggle (nunca dependeu — comportamento intocado).
  assert.equal(item.cliente.debitoAtual, undefined, 'moduloFinanceiroAtivoConfig OFF → debitoAtual nem aparece');
  assert.equal(item.valorHoje, undefined, 'moduloFinanceiroAtivoConfig OFF → valorHoje nem aparece');
  assert.equal(item.cliente.limiteFiado, 100);
  assert.equal(item.cliente.observacoes, 'Deixa na portaria, cachorro bravo.');
  assert.equal(item.origem, 'recorrente', 'origem visível também pro dono (billingAudience)');
  assert.equal(item.itens[0].valorUnit, 21);
  assert.equal('valor' in queries.entrega.select, true);
  assert.equal('pixChave' in queries.config.select, true);
});

// PR18072026 W1 (coordenador) — com o toggle LIGADO, o dono (billingAudience)
// também recebe as 3 exposições aditivas — mesmo valor que o entregador comum
// veria, via o gate NOVO (moduloFinanceiroAtivoConfig), redundante com o bloco
// billingAudience ORIGINAL só quando os dois batem (o que é o caso do dono).
test('listRota: dono com o módulo financeiro LIGADO também vê as 3 exposições aditivas', async () => {
  const { service } = buildRotaPrivacyMock(true);
  const result = await service.listRota(7, '2026-07-13', {
    id: 1,
    companyId: 7,
    role: 'ADMIN',
    canViewBilling: true,
  });
  const item = result.items[0];

  assert.equal(item.cliente.metodoPadrao, 'pix');
  assert.equal(item.cliente.debitoAtual, 0);
  assert.equal(item.valorHoje, 42);
});

// PR18072026 W1 — cliente.debitoAtual reusa a MESMA fonte canônica de
// saldoAberto (saldoAbertoPorClientes) quando moduloFinanceiroAtivo está ON —
// não recalcula na mão, os dois batem com o valor REAL (não só 0).
test('listRota: cliente.debitoAtual bate com saldoAberto (mesma fonte canônica, valor não-zero)', async () => {
  const row = {
    id: 'entrega-rota-1',
    status: 'em_rota',
    quantidade: 1,
    valor: 30,
    scheduledAt: new Date('2026-07-18T12:00:00Z'),
    deliveredAt: null,
    deliveredLat: null,
    deliveredLng: null,
    cobrancaStatus: 'pendente',
    notes: null,
    updatedAt: new Date('2026-07-18T12:05:00Z'),
    entregador: { id: 42, name: 'Motorista', email: 'motorista@hbx.test', username: 'motorista' },
    comprovanteCodigoHash: null,
    comprovanteConfirmadoAt: null,
    comprovantes: [],
    rotaOrdem: 0,
    etaAt: null,
    localId: null,
    local: null,
    customerProfile: {
      id: 'cliente-devedor',
      name: 'Cliente Devedor',
      endereco: 'Rua B',
      cidade: 'São Paulo',
      uf: 'SP',
      lat: -23.5,
      lng: -46.6,
      phone: '11988888888',
      observacoes: null,
      formaPagamento: 'aberto',
      metodoPadrao: null,
      limiteFiado: null,
    },
    contato: null,
    product: { id: 10, name: 'Galão', unidade: 'un' },
    itens: [],
  };
  const prisma: any = {
    entrega: {
      findMany: async () => [row],
      groupBy: async () => [{ customerProfileId: 'cliente-devedor', _sum: { valor: 12.5 } }],
    },
    financeiroCharge: {
      groupBy: async () => [{ customerProfileId: 'cliente-devedor', _sum: { amount: 37.5 } }],
    },
    logisticaConfig: {
      findUnique: async () => ({ moduloFinanceiroAtivo: true, pixChave: null, pixNome: null, pixCidade: null }),
    },
  };
  const operacao: any = {
    whereForActor: async () => ({}),
    requisitosFromConfig: () => ({ fotoObrigatoria: false, assinaturaObrigatoria: false, codigoObrigatorio: false }),
  };
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any, undefined, undefined, undefined, operacao);
  const result = await service.listRota(7, '2026-07-18', { id: 1, companyId: 7, role: 'ADMIN', canViewBilling: true });

  const cliente = result.items[0].cliente as any;
  assert.equal(cliente.saldoAberto, 50, 'pendente(37.5) + aguardando(12.5)');
  assert.equal(cliente.debitoAtual, 50, 'debitoAtual = MESMO valor de saldoAberto');
  // PR18072026 W1 (coordenador) — entrega SEM EntregaItem (itens: []) cai no
  // fallback: valorHoje = r.valor (o escalar legado), não zero.
  assert.equal(result.items[0].valorHoje, 30, 'sem itens, valorHoje cai no r.valor legado');
});

test('listRota: valorHoje soma EntregaItem.qtdPrevista×valorUnit quando a entrega TEM itens', async () => {
  const row = {
    id: 'entrega-multi-item',
    status: 'agendada',
    quantidade: 3,
    valor: 999, // propositalmente diferente da soma dos itens — valorHoje NÃO usa este campo quando há itens
    scheduledAt: new Date('2026-07-18T12:00:00Z'),
    deliveredAt: null,
    deliveredLat: null,
    deliveredLng: null,
    cobrancaStatus: 'pendente',
    notes: null,
    updatedAt: new Date('2026-07-18T12:05:00Z'),
    entregador: null,
    comprovanteCodigoHash: null,
    comprovanteConfirmadoAt: null,
    comprovantes: [],
    rotaOrdem: 0,
    etaAt: null,
    localId: null,
    local: null,
    customerProfile: {
      id: 'cliente-1',
      name: 'Cliente Um',
      endereco: null,
      cidade: null,
      uf: null,
      lat: null,
      lng: null,
      phone: null,
      observacoes: null,
      formaPagamento: 'aberto',
      metodoPadrao: null,
      limiteFiado: null,
    },
    contato: null,
    product: null,
    itens: [
      { id: 'item-1', qtdPrevista: 2, qtdEntregue: null, valorUnit: 12, product: { id: 10, name: 'Galão', unidade: 'un' } },
      { id: 'item-2', qtdPrevista: 1, qtdEntregue: null, valorUnit: 8, product: { id: 20, name: 'Gás', unidade: 'un' } },
    ],
  };
  const prisma: any = {
    entrega: { findMany: async () => [row], groupBy: async () => [] },
    financeiroCharge: { groupBy: async () => [] },
    logisticaConfig: {
      findUnique: async () => ({ moduloFinanceiroAtivo: true, pixChave: null, pixNome: null, pixCidade: null }),
    },
  };
  const operacao: any = {
    whereForActor: async () => ({}),
    requisitosFromConfig: () => ({ fotoObrigatoria: false, assinaturaObrigatoria: false, codigoObrigatorio: false }),
  };
  // Ator SEM billing (vendedor) — valorHoje ainda deve aparecer (gate é moduloFinanceiroAtivoConfig).
  const service = new LogisticaService(prisma, {} as any, {} as any, {} as any, undefined, undefined, undefined, operacao);
  const result = await service.listRota(7, '2026-07-18', { id: 11, companyId: 7, role: 'USER', canViewBilling: false });

  assert.equal(result.items[0].valorHoje, 32, '2×12 + 1×8 = 32 (Σ itens, ignora o r.valor=999)');
  assert.equal('valor' in result.items[0], false, 'valor cru continua ausente pro ator sem billing');
});

// ══════════════════════════════════════════════════════════════════════════════
// CHEGADA EDITÁVEL (22/07) — os DOIS caminhos que mexem em dinheiro de verdade.
// Pedido do dono, nas palavras dele: "clicou em cima do valor, altera — MAS É O
// VALOR ATUAL: se ontem vendeu por 10 e hoje é 50, vai ficar 60" e "[Pago] =
// Pagamento {Valor total}" (dívida velha junto, não só a entrega do dia).
// ══════════════════════════════════════════════════════════════════════════════

// ── Preço de HOJE: vale pra ESTA entrega e é o que a cobrança usa ─────────────
test('CHEGADA: valorUnit editado na chegada manda na cobrança (e não toca o catálogo)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const itens = [{ id: 'item-1', qtdPrevista: 1, qtdEntregue: 1, valorUnit: 10 }];
  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega({ valor: 10 }),
    { id: 'conta-1', name: 'Lucilene', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
    itens,
    { products: [{ id: 9, companyId: 1, price: 10, priceCents: 1000 }] },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -22.4, lng: -47.5,
    receiptMethod: 'dinheiro',
    itens: [{ id: 'item-1', qtdEntregue: 1, valorUnit: 50 }],
  });

  assert.equal(itens[0].valorUnit, 50, 'o item DESTA entrega passa a valer 50');
  assert.equal(chargesCreated.length, 1, 'lança 1 cobrança');
  assert.equal(chargesCreated[0].amount, 50, 'a cobrança sai com o preço EDITADO, não com o de catálogo');
  assert.equal(res?.cobrancaLancada, true);

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── [Pago] quita a dívida velha junto, e é idempotente ────────────────────────
test('CHEGADA: [Pago] com quitarAberto quita as cobranças antigas do cliente (idempotente)', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Lucilene', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
  );
  // "Banco" de cobranças ANTIGAS em aberto deste cliente (2 fiados de outros dias).
  const antigas: any[] = [
    { id: 'ch-velha-1', companyId: 1, customerProfileId: 'conta-1', status: 'pending', lifecycle: 'in_progress', amount: 20, paidAt: null, sourceModule: 'logistica_entrega' },
    { id: 'ch-velha-2', companyId: 1, customerProfileId: 'conta-1', status: 'pending', lifecycle: 'in_progress', amount: 15, paidAt: null, sourceModule: 'logistica_entrega' },
  ];
  const baseFindFirst = prisma.financeiroCharge.findFirst;
  prisma.financeiroCharge.findFirst = async (args: any) => {
    const id = args?.where?.id;
    if (id) return antigas.find((c) => c.id === id) ?? null;
    return baseFindFirst(args);
  };
  prisma.financeiroCharge.findMany = async (args: any) =>
    antigas.filter((c) => c.status === (args?.where?.status ?? c.status));
  prisma.financeiroCharge.updateMany = async (args: any) => {
    const alvo = antigas.find((c) => c.id === args?.where?.id && c.status === 'pending');
    if (!alvo) return { count: 0 };
    Object.assign(alvo, args.data);
    return { count: 1 };
  };

  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();
  const service = new LogisticaService(prisma, conversations, rota, config);

  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -22.4, lng: -47.5, receiptMethod: 'dinheiro', quitarAberto: true });

  assert.equal(res?.quitadas, 2, 'as 2 cobranças velhas foram quitadas junto');
  assert.equal(res?.valorQuitado, 35, '20 + 15 = 35 quitados além da entrega de hoje');
  assert.ok(antigas.every((c) => c.status === 'approved' && c.lifecycle === 'paid' && c.paidAt), 'todas viraram pagas');
  assert.equal(chargesCreated.length, 1, 'a entrega de hoje continua lançando 1 charge só');

  // Idempotência: tocar [Pago] de novo cai no replay por status (entrega já
  // 'entregue') e NÃO re-executa nada — nem a cobrança do dia, nem a baixa das
  // velhas. É o que impede um toque a mais de mexer no financeiro do cliente.
  const pagoAntes = antigas.map((c) => String(c.paidAt));
  const res2 = await service.confirmarEntrega(1, 'entrega-1', { lat: -22.4, lng: -47.5, receiptMethod: 'dinheiro', quitarAberto: true });
  assert.equal(res2?.replayed, true, '2ª passada é replay (entrega já concluída)');
  assert.ok(!res2?.quitadas, '2ª passada não quita nada de novo');
  assert.deepEqual(antigas.map((c) => String(c.paidAt)), pagoAntes, 'paidAt original preservado');
  assert.equal(chargesCreated.length, 1, 'nenhuma cobrança nova na 2ª passada');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

// ── Histórico é REGISTRO, nunca freio: falhar ao gravar não derruba a entrega ──
test('CHEGADA: falha ao gravar histórico NÃO derruba a confirmação da entrega', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const { prisma } = buildPrismaMock(
    buildEntrega(),
    { id: 'conta-1', name: 'Lucilene', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
  );
  prisma.clienteHistorico = { create: async () => { throw new Error('banco fora do ar'); } };

  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();
  const service = new LogisticaService(prisma, conversations, rota, config);

  const res = await service.confirmarEntrega(1, 'entrega-1', { lat: -22.4, lng: -47.5, receiptMethod: 'dinheiro' });
  assert.equal(res?.status, 'entregue', 'a entrega fecha mesmo com o histórico falhando');
});

// ── PR27072026 F0 (28/07) — REABRIR NÃO ATROPELA DINHEIRO JÁ RECEBIDO ────────
// Incidente real (cia 41, entrega da Dejanira em 23/07): entrega confirmada e
// PAGA na hora (R$ 20), reaberta 5 min depois e nunca reconfirmada. Ficou no
// banco como 'agendada' + deliveredAt + cobrança paga — "a fazer" com dinheiro
// dentro, invisível pra todo mundo por 5 dias (nem o fechamento de caixa a
// resgata: ele se recusa a tocar cobrança resolvida, e faz certo).
function buildReabrirPrisma(entrega: any, charge: any | null) {
  const eventos: any[] = [];
  const updates: any[] = [];
  const prisma: any = {
    entrega: {
      findFirst: async () => entrega,
      updateMany: async (args: any) => {
        if (args?.where?.status && args.where.status !== entrega.status) return { count: 0 };
        updates.push(args.data);
        Object.assign(entrega, args.data);
        return { count: 1 };
      },
    },
    financeiroCharge: { findFirst: async () => charge },
    logisticaAgendaEvento: {
      create: async (args: any) => { eventos.push(args.data); return { id: `ev-${eventos.length}` }; },
    },
  };
  return { prisma, eventos, updates };
}

test('reabrirEntrega: cobrança JÁ PAGA → recusa e a entrega continua entregue', async () => {
  const entrega = buildEntrega({ status: 'entregue', cobrancaStatus: 'lancada' });
  const { prisma, updates } = buildReabrirPrisma(entrega, {
    amount: 20, status: 'approved', lifecycle: 'paid', paidAt: new Date('2026-07-24T01:21:04Z'),
  });
  const { rota } = buildRotaStub();
  const service = new LogisticaService(prisma, {} as any, rota, {} as any);

  await assert.rejects(
    () => service.reabrirEntrega(1, 'entrega-1'),
    (err: any) => {
      assert.match(String(err?.message), /já foi paga/i, 'diz que a entrega já foi paga');
      assert.match(String(err?.message), /R\$ 20,00/, 'mostra o valor recebido');
      return true;
    },
  );
  assert.equal(entrega.status, 'entregue', 'nada foi reaberto');
  assert.equal(updates.length, 0, 'nenhum update na entrega');
});

test('reabrirEntrega: fiado ainda PENDENTE reabre normal e vira linha no extrato da agenda', async () => {
  const entrega = buildEntrega({ status: 'entregue', cobrancaStatus: 'lancada' });
  const { prisma, eventos } = buildReabrirPrisma(entrega, {
    amount: 20, status: 'pending', lifecycle: 'in_progress', paidAt: null,
  });
  const { rota } = buildRotaStub();
  const service = new LogisticaService(prisma, {} as any, rota, {} as any);

  const res = await service.reabrirEntrega(1, 'entrega-1');

  assert.equal(res?.status, 'agendada', 'nada recebido → reabre normal');
  assert.equal(eventos.length, 1, 'reabertura vira 1 linha no extrato da agenda');
  assert.equal(eventos[0].tipo, 'ENTREGA_REABERTA');
  assert.equal(eventos[0].origem, 'app');
  assert.equal(eventos[0].entregaId, 'entrega-1');
});

test('reabrirEntrega: sem cobrança nenhuma reabre normal (caminho antigo intacto)', async () => {
  const entrega = buildEntrega({ status: 'entregue', cobrancaStatus: 'pendente' });
  const { prisma } = buildReabrirPrisma(entrega, null);
  const { rota } = buildRotaStub();
  const service = new LogisticaService(prisma, {} as any, rota, {} as any);

  const res = await service.reabrirEntrega(1, 'entrega-1');
  assert.equal(res?.status, 'agendada');
});

// ── 28/07 — NINGUÉM PAGA POR ENTREGA CANCELADA (ordem do dono) ───────────────
// Cobrança numa entrega não-'entregue' só existe depois de um reabrir. Cancelar
// a entrega passa a cancelar junto a cobrança dela que NÃO foi recebida (caso
// Daniela, cia 48, R$ 11 de fiado numa entrega cancelada). Dinheiro já recebido
// nunca é desfeito por aqui, e nenhum ramo lança exceção — este é o mesmo
// caminho da fila offline do APK.
function buildCancelarPrisma(entrega: any, charge: any | null) {
  const chargeUpdates: any[] = [];
  const entregaUpdates: any[] = [];
  const prisma: any = {
    entrega: {
      findFirst: async () => entrega,
      update: async (args: any) => {
        entregaUpdates.push(args.data);
        Object.assign(entrega, args.data);
        return { id: entrega.id, ...args.data };
      },
    },
    financeiroCharge: {
      updateMany: async (args: any) => {
        const w = args?.where || {};
        const bate = !!charge
          && charge.entregaId === w.entregaId
          && (w.status === undefined || charge.status === w.status)
          && (w.paidAt !== null || charge.paidAt == null);
        if (!bate) return { count: 0 };
        chargeUpdates.push(args.data);
        Object.assign(charge, args.data);
        return { count: 1 };
      },
    },
    clienteHistorico: { create: async () => ({ id: 'hist-1' }) },
    $transaction: async (fn: any) => fn(prisma),
  };
  return { prisma, chargeUpdates, entregaUpdates };
}

test('cancelarEntrega: fiado PENDENTE da entrega é cancelado junto (ninguém paga por entrega cancelada)', async () => {
  const entrega = buildEntrega({ status: 'agendada', cobrancaStatus: 'lancada', agendaOcorrenciaKey: null, planoEntregaId: null });
  const charge = { entregaId: 'entrega-1', amount: 11, status: 'pending', lifecycle: 'in_progress', paidAt: null };
  const { prisma, chargeUpdates } = buildCancelarPrisma(entrega, charge);
  const { rota } = buildRotaStub();
  const service = new LogisticaService(prisma, {} as any, rota, {} as any);

  const res = await service.cancelarEntrega(1, 'entrega-1', 'cliente não estava');

  assert.equal(res?.cobrancaCancelada, true, 'avisa que a cobrança caiu junto');
  assert.equal(chargeUpdates.length, 1);
  assert.equal(chargeUpdates[0].status, 'cancelled');
  assert.equal(chargeUpdates[0].lifecycle, 'cancelled');
  assert.equal(entrega.status, 'cancelada');
  assert.equal(entrega.cobrancaStatus, 'pendente', 'entrega cancelada não fica com cobrança "lancada"');
});

test('cancelarEntrega: cobrança JÁ PAGA não é desfeita (sistema não decide dinheiro sozinho)', async () => {
  const entrega = buildEntrega({ status: 'agendada', cobrancaStatus: 'lancada', agendaOcorrenciaKey: null, planoEntregaId: null });
  const charge = { entregaId: 'entrega-1', amount: 20, status: 'approved', lifecycle: 'paid', paidAt: new Date() };
  const { prisma, chargeUpdates } = buildCancelarPrisma(entrega, charge);
  const { rota } = buildRotaStub();
  const service = new LogisticaService(prisma, {} as any, rota, {} as any);

  const res = await service.cancelarEntrega(1, 'entrega-1');

  assert.equal(res?.cobrancaCancelada, false, 'dinheiro recebido fica de pé');
  assert.equal(chargeUpdates.length, 0, 'nenhum toque no charge pago');
  assert.equal(charge.status, 'approved');
  assert.equal(entrega.status, 'cancelada', 'a entrega cancela mesmo assim — sem exceção (fila offline do APK)');
  assert.equal(entrega.cobrancaStatus, 'lancada', 'cobrancaStatus intacto quando nada foi cancelado');
});

test('cancelarEntrega: entrega sem cobrança nenhuma cancela igual ao caminho antigo', async () => {
  const entrega = buildEntrega({ status: 'agendada', agendaOcorrenciaKey: null, planoEntregaId: null });
  const { prisma, chargeUpdates } = buildCancelarPrisma(entrega, null);
  const { rota } = buildRotaStub();
  const service = new LogisticaService(prisma, {} as any, rota, {} as any);

  const res = await service.cancelarEntrega(1, 'entrega-1');
  assert.equal(res?.id, 'entrega-1');
  assert.equal(res?.cobrancaCancelada, false);
  assert.equal(chargeUpdates.length, 0);
  assert.equal(entrega.status, 'cancelada');
});

// ── 28/07 — BUG DO VALOR: correção que não chegava no dinheiro ────────────────
// Reabrir existe pra "corrigir quantidade ou incluir itens" e era exatamente
// nisso que falhava: o reconfirmar recalculava Entrega.valor mas pulava o bloco
// de efeitos inteiro (certo: não pode disparar WhatsApp nem criar 2ª cobrança),
// então o charge ficava com o valor VELHO. Entregou 3 galões, cobrou 2.
function buildEntregaReaberta(overrides: Record<string, any> = {}) {
  return buildEntrega({
    status: 'agendada',
    // deliveredAt preenchido com status != 'entregue' = a marca da reabertura
    // (é o que o reabrir deixa de propósito, pra não duplicar efeito).
    deliveredAt: new Date('2026-07-27T18:00:00Z'),
    cobrancaStatus: 'lancada',
    valor: 20,
    ...overrides,
  });
}

test('REABERTA: corrigiu a quantidade → a cobrança PENDENTE segue o valor novo', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  // 1º confirmar: 2× R$10 = R$20 (o charge que já existe). Reabre e corrige
  // para 3 entregues → a cobrança tem de virar R$30.
  const itens = [{ id: 'item-1', qtdPrevista: 2, qtdEntregue: 2, valorUnit: 10 }];
  const charge = { entregaId: 'entrega-1', amount: 20, status: 'pending', lifecycle: 'in_progress', paidAt: null };
  const { prisma, chargesCreated } = buildPrismaMock(
    buildEntregaReaberta(),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
    itens,
    { charges: [charge] },
  );
  const { conversations, calls } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -4.9,
    lng: -38.3,
    itens: [{ id: 'item-1', qtdEntregue: 3 }],
  });

  assert.equal(res?.status, 'entregue');
  assert.equal(res?.cobrancaAjustada, true, 'o confirmar avisa que a cobrança foi corrigida');
  assert.equal(chargesCreated.length, 1, 'reabertura NUNCA cria uma 2ª cobrança');
  assert.equal(charge.amount, 30, 'entregou 3× R$10 → a cobrança vira R$ 30 (era R$ 20)');
  assert.equal(calls.length, 0, 'reabertura não dispara WhatsApp de novo');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('REABERTA: cobrança JÁ PAGA não é mexida nem quando o valor muda', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const itens = [{ id: 'item-1', qtdPrevista: 2, qtdEntregue: 2, valorUnit: 10 }];
  const charge = { entregaId: 'entrega-1', amount: 20, status: 'approved', lifecycle: 'paid', paidAt: new Date() };
  const { prisma } = buildPrismaMock(
    buildEntregaReaberta(),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
    itens,
    { charges: [charge] },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -4.9, lng: -38.3, itens: [{ id: 'item-1', qtdEntregue: 3 }],
  });

  assert.equal(res?.cobrancaAjustada, false, 'dinheiro recebido não se mexe');
  assert.equal(charge.amount, 20, 'o valor pago fica exatamente como estava');

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});

test('REABERTA: valor corrigido pra ZERO (cortesia) cancela a cobrança em vez de cobrar R$ 0,00', async () => {
  const prev = process.env.HBX_LOGISTICA_ENABLED;
  process.env.HBX_LOGISTICA_ENABLED = '1';

  const itens = [{ id: 'item-1', qtdPrevista: 2, qtdEntregue: 2, valorUnit: 10 }];
  const charge = { entregaId: 'entrega-1', amount: 20, status: 'pending', lifecycle: 'in_progress', paidAt: null };
  const { prisma, entregaUpdates } = buildPrismaMock(
    buildEntregaReaberta(),
    { id: 'conta-1', name: 'Dona Maria', formaPagamento: 'aberto', contabilizar: true, avisarEntrega: true },
    itens,
    { charges: [charge] },
  );
  const { conversations } = buildConversationsMock();
  const { rota } = buildRotaStub();
  const { config } = buildConfigMock();

  const service = new LogisticaService(prisma, conversations, rota, config);
  // preço zerado na chegada = brinde do dia → valor da entrega vai a 0.
  const res = await service.confirmarEntrega(1, 'entrega-1', {
    lat: -4.9, lng: -38.3, itens: [{ id: 'item-1', qtdEntregue: 2, valorUnit: 0 }],
  });

  assert.equal(res?.cobrancaAjustada, true);
  assert.equal(charge.status, 'cancelled', 'nada a cobrar → a cobrança cai (não vira R$ 0,00 pendente)');
  assert.ok(
    entregaUpdates.some((u) => u.cobrancaStatus === 'isenta'),
    'a entrega fica isenta',
  );

  if (prev === undefined) delete process.env.HBX_LOGISTICA_ENABLED;
  else process.env.HBX_LOGISTICA_ENABLED = prev;
});
