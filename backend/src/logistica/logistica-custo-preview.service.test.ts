import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaCustoPreviewService } from './logistica-custo-preview.service';
import { diaDeRotaUsageKey, passeDoDiaUsageKey } from './logistica-rota-cobranca.service';

/**
 * ROTA v2 (10/08, "PICAR A PONTE") — reescrito de raiz: o bloco por parada
 * morreu junto com `logistica-route-billing.service.ts`. O preview agora
 * espelha o modelo por NÍVEL (mesma régua de `LogisticaRotaCobrancaService`,
 * em modo 100% LEITURA — Lei nº3, "preview nunca debita"):
 *   - CREDITO: 1 débito por EMPRESA+DATA (`logistica_dia_de_rota`).
 *   - BASIC/ADVANCED/FULL (rota ILIMITADA): só o ASSENTO custa — motorista
 *     além do teto sem passe pago vira `logistica_passe_motorista_dia`.
 *
 * Harness PRÓPRIO, duplicado de propósito (mesmo padrão dos vizinhos:
 * LogisticaConferenciaService também duplica os helpers privados).
 */
function makeHarness(opts: {
  nivel?: string;
  logisticaAssentos?: number | null;
  diaCost?: number;
  diaMode?: 'debit' | 'free';
  passeCost?: number;
  passeMode?: 'debit' | 'free';
  available?: number;
} = {}) {
  const nivel = opts.nivel ?? 'CREDITO';
  const diaMode = opts.diaMode ?? 'debit';
  const diaCost = opts.diaCost ?? 6;
  const passeMode = opts.passeMode ?? 'debit';
  const passeCost = opts.passeCost ?? 8;
  let available = opts.available ?? 100;

  const entregas = new Map<string, { id: string; companyId: number; entregadorId: number | null; status: string; scheduledAt: null }>();
  const ledger: Array<{ companyId: number; usageKey: string; kind: string }> = [];

  const prisma: any = {
    entrega: {
      findMany: async ({ where }: any) => {
        let rows = Array.from(entregas.values()).filter((e) => e.companyId === where.companyId);
        if (where.id?.in) rows = rows.filter((e) => where.id.in.includes(e.id));
        if (typeof where.entregadorId === 'number') rows = rows.filter((e) => e.entregadorId === where.entregadorId);
        if (where.entregadorId && typeof where.entregadorId === 'object' && where.entregadorId.not === null) {
          rows = rows.filter((e) => e.entregadorId != null);
        }
        if (where.status?.in) rows = rows.filter((e) => where.status.in.includes(e.status));
        if (where.status?.not) rows = rows.filter((e) => e.status !== where.status.not);
        return rows.map((e) => ({ ...e }));
      },
    },
    logisticaConfig: {
      findUnique: async () => ({ logisticaNivel: nivel, logisticaAssentos: opts.logisticaAssentos ?? null }),
    },
    // 16/08 — o preview parou de perguntar `findFirst` na chave base e passou a
    // usar `chaveJaPaga`, que lê débitos E estornos com `startsWith`. O dublê
    // reproduz o filtro real (o OR de duas famílias de chave), senão o teste do
    // estorno mede o dublê e não o serviço.
    creditLedgerEntry: {
      // `findFirst` continua servido de propósito: é o que o código de 15/08
      // chamava, e sem ele o red-first mentiria — as provas novas reprovariam
      // por "findFirst is not a function" em vez de reprovarem pelo DEFEITO.
      findFirst: async ({ where }: any) =>
        ledger.find((row) => row.companyId === where.companyId && row.usageKey === where.usageKey && row.kind === where.kind) || null,
      findMany: async ({ where }: any) => {
        const casa = (row: any, cond: any) => {
          if (cond.kind && row.kind !== cond.kind) return false;
          const alvo = cond.usageKey;
          if (alvo && typeof alvo === 'object' && typeof alvo.startsWith === 'string') {
            return String(row.usageKey || '').startsWith(alvo.startsWith);
          }
          if (typeof alvo === 'string') return row.usageKey === alvo;
          return true;
        };
        return ledger
          .filter((row) => row.companyId === where.companyId)
          .filter((row) => (where.OR ? where.OR.some((cond: any) => casa(row, cond)) : casa(row, where)))
          .map((row) => ({ usageKey: row.usageKey, kind: row.kind }));
      },
    },
  };

  const wallet: any = {
    getBalance: async () => available,
    debit: async () => { throw new Error('LEI Nº3 VIOLADA: preview nunca debita'); },
  };
  const config: any = {};
  const actionConfig: any = {
    resolveEffective: async (key: string) => {
      if (key === 'logistica_dia_de_rota') return { key, label: 'Dia de rota', mode: diaMode, cost: diaCost };
      if (key === 'logistica_passe_motorista_dia') return { key, label: 'Passe do dia', mode: passeMode, cost: passeCost };
      return null;
    },
  };

  const preview = new LogisticaCustoPreviewService(prisma, wallet, config, actionConfig);

  return {
    preview,
    ledger,
    setAvailable: (n: number) => { available = n; },
    seedEntrega: (id: string, overrides: Partial<{ companyId: number; entregadorId: number | null; status: string }> = {}) => {
      entregas.set(id, { id, companyId: 7, entregadorId: 9, status: 'agendada', scheduledAt: null, ...overrides });
    },
    marcarDiaPago: (companyId: number, routeDate: string) => {
      ledger.push({ companyId, usageKey: diaDeRotaUsageKey(companyId, routeDate), kind: 'debit' });
    },
    marcarPassePago: (companyId: number, driverUserId: number, dateISO: string) => {
      ledger.push({ companyId, usageKey: passeDoDiaUsageKey(companyId, driverUserId, dateISO), kind: 'debit' });
    },
    // O CENÁRIO QUE CUSTAVA DINHEIRO: a carteira serviu um débito PARCIAL, viu
    // que não cobria e estornou (`refund:<chave>`). A linha `debit` fica no
    // ledger para sempre — é exatamente ela que o findFirst cru lia como "pago".
    marcarDiaEstornado: (companyId: number, routeDate: string) => {
      const chave = diaDeRotaUsageKey(companyId, routeDate);
      ledger.push({ companyId, usageKey: chave, kind: 'debit' });
      ledger.push({ companyId, usageKey: `refund:${chave}`, kind: 'refund' });
    },
    marcarPasseEstornado: (companyId: number, driverUserId: number, dateISO: string) => {
      const chave = passeDoDiaUsageKey(companyId, driverUserId, dateISO);
      ledger.push({ companyId, usageKey: chave, kind: 'debit' });
      ledger.push({ companyId, usageKey: `refund:${chave}`, kind: 'refund' });
    },
    // A 2ª tentativa da cobrança nasce na chave versionada `:t2` e essa NÃO foi
    // estornada — o dia está pago de verdade, mesmo com a base estornada atrás.
    marcarDiaPagoNaSegundaTentativa: (companyId: number, routeDate: string) => {
      const chave = diaDeRotaUsageKey(companyId, routeDate);
      ledger.push({ companyId, usageKey: chave, kind: 'debit' });
      ledger.push({ companyId, usageKey: `refund:${chave}`, kind: 'refund' });
      ledger.push({ companyId, usageKey: `${chave}:t2`, kind: 'debit' });
    },
  };
}

const BASE = { companyId: 7, entregadorId: 9, routeDate: '2026-07-25' };

// ── CREDITO ───────────────────────────────────────────────────────────────
test('CREDITO: dia ainda não pago custa o preço do catálogo (logistica_dia_de_rota)', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  h.seedEntrega('d1');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.blocosTotais, 1);
  assert.equal(preview.blocosJaDebitados, 0);
  assert.equal(preview.creditosAIniciar, 6);
  assert.equal(preview.saldoAtual, 100);
  assert.equal(preview.saldoCobre, true);
});

test('CREDITO: dia JÁ pago (remontar/outro motorista) não cobra de novo', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  h.seedEntrega('d1');
  h.marcarDiaPago(BASE.companyId, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.blocosJaDebitados, 1);
  assert.equal(preview.creditosAIniciar, 0, 'já foi pago — reabrir a conferência não pede de novo');
});

test('CREDITO: modo Grátis (master desligou) zera o preview antes de qualquer débito', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaMode: 'free' });
  h.seedEntrega('d1');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 0);
});

test('CREDITO: saldoCobre vira false quando o saldo não cobre o dia', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  h.setAvailable(1);
  h.seedEntrega('d1');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 6);
  assert.equal(preview.saldoAtual, 1);
  assert.equal(preview.saldoCobre, false);
});

// ── PLANO (BASIC/ADVANCED/FULL) — rota ILIMITADA, só o ASSENTO custa ───────
test('ADVANCED: motorista JÁ ocupante do dia nunca custa (mesmo sem sobrar assento)', async () => {
  const h = makeHarness({ nivel: 'ADVANCED' }); // assentosInclusos ADVANCED = 2
  h.seedEntrega('d1', { entregadorId: 9 });
  h.seedEntrega('d2', { entregadorId: 11 });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 0);
  assert.equal(preview.blocosJaDebitados, 1);
});

test('BASIC: motorista NOVO dentro do teto de assentos entra de graça', async () => {
  const h = makeHarness({ nivel: 'BASIC' }); // assentosInclusos BASIC = 1
  h.seedEntrega('d1', { entregadorId: 9 });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.creditosAIniciar, 0, 'único motorista do dia — cabe no assento');
});

test('BASIC: 2º motorista estourando o teto de 1 assento custa o Passe do dia', async () => {
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8 });
  h.seedEntrega('d1', { entregadorId: 11 }); // já ocupa o único assento
  // d2 ainda NÃO é do motorista 9 (cenário: admin prevendo ANTES de atribuir)
  // — se já fosse, o motorista já seria ocupante por definição (autoinclusão).
  h.seedEntrega('d2', { entregadorId: null });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d2'] }, 9);
  assert.equal(preview.creditosAIniciar, 8, 'estourou o teto — precisa do passe');
  assert.equal(preview.blocosJaDebitados, 0);
});

test('BASIC: passe JÁ pago pra este motorista+dia libera sem cobrar de novo', async () => {
  const h = makeHarness({ nivel: 'BASIC' });
  h.seedEntrega('d1', { entregadorId: 11 });
  h.seedEntrega('d2', { entregadorId: null });
  h.marcarPassePago(BASE.companyId, 9, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d2'] }, 9);
  assert.equal(preview.creditosAIniciar, 0);
  assert.equal(preview.blocosJaDebitados, 1);
});

test('override de logisticaAssentos da empresa vence o default do nível', async () => {
  const h = makeHarness({ nivel: 'BASIC', logisticaAssentos: 5 }); // BASIC default seria 1
  h.seedEntrega('d1', { entregadorId: 11 });
  h.seedEntrega('d2', { entregadorId: 9 });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d2'] }, 9);
  assert.equal(preview.creditosAIniciar, 0, 'override abriu 5 assentos — o 2º motorista cabe de graça');
});

// ── invariantes gerais ───────────────────────────────────────────────────
test('preview nunca escreve: zero débito real, mesmo passando pelos dois modelos', async () => {
  for (const nivel of ['CREDITO', 'ADVANCED']) {
    const h = makeHarness({ nivel });
    h.seedEntrega('d1');
    // wallet.debit lança se for chamado (ver makeHarness) — chegar até aqui
    // sem exceção já é a prova.
    await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
    assert.equal(h.ledger.length, 0);
  }
});

test('dia sem nenhuma parada: preview zerado sem consultar nível nem ledger', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: [] }, 9);
  assert.deepEqual(preview, { blocosTotais: 0, blocosJaDebitados: 0, creditosAIniciar: 0, saldoAtual: 100, saldoCobre: true });
});

test('ator ADMIN sem entregadorId explícito resolve o motorista único do dia', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  h.seedEntrega('d1');
  h.seedEntrega('d2');
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] });
  assert.equal(preview.blocosTotais, 1);
});

test('ator ADMIN não consegue prever quando o dia tem mais de um motorista nas entregas', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  h.seedEntrega('d1', { entregadorId: 9 });
  h.seedEntrega('d2', { entregadorId: 10 });
  // PR29072026 — o BLOQUEIO é o mesmo; a frase é que passou a dizer QUAL dos 4
  // estados é (ver logistica-motorista-unico.util.ts).
  await assert.rejects(
    h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1', 'd2'] }),
    /divididas entre 2 motoristas/,
  );
});

test('sem deliveryIds explícitos, usa todas as entregas abertas do motorista no dia', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  ['d1', 'd2', 'd3'].forEach((id) => h.seedEntrega(id));
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate }, 9);
  assert.equal(preview.blocosTotais, 1, 'dia CREDITO com paradas = 1 cobrança pendente (o dia)');
});

// ── DÉBITO ESTORNADO NÃO É DÉBITO PAGO (16/08) ────────────────────────────
// O furo que estas três provas fecham: a carteira serve um débito PARCIAL quando
// o saldo não cobre, estorna, e devolve 402. A linha `debit` fica no ledger. O
// preview lia essa linha com `findFirst` cru e respondia "já debitado, custo 0,
// saldo cobre" — desarmando a trava "Créditos insuficientes" do app e deixando o
// Iniciar seguinte debitar o preço cheio numa chave `:t2`, sem recibo.
// Red-first: contra o código de 15/08 as três reprovam (o findFirst achava a
// linha estornada e devolvia blocosJaDebitados 1 / creditosAIniciar 0).
test('CREDITO: dia com débito ESTORNADO volta a custar — estorno não é pagamento', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6, available: 100 });
  h.seedEntrega('d1');
  h.marcarDiaEstornado(7, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.blocosJaDebitados, 0, 'a linha estornada NÃO conta como pago');
  assert.equal(preview.creditosAIniciar, 6, 'o dia volta a custar o preço do catálogo');
});

test('CREDITO: com saldo curto depois do estorno, a trava de saldo do app REARMA', async () => {
  // Este é o caso caro: saldo 3, custo 6. Antes, `saldoCobre: true` fazia o app
  // pular o portão "Créditos insuficientes" e postar o iniciar assim mesmo.
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6, available: 3 });
  h.seedEntrega('d1');
  h.marcarDiaEstornado(7, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.saldoCobre, false, 'saldo 3 não cobre custo 6 — o portão tem que nascer');
  assert.equal(preview.creditosAIniciar, 6);
});

test('CREDITO: pago na 2ª tentativa (:t2) é pago — o preview não recobra o dia', async () => {
  // O outro lado da mesma régua: base estornada + `:t2` viva = dia pago DE
  // VERDADE. Sem isto a cura viraria cobrança fantasma na tela.
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  h.seedEntrega('d1');
  h.marcarDiaPagoNaSegundaTentativa(7, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d1'] }, 9);
  assert.equal(preview.blocosJaDebitados, 1);
  assert.equal(preview.creditosAIniciar, 0);
});

test('ASSENTO: passe com débito ESTORNADO volta a custar (mesmo espelho de assertAssentoDoDia)', async () => {
  // Mesmo cenário do "2º motorista estourando o teto": o assento único já está
  // ocupado pelo 11, e o 9 ainda não tem entrega no dia (senão seria ocupante
  // por definição). A diferença é o passe dele ter sido debitado e ESTORNADO.
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8, available: 100 });
  h.seedEntrega('d1', { entregadorId: 11 });
  h.seedEntrega('d2', { entregadorId: null });
  h.marcarPasseEstornado(7, 9, BASE.routeDate);
  const preview = await h.preview.previewCusto(7, { date: BASE.routeDate, deliveryIds: ['d2'] }, 9);
  assert.equal(preview.blocosJaDebitados, 0, 'passe estornado não é passe pago');
  assert.equal(preview.creditosAIniciar, 8);
});
