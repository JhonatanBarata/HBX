import test from 'node:test';
import assert from 'node:assert/strict';

import { WebsiteLeadCaptureService } from './website-lead-capture.service';

// PR22082026-CLIENTE-ME-ACHA — a prova do "Quero que a HBX me ligue".
// Fakes mínimos: prisma (empresa/usuário/tenant HBX), ledger de dedup, VendasService
// (intake do lead), WebwhatsBridge (não usado aqui) e MailService. O que se prova é a
// ORQUESTRAÇÃO: vira lead no tenant HBX com origem `app_logistica` + e-mail pro suporte;
// dedup de 5 min; sem tenant HBX a trilha do e-mail ainda salva o pedido; nada saindo =
// ok:false (o controller responde 503 com a saída do WhatsApp).

process.env.ADMIN_SUPPORT_EMAIL = 'suporte@hbx.test';

// `semAdminHbx` (e não "sem tenant HBX"): resolveHbxPlatformCompanyId cacheia o id do tenant
// por 30 s no MÓDULO, então dentro da mesma suíte o tenant "some" só por 30 s — a trilha do
// lead falhar por "HBX sem ADMIN" exercita o MESMO ramo (lead cai, e-mail salva).
function buildService(opts?: { semAdminHbx?: boolean; mailFalha?: boolean; leadFalha?: boolean }) {
  const leads: any[] = [];
  const mails: any[] = [];
  const processed = new Set<string>();
  const received: any[] = [];

  const prisma: any = {
    company: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Distribuidora Bom Gás', contactPhone: '19 99111-2222', contactEmail: 'dono@bomgas.com' }),
      findFirst: async ({ where }: any) => (where?.name === 'HBX' ? { id: 5 } : null),
    },
    user: {
      findUnique: async ({ where }: any) => ({ id: where.id, name: 'Carlos', email: 'carlos@bomgas.com', role: 'ADMIN' }),
      findFirst: async ({ where }: any) => (!opts?.semAdminHbx && where?.companyId === 5 && where?.role === 'ADMIN' ? { id: 6 } : null),
    },
  };
  const webhookLedger: any = {
    wasProcessed: async (_p: string, id: string) => processed.has(id),
    recordReceived: async (_p: string, id: string, payload: any) => { received.push({ id, payload }); },
    markProcessed: async (_p: string, id: string) => { processed.add(id); },
  };
  const vendas: any = {
    intakeAdvertisingLead: async (input: any) => {
      if (opts?.leadFalha) throw new Error('vendas fora');
      leads.push(input);
      return { leadId: `lead-${leads.length}`, action: 'created', reusedExisting: false };
    },
  };
  const webwhats: any = { hasOperationalSession: async () => false };
  const mail: any = {
    sendMail: async (input: any) => {
      if (opts?.mailFalha) throw new Error('smtp fora');
      mails.push(input);
      return { ok: true };
    },
  };
  const service = new WebsiteLeadCaptureService(prisma, webhookLedger, vendas, webwhats, mail);
  return { service, leads, mails, received };
}

const ACTOR = { id: 42, companyId: 41, email: 'carlos@bomgas.com', name: 'Carlos', role: 'ADMIN' };

test('vira lead no tenant HBX (origem app_logistica, quente) + e-mail pro suporte', async () => {
  const { service, leads, mails } = buildService();
  const r = await service.captureAppContact(ACTOR, { assunto: 'creditos', telefone: '(19) 99888-7766', mensagem: 'quero saber do plano' });
  assert.deepEqual(r, { ok: true, lead: true, email: true, reason: undefined });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].companyId, 5, 'lead cai no tenant HBX, nunca no tenant do cliente');
  assert.equal(leads[0].assignedUserId, 6);
  assert.equal(leads[0].source, 'app_logistica');
  assert.equal(leads[0].temperature, 'quente');
  assert.equal(leads[0].phone, '19998887766');
  assert.equal(leads[0].email, 'carlos@bomgas.com');
  assert.match(leads[0].name, /Distribuidora Bom Gás — Carlos/);
  assert.match(leads[0].shortNote, /Créditos e plano/);
  assert.match(leads[0].shortNote, /#41/);
  assert.match(leads[0].shortNote, /quero saber do plano/);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'suporte@hbx.test');
  assert.match(mails[0].subject, /Distribuidora Bom Gás pediu contato — Créditos e plano/);
});

test('sem telefone no pedido usa o telefone da empresa; assunto livre vira texto', async () => {
  const { service, leads } = buildService();
  const r = await service.captureAppContact(ACTOR, { assunto: 'Quero emitir nota', telefone: '' });
  assert.equal(r.ok, true);
  assert.equal(leads[0].phone, '19991112222');
  assert.match(leads[0].shortNote, /Quero emitir nota/);
});

test('dedup: segundo toque da mesma empresa+assunto em 5 min não cria 2º lead nem 2º e-mail', async () => {
  const { service, leads, mails } = buildService();
  await service.captureAppContact(ACTOR, { assunto: 'fiscal' });
  const again = await service.captureAppContact(ACTOR, { assunto: 'fiscal' });
  assert.equal(again.ok, true);
  assert.equal(again.reason, 'duplicate');
  assert.equal(leads.length, 1);
  assert.equal(mails.length, 1);
});

test('tenant HBX sem ADMIN: o lead falha mas o e-mail salva o pedido → ok:true', async () => {
  const { service, leads, mails } = buildService({ semAdminHbx: true });
  const r = await service.captureAppContact(ACTOR, { assunto: 'vendas' });
  assert.equal(r.ok, true);
  assert.equal(r.lead, false);
  assert.equal(r.email, true);
  assert.equal(leads.length, 0);
  assert.equal(mails.length, 1);
});

test('nada saiu (lead E e-mail falharam) → ok:false, e o pedido NÃO é marcado como processado', async () => {
  const { service } = buildService({ leadFalha: true, mailFalha: true });
  const r = await service.captureAppContact(ACTOR, { assunto: 'outro' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'nenhuma_trilha_saiu');
  // tentar de novo NÃO cai no dedup (o 1º não foi processado)
  const r2 = await service.captureAppContact(ACTOR, { assunto: 'outro' });
  assert.equal(r2.ok, false);
  assert.notEqual(r2.reason, 'duplicate');
});

test('sem empresa em contexto: ok:false neutro', async () => {
  const { service, leads, mails } = buildService();
  const r = await service.captureAppContact({ id: 1, companyId: 0 }, { assunto: 'creditos' });
  assert.equal(r.ok, false);
  assert.equal(leads.length, 0);
  assert.equal(mails.length, 0);
});
