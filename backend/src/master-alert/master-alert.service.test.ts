import test from 'node:test';
import assert from 'node:assert/strict';

import { MasterAlertService } from './master-alert.service';
import { MASTER_ALERT_MAX_WHATSAPP_PER_DAY } from './master-alert.routes';

// Cobre o roteador (Sprint 3): throttle por type+dedupKey, teto duro de
// zaps/dia, digest não dispara zap/e-mail na hora, e os 3 alertas legados
// seguem entregando IGUAL ao Sprint 1 (email+zap+log imediato) via routeEvent.

function buildPrismaMock() {
  const masterEventCreateCalls: any[] = [];
  const masterNoticeCalls: any[] = [];
  const logCalls: any[] = [];
  return {
    masterEventCreateCalls,
    masterNoticeCalls,
    logCalls,
    prisma: {
      masterEvent: {
        findFirst: async () => null, // sem dedupKey duplicado — cada emit insere
        create: async (args: any) => {
          masterEventCreateCalls.push(args);
          return args;
        },
      },
      masterPaymentNotificationLog: {
        create: async (args: any) => {
          logCalls.push(args);
          return args;
        },
      },
      user: {
        findFirst: async () => ({ email: 'dono@hbx.test' }),
      },
      // pushMasterNotice usa $queryRaw/$executeRaw (raw tagged template).
      $queryRaw: async () => {
        return [];
      },
      $executeRaw: async (..._args: any[]) => {
        masterNoticeCalls.push(_args);
        return 1;
      },
    },
  };
}

function buildMailMock(opts: { ok?: boolean } = {}) {
  const calls: any[] = [];
  return {
    calls,
    mail: {
      sendMail: async (input: any) => {
        calls.push(input);
        return { ok: opts.ok !== false };
      },
    },
  };
}

function buildWebwhatsMock(opts: { ok?: boolean } = {}) {
  const calls: any[] = [];
  return {
    calls,
    webwhats: {
      sendText: async (companyId: number, input: any) => {
        calls.push({ companyId, ...input });
        if (opts.ok === false) throw new Error('sem sessão');
        return { target: input.to, providerMessageId: 'msg-1' };
      },
    },
  };
}

function buildService(overrides: { prisma?: any; mail?: any; webwhats?: any } = {}) {
  const prismaMock = overrides.prisma || buildPrismaMock();
  const mailMock = overrides.mail || buildMailMock();
  const webwhatsMock = overrides.webwhats || buildWebwhatsMock();
  const service = new MasterAlertService(
    prismaMock.prisma as any,
    mailMock.mail as any,
    webwhatsMock.webwhats as any,
  );
  return { service, prismaMock, mailMock, webwhatsMock };
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve(fn()).finally(() => {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test('routeEvent: rota email+whatsapp entrega nos 2 canais (MASTER_ALERT_WA_COMPANY_ID configurado)', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const { service, mailMock, webwhatsMock } = buildService();
    const result = await service.routeEvent({
      type: 'chip.dropped',
      severity: 'action_required',
      companyId: 7,
      dedupKey: 'chip:7:company-7',
      payload: { state: 'closed' },
      subject: 'Chip caiu',
      text: 'texto do alerta',
    });
    assert.equal(result.email, true);
    assert.equal(result.whatsapp, true);
    assert.equal(mailMock.calls.length, 1);
    assert.equal(webwhatsMock.calls.length, 1);
  });
});

test('routeEvent: throttle do roteador — 2ª chamada dentro da janela NÃO entrega de novo', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const { service, mailMock, webwhatsMock } = buildService();
    const event = {
      type: 'chip.dropped', // throttle 60 min
      severity: 'action_required' as const,
      companyId: 7,
      dedupKey: 'chip:7:company-7',
      payload: { state: 'closed' },
      subject: 'Chip caiu',
      text: 'texto do alerta',
    };
    const first = await service.routeEvent(event);
    const second = await service.routeEvent(event);

    assert.equal(first.email, true);
    assert.equal(first.whatsapp, true);
    // 2ª chamada throttled: nenhuma entrega nova em nenhum canal.
    assert.equal(second.email, false);
    assert.equal(second.whatsapp, false);
    assert.equal(mailMock.calls.length, 1);
    assert.equal(webwhatsMock.calls.length, 1);
  });
});

test('routeEvent: throttle é POR dedupKey — dedupKey diferente entrega normalmente mesmo com o mesmo type', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const { service, mailMock } = buildService();
    await service.routeEvent({
      type: 'chip.dropped',
      severity: 'action_required',
      companyId: 7,
      dedupKey: 'chip:7:company-7',
      subject: 'Chip caiu A',
      text: 'texto A',
    });
    await service.routeEvent({
      type: 'chip.dropped',
      severity: 'action_required',
      companyId: 8,
      dedupKey: 'chip:8:company-8',
      subject: 'Chip caiu B',
      text: 'texto B',
    });
    assert.equal(mailMock.calls.length, 2);
  });
});

test('routeEvent: digest:true NÃO dispara email/zap na hora (fica pro Sprint 4) mas sino roda', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const { service, mailMock, webwhatsMock, prismaMock } = buildService();
    const result = await service.routeEvent({
      type: 'factory.stalled', // digest: true
      severity: 'attention',
      companyId: 3,
      dedupKey: 'factory-stalled',
      payload: { stalledHours: 12 },
    });
    assert.equal(result.email, false);
    assert.equal(result.whatsapp, false);
    assert.equal(mailMock.calls.length, 0);
    assert.equal(webwhatsMock.calls.length, 0);
    // company.state_changed/factory.stalled com companyId>0 tentam sino — aqui
    // usamos factory (sem sino na rota) só para confirmar que email/zap ficaram mudos.
    assert.equal(prismaMock.masterNoticeCalls.length, 0);
  });
});

test('routeEvent: company.state_changed (digest + sino) acende o sino sem disparar zap', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const { service, mailMock, webwhatsMock, prismaMock } = buildService();
    const result = await service.routeEvent({
      type: 'company.state_changed',
      severity: 'action_required',
      companyId: 42,
      dedupKey: 'company-state:42',
      payload: { state: 'overdue', statusLabel: 'Em atraso' },
    });
    assert.equal(result.whatsapp, false);
    assert.equal(mailMock.calls.length, 0);
    assert.equal(webwhatsMock.calls.length, 0);
    assert.equal(result.sino, true);
    assert.equal(prismaMock.masterNoticeCalls.length, 1);
  });
});

test('routeEvent: teto duro de zaps/dia — a partir do 11º evento zap-capaz, só email+sino', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const { service, mailMock, webwhatsMock } = buildService();
    // dedupKey único por chamada (senão o throttle de 60min do chip.dropped barra a 2ª).
    for (let i = 0; i < MASTER_ALERT_MAX_WHATSAPP_PER_DAY; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const result = await service.routeEvent({
        type: 'chip.dropped',
        severity: 'action_required',
        companyId: 100 + i,
        dedupKey: `chip:${100 + i}:company-${100 + i}`,
        subject: `Chip caiu ${i}`,
        text: `texto ${i}`,
      });
      assert.equal(result.whatsapp, true, `evento ${i} deveria mandar zap (dentro do teto)`);
    }
    assert.equal(webwhatsMock.calls.length, MASTER_ALERT_MAX_WHATSAPP_PER_DAY);

    // 11º evento zap-capaz do dia: teto estourado — só email (+sino), SEM zap.
    const overCap = await service.routeEvent({
      type: 'chip.dropped',
      severity: 'action_required',
      companyId: 999,
      dedupKey: 'chip:999:company-999',
      subject: 'Chip caiu 11',
      text: 'texto 11',
    });
    assert.equal(overCap.whatsapp, false);
    assert.equal(overCap.email, true);
    assert.equal(webwhatsMock.calls.length, MASTER_ALERT_MAX_WHATSAPP_PER_DAY); // não cresceu
    assert.equal(mailMock.calls.length, MASTER_ALERT_MAX_WHATSAPP_PER_DAY + 1); // email continuou indo
  });
});

test('routeEvent: falha do canal (webwhats lança) não derruba o roteamento (best-effort)', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const webwhatsMock = buildWebwhatsMock({ ok: false });
    const { service, mailMock } = buildService({ webwhats: webwhatsMock });
    const result = await service.routeEvent({
      type: 'chip.dropped',
      severity: 'action_required',
      companyId: 5,
      dedupKey: 'chip:5:company-5',
      subject: 'Chip caiu',
      text: 'texto',
    });
    assert.equal(result.whatsapp, false);
    assert.equal(result.email, true); // email não é afetado pela falha do zap
    assert.equal(mailMock.calls.length, 1);
  });
});

test('routeEvent: erro interno inesperado nunca lança (contrato best-effort)', async () => {
  const brokenPrisma = {
    masterEvent: { findFirst: async () => null, create: async () => ({}) },
    masterPaymentNotificationLog: { create: async () => ({}) },
    user: {
      findFirst: async () => {
        throw new Error('banco caiu');
      },
    },
    $queryRaw: async () => {
      throw new Error('banco caiu');
    },
    $executeRaw: async () => {
      throw new Error('banco caiu');
    },
  };
  const mailMock = buildMailMock();
  const webwhatsMock = buildWebwhatsMock();
  const service = new MasterAlertService(brokenPrisma as any, mailMock.mail as any, webwhatsMock.webwhats as any);

  const result = await service.routeEvent({
    type: 'chip.dropped',
    severity: 'action_required',
    companyId: 1,
    dedupKey: 'chip:1:company-1',
    subject: 'x',
    text: 'y',
  });
  assert.deepEqual(result, { email: false, whatsapp: false, sino: false });
});

test('notifyImplantacaoSold: comportamento observável IDÊNTICO ao Sprint 1 (email+zap+log imediato)', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: '7', MASTER_ALERT_WHATSAPP_TO: '19999999999' }, async () => {
    const { service, mailMock, webwhatsMock, prismaMock } = buildService();
    const result = await service.notifyImplantacaoSold({
      companyId: 55,
      customerName: 'Cliente X',
      sellerName: 'Vendedor Y',
      setupValue: 500,
      monthlyValue: 200,
    });
    assert.equal(result.email, true);
    assert.equal(result.whatsapp, true);
    assert.equal(mailMock.calls.length, 1);
    assert.equal(webwhatsMock.calls.length, 1);
    // log SEMPRE presente (registro do "card de implantação a fazer") + o log do canal email/whatsapp.
    assert.ok(prismaMock.logCalls.length >= 1);
  });
});

test('notifyBotConfigMissing: warnMissingChannels false preservado (sem env de whatsapp = sem warn, mas ainda entrega email)', async () => {
  await withEnv({ MASTER_ALERT_WA_COMPANY_ID: undefined, MASTER_ALERT_WHATSAPP_TO: undefined }, async () => {
    const { service, mailMock, webwhatsMock } = buildService();
    const result = await service.notifyBotConfigMissing({
      companyId: 9,
      companyName: 'ACME',
    });
    assert.equal(result.email, true);
    assert.equal(result.whatsapp, false); // sem MASTER_ALERT_WA_COMPANY_ID = sem envio
    assert.equal(mailMock.calls.length, 1);
    assert.equal(webwhatsMock.calls.length, 0);
  });
});
