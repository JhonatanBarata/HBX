import test from 'node:test';
import assert from 'node:assert/strict';

import { CompanyInviteService } from './company-invite.service';

// MODO PUXAR (02/08) — testes que gritam se a cena quebrar:
// 1. anti-enumeração: convite pra e-mail com conta e sem conta responde IGUAL;
// 2. aceite move + REBAIXA (nunca chega admin), zera comissão, congela a conta
//    pessoal e reescreve a policy;
// 3. elegibilidade v1 barra: pagamento aprovado, chip conectado, equipe >1,
//    conta enterprise, convite vencido;
// 4. corrida: convite só resolve UMA vez;
// 5. desligar devolve pra conta pessoal com o cargo do snapshot;
// 6. aceite automático pós-confirmação (cadastro via link) respeita cancelamento.

type AnyRow = Record<string, any>;

function applyUpdate(row: AnyRow, data: AnyRow) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && 'increment' in value) {
      row[key] = Number(row[key] || 0) + Number((value as any).increment || 0);
    } else {
      row[key] = value;
    }
  }
}

function inviteMatches(invite: AnyRow, where: AnyRow) {
  if (!where) return true;
  if (where.id !== undefined && invite.id !== where.id) return false;
  if (where.token !== undefined && invite.token !== where.token) return false;
  if (where.status !== undefined && invite.status !== where.status) return false;
  if (where.email !== undefined && invite.email !== where.email) return false;
  if (where.companyId !== undefined && invite.companyId !== where.companyId) return false;
  if (where.claimedByUserId !== undefined && invite.claimedByUserId !== where.claimedByUserId) return false;
  if (where.expiresAt?.lt !== undefined && !(invite.expiresAt.getTime() < where.expiresAt.lt.getTime())) return false;
  return true;
}

type State = {
  users: AnyRow[];
  companies: AnyRow[];
  invites: AnyRow[];
  charges: AnyRow[];
  policyUpserts: AnyRow[];
  revokedSessions: AnyRow[];
  seq: number;
};

function makeFakePrisma(state: State) {
  const companyById = (id: number | null | undefined) =>
    state.companies.find((c) => c.id === Number(id)) || null;

  const api: any = {
    user: {
      findUnique: async ({ where, select, include }: AnyRow) => {
        const user = state.users.find((u) => u.id === Number(where.id)) || null;
        if (!user) return null;
        const out: AnyRow = { ...user };
        if (select?.company || include?.company) {
          const company = companyById(user.companyId);
          out.company = company ? { ...company } : null;
        }
        return out;
      },
      findFirst: async ({ where }: AnyRow) => {
        return (
          state.users.find(
            (u) =>
              (where.email === undefined || u.email === where.email) &&
              (where.companyId === undefined || u.companyId === where.companyId),
          ) || null
        );
      },
      count: async ({ where }: AnyRow) =>
        state.users.filter(
          (u) =>
            u.companyId === Number(where.companyId) &&
            (where.isActive === undefined || Boolean(u.isActive) === Boolean(where.isActive)),
        ).length,
      update: async ({ where, data }: AnyRow) => {
        const user = state.users.find((u) => u.id === Number(where.id));
        if (!user) throw new Error('user not found');
        applyUpdate(user, data);
        return { ...user };
      },
    },
    companyUserInvite: {
      findUnique: async ({ where, include }: AnyRow) => {
        const invite =
          state.invites.find((i) => (where.id !== undefined ? i.id === where.id : i.token === where.token)) || null;
        if (!invite) return null;
        const out: AnyRow = { ...invite };
        if (include?.company) out.company = companyById(invite.companyId);
        return out;
      },
      findFirst: async ({ where }: AnyRow) => state.invites.find((i) => inviteMatches(i, where)) || null,
      findMany: async ({ where, include }: AnyRow) =>
        state.invites
          .filter((i) => inviteMatches(i, where))
          .map((i) => (include?.company ? { ...i, company: companyById(i.companyId) } : { ...i })),
      create: async ({ data }: AnyRow) => {
        const invite = {
          id: `inv_row_${++state.seq}`,
          status: 'pending',
          claimedByUserId: null,
          acceptedByUserId: null,
          createdAt: new Date(),
          acceptedAt: null,
          declinedAt: null,
          canceledAt: null,
          ...data,
        };
        state.invites.push(invite);
        return { ...invite };
      },
      update: async ({ where, data }: AnyRow) => {
        const invite = state.invites.find((i) => i.id === where.id);
        if (!invite) throw new Error('invite not found');
        applyUpdate(invite, data);
        return { ...invite };
      },
      updateMany: async ({ where, data }: AnyRow) => {
        const targets = state.invites.filter((i) => inviteMatches(i, where));
        targets.forEach((i) => applyUpdate(i, data));
        return { count: targets.length };
      },
    },
    company: {
      findUnique: async ({ where }: AnyRow) => {
        const company = companyById(where.id);
        return company ? { ...company } : null;
      },
      update: async ({ where, data }: AnyRow) => {
        const company = state.companies.find((c) => c.id === Number(where.id));
        if (!company) throw new Error('company not found');
        applyUpdate(company, data);
        return { ...company };
      },
    },
    financeiroCharge: {
      // Simplificação fiel ao uso: o teste só põe charge quando quer o bloqueio.
      count: async ({ where }: AnyRow) => state.charges.filter((c) => c.companyId === Number(where.companyId)).length,
    },
    authSession: {
      updateMany: async ({ where, data }: AnyRow) => {
        state.revokedSessions.push({ where, data });
        return { count: 1 };
      },
    },
    userTeamPolicy: {
      findUnique: async () => null,
      upsert: async (args: AnyRow) => {
        state.policyUpserts.push(args);
        return { id: 'policy_1' };
      },
    },
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(api),
  };
  return api;
}

const FUTURE = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST = () => new Date(Date.now() - 60 * 1000);

function baseState(): State {
  return {
    companies: [
      // 10 = empresa CONTRATANTE; 20 = conta PESSOAL elegível do convidado.
      { id: 10, name: 'Distribuidora Alfa', companyKind: 'tenant', accountType: 'credit', seatCap: null, commissionDueBusinessDays: 3, dormantAt: null, whatsappConnectionMode: 'NONE', whatsappTemporaryStatus: 'NOT_CONNECTED', currentWhatsappConnectionSessionId: null },
      { id: 20, name: 'Conta do João', companyKind: 'tenant', accountType: 'credit', seatCap: null, commissionDueBusinessDays: 3, dormantAt: null, whatsappConnectionMode: 'NONE', whatsappTemporaryStatus: 'NOT_CONNECTED', currentWhatsappConnectionSessionId: null },
    ],
    users: [
      { id: 1, email: 'admin@alfa.com', role: 'ADMIN', companyId: 10, isSystemMaster: false, isActive: true, emailConfirmedAt: new Date(), googleId: null, personalCompanyId: null, personalRoleSnapshot: null, canViewBilling: true, commissionPercent: 0, sessionVersion: 0 },
      { id: 2, email: 'joao@gmail.com', role: 'ADMIN', companyId: 20, isSystemMaster: false, isActive: true, emailConfirmedAt: new Date(), googleId: null, personalCompanyId: null, personalRoleSnapshot: null, canViewBilling: true, commissionPercent: 5, sessionVersion: 0 },
    ],
    invites: [],
    charges: [],
    policyUpserts: [],
    revokedSessions: [],
    seq: 0,
  };
}

function makeService(state: State, mailOk = true) {
  const prisma = makeFakePrisma(state);
  const mail = { sendMail: async () => ({ ok: mailOk }) } as any;
  return new CompanyInviteService(prisma, mail);
}

const admin = { id: 1, companyId: 10, email: 'admin@alfa.com' };

test('anti-enumeração: convite pra e-mail COM conta e SEM conta responde igual', async () => {
  const state = baseState();
  const service = makeService(state);
  const comConta = await service.createInvite(admin, 'joao@gmail.com');
  const semConta = await service.createInvite(admin, 'ninguem@gmail.com');
  assert.equal(comConta.message, 'Convite enviado.');
  assert.equal(semConta.message, 'Convite enviado.');
  assert.deepEqual(Object.keys(comConta).sort(), Object.keys(semConta).sort());
  // Link copiável pro zap nos dois casos.
  assert.match(comConta.inviteUrl, /\/convite\/inv_/);
  assert.match(semConta.inviteUrl, /\/convite\/inv_/);
});

test('convite pra e-mail da própria equipe é o ÚNICO erro (não vaza outro tenant)', async () => {
  const state = baseState();
  state.users.push({ id: 3, email: 'vendedor@alfa.com', role: 'USER', companyId: 10, isSystemMaster: false, isActive: true });
  const service = makeService(state);
  await assert.rejects(() => service.createInvite(admin, 'vendedor@alfa.com'), /já faz parte da sua equipe/);
  await assert.rejects(() => service.createInvite(admin, 'admin@alfa.com'), /próprio e-mail/);
});

test('reenvio pro mesmo e-mail reusa o token (link do zap continua valendo)', async () => {
  const state = baseState();
  const service = makeService(state);
  const primeiro = await service.createInvite(admin, 'joao@gmail.com');
  const segundo = await service.createInvite(admin, 'joao@gmail.com');
  assert.equal(primeiro.inviteUrl, segundo.inviteUrl);
  assert.equal(state.invites.length, 1);
});

test('aceite move o usuário: vira VENDEDOR (nunca admin), zera comissão, congela a conta pessoal e reescreve a policy', async () => {
  const state = baseState();
  const service = makeService(state);
  await service.createInvite(admin, 'joao@gmail.com');
  const invite = state.invites[0];

  const result = await service.acceptInvite(2, invite.id);
  assert.equal(result.companyId, 10);
  assert.equal(result.companyName, 'Distribuidora Alfa');

  const joao = state.users.find((u) => u.id === 2)!;
  assert.equal(joao.companyId, 10);
  assert.equal(joao.role, 'USER'); // REBAIXADO — era ADMIN da conta pessoal
  assert.equal(joao.canViewBilling, false); // Lei do Vendedor: nunca vê valores
  assert.equal(joao.commissionPercent, 0);
  assert.equal(joao.personalCompanyId, 20);
  assert.equal(joao.personalRoleSnapshot, 'ADMIN');
  assert.equal(joao.sessionVersion, 1); // sessões antigas (empresa velha) morrem

  const pessoal = state.companies.find((c) => c.id === 20)!;
  assert.ok(pessoal.dormantAt instanceof Date); // conta pessoal CONGELADA

  assert.equal(invite.status, 'accepted');
  assert.equal(invite.acceptedByUserId, 2);
  // Policy reescrita pro cargo novo (overwrite explícito).
  assert.equal(state.policyUpserts.length, 1);
  assert.equal(state.policyUpserts[0].update.roleSnapshot, 'USER');
});

test('elegibilidade v1 barra: pagamento aprovado / chip conectado / equipe >1 / conta enterprise', async () => {
  const casos: Array<{ nome: string; prepara: (state: State) => void; erro: RegExp }> = [
    { nome: 'pagamento', prepara: (s) => { s.charges.push({ companyId: 20 }); }, erro: /já tem pagamentos/ },
    { nome: 'chip', prepara: (s) => { s.companies[1].whatsappTemporaryStatus = 'TEMPORARY'; }, erro: /Desconecte o WhatsApp/ },
    { nome: 'equipe', prepara: (s) => { s.users.push({ id: 9, email: 'outro@x.com', role: 'USER', companyId: 20, isActive: true }); }, erro: /outros usuários/ },
    { nome: 'enterprise', prepara: (s) => { s.companies[1].accountType = 'enterprise'; }, erro: /empresarial/ },
  ];
  for (const caso of casos) {
    const state = baseState();
    const service = makeService(state);
    await service.createInvite(admin, 'joao@gmail.com');
    caso.prepara(state);
    await assert.rejects(() => service.acceptInvite(2, state.invites[0].id), caso.erro, caso.nome);
    assert.equal(state.users.find((u) => u.id === 2)!.companyId, 20, `${caso.nome}: usuário não pode ter sido movido`);
  }
});

test('convite vencido: aceite falha e o status vira expired', async () => {
  const state = baseState();
  const service = makeService(state);
  await service.createInvite(admin, 'joao@gmail.com');
  state.invites[0].expiresAt = PAST();
  await assert.rejects(() => service.acceptInvite(2, state.invites[0].id), /expirou/);
  assert.equal(state.invites[0].status, 'expired');
});

test('corrida: convite só resolve UMA vez (segundo aceite falha sem mover de novo)', async () => {
  const state = baseState();
  const service = makeService(state);
  await service.createInvite(admin, 'joao@gmail.com');
  const invite = state.invites[0];
  await service.acceptInvite(2, invite.id);
  await assert.rejects(() => service.acceptInvite(2, invite.id), /já faz parte desta empresa|já foi resolvido/);
});

test('desligar devolve pra conta pessoal: cargo do snapshot, descongela, sessões mortas', async () => {
  const state = baseState();
  const service = makeService(state);
  await service.createInvite(admin, 'joao@gmail.com');
  await service.acceptInvite(2, state.invites[0].id);

  const result = await service.releaseUserToPersonal(admin, 2);
  assert.match(result.message, /voltou para a conta pessoal/);

  const joao = state.users.find((u) => u.id === 2)!;
  assert.equal(joao.companyId, 20);
  assert.equal(joao.role, 'ADMIN'); // snapshot restaurado
  assert.equal(joao.canViewBilling, true);
  assert.equal(joao.personalCompanyId, null);
  assert.equal(joao.sessionVersion, 2);
  assert.equal(state.companies.find((c) => c.id === 20)!.dormantAt, null); // DESCONGELADA
});

test('desligar exige vínculo de conta pessoal (vendedor criado na mão não tem)', async () => {
  const state = baseState();
  state.users.push({ id: 5, email: 'manual@alfa.com', role: 'USER', companyId: 10, isSystemMaster: false, isActive: true, personalCompanyId: null });
  const service = makeService(state);
  await assert.rejects(() => service.releaseUserToPersonal(admin, 5), /não veio de conta pessoal/);
});

test('aceite automático pós-confirmação: claim aceita; convite cancelado NÃO move e vira conta normal', async () => {
  const state = baseState();
  const service = makeService(state);
  await service.createInvite(admin, 'joao@gmail.com');
  const invite = state.invites[0];
  await service.attachClaim(invite.id, 2);

  // Cancelado no meio → best-effort devolve accepted:false e nada se move.
  invite.status = 'canceled';
  const cancelado = await service.acceptClaimedInviteAfterConfirm(2);
  assert.equal(cancelado, null); // claim só busca pendente
  assert.equal(state.users.find((u) => u.id === 2)!.companyId, 20);

  // Pendente → aceita sozinho.
  invite.status = 'pending';
  invite.expiresAt = FUTURE();
  const aceito = await service.acceptClaimedInviteAfterConfirm(2);
  assert.equal(aceito?.accepted, true);
  assert.equal(aceito?.companyId, 10);
  assert.equal(state.users.find((u) => u.id === 2)!.companyId, 10);
});

test('teto de assentos da empresa barra o aceite', async () => {
  const state = baseState();
  state.companies[0].seatCap = 1; // só o admin cabe
  const service = makeService(state);
  await service.createInvite(admin, 'joao@gmail.com');
  await assert.rejects(() => service.acceptInvite(2, state.invites[0].id), /teto de acessos/);
});
