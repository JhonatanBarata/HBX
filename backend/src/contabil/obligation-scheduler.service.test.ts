import test from 'node:test';
import assert from 'node:assert/strict';
import { ObligationSchedulerService } from './obligation-scheduler.service';
import { antecipaParaDiaUtilAnterior, vencimentoDaCompetencia, dataUtc } from './fiscal-calendar.util';

// ===========================================================================
// ACEITE — CONTABIL S2 (obligation-scheduler). Sem banco real (Postgres local
// pode estar down — ver CLAUDE.md): fake in-memory que implementa só a
// superfície de FiscalObligation/FiscalRevenueMonth usada pelo scheduler
// (findUnique/findMany/create/update por cima de arrays em memória — o mesmo
// contrato que o Prisma real expõe pros métodos chamados aqui).
// ===========================================================================

type ObligationRow = {
  id: string;
  competencia: string;
  tipo: string;
  dueDate: Date;
  estado: string;
  payloadJson: string | null;
  resultJson: string | null;
  naoAplicavel: boolean;
  alertasEnviados: string;
  createdAt: Date;
  updatedAt: Date;
};

type RevenueRow = {
  competencia: string;
  folhaMesCents: number;
  dasPrevistoCents: number | null;
};

let idSeq = 0;

class FakePrisma {
  obligations: ObligationRow[] = [];
  revenues: RevenueRow[] = [];
  // Perfil fiscal singleton (S1). cnpj preenchido = empresa fiscal ativa (gate ON).
  profileCnpj: string | null = null;

  fiscalProfile = {
    findFirst: async ({ where }: any = {}) => {
      const cnpj = this.profileCnpj;
      // Emula o filtro { cnpj: { not: null } } do serviço.
      if (where?.cnpj?.not === null && (cnpj == null || cnpj === '')) return null;
      if (cnpj == null || cnpj === '') return null;
      return { cnpj };
    },
  };

  fiscalObligation = {
    findUnique: async ({ where }: any) => {
      if (where.id) return this.obligations.find((o) => o.id === where.id) ?? null;
      if (where.competencia_tipo) {
        const { competencia, tipo } = where.competencia_tipo;
        return this.obligations.find((o) => o.competencia === competencia && o.tipo === tipo) ?? null;
      }
      return null;
    },
    findMany: async ({ where }: any = {}) => {
      let rows = this.obligations.slice();
      if (where?.competencia !== undefined) rows = rows.filter((o) => o.competencia === where.competencia);
      if (where?.estado !== undefined) {
        if (typeof where.estado === 'string') rows = rows.filter((o) => o.estado === where.estado);
        else if (where.estado.notIn) rows = rows.filter((o) => !where.estado.notIn.includes(o.estado));
      }
      if (where?.naoAplicavel !== undefined) rows = rows.filter((o) => o.naoAplicavel === where.naoAplicavel);
      return rows.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    },
    create: async ({ data }: any) => {
      const row: ObligationRow = {
        id: `ob_${++idSeq}`,
        competencia: data.competencia,
        tipo: data.tipo,
        dueDate: data.dueDate,
        estado: data.estado ?? 'AGUARDANDO_DADOS',
        payloadJson: data.payloadJson ?? null,
        resultJson: data.resultJson ?? null,
        naoAplicavel: Boolean(data.naoAplicavel),
        alertasEnviados: data.alertasEnviados ?? '[]',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.obligations.push(row);
      return row;
    },
    update: async ({ where, data }: any) => {
      const row = this.obligations.find((o) => o.id === where.id);
      if (!row) throw new Error(`obligation ${where.id} not found`);
      Object.assign(row, data, { updatedAt: new Date() });
      return row;
    },
  };

  fiscalRevenueMonth = {
    findUnique: async ({ where }: any) => this.revenues.find((r) => r.competencia === where.competencia) ?? null,
  };
}

class FakeMasterAlert {
  calls: Array<{ competencia: string; tipo: string; texto: string; permitirWhatsapp?: boolean }> = [];
  async fiscalObligationAlert(input: any) {
    this.calls.push(input);
    return { email: true, whatsapp: input.permitirWhatsapp !== false };
  }
}

// Por padrão nasce com empresa fiscal ATIVA (CNPJ preenchido) — é o pré-requisito
// do gate p/ tick()/rodarAlertador(). Testes do gate zeram o cnpj explicitamente.
function makeService(opts: { cnpj?: string | null } = {}) {
  const prisma = new FakePrisma();
  prisma.profileCnpj = opts.cnpj !== undefined ? opts.cnpj : '12.345.678/0001-90';
  const alert = new FakeMasterAlert();
  const svc = new ObligationSchedulerService(prisma as any, alert as any);
  return { svc, prisma, alert };
}

// ---------------------------------------------------------------------------
// GERADOR — 2 cenários (com e sem pró-labore).
// ---------------------------------------------------------------------------

test('gerador — SEM pró-labore: ESOCIAL/DCTFWEB/DARF_INSS nascem naoAplicavel', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 0, dasPrevistoCents: null });

  const geradas = await svc.gerarObrigacoesDaCompetencia('2026-07');
  assert.equal(geradas, 6); // PGDASD, DAS, ESOCIAL_S1200, DCTFWEB, DARF_INSS, LIVRO_CAIXA

  const porTipo = new Map(prisma.obligations.map((o) => [o.tipo, o]));
  assert.equal(porTipo.get('PGDASD')!.naoAplicavel, false);
  assert.equal(porTipo.get('DAS')!.naoAplicavel, false);
  assert.equal(porTipo.get('ESOCIAL_S1200')!.naoAplicavel, true);
  assert.equal(porTipo.get('ESOCIAL_S1200')!.estado, 'CONFERIDO'); // naoAplicavel nasce fechado
  assert.equal(porTipo.get('DCTFWEB')!.naoAplicavel, true);
  assert.equal(porTipo.get('DARF_INSS')!.naoAplicavel, true);
  assert.equal(porTipo.get('LIVRO_CAIXA')!.naoAplicavel, false);
});

test('gerador — COM pró-labore: ESOCIAL/DCTFWEB/DARF_INSS existem de verdade', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 2_800_00, dasPrevistoCents: 600_00 });

  const geradas = await svc.gerarObrigacoesDaCompetencia('2026-07');
  assert.equal(geradas, 6);

  const porTipo = new Map(prisma.obligations.map((o) => [o.tipo, o]));
  assert.equal(porTipo.get('ESOCIAL_S1200')!.naoAplicavel, false);
  assert.equal(porTipo.get('ESOCIAL_S1200')!.estado, 'AGUARDANDO_DADOS');
  assert.equal(porTipo.get('DCTFWEB')!.naoAplicavel, false);
  assert.equal(porTipo.get('DARF_INSS')!.naoAplicavel, false);
});

test('gerador — idempotente: 2ª chamada na mesma competência não duplica', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 0, dasPrevistoCents: null });

  const g1 = await svc.gerarObrigacoesDaCompetencia('2026-07');
  const g2 = await svc.gerarObrigacoesDaCompetencia('2026-07');
  assert.equal(g1, 6);
  assert.equal(g2, 0);
  assert.equal(prisma.obligations.length, 6);
});

test('gerador — DEFIS só nasce na virada de ano (mes=01), competência AAAA-ANUAL, vence 31/03', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2027-01', folhaMesCents: 0, dasPrevistoCents: null });

  await svc.gerarObrigacoesDaCompetencia('2027-01');
  const defis = prisma.obligations.find((o) => o.tipo === 'DEFIS');
  assert.ok(defis, 'DEFIS deveria ter sido gerada na virada de ano');
  assert.equal(defis!.competencia, '2026-ANUAL');
  assert.equal(defis!.dueDate.getUTCFullYear(), 2027);
  assert.equal(defis!.dueDate.getUTCMonth(), 2); // março (0-indexed)
});

// ---------------------------------------------------------------------------
// TRANSIÇÕES — AGUARDANDO_DADOS -> PRONTO quando o motor tem os números.
// ---------------------------------------------------------------------------

test('transição — AGUARDANDO_DADOS vira PRONTO quando dasPrevistoCents existe', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 0, dasPrevistoCents: null });
  await svc.gerarObrigacoesDaCompetencia('2026-07');

  // Ainda sem números prontos: nada transiciona.
  let transicionadas = await svc.aplicarTransicoesAutomaticas(new Date('2026-07-01T00:00:00Z'));
  assert.equal(transicionadas, 0);

  // Motor consolida os números do mês.
  const row = prisma.revenues.find((r) => r.competencia === '2026-07')!;
  row.dasPrevistoCents = 600_00;

  transicionadas = await svc.aplicarTransicoesAutomaticas(new Date('2026-07-02T00:00:00Z'));
  assert.ok(transicionadas >= 1);
  const pgdasd = prisma.obligations.find((o) => o.tipo === 'PGDASD')!;
  assert.equal(pgdasd.estado, 'PRONTO');
});

// ---------------------------------------------------------------------------
// GATE DE ATIVAÇÃO — sem FiscalProfile/CNPJ o tick é inerte (não gera, não alerta).
// Freio anti-ruído: o app "já vem armado" (flag ON) mas SILENCIOSO até o dono
// cadastrar o CNPJ (Fase 0 do manual). Evita zap sobre empresa ainda não aberta.
// ---------------------------------------------------------------------------

test('gate — SEM FiscalProfile ativo: tick gera 0 e não alerta', async () => {
  const { svc, prisma, alert } = makeService({ cnpj: null }); // sem CNPJ
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 2_800_00, dasPrevistoCents: 600_00 });

  const dataRef = new Date('2026-07-13T00:00:00Z'); // D-7 do dia 20
  const r = await svc.tick(dataRef);
  assert.deepEqual(r, { geradas: 0, transicionadas: 0, alertadas: 0 });
  assert.equal(prisma.obligations.length, 0, 'nenhuma obrigação criada sem CNPJ');
  assert.equal(alert.calls.length, 0, 'nenhum alerta disparado sem CNPJ');
});

test('gate — cnpj vazio/whitespace também conta como inativo', async () => {
  const { svc, prisma, alert } = makeService({ cnpj: '   ' }); // só espaços
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 2_800_00, dasPrevistoCents: 600_00 });

  const r = await svc.tick(new Date('2026-07-13T00:00:00Z'));
  assert.deepEqual(r, { geradas: 0, transicionadas: 0, alertadas: 0 });
  assert.equal(prisma.obligations.length, 0);
  assert.equal(alert.calls.length, 0);
});

test('gate — rodarAlertador se auto-protege: sem CNPJ retorna 0 mesmo com obrigações prontas', async () => {
  // Obrigações já existiam (foram geradas quando havia CNPJ) e o dono depois
  // "apagou" o CNPJ — o alertador público não pode disparar zap assim mesmo.
  const { svc, prisma, alert } = makeService({ cnpj: '12.345.678/0001-90' });
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 0, dasPrevistoCents: 600_00 });
  await svc.gerarObrigacoesDaCompetencia('2026-07');
  const das = prisma.obligations.find((o) => o.tipo === 'DAS')!;
  const diaAntes = new Date(das.dueDate.getTime() - 24 * 60 * 60 * 1000);

  prisma.profileCnpj = null; // CNPJ some
  const alertadas = await svc.rodarAlertador(diaAntes);
  assert.equal(alertadas, 0, 'alertador não dispara sem CNPJ ativo');
  assert.equal(alert.calls.length, 0);
});

test('gate — COM FiscalProfile.cnpj preenchido: tick gera normalmente', async () => {
  const { svc, prisma } = makeService({ cnpj: '12.345.678/0001-90' });
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 2_800_00, dasPrevistoCents: 600_00 });

  const r = await svc.tick(new Date('2026-07-13T00:00:00Z'));
  assert.equal(r.geradas, 6, 'com CNPJ ativo o gerador roda normal');
  assert.ok(r.alertadas >= 1, 'com CNPJ ativo o alertador dispara');
});

// ---------------------------------------------------------------------------
// ALERTADOR — D-1 dispara 1x; re-rodar cron NÃO duplica.
// ---------------------------------------------------------------------------

test('alertador — D-1 dispara 1x; re-rodar o mesmo dia NÃO duplica', async () => {
  const { svc, prisma, alert } = makeService();
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 0, dasPrevistoCents: 600_00 });
  await svc.gerarObrigacoesDaCompetencia('2026-07');

  // dueDate do DAS é 2026-07-20 (dia útil — confirmar não cai em fds/feriado).
  const das = prisma.obligations.find((o) => o.tipo === 'DAS')!;
  const diaAntes = new Date(das.dueDate.getTime() - 24 * 60 * 60 * 1000);

  const primeira = await svc.rodarAlertador(diaAntes);
  assert.ok(primeira >= 1, 'deveria ter alertado ao menos 1 obrigação em D-1');
  const chamadasAposPrimeira = alert.calls.length;
  assert.ok(chamadasAposPrimeira >= 1);

  // Re-rodar NO MESMO DIA (mesmo "hoje") não deve re-disparar D-1 pra quem já foi.
  const segunda = await svc.rodarAlertador(diaAntes);
  assert.equal(segunda, 0, 're-rodar o alertador no mesmo dia não deve duplicar alertas');
  assert.equal(alert.calls.length, chamadasAposPrimeira, 'nenhuma chamada nova ao MasterAlertService');
});

test('alertador — full tick (gerar+transicionar+alertar) é idempotente ponta a ponta', async () => {
  const { svc, prisma } = makeService();
  prisma.revenues.push({ competencia: '2026-07', folhaMesCents: 2_800_00, dasPrevistoCents: 600_00 });

  const dataRef = new Date('2026-07-13T00:00:00Z'); // D-7 do dia 20
  const r1 = await svc.tick(dataRef);
  assert.equal(r1.geradas, 6);
  assert.ok(r1.alertadas >= 1);

  const r2 = await svc.tick(dataRef);
  assert.equal(r2.geradas, 0, '2º tick não gera de novo');
  assert.equal(r2.alertadas, 0, '2º tick no mesmo dia não re-alerta');
});

// ---------------------------------------------------------------------------
// REGRA DE DATA — dia 20 caindo no fim de semana antecipa pro dia útil anterior.
// ---------------------------------------------------------------------------

test('regra de data — dia 20 no sábado antecipa pra sexta (dia 19 útil)', () => {
  // Fevereiro/2026: dia 20 é sexta-feira (confere calendário real) — usamos
  // um mês onde dia 20 cai em sábado para o teste valer a pena: agosto/2026.
  // 20/08/2026 é uma quinta (calendário real) — não serve. Construímos a data
  // diretamente via dataUtc para o teste ser autocontido e não depender de
  // "decorar" o calendário de um mês específico.
  const sabado = dataUtc(2026, 6, 20); // 20/06/2026 é sábado (dia da semana 6)
  assert.equal(sabado.getUTCDay(), 6, 'pré-condição do teste: 20/06/2026 precisa ser sábado');

  const antecipado = antecipaParaDiaUtilAnterior(sabado);
  assert.equal(antecipado.getUTCDate(), 19);
  assert.equal(antecipado.getUTCDay(), 5); // sexta-feira
});

test('regra de data — vencimentoDaCompetencia("2026-06", 20) cai em sábado → antecipa p/ sexta 19', () => {
  const venc = vencimentoDaCompetencia('2026-06', 20);
  assert.equal(venc.getUTCFullYear(), 2026);
  assert.equal(venc.getUTCMonth(), 5); // junho (0-indexed)
  assert.equal(venc.getUTCDate(), 19);
  assert.equal(venc.getUTCDay(), 5);
});

test('regra de data — feriado nacional fixo também antecipa (01/05 caindo em dia útil não muda; testamos 25/12)', () => {
  // 25/12/2026 é uma sexta-feira (dia útil por dia-da-semana) MAS é feriado
  // nacional fixo (Natal) — precisa antecipar mesmo sendo "dia útil" no sentido
  // de fim de semana.
  const natal = dataUtc(2026, 12, 25);
  const antecipado = antecipaParaDiaUtilAnterior(natal);
  assert.notEqual(antecipado.getUTCDate(), 25, 'feriado fixo tem que antecipar mesmo em dia de semana');
});
