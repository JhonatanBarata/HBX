// S7 LEAD-CENTRICO (docs/PLANEJAMENTOS/PR25072026-LEAD-CENTRICO/07-pool-raiz.md) —
// testes da marquinha/supressão global de contato. Cobre o aceite do sprint:
// (1) lead suprimido não volta na entrega (filterSuppressed), (2) janelas por
// motivo (sem_interesse ~12m / nao_atendeu ~90d), (3) opt-out e
// contato_invalido são permanentes, (4) convertido/outro NÃO marcam,
// (5) o contrato de leitura nunca devolve reason/origem (só boolean).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  VendasContactSuppressionService,
  normalizeSuppressionCnpj,
  normalizeSuppressionEmail,
  normalizeSuppressionPhone,
} from './vendas-contact-suppression.service';

type Row = {
  id: string;
  contactType: string;
  contactKey: string;
  reason: string;
  suppressedAt: Date;
  expiresAt: Date | null;
  originCompanyId: number | null;
  originLeadId: string | null;
  createdAt: Date;
};

function matchesWhere(row: Row, where: any): boolean {
  if (!where) return true;
  if (Array.isArray(where.OR)) {
    if (!where.OR.some((cond: any) => matchesWhere(row, cond))) return false;
  }
  if (Array.isArray(where.AND)) {
    if (!where.AND.every((cond: any) => matchesWhere(row, cond))) return false;
  }
  for (const key of Object.keys(where)) {
    if (key === 'OR' || key === 'AND') continue;
    const cond = where[key];
    const actual = (row as any)[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if (Array.isArray(cond.in)) {
        if (!cond.in.includes(actual)) return false;
        continue;
      }
      if (cond.gt !== undefined) {
        if (!(actual instanceof Date) || !(actual.getTime() > cond.gt.getTime())) return false;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(cond, 'equals')) {
        if (actual !== cond.equals) return false;
        continue;
      }
      // objeto vazio ou shape não usado por este service — trata como no-op
      continue;
    }
    if (cond === null) {
      if (actual !== null && actual !== undefined) return false;
      continue;
    }
    if (actual !== cond) return false;
  }
  return true;
}

function makeFakePrisma() {
  const rows: Row[] = [];
  let seq = 0;
  return {
    rows,
    vendasContactSuppression: {
      async createMany({ data }: { data: any[] }) {
        for (const item of data) {
          seq += 1;
          rows.push({
            id: `sup-${seq}`,
            contactType: item.contactType,
            contactKey: item.contactKey,
            reason: item.reason,
            suppressedAt: item.suppressedAt,
            expiresAt: item.expiresAt ?? null,
            originCompanyId: item.originCompanyId ?? null,
            originLeadId: item.originLeadId ?? null,
            createdAt: item.suppressedAt || new Date(),
          });
        }
        return { count: data.length };
      },
      async findFirst({ where }: { where: any }) {
        const matches = rows.filter((row) => matchesWhere(row, where));
        matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return matches[0] || null;
      },
      async findMany({ where }: { where: any }) {
        return rows.filter((row) => matchesWhere(row, where));
      },
    },
  };
}

test('normalizeSuppressionPhone/Email/Cnpj: só dígitos (phone/cnpj) e lowercase trim (email)', () => {
  assert.equal(normalizeSuppressionPhone('(19) 99702-4884'), '19997024884');
  assert.equal(normalizeSuppressionEmail(' Fulano@Exemplo.COM '), 'fulano@exemplo.com');
  assert.equal(normalizeSuppressionCnpj('40.032.304/0001-54'), '40032304000154');
  assert.equal(normalizeSuppressionPhone(''), null);
  assert.equal(normalizeSuppressionEmail(''), null);
});

test('mark + isSuppressed: telefone marcado fica suprimido; outro telefone não bate', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  await svc.mark({ phone: '19997024884' }, 'sem_interesse', { companyId: 1, leadId: 'lead-a' });

  const hit = await svc.isSuppressed({ phone: '19997024884' });
  assert.equal(hit.suppressed, true);
  assert.equal(hit.matchedType, 'phone');

  const miss = await svc.isSuppressed({ phone: '11988887777' });
  assert.equal(miss.suppressed, false);
  assert.equal(miss.matchedType, null);
});

test('isSuppressed: contrato de leitura NUNCA devolve reason/origem — só boolean + tipo de chave', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  await svc.mark({ email: 'contato@empresa.com' }, 'opt_out', { companyId: 5, leadId: 'lead-privado' });

  const result = await svc.isSuppressed({ email: 'contato@empresa.com' });
  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, ['matchedType', 'suppressed']);
  assert.equal((result as any).reason, undefined);
  assert.equal((result as any).originCompanyId, undefined);
  assert.equal((result as any).originLeadId, undefined);
});

test('janela por motivo: sem_interesse ~365 dias, nao_atendeu ~90 dias (defaults)', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  const before = Date.now();
  await svc.mark({ email: 'a@a.com' }, 'sem_interesse', {});
  await svc.mark({ email: 'b@b.com' }, 'nao_atendeu', {});

  const rowA = prisma.rows.find((r) => r.contactKey === 'a@a.com')!;
  const rowB = prisma.rows.find((r) => r.contactKey === 'b@b.com')!;
  assert.ok(rowA.expiresAt, 'sem_interesse tem expiresAt (não é permanente)');
  assert.ok(rowB.expiresAt, 'nao_atendeu tem expiresAt (não é permanente)');
  const daysA = Math.round((rowA.expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000));
  const daysB = Math.round((rowB.expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000));
  assert.ok(daysA >= 364 && daysA <= 366, `sem_interesse deveria ser ~365 dias, foi ${daysA}`);
  assert.ok(daysB >= 89 && daysB <= 91, `nao_atendeu deveria ser ~90 dias, foi ${daysB}`);
});

test('dosagem do dono 30/07: ja_tem ~90d, preco ~60d, sem_perfil PERMANENTE', async () => {
  // Item 4 do dia de vendedor — antes os três caíam no genérico sem_interesse/12m.
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  const before = Date.now();
  await svc.mark({ email: 'jatem@a.com' }, 'ja_tem', {});
  await svc.mark({ email: 'preco@a.com' }, 'preco', {});
  await svc.mark({ email: 'semperfil@a.com' }, 'sem_perfil', {});

  const rowJaTem = prisma.rows.find((r) => r.contactKey === 'jatem@a.com')!;
  const rowPreco = prisma.rows.find((r) => r.contactKey === 'preco@a.com')!;
  const rowSemPerfil = prisma.rows.find((r) => r.contactKey === 'semperfil@a.com')!;
  const days = (row: { expiresAt: Date | null }) => Math.round((row.expiresAt!.getTime() - before) / (24 * 60 * 60 * 1000));
  assert.ok(rowJaTem.expiresAt, 'ja_tem expira (quem tem fornecedor hoje troca amanhã)');
  assert.ok(days(rowJaTem) >= 89 && days(rowJaTem) <= 91, `ja_tem deveria ser ~90 dias, foi ${days(rowJaTem)}`);
  assert.ok(rowPreco.expiresAt, 'preco expira (preço muda, condição volta)');
  assert.ok(days(rowPreco) >= 59 && days(rowPreco) <= 61, `preco deveria ser ~60 dias, foi ${days(rowPreco)}`);
  assert.equal(rowSemPerfil.expiresAt, null, 'sem_perfil é permanente — insistir queima chip');

  assert.equal((await svc.isSuppressed({ email: 'jatem@a.com' })).suppressed, true);
  assert.equal((await svc.isSuppressed({ email: 'preco@a.com' })).suppressed, true);
  assert.equal((await svc.isSuppressed({ email: 'semperfil@a.com' })).suppressed, true);
});

test('opt_out e contato_invalido são PERMANENTES (expiresAt null)', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  await svc.mark({ email: 'permanente@a.com' }, 'opt_out', {});
  await svc.mark({ phone: '11999998888' }, 'contato_invalido', {});

  const rowOptOut = prisma.rows.find((r) => r.contactKey === 'permanente@a.com')!;
  const rowInvalido = prisma.rows.find((r) => r.contactType === 'phone' && r.reason === 'contato_invalido')!;
  assert.equal(rowOptOut.expiresAt, null);
  assert.equal(rowInvalido.expiresAt, null);

  const stillSuppressedFarFuture = await svc.isSuppressed({ email: 'permanente@a.com' });
  assert.equal(stillSuppressedFarFuture.suppressed, true);
});

test('applyAutoSuppressionForClosedLead: convertido e outro NÃO marcam (sinal fraco demais)', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  const countConvertido = await svc.applyAutoSuppressionForClosedLead({ email: 'x@x.com' }, 'convertido', {});
  const countOutro = await svc.applyAutoSuppressionForClosedLead({ email: 'y@y.com' }, 'outro', {});
  assert.equal(countConvertido, 0);
  assert.equal(countOutro, 0);
  assert.equal(prisma.rows.length, 0);
});

test('applyAutoSuppressionForClosedLead: sem_interesse/nao_atendeu/contato_invalido marcam', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  await svc.applyAutoSuppressionForClosedLead({ phone: '11911112222' }, 'sem_interesse', { companyId: 9, leadId: 'l1' });
  await svc.applyAutoSuppressionForClosedLead({ phone: '11933334444' }, 'nao_atendeu', { companyId: 9, leadId: 'l2' });
  await svc.applyAutoSuppressionForClosedLead({ phone: '11955556666' }, 'contato_invalido', { companyId: 9, leadId: 'l3' });
  assert.equal(prisma.rows.length, 3);
});

test('filterSuppressed: lead suprimido NÃO volta na entrega (pool/import/radar), contador correto', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  await svc.mark({ phone: '19911112222' }, 'sem_interesse', { companyId: 1, leadId: 'lead-a' });

  const candidates = [
    { id: 'c1', phone: '19911112222', email: null }, // suprimido
    { id: 'c2', phone: '19933334444', email: null }, // livre
    { id: 'c3', phone: null, email: 'permitido@empresa.com' }, // livre
  ];
  const { allowed, suppressedCount } = await svc.filterSuppressed(candidates, (item) => ({
    phone: item.phone,
    email: item.email,
  }));
  assert.equal(suppressedCount, 1);
  assert.equal(allowed.length, 2);
  assert.ok(!allowed.some((item) => item.id === 'c1'), 'candidato suprimido não pode voltar na entrega');
  assert.ok(allowed.some((item) => item.id === 'c2'));
  assert.ok(allowed.some((item) => item.id === 'c3'));
});

test('filterSuppressed: lista vazia ou sem chaves não quebra e não filtra nada', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  const empty = await svc.filterSuppressed([], () => ({}));
  assert.equal(empty.allowed.length, 0);
  assert.equal(empty.suppressedCount, 0);

  const noKeys = await svc.filterSuppressed([{ id: 1 }], () => ({}));
  assert.equal(noKeys.allowed.length, 1);
  assert.equal(noKeys.suppressedCount, 0);
});

test('cnpj: marca e supressão batem pela chave CNPJ mesmo com telefone/e-mail diferentes (empresa reciclável, contato carrega o opt-out)', async () => {
  const prisma = makeFakePrisma();
  const svc = new VendasContactSuppressionService(prisma as any);
  await svc.mark({ cnpj: '11222333000181' }, 'opt_out', { companyId: 2, leadId: 'lead-x' });

  const hit = await svc.isSuppressed({ cnpj: '11.222.333/0001-81', phone: '11900001111', email: 'novo@dominio.com' });
  assert.equal(hit.suppressed, true);
  assert.equal(hit.matchedType, 'cnpj');
});
