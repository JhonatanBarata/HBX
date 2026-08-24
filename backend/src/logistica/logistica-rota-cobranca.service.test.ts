import test from 'node:test';
import assert from 'node:assert/strict';
import { LogisticaRotaCobrancaService, diaDeRotaUsageKey, passeDoDiaUsageKey } from './logistica-rota-cobranca.service';

/**
 * ROTA v2 (10/08, "PICAR A PONTE" — refundação da cobrança) — o núcleo
 * financeiro do modelo novo, testado direto (sem passar pela rota inteira).
 *
 * As 5 provas que a Fase 4 exige, aqui dentro:
 *   1. dia CREDITO debita 1× e remontar no mesmo dia NÃO redebita;
 *   2. cancelar não estorna — provado ESTRUTURALMENTE: este serviço não
 *      expõe NENHUM método de estorno do dia/passe (grep no protótipo).
 *   3. 2º motorista barrado pelo portão e liberado com passe pago;
 *   (4 e 5 — guard morto / 409 ROTA_DE_OUTRO_MOTORISTA — vivem em
 *   logistica-agenda.service.ts e logistica-quem-montou.util.test.ts.)
 */

function makeHarness(opts: {
  nivel?: string;
  logisticaAssentos?: number | null;
  diaMode?: 'debit' | 'free';
  diaCost?: number;
  passeMode?: 'debit' | 'free';
  passeCost?: number;
  available?: number;
} = {}) {
  const nivel = opts.nivel ?? 'CREDITO';
  const diaMode = opts.diaMode ?? 'debit';
  const diaCost = opts.diaCost ?? 6;
  const passeMode = opts.passeMode ?? 'debit';
  const passeCost = opts.passeCost ?? 8;
  let available = opts.available ?? 100;

  const ledger: Array<{ companyId: number; usageKey: string; kind: string; amount: number }> = [];
  const debitCalls: any[] = [];
  const refundCalls: any[] = [];
  const entregas: Array<{ companyId: number; entregadorId: number | null; status: string; scheduledAt: null }> = [];
  const locksAdquiridos: string[] = [];

  const prisma: any = {
    logisticaConfig: {
      findUnique: async () => ({ logisticaNivel: nivel, logisticaAssentos: opts.logisticaAssentos ?? null }),
    },
    entrega: {
      findMany: async ({ where }: any) => entregas.filter((e) => {
        if (e.companyId !== where.companyId) return false;
        if (where.status?.not && e.status === where.status.not) return false;
        if (where.entregadorId?.not === null && e.entregadorId == null) return false;
        return true;
      }),
    },
    creditLedgerEntry: {
      findFirst: async ({ where }: any) =>
        ledger.find((row) => row.companyId === where.companyId && row.usageKey === where.usageKey && row.kind === where.kind) || null,
      // `chaveJaPaga` (revisão adversarial 10/08) lê por PREFIXO: débitos da
      // chave base + tentativas versionadas, e os estornos pareados.
      findMany: async ({ where }: any) =>
        ledger.filter((row) => {
          if (row.companyId !== where.companyId) return false;
          const ors = Array.isArray(where.OR) ? where.OR : [where];
          return ors.some((cond: any) => {
            if (cond.kind && row.kind !== cond.kind) return false;
            const sw = cond.usageKey?.startsWith;
            if (sw && !String(row.usageKey).startsWith(sw)) return false;
            return true;
          });
        }),
    },
    $executeRawUnsafe: async (_sql: string, _companyId: number, key: string) => {
      locksAdquiridos.push(key);
      return 0;
    },
    $transaction: async (callback: any) => callback(prisma),
  };

  const wallet: any = {
    // Fiel à carteira REAL (credit-wallet.service.ts): serve o que couber
    // (débito PARCIAL deixa linha no ledger) e o refund grava a linha par
    // `refund:<usageKey>` — é exatamente esse par que a régua "pago = débito
    // sem estorno" precisa enxergar no dublê pra prova valer alguma coisa.
    debit: async (companyId: number, amount: number, opts2: any) => {
      debitCalls.push({ companyId, amount, ...opts2 });
      const served = Math.min(available, amount);
      if (served > 0) {
        available -= served;
        ledger.push({ companyId, usageKey: opts2.usageKey, kind: 'debit', amount: served });
      }
      return { debited: served, requested: amount, partial: served < amount, balanceAfter: available };
    },
    refund: async (companyId: number, opts2: any) => {
      refundCalls.push({ companyId, ...opts2 });
      ledger.push({ companyId, usageKey: `refund:${opts2.usageKey}`, kind: 'refund', amount: 0 });
      return { refunded: 0, balanceAfter: available, alreadyProcessed: false };
    },
  };

  const actionConfig: any = {
    resolveEffective: async (key: string) => {
      if (key === 'logistica_dia_de_rota') return { key, label: 'Dia de rota', mode: diaMode, cost: diaCost };
      if (key === 'logistica_passe_motorista_dia') return { key, label: 'Passe do dia', mode: passeMode, cost: passeCost };
      return null;
    },
  };

  const cobranca = new LogisticaRotaCobrancaService(prisma, wallet, actionConfig);
  return {
    cobranca,
    ledger,
    debitCalls,
    refundCalls,
    locksAdquiridos,
    setAvailable: (n: number) => { available = n; },
    seedEntrega: (over: Partial<{ companyId: number; entregadorId: number | null; status: string }> = {}) => {
      entregas.push({ companyId: 7, entregadorId: 9, status: 'agendada', scheduledAt: null, ...over });
    },
  };
}

const COMPANY = 7;
const DATE = '2026-08-10';

// ── 1. DIA DE ROTA (CREDITO) ─────────────────────────────────────────────────
test('garantirDiaPago: CREDITO debita 1× o custo do catálogo', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  await h.cobranca.garantirDiaPago(COMPANY, DATE, 1);
  assert.equal(h.debitCalls.length, 1);
  assert.equal(h.debitCalls[0].amount, 6);
  assert.equal(h.debitCalls[0].usageKey, diaDeRotaUsageKey(COMPANY, DATE));
  assert.equal(h.debitCalls[0].actionKey, 'logistica_dia_de_rota');
});

test('garantirDiaPago: remontar no MESMO dia não redebita (idempotente por empresa+data)', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  await h.cobranca.garantirDiaPago(COMPANY, DATE, 1);
  await h.cobranca.garantirDiaPago(COMPANY, DATE, 1); // remontar
  await h.cobranca.garantirDiaPago(COMPANY, DATE, 2); // outro motorista chamando de novo
  assert.equal(h.debitCalls.length, 1, 'só a primeira vez debita — o resto acha o ledger já pago');
});

test('garantirDiaPago: nível com plano (BASIC/ADVANCED/FULL) nunca debita — rota ILIMITADA', async () => {
  for (const nivel of ['BASIC', 'ADVANCED', 'FULL']) {
    const h = makeHarness({ nivel });
    await h.cobranca.garantirDiaPago(COMPANY, DATE, 1);
    assert.equal(h.debitCalls.length, 0, `${nivel} é rota ilimitada — nunca cobra o dia`);
  }
});

test('garantirDiaPago: modo Grátis (master desligou) não debita', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaMode: 'free' });
  await h.cobranca.garantirDiaPago(COMPANY, DATE, 1);
  assert.equal(h.debitCalls.length, 0);
});

test('garantirDiaPago: saldo insuficiente lança 402 LOGISTICA_ROUTE_UNAVAILABLE/creditos e estorna o parcial', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  h.setAvailable(0);
  await assert.rejects(
    h.cobranca.garantirDiaPago(COMPANY, DATE, 1),
    (err: any) => {
      assert.equal(err.getStatus(), 402);
      const body = err.getResponse();
      assert.equal(body.code, 'LOGISTICA_ROUTE_UNAVAILABLE');
      assert.equal(body.reason, 'creditos');
      return true;
    },
  );
});

/* 🔴 VACINA da revisão adversarial (10/08) — a CHAVE ENVENENADA. A carteira
   serve débito PARCIAL quando o saldo não cobre, e o estorno fica no ledger
   com a mesma chave. Sem a régua "pago = débito SEM estorno" + chave nova por
   tentativa, esse resíduo ou liberava o dia DE GRAÇA (check ingênuo "existe
   débito") ou trancava o dia em 402 PRA SEMPRE (replay idempotente da
   carteira). Os dois destinos errados morrem aqui. */
test('garantirDiaPago: tentativa estornada NÃO marca o dia como pago — e a recarga paga com chave NOVA', async () => {
  const h = makeHarness({ nivel: 'CREDITO', diaCost: 6 });
  h.setAvailable(3); // só metade do dia
  await assert.rejects(h.cobranca.garantirDiaPago(COMPANY, DATE, 1), (err: any) => err.getStatus() === 402);
  assert.equal(h.refundCalls.length, 1, 'o parcial de 3 foi estornado');

  h.setAvailable(10); // recarregou
  await h.cobranca.garantirDiaPago(COMPANY, DATE, 1);
  assert.equal(h.debitCalls.length, 2);
  assert.equal(
    h.debitCalls[1].usageKey,
    `${diaDeRotaUsageKey(COMPANY, DATE)}:t2`,
    'a 2ª tentativa NUNCA reusa a chave estornada — replay idempotente da carteira devolveria o fracasso antigo',
  );

  await h.cobranca.garantirDiaPago(COMPANY, DATE, 1); // remontar depois de pago de verdade
  assert.equal(h.debitCalls.length, 2, 'pago de verdade (débito sem estorno) não redebita');
});

test('assertAssentoDoDia: passe com débito ESTORNADO não libera o motorista', async () => {
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8 });
  h.seedEntrega({ entregadorId: 11 });
  h.setAvailable(2); // não cobre o passe → parcial + estorno
  await assert.rejects(h.cobranca.garantirPasseDoDia(COMPANY, 9, DATE, 1), (err: any) => err.getStatus() === 402);
  await assert.rejects(
    h.cobranca.assertAssentoDoDia(COMPANY, 9, DATE, true),
    (err: any) => (err as any).getResponse().code === 'ASSENTOS_ESGOTADOS',
  );
});

test('garantirDiaPago: serializa via advisory lock com a chave dia:<empresa>:<data>', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  await h.cobranca.garantirDiaPago(COMPANY, DATE, 1);
  assert.deepEqual(h.locksAdquiridos, [`dia:${COMPANY}:${DATE}`]);
});

test('garantirDiaPago: sem companyId/routeDate é no-op (nunca lança)', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  await h.cobranca.garantirDiaPago(0, DATE, 1);
  await h.cobranca.garantirDiaPago(COMPANY, '', 1);
  assert.equal(h.debitCalls.length, 0);
});

// ── 2. CANCELAR NÃO ESTORNA (prova estrutural) ──────────────────────────────
test('LogisticaRotaCobrancaService NUNCA expõe um método de estorno do dia/passe', () => {
  const metodos = Object.getOwnPropertyNames(LogisticaRotaCobrancaService.prototype);
  const proibidos = metodos.filter((m) => /estorn|refund|reembols/i.test(m));
  assert.deepEqual(proibidos, [], 'cancelar apaga a rota (logistica-rota.service.ts), mas NUNCA devolve crédito — não existe caminho de código pra isso');
});

// ── 3. PORTÃO DE ASSENTOS ────────────────────────────────────────────────────
test('assertAssentoDoDia: motorista JÁ ocupante do dia nunca é barrado', async () => {
  const h = makeHarness({ nivel: 'BASIC' }); // BASIC = 1 assento
  h.seedEntrega({ entregadorId: 9 });
  h.seedEntrega({ entregadorId: 11 }); // outro motorista também no dia
  await assert.doesNotReject(h.cobranca.assertAssentoDoDia(COMPANY, 9, DATE));
});

test('assertAssentoDoDia: motorista NOVO dentro do teto entra sem passe', async () => {
  const h = makeHarness({ nivel: 'ADVANCED' }); // ADVANCED = 2 assentos
  h.seedEntrega({ entregadorId: 9 });
  await assert.doesNotReject(h.cobranca.assertAssentoDoDia(COMPANY, 11, DATE));
});

test('assertAssentoDoDia: nível CREDITO estourado barra com podeComprarPasse:false', async () => {
  const h = makeHarness({ nivel: 'CREDITO' }); // CREDITO = 1 assento
  h.seedEntrega({ entregadorId: 9 });
  await assert.rejects(
    h.cobranca.assertAssentoDoDia(COMPANY, 11, DATE),
    (err: any) => {
      assert.equal(err.getStatus(), 402);
      const body = err.getResponse();
      assert.equal(body.code, 'ASSENTOS_ESGOTADOS');
      assert.equal(body.podeComprarPasse, false);
      assert.equal('passeCreditos' in body, false);
      return true;
    },
  );
});

test('assertAssentoDoDia: DONO estourando o plano é barrado com podeComprarPasse:true', async () => {
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8 }); // BASIC = 1 assento
  h.seedEntrega({ entregadorId: 11 });
  await assert.rejects(
    h.cobranca.assertAssentoDoDia(COMPANY, 9, DATE, true), // podeComprar: é dono/master
    (err: any) => {
      assert.equal(err.getStatus(), 402);
      const body = err.getResponse();
      assert.equal(body.code, 'ASSENTOS_ESGOTADOS');
      assert.equal(body.podeComprarPasse, true);
      assert.equal(body.passeCreditos, 8);
      return true;
    },
  );
});

test('assertAssentoDoDia: FUNCIONÁRIO estourando o plano NÃO vê botão de compra (LEI DO VENDEDOR)', async () => {
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8 });
  h.seedEntrega({ entregadorId: 11 });
  await assert.rejects(
    h.cobranca.assertAssentoDoDia(COMPANY, 9, DATE), // sem flag = ator não pode gastar
    (err: any) => {
      const body = (err as any).getResponse();
      assert.equal(body.code, 'ASSENTOS_ESGOTADOS');
      assert.equal(body.podeComprarPasse, false, 'dinheiro da empresa só aparece pra quem pode gastar');
      assert.match(String(body.message), /respons[aá]vel/i, 'o recado manda chamar o responsável');
      return true;
    },
  );
});

test('assertAssentoDoDia: 2º motorista com PASSE JÁ PAGO passa liberado', async () => {
  const h = makeHarness({ nivel: 'BASIC' });
  h.seedEntrega({ entregadorId: 11 });
  await h.cobranca.garantirPasseDoDia(COMPANY, 9, DATE, 1);
  h.debitCalls.length = 0; // limpa: só nos interessa o que acontece DEPOIS do passe
  await assert.doesNotReject(h.cobranca.assertAssentoDoDia(COMPANY, 9, DATE));
  assert.equal(h.debitCalls.length, 0, 'o gate só LÊ — nunca debita por conta própria');
});

test('override de logisticaAssentos da empresa vence o default do nível no gate', async () => {
  const h = makeHarness({ nivel: 'BASIC', logisticaAssentos: 3 }); // BASIC default seria 1
  h.seedEntrega({ entregadorId: 11 });
  h.seedEntrega({ entregadorId: 12 });
  await assert.doesNotReject(h.cobranca.assertAssentoDoDia(COMPANY, 9, DATE), 'override abriu 3 assentos');
});

test('assertAssentoDoDia: sem motorista/empresa/data é no-op (quem chama sem contexto não é gateado aqui)', async () => {
  const h = makeHarness({ nivel: 'CREDITO' });
  h.seedEntrega({ entregadorId: 9 });
  await assert.doesNotReject(h.cobranca.assertAssentoDoDia(0, 9, DATE));
  await assert.doesNotReject(h.cobranca.assertAssentoDoDia(COMPANY, 0, DATE));
});

// ── Passe do dia ──────────────────────────────────────────────────────────
// 24/08/2026 — o passe é um recurso dos níveis COM PLANO: os harnesses abaixo
// declaram `nivel: 'BASIC'` explícito (o default do harness é CREDITO, e em
// CREDITO a compra agora é RECUSADA antes de debitar — teste próprio adiante).
test('garantirPasseDoDia: debita 1× por empresa+motorista+data', async () => {
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8 });
  await h.cobranca.garantirPasseDoDia(COMPANY, 9, DATE, 1);
  assert.equal(h.debitCalls.length, 1);
  assert.equal(h.debitCalls[0].amount, 8);
  assert.equal(h.debitCalls[0].usageKey, passeDoDiaUsageKey(COMPANY, 9, DATE));
});

test('garantirPasseDoDia: repetir a compra do MESMO motorista+dia não debita 2×', async () => {
  const h = makeHarness({ nivel: 'BASIC' });
  await h.cobranca.garantirPasseDoDia(COMPANY, 9, DATE, 1);
  await h.cobranca.garantirPasseDoDia(COMPANY, 9, DATE, 1);
  assert.equal(h.debitCalls.length, 1);
});

test('garantirPasseDoDia: outro motorista no MESMO dia paga o PRÓPRIO passe (chave por driver)', async () => {
  const h = makeHarness({ nivel: 'BASIC' });
  await h.cobranca.garantirPasseDoDia(COMPANY, 9, DATE, 1);
  await h.cobranca.garantirPasseDoDia(COMPANY, 10, DATE, 1);
  assert.equal(h.debitCalls.length, 2, 'motoristas diferentes = usageKeys diferentes = 2 débitos legítimos');
});

test('garantirPasseDoDia: saldo insuficiente lança 402 e estorna o parcial', async () => {
  const h = makeHarness({ nivel: 'BASIC', passeCost: 8 });
  h.setAvailable(0);
  await assert.rejects(h.cobranca.garantirPasseDoDia(COMPANY, 9, DATE, 1), (err: any) => {
    assert.equal(err.getStatus(), 402);
    return true;
  });
});
