import test from 'node:test';
import assert from 'node:assert/strict';

import { CredentialResolverService, maskSecret } from './credential-resolver.service';
import { IntegrationSecretsService } from './integration-secrets.service';

function createPrismaStub(input: { company?: any; connections?: any[] } = {}) {
  const connections = input.connections || [];
  return {
    company: {
      findUnique: async ({ select }: any) => {
        if (!input.company) return null;
        const selected: Record<string, unknown> = {};
        for (const key of Object.keys(select || {})) selected[key] = input.company[key];
        return selected;
      },
    },
    integrationConnection: {
      findFirst: async ({ where }: any) => {
        const providerAliases = where?.provider?.in || [];
        return connections.find((row) => (
          row.companyId === where.companyId
          && providerAliases.includes(row.provider)
          && row.isActive === where.isActive
          && row.secretCiphertext
        )) || null;
      },
    },
  };
}

test('maskSecret mascara valor sem expor prefixo', () => {
  assert.equal(maskSecret('abc123456'), '***123456');
  assert.equal(maskSecret('short'), '***');
  assert.equal(maskSecret(''), null);
  assert.equal(maskSecret(null), null);
  assert.equal(maskSecret('abc123456', 4), '***3456');
});

test('CredentialResolver usa Company como fallback compativel', async () => {
  const service = new CredentialResolverService(
    createPrismaStub({
      company: {
        whatsappAccessToken: 'whatsapp-token-123456',
        mercadoPagoAccessToken: 'mp-token-654321',
      },
    }) as any,
    {} as any,
  );

  const whatsapp = await service.resolveWhatsAppAccessToken(7);
  const mercadoPago = await service.resolveMercadoPagoAccessToken(7);

  assert.equal(whatsapp.source, 'company');
  assert.equal(whatsapp.companyField, 'whatsappAccessToken');
  assert.equal(whatsapp.secret, 'whatsapp-token-123456');
  assert.equal(whatsapp.secretPreview, '***123456');
  assert.equal(mercadoPago.source, 'company');
  assert.equal(mercadoPago.companyField, 'mercadoPagoAccessToken');
  assert.equal(mercadoPago.secretPreview, '***654321');
});

test('CredentialResolver prioriza IntegrationConnection ativa quando existir', async () => {
  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'integration-test-secret-key';
  try {
    const secrets = new IntegrationSecretsService();
    const service = new CredentialResolverService(
      createPrismaStub({
        company: {
          whatsappAccessToken: 'legacy-company-token',
        },
        connections: [{
          id: 'conn_1',
          companyId: 7,
          provider: 'WHATSAPP',
          isActive: true,
          secretCiphertext: secrets.encryptSecret(JSON.stringify({
            version: 2,
            provider: 'WHATSAPP',
            credentials: { token: 'connection-token-987654' },
          })),
          secretPreview: 'token: ***987654',
        }],
      }) as any,
      secrets,
    );

    const resolved = await service.resolveWhatsAppAccessToken(7);

    assert.equal(resolved.source, 'integrationConnection');
    assert.equal(resolved.connectionId, 'conn_1');
    assert.equal(resolved.companyField, null);
    assert.equal(resolved.secret, 'connection-token-987654');
    assert.equal(resolved.secretPreview, 'token: ***987654');
  } finally {
    if (previousKey === undefined) delete process.env.INTEGRATION_SECRET_KEY;
    else process.env.INTEGRATION_SECRET_KEY = previousKey;
  }
});
