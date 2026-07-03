import test from 'node:test';
import assert from 'node:assert/strict';
import { SerproAutopostService } from './serpro-autopost.service';

// ===========================================================================
// ACEITE — CONTABIL S7 (serpro-autopost). SEM banco e SEM rede: FakePrisma
// in-memory + fakes de revenueSync (motor)/cred/client/automationLog/alert.
// Exercita a LEI Nº1 no código:
//   - transmitir SEM confirmação "TRANSMITIR" → RECUSA (não chama o Serpro);
//   - transmitir com aprovadoPor vazio/'auto-flag' → RECUSA (nenhuma transmissão
//     anônima/automática);
//   - flag OFF / sem credencial → armar disponivel:false (fallback semi-auto);
//   - transmitir com tudo ok → declara+gera DAS+confere, estado TRANSMITIDO,
//     trilha SERPRO com aprovadoPor=userId e SEM segredo;
//   - DAS oficial ≠ nosso (±R$1) → estado REVISAR + alerta (disjuntor do S5);
//   - erro do Serpro → FALLBACK (não bloqueia; wizard cai no semi-auto).
// Nenhuma chamada externa é feita.
// ===========================================================================

const MES_OK = {
  competencia: '2026-07',
  receitaCaixaCents: 5_000_00,
  receitaNotasCents: 0,
  ajusteManualCents: 0,
  folhaMesCents: 1_500_00,
  rbt12Cents: 60_000_00,
  folha12mCents: 18_000_00,
  fatorR: 0.3,
  anexoAplicado: 'III',
  aliquotaEfetiva: 0.06,
  dasPrevistoCents: 300_00,
};

class FakePrisma {
  revenueMonths: any[] = [];
  obligations: any[] = [{ id: 'ob_pg', competencia: '2026-07', tipo: 'PGDASD', estado: 'PRONTO', resultJson: null }];
  ledger: any[] = [];

  fiscalRevenueMonth = {
    findMany: async ({ where }: any = {}) => {
      const pref = where?.competencia?.startsWith;
      return pref ? this.revenueMonths.filter((m) => m.competencia.startsWith(pref)) : this.revenueMonths.slice();
    },
  };
  fiscalObligation = {
    findUnique: async ({ where }: any) => {
      const k = where?.competencia_tipo;
      if (k) return this.obligations.find((o) => o.competencia === k.competencia && o.tipo === k.tipo) ?? null;
      return this.obligations.find((o) => o.id === where?.id) ?? null;
    },
    update: async ({ where, data }: any) => {
      const o = this.obligations.find((x) => x.id === where.id);
      if (o) Object.assign(o, data);
      return o;
    },
  };
  fiscalLedgerEntry = {
    findMany: async ({ where }: any = {}) => {
      let rows = this.ledger.slice();
      const pref = where?.competencia?.startsWith;
      if (pref) rows = rows.filter((r) => String(r.competencia).startsWith(pref));
      if (where?.tipo) rows = rows.filter((r) => r.tipo === where.tipo);
      if (where?.categoria) rows = rows.filter((r) => r.categoria === where.categoria);
      return rows;
    },
  };
}

class FakeRevenueSync {
  mes: any = { ...MES_OK };
  async syncCompetencia() { return this.mes; }
}
class FakeCred {
  configurado = true;
  async getStatus() { return { configurado: this.configurado }; }
  async getCredencial() {
    if (!this.configurado) throw new Error('sem credencial');
    return { consumerKey: 'K', consumerSecret: 'S', contratanteCnpj: '12345678000190', contribuinteCnpj: '12345678000190' };
  }
}
class FakeAutomationLog {
  entries: any[] = [];
  async registrar(input: any) { this.entries.push(input); }
}
class FakeAlert {
  calls: any[] = [];
  async fiscalObligationAlert(input: any) { this.calls.push(input); return { email: true, whatsapp: true }; }
}
class FakeClient {
  declararResp: any = { ok: true, httpStatus: 200, numeroRecibo: 'REC-1', dasApuradoCents: 300_00 };
  dasResp: any = { ok: true, httpStatus: 200, pdfBase64: 'JVBERi0=', numeroDocumento: 'DAS-1', valorTotalCents: 300_00 };
  consultarResp: any = { ok: true, httpStatus: 200, encontrada: true, numeroRecibo: 'REC-1', dasApuradoCents: 300_00 };
  declarouCom: any[] = [];
  gerouDas = 0;
  periodoApuracao(c: string) { return c.replace('-', ''); }
  async declararPgdasd(_cred: any, payload: any) { this.declarouCom.push(payload); return this.declararResp; }
  async gerarDas() { this.gerouDas += 1; return this.dasResp; }
  async consultarDeclaracao() { return this.consultarResp; }
  async consultarExtratoDas() { return { httpStatus: 200, ok: true, body: {} }; }
}

function makeService(over: { client?: FakeClient; cred?: FakeCred } = {}) {
  const prisma = new FakePrisma();
  const revenueSync = new FakeRevenueSync();
  const cred = over.cred ?? new FakeCred();
  const client = over.client ?? new FakeClient();
  const log = new FakeAutomationLog();
  const alert = new FakeAlert();
  const svc = new SerproAutopostService(prisma as any, revenueSync as any, cred as any, client as any, log as any, alert as any);
  return { svc, prisma, revenueSync, cred, client, log, alert };
}

function ligar() { process.env.HBX_CONTABIL_SERPRO_ENABLED = '1'; }
function desligar() { delete process.env.HBX_CONTABIL_SERPRO_ENABLED; delete process.env.HBX_CONTABIL_SERPRO_ENV; }

// ---------------------------------------------------------------------------
// ARMAR — leitura pura do motor + gates de fallback.
// ---------------------------------------------------------------------------

test('armar — flag OFF: disponivel:false motivo flag-off (fallback semi-auto), sem tocar o Serpro', async () => {
  desligar();
  const { svc, client } = makeService();
  const r = await svc.armar('2026-07');
  assert.equal(r.disponivel, false);
  assert.equal(r.motivoIndisponivel, 'flag-off');
  assert.equal(r.payload, null);
  assert.equal(client.declarouCom.length, 0, 'nada foi transmitido');
});

test('armar — sem credencial no cofre: disponivel:false motivo sem-credencial', async () => {
  ligar();
  const cred = new FakeCred(); cred.configurado = false;
  const { svc } = makeService({ cred });
  const r = await svc.armar('2026-07');
  assert.equal(r.disponivel, false);
  assert.equal(r.motivoIndisponivel, 'sem-credencial');
  desligar();
});

test('armar — flag ON + credencial: monta o payload EXATO do motor + custo estimado (~R$0,72)', async () => {
  ligar();
  const { svc } = makeService();
  const r = await svc.armar('2026-07');
  assert.equal(r.disponivel, true);
  assert.ok(r.payload);
  assert.equal(r.payload!.receitaBrutaMesCents, 5_000_00, 'receita do motor');
  assert.equal(r.payload!.dasPrevistoCents, 300_00, 'DAS previsto do motor (Lei nº2)');
  assert.equal(r.payload!.anexoAplicado, 'III');
  assert.equal(r.payload!.periodoApuracao, '202607');
  assert.equal(r.custoEstimadoCents, 72, 'declarar 40 + gerar DAS 32 = 72 cents');
  assert.match(r.custoEstimadoLabel, /R\$/);
  desligar();
});

// ---------------------------------------------------------------------------
// LEI Nº1 — nenhuma transmissão sem o clique-com-confirmação.
// ---------------------------------------------------------------------------

test('transmitir — SEM confirmação "TRANSMITIR": RECUSA e NÃO chama o Serpro', async () => {
  ligar();
  const { svc, client } = makeService();
  await assert.rejects(
    () => svc.transmitir('2026-07', { aprovadoPor: 'user-1', confirmacao: '' }),
    /Confirme digitando TRANSMITIR/,
  );
  assert.equal(client.declarouCom.length, 0, 'nenhuma declaração enviada sem confirmação');
  desligar();
});

test('transmitir — aprovadoPor vazio ou auto-flag: RECUSA (nenhuma transmissão anônima/automática)', async () => {
  ligar();
  const { svc, client } = makeService();
  await assert.rejects(
    () => svc.transmitir('2026-07', { aprovadoPor: '', confirmacao: 'TRANSMITIR' }),
    /aprovação explícita do dono/,
  );
  await assert.rejects(
    () => svc.transmitir('2026-07', { aprovadoPor: 'auto-flag', confirmacao: 'TRANSMITIR' }),
    /aprovação explícita do dono/,
  );
  assert.equal(client.declarouCom.length, 0, 'cron/automação nunca transmite');
  desligar();
});

// ---------------------------------------------------------------------------
// TRANSMISSÃO feliz — declara + gera DAS + confere; TRANSMITIDO + trilha.
// ---------------------------------------------------------------------------

test('transmitir — clique válido: declara+DAS+confere → TRANSMITIDO, obrigação com recibo/PDF, trilha com aprovadoPor SEM segredo', async () => {
  ligar();
  const { svc, prisma, client, log } = makeService();
  const r = await svc.transmitir('2026-07', { aprovadoPor: 'user-42', confirmacao: 'TRANSMITIR' });

  assert.equal(r.ok, true);
  assert.equal(r.estado, 'TRANSMITIDO');
  assert.equal(r.numeroRecibo, 'REC-1');
  assert.equal(r.dasPdfB64, 'JVBERi0=');
  assert.equal(r.conferencia?.diverge, false);
  assert.equal(client.gerouDas, 1, 'DAS gerado 1x');

  // Obrigação PGDASD marcada com recibo + PDF anexado.
  const ob = prisma.obligations.find((o) => o.tipo === 'PGDASD');
  assert.equal(ob.estado, 'TRANSMITIDO');
  const result = JSON.parse(ob.resultJson);
  assert.equal(result.via, 'serpro');
  assert.equal(result.numeroRecibo, 'REC-1');
  assert.equal(result.dasPdfB64, 'JVBERi0=');

  // Trilha: aprovadoPor real + sem segredo.
  const declararLog = log.entries.find((e) => e.operacao === 'DECLARAR_PGDASD');
  assert.ok(declararLog, 'gravou trilha da declaração');
  assert.equal(declararLog.sistema, 'SERPRO');
  assert.equal(declararLog.aprovadoPor, 'user-42', 'aprovadoPor = userId do clique');
  assert.ok(!declararLog.requestResumo.includes('K') || !declararLog.requestResumo.includes('consumerKey'), 'resumo sem credencial');
  assert.ok(!/tok-|Bearer|consumerSecret/.test(declararLog.requestResumo), 'nenhum segredo/token no resumo');
  desligar();
});

// ---------------------------------------------------------------------------
// CONFERÊNCIA — DAS oficial ≠ nosso (±R$1) → REVISAR + alerta (disjuntor S5).
// ---------------------------------------------------------------------------

test('transmitir — DAS oficial diverge do nosso (>R$1) → estado REVISAR + alerta vermelho', async () => {
  ligar();
  const client = new FakeClient();
  // Governo apurou R$ 350 (nosso previsto R$ 300) → diferença R$ 50 >> R$ 1.
  client.consultarResp = { ok: true, httpStatus: 200, encontrada: true, numeroRecibo: 'REC-1', dasApuradoCents: 350_00 };
  const { svc, prisma, alert } = makeService({ client });
  const r = await svc.transmitir('2026-07', { aprovadoPor: 'user-1', confirmacao: 'TRANSMITIR' });

  assert.equal(r.estado, 'REVISAR');
  assert.equal(r.ok, false);
  assert.equal(r.conferencia?.diverge, true);
  assert.equal(r.conferencia?.dasGovernoCents, 350_00);
  const ob = prisma.obligations.find((o) => o.tipo === 'PGDASD');
  assert.equal(ob.estado, 'REVISAR', 'obrigação marcada REVISAR (não avança pra pagamento)');
  assert.ok(alert.calls.some((c) => c.tipo === 'SERPRO_DIVERGENCIA'), 'alertou o dono da divergência');
  desligar();
});

test('transmitir — diferença dentro da tolerância (±R$1) NÃO diverge (TRANSMITIDO)', async () => {
  ligar();
  const client = new FakeClient();
  client.consultarResp = { ok: true, httpStatus: 200, encontrada: true, numeroRecibo: 'REC-1', dasApuradoCents: 300_50 }; // +R$0,50
  const { svc } = makeService({ client });
  const r = await svc.transmitir('2026-07', { aprovadoPor: 'user-1', confirmacao: 'TRANSMITIR' });
  assert.equal(r.estado, 'TRANSMITIDO');
  assert.equal(r.conferencia?.diverge, false);
  desligar();
});

// ---------------------------------------------------------------------------
// FALLBACK — erro do Serpro nunca bloqueia; wizard cai no semi-auto.
// ---------------------------------------------------------------------------

test('transmitir — declaração recusada pelo Serpro → FALLBACK (não bloqueia; sem PDF; trilha grava a falha)', async () => {
  ligar();
  const client = new FakeClient();
  client.declararResp = { ok: false, httpStatus: 500, erro: 'HTTP 500' };
  const { svc, prisma, client: c, log } = makeService({ client });
  const r = await svc.transmitir('2026-07', { aprovadoPor: 'user-1', confirmacao: 'TRANSMITIR' });

  assert.equal(r.estado, 'FALLBACK');
  assert.equal(r.ok, false);
  assert.equal(r.numeroRecibo, null);
  assert.equal(c.gerouDas, 0, 'NÃO gera DAS se a declaração falhou');
  // Obrigação NÃO foi marcada como transmitida (segue no estado anterior).
  const ob = prisma.obligations.find((o) => o.tipo === 'PGDASD');
  assert.equal(ob.estado, 'PRONTO', 'obrigação intacta no fallback (modo manual assume)');
  assert.ok(log.entries.some((e) => e.operacao === 'DECLARAR_PGDASD' && e.sucesso === false), 'trilha registra a falha');
  desligar();
});

test('transmitir — flag OFF em runtime: cai em FALLBACK sem transmitir (defesa em profundidade)', async () => {
  desligar(); // flag OFF
  const { svc, client } = makeService();
  const r = await svc.transmitir('2026-07', { aprovadoPor: 'user-1', confirmacao: 'TRANSMITIR' });
  assert.equal(r.estado, 'FALLBACK');
  assert.equal(client.declarouCom.length, 0, 'flag OFF: nenhuma transmissão mesmo com clique válido');
});

// ---------------------------------------------------------------------------
// DEFIS assistida — totais do ano prontos (semi-auto), sem tocar o Serpro.
// ---------------------------------------------------------------------------

test('defisDossie — monta os totais do ano (motor + Livro Caixa) em modo semi-auto', async () => {
  const { svc, prisma } = makeService();
  prisma.revenueMonths = [
    { competencia: '2026-01', receitaCaixaCents: 3_000_00, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 1_000_00 },
    { competencia: '2026-02', receitaCaixaCents: 4_000_00, receitaNotasCents: 0, ajusteManualCents: 0, folhaMesCents: 1_000_00 },
  ];
  prisma.ledger = [
    { competencia: '2026-03', tipo: 'SAIDA', categoria: 'DISTRIBUICAO_LUCRO', valorCents: 2_000_00 },
  ];
  const r = await svc.defisDossie('2026');
  assert.equal(r.modo, 'semi-auto');
  assert.equal(r.receitaTotalAnoCents, 7_000_00);
  assert.equal(r.receitasPorMes.length, 2);
  assert.equal(r.folhaAnoCents, 2_000_00);
  assert.equal(r.distribuicaoLucroAnoCents, 2_000_00);
  assert.match(r.deepLink, /defis/);
});
