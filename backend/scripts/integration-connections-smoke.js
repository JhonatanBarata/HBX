const { PrismaService } = require('../dist/prisma/prisma.service');
const { IntegrationSecretsService } = require('../dist/integrations/integration-secrets.service');
const { IntegrationConnectionsService } = require('../dist/integrations/integration-connections.service');

async function resolveCompanyId(prisma) {
  const fromEnv = Number(process.env.COMPANY_ID || 0) || null;
  if (fromEnv) return fromEnv;

  const firstCompany = await prisma.company.findFirst({
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return firstCompany ? Number(firstCompany.id) : null;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const companyId = await resolveCompanyId(prisma);
  if (!companyId) {
    throw new Error('Nenhuma empresa encontrada para executar o smoke de IntegrationConnection.');
  }

  const integrationSecrets = new IntegrationSecretsService();
  const service = new IntegrationConnectionsService(prisma, integrationSecrets);
  const user = { companyId };
  const stamp = Date.now();
  const provider = 'AUVO';
  const instanceName = `SMOKE_${stamp}`;
  const secret = `token-${stamp}`;
  const updatedSecret = `token-${stamp}-updated`;
  const createdIds = [];

  try {
    const created = await service.createByUser(user, {
      provider,
      instanceName,
      secret,
      isActive: true,
    });
    createdIds.push(created.id);

    assert(created.secretConfigured === true, 'create deve marcar secretConfigured');
    assert(created.secretPreview === `***${secret.slice(-6)}`, 'create deve mascarar preview');
    assert(!('secret' in created), 'create nao deve retornar segredo puro');
    assert(!('secretCiphertext' in created), 'create nao deve retornar ciphertext');

    const stored = await prisma.integrationConnection.findUnique({
      where: { id: created.id },
      select: { id: true, secretCiphertext: true, secretPreview: true },
    });

    assert(Boolean(stored?.secretCiphertext), 'registro persistido deve ter ciphertext');
    assert(stored.secretCiphertext !== secret, 'ciphertext nao pode armazenar o token puro');
    assert(stored.secretPreview === created.secretPreview, 'preview persistido deve bater com payload');

    const decrypted = await service.resolveSecretByCompany(companyId, created.id);
    assert(decrypted === secret, 'service deve conseguir resolver o segredo descriptografado internamente');

    const listed = await service.listByUser(user, provider);
    const listedRow = listed.find((row) => row.id === created.id);
    assert(Boolean(listedRow), 'list deve retornar a conexao criada');
    assert(!('secret' in listedRow), 'list nao deve retornar segredo puro');
    assert(!('secretCiphertext' in listedRow), 'list nao deve retornar ciphertext');

    const fetched = await service.getByUser(user, created.id);
    assert(fetched.secretConfigured === true, 'get deve marcar secretConfigured');
    assert(fetched.secretPreview === created.secretPreview, 'get deve manter preview mascarado');
    assert(!('secret' in fetched), 'get nao deve retornar segredo puro');

    let duplicateRejected = false;
    try {
      await service.createByUser(user, {
        provider,
        instanceName,
        secret: `duplicate-${stamp}`,
        isActive: true,
      });
    } catch (error) {
      duplicateRejected = true;
    }
    assert(duplicateRejected, 'create deve rejeitar conexao ativa equivalente');

    const updated = await service.updateByUser(user, created.id, {
      secret: updatedSecret,
    });
    assert(updated.secretPreview === `***${updatedSecret.slice(-6)}`, 'update deve renovar preview mascarado');

    const decryptedAfterUpdate = await service.resolveSecretByCompany(companyId, created.id);
    assert(decryptedAfterUpdate === updatedSecret, 'update deve substituir o segredo criptografado');

    console.log(
      JSON.stringify(
        {
          ok: true,
          companyId,
          connectionId: created.id,
          provider,
          instanceName,
          preview: updated.secretPreview,
          duplicateGuard: true,
        },
        null,
        2,
      ),
    );
  } finally {
    if (createdIds.length) {
      await prisma.integrationConnection.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});