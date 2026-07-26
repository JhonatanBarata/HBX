import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMERCIAL_EMAIL_OPT_OUT_LINE, SenderIdentityService } from './sender-identity.service';
import { EmailTemplateService } from './email-template.service';

// S6 LEAD-CENTRICO (06-email-v1.md): perfil do remetente por usuário (nome vem de
// User.name; cargo/telefone/site vêm de UserSenderProfile) — regra dura: sem
// nome+cargo+telefone, `resolveSummary().ready` é false (quem chama pula o envio).

function buildService(overrides?: {
  users?: Record<string, any>;
  companies?: Record<string, any>;
  profiles?: Record<string, any>;
  hasTable?: boolean;
}) {
  const users: Record<number, any> = { 1: { name: 'Vendedor Completo' }, 2: { name: null }, ...(overrides?.users || {}) };
  const companies: Record<number, any> = { 7: { name: 'Empresa Teste' }, ...(overrides?.companies || {}) };
  // overrides?.profiles SUBSTITUI o default (não faz merge) — senão `profiles: {}`
  // pra simular "sem cadastro" continuaria enxergando o userId 1 default.
  const profiles: Record<number, any> = overrides?.profiles !== undefined
    ? { ...overrides.profiles }
    : { 1: { userId: 1, companyId: 7, jobTitle: 'Consultor Comercial', phone: '(11) 90000-0000', website: 'empresa.com.br' } };
  const upserts: any[] = [];

  const prisma: any = {
    hasTable: async () => overrides?.hasTable !== false,
    user: {
      findUnique: async ({ where }: any) => users[where.id] || null,
    },
    company: {
      findUnique: async ({ where }: any) => companies[where.id] || null,
    },
    userSenderProfile: {
      findUnique: async ({ where }: any) => profiles[where.userId] || null,
      upsert: async ({ where, create, update }: any) => {
        upserts.push({ where, create, update });
        profiles[where.userId] = { ...(profiles[where.userId] || create), ...update };
        return profiles[where.userId];
      },
    },
  };

  const service = new SenderIdentityService(prisma, new EmailTemplateService(prisma));
  return { service, upserts };
}

test('resolveSummary: perfil completo (nome+cargo+telefone) fica ready=true', async () => {
  const { service } = buildService();
  const summary = await service.resolveSummary(1, 7);
  assert.equal(summary.ready, true);
  assert.deepEqual(summary.missing, []);
  assert.equal(summary.name, 'Vendedor Completo');
  assert.equal(summary.jobTitle, 'Consultor Comercial');
  assert.equal(summary.phone, '(11) 90000-0000');
  assert.equal(summary.website, 'empresa.com.br');
  assert.equal(summary.companyName, 'Empresa Teste');
});

test('resolveSummary: sem cadastro nenhum (UserSenderProfile ausente) fica ready=false com Cargo+Telefone faltando', async () => {
  const { service } = buildService({ profiles: {} });
  const summary = await service.resolveSummary(1, 7);
  assert.equal(summary.ready, false);
  assert.ok(summary.missing.includes('Cargo'));
  assert.ok(summary.missing.includes('Telefone'));
  assert.ok(!summary.missing.includes('Nome'), 'nome já está preenchido em User.name');
});

test('resolveSummary: site é OPCIONAL — falta só de site nao bloqueia', async () => {
  const { service } = buildService({ profiles: { 1: { userId: 1, companyId: 7, jobTitle: 'Consultor', phone: '11999999999', website: null } } });
  const summary = await service.resolveSummary(1, 7);
  assert.equal(summary.ready, true);
  assert.equal(summary.website, null);
});

test('resolveSummary: sem userId (remetente indefinido) fica ready=false', async () => {
  const { service } = buildService();
  const summary = await service.resolveSummary(null, 7);
  assert.equal(summary.ready, false);
  assert.ok(summary.missing.includes('Remetente não definido'));
});

test('resolveSummary: User.name vazio entra em missing mesmo com UserSenderProfile completo', async () => {
  const { service } = buildService({
    users: { 2: { name: '' } },
    profiles: { 2: { userId: 2, companyId: 7, jobTitle: 'Consultor', phone: '11999999999', website: null } },
  });
  const summary = await service.resolveSummary(2, 7);
  assert.equal(summary.ready, false);
  assert.ok(summary.missing.includes('Nome'));
});

test('save: upsert grava jobTitle/phone/website e getPublicState reflete na hora', async () => {
  const { service, upserts } = buildService({ profiles: {} });
  const result = await service.save(1, 7, { jobTitle: 'Head de Vendas', phone: '11988887777', website: 'novosite.com' });
  assert.equal(upserts.length, 1);
  assert.equal(result.ready, true);
  assert.equal(result.jobTitle, 'Head de Vendas');
  assert.equal(result.phone, '11988887777');
  assert.equal(result.website, 'novosite.com');
});

test('buildSignatureHtml: assinatura sóbria (nome / cargo | empresa / telefone / site), sem banner nem logo', async () => {
  const { service } = buildService();
  const summary = await service.resolveSummary(1, 7);
  const html = service.buildSignatureHtml(summary);
  assert.ok(html);
  assert.match(html!, /Vendedor Completo/);
  assert.match(html!, /Consultor Comercial \| Empresa Teste/);
  assert.match(html!, /\(11\) 90000-0000/);
  assert.match(html!, /href="https:\/\/empresa\.com\.br"/);
  assert.ok(!/<img/.test(html!), 'sem logo/banner na assinatura sóbria');
});

test('buildSignatureHtml: retorna null quando o perfil não está pronto (guard redundante)', async () => {
  const { service } = buildService({ profiles: {} });
  const summary = await service.resolveSummary(1, 7);
  assert.equal(service.buildSignatureHtml(summary), null);
});

test('buildCommercialFooterHtml/Text embutem a frase de saída limpa', async () => {
  const { service } = buildService();
  const summary = await service.resolveSummary(1, 7);
  assert.match(service.buildCommercialFooterHtml(summary), new RegExp(COMMERCIAL_EMAIL_OPT_OUT_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(service.buildCommercialFooterText(summary), new RegExp(COMMERCIAL_EMAIL_OPT_OUT_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
