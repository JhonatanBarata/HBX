import test from 'node:test';
import assert from 'node:assert/strict';
import { NfseEmitterService } from './nfse-emitter.service';

// ===========================================================================
// ACEITE — CONTABIL S6 (nfse-emitter). SEM banco e SEM rede: FakePrisma
// in-memory (superfície de FiscalInvoice/FiscalProfile/FiscalRevenueMonth/
// Company + $queryRaw do ledger MP×FinanceiroCharge) + fakes de cert/client/
// alert/automationLog. Exercita: idempotência (mesmo pagamento não vira 2 notas),
// dedução de estorno, disjuntor (3 ERROs seguidos pausam a fila + alerta, sem 4ª),
// e o gate da flag OFF (deploy inerte). Nenhuma chamada externa é feita.
// ===========================================================================

let idSeq = 0;

class FakePrisma {
  invoices: any[] = [];
  revenues: any[] = [];
  profiles: any[] = [{ id: 1, cnpj: '12.345.678/0001-90', razaoSocial: 'HBX Sistemas LTDA', certA1Encrypted: '{}' }];
  companies: any[] = [{ id: 42, name: 'Cliente HBX', taxDocument: '98.765.432/0001-99' }];
  mpRows: any[] = [];

  async $executeRawUnsafe() { return 0; }

  async $queryRaw() {
    // Emissor lê linhas cruas do ledger (com refundAmountReais do JOIN).
    return this.mpRows.map((r) => ({
      id: r.id,
      companyId: r.companyId ?? 42,
      competence: r.competence,
      amount: r.amount,
      status: r.status ?? 'APPROVED',
      referenceLabel: r.referenceLabel ?? null,
      refundAmountReais: r.refundAmountReais ?? 0,
    })) as any;
  }

  fiscalInvoice = {
    findUnique: async ({ where }: any) => {
      if (where.paymentRefId) return this.invoices.find((i) => i.paymentRefId === where.paymentRefId) ?? null;
      if (where.id) return this.invoices.find((i) => i.id === where.id) ?? null;
      return null;
    },
    findMany: async ({ where, take }: any = {}) => {
      let rows = this.invoices.slice();
      if (where?.competencia !== undefined) rows = rows.filter((i) => i.competencia === where.competencia);
      if (where?.status !== undefined) {
        if (typeof where.status === 'string') rows = rows.filter((i) => i.status === where.status);
        else if (where.status.in) rows = rows.filter((i) => where.status.in.includes(i.status));
      }
      if (where?.tentativas?.lt !== undefined) rows = rows.filter((i) => Number(i.tentativas || 0) < where.tentativas.lt);
      rows = rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      return take ? rows.slice(0, take) : rows;
    },
    create: async ({ data }: any) => {
      const row = { id: `inv_${++idSeq}`, status: 'PENDENTE', tentativas: 0, chaveAcesso: null, numeroDps: null, xmlGzB64: null, erroMsg: null, emitidaEm: null, createdAt: new Date(Date.now() + idSeq), updatedAt: new Date(), ...data };
      this.invoices.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.invoices.find((i) => i.id === where.id);
      if (!row) throw new Error(`invoice ${where.id} not found`);
      Object.assign(row, data);
      return row;
    },
  };

  fiscalProfile = {
    findUnique: async ({ where }: any) => this.profiles.find((p) => p.id === where.id) ?? null,
  };

  fiscalRevenueMonth = {
    findUnique: async ({ where }: any) => this.revenues.find((r) => r.competencia === where.competencia) ?? null,
    update: async ({ where, data }: any) => {
      const row = this.revenues.find((r) => r.competencia === where.competencia);
      if (row) Object.assign(row, data);
      return row;
    },
  };

  company = {
    findUnique: async ({ where }: any) => this.companies.find((c) => c.id === where.id) ?? null,
  };
}

class FakeCert {
  async getSigningMaterial() { return { certPem: 'CERT', keyPem: 'KEY' }; }
}

class FakeAlert {
  calls: any[] = [];
  async fiscalObligationAlert(input: any) { this.calls.push(input); return { email: true, whatsapp: true }; }
}

class FakeAutomationLog {
  entries: any[] = [];
  async registrar(input: any) { this.entries.push(input); }
}

/** Cliente NFS-e fake: cada emissão devolve o próximo resultado programado. */
class FakeClient {
  results: Array<{ ok: boolean; chaveAcesso?: string; httpStatus?: number; erro?: string }> = [];
  emitidos = 0;
  async emitir() {
    const r = this.results[this.emitidos] ?? { ok: true, chaveAcesso: '3'.repeat(50), httpStatus: 200 };
    this.emitidos += 1;
    return {
      result: { ok: r.ok, chaveAcesso: r.ok ? (r.chaveAcesso ?? '3'.repeat(50)) : null, httpStatus: r.httpStatus ?? (r.ok ? 200 : 500), xmlRetornoGzB64: null, erro: r.ok ? null : (r.erro ?? 'HTTP 500') },
      xmlAssinado: '<DPS>...</DPS>',
    };
  }
  montarPayload() { return '{"dpsXmlGZipB64":"x"}'; }
}

function makeService(over: { client?: FakeClient } = {}) {
  const prisma = new FakePrisma();
  const cert = new FakeCert();
  const client = over.client ?? new FakeClient();
  const alert = new FakeAlert();
  const log = new FakeAutomationLog();
  const svc = new NfseEmitterService(prisma as any, cert as any, client as any, alert as any, log as any);
  return { svc, prisma, cert, client, alert, log };
}

// ---------------------------------------------------------------------------
// INDEXAÇÃO + IDEMPOTÊNCIA — 1 FiscalInvoice por pagamento; 2ª passada não duplica.
// ---------------------------------------------------------------------------

test('indexar — cria 1 FiscalInvoice PENDENTE por pagamento aprovado', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', amount: 5000, status: 'APPROVED' },
    { id: 'mp_2', competence: '2026-07', amount: 3000, status: 'APPROVED' },
  ];
  const criadas = await svc.indexarCompetencia('2026-07');
  assert.equal(criadas, 2);
  assert.equal(prisma.invoices.length, 2);
  assert.equal(prisma.invoices[0].status, 'PENDENTE');
  assert.equal(prisma.invoices[0].valorCents, 5_000_00);
  assert.equal(prisma.invoices[0].tomadorNome, 'Cliente HBX', 'tomador resolvido da Company');
});

test('indexar — idempotente: mesmo pagamento NÃO gera 2 FiscalInvoice', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', amount: 5000, status: 'APPROVED' }];
  await svc.indexarCompetencia('2026-07');
  const segunda = await svc.indexarCompetencia('2026-07');
  assert.equal(segunda, 0, '2ª passada não cria nada');
  assert.equal(prisma.invoices.length, 1, 'segue com 1 única nota');
});

// ---------------------------------------------------------------------------
// DEDUÇÃO DE ESTORNO — valor da nota é LÍQUIDO; 100% estornado não vira nota.
// ---------------------------------------------------------------------------

test('indexar — deduz o estorno do valor da nota (líquido)', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', amount: 5000, status: 'PARTIALLY_REFUNDED', refundAmountReais: 2000 }];
  await svc.indexarCompetencia('2026-07');
  assert.equal(prisma.invoices.length, 1);
  assert.equal(prisma.invoices[0].valorCents, 3_000_00, 'R$5000 − R$2000 estornado = R$3000');
});

test('indexar — pagamento 100% estornado NÃO vira nota', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [{ id: 'mp_1', competence: '2026-07', amount: 5000, status: 'REFUNDED', refundAmountReais: 5000 }];
  const criadas = await svc.indexarCompetencia('2026-07');
  assert.equal(criadas, 0);
  assert.equal(prisma.invoices.length, 0, 'nada a faturar em pagamento totalmente estornado');
});

// ---------------------------------------------------------------------------
// FLAG OFF — emissão inerte (deploy sem risco).
// ---------------------------------------------------------------------------

test('emitirPendentes — flag OFF: não toca a fila nem a rede (puladoFlagOff)', async () => {
  delete process.env.HBX_CONTABIL_NFSE_ENABLED;
  const { svc, prisma, client } = makeService();
  prisma.invoices.push({ id: 'inv_x', paymentRefId: 'mp_1', competencia: '2026-07', companyId: 42, valorCents: 5_000_00, status: 'PENDENTE', tentativas: 0, createdAt: new Date() });
  const r = await svc.emitirPendentes();
  assert.equal(r.puladoFlagOff, true);
  assert.equal(r.emitidas, 0);
  assert.equal(client.emitidos, 0, 'cliente NFS-e nem foi chamado com a flag OFF');
});

// ---------------------------------------------------------------------------
// EMISSÃO — sucesso marca EMITIDA + chave + receitaNotasCents; grava trilha.
// ---------------------------------------------------------------------------

test('emitirPendentes — sucesso: nota vira EMITIDA com chave, espelha receitaNotasCents e loga trilha', async () => {
  process.env.HBX_CONTABIL_NFSE_ENABLED = '1';
  const { svc, prisma, log } = makeService();
  prisma.revenues.push({ competencia: '2026-07', receitaNotasCents: 0 });
  prisma.invoices.push({ id: 'inv_1', paymentRefId: 'mp_1', competencia: '2026-07', companyId: 42, tomadorNome: 'Cliente HBX', tomadorDoc: '98765432000199', valorCents: 5_000_00, status: 'PENDENTE', tentativas: 0, createdAt: new Date() });

  const r = await svc.emitirPendentes();
  assert.equal(r.emitidas, 1);
  assert.equal(prisma.invoices[0].status, 'EMITIDA');
  assert.equal(prisma.invoices[0].chaveAcesso, '3'.repeat(50));
  assert.equal(prisma.revenues[0].receitaNotasCents, 5_000_00, 'receitaNotasCents espelhada');
  const okLog = log.entries.find((e) => e.sistema === 'NFSE' && e.sucesso);
  assert.ok(okLog, 'trilha de auditoria gravada');
  assert.ok(!okLog.requestResumo.includes('KEY') && !okLog.requestResumo.includes('CERT'), 'resumo sem segredo');
  delete process.env.HBX_CONTABIL_NFSE_ENABLED;
});

// ---------------------------------------------------------------------------
// RETRY — falha reprocessável mantém PENDENTE até MAX; na 3ª vira ERRO + alerta.
// ---------------------------------------------------------------------------

test('emitirPendentes — retry: falha 1x deixa PENDENTE (tentativas=1); estoura em 3 → ERRO + alerta', async () => {
  process.env.HBX_CONTABIL_NFSE_ENABLED = '1';
  // Cliente sempre falha.
  const client = new FakeClient();
  client.results = Array(5).fill({ ok: false, httpStatus: 500, erro: 'HTTP 500' });
  const { svc, prisma, alert } = makeService({ client });
  prisma.invoices.push({ id: 'inv_1', paymentRefId: 'mp_1', competencia: '2026-07', companyId: 42, valorCents: 5_000_00, status: 'PENDENTE', tentativas: 0, createdAt: new Date() });

  // 1ª rodada: 1 falha → PENDENTE tentativas=1 (ainda reprocessável).
  await svc.emitirPendentes();
  assert.equal(prisma.invoices[0].status, 'PENDENTE');
  assert.equal(prisma.invoices[0].tentativas, 1);

  // 2ª rodada: tentativas=2, ainda PENDENTE.
  await svc.emitirPendentes();
  assert.equal(prisma.invoices[0].tentativas, 2);
  assert.equal(prisma.invoices[0].status, 'PENDENTE');

  // 3ª rodada: tentativas=3 = MAX → ERRO + alerta ao dono.
  await svc.emitirPendentes();
  assert.equal(prisma.invoices[0].tentativas, 3);
  assert.equal(prisma.invoices[0].status, 'ERRO');
  assert.ok(alert.calls.some((c) => c.tipo === 'NFSE_ERRO'), 'alertou o dono do erro definitivo');

  // 4ª rodada: já ERRO com tentativas=MAX → fora da fila (não reprocessa).
  const r4 = await svc.emitirPendentes();
  assert.equal(r4.emitidas + r4.falhas, 0, 'nota em ERRO/MAX não é mais reprocessada');
  delete process.env.HBX_CONTABIL_NFSE_ENABLED;
});

// ---------------------------------------------------------------------------
// DISJUNTOR — 3 ERROs (definitivos) CONSECUTIVOS pausam a fila + alertam, sem 4ª.
// ---------------------------------------------------------------------------

test('emitirPendentes — DISJUNTOR: 3 erros seguidos PAUSAM a fila e alertam, sem tentar a 4ª', async () => {
  process.env.HBX_CONTABIL_NFSE_ENABLED = '1';
  // Cliente sempre falha; 4 notas na fila, cada uma já em tentativas=2 (a próxima
  // falha as manda direto p/ ERRO → 3 ERROs consecutivos abrem o disjuntor).
  const client = new FakeClient();
  client.results = Array(10).fill({ ok: false, httpStatus: 500, erro: 'HTTP 500' });
  const { svc, prisma, alert } = makeService({ client });
  for (let i = 1; i <= 4; i++) {
    prisma.invoices.push({ id: `inv_${i}`, paymentRefId: `mp_${i}`, competencia: '2026-07', companyId: 42, valorCents: 1_000_00, status: 'PENDENTE', tentativas: 2, createdAt: new Date(Date.now() + i) });
  }

  const r = await svc.emitirPendentes();
  assert.equal(r.disjuntorAbriu, true, 'disjuntor abriu com 3 erros consecutivos');
  assert.equal(client.emitidos, 3, 'PAROU na 3ª falha — a 4ª nota NÃO foi tentada');
  assert.ok(alert.calls.some((c) => c.tipo === 'NFSE_DISJUNTOR'), 'alertou o dono da abertura do disjuntor');
  // A 4ª nota segue intacta (não foi martelada).
  const quarta = prisma.invoices.find((i) => i.id === 'inv_4');
  assert.equal(quarta.status, 'PENDENTE', '4ª nota preservada (fila pausada antes dela)');
  assert.equal(quarta.tentativas, 2, '4ª nota não teve tentativa incrementada');
  delete process.env.HBX_CONTABIL_NFSE_ENABLED;
});

test('emitirPendentes — sucesso RESETA o disjuntor (2 erros + 1 sucesso + 2 erros não abre)', async () => {
  process.env.HBX_CONTABIL_NFSE_ENABLED = '1';
  const client = new FakeClient();
  // erro, erro, sucesso, erro, erro → nunca 3 seguidos.
  client.results = [
    { ok: false, httpStatus: 500 }, { ok: false, httpStatus: 500 },
    { ok: true, chaveAcesso: '3'.repeat(50) },
    { ok: false, httpStatus: 500 }, { ok: false, httpStatus: 500 },
  ];
  const { svc, prisma } = makeService({ client });
  for (let i = 1; i <= 5; i++) {
    prisma.invoices.push({ id: `inv_${i}`, paymentRefId: `mp_${i}`, competencia: '2026-07', companyId: 42, valorCents: 1_000_00, status: 'PENDENTE', tentativas: 2, createdAt: new Date(Date.now() + i) });
  }
  const r = await svc.emitirPendentes();
  assert.equal(r.disjuntorAbriu, false, 'sucesso no meio reseta o contador — disjuntor não abre');
  assert.equal(client.emitidos, 5, 'processou as 5 (nunca 3 erros seguidos)');
  delete process.env.HBX_CONTABIL_NFSE_ENABLED;
});

// ---------------------------------------------------------------------------
// RECONCILIAÇÃO — pagamentos × notas; semNota (🔴) + divergência caixa×notas.
// ---------------------------------------------------------------------------

test('reconciliar — separa emitidas × sem nota e calcula a divergência caixa×notas', async () => {
  const { svc, prisma } = makeService();
  prisma.mpRows = [
    { id: 'mp_1', competence: '2026-07', amount: 5000, status: 'APPROVED' },
    { id: 'mp_2', competence: '2026-07', amount: 3000, status: 'APPROVED' },
  ];
  // Uma já emitida, a outra ainda pendente.
  prisma.invoices.push(
    { id: 'inv_1', paymentRefId: 'mp_1', competencia: '2026-07', companyId: 42, tomadorNome: 'A', valorCents: 5_000_00, status: 'EMITIDA', tentativas: 1, createdAt: new Date() },
  );
  const rec = await svc.reconciliar('2026-07');
  assert.equal(rec.totalPagamentos, 2, 'indexou o mp_2 faltante');
  assert.equal(rec.emitidas, 1);
  assert.equal(rec.pendentes, 1);
  assert.equal(rec.receitaNotasCents, 5_000_00);
  assert.equal(rec.receitaFaturavelCents, 8_000_00);
  assert.equal(rec.divergenciaCents, 3_000_00, 'R$3000 de caixa ainda sem nota');
  assert.equal(rec.semNota.length, 1);
  assert.equal(rec.semNota[0].paymentRefId, 'mp_2');
});
