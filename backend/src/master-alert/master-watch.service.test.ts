import test from 'node:test';
import assert from 'node:assert/strict';

import { MasterWatchService } from './master-watch.service';
import { MasterAlertService } from './master-alert.service';

// Cobre o watcher (Sprint 3): dedup de transição de estado comercial (mesmo
// estado em 2 ticks seguidos = 1 evento só), e desligado por env = zero ticks
// (onModuleInit não agenda setInterval nenhum). O ciclo completo do tick
// (runTick, privado) é exercitado via cast `as any` — mesmo padrão já usado em
// master-cockpit.service.test.ts para acessar internals do service.

function buildCompanyRow(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 42,
    name: 'ACME',
    slug: 'acme',
    companyKind: 'tenant',
    status: 'active',
    isActive: true,
    paymentMethod: 'PIX',
    selectedPlanKey: 'hbx_lite',
    trialEndsAt: null,
    billingGraceEndsAt: null,
    courtesyEndsAt: null,
    courtesyReason: null,
    ...overrides,
  };
}

function buildPrismaMock(opts: { companies?: any[] } = {}) {
  const masterEventRows: any[] = [];
  const companies = opts.companies || [buildCompanyRow()];
  return {
    masterEventRows,
    prisma: {
      company: {
        findMany: async () => companies,
      },
      financeiroCharge: {
        findFirst: async () => null, // sem webhook ainda — checkBillingStale não alerta
      },
      radarLeadPool: {
        findFirst: async () => null, // sem lead ainda — checkFactoryStalled não alerta
      },
      masterEvent: {
        // Dedup real: emitMasterEvent consulta o ÚLTIMO evento da dedupKey.
        findFirst: async (args: any) => {
          const key = args?.where?.dedupKey;
          const matches = masterEventRows.filter((r) => r.dedupKey === key);
          if (!matches.length) return null;
          return matches[matches.length - 1];
        },
        create: async (args: any) => {
          masterEventRows.push({ ...args.data, createdAt: new Date() });
          return args.data;
        },
        // Digest (Sprint 4): filtra por type IN [...] e createdAt >= since —
        // mock simples o bastante pra cobrir o comportamento real.
        findMany: async (args: any) => {
          const types: string[] = args?.where?.type?.in || [];
          const since: Date | undefined = args?.where?.createdAt?.gte;
          return masterEventRows
            .filter((r) => types.includes(r.type))
            .filter((r) => !since || new Date(r.createdAt).getTime() >= since.getTime())
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        },
      },
    },
  };
}

function buildWebwhatsMock(instances: any[] | null = null) {
  return { listMotorInstances: async () => instances };
}

function buildMasterAlertStub() {
  const routeCalls: any[] = [];
  const digestCalls: any[] = [];
  return {
    routeCalls,
    digestCalls,
    routeEvent: async (event: any) => {
      routeCalls.push(event);
      return { email: false, whatsapp: false, sino: false };
    },
    deliverDigest: async (input: any) => {
      digestCalls.push(input);
      return { email: true, whatsapp: true };
    },
  };
}

test('checkCompanyStateTransitions: mesmo estado em 2 ticks seguidos = 1 evento só (dedup)', async () => {
  const prismaMock = buildPrismaMock();
  const webwhats = buildWebwhatsMock(null);
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, webwhats as any, masterAlert as any);

  await (service as any).checkCompanyStateTransitions();
  await (service as any).checkCompanyStateTransitions();

  const events = prismaMock.masterEventRows.filter((e) => e.type === 'company.state_changed');
  assert.equal(events.length, 1);
  assert.equal(masterAlert.routeCalls.length, 1);
});

test('checkCompanyStateTransitions: estado MUDOU entre ticks = 2º evento é inserido e roteado', async () => {
  const company = buildCompanyRow({ status: 'trial' });
  const prismaMock = buildPrismaMock({ companies: [company] });
  const webwhats = buildWebwhatsMock(null);
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, webwhats as any, masterAlert as any);

  await (service as any).checkCompanyStateTransitions();
  // Empresa passou a overdue (mudança real de status persistido).
  company.status = 'overdue';
  await (service as any).checkCompanyStateTransitions();

  const events = prismaMock.masterEventRows.filter((e) => e.type === 'company.state_changed');
  assert.equal(events.length, 2);
  assert.equal(masterAlert.routeCalls.length, 2);
});

test('checkChips: motor null (desligado/indisponível) não alerta e não quebra', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  const webwhats = buildWebwhatsMock(null);
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, webwhats as any, masterAlert as any);

  await (service as any).checkChips();
  assert.equal(masterAlert.routeCalls.length, 0);
});

test('checkChips: chip que estava open e cai no tick seguinte = chip.dropped 1x (baseline reinicia sem alerta falso)', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  const masterAlert = buildMasterAlertStub();

  // 1º tick: motor devolve o chip OPEN (vira baseline, SEM alerta — não há "antes" pra comparar).
  let instances = [{ instance: { instanceName: 'company-7' }, connectionStatus: 'open' }];
  const webwhats = { listMotorInstances: async () => instances };
  const service = new MasterWatchService(prismaMock.prisma as any, webwhats as any, masterAlert as any);

  await (service as any).checkChips();
  assert.equal(masterAlert.routeCalls.length, 0);

  // 2º tick: chip sumiu da lista (caiu) → chip.dropped.
  instances = [];
  await (service as any).checkChips();
  assert.equal(masterAlert.routeCalls.length, 1);
  assert.equal(masterAlert.routeCalls[0].type, 'chip.dropped');
  assert.equal(masterAlert.routeCalls[0].companyId, 7);

  // 3º tick: continua caído — NÃO repete o evento (baseline já é "sem chip").
  await (service as any).checkChips();
  assert.equal(masterAlert.routeCalls.length, 1);
});

test('checkBillingStale: webhook recente (dentro da janela) não alerta', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  prismaMock.prisma.financeiroCharge.findFirst = async () => ({ lastWebhookAt: new Date() });
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

  await (service as any).checkBillingStale();
  assert.equal(masterAlert.routeCalls.length, 0);
});

test('checkBillingStale: webhook velho (> N horas) dispara billing.webhook_stale, dedup 24h', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  const oldDate = new Date(Date.now() - 7 * 60 * 60 * 1000); // 7h atrás > 6h default
  prismaMock.prisma.financeiroCharge.findFirst = async () => ({ lastWebhookAt: oldDate });
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

  await (service as any).checkBillingStale();
  await (service as any).checkBillingStale(); // 2º tick imediato — dentro da janela de dedup de 24h
  assert.equal(masterAlert.routeCalls.length, 1);
  assert.equal(masterAlert.routeCalls[0].type, 'billing.webhook_stale');
});

test('checkFactoryStalled: sem lead recente (> N horas) dispara factory.stalled', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  const oldDate = new Date(Date.now() - 13 * 60 * 60 * 1000); // 13h atrás > 12h default
  prismaMock.prisma.radarLeadPool.findFirst = async () => ({ lastSeenAt: oldDate });
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

  await (service as any).checkFactoryStalled();
  assert.equal(masterAlert.routeCalls.length, 1);
  assert.equal(masterAlert.routeCalls[0].type, 'factory.stalled');
});

test('runTick: 1 checagem que lança não derruba as outras 3 (best-effort isolado por checagem)', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  prismaMock.prisma.financeiroCharge.findFirst = async () => {
    throw new Error('banco caiu nesta checagem');
  };
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

  // runTick não deve lançar mesmo com uma das 4 checagens quebrando.
  await assert.doesNotReject(() => (service as any).runTick());
});

test('runTick: guard de tick-em-voo — 2ª chamada concorrente não roda checagens de novo', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  let companyFindManyCalls = 0;
  let release: (() => void) | null = null;
  prismaMock.prisma.company.findMany = async () => {
    companyFindManyCalls += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return [];
  };
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

  const p1 = (service as any).runTick();
  // dá tempo do primeiro tick pendurar no mock
  while (!release) await new Promise((r) => setTimeout(r, 5));
  const p2 = (service as any).runTick(); // deve devolver na hora (tickRunning=true)
  await p2;
  (release as unknown as () => void)();
  await p1;

  assert.equal(companyFindManyCalls, 1);
});

test('onModuleInit: HBX_MASTER_WATCH_ENABLED=false → zero ticks agendados (sem setInterval)', () => {
  const previous = process.env.HBX_MASTER_WATCH_ENABLED;
  process.env.HBX_MASTER_WATCH_ENABLED = 'false';
  try {
    const prismaMock = buildPrismaMock({ companies: [] });
    const masterAlert = buildMasterAlertStub();
    const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

    service.onModuleInit();
    assert.equal((service as any).tickTimer, null);
    service.onModuleDestroy();
  } finally {
    if (previous === undefined) delete process.env.HBX_MASTER_WATCH_ENABLED;
    else process.env.HBX_MASTER_WATCH_ENABLED = previous;
  }
});

test('onModuleInit: HBX_MASTER_WATCH_ENABLED=true → agenda o timer (clearInterval no destroy)', () => {
  const previous = process.env.HBX_MASTER_WATCH_ENABLED;
  process.env.HBX_MASTER_WATCH_ENABLED = 'true';
  try {
    const prismaMock = buildPrismaMock({ companies: [] });
    const masterAlert = buildMasterAlertStub();
    const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

    service.onModuleInit();
    assert.notEqual((service as any).tickTimer, null);
    service.onModuleDestroy();
    assert.equal((service as any).tickTimer, null);
  } finally {
    if (previous === undefined) delete process.env.HBX_MASTER_WATCH_ENABLED;
    else process.env.HBX_MASTER_WATCH_ENABLED = previous;
  }
});

test('onModuleInit: sem env definido e NODE_ENV != production → default OFF (zero ticks)', () => {
  const previousEnabled = process.env.HBX_MASTER_WATCH_ENABLED;
  const previousNodeEnv = process.env.NODE_ENV;
  delete process.env.HBX_MASTER_WATCH_ENABLED;
  (process.env as any).NODE_ENV = 'test';
  try {
    const prismaMock = buildPrismaMock({ companies: [] });
    const masterAlert = buildMasterAlertStub();
    const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

    service.onModuleInit();
    assert.equal((service as any).tickTimer, null);
  } finally {
    if (previousEnabled === undefined) delete process.env.HBX_MASTER_WATCH_ENABLED;
    else process.env.HBX_MASTER_WATCH_ENABLED = previousEnabled;
    if (previousNodeEnv === undefined) delete (process.env as any).NODE_ENV;
    else (process.env as any).NODE_ENV = previousNodeEnv;
  }
});

// ── Digest diário (Sprint 4) ────────────────────────────────────────────────
// checkDailyDigest depende de "agora" (janela 08:00–08:30 America/Sao_Paulo).
// Em vez de mockar Date/Intl (frágil), sobrescrevemos os 2 helpers privados
// que encapsulam "agora" (isWithinDigestWindow/saoPauloDateKey) — mesmo padrão
// já usado no arquivo para overviewCache.at do master-cockpit: acessar/mutar
// internals via `as any` é o jeito estabelecido de controlar tempo nos testes
// desta base (não há relógio injetável nem @nestjs/schedule).

test('checkDailyDigest: fora da janela nunca dispara (nem consulta eventos)', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);
  (service as any).isWithinDigestWindow = () => false;

  await (service as any).checkDailyDigest();

  assert.equal(masterAlert.digestCalls.length, 0);
  assert.equal(prismaMock.masterEventRows.filter((e) => e.type === 'digest.sent').length, 0);
});

test('checkDailyDigest: dentro da janela sem NENHUM evento acumulado não envia nada', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);
  (service as any).isWithinDigestWindow = () => true;
  (service as any).saoPauloDateKey = () => '2026-07-02';

  await (service as any).checkDailyDigest();

  assert.equal(masterAlert.digestCalls.length, 0);
  // Silêncio total: nem marca o dia (contrato — "sem evento acumulado = nada enviado").
  assert.equal(prismaMock.masterEventRows.filter((e) => e.type === 'digest.sent').length, 0);
});

test('checkDailyDigest: dentro da janela COM eventos digest acumulados envia 1x e só 1x (dedup por dia)', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  // 2 eventos digest:true das últimas 24h + 1 evento SEM rota digest (não deve entrar no resumo).
  prismaMock.masterEventRows.push(
    { type: 'company.state_changed', companyId: 42, dedupKey: 'company-state:42', payloadJson: JSON.stringify({ state: 'overdue' }), createdAt: new Date() },
    { type: 'factory.stalled', companyId: null, dedupKey: 'factory-stalled', payloadJson: JSON.stringify({ state: 'stalled' }), createdAt: new Date() },
    { type: 'chip.dropped', companyId: 7, dedupKey: 'chip:7:company-7', payloadJson: null, createdAt: new Date() }, // não é digest — ignorado
  );
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);
  (service as any).isWithinDigestWindow = () => true;
  (service as any).saoPauloDateKey = () => '2026-07-02';

  await (service as any).checkDailyDigest();
  // 2º tick no MESMO dia/janela — dedup barra a 2ª entrega.
  await (service as any).checkDailyDigest();

  assert.equal(masterAlert.digestCalls.length, 1);
  const { subject, text } = masterAlert.digestCalls[0];
  assert.match(subject, /2026-07-02/);
  assert.match(text, /Empresas que mudaram de estado comercial: 1/);
  assert.match(text, /Fábrica de leads parada: 1/);
  assert.doesNotMatch(text, /chip\.dropped/);

  const digestMarks = prismaMock.masterEventRows.filter((e) => e.type === 'digest.sent');
  assert.equal(digestMarks.length, 1); // só 1 marca de dia inserida, mesmo com 2 chamadas
});

test('checkDailyDigest: dia SEGUINTE dentro da janela dispara de novo (dedup é por dia, não permanente)', async () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  prismaMock.masterEventRows.push({
    type: 'factory.stalled',
    companyId: null,
    dedupKey: 'factory-stalled',
    payloadJson: JSON.stringify({ state: 'stalled' }),
    createdAt: new Date(),
  });
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);
  (service as any).isWithinDigestWindow = () => true;

  (service as any).saoPauloDateKey = () => '2026-07-02';
  await (service as any).checkDailyDigest();
  assert.equal(masterAlert.digestCalls.length, 1);

  (service as any).saoPauloDateKey = () => '2026-07-03';
  await (service as any).checkDailyDigest();
  assert.equal(masterAlert.digestCalls.length, 2);
});

test('checkDailyDigest: zap do digest respeita o teto diário do roteador (deliverDigest recusa o 11º zap)', async () => {
  // Este teste cobre o CONTRATO (deliverDigest reusa o mesmo contador do
  // roteador) usando o MasterAlertService REAL — não o stub — para provar
  // que o teto de MASTER_ALERT_MAX_WHATSAPP_PER_DAY também vale pro digest.
  const { MasterAlertService: RealMasterAlertService } = await import('./master-alert.service');
  const { MASTER_ALERT_MAX_WHATSAPP_PER_DAY } = await import('./master-alert.routes');

  const mailCalls: any[] = [];
  const waCalls: any[] = [];
  const mail = { sendMail: async (input: any) => { mailCalls.push(input); return { ok: true }; } };
  const webwhats = {
    sendText: async (companyId: number, input: any) => { waCalls.push({ companyId, ...input }); return { target: input.to, providerMessageId: 'msg-x' }; },
    listMotorInstances: async () => null,
  };
  const prisma = {
    user: { findFirst: async () => ({ email: 'dono@hbx.test' }) },
    masterPaymentNotificationLog: { create: async () => ({}) },
  };
  const previousTo = process.env.MASTER_ALERT_WHATSAPP_TO;
  const previousCompany = process.env.MASTER_ALERT_WA_COMPANY_ID;
  process.env.MASTER_ALERT_WHATSAPP_TO = '19999999999';
  process.env.MASTER_ALERT_WA_COMPANY_ID = '7';
  try {
    const realAlert = new RealMasterAlertService(prisma as any, mail as any, webwhats as any);

    // Estoura o teto diário de zap via rota comum (chip.dropped), depois o
    // digest tenta mandar o dele — deve cair pra "só email".
    for (let i = 0; i < MASTER_ALERT_MAX_WHATSAPP_PER_DAY; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await realAlert.routeEvent({
        type: 'chip.dropped',
        severity: 'action_required',
        companyId: 100 + i,
        dedupKey: `chip:${100 + i}:company-${100 + i}`,
        subject: `Chip caiu ${i}`,
        text: `texto ${i}`,
      });
    }
    assert.equal(waCalls.length, MASTER_ALERT_MAX_WHATSAPP_PER_DAY);

    const digestResult = await realAlert.deliverDigest({ subject: 'Resumo diário', text: 'corpo do resumo' });
    assert.equal(digestResult.email, true);
    assert.equal(digestResult.whatsapp, false); // teto já estourado pelos alertas do dia
    assert.equal(waCalls.length, MASTER_ALERT_MAX_WHATSAPP_PER_DAY); // não cresceu
    assert.equal(mailCalls.length, MASTER_ALERT_MAX_WHATSAPP_PER_DAY + 1); // email do digest foi
  } finally {
    if (previousTo === undefined) delete process.env.MASTER_ALERT_WHATSAPP_TO;
    else process.env.MASTER_ALERT_WHATSAPP_TO = previousTo;
    if (previousCompany === undefined) delete process.env.MASTER_ALERT_WA_COMPANY_ID;
    else process.env.MASTER_ALERT_WA_COMPANY_ID = previousCompany;
  }
});

test('saoPauloHourMinute/saoPauloDateKey: bate com o cálculo direto via Intl para America/Sao_Paulo (sem UTC-3 hardcoded)', () => {
  const prismaMock = buildPrismaMock({ companies: [] });
  const masterAlert = buildMasterAlertStub();
  const service = new MasterWatchService(prismaMock.prisma as any, buildWebwhatsMock(null) as any, masterAlert as any);

  const { hour, minute } = (service as any).saoPauloHourMinute();
  const dayKey = (service as any).saoPauloDateKey();

  const expectedParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const expectedHour = Number(expectedParts.find((p) => p.type === 'hour')?.value ?? '0');
  const expectedMinute = Number(expectedParts.find((p) => p.type === 'minute')?.value ?? '0');
  const expectedDayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  assert.equal(hour, expectedHour);
  // minute pode divergir por até 1 min entre as duas chamadas (execução não é instantânea) — folga de 1.
  assert.ok(Math.abs(minute - expectedMinute) <= 1);
  assert.equal(dayKey, expectedDayKey);
});

// Import de MasterAlertService só para garantir que o tipo real (não o stub)
// segue satisfazendo a superfície usada pelo watcher (routeEvent) — pega
// dessincronia de assinatura em tempo de compilação (tsc --noEmit), não aqui.
void MasterAlertService;
