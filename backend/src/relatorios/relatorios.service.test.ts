import test from 'node:test';
import assert from 'node:assert/strict';

import { RelatoriosService } from './relatorios.service';

// WORM-18 — testa gate (LEI DO VENDEDOR) + a matematica das agregacoes.
// SO LEITURA: mockamos o prisma. O caminho de acesso (resolveVendasAccessContext)
// so precisa de user.findUnique + userTeamPolicy.findUnique.

const COMPANY_ID = 7;
const ADMIN_ID = 1;
const SELLER_ID = 2;

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

// prisma mock parametrizavel. `who` = role do usuario logado; `data` = linhas
// que cada tabela devolve nos widgets. canViewBilling controla a Lei do Vendedor.
function createPrisma(opts: {
  role?: string;
  canViewBilling?: boolean;
  vendasLead?: any[];
  conversations?: any[];
  users?: any[];
} = {}) {
  const role = opts.role || 'ADMIN';
  const users = opts.users || [
    { id: ADMIN_ID, name: 'Dono', email: 'dono@x.com' },
    { id: SELLER_ID, name: 'Vendedor A', email: 'a@x.com' },
  ];
  return {
    user: {
      findUnique: async ({ where, select }: any) => {
        // usado por resolveCanViewValues (select canViewBilling) e pelo hydrate
        if (select && select.canViewBilling && !select.role) {
          return { canViewBilling: opts.canViewBilling !== false };
        }
        return {
          id: where.id,
          role,
          isSystemMaster: false,
          companyId: COMPANY_ID,
          isActive: true,
          deactivatedAt: null,
          company: { id: COMPANY_ID, name: 'Empresa', companyKind: 'client' },
        };
      },
      findMany: async () => users,
    },
    userTeamPolicy: { findUnique: async () => null },
    vendasLead: { findMany: async () => opts.vendasLead || [] },
    companyConversation: { findMany: async () => opts.conversations || [] },
  } as any;
}

const adminUser = { id: ADMIN_ID };
const sellerUser = { id: SELLER_ID };

// ── GATE: LEI DO VENDEDOR ───────────────────────────────────────────────────

test('vendedor (role USER) recebe 403 em qualquer widget', async () => {
  const prisma = createPrisma({ role: 'USER' });
  const service = new RelatoriosService(prisma);
  await assert.rejects(() => service.getFunnelRevenue(sellerUser, '7d'), /exclusivos do Admin/);
  await assert.rejects(() => service.getUnansweredChats(sellerUser), /exclusivos do Admin/);
  await assert.rejects(() => service.getBotFunnel(sellerUser, '7d'), /exclusivos do Admin/);
});

test('Admin com canViewBilling=false (Gerente) NAO ve R$ no funil (value=null)', async () => {
  const prisma = createPrisma({
    canViewBilling: false,
    vendasLead: [
      { status: 'encerrado', saleStatus: 'sale_confirmed', saleValue: 999, saleConfirmedAt: new Date(), closedAt: new Date() },
    ],
  });
  const service = new RelatoriosService(prisma);
  const out = await service.getFunnelRevenue(adminUser, 'today');
  assert.equal(out.canViewValues, false);
  assert.equal(out.won.count, 1); // conta a venda
  assert.equal(out.won.value, null); // mas esconde o R$
});

test('Admin dono (canViewBilling=true) ve o R$ ganho', async () => {
  const prisma = createPrisma({
    canViewBilling: true,
    vendasLead: [
      { status: 'encerrado', saleStatus: 'sale_confirmed', saleValue: 250, saleConfirmedAt: new Date(), closedAt: new Date() },
      { status: 'encerrado', saleStatus: 'none', saleValue: 0, saleConfirmedAt: null, closedAt: new Date() },
    ],
  });
  const service = new RelatoriosService(prisma);
  const out = await service.getFunnelRevenue(adminUser, 'today');
  assert.equal(out.canViewValues, true);
  assert.equal(out.won.count, 1);
  assert.equal(out.won.value, 250);
  assert.equal(out.lost.count, 1); // o encerrado sem venda
});

// ── Widget 2 — chats sem resposta >2h ───────────────────────────────────────

test('chats sem resposta: conta so quando a ultima msg e do lead (INBOUND) ha >2h', async () => {
  const prisma = createPrisma({
    conversations: [
      // ultima msg do lead ha 3h => conta, atribuida ao vendedor A
      { id: 1, assignedUserId: SELLER_ID, currentStep: 'novo', lastMessageAt: hoursAgo(3), messages: [{ direction: 'INBOUND', timestamp: hoursAgo(3) }] },
      // ultima msg foi da empresa (OUTBOUND) => nao conta
      { id: 2, assignedUserId: SELLER_ID, currentStep: 'novo', lastMessageAt: hoursAgo(4), messages: [{ direction: 'OUTBOUND', timestamp: hoursAgo(4) }] },
      // lead falou ha 1h (dentro do limite) => nao conta (filtrado no cutoff, mas garante)
      { id: 3, assignedUserId: SELLER_ID, currentStep: 'novo', lastMessageAt: hoursAgo(1), messages: [{ direction: 'INBOUND', timestamp: hoursAgo(1) }] },
    ],
  });
  const service = new RelatoriosService(prisma);
  const out = await service.getUnansweredChats(adminUser);
  assert.equal(out.total, 1);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].seller, 'Vendedor A');
  assert.equal(out.rows[0].count, 1);
});

// ── Widget 3 — entregues x trabalhados x convertidos ────────────────────────

test('seller-funnel conta cards criados, trabalhados e convertidos por vendedor', async () => {
  const now = new Date();
  const prisma = createPrisma({
    vendasLead: [
      { assignedUserId: SELLER_ID, createdAt: now, attemptCount: 2, lastContactAt: now, saleStatus: 'none', saleConfirmedAt: null },
      { assignedUserId: SELLER_ID, createdAt: now, attemptCount: 0, lastContactAt: null, saleStatus: 'sale_confirmed', saleConfirmedAt: now },
    ],
  });
  const service = new RelatoriosService(prisma);
  const out = await service.getSellerFunnel(adminUser, '30d');
  const row = out.rows.find((r: any) => r.userId === SELLER_ID);
  assert.ok(row);
  assert.equal(row.delivered, 2);
  assert.equal(row.worked, 1); // so o de attemptCount>0
  assert.equal(row.converted, 1);
});

// ── Widget 4 — tempo medio 1ª resposta ──────────────────────────────────────

test('first-response mede gap do 1o INBOUND ate a 1a resposta HUMANA', async () => {
  const t0 = new Date(Date.now() - 30 * 60 * 1000); // lead falou
  const t1 = new Date(Date.now() - 20 * 60 * 1000); // humano respondeu 10min depois
  const prisma = createPrisma({
    conversations: [
      {
        id: 1,
        assignedUserId: SELLER_ID,
        messages: [
          { direction: 'INBOUND', senderType: 'client', timestamp: t0 },
          { direction: 'OUTBOUND', senderType: 'bot', timestamp: new Date(t0.getTime() + 60 * 1000) }, // bot nao conta
          { direction: 'OUTBOUND', senderType: 'human', timestamp: t1 },
        ],
      },
    ],
  });
  const service = new RelatoriosService(prisma);
  const out = await service.getFirstResponseTime(adminUser, '7d');
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].samples, 1);
  assert.equal(out.rows[0].avgMinutes, 10);
});

// ── Widget 5 — recem-abertas <48h ───────────────────────────────────────────

test('fresh leads: aproveitada = contato em <48h da criacao', async () => {
  const created = new Date(Date.now() - 72 * 60 * 60 * 1000); // criado ha 3 dias
  const prisma = createPrisma({
    vendasLead: [
      // contatado 10h depois de criado => aproveitado
      { createdAt: created, lastContactAt: new Date(created.getTime() + 10 * 60 * 60 * 1000), attemptCount: 1 },
      // criado ha 3d, nunca contatado => missed
      { createdAt: created, lastContactAt: null, attemptCount: 0 },
    ],
  });
  const service = new RelatoriosService(prisma);
  const out = await service.getFreshLeadsUsage(adminUser, '30d');
  assert.equal(out.opened, 2);
  assert.equal(out.usedIn48h, 1);
  assert.equal(out.missed, 1);
  assert.equal(out.ratePct, 50);
});

// ── Widget 6 — IA tocou x devolveu x converteu ──────────────────────────────

test('bot funnel: tocada (bot), devolvida (humanAssigned) e convertida (match telefone)', async () => {
  const now = new Date();
  const prisma = createPrisma({
    conversations: [
      { id: 1, contact: '+55 11 99999-8888', botActive: true, humanAssigned: true, messages: [{ id: 'm1' }] },
      { id: 2, contact: '5511777770000', botActive: false, humanAssigned: false, messages: [] }, // nao tocada
    ],
    vendasLead: [
      { phone: '+5511999998888', phoneNormalized: '5511999998888', saleStatus: 'sale_confirmed', saleConfirmedAt: now },
    ],
  });
  const service = new RelatoriosService(prisma);
  const out = await service.getBotFunnel(adminUser, '7d');
  assert.equal(out.touched, 1);
  assert.equal(out.handedToHuman, 1);
  assert.equal(out.converted, 1); // telefone bateu
});
